// Records docs/media/outlier-drilldown.gif from the production build in Chromium.
//
//   npm run build && npm run record
//
// Every frame is a screenshot of the running app. The only thing drawn on top is a mouse
// pointer at the element about to be clicked, because headless screenshots have no cursor.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { startServer } from './serve.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'docs', 'media');
const W = 1100;
const H = 760;

const pointer = Buffer.from(`
	<svg xmlns="http://www.w3.org/2000/svg" width="26" height="34" viewBox="0 0 26 34">
		<path d="M2 2 L2 27 L8.5 21 L13 31.5 L17.5 29.5 L13 19.5 L22 19.5 Z" fill="#ffffff" stroke="#111111" stroke-width="2" stroke-linejoin="round"/>
	</svg>`);

const server = await startServer({ dir: join(root, 'build'), port: 0 });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });

/** @type {{ png: Buffer, delay: number }[]} */
const frames = [];

/** @param {number} delay @param {import('@playwright/test').Locator} [target] */
async function frame(delay, target) {
	await page.waitForTimeout(120);
	let png = await page.screenshot();
	if (target) {
		const box = await target.boundingBox();
		if (box) {
			const left = Math.round(Math.min(W - 26, box.x + Math.min(box.width * 0.35, 140)));
			const top = Math.round(Math.min(H - 34, box.y + box.height * 0.55));
			png = await sharp(png).composite([{ input: pointer, left, top }]).png().toBuffer();
		}
	}
	frames.push({ png, delay });
}

try {
	await page.goto(server.url);
	const load = page.getByRole('button', { name: 'Load the synthetic sample' });
	await load.waitFor();
	await frame(1400);
	await frame(900, load);
	await load.click();
	await page.getByTestId('session-net').waitFor();
	await page.mouse.move(0, 0);
	await frame(3200);

	const best = page.getByTestId('best-map');
	await best.scrollIntoViewIfNeeded();
	await page.evaluate(() => window.scrollBy(0, 160));
	await frame(700);
	await frame(1100, best);
	await best.click();
	await page.getByTestId('best-detail').waitFor();
	await frame(900, best);

	// Bring the whole detail into view in a few steps, then hold on the explanation.
	const target = await page.evaluate(() => {
		const el = document.getElementById('best-detail');
		if (!el) return window.scrollY;
		const rect = el.getBoundingClientRect();
		return Math.max(0, window.scrollY + rect.bottom - window.innerHeight + 24);
	});
	const start = await page.evaluate(() => window.scrollY);
	for (const t of [0.35, 0.7, 1]) {
		await page.evaluate((y) => window.scrollTo(0, y), Math.round(start + (target - start) * t));
		await frame(t === 1 ? 5200 : 160);
	}

	await mkdir(out, { recursive: true });
	const gif = await sharp(
		frames.map((f) => f.png),
		{ join: { animated: true } }
	)
		.gif({ delay: frames.map((f) => f.delay), loop: 0, effort: 8, colours: 96, dither: 0 })
		.toBuffer();
	await writeFile(join(out, 'outlier-drilldown.gif'), gif);
	console.log(`outlier-drilldown.gif: ${frames.length} frames, ${(gif.length / 1024).toFixed(0)} KiB`);
} finally {
	await browser.close();
	await server.close();
}
