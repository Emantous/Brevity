#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const { isBrevityAllowedCommand } = require('./copilotPolicy');

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

function runRtkHook(rtkExecutable, input, spawn = spawnSync) {
	const result = spawn(rtkExecutable, ['hook', 'copilot'], {
		input,
		encoding: 'utf8',
		timeout: 5_000,
		maxBuffer: 1_048_576,
		env: sanitizedEnvironment(),
	});

	if (result.error || result.status !== 0 || typeof result.stdout !== 'string' || !result.stdout.trim()) {
		return '';
	}

	try {
		const response = JSON.parse(result.stdout);
		return isRewriteResponse(response) ? result.stdout : '';
	} catch {
		return '';
	}
}

async function main() {
	const rtkExecutable = process.argv[2];
	const policyFile = process.argv[3];
	if (!rtkExecutable) {
		process.exit(0);
	}

	let policy = {};
	if (policyFile) {
		try {
			policy = JSON.parse(fs.readFileSync(policyFile, 'utf8'));
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
	if (!isBrevityAllowedCommand(command, {
		allowlist: policy.allowlist,
		excludePatterns: policy.excludePatterns,
	})) {
		process.exit(0);
	}

	process.stdout.write(runRtkHook(rtkExecutable, input));
}

if (require.main === module) {
	main().catch(() => process.exit(0));
}

module.exports = {
	getCommand,
	isRewriteResponse,
	runRtkHook,
	sanitizedEnvironment,
};
