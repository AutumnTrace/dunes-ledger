<script lang="ts">
	import { asset } from '$app/paths';
	import { onMount } from 'svelte';
	import { LedgerApp } from '#lib/app/ledger.svelte.ts';
	import CurrentMap from '#lib/components/CurrentMap.svelte';
	import ImportStatus from '#lib/components/ImportStatus.svelte';
	import PriceList from '#lib/components/PriceList.svelte';
	import RunsTable from '#lib/components/RunsTable.svelte';
	import SessionBar from '#lib/components/SessionBar.svelte';
	import Summary from '#lib/components/Summary.svelte';
	import { openLedger } from '#lib/storage/db.ts';

	const app = new LedgerApp();
	let league = $state('');
	let strategy = $state('');

	onMount(() => {
		let closed = false;
		let close = () => {};
		openLedger()
			.then(async (store) => {
				close = () => store.close();
				if (closed) return close();
				await app.init(store);
			})
			.catch((error: unknown) => {
				app.loadError = error instanceof Error ? error.message : String(error);
			});
		return () => {
			closed = true;
			close();
		};
	});

	async function start(event: SubmitEvent) {
		event.preventDefault();
		await app.startSession({ league, strategy });
	}
</script>

<header class="top">
	<div class="brand">
		<img src={asset('icons/icon.svg')} alt="" width="40" height="40" />
		<div>
			<h1>dunes-ledger</h1>
			<p>A farming journal: what the session made, what a typical map made, and why.</p>
		</div>
	</div>
	{#if app.ready}<SessionBar {app} />{/if}
</header>

<main>
	<p class="visually-hidden" aria-live="polite" data-testid="announcement">{app.announcement}</p>

	{#if app.loadError}
		<section class="panel">
			<h2>Storage is not available</h2>
			<p class="error">
				This browser refused to open local storage ({app.loadError}). Private windows in some browsers block IndexedDB; a normal
				window should work.
			</p>
		</section>
	{:else if !app.ready}
		<p class="loading">Opening your journal…</p>
	{:else}
		<ImportStatus {app} />

		{#if !app.active}
			<section class="panel welcome" aria-labelledby="welcome-heading">
				<h2 id="welcome-heading">No sessions yet</h2>
				<p>
					Record each map as you finish it: what it cost, how long it took, what dropped. The journal keeps two numbers
					apart: what the whole session made, and what a typical map made. One lucky drop moves the first and barely
					touches the second.
				</p>
				<div class="choices">
					<div>
						<h3>See it with example data</h3>
						<p>Ten invented five-minute maps, one of them with a single large drop.</p>
						<button type="button" class="primary" onclick={() => app.loadSample()}>Load the synthetic sample</button>
					</div>
					<form onsubmit={start} aria-label="Start a session">
						<h3>Start your own session</h3>
						<label>League <input name="league" bind:value={league} placeholder="e.g. Standard" /></label>
						<label>Map strategy <input name="strategy" bind:value={strategy} placeholder="e.g. Dunes, 4 scarabs" /></label>
						<button type="submit">Start session</button>
					</form>
				</div>
			</section>
		{:else}
			{#if app.active.synthetic}
				<p class="synthetic" role="note" data-testid="synthetic-note">
					<strong>Synthetic sample.</strong>
					{(app.active.note ?? 'Invented data for trying the app, not observed drop rates or prices.').replace(
						/^Synthetic sample\.\s*/,
						''
					)}
				</p>
			{/if}
			{#if app.summary}<Summary session={app.active} summary={app.summary} />{/if}
			<div class="work">
				<CurrentMap {app} />
				<PriceList {app} />
			</div>
			{#if app.summary}<RunsTable {app} session={app.active} summary={app.summary} />{/if}
		{/if}
	{/if}
</main>

<footer>
	<p>
		Data stays in this browser (IndexedDB) and works offline once the page has loaded. Item names are plain text typed by
		the player; no game assets are used. Not affiliated with or endorsed by Grinding Gear Games.
	</p>
</footer>

<style>
	.top {
		background: var(--ink);
		color: var(--sand-50);
		padding: 0.9rem 1.25rem;
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem 1.5rem;
		align-items: center;
		justify-content: space-between;
	}
	.brand {
		display: flex;
		gap: 0.75rem;
		align-items: center;
	}
	.brand h1 {
		font-size: 1.25rem;
	}
	.brand p {
		margin: 0;
		font-size: 0.85rem;
		color: #c9d3dc;
	}
	main {
		max-width: 72rem;
		margin: 0 auto;
		padding: 1rem 1.25rem 2rem;
		display: grid;
		gap: 1rem;
	}
	.work {
		display: grid;
		grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
		gap: 1rem;
		align-items: start;
	}
	@media (max-width: 860px) {
		.work {
			grid-template-columns: 1fr;
		}
	}
	.synthetic {
		margin: 0;
		padding: 0.55rem 0.85rem;
		border-radius: var(--radius);
		background: #e8eef3;
		border: 1px dashed var(--ink-soft);
		font-size: 0.9rem;
	}
	.welcome .choices {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
		gap: 1rem;
	}
	.welcome h3 {
		font-size: 0.95rem;
		margin-bottom: 0.3rem;
	}
	.welcome form {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		align-items: flex-start;
	}
	.welcome label {
		display: flex;
		flex-direction: column;
		font-size: 0.85rem;
		width: 100%;
	}
	.loading {
		color: var(--muted);
	}
	footer {
		max-width: 72rem;
		margin: 0 auto;
		padding: 0 1.25rem 2rem;
		color: var(--muted);
		font-size: 0.8rem;
	}
</style>
