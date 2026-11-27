// Import into storage. Validation and planning happen before the first write, so a bad file or
// an unanswered conflict never leaves half a session behind.
import {
	applyImport,
	parseImport,
	planImport,
	type ConflictChoice,
	type ImportConflict
} from '../ledger/exchange';
import type { Session } from '../ledger/types';
import type { LedgerStore } from './db';

export type ImportOutcome =
	| { status: 'invalid'; errors: string[] }
	| { status: 'unchanged'; sessionId: string; runCount: number }
	| { status: 'refused'; sessionId: string; reason: string }
	| { status: 'added-session'; session: Session }
	| { status: 'merged'; session: Session; addedRuns: number; replaced: number }
	| { status: 'needs-choice'; incoming: Session; conflicts: ImportConflict[]; addedRuns: number };

export async function importText(store: LedgerStore, text: string): Promise<ImportOutcome> {
	const parsed = parseImport(text);
	if (!parsed.ok) return { status: 'invalid', errors: parsed.errors };
	return resolveImport(store, parsed.session, {});
}

/**
 * Plan against the local copy as it is now and write only if every conflict has a choice.
 * Planning again (rather than reusing an earlier plan) means a run edited while the conflict
 * screen was open is compared afresh instead of being overwritten.
 */
export async function resolveImport(
	store: LedgerStore,
	incoming: Session,
	choices: Record<string, ConflictChoice>
): Promise<ImportOutcome> {
	const local = await store.getSession(incoming.id);
	const plan = planImport(local, incoming);
	switch (plan.kind) {
		case 'unchanged':
			return { status: 'unchanged', sessionId: plan.sessionId, runCount: plan.runCount };
		case 'refused':
			return { status: 'refused', sessionId: plan.sessionId, reason: plan.reason };
		case 'new':
			await store.saveSession(plan.session);
			return { status: 'added-session', session: plan.session };
		case 'merge': {
			if (plan.conflicts.some((c) => !choices[c.key])) {
				return { status: 'needs-choice', incoming, conflicts: plan.conflicts, addedRuns: plan.addedRuns.length };
			}
			const merged = applyImport(local, plan, choices)!;
			await store.saveSession(merged);
			const replaced = plan.conflicts.filter((c) => choices[c.key] === 'use-imported').length;
			return { status: 'merged', session: merged, addedRuns: plan.addedRuns.length, replaced };
		}
	}
}
