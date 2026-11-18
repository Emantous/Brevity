const assert = require('assert');

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
const vscode = require('vscode');
const {
	resolveRtkAsset,
	parseChecksums,
	sha256,
	safeFileName,
} = require('../src/rtkRuntime');
const {
	CopilotHookManager,
	buildHookEntry,
	isBrevityEntry,
} = require('../src/copilotHookManager');
const { isBrevityAllowedCommand } = require('../src/copilotPolicy');
const { sanitizedEnvironment } = require('../src/copilotHook');
const { PINNED_ARCHIVE_SHA256 } = require('../src/rtkRuntime');
const { formatStatus, countSupportedCommands } = require('../src/uxStatus');
const fs = require('fs');
const fsPromises = fs.promises;
const os = require('os');
const path = require('path');
// const myExtension = require('../extension');

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('RTK assets map supported platforms', () => {
		assert.strictEqual(resolveRtkAsset('linux', 'x64').asset, 'rtk-oss-x86_64-unknown-linux-musl.tar.gz');
		assert.strictEqual(resolveRtkAsset('linux', 'arm64').asset, 'rtk-oss-aarch64-unknown-linux-musl.tar.gz');
		assert.strictEqual(resolveRtkAsset('darwin', 'arm64').asset, 'rtk-oss-aarch64-apple-darwin.tar.gz');
		assert.strictEqual(resolveRtkAsset('win32', 'x64').asset, 'rtk-oss-x86_64-pc-windows-msvc.zip');
		assert.strictEqual(resolveRtkAsset('freebsd', 'x64'), null);
	});

	test('RTK checksums parse and hash consistently', () => {
		const checksums = parseChecksums('5dc4110f886e9b47e9380d3028d75ec266666bc70747f5aaf78572d8d2a48d71  rtk-oss-x86_64-unknown-linux-musl.tar.gz');
		assert.strictEqual(checksums.get('rtk-oss-x86_64-unknown-linux-musl.tar.gz'), '5dc4110f886e9b47e9380d3028d75ec266666bc70747f5aaf78572d8d2a48d71');
		assert.strictEqual(sha256(Buffer.from('rtk')), '3dc0deea30053c57bcbb7c1ff189b8cd5668eea42faf9b1aff650d1a4a7eb0de');
	});

	test('RTK archive names reject unsafe paths', () => {
		assert.throws(() => safeFileName('../rtk'), /Unsafe archive entry/);
		assert.throws(() => safeFileName('/tmp/rtk'), /Unsafe archive entry/);
		assert.strictEqual(safeFileName('./rtk'), 'rtk');
	});

	test('Copilot hook entry uses absolute RTK executable and fail-open shell guards', () => {
		const entry = buildHookEntry(
			'/opt/Brevity/rtk',
			process.execPath,
			'/opt/Brevity/src/copilotHook.js',
			'/opt/Brevity/policy.json',
		);
		assert.strictEqual(entry.cwd, '.');
		assert.strictEqual(entry.timeoutSec, 5);
		assert.ok(entry.bash.includes('/opt/Brevity/rtk'));
		assert.ok(entry.bash.includes('BREVITY_RTK_HOOK_V1'));
		assert.ok(isBrevityEntry(entry));
	});

	test('Copilot hook install and uninstall preserve unrelated entries', async () => {
		const workspace = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'brevity-hook-test-'));
		const executable = path.join(workspace, 'rtk');
		await fsPromises.writeFile(executable, 'test');

		const unrelated = {
			type: 'command',
			bash: 'echo keep-me',
			powershell: 'Write-Output keep-me',
			timeoutSec: 5,
		};
		const hookPath = path.join(workspace, '.github', 'hooks', 'rtk-rewrite.json');
		await fsPromises.mkdir(path.dirname(hookPath), { recursive: true });
		await fsPromises.writeFile(hookPath, JSON.stringify({
			version: 1,
			hooks: { PreToolUse: [unrelated] },
		}));

		const manager = new CopilotHookManager({
			workspaceFolders: [workspace],
			executablePath: executable,
			nodeExecutablePath: process.execPath,
			hookScriptPath: path.join(workspace, 'copilotHook.js'),
			policyFilePath: path.join(workspace, 'policy.json'),
		});

		await manager.install();
		let config = JSON.parse(await fsPromises.readFile(hookPath, 'utf8'));
		assert.strictEqual(config.hooks.PreToolUse.length, 2);
		assert.ok(config.hooks.PreToolUse.some((entry) => isBrevityEntry(entry)));
		assert.ok(config.hooks.PreToolUse.includes(unrelated) || config.hooks.PreToolUse.some((entry) => entry.bash === 'echo keep-me'));

		await manager.install();
		config = JSON.parse(await fsPromises.readFile(hookPath, 'utf8'));
		assert.strictEqual(config.hooks.PreToolUse.filter(isBrevityEntry).length, 1);

		await manager.uninstall();
		config = JSON.parse(await fsPromises.readFile(hookPath, 'utf8'));
		assert.strictEqual(config.hooks.PreToolUse.length, 1);
		assert.strictEqual(config.hooks.PreToolUse[0].bash, 'echo keep-me');

		await fsPromises.rm(workspace, { recursive: true, force: true });
	});

	test('Compression policy allows only conservative read and build commands', () => {
		assert.strictEqual(isBrevityAllowedCommand('git status'), true);
		assert.strictEqual(isBrevityAllowedCommand('git diff HEAD'), true);
		assert.strictEqual(isBrevityAllowedCommand('npm test'), true);
		assert.strictEqual(isBrevityAllowedCommand('cargo clippy'), true);
		assert.strictEqual(isBrevityAllowedCommand('git rebase -i HEAD~2'), false);
		assert.strictEqual(isBrevityAllowedCommand('git status && rm -rf /'), false);
		assert.strictEqual(isBrevityAllowedCommand('curl https://example.com'), false);
		assert.strictEqual(isBrevityAllowedCommand('rtk bypass git status'), false);
		assert.strictEqual(isBrevityAllowedCommand('git status', {
			excludePatterns: ['git status'],
		}), false);
	});

	test('RTK downloads require HTTPS and use immutable release hashes', async () => {
		const { downloadUrl } = require('../src/rtkRuntime');
		await assert.rejects(() => downloadUrl('http://example.com/rtk'), /HTTPS/);
		assert.strictEqual(
			PINNED_ARCHIVE_SHA256['rtk-oss-x86_64-unknown-linux-musl.tar.gz'],
			'5dc4110f886e9b47e9380d3028d75ec266666bc70747f5aaf78572d8d2a48d71',
		);
	});

	test('RTK hook subprocess does not inherit secret-bearing environment variables', () => {
		const environment = sanitizedEnvironment({
			HOME: '/tmp/test-home',
			GITHUB_TOKEN: 'secret',
			ANTHROPIC_API_KEY: 'secret',
		});
		assert.strictEqual(environment.HOME, '/tmp/test-home');
		assert.strictEqual(environment.GITHUB_TOKEN, undefined);
		assert.strictEqual(environment.ANTHROPIC_API_KEY, undefined);
	});

	test('UX status describes disabled, setup, missing hook, and ready states', () => {
		assert.strictEqual(formatStatus({ enabled: false, runtimeReady: false }).text,
			'$(circle-slash) Brevity: Off');
		assert.strictEqual(formatStatus({ enabled: true, runtimeReady: false }).text,
			'$(warning) Brevity: Setup needed');
		assert.strictEqual(formatStatus({ enabled: true, runtimeReady: true, hookCount: 0 }).text,
			'$(warning) Brevity: No hook');
		assert.strictEqual(formatStatus({ enabled: true, runtimeReady: true, hookCount: 2 }).text,
			'$(rocket) Brevity: Ready');
	});

	test('UX supported-command count does not expose command contents', () => {
		assert.strictEqual(countSupportedCommands(['git']), 6);
		assert.strictEqual(countSupportedCommands(['git', 'npm', 'cargo']), 20);
		assert.strictEqual(countSupportedCommands([]), 0);
	});
});
