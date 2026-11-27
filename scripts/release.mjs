// Builds the release assets into release/:
//
//   dunes-ledger-<version>-site.zip    the app with relative links: unzip and serve the folder
//                                      from any static server, at the root or in a sub-folder
//   dunes-ledger-<version>-pages.zip   the hosted-demo build for https://<user>.github.io/dunes-ledger/
//                                      (base path from PAGES_BASE, default /dunes-ledger), with .nojekyll
//   synthetic-dunes-session.json       the bundled synthetic sample, importable as is
//   SHA256SUMS.txt                     checksums of the three files above
//
//   npm run release            (the tag workflow runs exactly this, then npm run release:smoke)
//
// The app version is pinned to "<version>-<commit>" and zip timestamps to the commit time, so
// building the same commit twice gives identical archives.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const version = pkg.version;
const pagesBase = (process.env.PAGES_BASE ?? '/dunes-ledger').replace(/\/+$/, '');
const releaseDir = join(root, 'release');
const workDir = join(root, 'build-release');

const notes = join(root, 'docs', 'releases', `v${version}.md`);
if (!existsSync(notes)) throw new Error(`Missing release notes: docs/releases/v${version}.md`);

const git = (/** @type {string[]} */ ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const commit = git('rev-parse', '--short=12', 'HEAD');
const commitSeconds = Number(git('log', '-1', '--format=%ct'));
const dirty = git('status', '--porcelain', '--untracked-files=no') !== '';
if (dirty) console.warn('warning: the working tree has uncommitted changes; the assets will not match the commit.');

// DOS zip timestamps are local time; give every machine the same fields by using the commit's
// UTC clock reading as the local one.
const c = new Date(commitSeconds * 1000);
const zipTime = new Date(c.getUTCFullYear(), c.getUTCMonth(), c.getUTCDate(), c.getUTCHours(), c.getUTCMinutes(), c.getUTCSeconds());

/** @param {string} outDir @param {string} base */
function build(outDir, base) {
	execFileSync(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--logLevel', 'warn'], {
		cwd: root,
		stdio: 'inherit',
		env: { ...process.env, BASE_PATH: base, BUILD_DIR: outDir, APP_VERSION: `${version}-${commit}` }
	});
}

/** @param {string} dir @returns {Promise<string[]>} */
async function listFiles(dir) {
	const out = [];
	for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
		if (entry.isFile()) out.push(join(entry.parentPath, entry.name));
	}
	return out.sort();
}

/** @param {string} dir @param {string} prefix */
async function zipDir(dir, prefix) {
	/** @type {Record<string, [Uint8Array, { mtime: Date, level: 9 }]>} */
	const entries = {};
	for (const file of await listFiles(dir)) {
		const name = prefix + relative(dir, file).split(sep).join('/');
		entries[name] = [new Uint8Array(await readFile(file)), { mtime: zipTime, level: 9 }];
	}
	return zipSync(entries);
}

const sha256 = (/** @type {Uint8Array} */ data) => createHash('sha256').update(data).digest('hex');

await rm(releaseDir, { recursive: true, force: true });
await rm(workDir, { recursive: true, force: true });
await mkdir(releaseDir, { recursive: true });

console.log(`Building dunes-ledger ${version} (${commit})`);
const siteDir = join(workDir, 'site');
const pagesDir = join(workDir, 'pages');
build(siteDir, '');
build(pagesDir, pagesBase);
await writeFile(join(pagesDir, '.nojekyll'), '');

const assets = [
	[`dunes-ledger-${version}-site.zip`, await zipDir(siteDir, `dunes-ledger-${version}/`)],
	[`dunes-ledger-${version}-pages.zip`, await zipDir(pagesDir, '')],
	['synthetic-dunes-session.json', new Uint8Array(await readFile(join(root, 'samples', 'synthetic-dunes-session.json')))]
];

const sums = [];
for (const [name, data] of assets) {
	await writeFile(join(releaseDir, /** @type {string} */ (name)), /** @type {Uint8Array} */ (data));
	sums.push(`${sha256(/** @type {Uint8Array} */ (data))}  ${name}`);
}
await writeFile(join(releaseDir, 'SHA256SUMS.txt'), `${sums.join('\n')}\n`);

for (const name of await readdir(releaseDir)) {
	const { size } = await stat(join(releaseDir, name));
	console.log(`  release/${name}  ${(size / 1024).toFixed(1)} KiB`);
}
console.log(sums.join('\n'));
