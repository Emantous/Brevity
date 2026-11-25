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
		if (!(vscode.workspace.workspaceFolders || []).length || !await ensureRuntime()) {
			return;
		}
		const folders = vscode.workspace.workspaceFolders || [];
		if (folders.length === 0) {
			return;
		}
		hookManager.workspaceFolders = folders;
		await hookManager.install();
	}

	function queue(task) {
		pendingSetup = pendingSetup
			.then(task)
			.catch((error) => console.error(`[Brevity] ${error.message}`));
	}

	context.subscriptions.push(
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
