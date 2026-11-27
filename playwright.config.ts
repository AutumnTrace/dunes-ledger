import { defineConfig, devices } from '@playwright/test';

// Browser tests run against the production build (`npm run build`), served by the same small
// static server the README uses. Every test gets a fresh browser context, so each starts with
// empty IndexedDB storage.
const port = 4174;

export default defineConfig({
	testDir: 'e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: 0,
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
	use: {
		baseURL: `http://127.0.0.1:${port}/`,
		trace: 'retain-on-failure',
		viewport: { width: 1200, height: 900 }
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1200, height: 900 } } }],
	webServer: {
		command: `node scripts/serve.mjs build --port ${port}`,
		url: `http://127.0.0.1:${port}/`,
		reuseExistingServer: !process.env.CI
	}
});
