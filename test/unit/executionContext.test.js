const test = require('node:test');
const assert = require('node:assert/strict');
const { getExecutionContext } = require('../../src/executionContext');

test('execution context distinguishes local, WSL, containers, and remote hosts', () => {
	assert.deepEqual(getExecutionContext({ platform: 'linux' }), {
		kind: 'local',
		remoteName: null,
		usesRemoteExtensionHost: false,
		platform: 'linux',
	});
	assert.equal(getExecutionContext({ remoteName: 'wsl', platform: 'linux' }).kind, 'wsl');
	assert.equal(getExecutionContext({ remoteName: 'dev-container', platform: 'linux' }).kind, 'container');
	assert.equal(getExecutionContext({ remoteName: 'ssh-remote', platform: 'linux' }).usesRemoteExtensionHost, true);
});
