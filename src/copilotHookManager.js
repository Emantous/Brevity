const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');

const HOOK_FILE_NAME = 'rtk-rewrite.json';
const BREVITY_MARKER = 'BREVITY_RTK_HOOK_V1';

function shellQuote(value) {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

function powershellQuote(value) {
	return `'${value.replace(/'/g, "''")}'`;
}

function buildHookEntry(executablePath) {
	const bashExecutable = shellQuote(executablePath);
	const powershellExecutable = powershellQuote(executablePath);

	return {
		type: 'command',
		bash: `# ${BREVITY_MARKER}; if [ -x ${bashExecutable} ]; then exec ${bashExecutable} hook copilot; fi`,
		powershell: `# ${BREVITY_MARKER}; if (Test-Path -LiteralPath ${powershellExecutable}) { & ${powershellExecutable} hook copilot }`,
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
	constructor({ workspaceFolders, executablePath, output = () => {}, platform = process.platform }) {
		this.workspaceFolders = workspaceFolders || [];
		this.executablePath = executablePath;
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
			return JSON.parse(text);
		} catch (error) {
			if (error.code === 'ENOENT') {
				return null;
			}
			throw new Error(`Cannot safely update Copilot hook ${hookPath}: ${error.message}`);
		}
	}

	async install() {
		const results = [];
		for (const hookPath of this.getHookPaths()) {
			const existing = await this.readHookFile(hookPath);
			const config = existing || { version: 1, hooks: {} };

			if (!config.hooks || typeof config.hooks !== 'object') {
				config.hooks = {};
			}
			if (!Array.isArray(config.hooks.PreToolUse)) {
				config.hooks.PreToolUse = [];
			}

			const unrelated = config.hooks.PreToolUse.filter((entry) => !isRtkEntry(entry));
			config.hooks.PreToolUse = [buildHookEntry(this.executablePath, this.platform), ...unrelated];

			await fsPromises.mkdir(path.dirname(hookPath), { recursive: true });
			await fsPromises.writeFile(hookPath, `${JSON.stringify(config, null, 2)}\n`, {
				encoding: 'utf8',
				mode: 0o600,
			});
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
				delete existing.hooks.PreToolUse;
			}
			if (Object.keys(existing.hooks).length === 0) {
				await fsPromises.unlink(hookPath);
				this.output(`Removed Brevity Copilot hook: ${hookPath}`);
			} else {
				await fsPromises.writeFile(hookPath, `${JSON.stringify(existing, null, 2)}\n`, {
					encoding: 'utf8',
					mode: 0o600,
				});
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
