// Renders the PNG icons the web app manifest needs from the SVG sources in static/icons.
//   npm run icons
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const dir = fileURLToPath(new URL('../static/icons/', import.meta.url));
const icon = await readFile(`${dir}icon.svg`);
const maskable = await readFile(`${dir}icon-maskable.svg`);

const outputs = [
	{ svg: icon, size: 192, name: 'icon-192.png' },
	{ svg: icon, size: 512, name: 'icon-512.png' },
	{ svg: maskable, size: 512, name: 'icon-maskable-512.png' },
	{ svg: maskable, size: 180, name: 'apple-touch-icon.png' }
];
for (const { svg, size, name } of outputs) {
	await sharp(svg, { density: 300 }).resize(size, size).png({ compressionLevel: 9 }).toFile(`${dir}${name}`);
	console.log(`${name} ${size}x${size}`);
}
