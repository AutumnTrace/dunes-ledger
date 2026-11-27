import { defineConfig } from 'vitest/config';

// Unit tests cover the pure ledger code and the IndexedDB layer (through fake-indexeddb).
// They do not need the SvelteKit plugin; browser behaviour is covered by Playwright in e2e/.
export default defineConfig({
	test: {
		include: ['tests/unit/**/*.test.ts'],
		environment: 'node'
	}
});
