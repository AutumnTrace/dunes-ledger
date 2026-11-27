import { describe, expect, it } from 'vitest';
import { summarize } from '../../src/lib/ledger/accounting';
import { formatAmount, formatMinutes, formatNumber, formatSigned, parseAmount, parseCount, parseMinutes } from '../../src/lib/ledger/format';
import {
	appendRun,
	createSession,
	lootLine,
	previousMapCost,
	refreshSnapshot,
	removeRun,
	replaceRun,
	snapshotPrice
} from '../../src/lib/ledger/session';
import type { Run } from '../../src/lib/ledger/types';

const now = '2026-11-27T18:00:00.000Z';

function run(id: string, mapCost: number, loot: Run['loot']): Run {
	return { id, finishedAt: now, elapsedSeconds: 300, mapCost, loot };
}

describe('price snapshots', () => {
	it('copies the price list, so editing the list later does not reach the session', () => {
		const prices = { 'Chaos Orb': 1, 'Divine Orb': 100 };
		const session = createSession({ id: 's', league: 'L', strategy: 'Dunes', now, prices });
		prices['Divine Orb'] = 250;
		expect(snapshotPrice(session, 'Divine Orb')).toBe(100);
		expect(session.priceSnapshot.takenAt).toBe(now);
	});

	it('stores the unit price on each line, so a new snapshot leaves recorded runs alone', () => {
		let session = createSession({ id: 's', league: 'L', strategy: 'Dunes', now, prices: { 'Divine Orb': 100 } });
		session = appendRun(session, run('r1', 5, [lootLine(session, 'Divine Orb', 1)]));
		expect(summarize(session).net).toBe(95);

		// Tomorrow the price list says something else, and a new snapshot is taken.
		session = refreshSnapshot(session, { 'Divine Orb': 180 }, '2026-11-28T18:00:00.000Z');
		expect(summarize(session).net).toBe(95);

		// Only lines recorded after the new snapshot use the new price.
		session = appendRun(session, run('r2', 5, [lootLine(session, 'Divine Orb', 1)]));
		expect(session.runs.map((r) => r.loot[0].unitValue)).toEqual([100, 180]);
	});

	it('matches item names without regard to case or surrounding spaces', () => {
		const session = createSession({ id: 's', league: '', strategy: '', now, prices: { 'Chaos Orb': 1 } });
		expect(lootLine(session, '  chaos orb ', 3)).toEqual({ item: 'chaos orb', count: 3, unitValue: 1 });
	});

	it('leaves an item the snapshot does not know unpriced, and keeps an explicit zero', () => {
		const session = createSession({ id: 's', league: '', strategy: '', now, prices: { 'Portal Scroll': 0 } });
		expect(lootLine(session, 'Mystery fragment', 1).unitValue).toBeNull();
		expect(lootLine(session, 'Portal Scroll', 5).unitValue).toBe(0);
		expect(lootLine(session, 'Mystery fragment', 1, 0).unitValue).toBe(0);
	});
});

describe('runs', () => {
	const base = createSession({ id: 's', league: '', strategy: '', now, prices: {} });

	it('offers the previous map cost for the next map', () => {
		expect(previousMapCost(base)).toBeNull();
		const session = appendRun(appendRun(base, run('a', 5, [])), run('b', 7, []));
		expect(previousMapCost(session)).toBe(7);
	});

	it('refuses a second run with the same id', () => {
		const session = appendRun(base, run('a', 5, []));
		expect(() => appendRun(session, run('a', 6, []))).toThrow(/already exists/);
	});

	it('edits a run in place, keeping its position', () => {
		const session = appendRun(appendRun(base, run('a', 5, [])), run('b', 5, []));
		const edited = replaceRun(session, run('a', 9, []));
		expect(edited.runs.map((r) => [r.id, r.mapCost])).toEqual([
			['a', 9],
			['b', 5]
		]);
		expect(session.runs[0].mapCost).toBe(5);
		expect(() => replaceRun(session, run('zzz', 1, []))).toThrow(/not in this session/);
	});

	it('removes a run by id', () => {
		const session = appendRun(appendRun(base, run('a', 5, [])), run('b', 5, []));
		expect(removeRun(session, 'a').runs.map((r) => r.id)).toEqual(['b']);
	});
});

describe('input parsing', () => {
	it('reads blank as unknown, "0" as zero, and a decimal comma', () => {
		expect(parseAmount('')).toBeNull();
		expect(parseAmount('   ')).toBeNull();
		expect(parseAmount('0')).toBe(0);
		expect(parseAmount('0,5')).toBe(0.5);
		expect(parseAmount('12.25')).toBe(12.25);
	});

	it('rejects negative, signed and non-numeric amounts', () => {
		for (const text of ['-1', '+1', 'abc', '1e3', 'Infinity', 'NaN', '1.2.3']) {
			expect(parseAmount(text)).toBeUndefined();
		}
	});

	it('accepts only whole positive counts', () => {
		expect(parseCount('3')).toBe(3);
		expect(parseCount('0')).toBeUndefined();
		expect(parseCount('1.5')).toBeUndefined();
		expect(parseCount('')).toBeUndefined();
	});

	it('turns minutes into seconds, including zero', () => {
		expect(parseMinutes('5')).toBe(300);
		expect(parseMinutes('4,5')).toBe(270);
		expect(parseMinutes('0')).toBe(0);
		expect(parseMinutes('')).toBeNull();
	});
});

describe('display', () => {
	it('never prints Infinity or NaN', () => {
		expect(formatNumber(Infinity)).toBe('—');
		expect(formatNumber(NaN)).toBe('—');
		expect(formatNumber(null)).toBe('—');
		expect(formatAmount(-Infinity, 'chaos')).toBe('—');
		expect(formatMinutes(NaN)).toBe('—');
	});

	it('rounds to two decimals and avoids "-0"', () => {
		expect(formatNumber(0.1 + 0.2)).toBe('0.3');
		expect(formatNumber(-0.001)).toBe('0');
		expect(formatNumber(1234.5)).toBe('1,234.5');
		expect(formatSigned(102)).toBe('+102');
		expect(formatSigned(-3)).toBe('-3');
		expect(formatSigned(0)).toBe('0');
	});
});
