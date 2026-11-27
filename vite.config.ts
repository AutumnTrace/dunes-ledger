import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// BASE_PATH decides where the build expects to be served from.
//   unset or ''      -> any folder: asset links are relative, so the same files work at
//                       http://localhost:4173/ or https://example.org/some/folder/
//   '/dunes-ledger'  -> https://<user>.github.io/dunes-ledger/ (the hosted-demo build)
const base = (process.env.BASE_PATH ?? '').replace(/\/+$/, '');
if (/^[A-Za-z]:/.test(base)) {
	throw new Error(
		`BASE_PATH became a Windows path ("${base}"). Git Bash rewrites values that start with "/"; ` +
			'run the command with MSYS_NO_PATHCONV=1, or set BASE_PATH from PowerShell.'
	);
}
if (base !== '' && !base.startsWith('/')) {
	throw new Error(`BASE_PATH must be empty or start with "/" (got "${base}")`);
}

// BUILD_DIR lets the release script produce the root build and the hosted build side by side.
const out = process.env.BUILD_DIR ?? 'build';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
			},
			adapter: adapter({ pages: out, assets: out, strict: true }),
			paths: { base: base as '' | `/${string}` },
			// The release script pins this to "<version>-<commit>" so a rebuild of the same tag is
			// byte-identical. Unset, SvelteKit uses the build time, which also renames the service
			// worker cache on every local build.
			...(process.env.APP_VERSION ? { version: { name: process.env.APP_VERSION } } : {})
		})
	],
	server: { port: 5173, strictPort: true },
	preview: { port: 4173, strictPort: true }
});
