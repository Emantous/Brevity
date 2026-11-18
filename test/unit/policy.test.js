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
const {
	getCommand,
	isRewriteResponse,
	runRtkHook,
} = require('../../src/copilotHook');

test('Copilot payload fixtures produce command strings', async () => {
	const fixturePath = path.join(__dirname, '..', 'fixtures', 'copilot-payloads.json');
	const fixtures = JSON.parse(await readFile(fixturePath, 'utf8'));

	assert.equal(getCommand(fixtures.vscodeGitStatus), 'git status');
	assert.equal(getCommand(fixtures.vscodeGitDiff), 'git diff HEAD');
	assert.equal(getCommand(fixtures.cliGitStatus), 'git status');
	assert.equal(getCommand(fixtures.cliUnknown), 'curl https://example.com');
	assert.equal(getCommand(fixtures.nonTerminal), null);
	assert.equal(getCommand({
		ToolName: 'terminal',
		ToolArgs: { command: 'git status' },
	}), 'git status');
	assert.equal(getCommand({
		toolName: 'bash',
		toolInput: JSON.stringify({ command: 'git status' }),
	}), 'git status');
});

test('allowlist supports read and build commands conservatively', () => {
	for (const command of [
		'git status',
		'npm test',
		'pnpm run build',
		'yarn test',
		'cargo test',
		'cargo clippy',
		'npm run build',
		'pytest tests/test_policy.py',
		'mvn test',
		'gradle check',
		'dotnet test',
		'go test ./...',
		'phpunit tests',
		'docker ps',
		'docker inspect app',
		'kubectl get pods',
		'kubectl describe deployment/api',
		'aws ec2 describe-instances',
		'az vm list',
		'gcloud compute instances list',
		'ls -la src',
		'find src -type f',
		'grep -R TODO src',
		'rg TODO src',
		'du -sh .',
		'df -h .',
		'curl https://example.com',
		'curl -I https://example.com',
		'wget --spider https://example.com',
	]) {
		assert.equal(isBrevityAllowedCommand(command), true, command);
	}
	assert.equal(isBrevityAllowedCommand('git status'), true);
	assert.equal(isBrevityAllowedCommand('git diff HEAD'), false);
	assert.equal(isBrevityAllowedCommand('git diff HEAD', {
		commandOverrides: { 'git diff': true },
	}), true);
	assert.equal(isBrevityAllowedCommand('git log -10'), false);

	for (const command of [
		'git rebase -i HEAD~2',
		'git status && rm -rf /',
		'rtk bypass git status',
		'cat <<EOF\nhello\nEOF',
		'sudo git status',
		'git branch -D feature',
		'git push --force origin main',
		'cargo run',
		'npm run deploy',
		'pnpm exec vitest --run',
		'GITHUB_TOKEN=secret npm test',
		'npm test --token=secret',
		'pytest --pdb',
		'mvn deploy',
		'gradle publish',
		'dotnet run',
		'go run ./cmd/server',
		'docker run nginx',
		'docker exec app sh',
		'kubectl apply -f deployment.yaml',
		'kubectl delete pod app',
		'aws s3 cp secret.txt s3://bucket',
		'az vm start --name app',
		'gcloud compute instances delete app',
		'aws ec2 describe-instances --token secret',
		'find . -delete',
		'curl -d payload https://example.com',
		'curl -H Authorization:secret https://example.com',
		'curl -u user:password https://example.com',
		'wget https://example.com/archive.zip',
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

test('RTK hook preserves valid rewrite envelopes and fails open safely', () => {
	const vscodeResponse = JSON.stringify({
		hookSpecificOutput: {
			hookEventName: 'PreToolUse',
			permissionDecisionReason: 'RTK auto-rewrite',
			updatedInput: { command: 'rtk git status' },
		},
	});
	const cliResponse = JSON.stringify({
		modifiedArgs: { command: 'rtk git status' },
	});

	assert.equal(isRewriteResponse(JSON.parse(vscodeResponse)), true);
	assert.equal(isRewriteResponse(JSON.parse(cliResponse)), true);
	assert.equal(isRewriteResponse({}), false);
	assert.equal(isRewriteResponse({ modifiedArgs: { command: 42 } }), false);

	const successfulSpawn = () => ({ status: 0, stdout: vscodeResponse });
	assert.equal(runRtkHook('/tmp/rtk', '{}', successfulSpawn), vscodeResponse);

	const failedSpawn = () => ({ status: 1, stdout: cliResponse });
	assert.equal(runRtkHook('/tmp/rtk', '{}', failedSpawn), '');

	const malformedSpawn = () => ({ status: 0, stdout: '{"modifiedArgs":' });
	assert.equal(runRtkHook('/tmp/rtk', '{}', malformedSpawn), '');
});
