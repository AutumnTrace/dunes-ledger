// The installed-app case: load once online, then lose the network for good, edit a run, quit
// the browser and start it again. The page must come from the service worker cache and the
// edit from IndexedDB. A persistent profile stands in for the player's browser profile, and
// the site's own server is shut down, so nothing can quietly come from the network.
import { chromium, expect, test } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../scripts/serve.mjs';
import { runRow } from './helpers';

test('a run edited offline is still there after the browser restarts', async () => {
	const profile = await mkdtemp(join(tmpdir(), 'dunes-ledger-profile-'));
	const server: { url: string; close: () => Promise<void> } = await startServer({ dir: 'build', port: 0 });
	const url = server.url;
	try {
		// First visit, online: the service worker installs and takes control.
		let context = await chromium.launchPersistentContext(profile, { viewport: { width: 1200, height: 900 } });
		let page = context.pages()[0] ?? (await context.newPage());
		await page.goto(url);
		await page.getByRole('button', { name: 'Load the synthetic sample' }).click();
		await expect(page.getByTestId('session-net')).toHaveText('120 chaos');
		await expect
			.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.state ?? 'none'))
			.toBe('activated');

		// The network goes away: the server stops and the browser is offline.
		await server.close();
		await context.setOffline(true);
		await expect(page.evaluate((u) => fetch(u).then(() => 'reached', () => 'unreachable'), `${url}?probe`)).resolves.toBe(
			'unreachable'
		);

		await runRow(page, 2).getByRole('button', { name: 'Edit map 2' }).click();
		await page.getByRole('form', { name: 'Edit map 2' }).getByLabel('Map cost').fill('9');
		await page.getByRole('button', { name: 'Save map 2' }).click();
		await expect(page.getByTestId('session-net')).toHaveText('116 chaos');
		await context.close();

		// The player starts the browser again, still offline, and opens the app.
		context = await chromium.launchPersistentContext(profile, { viewport: { width: 1200, height: 900 }, offline: true });
		page = context.pages()[0] ?? (await context.newPage());
		const response = await page.goto(url);
		expect(response?.fromServiceWorker()).toBe(true);
		await expect(page.getByTestId('session-net')).toHaveText('116 chaos');
		await expect(runRow(page, 2).locator('td').nth(3)).toHaveText('9');
		await context.close();
	} finally {
		await server.close().catch(() => {});
		await rm(profile, { recursive: true, force: true });
	}
});

test('the page links a web app manifest with installable icons', async ({ page, request }) => {
	await page.goto('./');
	const href = await page.locator('link[rel="manifest"]').getAttribute('href');
	expect(href).toBe('./manifest.webmanifest');
	const manifest = await (await request.get(new URL(href!, page.url()).href)).json();
	expect(manifest).toMatchObject({ display: 'standalone', start_url: './', scope: './' });
	const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
	expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
	for (const icon of manifest.icons) {
		const res = await request.get(new URL(icon.src, new URL(href!, page.url())).href);
		expect(res.status(), icon.src).toBe(200);
		expect(res.headers()['content-type']).toBe('image/png');
	}
});
