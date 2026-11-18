const DEFAULT_COMMAND_ALLOWLIST = [
	'git',
	'npm',
	'pnpm',
	'yarn',
	'cargo',
];

const GIT_SAFE_SUBCOMMANDS = new Set([
	'status',
	'diff',
	'log',
	'branch',
	'show',
	'stats',
]);

const BUILD_SUBCOMMANDS = new Set([
	'test',
	'build',
	'check',
	'clippy',
	'nextest',
	'list',
	'ls',
	'why',
	'outdated',
	'info',
	'view',
]);
const PRIVILEGED_EXECUTABLES = new Set(['sudo', 'su', 'doas']);
const DANGEROUS_GIT_SUBCOMMANDS = new Set([
	'apply',
	'cherry-pick',
	'clean',
	'commit',
	'config',
	'fetch',
	'merge',
	'mv',
	'push',
	'rebase',
	'remote',
	'reset',
	'restore',
	'rm',
	'stash',
	'switch',
	'tag',
]);
const SAFE_PACKAGE_SCRIPT_PATTERN = /^(?:build|check|format|lint|test|typecheck)(?::|$)/;
const SENSITIVE_ENVIRONMENT_PATTERN = /(?:AUTH|CREDENTIAL|KEY|PASS(?:WORD)?|SECRET|TOKEN)/i;
const SENSITIVE_ARGUMENT_PATTERN = /(?:^|[-_])(?:api[-_]?key|credential|pass(?:word)?|secret|token)(?:[-_=]|$)/i;
const DANGEROUS_FLAG_PATTERN = /^(?:-[^-]*[dD]|--delete(?:=|$)|--force(?:=|$)|--hard(?:=|$)|--soft(?:=|$))$/;

function pathBaseName(value) {
	return value.replace(/\\/g, '/').split('/').pop();
}

function tokenizeCommand(command) {
	const tokens = [];
	let token = '';
	let quote = null;
	let escaped = false;

	for (let index = 0; index < command.length; index += 1) {
		const character = command[index];
		if (escaped) {
			token += character;
			escaped = false;
			continue;
		}
		if (character === '\\' && quote !== "'") {
			escaped = true;
			continue;
		}
		if (quote) {
			if (character === quote) {
				quote = null;
			} else {
				token += character;
			}
			continue;
		}
		if (character === "'" || character === '"') {
			quote = character;
			continue;
		}
		if (/\s/.test(character)) {
			if (token) {
				tokens.push(token);
				token = '';
			}
			continue;
		}
		if (character === '$' && quote !== "'") {
			return null;
		}
		if (character === '`' || /[;&|<>]/.test(character)) {
			return null;
		}
		token += character;
	}

	if (escaped || quote) {
		return null;
	}
	if (token) {
		tokens.push(token);
	}
	return tokens;
}

function stripEnvironmentPrefixes(command) {
	const tokens = tokenizeCommand(command.trim());
	if (!tokens) {
		return command.trim();
	}
	let firstCommandToken = 0;
	while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[firstCommandToken] || '')) {
		firstCommandToken += 1;
	}
	return tokens.slice(firstCommandToken).join(' ');
}

function parseCommand(command) {
	if (typeof command !== 'string' || command.trim().length === 0) {
		return null;
	}
	const tokens = tokenizeCommand(command.trim());
	if (!tokens || tokens.length === 0) {
		return null;
	}

	const environment = {};
	let commandStart = 0;
	while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[commandStart] || '')) {
		const separator = tokens[commandStart].indexOf('=');
		environment[tokens[commandStart].slice(0, separator)] = tokens[commandStart].slice(separator + 1);
		commandStart += 1;
	}
	if (commandStart >= tokens.length) {
		return null;
	}

	const commandTokens = tokens.slice(commandStart);
	const executable = pathBaseName(commandTokens[0]).toLowerCase();
	const subcommand = commandTokens[1] && !commandTokens[1].startsWith('-')
		? commandTokens[1].toLowerCase()
		: null;
	const argumentStart = subcommand ? 2 : 1;
	const flags = commandTokens.slice(1).filter((token) => token.startsWith('-'));
	const args = commandTokens.slice(argumentStart).filter((token) => !token.startsWith('-'));
	const wrapper = ['npx', 'pnpm', 'yarn', 'npm'].includes(executable) && subcommand === 'exec'
		? {
			executable: commandTokens[2] ? pathBaseName(commandTokens[2]).toLowerCase() : null,
			args: commandTokens.slice(3),
		}
		: null;

	return {
		raw: command,
		stripped: commandTokens.join(' '),
		environment,
		executable,
		subcommand,
		flags,
		args,
		wrapper,
	};
}

function extractCommand(command) {
	const parsed = parseCommand(command);
	if (!parsed) {
		return null;
	}
	return {
		stripped: parsed.stripped,
		executable: parsed.executable,
		subcommand: parsed.subcommand,
	};
}

function hasDangerousIntent(parsed) {
	if (PRIVILEGED_EXECUTABLES.has(parsed.executable) ||
		DANGEROUS_GIT_SUBCOMMANDS.has(parsed.subcommand) ||
		(parsed.executable === 'cargo' && parsed.subcommand === 'run') ||
		(parsed.executable === 'git' && parsed.subcommand === 'branch' &&
			parsed.flags.some((flag) => DANGEROUS_FLAG_PATTERN.test(flag))) ||
		(['npm', 'pnpm', 'yarn'].includes(parsed.executable) &&
			parsed.subcommand === 'run' &&
			!SAFE_PACKAGE_SCRIPT_PATTERN.test(parsed.args[0] || ''))) {
		return true;
	}

	if (Object.keys(parsed.environment).some((key) => SENSITIVE_ENVIRONMENT_PATTERN.test(key))) {
		return true;
	}

	return [...parsed.flags, ...parsed.args].some((value) =>
		SENSITIVE_ARGUMENT_PATTERN.test(value));
}

function matchesPattern(command, patterns = []) {
	const stripped = stripEnvironmentPrefixes(command);
	return patterns.some((pattern) => {
		if (typeof pattern !== 'string' || pattern.length === 0) {
			return false;
		}
		if (pattern.startsWith('^')) {
			try {
				return new RegExp(pattern).test(stripped);
			} catch {
				return false;
			}
		}
		return stripped === pattern || stripped.startsWith(`${pattern} `);
	});
}

function isBrevityAllowedCommand(command, options = {}) {
	if (typeof command !== 'string' || command.trim().length === 0) {
		return false;
	}
	if (matchesPattern(command, options.excludePatterns)) {
		return false;
	}
	if (matchesPattern(command, ['rtk ', 'rtk bypass'])) {
		return false;
	}

	const parsed = parseCommand(command);
	if (!parsed) {
		return false;
	}
	if (parsed.wrapper || hasDangerousIntent(parsed)) {
		return false;
	}

	const allowlist = options.allowlist || DEFAULT_COMMAND_ALLOWLIST;
	if (!allowlist.includes(parsed.executable)) {
		return false;
	}

	if (parsed.executable === 'git') {
		return GIT_SAFE_SUBCOMMANDS.has(parsed.subcommand);
	}
	if (parsed.executable === 'cargo') {
		return BUILD_SUBCOMMANDS.has(parsed.subcommand);
	}
	if (['npm', 'pnpm', 'yarn'].includes(parsed.executable)) {
		return parsed.subcommand === 'run'
			? SAFE_PACKAGE_SCRIPT_PATTERN.test(parsed.args[0] || '')
			: BUILD_SUBCOMMANDS.has(parsed.subcommand);
	}
	return false;
}

module.exports = {
	DEFAULT_COMMAND_ALLOWLIST,
	GIT_SAFE_SUBCOMMANDS,
	BUILD_SUBCOMMANDS,
	hasDangerousIntent,
	extractCommand,
	parseCommand,
	matchesPattern,
	isBrevityAllowedCommand,
	stripEnvironmentPrefixes,
};
