// The data a farming session is made of. Everything here is plain JSON so a session can be
// exported, diffed and imported without a translation layer.

/** One line of loot from a finished map. */
export interface LootLine {
	/** Plain-text item name, as the player typed it. */
	item: string;
	/** How many of the item dropped. A positive whole number. */
	count: number;
	/**
	 * The unit value used when the line was recorded, in the session currency.
	 * `null` means the price was unknown; `0` is a real price of zero.
	 * Stored on the line so later edits to the price list never rewrite a finished session.
	 */
	unitValue: number | null;
}

/** One completed map. */
export interface Run {
	/** Stable identifier. Import uses it to recognise the same run in another copy. */
	id: string;
	/** When the map was finished, ISO 8601. */
	finishedAt: string;
	/** Time spent on the map, in whole or fractional seconds. May be zero. */
	elapsedSeconds: number;
	/** What the map cost to run (map, scarabs, other inputs), in the session currency. */
	mapCost: number;
	loot: LootLine[];
}

/** Prices taken from the price list when the session started, keyed by item name. */
export interface PriceSnapshot {
	takenAt: string;
	prices: Record<string, number>;
}

export interface Session {
	id: string;
	/** Free-text league label, e.g. "Standard" or the current challenge league. */
	league: string;
	/** Free-text map strategy, e.g. "Dunes, 4 scarabs, alch and go". */
	strategy: string;
	/** Currency every value in this session is expressed in. */
	currency: string;
	createdAt: string;
	/** True for the bundled sample. The UI labels such sessions as invented data. */
	synthetic?: boolean;
	/** Optional free-text note carried with the session (the sample uses it for its disclaimer). */
	note?: string;
	priceSnapshot: PriceSnapshot;
	runs: Run[];
}
