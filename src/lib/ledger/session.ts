// Pure operations on a session. Each returns a new object; nothing here touches storage.
import type { LootLine, PriceSnapshot, Run, Session } from './types';

export const DEFAULT_CURRENCY = 'chaos';

/** A price list: item name -> unit value in the session currency. */
export type PriceList = Record<string, number>;

export function createSession(input: {
	id: string;
	league: string;
	strategy: string;
	now: string;
	prices: PriceList;
	currency?: string;
}): Session {
	return {
		id: input.id,
		league: input.league.trim(),
		strategy: input.strategy.trim(),
		currency: input.currency ?? DEFAULT_CURRENCY,
		createdAt: input.now,
		priceSnapshot: snapshot(input.prices, input.now),
		runs: []
	};
}

/** Copy a price list so later edits to it cannot reach into this snapshot. */
export function snapshot(prices: PriceList, takenAt: string): PriceSnapshot {
	return { takenAt, prices: { ...prices } };
}

/** Item names compare case-insensitively and ignore surrounding spaces. */
export function itemKey(item: string): string {
	return item.trim().toLocaleLowerCase('en-US');
}

/** The snapshot price for an item, or `null` when the snapshot does not know it. */
export function snapshotPrice(session: Session, item: string): number | null {
	const key = itemKey(item);
	for (const [name, value] of Object.entries(session.priceSnapshot.prices)) {
		if (itemKey(name) === key) return value;
	}
	return null;
}

/**
 * Build a loot line. With no explicit unit value the snapshot price is copied onto the line,
 * which freezes it: a later snapshot or price-list edit does not change this line.
 */
export function lootLine(
	session: Session,
	item: string,
	count: number,
	unitValue?: number | null
): LootLine {
	return {
		item: item.trim(),
		count,
		unitValue: unitValue === undefined ? snapshotPrice(session, item) : unitValue
	};
}

export function appendRun(session: Session, run: Run): Session {
	if (session.runs.some((r) => r.id === run.id)) {
		throw new Error(`Run ${run.id} already exists in this session`);
	}
	return { ...session, runs: [...session.runs, run] };
}

export function replaceRun(session: Session, run: Run): Session {
	const index = session.runs.findIndex((r) => r.id === run.id);
	if (index === -1) throw new Error(`Run ${run.id} is not in this session`);
	const runs = session.runs.slice();
	runs[index] = run;
	return { ...session, runs };
}

export function removeRun(session: Session, runId: string): Session {
	return { ...session, runs: session.runs.filter((r) => r.id !== runId) };
}

/** The cost of the last finished map, offered as the default for the next one. */
export function previousMapCost(session: Session): number | null {
	const last = session.runs.at(-1);
	return last ? last.mapCost : null;
}

/** Take a new snapshot for lines recorded from now on. Recorded lines keep their prices. */
export function refreshSnapshot(session: Session, prices: PriceList, now: string): Session {
	return { ...session, priceSnapshot: snapshot(prices, now) };
}
