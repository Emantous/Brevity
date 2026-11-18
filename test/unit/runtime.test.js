const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
	RtkRuntimeManager,
	resolveRtkAsset,
	PINNED_ARCHIVE_SHA256,
	safeFileName,
	sha256,
	isTrustedDownloadRedirect,
} = require('../../src/rtkRuntime');

test('supported platform assets resolve to pinned hashes', () => {
	for (const [platform, architecture] of [
		['linux', 'x64'],
		['linux', 'arm64'],
		['darwin', 'x64'],
		['darwin', 'arm64'],
		['win32', 'x64'],
	]) {
		const resolved = resolveRtkAsset(platform, architecture);
		assert.ok(resolved);
		assert.equal(resolved.sha256, PINNED_ARCHIVE_SHA256[resolved.asset]);
	}
	assert.equal(resolveRtkAsset('freebsd', 'x64'), null);
	assert.equal(resolveRtkAsset('win32', 'arm64'), null);
});

test('unsafe archive paths are rejected', () => {
	assert.throws(() => safeFileName('../rtk'), /Unsafe archive entry/);
	assert.throws(() => safeFileName('/tmp/rtk'), /Unsafe archive entry/);
	assert.equal(safeFileName('./rtk'), 'rtk');
});

test('trusted RTK redirects stay on HTTPS release hosts', () => {
	assert.equal(isTrustedDownloadRedirect(
		'https://github.com/rtk-ai/rtk/releases/download/tag/rtk.tar.gz',
		'https://release-assets.githubusercontent.com/github-production-release-asset/rtk.tar.gz',
	), true);
	assert.equal(isTrustedDownloadRedirect(
		'https://github.com/rtk-ai/rtk/releases/download/tag/rtk.tar.gz',
		'http://example.com/rtk.tar.gz',
	), false);
	assert.equal(isTrustedDownloadRedirect(
		'https://github.com/rtk-ai/rtk/releases/download/tag/rtk.tar.gz',
		'https://example.com/rtk.tar.gz',
	), false);
});

test('corrupt cached executable is rejected', async () => {
	const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'brevity-runtime-test-'));
	try {
		const manager = new RtkRuntimeManager({
			storageDir,
			output: () => {},
		});
		if (!manager.asset) {
			manager.asset = resolveRtkAsset('linux', 'x64');
		}
		await fs.mkdir(manager.rootDir, { recursive: true });
		await fs.writeFile(manager.executablePath, 'corrupt');
		await fs.writeFile(path.join(manager.rootDir, 'manifest.json'), JSON.stringify({
			tag: 'dev-1.3.0-rc.642',
			executableSha256: sha256(Buffer.from('expected')),
		}));
		const status = await manager.status();
		assert.equal(status.ready, false);
	} finally {
		await fs.rm(storageDir, { recursive: true, force: true });
	}
});
