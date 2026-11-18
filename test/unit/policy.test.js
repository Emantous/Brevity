const test = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const {
	isBrevityAllowedCommand,
	parseCommand,
	stripEnvironmentPrefixes,
	matchesPattern,
} = require('../../src/copilotPolicy');
const { getCommand } = require('../../src/copilotHook');

test('Copilot payload fixtures produce command strings', async () => {
	const fixturePath = path.join(__dirname, '..', 'fixtures', 'copilot-payloads.json');
	const fixtures = JSON.parse(await readFile(fixturePath, 'utf8'));

	assert.equal(getCommand(fixtures.vscodeGitStatus), 'git status');
	assert.equal(getCommand(fixtures.vscodeGitDiff), 'git diff HEAD');
	assert.equal(getCommand(fixtures.cliGitStatus), 'git status');
	assert.equal(getCommand(fixtures.cliUnknown), 'curl https://example.com');
	assert.equal(getCommand(fixtures.nonTerminal), null);
});

test('allowlist supports read and build commands conservatively', () => {
	for (const command of [
		'git status',
		'git diff HEAD',
		'git log -10',
		'npm test',
		'pnpm run build',
		'yarn test',
		'cargo test',
		'cargo clippy',
	]) {
		assert.equal(isBrevityAllowedCommand(command), true, command);
	}

	for (const command of [
		'git rebase -i HEAD~2',
		'git status && rm -rf /',
		'curl https://example.com',
		'rtk bypass git status',
		'cat <<EOF\nhello\nEOF',
		'sudo git status',
	]) {
		assert.equal(isBrevityAllowedCommand(command), false, command);
	}
});

test('environment prefixes are removed before policy matching', () => {
	assert.equal(stripEnvironmentPrefixes('RUST_LOG=debug cargo test'), 'cargo test');
	assert.equal(matchesPattern('git status', ['git status']), true);
	assert.equal(matchesPattern('git status', ['^git re']), false);
	assert.equal(matchesPattern('git status', ['^git (status|diff)']), true);
});

test('parser returns a canonical command intent', () => {
	assert.deepEqual(parseCommand('RUST_LOG="debug mode" git diff --stat "src/app file.js"'), {
		raw: 'RUST_LOG="debug mode" git diff --stat "src/app file.js"',
		stripped: 'git diff --stat src/app file.js',
		environment: { RUST_LOG: 'debug mode' },
		executable: 'git',
		subcommand: 'diff',
		flags: ['--stat'],
		args: ['src/app file.js'],
		wrapper: null,
	});
	assert.deepEqual(parseCommand('pnpm exec vitest --run'), {
		raw: 'pnpm exec vitest --run',
		stripped: 'pnpm exec vitest --run',
		environment: {},
		executable: 'pnpm',
		subcommand: 'exec',
		flags: ['--run'],
		args: ['vitest'],
		wrapper: { executable: 'vitest', args: ['--run'] },
	});
});

test('parser rejects shell-sensitive and incomplete commands', () => {
	for (const command of [
		'git status && rm -rf /',
		'git status | tee output.txt',
		'git status > output.txt',
		'git status $(whoami)',
		'git status $HOME',
		'git status "unterminated',
		'RUST_LOG=debug',
	]) {
		assert.equal(parseCommand(command), null, command);
		assert.equal(isBrevityAllowedCommand(command), false, command);
	}
});
