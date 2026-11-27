import { describe, expect, it } from 'vitest';
import { summarize } from '../../src/lib/ledger/accounting';
import {
	applyImport,
	canonical,
	EXPORT_FORMAT,
	exportSession,
	parseImport,
	planImport,
	serializeExport
} from '../../src/lib/ledger/exchange';
import type { Session } from '../../src/lib/ledger/types';
import { readFixture, readSample } from './fixtures';

function load(text: string): Session {
	const parsed = parseImport(text);
	if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
	return parsed.session;
}

describe('export', () => {
	it('round-trips a session through versioned JSON unchanged', () => {
		const session = load(readSample());
		const text = serializeExport(exportSession(session, '2026-11-27T20:00:00.000Z'));
		const doc = JSON.parse(text);
		expect(doc.format).toBe(EXPORT_FORMAT);
		expect(doc.version).toBe(1);
		expect(canonical(load(text))).toBe(canonical(session));
	});

	it('produces the bundled sample byte for byte from its own content', () => {
		const text = readSample();
		const doc = JSON.parse(text);
		expect(serializeExport(exportSession(load(text), doc.exportedAt))).toBe(text);
	});
});

describe('validation', () => {
	it('rejects a truncated file with the parser message', () => {
		const result = parseImport(readFixture('malformed-truncated.json'));
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.errors[0]).toMatch(/^Not valid JSON/);
	});

	it('reports every bad field of a malformed file, not only the first', () => {
		const result = parseImport(readFixture('malformed-fields.json'));
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.errors).toEqual([
			'session.runs[0].loot[0].count: expected a positive whole number',
			'session.runs[1].mapCost: expected a number',
			'session.runs[3].elapsedSeconds: expected a number',
			'session.runs[2].id: duplicate run id "sample-run-01"'
		]);
	});

	it('rejects files that are not dunes-ledger sessions or are from a newer version', () => {
		expect(parseImport('[]')).toEqual({ ok: false, errors: ['Expected a JSON object at the top level'] });
		const other = parseImport(JSON.stringify({ format: 'something-else', version: 1 }));
		expect(other.ok).toBe(false);
		const newer = parseImport(JSON.stringify({ format: EXPORT_FORMAT, version: 2, session: {} }));
		expect(newer).toEqual({ ok: false, errors: ['File version 2 is newer than this app reads (version 1)'] });
	});

	it('rejects negative, non-finite and non-numeric amounts', () => {
		const doc = JSON.parse(readSample());
		doc.session.runs[0].loot[0].unitValue = -1;
		doc.session.runs[0].mapCost = '5';
		doc.session.priceSnapshot.prices['Chaos Orb'] = null;
		const result = parseImport(JSON.stringify(doc));
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.errors).toContain('session.runs[0].loot[0].unitValue: must not be negative');
			expect(result.errors).toContain('session.runs[0].mapCost: expected a number');
			expect(result.errors).toContain('session.priceSnapshot.prices["Chaos Orb"]: expected a number');
		}
	});

	it('keeps an explicit zero price and reads a missing unit value as unknown', () => {
		const doc = JSON.parse(readFixture('unpriced-and-zero.json'));
		delete doc.session.runs[0].loot[1].unitValue;
		const session = load(JSON.stringify(doc));
		expect(session.runs[0].loot[1].unitValue).toBeNull();
		expect(session.runs[0].loot[2].unitValue).toBe(0);
	});

	it('drops fields it does not know', () => {
		const doc = JSON.parse(readSample());
		doc.session.runs[0].injected = '<script>';
		const session = load(JSON.stringify(doc));
		expect(session.runs[0]).not.toHaveProperty('injected');
	});
});

describe('import planning', () => {
	const local = load(readSample());

	it('adds a session the device has not seen', () => {
		const plan = planImport(undefined, local);
		expect(plan.kind).toBe('new');
		expect(applyImport(undefined, plan)).toEqual(local);
	});

	it('treats re-importing identical ids and content as a no-op', () => {
		const plan = planImport(local, load(readSample()));
		expect(plan).toEqual({ kind: 'unchanged', sessionId: 'sample-dunes-session', runCount: 10 });
		expect(applyImport(local, plan)).toBeNull();
	});

	it('ignores key order when deciding two runs are the same', () => {
		const doc = JSON.parse(readSample());
		doc.session.runs = doc.session.runs.map((r: Record<string, unknown>) =>
			Object.fromEntries(Object.entries(r).reverse())
		);
		expect(planImport(local, load(JSON.stringify(doc))).kind).toBe('unchanged');
	});

	it('adds runs with new ids without touching the existing ones', () => {
		const plan = planImport(local, load(readFixture('one-more-run.json')));
		expect(plan.kind).toBe('merge');
		if (plan.kind !== 'merge') return;
		expect(plan.addedRuns.map((r) => r.id)).toEqual(['sample-run-11']);
		expect(plan.unchangedRuns).toBe(10);
		expect(plan.conflicts).toEqual([]);
		const merged = applyImport(local, plan)!;
		expect(merged.runs).toHaveLength(11);
		expect(merged.runs.slice(0, 10)).toEqual(local.runs);
	});

	it('requires a choice for a run whose content differs under the same id', () => {
		const plan = planImport(local, load(readFixture('conflicting-run-07.json')));
		expect(plan.kind).toBe('merge');
		if (plan.kind !== 'merge') return;
		expect(plan.conflicts.map((c) => c.key)).toEqual(['sample-run-07']);
		expect(() => applyImport(local, plan)).toThrow(/No choice made for: sample-run-07/);
	});

	it('keeps the local run when asked to, leaving the session as it was', () => {
		const plan = planImport(local, load(readFixture('conflicting-run-07.json')));
		const merged = applyImport(local, plan, { 'sample-run-07': 'keep-local' })!;
		expect(summarize(merged).net).toBe(120);
		expect(canonical(merged)).toBe(canonical(local));
	});

	it('replaces the local run with the imported one when asked to', () => {
		const plan = planImport(local, load(readFixture('conflicting-run-07.json')));
		const merged = applyImport(local, plan, { 'sample-run-07': 'use-imported' })!;
		expect(summarize(merged).net).toBe(20);
		expect(merged.runs.map((r) => r.id)).toEqual(local.runs.map((r) => r.id));
	});

	it('treats different session details under the same id as a conflict too', () => {
		const incoming = { ...local, strategy: 'Dunes, six scarabs' };
		const plan = planImport(local, incoming);
		expect(plan.kind === 'merge' && plan.conflicts.map((c) => c.key)).toEqual(['session']);
		const merged = applyImport(local, plan, { session: 'use-imported' })!;
		expect(merged.strategy).toBe('Dunes, six scarabs');
		expect(merged.runs).toEqual(local.runs);
	});

	it('refuses to merge sessions counted in different currencies', () => {
		const plan = planImport(local, { ...local, currency: 'divine' });
		expect(plan.kind).toBe('refused');
		expect(applyImport(local, plan)).toBeNull();
	});
});
