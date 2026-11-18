function formatStatus({ enabled, runtimeReady, hookCount = 0 }) {
	if (!enabled) {
		return {
			text: '$(circle-slash) Brevity: Off',
			tooltip: 'Brevity RTK compression is disabled.',
		};
	}
	if (!runtimeReady) {
		return {
			text: '$(warning) Brevity: Setup needed',
			tooltip: 'RTK is unavailable or not ready. Commands will pass through unchanged.',
		};
	}
	if (hookCount === 0) {
		return {
			text: '$(warning) Brevity: No hook',
			tooltip: 'RTK is ready, but no Copilot project hook is registered.',
		};
	}
	return {
		text: '$(rocket) Brevity: Ready',
		tooltip: `RTK is ready and registered in ${hookCount} workspace${hookCount === 1 ? '' : 's'}.`,
	};
}

function countSupportedCommands(allowlist = []) {
	const countByFamily = {
		git: 6,
		npm: 7,
		pnpm: 7,
		yarn: 7,
		cargo: 7,
		pytest: 1,
		mvn: 5,
		gradle: 4,
		dotnet: 2,
		go: 4,
		phpunit: 1,
		docker: 7,
		kubectl: 5,
		aws: 4,
		az: 4,
		gcloud: 4,
	};
	return [...new Set(allowlist)]
		.reduce((count, family) => count + (countByFamily[family.toLowerCase()] || 0), 0);
}

module.exports = {
	formatStatus,
	countSupportedCommands,
};
