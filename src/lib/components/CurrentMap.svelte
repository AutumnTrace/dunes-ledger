<script lang="ts">
	import type { LedgerApp } from '../app/ledger.svelte';
	import { lineValue } from '../ledger/accounting';
	import { formatAmount, formatNumber, parseAmount, parseCount, parseMinutes } from '../ledger/format';
	import { snapshotPrice } from '../ledger/session';
	import { formatClock, plural } from './text';

	let { app }: { app: LedgerApp } = $props();

	const session = $derived(app.active!);
	const draft = $derived(app.draft);
	const c = $derived(session.currency);
	const knownItems = $derived(Object.keys(session.priceSnapshot.prices).sort());
	const previousCost = $derived(session.runs.at(-1)?.mapCost ?? null);

	let item = $state('');
	let count = $state('1');
	let unit = $state('');
	let minutes = $state('');
	let cost = $state('');
	let lineError = $state('');
	let finishError = $state('');
	let itemInput: HTMLInputElement | undefined = $state();

	// Show the draft's cost (the previous map's cost for a new map) whenever a new draft starts.
	let costFor = '';
	$effect(() => {
		const key = draft ? `${draft.sessionId}|${draft.startedAt}` : '';
		if (key !== costFor) {
			costFor = key;
			cost = draft?.mapCost === null || draft?.mapCost === undefined ? '' : String(draft.mapCost);
		}
	});

	let now = $state(Date.now());
	$effect(() => {
		const timer = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(timer);
	});
	const elapsed = $derived(draft ? Math.max(0, (now - Date.parse(draft.startedAt)) / 1000) : 0);

	const suggested = $derived(item.trim() ? snapshotPrice(session, item) : null);
	const draftGross = $derived(
		(draft?.loot ?? []).reduce((sum, line) => sum + (lineValue(line) ?? 0), 0)
	);

	async function addLine(event?: SubmitEvent) {
		event?.preventDefault();
		lineError = '';
		if (!item.trim()) {
			lineError = 'Type an item name first.';
			return;
		}
		const parsedCount = parseCount(count);
		if (parsedCount === undefined) {
			lineError = 'Count must be a whole number of 1 or more.';
			return;
		}
		const parsedUnit = parseAmount(unit);
		if (parsedUnit === undefined) {
			lineError = 'Unit value must be a number of 0 or more, or blank for the snapshot price.';
			return;
		}
		// Blank means "use the snapshot price" (which may be unknown); "0" is an explicit zero.
		await app.addDraftLine(app.draftLine(item, parsedCount, parsedUnit === null ? undefined : parsedUnit));
		item = '';
		count = '1';
		unit = '';
		itemInput?.focus();
	}

	async function saveCost() {
		const parsed = parseAmount(cost);
		if (parsed !== undefined) await app.setDraftCost(parsed);
	}

	async function finish() {
		finishError = '';
		const parsedCost = parseAmount(cost);
		if (parsedCost === undefined || parsedCost === null) {
			finishError = 'Enter what the map cost (0 is allowed).';
			return;
		}
		const elapsedSeconds = parseMinutes(minutes);
		if (elapsedSeconds === undefined) {
			finishError = 'Minutes must be a number of 0 or more, or blank to use the timer.';
			return;
		}
		if (item.trim()) {
			finishError = 'There is an unadded loot line. Add it (Enter) or clear it before finishing.';
			return;
		}
		await app.finishMap({ elapsedSeconds, mapCost: parsedCost });
		minutes = '';
		itemInput?.focus();
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
			event.preventDefault();
			void finish();
		}
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section class="panel current" aria-labelledby="current-heading" onkeydown={onKeydown}>
	<div class="head">
		<h2 id="current-heading">Current map <span class="count">#{session.runs.length + 1}</span></h2>
		<p class="timer">
			<span class="visually-hidden">Timer</span>
			<span data-testid="timer" aria-live="off">{formatClock(elapsed)}</span>
			<button type="button" class="link" onclick={() => app.restartTimer()}>Restart timer</button>
		</p>
	</div>

	<div class="row">
		<label>
			Map cost ({c})
			<input
				name="map-cost"
				inputmode="decimal"
				autocomplete="off"
				bind:value={cost}
				onchange={saveCost}
				aria-describedby="cost-hint"
			/>
		</label>
		<span id="cost-hint" class="hint">
			{#if previousCost !== null && parseAmount(cost) === previousCost}
				Same as the previous map.
			{:else if previousCost !== null}
				Previous map: {formatNumber(previousCost)}
				<button type="button" class="link" onclick={() => ((cost = String(previousCost)), saveCost())}>Reuse</button>
			{:else}
				First map of the session.
			{/if}
		</span>
		<label>
			Minutes
			<input name="minutes" inputmode="decimal" autocomplete="off" placeholder="timer" bind:value={minutes} size="6" />
		</label>
	</div>

	<form class="row loot-entry" onsubmit={addLine} aria-label="Add a loot line">
		<label class="grow">
			Item
			<input
				name="item"
				list="known-items"
				autocomplete="off"
				bind:value={item}
				bind:this={itemInput}
				placeholder="e.g. Chaos Orb"
			/>
		</label>
		<datalist id="known-items">
			{#each knownItems as name (name)}<option value={name}></option>{/each}
		</datalist>
		<label>
			Count
			<input name="count" inputmode="numeric" autocomplete="off" bind:value={count} size="4" />
		</label>
		<label>
			Unit value
			<input
				name="unit-value"
				inputmode="decimal"
				autocomplete="off"
				bind:value={unit}
				size="8"
				placeholder={item.trim() ? (suggested === null ? 'unknown' : `${formatNumber(suggested)}`) : 'snapshot'}
			/>
		</label>
		<button type="submit">Add line <kbd>Enter</kbd></button>
	</form>
	{#if lineError}<p class="error" role="alert">{lineError}</p>{/if}

	{#if draft && draft.loot.length > 0}
		<table class="draft" aria-label="Loot on this map">
			<thead>
				<tr><th>Item</th><th class="num">Count</th><th class="num">Unit value</th><th class="num">Value</th><th></th></tr>
			</thead>
			<tbody>
				{#each draft.loot as line, i (i)}
					<tr>
						<td>{line.item}</td>
						<td class="num">{line.count}</td>
						<td class="num">{line.unitValue === null ? 'unknown' : formatNumber(line.unitValue)}</td>
						<td class="num">{lineValue(line) === null ? 'not priced' : formatNumber(lineValue(line))}</td>
						<td><button type="button" class="link" onclick={() => app.removeDraftLine(i)}>Remove<span class="visually-hidden"> {line.item}</span></button></td>
					</tr>
				{/each}
			</tbody>
		</table>
		<p class="hint">{plural(draft.loot.length, 'line')}, priced loot {formatAmount(draftGross, c)} so far.</p>
	{:else}
		<p class="hint">No loot on this map yet. A map can be finished with no loot.</p>
	{/if}

	<div class="finish">
		<button type="button" class="primary" onclick={finish} data-testid="finish-map">
			Finish map <kbd>Ctrl</kbd>+<kbd>Enter</kbd>
		</button>
		{#if finishError}<p class="error" role="alert">{finishError}</p>{/if}
	</div>
</section>

<style>
	.head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 1rem;
		margin-bottom: 0.75rem;
	}
	.count {
		color: var(--muted);
		font-weight: 500;
	}
	.timer {
		margin: 0;
		font-variant-numeric: tabular-nums;
		display: flex;
		gap: 0.75rem;
		align-items: baseline;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem 0.9rem;
		align-items: end;
		margin-bottom: 0.6rem;
	}
	label {
		display: flex;
		flex-direction: column;
		font-size: 0.85rem;
		color: var(--ink-soft);
		gap: 0.2rem;
	}
	.grow {
		flex: 1 1 12rem;
	}
	.hint {
		color: var(--muted);
		font-size: 0.85rem;
		margin: 0.25rem 0;
	}
	.row > .hint {
		align-self: center;
		margin-top: 1.2rem;
	}
	.link {
		border: none;
		background: none;
		padding: 0;
		text-decoration: underline;
		color: var(--sand-700);
	}
	kbd {
		font-family: inherit;
		font-size: 0.75em;
		border: 1px solid currentColor;
		border-radius: 3px;
		padding: 0 0.25em;
		opacity: 0.8;
	}
	.draft {
		margin: 0.5rem 0;
	}
	.finish {
		margin-top: 0.75rem;
	}
	.finish .primary {
		padding: 0.5rem 1.1rem;
	}
</style>
