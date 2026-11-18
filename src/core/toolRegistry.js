class ToolRegistry {
	constructor() {
		this.tools = new Map();
	}

	register(tool) {
		if (!tool || typeof tool.id !== 'string' || typeof tool.prepare !== 'function') {
			throw new Error('Invalid Brevity tool definition');
		}
		this.tools.set(tool.id, tool);
		return this;
	}

	get(id) {
		return this.tools.get(id);
	}

	list() {
		return [...this.tools.values()];
	}

	async prepareAll(context) {
		const results = [];
		for (const tool of this.list()) {
			results.push({ id: tool.id, ...(await tool.prepare(context)) });
		}
		return results;
	}
}

module.exports = { ToolRegistry };
