const runtime = require('./runtime');

const tool = {
	id: 'rtk',
	name: 'RTK command output compression',
	strategies: ['command-output'],
	...runtime,
};

tool.prepare = async ({ storageDir, output }) => {
	const manager = new runtime.RtkRuntimeManager({ storageDir, output });
	return manager.ensureRuntime();
};

tool.apply = async () => ({ applied: false, reason: 'implemented-by-hook-adapter' });

tool.status = async ({ storageDir }) => {
	const manager = new runtime.RtkRuntimeManager({ storageDir });
	return manager.status();
};

module.exports = tool;
