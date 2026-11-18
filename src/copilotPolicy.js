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
	'run',
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

const SHELL_SENSITIVE_PATTERN =
	/(?:&&|\|\||;|\||`|\$\(|<<|>>|>|<|[\r\n]|\b(?:sudo|su|doas)\b)/;

function stripEnvironmentPrefixes(command) {
	let result = command.trim();
	while (/^(?:[A-Za-z_][A-Za-z0-9_]*)=[^\s]+\s+/.test(result)) {
		result = result.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*)=[^\s]+\s+/, '');
	}
	return result;
}

function extractCommand(command) {
	const stripped = stripEnvironmentPrefixes(command);
	const parts = stripped.split(/\s+/);
	if (parts.length === 0) {
		return null;
	}
	return {
		stripped,
		executable: pathBaseName(parts[0]).toLowerCase(),
		subcommand: parts[1] ? parts[1].toLowerCase() : null,
	};
}

function pathBaseName(value) {
	return value.replace(/\\/g, '/').split('/').pop();
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
	if (SHELL_SENSITIVE_PATTERN.test(command)) {
		return false;
	}
	if (matchesPattern(command, options.excludePatterns)) {
		return false;
	}
	if (matchesPattern(command, ['rtk ', 'rtk bypass'])) {
		return false;
	}

	const extracted = extractCommand(command);
	if (!extracted) {
		return false;
	}

	const allowlist = options.allowlist || DEFAULT_COMMAND_ALLOWLIST;
	if (!allowlist.includes(extracted.executable)) {
		return false;
	}

	if (extracted.executable === 'git') {
		return GIT_SAFE_SUBCOMMANDS.has(extracted.subcommand);
	}
	if (extracted.executable === 'cargo') {
		return BUILD_SUBCOMMANDS.has(extracted.subcommand);
	}
	if (['npm', 'pnpm', 'yarn'].includes(extracted.executable)) {
		return BUILD_SUBCOMMANDS.has(extracted.subcommand);
	}
	return false;
}

module.exports = {
	DEFAULT_COMMAND_ALLOWLIST,
	GIT_SAFE_SUBCOMMANDS,
	BUILD_SUBCOMMANDS,
	extractCommand,
	matchesPattern,
	isBrevityAllowedCommand,
	stripEnvironmentPrefixes,
};
