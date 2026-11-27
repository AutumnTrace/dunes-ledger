<script lang="ts">
	import { untrack } from 'svelte';
	import { formatNumber, parseAmount, parseCount, parseMinutes } from '../ledger/format';
	import type { LootLine, Run } from '../ledger/types';

	let {
		run,
		number,
		currency,
		onsave,
		oncancel,
		ondelete
	}: {
		run: Run;
		number: number;
		currency: string;
		onsave: (run: Run) => void | Promise<void>;
		oncancel: () => void;
		ondelete: () => void | Promise<void>;
	} = $props();

	interface LineText {
		item: string;
		count: string;
		unit: string;
	}

	// The form edits text; the run is rebuilt only when every field parses.
	const toText = (line: LootLine): LineText => ({
		item: line.item,
		count: String(line.count),
		unit: line.unitValue === null ? '' : String(line.unitValue)
	});
	// The editor opens on a copy of the run as it was; later prop changes do not reset the form.
	const initial = untrack(() => run);
	let minutes = $state(formatNumber(initial.elapsedSeconds / 60).replace(/,/g, ''));
	let cost = $state(String(initial.mapCost));
	let lines = $state<LineText[]>(initial.loot.map(toText));
	let error = $state('');
	let confirmDelete = $state(false);

	function save(event: SubmitEvent) {
		event.preventDefault();
		error = '';
		const elapsedSeconds = parseMinutes(minutes);
		if (elapsedSeconds === undefined || elapsedSeconds === null) {
			error = 'Minutes must be a number of 0 or more.';
			return;
		}
		const mapCost = parseAmount(cost);
		if (mapCost === undefined || mapCost === null) {
			error = 'Map cost must be a number of 0 or more.';
			return;
		}
		const loot: LootLine[] = [];
		for (const [i, line] of lines.entries()) {
			if (!line.item.trim()) {
				error = `Line ${i + 1} needs an item name (or remove the line).`;
				return;
			}
			const count = parseCount(line.count);
			const unitValue = parseAmount(line.unit);
			if (count === undefined || unitValue === undefined) {
				error = `Line ${i + 1}: count must be a whole number of 1 or more, unit value a number of 0 or more or blank for unknown.`;
				return;
			}
			loot.push({ item: line.item.trim(), count, unitValue });
		}
		// Keep the original seconds when the minutes field was not changed, so an edit that
		// only touches loot does not round 4 min 59 s to 5 min.
		const unchangedMinutes = minutes === formatNumber(initial.elapsedSeconds / 60).replace(/,/g, '');
		void onsave({ ...run, elapsedSeconds: unchangedMinutes ? initial.elapsedSeconds : elapsedSeconds, mapCost, loot });
	}
</script>

<form class="editor" onsubmit={save} aria-label={`Edit map ${number}`}>
	<div class="row">
		<label>Minutes <input name="edit-minutes" inputmode="decimal" bind:value={minutes} size="6" /></label>
		<label>Map cost ({currency}) <input name="edit-cost" inputmode="decimal" bind:value={cost} size="6" /></label>
	</div>
	<table>
		<thead>
			<tr><th>Item</th><th>Count</th><th>Unit value <span class="hint">(blank = unknown)</span></th><th></th></tr>
		</thead>
		<tbody>
			{#each lines as line, i (i)}
				<tr>
					<td><input aria-label={`Item, line ${i + 1}`} bind:value={line.item} /></td>
					<td><input aria-label={`Count, line ${i + 1}`} inputmode="numeric" bind:value={line.count} size="4" /></td>
					<td><input aria-label={`Unit value, line ${i + 1}`} inputmode="decimal" bind:value={line.unit} size="8" /></td>
					<td>
						<button type="button" class="link" onclick={() => lines.splice(i, 1)}>
							Remove<span class="visually-hidden"> line {i + 1}</span>
						</button>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
	<p><button type="button" class="link" onclick={() => lines.push({ item: '', count: '1', unit: '' })}>Add a line</button></p>
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	<div class="actions">
		<button type="submit" class="primary">Save map {number}</button>
		<button type="button" onclick={oncancel}>Cancel</button>
		<span class="spacer"></span>
		{#if confirmDelete}
			<span>Delete map {number} for good?</span>
			<button type="button" class="danger" onclick={ondelete}>Delete</button>
			<button type="button" onclick={() => (confirmDelete = false)}>Keep it</button>
		{:else}
			<button type="button" onclick={() => (confirmDelete = true)}>Delete map…</button>
		{/if}
	</div>
</form>

<style>
	.editor {
		padding: 0.5rem 0.25rem;
	}
	.row {
		display: flex;
		gap: 1rem;
		margin-bottom: 0.5rem;
	}
	label {
		display: flex;
		flex-direction: column;
		font-size: 0.85rem;
		color: var(--ink-soft);
	}
	td input {
		width: 100%;
	}
	.hint {
		font-weight: 400;
	}
	.link {
		border: none;
		background: none;
		padding: 0;
		text-decoration: underline;
		color: var(--sand-700);
	}
	.actions {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		flex-wrap: wrap;
	}
	.spacer {
		flex: 1;
	}
	.danger {
		border-color: var(--bad);
		color: var(--bad);
	}
</style>
