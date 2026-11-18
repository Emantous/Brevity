const test = require('node:test');
const assert = require('node:assert/strict');
const { ToolRegistry } = require('../../src/core/toolRegistry');
const { StrategyRegistry } = require('../../src/core/strategyRegistry');

test('tool registry supports registering independent adapters', () => {
	const registry = new ToolRegistry();
	registry.register({
		id: 'example',
		name: 'Example tool',
		prepare: async () => ({ ok: true }),
	});
	assert.equal(registry.get('example').name, 'Example tool');
	assert.deepEqual(registry.list().map((tool) => tool.id), ['example']);
});

test('strategy registry supports independent strategy implementations', () => {
	const registry = new StrategyRegistry();
	registry.register({
		id: 'example',
		name: 'Example strategy',
		apply: async () => ({ applied: true }),
	});
	assert.equal(registry.get('example').name, 'Example strategy');
	assert.deepEqual(registry.list().map((strategy) => strategy.id), ['example']);
});
