#!/usr/bin/env node

const { spawnSync } = require('child_process');

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
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		return null;
	}
	const directInputs = [
		payload.tool_input,
		payload.toolInput,
		payload.tool_args,
		payload.toolArgs,
		payload.ToolArgs,
		payload.ToolInput,
		payload.arguments,
		payload.input,
	];
	for (const input of directInputs) {
		if (input && typeof input === 'object' && typeof input.command === 'string') {
			return input.command;
		}
	}

	for (const input of directInputs) {
		if (typeof input !== 'string') {
			continue;
		}
		try {
			const args = JSON.parse(input);
			if (args && typeof args === 'object' && typeof args.command === 'string') {
				return args.command;
			}
		} catch {
			return null;
		}
	}
	return null;
}

function shouldRunRtkHook(payload) {
	const command = getCommand(payload);
	return Boolean(command && !/^rtk(?:\.exe)?(?:\s|$)/i.test(command.trim()));
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
	const hookOutput = response.hookSpecificOutput || response.hook_specific_output;
	const updatedInput = response.updatedInput ||
		response.updated_input ||
		(hookOutput && (hookOutput.updatedInput || hookOutput.updated_input));
	const modifiedArgs = response.modifiedArgs || response.modified_args;
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
	if (!rtkExecutable) {
		process.exit(0);
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

	if (!shouldRunRtkHook(payload)) {
		process.exit(0);
	}

	process.stdout.write(runRtkHook(rtkExecutable, input));
}

if (require.main === module) {
	main().catch(() => process.exit(0));
}

module.exports = {
	getCommand,
	shouldRunRtkHook,
	isRewriteResponse,
	runRtkHook,
	sanitizedEnvironment,
};
