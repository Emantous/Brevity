const assert = require('assert');

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
const vscode = require('vscode');
const {
	resolveRtkAsset,
	parseChecksums,
	sha256,
	safeFileName,
} = require('../src/rtkRuntime');
// const myExtension = require('../extension');

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('RTK assets map supported platforms', () => {
		assert.strictEqual(resolveRtkAsset('linux', 'x64').asset, 'rtk-oss-x86_64-unknown-linux-musl.tar.gz');
		assert.strictEqual(resolveRtkAsset('linux', 'arm64').asset, 'rtk-oss-aarch64-unknown-linux-musl.tar.gz');
		assert.strictEqual(resolveRtkAsset('darwin', 'arm64').asset, 'rtk-oss-aarch64-apple-darwin.tar.gz');
		assert.strictEqual(resolveRtkAsset('win32', 'x64').asset, 'rtk-oss-x86_64-pc-windows-msvc.zip');
		assert.strictEqual(resolveRtkAsset('freebsd', 'x64'), null);
	});

	test('RTK checksums parse and hash consistently', () => {
		const checksums = parseChecksums('5dc4110f886e9b47e9380d3028d75ec266666bc70747f5aaf78572d8d2a48d71  rtk-oss-x86_64-unknown-linux-musl.tar.gz');
		assert.strictEqual(checksums.get('rtk-oss-x86_64-unknown-linux-musl.tar.gz'), '5dc4110f886e9b47e9380d3028d75ec266666bc70747f5aaf78572d8d2a48d71');
		assert.strictEqual(sha256(Buffer.from('rtk')), '3dc0deea30053c57bcbb7c1ff189b8cd5668eea42faf9b1aff650d1a4a7eb0de');
	});

	test('RTK archive names reject unsafe paths', () => {
		assert.throws(() => safeFileName('../rtk'), /Unsafe archive entry/);
		assert.throws(() => safeFileName('/tmp/rtk'), /Unsafe archive entry/);
		assert.strictEqual(safeFileName('./rtk'), 'rtk');
	});
});
