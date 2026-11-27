// IndexedDB persistence. The only module that knows where data lives; the ledger code above it
// works on plain objects and never imports this file.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { LootLine, Session } from '../ledger/types';
import type { PriceList } from '../ledger/session';

export const DB_NAME = 'dunes-ledger';
const DB_VERSION = 1;

/** The map being played right now: kept so a reload or a closed tab loses nothing. */
export interface Draft {
	sessionId: string;
	startedAt: string;
	mapCost: number | null;
	loot: LootLine[];
}

interface PriceRow {
	item: string;
	unitValue: number;
	updatedAt: string;
}

interface LedgerSchema extends DBSchema {
	sessions: { key: string; value: Session };
	prices: { key: string; value: PriceRow };
	drafts: { key: string; value: Draft };
	meta: { key: string; value: string };
}

export interface LedgerStore {
	listSessions(): Promise<Session[]>;
	getSession(id: string): Promise<Session | undefined>;
	saveSession(session: Session): Promise<void>;
	deleteSession(id: string): Promise<void>;
	getPrices(): Promise<PriceList>;
	setPrice(item: string, unitValue: number | null, now: string): Promise<void>;
	getDraft(sessionId: string): Promise<Draft | undefined>;
	saveDraft(draft: Draft): Promise<void>;
	clearDraft(sessionId: string): Promise<void>;
	/** Store a finished map and drop the draft it came from, in one transaction. */
	finishDraft(session: Session): Promise<void>;
	getActiveSessionId(): Promise<string | undefined>;
	setActiveSessionId(id: string): Promise<void>;
	close(): void;
}

export async function openLedger(name = DB_NAME): Promise<LedgerStore> {
	const db: IDBPDatabase<LedgerSchema> = await openDB<LedgerSchema>(name, DB_VERSION, {
		upgrade(database) {
			database.createObjectStore('sessions', { keyPath: 'id' });
			database.createObjectStore('prices', { keyPath: 'item' });
			database.createObjectStore('drafts', { keyPath: 'sessionId' });
			database.createObjectStore('meta');
		}
	});

	return {
		async listSessions() {
			const sessions = await db.getAll('sessions');
			return sessions.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
		},
		getSession: (id) => db.get('sessions', id),
		async saveSession(session) {
			await db.put('sessions', session);
		},
		async deleteSession(id) {
			const tx = db.transaction(['sessions', 'drafts'], 'readwrite');
			await Promise.all([tx.objectStore('sessions').delete(id), tx.objectStore('drafts').delete(id), tx.done]);
		},
		async getPrices() {
			const rows = await db.getAll('prices');
			return Object.fromEntries(rows.map((r) => [r.item, r.unitValue]));
		},
		async setPrice(item, unitValue, now) {
			if (unitValue === null) await db.delete('prices', item);
			else await db.put('prices', { item, unitValue, updatedAt: now });
		},
		getDraft: (sessionId) => db.get('drafts', sessionId),
		async saveDraft(draft) {
			await db.put('drafts', draft);
		},
		async clearDraft(sessionId) {
			await db.delete('drafts', sessionId);
		},
		async finishDraft(session) {
			const tx = db.transaction(['sessions', 'drafts'], 'readwrite');
			await Promise.all([
				tx.objectStore('sessions').put(session),
				tx.objectStore('drafts').delete(session.id),
				tx.done
			]);
		},
		getActiveSessionId: () => db.get('meta', 'activeSessionId'),
		async setActiveSessionId(id) {
			await db.put('meta', id, 'activeSessionId');
		},
		close: () => db.close()
	};
}
