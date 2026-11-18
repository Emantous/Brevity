class StrategyRegistry {
	constructor() {
		this.strategies = new Map();
	}

	register(strategy) {
		if (!strategy || typeof strategy.id !== 'string' || typeof strategy.apply !== 'function') {
			throw new Error('Invalid Brevity strategy definition');
		}
		this.strategies.set(strategy.id, strategy);
		return this;
	}

	get(id) {
		return this.strategies.get(id);
	}

	list() {
		return [...this.strategies.values()];
	}
}

module.exports = { StrategyRegistry };
