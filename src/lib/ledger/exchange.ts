// Versioned JSON export and import.
//
// Import is three separate steps so nothing is written until the whole file has been checked
// and every conflict has an answer:
//   parseImport  text -> validated Session, or every problem found (no partial results)
//   planImport   local copy + incoming -> new / unchanged / merge with conflicts
//   applyImport  plan + the player's choices -> the session to store
import type { LootLine, PriceSnapshot, Run, Session } from './types';

export const EXPORT_FORMAT = 'dunes-ledger.session';
export const EXPORT_VERSION = 1;

export interface SessionExport {
	format: typeof EXPORT_FORMAT;
	version: typeof EXPORT_VERSION;
	exportedAt: string;
	session: Session;
}

export function exportSession(session: Session, now: string): SessionExport {
	return { format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt: now, session };
}

export function serializeExport(doc: SessionExport): string {
	return `${JSON.stringify(doc, null, '\t')}\n`;
}

export type ParseResult = { ok: true; session: Session } | { ok: false; errors: string[] };

const MAX_REPORTED_ERRORS = 12;
const MAX_TEXT = 200;

type Json = unknown;

function isRecord(value: Json): value is Record<string, Json> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

class Checker {
	errors: string[] = [];

	fail(path: string, message: string): undefined {
		this.errors.push(`${path}: ${message}`);
		return undefined;
	}

	text(value: Json, path: string, opts: { allowEmpty?: boolean } = {}): string | undefined {
		if (typeof value !== 'string') return this.fail(path, 'expected text');
		if (!opts.allowEmpty && value.trim() === '') return this.fail(path, 'must not be empty');
		if (value.length > MAX_TEXT) return this.fail(path, `longer than ${MAX_TEXT} characters`);
		return value;
	}

	timestamp(value: Json, path: string): string | undefined {
		const text = this.text(value, path);
		if (text === undefined) return undefined;
		if (Number.isNaN(Date.parse(text))) return this.fail(path, 'expected an ISO 8601 date and time');
		return text;
	}

	amount(value: Json, path: string): number | undefined {
		if (typeof value !== 'number' || !Number.isFinite(value)) return this.fail(path, 'expected a number');
		if (value < 0) return this.fail(path, 'must not be negative');
		return value;
	}

	count(value: Json, path: string): number | undefined {
		if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
			return this.fail(path, 'expected a positive whole number');
		}
		return value;
	}

	line(value: Json, path: string): LootLine | undefined {
		if (!isRecord(value)) return this.fail(path, 'expected an object');
		const item = this.text(value.item, `${path}.item`);
		const count = this.count(value.count, `${path}.count`);
		let unitValue: number | null | undefined = null;
		if (value.unitValue !== null && value.unitValue !== undefined) {
			unitValue = this.amount(value.unitValue, `${path}.unitValue`);
		}
		if (item === undefined || count === undefined || unitValue === undefined) return undefined;
		return { item, count, unitValue };
	}

	run(value: Json, path: string): Run | undefined {
		if (!isRecord(value)) return this.fail(path, 'expected an object');
		const id = this.text(value.id, `${path}.id`);
		const finishedAt = this.timestamp(value.finishedAt, `${path}.finishedAt`);
		const elapsedSeconds = this.amount(value.elapsedSeconds, `${path}.elapsedSeconds`);
		const mapCost = this.amount(value.mapCost, `${path}.mapCost`);
		let loot: LootLine[] | undefined;
		if (!Array.isArray(value.loot)) {
			this.fail(`${path}.loot`, 'expected a list');
		} else {
			const lines = value.loot.map((l, i) => this.line(l, `${path}.loot[${i}]`));
			if (lines.every((l) => l !== undefined)) loot = lines as LootLine[];
		}
		if (id === undefined || finishedAt === undefined || elapsedSeconds === undefined) return undefined;
		if (mapCost === undefined || loot === undefined) return undefined;
		return { id, finishedAt, elapsedSeconds, mapCost, loot };
	}

	snapshot(value: Json, path: string): PriceSnapshot | undefined {
		if (!isRecord(value)) return this.fail(path, 'expected an object');
		const takenAt = this.timestamp(value.takenAt, `${path}.takenAt`);
		if (!isRecord(value.prices)) return this.fail(`${path}.prices`, 'expected an object');
		const prices: Record<string, number> = {};
		let ok = takenAt !== undefined;
		for (const [item, price] of Object.entries(value.prices)) {
			const checked = this.amount(price, `${path}.prices[${JSON.stringify(item)}]`);
			if (checked === undefined) ok = false;
			else prices[item] = checked;
		}
		return ok ? { takenAt: takenAt!, prices } : undefined;
	}

	session(value: Json, path: string): Session | undefined {
		if (!isRecord(value)) return this.fail(path, 'expected an object');
		const id = this.text(value.id, `${path}.id`);
		const league = this.text(value.league, `${path}.league`, { allowEmpty: true });
		const strategy = this.text(value.strategy, `${path}.strategy`, { allowEmpty: true });
		const currency = this.text(value.currency, `${path}.currency`);
		const createdAt = this.timestamp(value.createdAt, `${path}.createdAt`);
		let synthetic: boolean | undefined;
		if (value.synthetic !== undefined) {
			if (typeof value.synthetic !== 'boolean') this.fail(`${path}.synthetic`, 'expected true or false');
			else synthetic = value.synthetic;
		}
		let note: string | undefined;
		if (value.note !== undefined) {
			if (typeof value.note !== 'string') this.fail(`${path}.note`, 'expected text');
			else note = value.note;
		}
		const priceSnapshot = this.snapshot(value.priceSnapshot, `${path}.priceSnapshot`);
		let runs: Run[] | undefined;
		if (!Array.isArray(value.runs)) {
			this.fail(`${path}.runs`, 'expected a list');
		} else {
			const checked = value.runs.map((r, i) => this.run(r, `${path}.runs[${i}]`));
			// Ids must be unique even when the runs carrying them have other problems.
			const seen = new Set<string>();
			value.runs.forEach((r, i) => {
				const id = isRecord(r) && typeof r.id === 'string' ? r.id : undefined;
				if (id === undefined) return;
				if (seen.has(id)) this.fail(`${path}.runs[${i}].id`, `duplicate run id "${id}"`);
				seen.add(id);
			});
			if (checked.every((r) => r !== undefined)) runs = checked as Run[];
		}
		if (this.errors.length > 0) return undefined;
		// Same key order as an export, so a re-exported file matches the original byte for byte.
		return {
			id: id!,
			league: league!,
			strategy: strategy!,
			currency: currency!,
			createdAt: createdAt!,
			...(synthetic !== undefined ? { synthetic } : {}),
			...(note !== undefined ? { note } : {}),
			priceSnapshot: priceSnapshot!,
			runs: runs!
		};
	}
}

/**
 * Validate an exported file completely. Either every field checks out and a clean Session
 * comes back (unknown fields dropped), or nothing comes back and every problem is listed.
 */
export function parseImport(text: string): ParseResult {
	let raw: Json;
	try {
		raw = JSON.parse(text);
	} catch (error) {
		return { ok: false, errors: [`Not valid JSON: ${(error as Error).message}`] };
	}
	if (!isRecord(raw)) return { ok: false, errors: ['Expected a JSON object at the top level'] };
	if (raw.format !== EXPORT_FORMAT) {
		return { ok: false, errors: [`Not a dunes-ledger session file (format should be "${EXPORT_FORMAT}")`] };
	}
	if (raw.version !== EXPORT_VERSION) {
		const newer = typeof raw.version === 'number' && raw.version > EXPORT_VERSION;
		return {
			ok: false,
			errors: [
				newer
					? `File version ${raw.version} is newer than this app reads (version ${EXPORT_VERSION})`
					: `Unsupported file version ${JSON.stringify(raw.version)}`
			]
		};
	}
	const checker = new Checker();
	const session = checker.session(raw.session, 'session');
	if (!session) {
		const errors = checker.errors.slice(0, MAX_REPORTED_ERRORS);
		const hidden = checker.errors.length - errors.length;
		if (hidden > 0) errors.push(`…and ${hidden} more`);
		return { ok: false, errors };
	}
	return { ok: true, session };
}

/** JSON with keys sorted at every level, so equal content compares equal. */
export function canonical(value: unknown): string {
	return JSON.stringify(value, (_key, v) =>
		isRecord(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v
	);
}

/** The session fields other than its runs. */
export function sessionMeta(session: Session): Omit<Session, 'runs'> {
	const { runs: _runs, ...meta } = session;
	return meta;
}

export interface ImportConflict {
	/** "session" for the session's own fields, otherwise the run id. */
	key: string;
	kind: 'session' | 'run';
	local: unknown;
	incoming: unknown;
}

export type ImportPlan =
	| { kind: 'new'; session: Session }
	| { kind: 'unchanged'; sessionId: string; runCount: number }
	| {
			kind: 'merge';
			sessionId: string;
			addedRuns: Run[];
			unchangedRuns: number;
			conflicts: ImportConflict[];
	  }
	| { kind: 'refused'; sessionId: string; reason: string };

export function planImport(local: Session | undefined, incoming: Session): ImportPlan {
	if (!local) return { kind: 'new', session: incoming };
	if (local.currency !== incoming.currency) {
		return {
			kind: 'refused',
			sessionId: local.id,
			reason: `The local session counts in ${local.currency} and the file counts in ${incoming.currency}; mixing them would make every total wrong.`
		};
	}
	const conflicts: ImportConflict[] = [];
	if (canonical(sessionMeta(local)) !== canonical(sessionMeta(incoming))) {
		conflicts.push({ key: 'session', kind: 'session', local: sessionMeta(local), incoming: sessionMeta(incoming) });
	}
	const localRuns = new Map(local.runs.map((r) => [r.id, r]));
	const addedRuns: Run[] = [];
	let unchangedRuns = 0;
	for (const run of incoming.runs) {
		const mine = localRuns.get(run.id);
		if (!mine) addedRuns.push(run);
		else if (canonical(mine) === canonical(run)) unchangedRuns += 1;
		else conflicts.push({ key: run.id, kind: 'run', local: mine, incoming: run });
	}
	if (addedRuns.length === 0 && conflicts.length === 0) {
		return { kind: 'unchanged', sessionId: local.id, runCount: unchangedRuns };
	}
	return { kind: 'merge', sessionId: local.id, addedRuns, unchangedRuns, conflicts };
}

export type ConflictChoice = 'keep-local' | 'use-imported';

/** The session to store for a plan. Throws if a conflict has no choice: nothing is guessed. */
export function applyImport(
	local: Session | undefined,
	plan: ImportPlan,
	choices: Record<string, ConflictChoice> = {}
): Session | null {
	switch (plan.kind) {
		case 'new':
			return plan.session;
		case 'unchanged':
		case 'refused':
			return null;
		case 'merge': {
			if (!local) throw new Error('A merge needs the local session');
			const missing = plan.conflicts.filter((c) => !choices[c.key]);
			if (missing.length > 0) {
				throw new Error(`No choice made for: ${missing.map((c) => c.key).join(', ')}`);
			}
			let merged: Session = { ...local, runs: local.runs.slice() };
			for (const conflict of plan.conflicts) {
				if (choices[conflict.key] !== 'use-imported') continue;
				if (conflict.kind === 'session') {
					merged = { ...(conflict.incoming as Omit<Session, 'runs'>), runs: merged.runs };
				} else {
					const incoming = conflict.incoming as Run;
					merged.runs = merged.runs.map((r) => (r.id === incoming.id ? incoming : r));
				}
			}
			if (plan.addedRuns.length > 0) {
				// Keep the table in the order maps were finished; ties keep their current order.
				merged.runs = [...merged.runs, ...plan.addedRuns]
					.map((run, order) => ({ run, order }))
					.sort((a, b) => Date.parse(a.run.finishedAt) - Date.parse(b.run.finishedAt) || a.order - b.order)
					.map((x) => x.run);
			}
			return merged;
		}
	}
}
