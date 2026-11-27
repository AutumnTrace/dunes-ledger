import { expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export const samplePath = fileURLToPath(new URL('../samples/synthetic-dunes-session.json', import.meta.url));
export const fixturePath = (name: string) => fileURLToPath(new URL(`../samples/fixtures/${name}`, import.meta.url));

export async function open(page: Page) {
	await page.goto('./');
	await expect(page.getByText('Opening your journal…')).toBeHidden();
}

export async function loadSample(page: Page) {
	await open(page);
	await page.getByRole('button', { name: 'Load the synthetic sample' }).click();
	await expect(page.getByTestId('session-net')).toHaveText('120 chaos');
}

export async function importFile(page: Page, path: string) {
	await page.getByTestId('import-input').setInputFiles(path);
	await expect(page.getByTestId('import-status')).toBeVisible();
}

export async function startSession(page: Page, strategy = 'Dunes, test') {
	await open(page);
	const form = page.getByRole('form', { name: 'Start a session' });
	await form.getByLabel('League').fill('Test league');
	await form.getByLabel('Map strategy').fill(strategy);
	await form.getByRole('button', { name: 'Start session' }).click();
	await expect(page.getByRole('heading', { name: /Current map/ })).toBeVisible();
}

/** Type a loot line and press Enter, the way a player would between maps. */
export async function addLine(page: Page, item: string, count: string, unit = '') {
	const current = page.getByRole('region', { name: /Current map/ });
	await current.getByLabel('Item').fill(item);
	await current.getByLabel('Count').fill(count);
	await current.getByLabel('Unit value').fill(unit);
	await current.getByLabel('Unit value').press('Enter');
	await expect(current.getByLabel('Item')).toHaveValue('');
}

export function runRow(page: Page, number: number) {
	return page.getByTestId('runs-table').locator('tbody > tr[data-run-id]').nth(number - 1);
}
