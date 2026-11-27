import { describe, expect, it } from 'vitest';
import { lineValue, median, ratePerHour, runTotals, summarize, topLine } from '../../src/lib/ledger/accounting';
import { parseImport } from '../../src/lib/ledger/exchange';
import { formatAmount, formatMinutes, formatNumber, formatRate } from '../../src/lib/ledger/format';
import type { Run, Session } from '../../src/lib/ledger/types';
import { readFixture, readSample } from './fixtures';

function load(text: string): Session {
	const parsed = parseImport(text);
	if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
	return parsed.session;
}

describe('the bundled synthetic sample', () => {
	const summary = summarize(load(readSample()));

	it('has ten five-minute runs costing 5 chaos each', () => {
		expect(summary.runCount).toBe(10);
		expect(summary.runs.every((r) => r.elapsedSeconds === 300 && r.cost === 5)).toBe(true);
	});

	it('returns 7 chaos gross on nine maps and 107 on one', () => {
		const gross = summary.runs.map((r) => r.gross).sort((a, b) => a - b);
		expect(gross).toEqual([7, 7, 7, 7, 7, 7, 7, 7, 7, 107]);
	});

	it('answers "how much did the whole session make?" with 120 chaos net', () => {
		expect(summary.gross).toBe(170);
		expect(summary.costs).toBe(50);
		expect(summary.net).toBe(120);
	});

	it('answers "what did a typical map make?" with a median net of 2 over an even count', () => {
		expect(summary.runCount % 2).toBe(0);
		expect(summary.medianNet).toBe(2);
	});

	it('makes exactly 144 chaos per hour over 50 minutes', () => {
		expect(summary.elapsedSeconds).toBe(3000);
		expect(formatMinutes(summary.elapsedSeconds)).toBe('50');
		expect(summary.ratePerHour).toBe(144);
		expect(formatRate(summary.ratePerHour, summary.currency)).toBe('144 chaos/hour');
	});

	it('points at run 7 and its single drop as the reason for the gap', () => {
		expect(summary.best).not.toBeNull();
		const best = summary.best!;
		expect(best.number).toBe(7);
		expect(best.runId).toBe('sample-run-07');
		expect(best.net).toBe(102);
		expect(best.gapToMedian).toBe(100);
		expect(best.topLine?.line.item).toBe('Divine Orb');
		expect(best.topLine?.value).toBe(100);
		expect(best.netWithoutTopLine).toBe(2);
	});

	it('is fully priced, so its totals are not qualified', () => {
		expect(summary.unpricedLines).toBe(0);
		expect(summary.pricedOnly).toBe(false);
	});
});

describe('median', () => {
	it('averages the two middle values of an even count', () => {
		expect(median([4, 1, 3, 2])).toBe(2.5);
		expect(median([2, 2, 2, 2, 2, 2, 2, 2, 2, 102])).toBe(2);
		expect(median([-5, 5])).toBe(0);
	});

	it('takes the middle value of an odd count', () => {
		expect(median([9, 1, 5])).toBe(5);
	});

	it('is null for no runs', () => {
		expect(median([])).toBeNull();
	});

	it('does not reorder its input', () => {
		const values = [3, 1, 2];
		median(values);
		expect(values).toEqual([3, 1, 2]);
	});
});

describe('zero elapsed time', () => {
	it('gives no rate instead of Infinity or NaN', () => {
		expect(ratePerHour(10, 0)).toBeNull();
		expect(ratePerHour(0, 0)).toBeNull();
		expect(ratePerHour(-4, 0)).toBeNull();
		expect(formatRate(ratePerHour(10, 0), 'chaos')).toBe('no time recorded');
	});

	it('keeps every other total of a session with no recorded time', () => {
		const summary = summarize(load(readFixture('zero-elapsed.json')));
		expect(summary.elapsedSeconds).toBe(0);
		expect(summary.ratePerHour).toBeNull();
		expect(summary.net).toBe(1);
		expect(summary.medianNet).toBe(1);
		for (const text of [formatAmount(summary.net, 'chaos'), formatMinutes(summary.elapsedSeconds)]) {
			expect(text).not.toMatch(/Infinity|NaN/);
		}
	});

	it('counts a zero-time run alongside timed runs', () => {
		const summary = summarize(load(readFixture('unpriced-and-zero.json')));
		expect(summary.elapsedSeconds).toBe(300);
		// net 10 - 5 = 5 on the timed run, 1 - 0 = 1 on the untimed one: 6 over five minutes.
		expect(summary.net).toBe(6);
		expect(summary.ratePerHour).toBe(72);
	});
});

describe('unknown and zero prices', () => {
	const run: Run = {
		id: 'r',
		finishedAt: '2026-11-27T19:00:00.000Z',
		elapsedSeconds: 300,
		mapCost: 5,
		loot: [
			{ item: 'Chaos Orb', count: 10, unitValue: 1 },
			{ item: 'Unidentified jewel', count: 2, unitValue: null },
			{ item: 'Portal Scroll', count: 20, unitValue: 0 }
		]
	};

	it('values an unknown price as unknown and an explicit zero as zero', () => {
		expect(lineValue(run.loot[1])).toBeNull();
		expect(lineValue(run.loot[2])).toBe(0);
	});

	it('counts unpriced lines and items, and leaves them out of gross', () => {
		const totals = runTotals(run);
		expect(totals.gross).toBe(10);
		expect(totals.net).toBe(5);
		expect(totals.unpricedLines).toBe(1);
		expect(totals.unpricedItems).toBe(2);
	});

	it('marks session totals as covering priced loot only', () => {
		const summary = summarize(load(readFixture('unpriced-and-zero.json')));
		expect(summary.pricedOnly).toBe(true);
		expect(summary.unpricedItems).toBe(2);
		expect(summary.unpricedLines).toBe(1);
	});

	it('does not count a zero-priced line as unpriced', () => {
		const totals = runTotals({ ...run, loot: [run.loot[2]] });
		expect(totals.unpricedLines).toBe(0);
		expect(totals.gross).toBe(0);
	});

	it('never picks an unpriced line as the top drop', () => {
		expect(topLine({ ...run, loot: [run.loot[1]] })).toBeNull();
		expect(topLine(run)?.line.item).toBe('Chaos Orb');
	});
});

describe('an empty session', () => {
	it('summarises to zeros and no median, rate or best map', () => {
		const sample = load(readSample());
		const summary = summarize({ ...sample, runs: [] });
		expect(summary).toMatchObject({ runCount: 0, gross: 0, costs: 0, net: 0, medianNet: null, ratePerHour: null, best: null });
		expect(formatNumber(summary.medianNet)).toBe('—');
	});
});
