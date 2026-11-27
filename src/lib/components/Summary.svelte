<script lang="ts">
	import { lineValue, type SessionSummary } from '../ledger/accounting';
	import { formatAmount, formatMinutes, formatNumber, formatRate, formatSigned } from '../ledger/format';
	import type { Session } from '../ledger/types';
	import { formatDateTime, plural } from './text';

	let { session, summary }: { session: Session; summary: SessionSummary } = $props();

	let showBest = $state(false);
	const c = $derived(session.currency);
	const best = $derived(summary.best);
	const bestRun = $derived(best ? session.runs.find((r) => r.id === best.runId) : undefined);
	const bestTotals = $derived(best ? summary.runs.find((r) => r.runId === best.runId) : undefined);
	const sortedLoot = $derived(
		bestRun
			? bestRun.loot
					.map((line, index) => ({ line, index, value: lineValue(line) }))
					.sort((a, b) => (b.value ?? -1) - (a.value ?? -1))
			: []
	);

	// Close the detail when a different map becomes the best one (another session, an import).
	// A string key, so edits that leave the same map on top keep the detail open.
	const bestKey = $derived(`${session.id}|${best?.runId ?? ''}`);
	$effect(() => {
		void bestKey;
		showBest = false;
	});
</script>

<section class="panel summary" aria-labelledby="summary-heading">
	<h2 id="summary-heading">Session summary</h2>

	<div class="headline">
		<div class="figure">
			<p class="question" id="q-session">How much did the whole session make?</p>
			<p class="value" data-testid="session-net" aria-describedby="q-session">{formatAmount(summary.net, c)}</p>
			<p class="hint">
				Net over {plural(summary.runCount, 'map')}: {formatNumber(summary.gross)} gross minus {formatNumber(summary.costs)}
				in map costs.
			</p>
		</div>
		<div class="figure">
			<p class="question" id="q-typical">What did a typical map make?</p>
			<p class="value" data-testid="median-net" aria-describedby="q-typical">{formatAmount(summary.medianNet, c)}</p>
			<p class="hint">
				{#if summary.runCount === 0}
					No maps finished yet.
				{:else}
					Median net per map{summary.runCount % 2 === 0 && summary.runCount > 0
						? ', the average of the two middle maps'
						: ''}. One lucky drop barely moves it.
				{/if}
			</p>
		</div>
	</div>

	{#if summary.pricedOnly}
		<p class="qualifier" data-testid="priced-only">
			Priced loot only: {plural(summary.unpricedItems, 'unpriced item')} on {plural(summary.unpricedLines, 'line')}
			{summary.unpricedItems === 1 ? 'is' : 'are'} left out of every total.
		</p>
	{/if}

	<dl class="facts">
		<div><dt>Gross value</dt><dd data-testid="fact-gross">{formatAmount(summary.gross, c)}</dd></div>
		<div><dt>Map costs</dt><dd data-testid="fact-costs">{formatAmount(summary.costs, c)}</dd></div>
		<div><dt>Net</dt><dd data-testid="fact-net">{formatAmount(summary.net, c)}</dd></div>
		<div><dt>Elapsed</dt><dd data-testid="fact-minutes">{formatMinutes(summary.elapsedSeconds)} min</dd></div>
		<div><dt>Session rate</dt><dd data-testid="fact-rate">{formatRate(summary.ratePerHour, c)}</dd></div>
		<div><dt>Currency</dt><dd data-testid="fact-currency">{c}</dd></div>
		<div><dt>Prices</dt><dd>snapshot of {formatDateTime(session.priceSnapshot.takenAt)}</dd></div>
	</dl>

	{#if best && bestRun && bestTotals && summary.runCount > 1}
		<button
			class="best"
			type="button"
			aria-expanded={showBest}
			aria-controls="best-detail"
			data-testid="best-map"
			onclick={() => (showBest = !showBest)}
		>
			<span class="best-label">Most profitable map</span>
			<span class="best-text">{`Map #${best.number}: ${formatSigned(best.net)} ${c} net, ${formatNumber(best.gapToMedian)} above the typical map`}</span>
			<span class="chevron" aria-hidden="true">{showBest ? '▲' : '▼'}</span>
		</button>

		{#if showBest}
			<div id="best-detail" class="drill" data-testid="best-detail">
				<h3>Map #{best.number}</h3>
				<p class="drill-facts">
					{`${formatMinutes(bestRun.elapsedSeconds)} min · cost ${formatAmount(bestRun.mapCost, c)} · gross ${formatAmount(bestTotals.gross, c)} · net ${formatSigned(bestTotals.net)} ${c}`}
				</p>
				<table>
					<thead>
						<tr><th>Item</th><th class="num">Count</th><th class="num">Unit value</th><th class="num">Value</th></tr>
					</thead>
					<tbody>
						{#each sortedLoot as entry (entry.index)}
							<tr class:top={best.topLine?.index === entry.index}>
								<td>{entry.line.item}</td>
								<td class="num">{entry.line.count}</td>
								<td class="num">{entry.line.unitValue === null ? 'unknown' : formatNumber(entry.line.unitValue)}</td>
								<td class="num">{entry.value === null ? 'not priced' : formatNumber(entry.value)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
				{#if best.topLine}
					<p class="verdict" data-testid="best-verdict">
						Largest drop: <strong>{best.topLine.line.item} ×{best.topLine.line.count}</strong>, worth
						{formatAmount(best.topLine.value, c)}. The gap to the typical map is {formatAmount(best.gapToMedian, c)}.
						Without that drop, map #{best.number} would have netted {formatAmount(best.netWithoutTopLine, c)}; the typical
						map netted {formatAmount(summary.medianNet, c)}.
					</p>
				{:else}
					<p class="verdict" data-testid="best-verdict">This map has no priced loot to explain its result.</p>
				{/if}
			</div>
		{/if}
	{/if}
</section>

<style>
	.headline {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
		gap: 0.75rem;
	}
	.figure {
		background: #fff;
		border: 1px solid var(--line);
		border-left: 6px solid var(--sand-300);
		border-radius: var(--radius);
		padding: 0.75rem 1rem;
	}
	.figure:nth-child(2) {
		border-left-color: var(--ink-soft);
	}
	.question {
		margin: 0;
		font-weight: 600;
		color: var(--ink-soft);
	}
	.value {
		margin: 0.2rem 0;
		font-size: 2.4rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.01em;
	}
	.hint {
		margin: 0;
		color: var(--muted);
		font-size: 0.9rem;
	}
	.qualifier {
		margin: 0.75rem 0 0;
		padding: 0.5rem 0.75rem;
		border-radius: 6px;
		background: #fdf1d6;
		border: 1px solid var(--sun);
	}
	.facts {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 1.5rem;
		margin: 0.9rem 0 0;
	}
	.facts div {
		display: flex;
		gap: 0.4rem;
		align-items: baseline;
	}
	.facts dt {
		color: var(--muted);
		font-size: 0.85rem;
	}
	.facts dd {
		margin: 0;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.best {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		width: 100%;
		margin-top: 1rem;
		padding: 0.6rem 0.9rem;
		text-align: left;
		border: 1px solid var(--sand-500);
		background: #fff7ea;
	}
	.best:hover {
		background: #fbe9cc;
	}
	.best-label {
		font-size: 0.8rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--sand-700);
	}
	.best-text {
		flex: 1;
		font-weight: 600;
	}
	.drill {
		margin-top: 0.5rem;
		padding: 0.75rem 1rem;
		background: #fff;
		border: 1px solid var(--line);
		border-radius: var(--radius);
	}
	.drill h3 {
		font-size: 1rem;
	}
	.drill-facts {
		margin: 0.25rem 0 0.5rem;
		color: var(--muted);
	}
	tr.top td {
		background: #fdf1d6;
		font-weight: 700;
	}
	.verdict {
		margin: 0.75rem 0 0;
	}
</style>
