const assert = require('assert');

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
const vscode = require('vscode');
const {
	resolveRtkAsset,
	sha256,
	safeFileName,
} = require('../src/tools/rtk/runtime');
const {
	CopilotHookManager,
	buildHookEntry,
	isBrevityEntry,
} = require('../src/core/hookManager');
const { sanitizedEnvironment } = require('../src/core/hook');
const { PINNED_ARCHIVE_SHA256 } = require('../src/tools/rtk/runtime');
const packageJson = require('../package.json');
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

	test('Activate Brevity is available in the Command Palette', () => {
		assert.ok(packageJson.contributes.commands.some((command) =>
			command.command === 'brevity.activate' && command.title === 'Activate Brevity'));
	});

	test('RTK assets map supported platforms', () => {
		assert.strictEqual(resolveRtkAsset('linux', 'x64').asset, 'rtk-oss-x86_64-unknown-linux-musl.tar.gz');
		assert.strictEqual(resolveRtkAsset('linux', 'arm64').asset, 'rtk-oss-aarch64-unknown-linux-musl.tar.gz');
		assert.strictEqual(resolveRtkAsset('darwin', 'arm64').asset, 'rtk-oss-aarch64-apple-darwin.tar.gz');
		assert.strictEqual(resolveRtkAsset('win32', 'x64').asset, 'rtk-oss-x86_64-pc-windows-msvc.zip');
		assert.strictEqual(resolveRtkAsset('freebsd', 'x64'), null);
	});

	test('RTK archive hashes are calculated consistently', () => {
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
			'/opt/Brevity/src/core/hook.js',
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
		});

		await manager.install();
		let config = JSON.parse(await fsPromises.readFile(hookPath, 'utf8'));
		assert.strictEqual(config.hooks.PreToolUse.length, 2);
		assert.ok(config.hooks.PreToolUse.some((entry) => isBrevityEntry(entry)));
		assert.ok(config.hooks.PreToolUse.includes(unrelated) || config.hooks.PreToolUse.some((entry) => entry.bash === 'echo keep-me'));
		assert.deepStrictEqual(
			JSON.parse(await fsPromises.readFile(`${hookPath}.bak`, 'utf8')),
			{ version: 1, hooks: { PreToolUse: [unrelated] } },
		);

		await manager.install();
		config = JSON.parse(await fsPromises.readFile(hookPath, 'utf8'));
		assert.strictEqual(config.hooks.PreToolUse.filter(isBrevityEntry).length, 1);

		await manager.uninstall();
		config = JSON.parse(await fsPromises.readFile(hookPath, 'utf8'));
		assert.strictEqual(config.hooks.PreToolUse.length, 1);
		assert.strictEqual(config.hooks.PreToolUse[0].bash, 'echo keep-me');
		assert.ok(await fsPromises.stat(`${hookPath}.bak`));

		await manager.install();
		config = JSON.parse(await fsPromises.readFile(hookPath, 'utf8'));
		assert.strictEqual(config.hooks.PreToolUse.filter(isBrevityEntry).length, 1);
		assert.strictEqual(config.hooks.PreToolUse.length, 2);

		await fsPromises.rm(workspace, { recursive: true, force: true });
	});

	test('Copilot hook install does not duplicate an RTK hook in another hook file', async () => {
		const workspace = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'brevity-hook-deduplicate-test-'));
		const hookDirectory = path.join(workspace, '.github', 'hooks');
		const existingHookPath = path.join(hookDirectory, 'rtk.json');
		await fsPromises.mkdir(hookDirectory, { recursive: true });
		await fsPromises.writeFile(existingHookPath, JSON.stringify({
			version: 1,
			hooks: { PreToolUse: [{ type: 'command', bash: 'rtk hook copilot' }] },
		}));

		const manager = new CopilotHookManager({
			workspaceFolders: [workspace],
			executablePath: path.join(workspace, 'rtk'),
			hookScriptPath: path.join(workspace, 'copilotHook.js'),
		});
		const results = await manager.install();

		assert.deepStrictEqual(results[0], {
			hookPath: path.join(hookDirectory, 'rtk-rewrite.json'),
			installed: false,
			existing: true,
		});
		await assert.rejects(() =>
			fsPromises.stat(path.join(hookDirectory, 'rtk-rewrite.json')),
		{ code: 'ENOENT' });
		assert.strictEqual(
			JSON.parse(await fsPromises.readFile(existingHookPath, 'utf8')).hooks.PreToolUse.length,
			1,
		);
		await fsPromises.rm(workspace, { recursive: true, force: true });
	});

	test('Copilot hook install removes its duplicate when another RTK hook appears', async () => {
		const workspace = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'brevity-hook-existing-test-'));
		const hookDirectory = path.join(workspace, '.github', 'hooks');
		const manager = new CopilotHookManager({
			workspaceFolders: [workspace],
			executablePath: path.join(workspace, 'rtk'),
			hookScriptPath: path.join(workspace, 'copilotHook.js'),
		});
		await manager.install();
		await fsPromises.writeFile(path.join(hookDirectory, 'rtk.json'), JSON.stringify({
			version: 1,
			hooks: { PreToolUse: [{ type: 'command', command: '"rtk" hook copilot' }] },
		}));

		const results = await manager.install();
		assert.strictEqual(results[0].installed, false);
		assert.strictEqual(results[0].existing, true);
		await assert.rejects(() =>
			fsPromises.stat(path.join(hookDirectory, 'rtk-rewrite.json')),
		{ code: 'ENOENT' });
		await fsPromises.rm(workspace, { recursive: true, force: true });
	});

	test('Copilot hook install recovers malformed configuration with a backup', async () => {
		const workspace = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'brevity-hook-recovery-test-'));
		const hookPath = path.join(workspace, '.github', 'hooks', 'rtk-rewrite.json');
		await fsPromises.mkdir(path.dirname(hookPath), { recursive: true });
		await fsPromises.writeFile(hookPath, '{"hooks":');

		const manager = new CopilotHookManager({
			workspaceFolders: [workspace],
			executablePath: path.join(workspace, 'rtk'),
			nodeExecutablePath: process.execPath,
			hookScriptPath: path.join(workspace, 'copilotHook.js'),
		});

		await manager.install();
		const config = JSON.parse(await fsPromises.readFile(hookPath, 'utf8'));
		assert.strictEqual(config.hooks.PreToolUse.filter(isBrevityEntry).length, 1);
		assert.strictEqual(await fsPromises.readFile(`${hookPath}.malformed.bak`, 'utf8'), '{"hooks":');

		await fsPromises.rm(workspace, { recursive: true, force: true });
	});

	test('Copilot hook rejects symlinked hook files', async () => {
		const workspace = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'brevity-hook-symlink-test-'));
		const hookDirectory = path.join(workspace, '.github', 'hooks');
		const targetPath = path.join(workspace, 'outside.json');
		const hookPath = path.join(hookDirectory, 'rtk-rewrite.json');
		await fsPromises.mkdir(hookDirectory, { recursive: true });
		await fsPromises.writeFile(targetPath, JSON.stringify({ secret: 'do-not-copy' }));
		await fsPromises.symlink(targetPath, hookPath);

		const manager = new CopilotHookManager({
			workspaceFolders: [workspace],
			executablePath: path.join(workspace, 'rtk'),
			nodeExecutablePath: process.execPath,
			hookScriptPath: path.join(workspace, 'copilotHook.js'),
		});

		await assert.rejects(() => manager.install(), /Refusing symlinked Copilot hook path/);
		assert.strictEqual(await fsPromises.readFile(targetPath, 'utf8'), JSON.stringify({ secret: 'do-not-copy' }));
		await fsPromises.rm(workspace, { recursive: true, force: true });
	});

	test('RTK downloads require HTTPS and use immutable release hashes', async () => {
		const { downloadUrl } = require('../src/tools/rtk/runtime');
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

});
