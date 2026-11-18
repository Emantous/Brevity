// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const fsPromises = require('fs').promises;
const path = require('path');
const { RtkRuntimeManager, RTK_TAG } = require('./src/rtkRuntime');
const { CopilotHookManager } = require('./src/copilotHookManager');
const { formatStatus, countSupportedCommands } = require('./src/uxStatus');

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	console.log('Congratulations, your extension "brevity" is now active!');

	const helloDisposable = vscode.commands.registerCommand('brevity.helloWorld', function () {
		vscode.window.showInformationMessage('Hello World from Brevity!');
	});

	const output = vscode.window.createOutputChannel('Brevity RTK');
	const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBar.command = 'brevity.rtkStatus';
	statusBar.show();
	statusBar.text = '$(sync~spin) Brevity: Starting';
	statusBar.tooltip = 'Checking Brevity RTK runtime status.';
	const manager = new RtkRuntimeManager({
		storageDir: context.globalStorageUri.fsPath,
		output: (message) => output.appendLine(message),
	});

	let statusDisposable = vscode.commands.registerCommand('brevity.rtkStatus', async function () {
		const status = await manager.status();
		const hookManager = createHookManager(manager.executablePath);
		const hookStatuses = await hookManager.status();
		const allowlist = vscode.workspace.getConfiguration('brevity')
			.get('rtk.commands.allowlist', ['git', 'npm', 'pnpm', 'yarn', 'cargo']);
		const supportedCount = countSupportedCommands(allowlist);
		const hookMessage = hookStatuses.length === 0
			? 'No workspace is open, so no project hook is registered.'
			: hookStatuses.map((item) => item.installed
				? `Hook installed: ${item.hookPath}`
				: `Hook not installed: ${item.hookPath}`).join('\n');
		vscode.window.showInformationMessage(
			`${status.message}\n${hookMessage}\nSupported command families: ${supportedCount}`,
		);
	});

	let retryDisposable = vscode.commands.registerCommand('brevity.rtkRetry', async function () {
		await vscode.window.withProgress(
			{ location: vscode.ProgressLocation.Notification, title: 'Brevity: preparing RTK' },
			async () => {
				const result = await manager.ensureRuntime();
				if (result.ok) {
					const hookManager = createHookManager(manager.executablePath);
					await hookManager.install();
				}
				vscode.window.showInformationMessage(result.message);
			},
		);
	});

	const disableDisposable = vscode.commands.registerCommand('brevity.rtkDisable', async function () {
		await vscode.workspace.getConfiguration('brevity').update(
			'rtk.enabled',
			false,
			vscode.ConfigurationTarget.Global,
		);
		const hookManager = createHookManager(manager.executablePath);
		await hookManager.uninstall();
		updateStatusBar(false, false, 0);
		vscode.window.showInformationMessage('Brevity RTK is disabled and its Copilot hook was removed.');
	});

	const uninstallDisposable = vscode.commands.registerCommand('brevity.rtkUninstall', async function () {
		await vscode.workspace.getConfiguration('brevity').update(
			'rtk.enabled',
			false,
			vscode.ConfigurationTarget.Global,
		);
		const hookManager = createHookManager(manager.executablePath);
		await hookManager.uninstall();

		const managedRoot = path.join(context.globalStorageUri.fsPath, 'rtk');
		await fsPromises.rm(managedRoot, { recursive: true, force: true });
		updateStatusBar(false, false, 0);
		vscode.window.showInformationMessage(
			'Brevity removed its managed RTK runtime and Copilot hook. The extension setting is disabled.',
		);
	});

	context.subscriptions.push(
		helloDisposable,
		statusDisposable,
		retryDisposable,
		disableDisposable,
		uninstallDisposable,
		output,
		statusBar,
	);

	async function updateStatusBar(enabled, runtimeReady, hookCount) {
		const view = formatStatus({ enabled, runtimeReady, hookCount });
		statusBar.text = view.text;
		statusBar.tooltip = view.tooltip;
	}

	function createHookManager(executablePath) {
		const policyFilePath = path.join(
			context.globalStorageUri.fsPath,
			'rtk',
			RTK_TAG,
			'brevity-policy.json',
		);
		return new CopilotHookManager({
			workspaceFolders: vscode.workspace.workspaceFolders,
			executablePath,
			nodeExecutablePath: process.execPath,
			hookScriptPath: context.asAbsolutePath('src/copilotHook.js'),
			policyFilePath,
			output: (message) => output.appendLine(message),
		});
	}

	async function prepareRuntime() {
		if (!vscode.workspace.getConfiguration('brevity').get('rtk.enabled', true)) {
			updateStatusBar(false, false, 0);
			return;
		}
		const result = await manager.ensureRuntime();
		if (result.ok) {
			const policyDirectory = path.dirname(path.join(
				context.globalStorageUri.fsPath,
				'rtk',
				RTK_TAG,
				'brevity-policy.json',
			));
			await fsPromises.mkdir(policyDirectory, { recursive: true });
			await fsPromises.writeFile(
				path.join(policyDirectory, 'brevity-policy.json'),
				JSON.stringify({
					allowlist: vscode.workspace
						.getConfiguration('brevity')
						.get('rtk.commands.allowlist', ['git', 'npm', 'pnpm', 'yarn', 'cargo']),
					excludePatterns: vscode.workspace
						.getConfiguration('brevity')
						.get('rtk.commands.excludePatterns', []),
				}, null, 2),
				{ encoding: 'utf8', mode: 0o600 },
			);
			await createHookManager(manager.executablePath).install();
			const hookStatuses = await createHookManager(manager.executablePath).status();
			updateStatusBar(
				true,
				true,
				hookStatuses.filter((item) => item.installed).length,
			);
		} else {
			updateStatusBar(true, false, 0);
		}
	}

	const settingDisposable = vscode.workspace.onDidChangeConfiguration(async (event) => {
		if (
			!event.affectsConfiguration('brevity.rtk.enabled') &&
			!event.affectsConfiguration('brevity.rtk.commands.allowlist') &&
			!event.affectsConfiguration('brevity.rtk.commands.excludePatterns')
		) {
			return;
		}
		if (vscode.workspace.getConfiguration('brevity').get('rtk.enabled', true)) {
			await prepareRuntime();
		} else {
			await createHookManager(manager.executablePath).uninstall();
		}
	});
	context.subscriptions.push(settingDisposable);

	void prepareRuntime();
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
