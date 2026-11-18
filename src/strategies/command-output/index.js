const strategy = {
	id: 'command-output',
	name: 'Command output reduction',
	apply: async ({ command, tool, payload }) => {
		if (!tool || typeof tool.apply !== 'function') {
			return { applied: false, reason: 'no-tool' };
		}
		return tool.apply({ command, payload });
	},
};

module.exports = strategy;
