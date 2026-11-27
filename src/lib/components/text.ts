// Small wording helpers shared by the views.

const dateTime = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

export function formatDateTime(iso: string): string {
	const date = new Date(iso);
	return Number.isNaN(date.getTime()) ? iso : dateTime.format(date);
}

export function formatTime(iso: string): string {
	const date = new Date(iso);
	return Number.isNaN(date.getTime()) ? iso : time.format(date);
}

/** "1 map", "10 maps", "2 unpriced items". */
export function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** "03:07" for 187 seconds; hours appear only when needed. */
export function formatClock(totalSeconds: number): string {
	const s = Math.max(0, Math.floor(totalSeconds));
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const sec = s % 60;
	const mm = String(m).padStart(2, '0');
	const ss = String(sec).padStart(2, '0');
	return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
