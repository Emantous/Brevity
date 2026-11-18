const test = require('node:test');
const assert = require('node:assert/strict');
const fsPromises = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
	clearMetrics,
	emptyMetrics,
	readMetrics,
	recordMetric,
	summarizeMetrics,
} = require('../../src/metrics');

test('local metrics aggregate counts without storing command content', async () => {
	const directory = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'brevity-metrics-test-'));
	const metricsPath = path.join(directory, 'metrics.json');
	try {
		assert.deepEqual(readMetrics(metricsPath), emptyMetrics());
		await recordMetric(metricsPath, 'rewrites', {
			inputCharacters: 100,
			rewrittenCharacters: 40,
		});
		await recordMetric(metricsPath, 'rawFallbacks');

		const metrics = readMetrics(metricsPath);
		assert.equal(metrics.rewrites, 1);
		assert.equal(metrics.rawFallbacks, 1);
		assert.equal(metrics.inputCharacters, 100);
		assert.equal(metrics.rewrittenCharacters, 40);
		assert.equal(summarizeMetrics(metrics), '1 rewrites, 0 bypasses, 0 failures, estimated 60% command reduction');
		assert.equal(JSON.stringify(metrics).includes('git'), false);

		await clearMetrics(metricsPath);
		assert.deepEqual(readMetrics(metricsPath), emptyMetrics());
	} finally {
		await fsPromises.rm(directory, { recursive: true, force: true });
	}
});
