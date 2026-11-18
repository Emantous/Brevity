const fs = require('fs');
const fsPromises = fs.promises;
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const {
	resolveRtkAsset,
	PINNED_ARCHIVE_SHA256,
	downloadUrl,
	sha256,
} = require('../src/rtkRuntime');

const execFileAsync = promisify(execFile);
const RTK_TAG = 'dev-1.3.0-rc.642';
const BASE_URL = `https://github.com/rtk-ai/rtk/releases/download/${RTK_TAG}`;
const TARGET_REDUCTION_PERCENT = 50;
const REPORT_VERSION = 1;

async function withTemporaryDirectory(prefix, callback) {
	const directory = await fsPromises.mkdtemp(path.join(os.tmpdir(), prefix));
	try {
		return await callback(directory);
	} finally {
		await fsPromises.rm(directory, { recursive: true, force: true });
	}
}

async function runCommand(command, args, options = {}) {
	try {
		const result = await execFileAsync(command, args, {
			encoding: 'utf8',
			timeout: 15_000,
			...options,
		});
		return {
			status: 0,
			stdout: result.stdout || '',
			stderr: result.stderr || '',
		};
	} catch (error) {
		return {
			status: typeof error.code === 'number' ? error.code : 1,
			stdout: error.stdout || '',
			stderr: error.stderr || '',
		};
	}
}

async function downloadAndVerifyRtk(directory) {
	const asset = resolveRtkAsset();
	if (!asset) {
		throw new Error(`Unsupported pilot platform: ${process.platform}/${process.arch}`);
	}

	const archive = await downloadUrl(`${BASE_URL}/${asset.asset}`);
	const actualHash = sha256(archive);
	if (actualHash !== PINNED_ARCHIVE_SHA256[asset.asset]) {
		throw new Error('RTK pilot archive checksum mismatch');
	}

	const archivePath = path.join(directory, asset.asset);
	await fsPromises.writeFile(archivePath, archive, { mode: 0o600 });

	if (asset.archiveType === 'zip') {
		throw new Error('The pilot currently requires a tar-based RTK asset');
	}

	const tar = require('tar');
	await tar.x({ cwd: directory, file: archivePath });
	const executable = path.join(directory, asset.executableName);
	await fsPromises.chmod(executable, 0o700);
	return executable;
}

function estimateTokens(text) {
	return Math.ceil(text.length / 4);
}

function reduction(raw, filtered) {
	if (raw.length === 0) {
		return 0;
	}
	return Math.round((1 - filtered.length / raw.length) * 100);
}

async function pilotCase(rtk, directory, name, commandArgs, options = {}) {
	const {
		detailCheck,
		family = 'other',
		enabled = true,
		thresholdPercent = 0,
		...commandOptions
	} = options;
	const raw = await runCommand(commandArgs[0], commandArgs.slice(1), {
		cwd: directory,
		...commandOptions,
	});
	const filtered = await runCommand(rtk, commandArgs, {
		cwd: directory,
		...commandOptions,
	});

	const rawText = `${raw.stdout}${raw.stderr}`;
	const filteredText = `${filtered.stdout}${filtered.stderr}`;
	const successPreserved = raw.status === filtered.status;
	const taskCriticalDetailPreserved =
		detailCheck ? detailCheck(rawText, filteredText) : true;
	const reductionPercent = reduction(rawText, filteredText);

	return {
		name,
		family,
		command: commandArgs.join(' '),
		enabled,
		thresholdPercent,
		rawCharacters: rawText.length,
		filteredCharacters: filteredText.length,
		rawTokens: estimateTokens(rawText),
		filteredTokens: estimateTokens(filteredText),
		reductionPercent,
		successPreserved,
		taskCriticalDetailPreserved,
		passed: successPreserved && taskCriticalDetailPreserved &&
			(!enabled || reductionPercent >= thresholdPercent),
	};
}

async function main() {
	if (process.platform === 'win32') {
		throw new Error('The first pilot report is intended for tar-based Linux or macOS hosts');
	}

	await withTemporaryDirectory('brevity-pilot-', async (directory) => {
		const rtk = await downloadAndVerifyRtk(directory);

		await runCommand('git', ['init', '-q'], { cwd: directory });
		await runCommand('git', ['config', 'user.email', 'pilot@example.invalid'], { cwd: directory });
		await runCommand('git', ['config', 'user.name', 'Brevity Pilot'], { cwd: directory });
		await fsPromises.writeFile(path.join(directory, 'history.txt'), '');
		await fsPromises.writeFile(path.join(directory, 'untracked.txt'), 'leave this file untracked\n');
		await fsPromises.writeFile(path.join(directory, 'package.json'), JSON.stringify({
			private: true,
			scripts: {
				test: 'node -e "console.log(\'PASS test suite\'); console.log(\'2 tests passed\')"',
				'test:fail': 'node -e "console.error(\'FAIL example.test.js:4\'); process.exit(1)"',
				build: 'node -e "console.log(\'build complete\'); console.log(\'0 errors\')"',
			},
		}));
		await runCommand('git', ['add', 'history.txt'], { cwd: directory });
		await runCommand('git', ['commit', '-qm', 'pilot commit 0'], { cwd: directory });
		for (let index = 1; index <= 12; index += 1) {
			await fsPromises.appendFile(path.join(directory, 'history.txt'), `${index}\n`);
			await runCommand('git', ['add', 'history.txt'], { cwd: directory });
			await runCommand('git', ['commit', '-qm', `pilot commit ${index}`], { cwd: directory });
		}

		const cases = [];
		cases.push(await pilotCase(rtk, directory, 'git status', ['git', 'status'], {
			family: 'git',
			thresholdPercent: TARGET_REDUCTION_PERCENT,
			detailCheck: (raw, filtered) =>
				raw.includes('untracked.txt') && filtered.includes('untracked.txt'),
		}));
		cases.push(await pilotCase(rtk, directory, 'git log', ['git', 'log', '--oneline', '-10'], {
			family: 'git',
			enabled: false,
			detailCheck: (raw, filtered) =>
				raw.includes('pilot commit') && filtered.length > 0,
		}));
		await fsPromises.appendFile(
			path.join(directory, 'history.txt'),
			Array.from({ length: 100 }, (_, index) => `diff line ${index}\n`).join(''),
		);
		cases.push(await pilotCase(rtk, directory, 'git diff', ['git', 'diff', '--', 'history.txt'], {
			family: 'git',
			enabled: false,
			detailCheck: (raw, filtered) =>
				raw.includes('history.txt') && filtered.includes('history.txt'),
		}));
		cases.push(await pilotCase(rtk, directory, 'npm test (passing)', ['npm', 'test'], {
			family: 'test',
			thresholdPercent: 0,
			detailCheck: (raw, filtered) =>
				raw.includes('2 tests passed') && filtered.includes('2 tests passed'),
		}));
		cases.push(await pilotCase(rtk, directory, 'npm test (failing)', ['npm', 'run', 'test:fail'], {
			family: 'test',
			thresholdPercent: 0,
			detailCheck: (raw, filtered) =>
				raw.includes('FAIL example.test.js:4') && filtered.includes('FAIL example.test.js:4'),
		}));
		cases.push(await pilotCase(rtk, directory, 'npm build', ['npm', 'run', 'build'], {
			family: 'build',
			thresholdPercent: 0,
			detailCheck: (raw, filtered) =>
				raw.includes('build complete') && filtered.includes('build complete'),
		}));

		const enabledCases = cases.filter((item) => item.enabled);
		const totals = enabledCases.reduce((result, item) => ({
			rawCharacters: result.rawCharacters + item.rawCharacters,
			filteredCharacters: result.filteredCharacters + item.filteredCharacters,
			rawTokens: result.rawTokens + item.rawTokens,
			filteredTokens: result.filteredTokens + item.filteredTokens,
		}), { rawCharacters: 0, filteredCharacters: 0, rawTokens: 0, filteredTokens: 0 });

		const totalReduction = totals.rawCharacters === 0
			? 0
			: reduction(
				'a'.repeat(totals.rawCharacters),
				'a'.repeat(totals.filteredCharacters),
			);
		const classifiedCorrectly = enabledCases.every((item) => item.successPreserved);
		const detailsPreserved = enabledCases.every((item) => item.taskCriticalDetailPreserved);
		const passed = enabledCases.length > 0 &&
			enabledCases.every((item) => item.passed);
		const report = {
			reportVersion: REPORT_VERSION,
			rtkTag: RTK_TAG,
			generatedAt: new Date().toISOString(),
			cases,
			totals,
			totalReductionPercent: totalReduction,
			targetReductionPercent: TARGET_REDUCTION_PERCENT,
			targetReductionAppliesTo: 'git status',
			successStatusPreserved: classifiedCorrectly,
			taskCriticalDetailsPreserved: detailsPreserved,
			passed,
		};
		const reportPath = process.env.BREVITY_BENCHMARK_REPORT ||
			path.join(process.cwd(), 'benchmark-report.json');
		await fsPromises.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
			encoding: 'utf8',
			mode: 0o600,
		});
		console.log(JSON.stringify(report, null, 2));

		if (!passed) {
			process.exitCode = 2;
		}
	});
}

main().catch((error) => {
	console.error(error.message);
	process.exit(1);
});
