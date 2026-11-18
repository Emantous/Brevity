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
	const raw = await runCommand(commandArgs[0], commandArgs.slice(1), {
		cwd: directory,
		...options,
	});
	const filtered = await runCommand(rtk, commandArgs, {
		cwd: directory,
		...options,
	});

	const rawText = `${raw.stdout}${raw.stderr}`;
	const filteredText = `${filtered.stdout}${filtered.stderr}`;
	const successPreserved = raw.status === filtered.status;
	const taskCriticalDetailPreserved =
		options.detailCheck ? options.detailCheck(rawText, filteredText) : true;

	return {
		name,
		rawCharacters: rawText.length,
		filteredCharacters: filteredText.length,
		rawTokens: estimateTokens(rawText),
		filteredTokens: estimateTokens(filteredText),
		reductionPercent: reduction(rawText, filteredText),
		successPreserved,
		taskCriticalDetailPreserved,
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
		await runCommand('git', ['add', 'history.txt'], { cwd: directory });
		await runCommand('git', ['commit', '-qm', 'pilot commit 0'], { cwd: directory });
		for (let index = 1; index <= 12; index += 1) {
			await fsPromises.appendFile(path.join(directory, 'history.txt'), `${index}\n`);
			await runCommand('git', ['add', 'history.txt'], { cwd: directory });
			await runCommand('git', ['commit', '-qm', `pilot commit ${index}`], { cwd: directory });
		}

		const cases = [];
		cases.push(await pilotCase(rtk, directory, 'git status', ['git', 'status'], {
			detailCheck: (raw, filtered) =>
				raw.includes('untracked.txt') && filtered.includes('untracked.txt'),
		}));
		cases.push(await pilotCase(rtk, directory, 'git log', ['git', 'log', '--oneline', '-10'], {
			detailCheck: (raw, filtered) =>
				raw.includes('pilot commit') && filtered.length > 0,
		}));
		await fsPromises.appendFile(
			path.join(directory, 'history.txt'),
			Array.from({ length: 100 }, (_, index) => `diff line ${index}\n`).join(''),
		);
		cases.push(await pilotCase(rtk, directory, 'git diff', ['git', 'diff', '--', 'history.txt'], {
			detailCheck: (raw, filtered) =>
				raw.includes('history.txt') && filtered.includes('history.txt'),
		}));

		const totals = cases.reduce((result, item) => ({
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
		const classifiedCorrectly = cases.every((item) => item.successPreserved);
		const detailsPreserved = cases.every((item) => item.taskCriticalDetailPreserved);
		const passed = totalReduction >= TARGET_REDUCTION_PERCENT &&
			classifiedCorrectly &&
			detailsPreserved;

		console.log(JSON.stringify({
			rtkTag: RTK_TAG,
			cases,
			totals,
			totalReductionPercent: totalReduction,
			targetReductionPercent: TARGET_REDUCTION_PERCENT,
			successStatusPreserved: classifiedCorrectly,
			taskCriticalDetailsPreserved: detailsPreserved,
			passed,
		}, null, 2));

		if (!passed) {
			process.exitCode = 2;
		}
	});
}

main().catch((error) => {
	console.error(error.message);
	process.exit(1);
});
