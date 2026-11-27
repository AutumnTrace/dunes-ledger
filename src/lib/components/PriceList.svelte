<script lang="ts">
	import type { LedgerApp } from '../app/ledger.svelte';
	import { formatNumber, parseAmount } from '../ledger/format';
	import { formatDateTime } from './text';

	let { app }: { app: LedgerApp } = $props();

	const entries = $derived(Object.entries(app.prices).sort(([a], [b]) => a.localeCompare(b)));
	let item = $state('');
	let value = $state('');
	let error = $state('');

	async function add(event: SubmitEvent) {
		event.preventDefault();
		error = '';
		const parsed = parseAmount(value);
		if (!item.trim() || parsed === undefined || parsed === null) {
			error = 'Give an item name and a unit value of 0 or more.';
			return;
		}
		await app.setPrice(item, parsed);
		item = '';
		value = '';
	}

	async function update(name: string, text: string) {
		const parsed = parseAmount(text);
		if (parsed === undefined || parsed === null) return;
		await app.setPrice(name, parsed);
	}
</script>

<section class="panel prices" aria-labelledby="prices-heading">
	<h2 id="prices-heading">Price list</h2>
	<p class="explain">
		A new session copies this list into its price snapshot. Each loot line keeps the unit value it was recorded with,
		so changing a price here never rewrites a finished map.
	</p>
	{#if app.active}
		<p class="explain">
			This session's snapshot is from {formatDateTime(app.active.priceSnapshot.takenAt)}.
			<button type="button" onclick={() => app.takeSnapshot()}>Use this list for new lines in this session</button>
		</p>
	{/if}
	{#if entries.length > 0}
		<table>
			<thead><tr><th>Item</th><th class="num">Unit value</th><th></th></tr></thead>
			<tbody>
				{#each entries as [name, price] (name)}
					<tr>
						<td>{name}</td>
						<td class="num">
							<input
								aria-label={`Unit value of ${name}`}
								inputmode="decimal"
								value={formatNumber(price).replace(/,/g, '')}
								size="8"
								onchange={(e) => update(name, e.currentTarget.value)}
							/>
						</td>
						<td>
							<button type="button" class="link" onclick={() => app.setPrice(name, null)}>
								Remove<span class="visually-hidden"> {name}</span>
							</button>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{:else}
		<p class="explain">The list is empty. Items without a price are recorded as unpriced.</p>
	{/if}
	<form class="add" onsubmit={add} aria-label="Add a price">
		<input aria-label="Item name" placeholder="Item" bind:value={item} />
		<input aria-label="Unit value" placeholder="Unit value" inputmode="decimal" bind:value={value} size="8" />
		<button type="submit">Add price</button>
	</form>
	{#if error}<p class="error" role="alert">{error}</p>{/if}
</section>

<style>
	.explain {
		color: var(--muted);
		font-size: 0.9rem;
		margin: 0 0 0.6rem;
	}
	.add {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.6rem;
		flex-wrap: wrap;
	}
	.link {
		border: none;
		background: none;
		padding: 0;
		text-decoration: underline;
		color: var(--sand-700);
	}
	td.num input {
		text-align: right;
	}
</style>
