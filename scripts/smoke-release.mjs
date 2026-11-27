// Smoke-tests the packaged release, the way someone downloading it would use it.
//
//   npm run release && npm run release:smoke
//
// 1. Every asset matches SHA256SUMS.txt.
// 2. The site ZIP, unpacked and served from a sub-folder, imports the released sample JSON and
//    shows 120 chaos net, 2 chaos per typical map and 144 chaos per hour; the best map opens on
//    the Divine Orb. Then the server stops, the browser goes offline, and a reload still shows
//    the session (service worker + IndexedDB).
// 3. The hosted-demo ZIP, served at its base path, loads the bundled sample.
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { startServer } from './serve.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const releaseDir = join(root, 'release');
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const pagesBase = (process.env.PAGES_BASE ?? '/dunes-ledger').replace(/\/+$/, '');

let failures = 0;
/** @param {string} what @param {boolean} ok @param {string} [detail] */
function check(what, ok, detail = '') {
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${detail ? `  (${detail})` : ''}`);
	if (!ok) failures++;
}

/** @param {import('@playwright/test').Locator} locator @param {string} expected */
async function textOf(locator, expected, timeout = 10_000) {
	const deadline = Date.now() + timeout;
	let last = '';
	while (Date.now() < deadline) {
		last = ((await locator.textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();
		if (last.includes(expected)) return last;
		await new Promise((r) => setTimeout(r, 100));
	}
	return last;
}

/** @param {string} zipPath @param {string} into */
async function unzip(zipPath, into) {
	const files = unzipSync(new Uint8Array(await readFile(zipPath)));
	for (const [name, data] of Object.entries(files)) {
		if (name.endsWith('/')) continue;
		const target = join(into, name);
		await mkdir(dirname(target), { recursive: true });
		await writeFile(target, data);
	}
	return Object.keys(files);
}

// 1. Checksums -----------------------------------------------------------------------------
const sums = (await readFile(join(releaseDir, 'SHA256SUMS.txt'), 'utf8')).trim().split('\n');
check('SHA256SUMS.txt lists three assets', sums.length === 3, sums.map((l) => l.split('  ')[1]).join(', '));
for (const line of sums) {
	const [hash, name] = line.split('  ');
	const actual = createHash('sha256').update(await readFile(join(releaseDir, name))).digest('hex');
	check(`checksum of ${name}`, actual === hash);
}

const temp = await mkdtemp(join(tmpdir(), 'dunes-ledger-smoke-'));
const browser = await chromium.launch();
try {
	// 2. Site ZIP from a sub-folder, then offline --------------------------------------------
	const siteNames = await unzip(join(releaseDir, `dunes-ledger-${version}-site.zip`), join(temp, 'site'));
	const siteRoot = join(temp, 'site', `dunes-ledger-${version}`);
	for (const file of ['index.html', 'service-worker.js', 'manifest.webmanifest', 'icons/icon-512.png']) {
		check(`site ZIP contains dunes-ledger-${version}/${file}`, existsSync(join(siteRoot, file)));
	}
	check('site ZIP has one top-level folder', siteNames.every((n) => n.startsWith(`dunes-ledger-${version}/`)));

	const server = await startServer({ dir: siteRoot, port: 0, mount: '/smoke/any-folder/' });
	const context = await browser.newContext();
	const page = await context.newPage();
	/** @type {string[]} */
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto(server.url);
	await page.getByTestId('import-input').setInputFiles(join(releaseDir, 'synthetic-dunes-session.json'));
	check('released sample imports', (await textOf(page.getByTestId('import-status'), 'Added the session')).includes('Added the session'));
	const net = await textOf(page.getByTestId('session-net'), '120 chaos');
	check('session net is 120 chaos', net === '120 chaos', net);
	const median = await textOf(page.getByTestId('median-net'), '2 chaos');
	check('typical map (median net) is 2 chaos', median === '2 chaos', median);
	const rate = await textOf(page.getByTestId('fact-rate'), '144 chaos/hour');
	check('session rate is 144 chaos/hour', rate === '144 chaos/hour', rate);
	await page.getByTestId('best-map').click();
	const verdict = await textOf(page.getByTestId('best-verdict'), 'Divine Orb ×1');
	check('best map opens on the Divine Orb', verdict.includes('Largest drop: Divine Orb ×1, worth 100 chaos'));

	await page.waitForFunction(() => navigator.serviceWorker.controller?.state === 'activated', null, { timeout: 15_000 });
	await server.close();
	await context.setOffline(true);
	await page.reload();
	const offline = await textOf(page.getByTestId('session-net'), '120 chaos');
	check('reload with the server stopped and the browser offline still shows the session', offline === '120 chaos', offline);
	check('no page errors', errors.length === 0, errors.join(' | '));
	await context.close();

	// 3. Hosted-demo ZIP at its base path ------------------------------------------------------
	await unzip(join(releaseDir, `dunes-ledger-${version}-pages.zip`), join(temp, 'pages'));
	check('pages ZIP contains .nojekyll and index.html at its root', existsSync(join(temp, 'pages', '.nojekyll')) && existsSync(join(temp, 'pages', 'index.html')));
	const pages = await startServer({ dir: join(temp, 'pages'), port: 0, mount: `${pagesBase}/` });
	const demo = await browser.newPage();
	await demo.goto(pages.url);
	await demo.getByRole('button', { name: 'Load the synthetic sample' }).click();
	const demoNet = await textOf(demo.getByTestId('session-net'), '120 chaos');
	check(`hosted build at ${pages.url} loads the bundled sample`, demoNet === '120 chaos', demoNet);
	await pages.close();
} finally {
	await browser.close();
	await rm(temp, { recursive: true, force: true });
}

if (failures > 0) {
	console.error(`\n${failures} check(s) failed`);
	process.exit(1);
}
console.log('\nRelease smoke test passed.');
