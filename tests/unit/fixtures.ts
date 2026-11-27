import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const samples = fileURLToPath(new URL('../../samples/', import.meta.url));

/** The bundled synthetic sample, as text, exactly as a player would import it. */
export function readSample(): string {
	return readFileSync(`${samples}synthetic-dunes-session.json`, 'utf8');
}

/** A file from samples/fixtures, as text. */
export function readFixture(name: string): string {
	return readFileSync(`${samples}fixtures/${name}`, 'utf8');
}
