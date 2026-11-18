function getExecutionContext(environment = {}) {
	const remoteName = typeof environment.remoteName === 'string'
		? environment.remoteName
		: null;
	const platform = environment.platform || process.platform;

	if (!remoteName) {
		return {
			kind: 'local',
			remoteName: null,
			usesRemoteExtensionHost: false,
			platform,
		};
	}

	return {
		kind: remoteName === 'wsl' ? 'wsl' : remoteName.includes('container') ? 'container' : 'remote',
		remoteName,
		usesRemoteExtensionHost: true,
		platform,
	};
}

module.exports = { getExecutionContext };
