// The IndexedDB layer, run against fake-indexeddb. A fresh database name per test keeps them apart.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { summarize } from '../../src/lib/ledger/accounting';
import { canonical, parseImport } from '../../src/lib/ledger/exchange';
import { appendRun, createSession, lootLine } from '../../src/lib/ledger/session';
import type { Session } from '../../src/lib/ledger/types';
import { openLedger } from '../../src/lib/storage/db';
import { importText, resolveImport } from '../../src/lib/storage/import';
import { readFixture, readSample } from './fixtures';

let counter = 0;
const freshName = () => `dunes-ledger-test-${++counter}`;

async function withSample(name: string) {
	const store = await openLedger(name);
	const outcome = await importText(store, readSample());
	expect(outcome.status).toBe('added-session');
	return store;
}

async function snapshotOf(store: Awaited<ReturnType<typeof openLedger>>) {
	return canonical(await store.listSessions());
}

describe('saving and reloading', () => {
	it('keeps a saved session after the database is closed and opened again', async () => {
		const name = freshName();
		const first = await withSample(name);
		await first.setActiveSessionId('sample-dunes-session');
		first.close();

		const second = await openLedger(name);
		const sessions = await second.listSessions();
		expect(sessions.map((s) => s.id)).toEqual(['sample-dunes-session']);
		expect(summarize(sessions[0]).net).toBe(120);
		expect(await second.getActiveSessionId()).toBe('sample-dunes-session');
		second.close();
	});

	it('keeps an in-progress map across a reload, and drops it with the finished map in one write', async () => {
		const name = freshName();
		const store = await openLedger(name);
		let session = createSession({ id: 's1', league: 'L', strategy: 'Dunes', now: '2026-11-27T18:00:00.000Z', prices: { 'Chaos Orb': 1 } });
		await store.saveSession(session);
		const loot = [lootLine(session, 'Chaos Orb', 3)];
		await store.saveDraft({ sessionId: 's1', startedAt: '2026-11-27T18:00:00.000Z', mapCost: 5, loot });
		store.close();

		const reopened = await openLedger(name);
		const draft = await reopened.getDraft('s1');
		expect(draft?.loot).toEqual(loot);
		session = appendRun(session, { id: 'r1', finishedAt: '2026-11-27T18:05:00.000Z', elapsedSeconds: 300, mapCost: 5, loot });
		await reopened.finishDraft(session);
		expect(await reopened.getDraft('s1')).toBeUndefined();
		expect((await reopened.getSession('s1'))?.runs).toHaveLength(1);
		reopened.close();
	});
});

describe('prices', () => {
	it('edits the price list without changing a stored session', async () => {
		const store = await withSample(freshName());
		await store.setPrice('Divine Orb', 250, '2026-11-28T10:00:00.000Z');
		await store.setPrice('Orb of Fusing', null, '2026-11-28T10:00:00.000Z');
		expect(await store.getPrices()).toEqual({ 'Divine Orb': 250 });
		const session = (await store.getSession('sample-dunes-session'))!;
		expect(summarize(session).net).toBe(120);
		expect(session.priceSnapshot.prices['Divine Orb']).toBe(100);
		store.close();
	});
});

describe('import into storage', () => {
	it('leaves the existing session untouched when a file is malformed', async () => {
		const store = await withSample(freshName());
		const before = await snapshotOf(store);
		for (const file of ['malformed-truncated.json', 'malformed-fields.json']) {
			const outcome = await importText(store, readFixture(file));
			expect(outcome.status).toBe('invalid');
		}
		expect(await snapshotOf(store)).toBe(before);
		store.close();
	});

	it('does not write a session whose runs are valid but whose last run is not', async () => {
		const store = await openLedger(freshName());
		const doc = JSON.parse(readSample());
		doc.session.id = 'half-good';
		doc.session.runs[9].loot[0].count = 0;
		const outcome = await importText(store, JSON.stringify(doc));
		expect(outcome.status).toBe('invalid');
		expect(await store.listSessions()).toEqual([]);
		store.close();
	});

	it('treats importing the same file twice as a no-op', async () => {
		const store = await withSample(freshName());
		const before = await snapshotOf(store);
		const outcome = await importText(store, readSample());
		expect(outcome).toEqual({ status: 'unchanged', sessionId: 'sample-dunes-session', runCount: 10 });
		expect(await snapshotOf(store)).toBe(before);
		store.close();
	});

	it('writes nothing for a conflicting run until a choice is made', async () => {
		const store = await withSample(freshName());
		const before = await snapshotOf(store);
		const outcome = await importText(store, readFixture('conflicting-run-07.json'));
		expect(outcome.status).toBe('needs-choice');
		expect(await snapshotOf(store)).toBe(before);
		if (outcome.status !== 'needs-choice') return;
		expect(outcome.conflicts.map((c) => c.key)).toEqual(['sample-run-07']);

		const resolved = await resolveImport(store, outcome.incoming, { 'sample-run-07': 'use-imported' });
		expect(resolved).toMatchObject({ status: 'merged', addedRuns: 0, replaced: 1 });
		expect(summarize((await store.getSession('sample-dunes-session'))!).net).toBe(20);
		store.close();
	});

	it('asks again if the local run changed while the choice was pending', async () => {
		const store = await withSample(freshName());
		const outcome = await importText(store, readFixture('one-more-run.json'));
		expect(outcome).toMatchObject({ status: 'merged', addedRuns: 1 });

		const conflict = await importText(store, readFixture('conflicting-run-07.json'));
		expect(conflict.status).toBe('needs-choice');
		if (conflict.status !== 'needs-choice') return;
		// Meanwhile the player edits run 3 locally; the file still has the old run 3.
		const local = (await store.getSession('sample-dunes-session'))!;
		const edited: Session = {
			...local,
			runs: local.runs.map((r) => (r.id === 'sample-run-03' ? { ...r, mapCost: 6 } : r))
		};
		await store.saveSession(edited);
		const again = await resolveImport(store, conflict.incoming, { 'sample-run-07': 'use-imported' });
		expect(again.status).toBe('needs-choice');
		if (again.status === 'needs-choice') {
			expect(again.conflicts.map((c) => c.key).sort()).toEqual(['sample-run-03', 'sample-run-07']);
		}
		expect((await store.getSession('sample-dunes-session'))!.runs[2].mapCost).toBe(6);
		store.close();
	});

	it('refuses a file counted in another currency and keeps the local copy', async () => {
		const store = await withSample(freshName());
		const before = await snapshotOf(store);
		const doc = JSON.parse(readSample());
		doc.session.currency = 'divine';
		const outcome = await importText(store, JSON.stringify(doc));
		expect(outcome.status).toBe('refused');
		expect(await snapshotOf(store)).toBe(before);
		store.close();
	});

	it('round-trips an imported session through parseImport unchanged', async () => {
		const store = await withSample(freshName());
		const stored = await store.getSession('sample-dunes-session');
		const parsed = parseImport(readSample());
		expect(parsed.ok && canonical(parsed.session)).toBe(canonical(stored));
		store.close();
	});
});
