// Application state: the bridge between the pure ledger functions, IndexedDB and the views.
// Sessions are replaced, never mutated, so `$state.raw` is enough and stored objects are plain.
import sampleText from '#samples/synthetic-dunes-session.json?raw';
import { summarize, type SessionSummary } from '../ledger/accounting';
import { exportSession, serializeExport, type ConflictChoice } from '../ledger/exchange';
import {
	appendRun,
	createSession,
	lootLine,
	previousMapCost,
	refreshSnapshot,
	removeRun,
	replaceRun,
	type PriceList
} from '../ledger/session';
import type { LootLine, Run, Session } from '../ledger/types';
import type { Draft, LedgerStore } from '../storage/db';
import { importText, resolveImport, type ImportOutcome } from '../storage/import';

export const SAMPLE_SESSION_ID = 'sample-dunes-session';

/** Random id that also works outside secure contexts, where crypto.randomUUID is missing. */
export function newId(prefix: string): string {
	const bytes = crypto.getRandomValues(new Uint8Array(10));
	return `${prefix}-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export interface ImportState {
	fileName: string;
	outcome: ImportOutcome;
}

export class LedgerApp {
	ready = $state(false);
	loadError = $state<string | null>(null);
	sessions = $state.raw<Session[]>([]);
	activeId = $state<string | null>(null);
	prices = $state.raw<PriceList>({});
	draft = $state.raw<Draft | null>(null);
	importState = $state.raw<ImportState | null>(null);
	/** Short status line read out by screen readers after an action. */
	announcement = $state('');

	active = $derived(this.sessions.find((s) => s.id === this.activeId) ?? null);
	summary: SessionSummary | null = $derived(this.active ? summarize(this.active) : null);

	#store: LedgerStore | null = null;
	#now: () => Date;

	constructor(now: () => Date = () => new Date()) {
		this.#now = now;
	}

	get store(): LedgerStore {
		if (!this.#store) throw new Error('Storage is not open yet');
		return this.#store;
	}

	nowIso(): string {
		return this.#now().toISOString();
	}

	async init(store: LedgerStore): Promise<void> {
		this.#store = store;
		this.sessions = await store.listSessions();
		this.prices = await store.getPrices();
		const activeId = await store.getActiveSessionId();
		const chosen = this.sessions.find((s) => s.id === activeId) ?? this.sessions.at(-1) ?? null;
		if (chosen) await this.selectSession(chosen.id);
		this.ready = true;
	}

	async #reloadSessions(): Promise<void> {
		this.sessions = await this.store.listSessions();
	}

	async #putSession(session: Session): Promise<void> {
		await this.store.saveSession(session);
		this.sessions = this.sessions.some((s) => s.id === session.id)
			? this.sessions.map((s) => (s.id === session.id ? session : s))
			: [...this.sessions, session];
	}

	async selectSession(id: string): Promise<void> {
		this.activeId = id;
		await this.store.setActiveSessionId(id);
		this.draft = (await this.store.getDraft(id)) ?? null;
		if (!this.draft) await this.#startDraft();
	}

	/** Begin timing the next map, offering the previous map's cost again. */
	async #startDraft(): Promise<void> {
		const session = this.active;
		if (!session) return;
		const draft: Draft = {
			sessionId: session.id,
			startedAt: this.nowIso(),
			mapCost: previousMapCost(session),
			loot: []
		};
		await this.store.saveDraft(draft);
		this.draft = draft;
	}

	async #saveDraft(changes: Partial<Draft>): Promise<void> {
		if (!this.draft) return;
		const draft = { ...this.draft, ...changes };
		await this.store.saveDraft(draft);
		this.draft = draft;
	}

	// Sessions ---------------------------------------------------------------------------

	async loadSample(): Promise<void> {
		await this.importFile('synthetic-dunes-session.json', sampleText, { quiet: true });
		await this.selectSession(SAMPLE_SESSION_ID);
		this.announcement = 'Loaded the synthetic sample session.';
	}

	async startSession(input: { league: string; strategy: string }): Promise<void> {
		const session = createSession({
			id: newId('session'),
			league: input.league,
			strategy: input.strategy,
			now: this.nowIso(),
			prices: this.prices
		});
		await this.#putSession(session);
		await this.selectSession(session.id);
		this.announcement = `Started a new session: ${session.strategy || 'untitled'}.`;
	}

	// The map being played ---------------------------------------------------------------

	/** A loot line priced from the session snapshot unless a unit value is given. */
	draftLine(item: string, count: number, unitValue?: number | null): LootLine {
		return lootLine(this.active!, item, count, unitValue);
	}

	async addDraftLine(line: LootLine): Promise<void> {
		if (!this.draft) return;
		await this.#saveDraft({ loot: [...this.draft.loot, line] });
	}

	async removeDraftLine(index: number): Promise<void> {
		if (!this.draft) return;
		await this.#saveDraft({ loot: this.draft.loot.filter((_, i) => i !== index) });
	}

	async setDraftCost(mapCost: number | null): Promise<void> {
		await this.#saveDraft({ mapCost });
	}

	async restartTimer(): Promise<void> {
		await this.#saveDraft({ startedAt: this.nowIso() });
	}

	/**
	 * Record the current map. `elapsedSeconds` overrides the timer (null means "use the timer").
	 * The run and the cleared draft are written in one transaction.
	 */
	async finishMap(options: { elapsedSeconds: number | null; mapCost: number }): Promise<Run | null> {
		const session = this.active;
		const draft = this.draft;
		if (!session || !draft) return null;
		const finished = this.#now();
		const timed = Math.max(0, Math.round((finished.getTime() - Date.parse(draft.startedAt)) / 1000));
		const run: Run = {
			id: newId('run'),
			finishedAt: finished.toISOString(),
			elapsedSeconds: options.elapsedSeconds ?? timed,
			mapCost: options.mapCost,
			loot: draft.loot
		};
		const updated = appendRun(session, run);
		await this.store.finishDraft(updated);
		this.sessions = this.sessions.map((s) => (s.id === updated.id ? updated : s));
		this.draft = null;
		await this.#startDraft();
		const net = summarize({ ...updated, runs: [run] }).net;
		this.announcement = `Map ${updated.runs.length} saved, net ${net >= 0 ? '+' : ''}${Math.round(net * 100) / 100} ${updated.currency}.`;
		return run;
	}

	// Finished maps ----------------------------------------------------------------------

	async saveRun(run: Run): Promise<void> {
		if (!this.active) return;
		await this.#putSession(replaceRun(this.active, run));
		this.announcement = 'Map updated.';
	}

	async deleteRun(runId: string): Promise<void> {
		if (!this.active) return;
		await this.#putSession(removeRun(this.active, runId));
		this.announcement = 'Map deleted.';
	}

	// Prices -----------------------------------------------------------------------------

	async setPrice(item: string, unitValue: number | null): Promise<void> {
		await this.store.setPrice(item.trim(), unitValue, this.nowIso());
		this.prices = await this.store.getPrices();
	}

	/** Copy the price list into the active session for lines recorded from now on. */
	async takeSnapshot(): Promise<void> {
		if (!this.active) return;
		await this.#putSession(refreshSnapshot(this.active, this.prices, this.nowIso()));
		this.announcement = 'New price snapshot taken. Recorded maps keep their prices.';
	}

	// Import and export ------------------------------------------------------------------

	async importFile(fileName: string, text: string, options: { quiet?: boolean } = {}): Promise<ImportOutcome> {
		const outcome = await importText(this.store, text);
		await this.#afterImport(fileName, outcome, options.quiet);
		return outcome;
	}

	async resolveConflicts(choices: Record<string, ConflictChoice>): Promise<ImportOutcome | null> {
		const pending = this.importState;
		if (!pending || pending.outcome.status !== 'needs-choice') return null;
		const outcome = await resolveImport(this.store, pending.outcome.incoming, choices);
		await this.#afterImport(pending.fileName, outcome);
		return outcome;
	}

	cancelImport(): void {
		const pending = this.importState;
		if (pending?.outcome.status === 'needs-choice') {
			this.importState = null;
			this.announcement = `Import of ${pending.fileName} cancelled. Nothing changed.`;
		}
	}

	dismissImport(): void {
		this.importState = null;
	}

	async #afterImport(fileName: string, outcome: ImportOutcome, quiet = false): Promise<void> {
		if (outcome.status === 'added-session' || outcome.status === 'merged') {
			await this.#reloadSessions();
			await this.selectSession(outcome.session.id);
		}
		if (!quiet) this.importState = { fileName, outcome };
	}

	exportActive(): { fileName: string; text: string } | null {
		const session = this.active;
		if (!session) return null;
		const now = this.nowIso();
		const slug = (session.strategy || 'session')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '')
			.slice(0, 40);
		return {
			fileName: `dunes-ledger-${slug || 'session'}-${now.slice(0, 10)}.json`,
			text: serializeExport(exportSession(session, now))
		};
	}
}
