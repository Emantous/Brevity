const test = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const {
	getCommand,
	shouldRunRtkHook,
	isRewriteResponse,
	runRtkHook,
	sanitizedEnvironment,
} = require('../../src/core/hook');

test('Copilot terminal payloads are passed to RTK to choose whether to rewrite', async () => {
	const fixturePath = path.join(__dirname, '..', 'fixtures', 'copilot-payloads.json');
	const fixtures = JSON.parse(await readFile(fixturePath, 'utf8'));

	assert.equal(getCommand(fixtures.vscodeGitStatus), 'git status');
	assert.equal(getCommand(fixtures.vscodeGitDiff), 'git diff HEAD');
	assert.equal(getCommand(fixtures.cliGitStatus), 'git status');
	assert.equal(getCommand(fixtures.nonTerminal), null);
	assert.equal(shouldRunRtkHook(fixtures.vscodeGitStatus), true);
	assert.equal(shouldRunRtkHook(fixtures.vscodeGitDiff), true);
	assert.equal(shouldRunRtkHook(fixtures.cliUnknown), true);
	assert.equal(shouldRunRtkHook(fixtures.nonTerminal), false);
	assert.equal(shouldRunRtkHook(null), false);
});

test('already-prefixed RTK commands are not sent back through RTK', () => {
	assert.equal(shouldRunRtkHook({
		tool_input: { command: 'rtk git status' },
	}), false);
	assert.equal(shouldRunRtkHook({
		toolArgs: JSON.stringify({ command: 'rtk bypass git status' }),
	}), false);
});

test('hook returns RTK rewrite responses and fails open for invalid results', () => {
	const response = JSON.stringify({
		hookSpecificOutput: {
			hookEventName: 'PreToolUse',
			updatedInput: { command: 'rtk git diff HEAD' },
		},
	});
	let invocation;
	const output = runRtkHook('/tmp/rtk', '{"tool_input":{"command":"git diff HEAD"}}',
		(executable, args, options) => {
			invocation = { executable, args, options };
			return { status: 0, stdout: response };
		});

	assert.equal(output, response);
	assert.equal(invocation.executable, '/tmp/rtk');
	assert.deepEqual(invocation.args, ['hook', 'copilot']);
	assert.equal(invocation.options.input, '{"tool_input":{"command":"git diff HEAD"}}');

	assert.equal(runRtkHook('/tmp/rtk', '{}', () => ({
		status: 1,
		stdout: response,
	})), '');
	assert.equal(runRtkHook('/tmp/rtk', '{}', () => ({
		status: 0,
		stdout: '{"modifiedArgs":',
	})), '');
	assert.equal(isRewriteResponse({}), false);
	assert.equal(isRewriteResponse({ modifiedArgs: { command: 42 } }), false);
});

test('RTK subprocess gets only the small environment it needs', () => {
	const environment = sanitizedEnvironment({
		HOME: '/tmp/test-home',
		GITHUB_TOKEN: 'secret',
		ANTHROPIC_API_KEY: 'secret',
	});
	assert.equal(environment.HOME, '/tmp/test-home');
	assert.equal(environment.GITHUB_TOKEN, undefined);
	assert.equal(environment.ANTHROPIC_API_KEY, undefined);
});
