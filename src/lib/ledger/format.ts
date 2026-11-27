// Display and input helpers. Kept pure so tests can pin the exact text a player sees.

const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

/** "120", "2.5", "-3", "0". Never "Infinity" or "NaN": non-finite input shows as an em dash. */
export function formatNumber(value: number | null | undefined): string {
	if (value === null || value === undefined || !Number.isFinite(value)) return '—';
	// Round first so -0.001 does not print as "-0".
	const rounded = Math.round(value * 100) / 100;
	return numberFormat.format(rounded === 0 ? 0 : rounded);
}

/** "+102", "-3", "0": used where the sign carries meaning (a gap, a net per map). */
export function formatSigned(value: number | null | undefined): string {
	const text = formatNumber(value);
	if (text === '—' || text === '0' || text.startsWith('-')) return text;
	return `+${text}`;
}

export function formatAmount(value: number | null | undefined, currency: string): string {
	const text = formatNumber(value);
	return text === '—' ? text : `${text} ${currency}`;
}

/** Elapsed time in minutes, one decimal at most: 3000 s -> "50", 90 s -> "1.5". */
export function formatMinutes(elapsedSeconds: number): string {
	if (!Number.isFinite(elapsedSeconds)) return '—';
	return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(
		Math.round((elapsedSeconds / 60) * 10) / 10
	);
}

/** Rate per hour, or a dash with the reason when no time was recorded. */
export function formatRate(rate: number | null, currency: string): string {
	if (rate === null) return 'no time recorded';
	return `${formatNumber(rate)} ${currency}/hour`;
}

/**
 * Parse a price or cost typed by a player. Blank means "unknown" (`null`); an explicit "0"
 * is zero. Accepts a decimal comma ("0,5") as well as a point. Returns `undefined` for
 * anything that is not a finite, non-negative number.
 */
export function parseAmount(text: string): number | null | undefined {
	const trimmed = text.trim();
	if (trimmed === '') return null;
	if (!/^\d+([.,]\d+)?$/.test(trimmed)) return undefined;
	const value = Number(trimmed.replace(',', '.'));
	return Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** Parse a whole, positive item count. */
export function parseCount(text: string): number | undefined {
	const trimmed = text.trim();
	if (!/^\d+$/.test(trimmed)) return undefined;
	const value = Number(trimmed);
	return value >= 1 && Number.isSafeInteger(value) ? value : undefined;
}

/** Parse minutes ("5", "4.5", "4,5") into seconds. Blank gives `null`. */
export function parseMinutes(text: string): number | null | undefined {
	const value = parseAmount(text);
	if (value === null || value === undefined) return value;
	return Math.round(value * 60 * 1000) / 1000;
}
