const fs = require('fs');
const fsPromises = fs.promises;
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

function buildHookEntry(executablePath, nodeExecutablePath, hookScriptPath, policyFilePath) {
	const bashExecutable = shellQuote(executablePath);
	const powershellExecutable = powershellQuote(executablePath);
	const bashNode = shellQuote(nodeExecutablePath);
	const bashHookScript = shellQuote(hookScriptPath);
	const powershellNode = powershellQuote(nodeExecutablePath);
	const powershellHookScript = powershellQuote(hookScriptPath);
	const bashPolicy = shellQuote(policyFilePath);
	const powershellPolicy = powershellQuote(policyFilePath);

	return {
		type: 'command',
		bash: `# ${BREVITY_MARKER}; if [ -x ${bashExecutable} ] && [ -x ${bashNode} ]; then ELECTRON_RUN_AS_NODE=1 exec ${bashNode} ${bashHookScript} ${bashExecutable} ${bashPolicy}; fi`,
		powershell: `# ${BREVITY_MARKER}; if (Test-Path -LiteralPath ${powershellExecutable}) { $env:ELECTRON_RUN_AS_NODE='1'; & ${powershellNode} ${powershellHookScript} ${powershellExecutable} ${powershellPolicy} }`,
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
		.some((value) => /(?:^|\s|['"])(?:rtk)(?:\.exe)?\s+hook\s+copilot/.test(value) ||
			value.includes(BREVITY_MARKER));
}

class CopilotHookManager {
	constructor({
		workspaceFolders,
		executablePath,
		nodeExecutablePath = process.execPath,
		hookScriptPath,
		policyFilePath,
		output = () => {},
		platform = process.platform,
	}) {
		this.workspaceFolders = workspaceFolders || [];
		this.executablePath = executablePath;
		this.nodeExecutablePath = nodeExecutablePath;
		this.hookScriptPath = hookScriptPath;
		this.policyFilePath = policyFilePath;
		this.output = output;
		this.platform = platform;
	}

	getHookPaths() {
		return this.workspaceFolders
			.map((folder) => folder.uri ? folder.uri.fsPath : folder)
			.filter(Boolean)
			.map((workspacePath) => path.join(workspacePath, '.github', 'hooks', HOOK_FILE_NAME));
	}

	async readHookFile(hookPath) {
		try {
			const text = await fsPromises.readFile(hookPath, 'utf8');
			try {
				return JSON.parse(text);
			} catch (error) {
				error.code = MALFORMED_HOOK_CODE;
				throw error;
			}
		} catch (error) {
			if (error.code === 'ENOENT') {
				return null;
			}
			if (error.code === MALFORMED_HOOK_CODE) {
				throw new Error(`Cannot safely update Copilot hook ${hookPath}: invalid JSON`, {
					cause: error,
				});
			}
			throw new Error(`Cannot safely update Copilot hook ${hookPath}: ${error.message}`);
		}
	}

	async backupHookFile(hookPath) {
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
		const contents = `${JSON.stringify(config, null, 2)}\n`;
		try {
			const handle = await fsPromises.open(temporaryPath, 'wx', 0o600);
			try {
				await handle.writeFile(contents, { encoding: 'utf8' });
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

	async recoverMalformedHook(hookPath) {
		const backupPath = `${hookPath}.malformed.bak`;
		try {
			await fsPromises.rename(hookPath, backupPath);
		} catch (error) {
			throw new Error(`Cannot recover malformed Copilot hook ${hookPath}: ${error.message}`);
		}
		this.output(`Backed up malformed Copilot hook: ${backupPath}`);
	}

	async install() {
		const results = [];
		for (const hookPath of this.getHookPaths()) {
			let existing;
			try {
				existing = await this.readHookFile(hookPath);
			} catch (error) {
				if (error.cause && error.cause.code === MALFORMED_HOOK_CODE) {
					await this.recoverMalformedHook(hookPath);
					existing = null;
				} else {
					throw error;
				}
			}
			const config = existing || { version: 1, hooks: {} };

			if (!config.hooks || typeof config.hooks !== 'object') {
				config.hooks = {};
			}
			if (!Array.isArray(config.hooks.PreToolUse)) {
				config.hooks.PreToolUse = [];
			}

			const unrelated = config.hooks.PreToolUse.filter((entry) => !isRtkEntry(entry));
			config.hooks.PreToolUse = [buildHookEntry(
				this.executablePath,
				this.nodeExecutablePath,
				this.hookScriptPath,
				this.policyFilePath,
			), ...unrelated];

			await this.writeHookFile(hookPath, config);
			this.output(`Installed Brevity Copilot hook: ${hookPath}`);
			results.push({ hookPath, installed: true });
		}
		return results;
	}

	async uninstall() {
		const results = [];
		for (const hookPath of this.getHookPaths()) {
			const existing = await this.readHookFile(hookPath);
			if (!existing) {
				results.push({ hookPath, removed: false });
				continue;
			}

			if (!existing.hooks || !Array.isArray(existing.hooks.PreToolUse)) {
				results.push({ hookPath, removed: false });
				continue;
			}

			const remaining = existing.hooks.PreToolUse.filter((entry) => !isBrevityEntry(entry));
			if (remaining.length === existing.hooks.PreToolUse.length) {
				results.push({ hookPath, removed: false });
				continue;
			}

			existing.hooks.PreToolUse = remaining;
			if (remaining.length === 0) {
				await this.backupHookFile(hookPath);
				delete existing.hooks.PreToolUse;
			}
			if (Object.keys(existing.hooks).length === 0) {
				await fsPromises.unlink(hookPath);
				this.output(`Removed Brevity Copilot hook: ${hookPath}`);
			} else {
				await this.writeHookFile(hookPath, existing);
				this.output(`Removed Brevity entry from Copilot hook: ${hookPath}`);
			}
			results.push({ hookPath, removed: true });
		}
		return results;
	}

	async status() {
		const statuses = [];
		for (const hookPath of this.getHookPaths()) {
			const existing = await this.readHookFile(hookPath);
			const entries = existing && existing.hooks && Array.isArray(existing.hooks.PreToolUse)
				? existing.hooks.PreToolUse
				: [];
			const brevity = entries.filter(isBrevityEntry).length;
			statuses.push({
				hookPath,
				installed: brevity > 0,
				brevityEntries: brevity,
				entryCount: entries.length,
			});
		}
		return statuses;
	}
}

module.exports = {
	HOOK_FILE_NAME,
	BREVITY_MARKER,
	CopilotHookManager,
	buildHookEntry,
	isBrevityEntry,
	isRtkEntry,
	shellQuote,
	powershellQuote,
};
