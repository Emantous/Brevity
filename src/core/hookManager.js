const fsPromises = require('fs').promises;
const path = require('path');

const HOOK_FILE_NAME = 'rtk-rewrite.json';
const BREVITY_MARKER = 'BREVITY_RTK_HOOK_V1';
const MALFORMED_HOOK_CODE = 'EBADJSON';

function shellQuote(value) {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

function powershellQuote(value) {
	return `'${value.replace(/'/g, "''")}'`;
}

async function assertNoSymlinkPath(hookPath) {
	const workspacePath = path.dirname(path.dirname(path.dirname(hookPath)));
	const relativePath = path.relative(workspacePath, hookPath);
	if (!relativePath || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
		throw new Error(`Refusing unsafe Copilot hook path: ${hookPath}`);
	}

	const workspaceStat = await fsPromises.lstat(workspacePath);
	if (workspaceStat.isSymbolicLink()) {
		throw new Error(`Refusing symlinked workspace path: ${workspacePath}`);
	}

	let currentPath = workspacePath;
	for (const segment of relativePath.split(path.sep)) {
		currentPath = path.join(currentPath, segment);
		try {
			const stat = await fsPromises.lstat(currentPath);
			if (stat.isSymbolicLink()) {
				throw new Error(`Refusing symlinked Copilot hook path: ${currentPath}`);
			}
		} catch (error) {
			if (error.code === 'ENOENT') {
				return;
			}
			throw error;
		}
	}
}

function buildHookEntry(executablePath, nodeExecutablePath, hookScriptPath) {
	const executable = shellQuote(executablePath);
	const node = shellQuote(nodeExecutablePath);
	const script = shellQuote(hookScriptPath);
	const powershellExecutable = powershellQuote(executablePath);
	const powershellNode = powershellQuote(nodeExecutablePath);
	const powershellScript = powershellQuote(hookScriptPath);

	return {
		type: 'command',
		bash: `# ${BREVITY_MARKER}; if [ -x ${executable} ] && [ -x ${node} ]; then ELECTRON_RUN_AS_NODE=1 exec ${node} ${script} ${executable}; fi`,
		powershell: `# ${BREVITY_MARKER}; if (Test-Path -LiteralPath ${powershellExecutable}) { $env:ELECTRON_RUN_AS_NODE='1'; & ${powershellNode} ${powershellScript} ${powershellExecutable} }`,
		cwd: '.',
		timeoutSec: 5,
	};
}

function isBrevityEntry(entry) {
	if (!entry || typeof entry !== 'object') {
		return false;
	}
	return [entry.command, entry.bash, entry.powershell]
		.filter((value) => typeof value === 'string')
		.some((value) => value.includes(BREVITY_MARKER));
}

function isRtkEntry(entry) {
	if (!entry || typeof entry !== 'object') {
		return false;
	}
	return [entry.command, entry.bash, entry.powershell]
		.filter((value) => typeof value === 'string')
		.some((value) => /(?:^|[\s\\/"'])rtk(?:\.exe)?["']?\s+hook\s+copilot/i.test(value) ||
			value.includes(BREVITY_MARKER));
}

class CopilotHookManager {
	constructor({
		workspaceFolders,
		executablePath,
		nodeExecutablePath = process.execPath,
		hookScriptPath,
		output = () => {},
	}) {
		this.workspaceFolders = workspaceFolders || [];
		this.executablePath = executablePath;
		this.nodeExecutablePath = nodeExecutablePath;
		this.hookScriptPath = hookScriptPath;
		this.output = output;
	}

	getHookPaths() {
		return this.workspaceFolders
			.map((folder) => folder.uri ? folder.uri.fsPath : folder)
			.filter(Boolean)
			.map((workspacePath) => path.join(workspacePath, '.github', 'hooks', HOOK_FILE_NAME));
	}

	async findRtkHookPaths(directory) {
		let files;
		try {
			files = await fsPromises.readdir(directory, { withFileTypes: true });
		} catch (error) {
			if (error.code === 'ENOENT') {
				return [];
			}
			throw error;
		}

		const hookPaths = [];
		for (const file of files) {
			if (!file.isFile() || !file.name.endsWith('.json')) {
				continue;
			}
			const hookPath = path.join(directory, file.name);
			const config = await this.readHookFile(hookPath);
			if (Array.isArray(config?.hooks?.PreToolUse) &&
				config.hooks.PreToolUse.some(isRtkEntry)) {
				hookPaths.push(hookPath);
			}
		}
		return hookPaths;
	}

	async readHookFile(hookPath) {
		await assertNoSymlinkPath(hookPath);
		try {
			return JSON.parse(await fsPromises.readFile(hookPath, 'utf8'));
		} catch (error) {
			if (error.code === 'ENOENT') {
				return null;
			}
			if (error instanceof SyntaxError) {
				error.code = MALFORMED_HOOK_CODE;
			}
			if (error.code === MALFORMED_HOOK_CODE) {
				throw new Error(`Cannot safely update Copilot hook ${hookPath}: invalid JSON`, {
					cause: error,
				});
			}
			throw new Error(`Cannot safely read Copilot hook ${hookPath}: ${error.message}`);
		}
	}

	async backupHookFile(hookPath) {
		await assertNoSymlinkPath(hookPath);
		const backupPath = `${hookPath}.bak`;
		try {
			await fsPromises.copyFile(hookPath, backupPath);
		} catch (error) {
			if (error.code !== 'ENOENT') {
				throw new Error(`Cannot back up Copilot hook ${hookPath}: ${error.message}`);
			}
		}
		return backupPath;
	}

	async writeHookFile(hookPath, config) {
		await fsPromises.mkdir(path.dirname(hookPath), { recursive: true });
		await this.backupHookFile(hookPath);

		const temporaryPath = `${hookPath}.${process.pid}.${Date.now()}.tmp`;
		try {
			const handle = await fsPromises.open(temporaryPath, 'wx', 0o600);
			try {
				await handle.writeFile(`${JSON.stringify(config, null, 2)}\n`, 'utf8');
				await handle.sync();
			} finally {
				await handle.close();
			}
			await fsPromises.rename(temporaryPath, hookPath);
		} catch (error) {
			await fsPromises.rm(temporaryPath, { force: true });
			throw new Error(`Cannot safely write Copilot hook ${hookPath}: ${error.message}`);
		}
	}

	async removeBrevityEntries(hookPath, config) {
		if (!Array.isArray(config?.hooks?.PreToolUse)) {
			return false;
		}
		const entries = config.hooks.PreToolUse;
		const remaining = entries.filter((entry) => !isBrevityEntry(entry));
		if (remaining.length === entries.length) {
			return false;
		}

		config.hooks.PreToolUse = remaining;
		if (remaining.length === 0) {
			await this.backupHookFile(hookPath);
			delete config.hooks.PreToolUse;
		}
		if (Object.keys(config.hooks).length === 0) {
			await fsPromises.unlink(hookPath);
			this.output(`Removed Brevity Copilot hook: ${hookPath}`);
		} else {
			await this.writeHookFile(hookPath, config);
			this.output(`Removed Brevity entry from Copilot hook: ${hookPath}`);
		}
		return true;
	}

	async install() {
		const results = [];
		for (const hookPath of this.getHookPaths()) {
			let existing;
			try {
				existing = await this.readHookFile(hookPath);
			} catch (error) {
				if (error.cause && error.cause.code === MALFORMED_HOOK_CODE) {
					const backupPath = `${hookPath}.malformed.bak`;
					await fsPromises.rename(hookPath, backupPath);
					this.output(`Backed up malformed Copilot hook: ${backupPath}`);
					existing = null;
				} else {
					throw error;
				}
			}

			const existingRtkHooks = await this.findRtkHookPaths(path.dirname(hookPath));
			const hasRtkHookElsewhere = existingRtkHooks.some((existingPath) =>
				path.resolve(existingPath) !== path.resolve(hookPath));
			if (hasRtkHookElsewhere) {
				await this.removeBrevityEntries(hookPath, existing);
				results.push({ hookPath, installed: false, existing: true });
				continue;
			}

			const config = existing || { version: 1, hooks: {} };
			if (!config.hooks || typeof config.hooks !== 'object') {
				config.hooks = {};
			}
			if (!Array.isArray(config.hooks.PreToolUse)) {
				config.hooks.PreToolUse = [];
			}

			const entries = config.hooks.PreToolUse;
			const rtkEntries = entries.filter(isRtkEntry);
			if (rtkEntries.length > 0) {
				const keeper = rtkEntries.find((entry) => !isBrevityEntry(entry)) || rtkEntries[0];
				config.hooks.PreToolUse = entries.filter((entry) => !isRtkEntry(entry) || entry === keeper);
				if (config.hooks.PreToolUse.length !== entries.length) {
					await this.writeHookFile(hookPath, config);
				}
				results.push({ hookPath, installed: true, existing: true });
				continue;
			}

			config.hooks.PreToolUse = [
				buildHookEntry(this.executablePath, this.nodeExecutablePath, this.hookScriptPath),
				...entries,
			];
			await this.writeHookFile(hookPath, config);
			this.output(`Installed Brevity Copilot hook: ${hookPath}`);
			results.push({ hookPath, installed: true, existing: false });
		}
		return results;
	}

	async uninstall() {
		const results = [];
		for (const hookPath of this.getHookPaths()) {
			const existing = await this.readHookFile(hookPath);
			const removed = existing ? await this.removeBrevityEntries(hookPath, existing) : false;
			results.push({ hookPath, removed });
		}
		return results;
	}
}

module.exports = {
	HOOK_FILE_NAME,
	BREVITY_MARKER,
	CopilotHookManager,
	buildHookEntry,
	isBrevityEntry,
	isRtkEntry,
	assertNoSymlinkPath,
	shellQuote,
	powershellQuote,
};
