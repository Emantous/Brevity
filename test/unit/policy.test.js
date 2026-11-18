const test = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const {
	isBrevityAllowedCommand,
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
