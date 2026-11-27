import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { addLine, fixturePath, importFile, loadSample, open, runRow, samplePath, startSession } from './helpers';

test('the sample answers both questions and explains the best map in one click', async ({ page }) => {
	await loadSample(page);
	await expect(page.getByTestId('synthetic-note')).toContainText('not observed drop rates');
	await expect(page.getByTestId('session-net')).toHaveText('120 chaos');
	await expect(page.getByTestId('median-net')).toHaveText('2 chaos');
	await expect(page.getByTestId('fact-gross')).toHaveText('170 chaos');
	await expect(page.getByTestId('fact-costs')).toHaveText('50 chaos');
	await expect(page.getByTestId('fact-minutes')).toHaveText('50 min');
	await expect(page.getByTestId('fact-rate')).toHaveText('144 chaos/hour');
	await expect(page.getByTestId('fact-currency')).toHaveText('chaos');

	const best = page.getByTestId('best-map');
	await expect(best).toHaveText(/Map #7: \+102 chaos net, 100 above the typical map/);
	await expect(page.getByTestId('best-detail')).toBeHidden();
	await best.click();
	const detail = page.getByTestId('best-detail');
	await expect(detail).toBeVisible();
	await expect(detail.locator('tr.top')).toHaveText(/Divine Orb\s*1\s*100\s*100/);
	await expect(page.getByTestId('best-verdict')).toContainText('Largest drop: Divine Orb ×1, worth 100 chaos');
	await expect(page.getByTestId('best-verdict')).toContainText('would have netted 2 chaos');
	await expect(runRow(page, 7)).toHaveClass(/best/);
});

test('maps are finished from the keyboard and the previous map cost is reused', async ({ page }) => {
	await startSession(page);
	const current = page.getByRole('region', { name: /Current map/ });
	await expect(current.getByText('First map of the session.')).toBeVisible();
	await current.getByLabel('Map cost').fill('5');
	await current.getByLabel('Minutes').fill('4');
	await addLine(page, 'Chaos Orb', '3', '1');
	await addLine(page, 'Orb of Alchemy', '4', '0,5');
	await current.getByLabel('Item').press('Control+Enter');

	await expect(page.getByTestId('announcement')).toHaveText('Map 1 saved, net +0 chaos.');
	await expect(current.getByRole('heading')).toHaveText(/Current map #2/);
	// The next map starts with the same cost, and the minutes field is back on the timer.
	await expect(current.getByLabel('Map cost')).toHaveValue('5');
	await expect(current.getByText('Same as the previous map.')).toBeVisible();
	await expect(current.getByLabel('Minutes')).toHaveValue('');
	await expect(current.getByLabel('Item')).toBeFocused();

	await current.getByLabel('Minutes').fill('6');
	await addLine(page, 'Chaos Orb', '12', '1');
	await current.getByLabel('Minutes').press('Control+Enter');

	await expect(page.getByTestId('runs-table').locator('tbody > tr[data-run-id]')).toHaveCount(2);
	await expect(page.getByTestId('session-net')).toHaveText('7 chaos');
	// Median of 0 and 7 over an even count of two maps.
	await expect(page.getByTestId('median-net')).toHaveText('3.5 chaos');
	await expect(page.getByTestId('fact-minutes')).toHaveText('10 min');
	await expect(page.getByTestId('fact-rate')).toHaveText('42 chaos/hour');
});

test('an unknown price is counted and qualifies the totals; an explicit zero stays zero', async ({ page }) => {
	await startSession(page);
	const current = page.getByRole('region', { name: /Current map/ });
	await current.getByLabel('Map cost').fill('5');
	await current.getByLabel('Minutes').fill('5');
	await addLine(page, 'Chaos Orb', '10', '1');
	await addLine(page, 'Unidentified jewel', '2');
	await addLine(page, 'Portal Scroll', '20', '0');
	const draft = current.getByRole('table', { name: 'Loot on this map' });
	await expect(draft.getByRole('row', { name: /Unidentified jewel/ })).toContainText('unknown');
	await expect(draft.getByRole('row', { name: /Portal Scroll/ })).toContainText(/20\s*0\s*0/);
	await current.getByTestId('finish-map').click();

	await expect(page.getByTestId('priced-only')).toHaveText(
		'Priced loot only: 2 unpriced items on 1 line are left out of every total.'
	);
	await expect(page.getByTestId('fact-gross')).toHaveText('10 chaos');
	await expect(page.getByTestId('session-net')).toHaveText('5 chaos');
	const row = runRow(page, 1);
	await expect(row.locator('td').nth(6)).toHaveText('2');
	await row.getByRole('button', { name: '#1' }).click();
	const loot = page.locator('tr.detail');
	await expect(loot).toContainText('Portal Scroll ×20 at 0 = 0');
	await expect(loot).toContainText('Unidentified jewel ×2 unknown price');
});

test('a session with no recorded time shows no rate instead of Infinity or NaN', async ({ page }) => {
	await startSession(page);
	const current = page.getByRole('region', { name: /Current map/ });
	await current.getByLabel('Map cost').fill('0');
	await current.getByLabel('Minutes').fill('0');
	await addLine(page, 'Chaos Orb', '1', '1');
	await current.getByTestId('finish-map').click();
	await expect(page.getByTestId('fact-rate')).toHaveText('no time recorded');
	await expect(page.getByTestId('fact-minutes')).toHaveText('0 min');
	await expect(page.locator('body')).not.toContainText(/Infinity|NaN/);
});

test('an edited run is still there after a reload', async ({ page }) => {
	await loadSample(page);
	await runRow(page, 3).getByRole('button', { name: 'Edit map 3' }).click();
	const editor = page.getByRole('form', { name: 'Edit map 3' });
	await editor.getByLabel('Map cost').fill('6');
	await editor.getByRole('button', { name: 'Save map 3' }).click();
	await expect(page.getByTestId('session-net')).toHaveText('119 chaos');

	await page.reload();
	await expect(page.getByTestId('session-net')).toHaveText('119 chaos');
	await expect(runRow(page, 3).locator('td').nth(3)).toHaveText('6');
});

test('importing the same file twice changes nothing', async ({ page }) => {
	await loadSample(page);
	await importFile(page, samplePath);
	await expect(page.getByTestId('import-status')).toContainText(
		'Nothing changed: all 10 maps in this file are already here, with the same content.'
	);
	await expect(page.getByTestId('session-net')).toHaveText('120 chaos');
	await expect(page.getByRole('combobox', { name: 'Session' }).locator('option')).toHaveCount(1);
});

test('a malformed import is refused in full and the existing session stays intact', async ({ page }) => {
	await loadSample(page);
	await importFile(page, fixturePath('malformed-fields.json'));
	const status = page.getByTestId('import-status');
	await expect(status).toContainText('Nothing was imported.');
	await expect(status.locator('li')).toHaveText([
		'session.runs[0].loot[0].count: expected a positive whole number',
		'session.runs[1].mapCost: expected a number',
		'session.runs[3].elapsedSeconds: expected a number',
		'session.runs[2].id: duplicate run id "sample-run-01"'
	]);
	await status.getByRole('button', { name: 'Dismiss' }).click();

	await importFile(page, fixturePath('malformed-truncated.json'));
	await expect(page.getByTestId('import-status')).toContainText('Not valid JSON');

	await page.reload();
	await expect(page.getByTestId('session-net')).toHaveText('120 chaos');
	await expect(page.getByRole('combobox', { name: 'Session' }).locator('option')).toHaveCount(1);
});

test('a conflicting run is not changed until the player chooses', async ({ page }) => {
	await loadSample(page);
	await importFile(page, fixturePath('conflicting-run-07.json'));
	const status = page.getByTestId('import-status');
	const conflict = status.getByTestId('conflict-sample-run-07');
	await expect(conflict).toContainText('Map #7');
	await expect(status.getByRole('button', { name: 'Apply choices' })).toBeDisabled();
	// Nothing is written while the question is open.
	await expect(page.getByTestId('session-net')).toHaveText('120 chaos');
	await page.reload();
	await expect(page.getByTestId('session-net')).toHaveText('120 chaos');

	await importFile(page, fixturePath('conflicting-run-07.json'));
	await page.getByRole('button', { name: 'Cancel import' }).click();
	await expect(page.getByTestId('announcement')).toHaveText('Import of conflicting-run-07.json cancelled. Nothing changed.');
	await expect(page.getByTestId('session-net')).toHaveText('120 chaos');

	await importFile(page, fixturePath('conflicting-run-07.json'));
	await page.getByTestId('conflict-sample-run-07').getByLabel(/Use the file's/).check();
	await page.getByRole('button', { name: 'Apply choices' }).click();
	await expect(page.getByTestId('import-status')).toContainText('0 new maps added, 1 map replaced');
	await expect(page.getByTestId('session-net')).toHaveText('20 chaos');
});

test('an exported session imports into a fresh browser with the same numbers', async ({ page, browser }) => {
	await loadSample(page);
	await runRow(page, 2).getByRole('button', { name: 'Edit map 2' }).click();
	await page.getByRole('form', { name: 'Edit map 2' }).getByLabel('Minutes').fill('10');
	await page.getByRole('button', { name: 'Save map 2' }).click();
	await expect(page.getByTestId('fact-minutes')).toHaveText('55 min');

	const [download] = await Promise.all([
		page.waitForEvent('download'),
		page.getByRole('button', { name: 'Export session' }).click()
	]);
	expect(download.suggestedFilename()).toMatch(/^dunes-ledger-dunes-alch-and-go-\d{4}-\d{2}-\d{2}\.json$/);
	const file = await download.path();
	const doc = JSON.parse(await readFile(file, 'utf8'));
	expect(doc).toMatchObject({ format: 'dunes-ledger.session', version: 1 });
	expect(doc.session.runs[1].elapsedSeconds).toBe(600);

	const other = await browser.newContext();
	const fresh = await other.newPage();
	await open(fresh);
	await importFile(fresh, file);
	await expect(fresh.getByTestId('import-status')).toContainText('Added the session “Dunes, alch and go” with 10 maps.');
	await expect(fresh.getByTestId('session-net')).toHaveText('120 chaos');
	await expect(fresh.getByTestId('fact-minutes')).toHaveText('55 min');
	await other.close();
});

test('changing a price later does not rewrite recorded maps', async ({ page }) => {
	await loadSample(page);
	const prices = page.getByRole('region', { name: 'Price list' });
	await prices.getByLabel('Item name').fill('Divine Orb');
	await prices.getByLabel('Unit value').fill('250');
	await prices.getByRole('button', { name: 'Add price' }).click();
	await prices.getByRole('button', { name: 'Use this list for new lines in this session' }).click();
	await expect(page.getByTestId('session-net')).toHaveText('120 chaos');

	const current = page.getByRole('region', { name: /Current map/ });
	await current.getByLabel('Minutes').fill('5');
	await addLine(page, 'Divine Orb', '1');
	await current.getByTestId('finish-map').click();
	// The new map uses the new price (250 - 5); the earlier Divine Orb still counts as 100.
	await expect(page.getByTestId('session-net')).toHaveText('365 chaos');
	await expect(runRow(page, 7).locator('td').nth(4)).toHaveText('107');
	await expect(runRow(page, 11).locator('td').nth(4)).toHaveText('250');
});
