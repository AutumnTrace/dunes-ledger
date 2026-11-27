<script lang="ts">
	import type { LedgerApp } from '../app/ledger.svelte';
	import { runTotals } from '../ledger/accounting';
	import type { ConflictChoice, ImportConflict } from '../ledger/exchange';
	import { formatMinutes, formatNumber, formatSigned } from '../ledger/format';
	import type { Run, Session } from '../ledger/types';
	import { plural } from './text';

	let { app }: { app: LedgerApp } = $props();

	const current = $derived(app.importState);
	let choices = $state<Record<string, ConflictChoice>>({});
	let busy = $state(false);

	// Fresh choices for every new conflict screen.
	$effect(() => {
		void current;
		choices = {};
	});

	const conflicts = $derived(current?.outcome.status === 'needs-choice' ? current.outcome.conflicts : []);
	const allChosen = $derived(conflicts.every((c) => choices[c.key]));

	function runNumber(id: string): string {
		const index = app.sessions.find((s) => s.runs.some((r) => r.id === id))?.runs.findIndex((r) => r.id === id) ?? -1;
		return index >= 0 ? `Map #${index + 1}` : 'Map';
	}

	function describeRun(run: Run): string {
		const t = runTotals(run);
		const items = run.loot.map((l) => `${l.item} ×${l.count}`).join(', ') || 'no loot';
		return `${formatMinutes(run.elapsedSeconds)} min, cost ${formatNumber(run.mapCost)}, gross ${formatNumber(t.gross)}, net ${formatSigned(t.net)}. Loot: ${items}.`;
	}

	function describeSession(meta: unknown): string {
		const s = meta as Omit<Session, 'runs'>;
		return `${s.strategy || 'Untitled'} · ${s.league || 'no league'} · prices from ${s.priceSnapshot.takenAt}`;
	}

	function describe(conflict: ImportConflict, side: 'local' | 'incoming'): string {
		const value = conflict[side];
		return conflict.kind === 'run' ? describeRun(value as Run) : describeSession(value);
	}

	async function apply(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		try {
			await app.resolveConflicts(choices);
		} finally {
			busy = false;
		}
	}
</script>

{#if current}
	{@const o = current.outcome}
	<section class="import panel" class:problem={o.status === 'invalid' || o.status === 'refused'} aria-labelledby="import-heading" data-testid="import-status">
		<h2 id="import-heading">Import of {current.fileName}</h2>
		{#if o.status === 'invalid'}
			<p><strong>Nothing was imported.</strong> The file was checked in full before anything was written, and it has problems:</p>
			<ul>
				{#each o.errors as error, i (i)}<li><code>{error}</code></li>{/each}
			</ul>
			<p>Your sessions are unchanged.</p>
		{:else if o.status === 'unchanged'}
			<p>Nothing changed: all {plural(o.runCount, 'map')} in this file are already here, with the same content.</p>
		{:else if o.status === 'refused'}
			<p><strong>Nothing was imported.</strong> {o.reason}</p>
		{:else if o.status === 'added-session'}
			<p>Added the session “{o.session.strategy || 'Untitled'}” with {plural(o.session.runs.length, 'map')}.</p>
		{:else if o.status === 'merged'}
			<p>
				Updated “{o.session.strategy || 'Untitled'}”: {plural(o.addedRuns, 'new map')} added{o.replaced > 0
					? `, ${plural(o.replaced, 'map')} replaced with the file's version`
					: ''}.
			</p>
		{:else if o.status === 'needs-choice'}
			<form onsubmit={apply}>
				<p>
					This file has the same ids as data already here, with different content. Choose which version to keep for each.
					Nothing is written until you apply{o.addedRuns > 0 ? `; ${plural(o.addedRuns, 'new map')} will be added at the same time` : ''}.
				</p>
				{#each conflicts as conflict (conflict.key)}
					<fieldset data-testid={`conflict-${conflict.key}`}>
						<legend>{conflict.kind === 'session' ? 'Session details' : runNumber(conflict.key)} <code>{conflict.key}</code></legend>
						<label>
							<input type="radio" name={`c-${conflict.key}`} value="keep-local" bind:group={choices[conflict.key]} />
							Keep mine: {describe(conflict, 'local')}
						</label>
						<label>
							<input type="radio" name={`c-${conflict.key}`} value="use-imported" bind:group={choices[conflict.key]} />
							Use the file's: {describe(conflict, 'incoming')}
						</label>
					</fieldset>
				{/each}
				<div class="actions">
					<button type="submit" class="primary" disabled={!allChosen || busy}>Apply choices</button>
					<button type="button" onclick={() => app.cancelImport()}>Cancel import</button>
				</div>
			</form>
		{/if}
		{#if o.status !== 'needs-choice'}
			<button type="button" onclick={() => app.dismissImport()}>Dismiss</button>
		{/if}
	</section>
{/if}

<style>
	.import {
		border-color: var(--ink-soft);
	}
	.problem {
		border-color: var(--bad);
		background: #fff4f1;
	}
	fieldset {
		border: 1px solid var(--line);
		border-radius: 6px;
		margin: 0 0 0.6rem;
		background: #fff;
	}
	fieldset label {
		display: block;
		margin: 0.25rem 0;
	}
	.actions {
		display: flex;
		gap: 0.5rem;
	}
	code {
		font-size: 0.85em;
	}
</style>
