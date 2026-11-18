// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const fsPromises = require('fs').promises;
const path = require('path');
const { RtkRuntimeManager, RTK_TAG } = require('./src/tools/rtk/runtime');
const { CopilotHookManager } = require('./src/core/hookManager');
const { formatStatus, countSupportedCommands } = require('./src/core/uxStatus');
const { clearMetrics, readMetrics, summarizeMetrics } = require('./src/core/metrics');
const { migratePolicy } = require('./src/core/migrations');
const { getExecutionContext } = require('./src/core/executionContext');
const { ToolRegistry } = require('./src/core/toolRegistry');
const { StrategyRegistry } = require('./src/core/strategyRegistry');
const rtkTool = require('./src/tools/rtk');
const commandOutputStrategy = require('./src/strategies/command-output');

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
	const metricsFilePath = path.join(context.globalStorageUri.fsPath, 'rtk', 'metrics.json');
	const toolRegistry = new ToolRegistry().register(rtkTool);
	const strategyRegistry = new StrategyRegistry().register(commandOutputStrategy);

	const output = vscode.window.createOutputChannel('Brevity');
	const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBar.command = 'brevity.status';
	statusBar.show();
	statusBar.text = '$(sync~spin) Brevity: Starting';
	statusBar.tooltip = 'Checking Brevity tool status.';
	const manager = new RtkRuntimeManager({
		storageDir: context.globalStorageUri.fsPath,
		output: (message) => output.appendLine(message),
	});
	const executionContext = getExecutionContext({
		remoteName: vscode.env.remoteName,
		platform: process.platform,
	});

	async function showRuntimeStatus() {
		const status = await manager.status();
		const hookManager = createHookManager(manager.executablePath);
		const hookStatuses = await hookManager.status();
		const allowlist = vscode.workspace.getConfiguration('brevity')
			.get('tools.commands.allowlist',
				vscode.workspace.getConfiguration('brevity').get('rtk.commands.allowlist', [
				'git', 'npm', 'pnpm', 'yarn', 'cargo',
				'pytest', 'mvn', 'gradle', 'dotnet', 'go', 'phpunit',
				'docker', 'kubectl', 'aws', 'az', 'gcloud',
				'ls', 'find', 'grep', 'rg', 'du', 'df', 'stat', 'file', 'pwd', 'tree',
				'curl', 'wget',
			]));
		const supportedCount = countSupportedCommands(allowlist);
		const hookMessage = hookStatuses.length === 0
			? 'No workspace is open, so no project hook is registered.'
			: hookStatuses.map((item) => item.installed
				? `Hook installed: ${item.hookPath}`
				: `Hook not installed: ${item.hookPath}`).join('\n');
		vscode.window.showInformationMessage(
			`${status.message}\nExecution context: ${executionContext.kind}${executionContext.remoteName ? ` (${executionContext.remoteName})` : ''}\nRegistered strategies: ${strategyRegistry.list().map((strategy) => strategy.name).join(', ')}\nRegistered tools: ${toolRegistry.list().map((tool) => tool.name).join(', ')}\n${hookMessage}\nSupported command families: ${supportedCount}\nMetrics: ${summarizeMetrics(readMetrics(metricsFilePath))}`,
		);
	}

	let statusDisposable = vscode.commands.registerCommand('brevity.status', showRuntimeStatus);

	const enableDisposable = vscode.commands.registerCommand('brevity.enable', async function () {
		await vscode.workspace.getConfiguration('brevity').update(
			'killSwitch',
			false,
			vscode.ConfigurationTarget.Global,
		);
		await vscode.workspace.getConfiguration('brevity').update(
			'enabled',
			true,
			vscode.ConfigurationTarget.Global,
		);
		await prepareRuntime();
		vscode.window.showInformationMessage('Brevity is enabled.');
	});

	const emergencyDisableDisposable = vscode.commands.registerCommand(
		'brevity.emergencyDisable',
		async function () {
			await vscode.workspace.getConfiguration('brevity').update(
				'killSwitch',
				true,
				vscode.ConfigurationTarget.Global,
			);
			await vscode.workspace.getConfiguration('brevity').update(
				'enabled',
				false,
				vscode.ConfigurationTarget.Global,
			);
			await createHookManager(manager.executablePath).uninstall();
			updateStatusBar(false, false, 0);
			vscode.window.showWarningMessage(
				'Brevity emergency disable is active. Clear brevity.killSwitch before enabling it again.',
			);
		},
	);

	const metricsDisposable = vscode.commands.registerCommand('brevity.metrics', function () {
		vscode.window.showInformationMessage(`Brevity local metrics: ${summarizeMetrics(readMetrics(metricsFilePath))}`);
	});

	const clearMetricsDisposable = vscode.commands.registerCommand('brevity.clearMetrics', async function () {
		await clearMetrics(metricsFilePath);
		vscode.window.showInformationMessage('Brevity local metrics were cleared.');
	});

	let retryDisposable = vscode.commands.registerCommand('brevity.retry', async function () {
		await vscode.window.withProgress(
			{ location: vscode.ProgressLocation.Notification, title: 'Brevity: preparing tools' },
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

	const disableDisposable = vscode.commands.registerCommand('brevity.disable', async function () {
		await vscode.workspace.getConfiguration('brevity').update(
			'enabled',
			false,
			vscode.ConfigurationTarget.Global,
		);
		const hookManager = createHookManager(manager.executablePath);
		await hookManager.uninstall();
		updateStatusBar(false, false, 0);
		vscode.window.showInformationMessage('Brevity is disabled and its Copilot hook was removed.');
	});

	const uninstallDisposable = vscode.commands.registerCommand('brevity.uninstall', async function () {
		await vscode.workspace.getConfiguration('brevity').update(
			'enabled',
			false,
			vscode.ConfigurationTarget.Global,
		);
		const hookManager = createHookManager(manager.executablePath);
		await hookManager.uninstall();

		const managedRoot = path.join(context.globalStorageUri.fsPath, 'rtk');
		await fsPromises.rm(managedRoot, { recursive: true, force: true });
		updateStatusBar(false, false, 0);
		vscode.window.showInformationMessage(
			'Brevity removed its managed tools and Copilot hook. The extension setting is disabled.',
		);
	});

	context.subscriptions.push(
		helloDisposable,
		statusDisposable,
		enableDisposable,
		emergencyDisableDisposable,
		metricsDisposable,
		clearMetricsDisposable,
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
			hookScriptPath: context.asAbsolutePath('src/core/hook.js'),
			policyFilePath,
			metricsFilePath,
			output: (message) => output.appendLine(message),
		});
	}

	async function prepareRuntime() {
		const configuration = vscode.workspace.getConfiguration('brevity');
		if (
			configuration.get('killSwitch',
				configuration.get('rtk.killSwitch', false)) ||
			!configuration.get('enabled',
				configuration.get('rtk.enabled', true))
		) {
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
				JSON.stringify(migratePolicy({
					allowlist: vscode.workspace
						.getConfiguration('brevity')
						.get('tools.commands.allowlist',
							vscode.workspace.getConfiguration('brevity').get('rtk.commands.allowlist', [
							'git', 'npm', 'pnpm', 'yarn', 'cargo',
							'pytest', 'mvn', 'gradle', 'dotnet', 'go', 'phpunit',
							'docker', 'kubectl', 'aws', 'az', 'gcloud',
							'ls', 'find', 'grep', 'rg', 'du', 'df', 'stat', 'file', 'pwd', 'tree',
							'curl', 'wget',
						])),
					excludePatterns: vscode.workspace
						.getConfiguration('brevity')
						.get('tools.commands.excludePatterns',
							vscode.workspace.getConfiguration('brevity').get('rtk.commands.excludePatterns', [])),
					commandOverrides: vscode.workspace
						.getConfiguration('brevity')
						.get('tools.commands.overrides',
							vscode.workspace.getConfiguration('brevity').get('rtk.commands.overrides', {})),
				}), null, 2),
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
			!event.affectsConfiguration('brevity.enabled') &&
			!event.affectsConfiguration('brevity.killSwitch') &&
			!event.affectsConfiguration('brevity.tools.commands.allowlist') &&
			!event.affectsConfiguration('brevity.tools.commands.excludePatterns') &&
			!event.affectsConfiguration('brevity.tools.commands.overrides') &&
			!event.affectsConfiguration('brevity.rtk.enabled') &&
			!event.affectsConfiguration('brevity.rtk.killSwitch')
		) {
			return;
		}
		const configuration = vscode.workspace.getConfiguration('brevity');
		if (
			configuration.get('enabled', configuration.get('rtk.enabled', true)) &&
			!configuration.get('killSwitch', configuration.get('rtk.killSwitch', false))
		) {
			await prepareRuntime();
		} else {
			await createHookManager(manager.executablePath).uninstall();
			updateStatusBar(false, false, 0);
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
