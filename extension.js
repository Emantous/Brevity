const vscode = require('vscode');
const path = require('path');
const { RtkRuntimeManager } = require('./src/tools/rtk/runtime');
const { CopilotHookManager } = require('./src/core/hookManager');

let activeHookManager;
let pendingSetup = Promise.resolve();

function activate(context) {
	const output = (message) => console.log(`[Brevity] ${message}`);
	const runtimeManager = new RtkRuntimeManager({
		storageDir: context.globalStorageUri.fsPath,
		output,
	});
	const hookManager = new CopilotHookManager({
		workspaceFolders: vscode.workspace.workspaceFolders,
		executablePath: runtimeManager.executablePath,
		nodeExecutablePath: process.execPath,
		hookScriptPath: context.asAbsolutePath(path.join('src', 'core', 'hook.js')),
		output,
	});
	let runtimePromise;
	activeHookManager = hookManager;

	async function ensureRuntime() {
		if (!runtimePromise) {
			runtimePromise = runtimeManager.ensureRuntime();
		}
		const result = await runtimePromise;
		if (!result.ok) {
			runtimePromise = null;
		}
		return result.ok;
	}

	async function installForOpenWorkspaces() {
		if (!(vscode.workspace.workspaceFolders || []).length) {
			return { ok: false, reason: 'workspace' };
		}
		if (!await ensureRuntime()) {
			return { ok: false, reason: 'runtime' };
		}
		const folders = vscode.workspace.workspaceFolders || [];
		if (folders.length === 0) {
			return { ok: false, reason: 'workspace' };
		}
		hookManager.workspaceFolders = folders;
		const results = await hookManager.install();
		return { ok: true, existing: results.every((result) => result.existing) };
	}

	function queue(task) {
		pendingSetup = pendingSetup
			.then(task)
			.catch((error) => {
				console.error(`[Brevity] ${error.message}`);
				return null;
			});
		return pendingSetup;
	}

	const activateCommand = vscode.commands.registerCommand('brevity.activate', async () => {
		const result = await queue(installForOpenWorkspaces);
		if (result && result.ok) {
			vscode.window.showInformationMessage(
				result.existing
					? 'An RTK hook is already present; no duplicate was added.'
					: 'Brevity is active in the open workspace.',
			);
		} else if (result && result.reason === 'workspace') {
			vscode.window.showWarningMessage('Open a workspace before activating Brevity.');
		} else {
			vscode.window.showErrorMessage('RTK could not be prepared. Check the extension host log.');
		}
	});

	context.subscriptions.push(
		activateCommand,
		vscode.workspace.onDidChangeWorkspaceFolders((event) => {
			queue(async () => {
				if (event.removed.length > 0) {
					hookManager.workspaceFolders = event.removed;
					await hookManager.uninstall();
				}
				hookManager.workspaceFolders = vscode.workspace.workspaceFolders || [];
				if (event.added.length > 0) {
					await installForOpenWorkspaces();
				}
			});
		}),
	);

	queue(installForOpenWorkspaces);
}

async function deactivate() {
	await pendingSetup;
	if (activeHookManager) {
		const hookManager = activeHookManager;
		activeHookManager = null;
		await hookManager.uninstall();
	}
}

module.exports = {
	activate,
	deactivate,
};
