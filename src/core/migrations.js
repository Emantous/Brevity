const CURRENT_POLICY_SCHEMA = 1;
const CURRENT_RUNTIME_MANIFEST_SCHEMA = 1;

function migratePolicy(policy) {
	if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
		return { schemaVersion: CURRENT_POLICY_SCHEMA };
	}
	return {
		...policy,
		schemaVersion: CURRENT_POLICY_SCHEMA,
	};
}

function migrateRuntimeManifest(manifest) {
	if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
		return null;
	}
	if (
		manifest.schemaVersion &&
		manifest.schemaVersion > CURRENT_RUNTIME_MANIFEST_SCHEMA
	) {
		return null;
	}
	return {
		...manifest,
		schemaVersion: CURRENT_RUNTIME_MANIFEST_SCHEMA,
	};
}

module.exports = {
	CURRENT_POLICY_SCHEMA,
	CURRENT_RUNTIME_MANIFEST_SCHEMA,
	migratePolicy,
	migrateRuntimeManifest,
};
