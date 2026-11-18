const crypto = require('crypto');
const fs = require('fs');
const fsPromises = fs.promises;
const https = require('https');
const os = require('os');
const path = require('path');
const tar = require('tar');
const yauzl = require('yauzl');
const { migrateRuntimeManifest } = require('./migrations');

const RTK_TAG = 'dev-1.3.0-rc.642';
const RTK_BINARY_VERSION = '0.49.0';
const BASE_URL = `https://github.com/rtk-ai/rtk/releases/download/${RTK_TAG}`;
const DOWNLOAD_TIMEOUT_MS = 30_000;
const MAX_ARCHIVE_BYTES = 30 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const PINNED_ARCHIVE_SHA256 = {
	'rtk-oss-aarch64-apple-darwin.tar.gz': '96618ed5ad7f3ddedbd6d1112aa6f2bfce598e4bc9ba7978d2c2ebbba687c9d8',
	'rtk-oss-aarch64-unknown-linux-musl.tar.gz': '3b7aecdc17276a9d96299a8d250f90503690e9f65d600d10e48303ac6c928c24',
	'rtk-oss-x86_64-apple-darwin.tar.gz': '49ab11517f0ad96b148080201034ad605a6f20b111a8c1233196eab78072e698',
	'rtk-oss-x86_64-pc-windows-msvc.zip': 'ed66e10701a5d8e50b890fe28c43c7d0a2267d090b9579ab634b8a2ce1ea220c',
	'rtk-oss-x86_64-unknown-linux-musl.tar.gz': '5dc4110f886e9b47e9380d3028d75ec266666bc70747f5aaf78572d8d2a48d71',
};

function isWslEnvironment(platform = process.platform, environment = process.env) {
	return platform === 'linux' && (
		typeof environment.WSL_INTEROP === 'string' ||
		typeof environment.WSL_DISTRO_NAME === 'string'
	);
}

function resolveRtkAsset(platform = process.platform, architecture = process.arch) {
	const targets = {
		'linux:x64': 'rtk-oss-x86_64-unknown-linux-musl.tar.gz',
		'linux:arm64': 'rtk-oss-aarch64-unknown-linux-musl.tar.gz',
		'darwin:x64': 'rtk-oss-x86_64-apple-darwin.tar.gz',
		'darwin:arm64': 'rtk-oss-aarch64-apple-darwin.tar.gz',
		'win32:x64': 'rtk-oss-x86_64-pc-windows-msvc.zip',
	};

	const asset = targets[`${platform}:${architecture}`];
	if (!asset) {
		return null;
	}

	return {
		asset,
		executableName: platform === 'win32' ? 'rtk.exe' : 'rtk',
		archiveType: asset.endsWith('.zip') ? 'zip' : 'tar',
		sha256: PINNED_ARCHIVE_SHA256[asset],
	};
}

function sha256(buffer) {
	return crypto.createHash('sha256').update(buffer).digest('hex');
}

function isTrustedDownloadRedirect(sourceUrl, redirectUrl) {
	let source;
	let redirect;
	try {
		source = new URL(sourceUrl);
		redirect = new URL(redirectUrl);
	} catch {
		return false;
	}
	if (redirect.protocol !== 'https:') {
		return false;
	}
	if (source.hostname === 'github.com') {
		return redirect.hostname === 'release-assets.githubusercontent.com';
	}
	if (source.hostname === 'release-assets.githubusercontent.com') {
		return redirect.hostname === 'release-assets.githubusercontent.com';
	}
	return false;
}

function parseChecksums(text) {
	const checksums = new Map();
	for (const line of text.split(/\r?\n/)) {
		const match = line.match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/);
		if (match) {
			checksums.set(match[2].trim(), match[1].toLowerCase());
		}
	}
	return checksums;
}

function safeFileName(name) {
	const normalized = name.replace(/\\/g, '/').replace(/^\.\/+/, '');
	if (
		normalized === '' ||
		normalized === '..' ||
		normalized.startsWith('../') ||
		path.posix.isAbsolute(normalized)
	) {
		throw new Error(`Unsafe archive entry: ${name}`);
	}
	return normalized;
}

function downloadUrl(url, { timeoutMs = DOWNLOAD_TIMEOUT_MS, redirectCount = 0 } = {}) {
	return new Promise((resolve, reject) => {
		if (redirectCount > MAX_REDIRECTS) {
			reject(new Error('Too many download redirects'));
			return;
	}

	let parsedUrl;
	try {
		parsedUrl = new URL(url);
	} catch {
		reject(new Error('Invalid RTK download URL'));
		return;
	}
	if (parsedUrl.protocol !== 'https:') {
		reject(new Error('RTK downloads must use HTTPS'));
		return;
	}

	const protocol = https;
		const request = protocol.get(url, { headers: { 'User-Agent': 'Brevity-VSCode' } }, (response) => {
			if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
				response.resume();
				const redirectUrl = new URL(response.headers.location, url).toString();
				if (!isTrustedDownloadRedirect(url, redirectUrl)) {
					reject(new Error('RTK download redirect is not trusted'));
					return;
				}
				resolve(downloadUrl(redirectUrl, {
					timeoutMs,
					redirectCount: redirectCount + 1,
				}));
				return;
			}

			if (response.statusCode !== 200) {
				response.resume();
				reject(new Error(`Download failed with HTTP ${response.statusCode}`));
				return;
			}

			const chunks = [];
			let size = 0;
			response.on('data', (chunk) => {
				size += chunk.length;
				if (size > MAX_ARCHIVE_BYTES) {
					request.destroy(new Error('RTK archive exceeds the allowed size'));
					return;
				}
				chunks.push(chunk);
			});
			response.on('end', () => resolve(Buffer.concat(chunks)));
			response.on('error', reject);
		});

		request.setTimeout(timeoutMs, () => {
			request.destroy(new Error('RTK download timed out'));
		});
		request.on('error', reject);
	});
}

async function extractZip(buffer, destination, executableName) {
	const archivePath = path.join(destination, '.rtk-download.zip');
	await fsPromises.writeFile(archivePath, buffer, { flag: 'wx', mode: 0o600 });

	await new Promise((resolve, reject) => {
		yauzl.open(archivePath, { lazyEntries: true }, (openError, zipFile) => {
			if (openError) {
				reject(openError);
				return;
			}

			zipFile.readEntry();
			zipFile.on('entry', (entry) => {
				try {
					const name = safeFileName(entry.fileName);
					if (/\/$/.test(entry.fileName)) {
						zipFile.readEntry();
						return;
					}

					const outputPath = path.join(destination, name);
					if (path.dirname(outputPath) !== destination) {
						reject(new Error(`Unsupported nested entry: ${entry.fileName}`));
						return;
					}
					if (name !== executableName && name !== 'LICENSE') {
						zipFile.readEntry();
						return;
					}

					zipFile.openReadStream(entry, (streamError, readStream) => {
						if (streamError) {
							reject(streamError);
							return;
						}
						const output = fs.createWriteStream(outputPath, { flags: 'wx', mode: name === executableName ? 0o700 : 0o600 });
						readStream.on('error', reject);
						output.on('error', reject);
						output.on('finish', () => zipFile.readEntry());
					});
				} catch (error) {
					reject(error);
				}
			});
			zipFile.on('end', resolve);
			zipFile.on('error', reject);
		});
	});

	await fsPromises.unlink(archivePath);
}

class RtkRuntimeManager {
	constructor({ storageDir, output = () => {}, environment = process.env }) {
		this.storageDir = storageDir;
		this.output = output;
		this.environment = environment;
		this.asset = resolveRtkAsset();
	}

	get rootDir() {
		return path.join(this.storageDir, 'rtk', RTK_TAG);
	}

	get executablePath() {
		return path.join(this.rootDir, this.asset ? this.asset.executableName : 'rtk');
	}

	async status() {
		if (!this.asset) {
			return { ready: false, message: 'RTK does not provide a supported binary for this platform.' };
		}

		try {
			await fsPromises.access(this.executablePath, fs.constants.R_OK);
			const manifest = await this.readManifest();
			if (
				manifest &&
				manifest.tag === RTK_TAG &&
				manifest.asset === this.asset.asset &&
				manifest.archiveSha256 === this.asset.sha256
			) {
				const executable = await fsPromises.readFile(this.executablePath);
				if (manifest.executableSha256 === sha256(executable)) {
					return { ready: true, message: `RTK ${RTK_BINARY_VERSION} is ready for Brevity.` };
				}
			}
		} catch {
			// The runtime has not been installed yet.
		}
		return { ready: false, message: 'The RTK runtime is not installed yet.' };
	}

	async readManifest() {
		try {
			return migrateRuntimeManifest(JSON.parse(
				await fsPromises.readFile(path.join(this.rootDir, 'manifest.json'), 'utf8'),
			));
		} catch {
			return null;
		}
	}

	async ensureRuntime() {
		if (!this.asset) {
			const message = 'RTK is unavailable for this platform; Brevity will pass commands through unchanged.';
			this.output(message);
			return { ok: false, message };
		}

		const existing = await this.status();
		if (existing.ready) {
			this.output(existing.message);
			return { ok: true, ...existing };
		}

		let archive;
		try {
			archive = await this.downloadWithRetry(`${BASE_URL}/${this.asset.asset}`);
		} catch (error) {
			const message = `RTK setup failed: ${error.message}. Brevity will pass commands through unchanged.`;
			this.output(message);
			return { ok: false, message };
		}

		const checksum = this.asset.sha256;
		if (!checksum || sha256(archive) !== checksum) {
			const message = 'RTK setup failed: archive checksum mismatch. Brevity will pass commands through unchanged.';
			this.output(message);
			return { ok: false, message };
		}

		await fsPromises.mkdir(this.rootDir, { recursive: true });
		const stagingDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'brevity-rtk-'));

		try {
			if (this.asset.archiveType === 'zip') {
				await extractZip(archive, stagingDir, this.asset.executableName);
			} else {
				const archivePath = path.join(stagingDir, '.rtk-download.tar.gz');
				await fsPromises.writeFile(archivePath, archive, { flag: 'wx', mode: 0o600 });
				await tar.x({
					cwd: stagingDir,
					file: archivePath,
					onentry: (entry) => {
						safeFileName(entry.path);
						if (!['rtk', 'LICENSE'].includes(entry.path)) {
							throw new Error(`Unexpected RTK archive entry: ${entry.path}`);
						}
						if (entry.type !== 'File') {
							throw new Error(`Unsafe RTK archive entry type: ${entry.path}`);
						}
					},
				});
			}

			const executable = path.join(stagingDir, this.asset.executableName);
			await fsPromises.access(executable, fs.constants.R_OK);
			if (process.platform !== 'win32') {
				await fsPromises.chmod(executable, 0o700);
			}

			await fsPromises.mkdir(this.rootDir, { recursive: true });
			await fsPromises.copyFile(executable, this.executablePath);
			const extractedLicense = path.join(stagingDir, 'LICENSE');
			await fsPromises.copyFile(extractedLicense, path.join(this.rootDir, 'LICENSE'));

			const manifest = {
				schemaVersion: 1,
				tag: RTK_TAG,
				binaryVersion: RTK_BINARY_VERSION,
				asset: this.asset.asset,
				executableSha256: sha256(await fsPromises.readFile(this.executablePath)),
				archiveSha256: checksum,
				verificationSource: 'bundled-pinned-sha256',
			};
			await fsPromises.writeFile(
				path.join(this.rootDir, 'manifest.json'),
				JSON.stringify(manifest, null, 2),
				{ mode: 0o600 },
			);

			const message = `RTK ${RTK_BINARY_VERSION} is ready for Brevity.`;
			this.output(message);
			return { ok: true, executablePath: this.executablePath, message };
		} catch (error) {
			const message = `RTK setup failed: ${error.message}. Brevity will pass commands through unchanged.`;
			this.output(message);
			return { ok: false, message };
		} finally {
			await fsPromises.rm(stagingDir, { recursive: true, force: true });
		}
	}

	async downloadWithRetry(url, retries = 3) {
		let lastError;
		for (let attempt = 0; attempt < retries; attempt += 1) {
			try {
				return await downloadUrl(url);
			} catch (error) {
				lastError = error;
				if (attempt < retries - 1) {
					await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
				}
			}
		}
		throw lastError;
	}
}

module.exports = {
	RtkRuntimeManager,
	RTK_TAG,
	RTK_BINARY_VERSION,
	resolveRtkAsset,
	isWslEnvironment,
	parseChecksums,
	sha256,
	safeFileName,
	PINNED_ARCHIVE_SHA256,
	downloadUrl,
	isTrustedDownloadRedirect,
};
