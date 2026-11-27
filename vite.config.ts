import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// BASE_PATH decides where the build expects to be served from.
//   unset or ''      -> any folder: asset links are relative, so the same files work at
//                       http://localhost:4173/ or https://example.org/some/folder/
//   '/dunes-ledger'  -> https://<user>.github.io/dunes-ledger/ (the hosted-demo build)
const base = (process.env.BASE_PATH ?? '').replace(/\/+$/, '');
if (base !== '' && !base.startsWith('/')) {
	throw new Error(`BASE_PATH must be empty or start with "/" (got "${base}")`);
}

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
			},
			adapter: adapter({ strict: true }),
			paths: { base: base as '' | `/${string}` }
		})
	],
	server: { port: 5173, strictPort: true },
	preview: { port: 4173, strictPort: true }
});
