// Session accounting. Pure functions over plain data: no persistence, no clocks, no DOM.
//
// Two numbers answer two different questions:
//   session net  -> "How much did the whole session make?"   (a sum, sensitive to one big drop)
//   median net   -> "What did a typical map make?"            (a middle value, ignores one big drop)
import type { LootLine, Run, Session } from './types';

export interface RunTotals {
	runId: string;
	/** Value of priced loot only. Lines with an unknown price add nothing here. */
	gross: number;
	cost: number;
	net: number;
	elapsedSeconds: number;
	/** Lines with an unknown price, and the number of items on them. */
	unpricedLines: number;
	unpricedItems: number;
}

export interface LineContribution {
	line: LootLine;
	index: number;
	value: number;
}

export interface BestRun {
	runId: string;
	/** 1-based position of the run in the session, as shown in the table. */
	number: number;
	net: number;
	/** How far this map's net sits above the median map. */
	gapToMedian: number;
	/** The single most valuable priced line on this map, if it has any priced loot. */
	topLine: LineContribution | null;
	/** What the map would have netted without its top line. */
	netWithoutTopLine: number;
}

export interface SessionSummary {
	currency: string;
	runCount: number;
	gross: number;
	costs: number;
	net: number;
	elapsedSeconds: number;
	/** Median of per-map net values; the mean of the two middle values for an even count. */
	medianNet: number | null;
	/** Net per hour of recorded map time; `null` when no time was recorded. */
	ratePerHour: number | null;
	unpricedLines: number;
	unpricedItems: number;
	/** True when at least one line had no price, so totals cover priced loot only. */
	pricedOnly: boolean;
	best: BestRun | null;
	runs: RunTotals[];
}

/** Value of one line, or `null` when its price is unknown. An explicit zero stays zero. */
export function lineValue(line: LootLine): number | null {
	if (line.unitValue === null) return null;
	return line.count * line.unitValue;
}

export function runTotals(run: Run): RunTotals {
	let gross = 0;
	let unpricedLines = 0;
	let unpricedItems = 0;
	for (const line of run.loot) {
		const value = lineValue(line);
		if (value === null) {
			unpricedLines += 1;
			unpricedItems += line.count;
		} else {
			gross += value;
		}
	}
	return {
		runId: run.id,
		gross,
		cost: run.mapCost,
		net: gross - run.mapCost,
		elapsedSeconds: run.elapsedSeconds,
		unpricedLines,
		unpricedItems
	};
}

/** Median of a list of numbers; `null` for an empty list. */
export function median(values: readonly number[]): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = sorted.length >> 1;
	return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Net per hour. Multiplies before dividing so whole-number inputs give exact results
 * (120 net over 3000 s is exactly 144, not 144.00000000000003).
 * Returns `null` instead of Infinity or NaN when no time was recorded.
 */
export function ratePerHour(net: number, elapsedSeconds: number): number | null {
	if (!(elapsedSeconds > 0)) return null;
	return (net * 3600) / elapsedSeconds;
}

/** The most valuable priced line of a run, first one wins on a tie. */
export function topLine(run: Run): LineContribution | null {
	let best: LineContribution | null = null;
	for (let index = 0; index < run.loot.length; index++) {
		const line = run.loot[index];
		const value = lineValue(line);
		if (value === null) continue;
		if (best === null || value > best.value) best = { line, index, value };
	}
	return best;
}

export function summarize(session: Session): SessionSummary {
	const runs = session.runs.map(runTotals);
	let gross = 0;
	let costs = 0;
	let elapsedSeconds = 0;
	let unpricedLines = 0;
	let unpricedItems = 0;
	for (const r of runs) {
		gross += r.gross;
		costs += r.cost;
		elapsedSeconds += r.elapsedSeconds;
		unpricedLines += r.unpricedLines;
		unpricedItems += r.unpricedItems;
	}
	const net = gross - costs;
	const medianNet = median(runs.map((r) => r.net));

	let best: BestRun | null = null;
	if (runs.length > 0 && medianNet !== null) {
		let bestIndex = 0;
		runs.forEach((r, i) => {
			if (r.net > runs[bestIndex].net) bestIndex = i;
		});
		const run = session.runs[bestIndex];
		const top = topLine(run);
		const bestNet = runs[bestIndex].net;
		best = {
			runId: run.id,
			number: bestIndex + 1,
			net: bestNet,
			gapToMedian: bestNet - medianNet,
			topLine: top,
			netWithoutTopLine: bestNet - (top?.value ?? 0)
		};
	}

	return {
		currency: session.currency,
		runCount: runs.length,
		gross,
		costs,
		net,
		elapsedSeconds,
		medianNet,
		ratePerHour: ratePerHour(net, elapsedSeconds),
		unpricedLines,
		unpricedItems,
		pricedOnly: unpricedLines > 0,
		best,
		runs
	};
}
