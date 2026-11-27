// A small static file server for the built site, with no dependencies.
//
//   node scripts/serve.mjs [dir] [--port 4173] [--mount /some/folder/]
//
// --mount serves the site from a sub-folder, the way a host like GitHub Pages does, which is
// how the release smoke test checks that the relative-path build works away from the root.
// Responses carry `Cache-Control: no-cache` so the browser's HTTP cache never hides a rebuild;
// offline behaviour comes from the service worker alone.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {Record<string, string>} */
const TYPES = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.webmanifest': 'application/manifest+json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.gif': 'image/gif',
	'.txt': 'text/plain; charset=utf-8',
	'.ico': 'image/x-icon'
};

/**
 * @param {{ dir: string, port?: number, host?: string, mount?: string }} options
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
export async function startServer({ dir, port = 4173, host = '127.0.0.1', mount = '/' }) {
	const root = resolve(dir);
	const prefix = `/${mount.replace(/^\/+|\/+$/g, '')}/`.replace('//', '/');

	const server = createServer(async (req, res) => {
		const url = new URL(req.url ?? '/', 'http://localhost');
		let pathname = decodeURIComponent(url.pathname);
		if (pathname === prefix.slice(0, -1)) {
			res.writeHead(301, { Location: prefix });
			return res.end();
		}
		if (!pathname.startsWith(prefix)) {
			res.writeHead(404, { 'Content-Type': 'text/plain' });
			return res.end('Not found');
		}
		pathname = pathname.slice(prefix.length);
		let file = normalize(join(root, pathname));
		if (file !== root && !file.startsWith(root + sep)) {
			res.writeHead(403);
			return res.end();
		}
		try {
			let info = await stat(file);
			if (info.isDirectory()) {
				file = join(file, 'index.html');
				info = await stat(file);
			}
			res.writeHead(200, {
				'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
				'Content-Length': info.size,
				'Cache-Control': 'no-cache'
			});
			if (req.method === 'HEAD') return res.end();
			createReadStream(file).pipe(res);
		} catch {
			res.writeHead(404, { 'Content-Type': 'text/plain' });
			res.end('Not found');
		}
	});

	await new Promise((ok, fail) => {
		server.once('error', fail);
		server.listen(port, host, () => ok(undefined));
	});
	const address = server.address();
	const actualPort = typeof address === 'object' && address ? address.port : port;
	return {
		url: `http://${host === '0.0.0.0' ? 'localhost' : host}:${actualPort}${prefix}`,
		close: () =>
			new Promise((ok) => {
				server.closeAllConnections();
				server.close(() => ok());
			})
	};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const args = process.argv.slice(2);
	/** @param {string} name @param {string} fallback */
	const option = (name, fallback) => {
		const i = args.indexOf(name);
		return i === -1 ? fallback : args.splice(i, 2)[1];
	};
	const port = Number(option('--port', '4173'));
	const mount = option('--mount', '/');
	const host = option('--host', '127.0.0.1');
	const dir = args[0] ?? 'build';
	const { url } = await startServer({ dir, port, mount, host });
	console.log(`Serving ${resolve(dir)} at ${url}`);
	console.log('Press Ctrl+C to stop.');
}
