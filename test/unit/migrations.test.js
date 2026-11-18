const test = require('node:test');
const assert = require('node:assert/strict');
const {
	CURRENT_POLICY_SCHEMA,
	CURRENT_RUNTIME_MANIFEST_SCHEMA,
	migratePolicy,
	migrateRuntimeManifest,
} = require('../../src/core/migrations');

test('policy migration preserves settings and adds a schema version', () => {
	const migrated = migratePolicy({ allowlist: ['git'], commandOverrides: { 'git diff': true } });
	assert.equal(migrated.schemaVersion, CURRENT_POLICY_SCHEMA);
	assert.deepEqual(migrated.allowlist, ['git']);
	assert.deepEqual(migrated.commandOverrides, { 'git diff': true });
});

test('runtime migration accepts legacy manifests and rejects future schemas', () => {
	const migrated = migrateRuntimeManifest({ tag: 'test', executableSha256: 'abc' });
	assert.equal(migrated.schemaVersion, CURRENT_RUNTIME_MANIFEST_SCHEMA);
	assert.equal(migrated.tag, 'test');
	assert.equal(migrateRuntimeManifest({ schemaVersion: CURRENT_RUNTIME_MANIFEST_SCHEMA + 1 }), null);
	assert.equal(migrateRuntimeManifest(null), null);
});
