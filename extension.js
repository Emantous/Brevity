// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const { RtkRuntimeManager } = require('./src/rtkRuntime');

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
	const manager = new RtkRuntimeManager({
		storageDir: context.globalStorageUri.fsPath,
		output: (message) => output.appendLine(message),
	});

	let statusDisposable = vscode.commands.registerCommand('brevity.rtkStatus', async function () {
		const status = await manager.status();
		vscode.window.showInformationMessage(status.message);
	});

	let retryDisposable = vscode.commands.registerCommand('brevity.rtkRetry', async function () {
		await vscode.window.withProgress(
			{ location: vscode.ProgressLocation.Notification, title: 'Brevity: preparing RTK' },
			async () => {
				const result = await manager.ensureRuntime();
				vscode.window.showInformationMessage(result.message);
			},
		);
	});

	context.subscriptions.push(helloDisposable, statusDisposable, retryDisposable, output);

	if (vscode.workspace.getConfiguration('brevity').get('rtk.enabled', true)) {
		void manager.ensureRuntime();
	}
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
