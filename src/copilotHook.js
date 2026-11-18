#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const { isBrevityAllowedCommand } = require('./copilotPolicy');
const { recordMetric } = require('./metrics');
const { migratePolicy } = require('./migrations');

function readPayload() {
	return new Promise((resolve, reject) => {
		let input = '';
		process.stdin.setEncoding('utf8');
		process.stdin.on('data', (chunk) => {
			input += chunk;
			if (input.length > 1_048_576) {
				reject(new Error('Hook payload exceeds 1 MiB'));
			}
		});
		process.stdin.on('end', () => resolve(input));
		process.stdin.on('error', reject);
	});
}

function getCommand(payload) {
	if (payload.tool_name && payload.tool_input && typeof payload.tool_input.command === 'string') {
		return payload.tool_input.command;
	}
	if (payload.toolName && typeof payload.toolArgs === 'string') {
		try {
			const args = JSON.parse(payload.toolArgs);
			if (typeof args.command === 'string') {
				return args.command;
			}
		} catch {
			return null;
		}
	}
	if (payload.toolName === 'run_in_terminal' && typeof payload.toolArgs === 'string') {
		try {
			const args = JSON.parse(payload.toolArgs);
			if (typeof args.command === 'string') {
				return args.command;
			}
		} catch {
			return null;
		}
	}
	return null;
}

function sanitizedEnvironment(source = process.env) {
	const keys = [
		'HOME',
		'USERPROFILE',
		'SYSTEMROOT',
		'COMSPEC',
		'PATHEXT',
		'TEMP',
		'TMP',
	];
	const environment = {};
	for (const key of keys) {
		if (typeof source[key] === 'string') {
			environment[key] = source[key];
		}
	}
	return environment;
}

function isRewriteResponse(response) {
	if (!response || typeof response !== 'object') {
		return false;
	}
	const updatedInput = response.updatedInput ||
		(response.hookSpecificOutput && response.hookSpecificOutput.updatedInput);
	const modifiedArgs = response.modifiedArgs;
	return Boolean(
		updatedInput && typeof updatedInput.command === 'string' ||
		modifiedArgs && typeof modifiedArgs.command === 'string',
	);
}

function runRtkHookResult(rtkExecutable, input, spawn = spawnSync) {
	const result = spawn(rtkExecutable, ['hook', 'copilot'], {
		input,
		encoding: 'utf8',
		timeout: 5_000,
		maxBuffer: 1_048_576,
		env: sanitizedEnvironment(),
	});

	if (result.error || result.status !== 0 || typeof result.stdout !== 'string' || !result.stdout.trim()) {
		return { output: '', reason: result.error || result.status !== 0 ? 'failure' : 'empty' };
	}

	try {
		const response = JSON.parse(result.stdout);
		return isRewriteResponse(response)
			? { output: result.stdout, reason: 'rewritten', response }
			: { output: '', reason: 'invalid' };
	} catch {
		return { output: '', reason: 'invalid' };
	}
}

function runRtkHook(rtkExecutable, input, spawn = spawnSync) {
	return runRtkHookResult(rtkExecutable, input, spawn).output;
}

async function main() {
	const rtkExecutable = process.argv[2];
	const policyFile = process.argv[3];
	const metricsFilePath = process.argv[4];
	if (!rtkExecutable) {
		process.exit(0);
	}

	let policy = {};
	if (policyFile) {
		try {
			policy = migratePolicy(JSON.parse(fs.readFileSync(policyFile, 'utf8')));
		} catch {
			policy = {};
		}
	}

	const input = await readPayload();
	if (!input.trim()) {
		process.exit(0);
	}

	let payload;
	try {
		payload = JSON.parse(input);
	} catch {
		process.exit(0);
	}

	const command = getCommand(payload);
	if (typeof command === 'string' && /^rtk\s+bypass(?:\s|$)/.test(command)) {
		await recordMetric(metricsFilePath, 'bypasses');
		process.exit(0);
	}
	if (!isBrevityAllowedCommand(command, {
		allowlist: policy.allowlist,
		excludePatterns: policy.excludePatterns,
		commandOverrides: policy.commandOverrides,
	})) {
		process.exit(0);
	}

	const result = runRtkHookResult(rtkExecutable, input);
	if (result.reason === 'rewritten') {
		const rewrittenCommand = result.response.updatedInput?.command ||
			result.response.hookSpecificOutput?.updatedInput?.command ||
			result.response.modifiedArgs?.command || '';
		await recordMetric(metricsFilePath, 'rewrites', {
			inputCharacters: command.length,
			rewrittenCharacters: rewrittenCommand.length,
		});
	} else if (result.reason === 'failure' || result.reason === 'invalid') {
		await recordMetric(metricsFilePath, 'failures');
		await recordMetric(metricsFilePath, 'rawFallbacks');
	}
	process.stdout.write(result.output);
}

if (require.main === module) {
	main().catch(() => process.exit(0));
}

module.exports = {
	getCommand,
	isRewriteResponse,
	runRtkHook,
	runRtkHookResult,
	sanitizedEnvironment,
};
