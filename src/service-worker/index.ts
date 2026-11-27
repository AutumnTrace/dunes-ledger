// Offline support. After the first visit every file of the app is in the cache, so the journal
// opens and works with no network. Data never goes through here: it lives in IndexedDB.
import { version } from '$app/env';
import { assets, immutable, prerendered } from '$app/manifest';
import { self } from '$app/service-worker';

const PREFIX = 'dunes-ledger-';
const CACHE = `${PREFIX}${version}`;

// The worker file sits at the app's base path, so its own folder is the app's root. Resolving
// against it (instead of hard-coding a base) lets one build work from any folder.
const root = new URL('./', self.location.href);
const toUrl = (path: string) => new URL(path.replace(/^\/+/, ''), root).href;

const FILES = Array.from(
	new Set([root.href, ...[...immutable, ...assets, ...prerendered].map((entry) => toUrl(entry.path))])
);

self.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE);
			await cache.addAll(FILES);
			await self.skipWaiting();
		})()
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) {
				if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
			}
			await self.clients.claim();
		})()
	);
});

self.addEventListener('fetch', (event) => {
	const request = event.request;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== root.origin || !url.href.startsWith(root.href)) return;

	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE);
			// The app is a single page: every navigation inside it gets the cached page.
			if (request.mode === 'navigate') {
				const page = await cache.match(root.href);
				if (page) return page;
			}
			const cached = await cache.match(request);
			if (cached) return cached;
			return fetch(request);
		})()
	);
});
