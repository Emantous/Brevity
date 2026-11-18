const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');

const EMPTY_METRICS = {
	version: 1,
	rewrites: 0,
	bypasses: 0,
	failures: 0,
	rawFallbacks: 0,
	inputCharacters: 0,
	rewrittenCharacters: 0,
	updatedAt: null,
};

function emptyMetrics() {
	return { ...EMPTY_METRICS };
}

function readMetrics(metricsPath) {
	if (!metricsPath) {
		return emptyMetrics();
	}
	try {
		const parsed = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
		return { ...emptyMetrics(), ...parsed };
	} catch (error) {
		if (error.code !== 'ENOENT') {
			return emptyMetrics();
		}
		return emptyMetrics();
	}
}

async function writeMetrics(metricsPath, metrics) {
	await fsPromises.mkdir(path.dirname(metricsPath), { recursive: true });
	const temporaryPath = `${metricsPath}.${process.pid}.${Date.now()}.tmp`;
	try {
		await fsPromises.writeFile(temporaryPath, `${JSON.stringify(metrics, null, 2)}\n`, {
			encoding: 'utf8',
			mode: 0o600,
		});
		await fsPromises.rename(temporaryPath, metricsPath);
	} catch (error) {
		await fsPromises.rm(temporaryPath, { force: true });
		throw error;
	}
}

async function recordMetric(metricsPath, event, values = {}) {
	if (!metricsPath) {
		return;
	}
	const metrics = readMetrics(metricsPath);
	metrics[event] = (metrics[event] || 0) + 1;
	for (const field of ['inputCharacters', 'rewrittenCharacters']) {
		if (typeof values[field] === 'number' && Number.isFinite(values[field])) {
			metrics[field] += Math.max(0, Math.round(values[field]));
		}
	}
	metrics.updatedAt = new Date().toISOString();
	await writeMetrics(metricsPath, metrics);
}

async function clearMetrics(metricsPath) {
	if (!metricsPath) {
		return;
	}
	await writeMetrics(metricsPath, emptyMetrics());
}

function summarizeMetrics(metrics) {
	const input = metrics.inputCharacters || 0;
	const rewritten = metrics.rewrittenCharacters || 0;
	const reduction = input > 0 ? Math.round((1 - rewritten / input) * 100) : 0;
	return `${metrics.rewrites || 0} rewrites, ${metrics.bypasses || 0} bypasses, ` +
		`${metrics.failures || 0} failures, estimated ${reduction}% command reduction`;
}

module.exports = {
	clearMetrics,
	emptyMetrics,
	readMetrics,
	recordMetric,
	summarizeMetrics,
	writeMetrics,
};
