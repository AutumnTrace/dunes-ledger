<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import type { LedgerApp } from '../app/ledger.svelte';
	import { lineValue, type SessionSummary } from '../ledger/accounting';
	import { formatMinutes, formatNumber, formatSigned } from '../ledger/format';
	import type { Run, Session } from '../ledger/types';
	import RunEditor from './RunEditor.svelte';
	import { formatTime } from './text';

	let { app, session, summary }: { app: LedgerApp; session: Session; summary: SessionSummary } = $props();

	let editing = $state<string | null>(null);
	const open = new SvelteSet<string>();
	const totals = $derived(new Map(summary.runs.map((r) => [r.runId, r])));

	function toggle(id: string) {
		if (open.has(id)) open.delete(id);
		else open.add(id);
	}

	async function save(run: Run) {
		await app.saveRun(run);
		editing = null;
	}

	async function remove(id: string) {
		await app.deleteRun(id);
		editing = null;
		open.delete(id);
	}
</script>

<section class="panel runs" aria-labelledby="runs-heading">
	<h2 id="runs-heading">Runs</h2>
	{#if session.runs.length === 0}
		<p class="empty">Finished maps appear here, and stay editable.</p>
	{:else}
		<div class="scroll">
			<table data-testid="runs-table">
				<thead>
					<tr>
						<th>Map</th>
						<th>Finished</th>
						<th class="num">Minutes</th>
						<th class="num">Cost</th>
						<th class="num">Gross</th>
						<th class="num">Net</th>
						<th class="num">Unpriced</th>
						<th><span class="visually-hidden">Actions</span></th>
					</tr>
				</thead>
				<tbody>
					{#each session.runs as run, i (run.id)}
						{@const t = totals.get(run.id)!}
						{@const isBest = summary.best?.runId === run.id && session.runs.length > 1}
						<tr class:best={isBest} data-run-id={run.id}>
							<td>
								<button
									type="button"
									class="link"
									aria-expanded={open.has(run.id)}
									onclick={() => toggle(run.id)}
									title="Show loot"
								>
									#{i + 1}
								</button>
								{#if isBest}<span class="tag">best</span>{/if}
							</td>
							<td>{formatTime(run.finishedAt)}</td>
							<td class="num">{formatMinutes(run.elapsedSeconds)}</td>
							<td class="num">{formatNumber(run.mapCost)}</td>
							<td class="num">{formatNumber(t.gross)}</td>
							<td class="num" class:loss={t.net < 0}>{formatSigned(t.net)}</td>
							<td class="num">{t.unpricedItems || ''}</td>
							<td>
								<button type="button" onclick={() => (editing = editing === run.id ? null : run.id)}>
									Edit<span class="visually-hidden"> map {i + 1}</span>
								</button>
							</td>
						</tr>
						{#if editing === run.id}
							<tr class="detail">
								<td colspan="8">
									<RunEditor
										{run}
										number={i + 1}
										currency={session.currency}
										onsave={save}
										oncancel={() => (editing = null)}
										ondelete={() => remove(run.id)}
									/>
								</td>
							</tr>
						{:else if open.has(run.id)}
							<tr class="detail">
								<td colspan="8">
									{#if run.loot.length === 0}
										<p class="empty">No loot recorded.</p>
									{:else}
										<ul class="loot">
											{#each run.loot as line, j (j)}
												<li>
													{line.item} ×{line.count}
													<span class="muted">
														{line.unitValue === null
															? 'unknown price'
															: `at ${formatNumber(line.unitValue)} = ${formatNumber(lineValue(line))}`}
													</span>
												</li>
											{/each}
										</ul>
									{/if}
								</td>
							</tr>
						{/if}
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

<style>
	.scroll {
		overflow-x: auto;
	}
	.empty {
		color: var(--muted);
		margin: 0;
	}
	tr.best td {
		background: #fff3df;
	}
	.tag {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		background: var(--sand-300);
		color: #2a1a08;
		border-radius: 4px;
		padding: 0 0.3rem;
		margin-left: 0.3rem;
	}
	.loss {
		color: var(--bad);
	}
	.link {
		border: none;
		background: none;
		padding: 0;
		text-decoration: underline;
		font-weight: 600;
	}
	tr.detail td {
		background: #fff;
	}
	.loot {
		margin: 0;
		padding-left: 1.2rem;
	}
	.muted {
		color: var(--muted);
	}
</style>
