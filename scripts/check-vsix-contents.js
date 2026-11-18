const yauzl = require('yauzl');
const path = require('path');

const archivePath = path.resolve(process.argv[2] || 'brevity.vsix');

function isForbidden(entryName) {
	const name = entryName.replace(/\\/g, '/');
	const base = name.split('/').pop();
	return (
		name.includes('/node_modules/') ||
		name.includes('/.vscode-test/') ||
		name.includes('/test/') ||
		name.includes('/scripts/') ||
		name.includes('/docs/') ||
		name.includes('/.github/') ||
		name.endsWith('/.env') ||
		name.endsWith('/.env.local') ||
		name.endsWith('/.gitignore') ||
		base === 'rtk' ||
		base === 'rtk.exe'
	);
}

yauzl.open(archivePath, { lazyEntries: true }, (openError, zipFile) => {
	if (openError) {
		console.error(openError.message);
		process.exit(1);
	}

	const forbidden = [];
	let hasPackageJson = false;
	let hasExtensionEntry = false;

	zipFile.readEntry();
	zipFile.on('entry', (entry) => {
		if (entry.fileName === 'extension/package.json') {
			hasPackageJson = true;
		}
		if (entry.fileName === 'extension/extension.js') {
			hasExtensionEntry = true;
		}
		if (isForbidden(entry.fileName)) {
			forbidden.push(entry.fileName);
		}
		zipFile.readEntry();
	});
	zipFile.on('end', () => {
		if (!hasPackageJson || !hasExtensionEntry) {
			console.error('VSIX is missing required extension/package.json or extension/extension.js');
			process.exit(1);
		}
		if (forbidden.length > 0) {
			console.error(`Forbidden VSIX entries:\n${forbidden.join('\n')}`);
			process.exit(1);
		}
		console.log('VSIX contents policy passed');
	});
	zipFile.on('error', (error) => {
		console.error(error.message);
		process.exit(1);
	});
});
