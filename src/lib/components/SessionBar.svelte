<script lang="ts">
	import type { LedgerApp } from '../app/ledger.svelte';
	import { plural } from './text';

	let { app }: { app: LedgerApp } = $props();

	let creating = $state(false);
	let league = $state('');
	let strategy = $state('');

	function openNew() {
		league = app.active?.league ?? '';
		strategy = app.active?.strategy ?? '';
		creating = true;
	}

	async function create(event: SubmitEvent) {
		event.preventDefault();
		await app.startSession({ league, strategy });
		creating = false;
	}

	async function onFile(event: Event & { currentTarget: HTMLInputElement }) {
		const input = event.currentTarget;
		const file = input.files?.[0];
		if (!file) return;
		const text = await file.text();
		input.value = '';
		await app.importFile(file.name, text);
	}

	function exportFile() {
		const result = app.exportActive();
		if (!result) return;
		const url = URL.createObjectURL(new Blob([result.text], { type: 'application/json' }));
		const a = document.createElement('a');
		a.href = url;
		a.download = result.fileName;
		document.body.append(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
		app.announcement = `Exported ${result.fileName}.`;
	}
</script>

<div class="bar">
	{#if app.sessions.length > 0}
		<label class="pick">
			<span>Session</span>
			<select value={app.activeId} onchange={(e) => app.selectSession(e.currentTarget.value)}>
				{#each app.sessions as s (s.id)}
					<option value={s.id}>
						{s.strategy || 'Untitled'}{s.league ? ` · ${s.league}` : ''} · {plural(s.runs.length, 'map')}{s.synthetic
							? ' · sample'
							: ''}
					</option>
				{/each}
			</select>
		</label>
		<button type="button" onclick={openNew}>New session</button>
	{/if}
	<label class="file">
		<input type="file" accept=".json,application/json" onchange={onFile} data-testid="import-input" />
		<span>Import session…</span>
	</label>
	{#if app.active}
		<button type="button" onclick={exportFile}>Export session</button>
	{/if}
</div>

{#if creating}
	<form class="new" onsubmit={create} aria-label="New session">
		<label>League <input name="league" bind:value={league} placeholder="e.g. Standard" /></label>
		<label class="grow">Map strategy <input name="strategy" bind:value={strategy} placeholder="e.g. Dunes, 4 scarabs" /></label>
		<button type="submit" class="primary">Start session</button>
		<button type="button" onclick={() => (creating = false)}>Cancel</button>
	</form>
{/if}

<style>
	.bar {
		color: var(--ink);
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}
	.pick {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.pick > span {
		font-size: 0.85rem;
		color: #d9e2ea;
	}
	select {
		max-width: 28rem;
	}
	.file {
		position: relative;
		display: inline-block;
	}
	.file input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
		width: 100%;
	}
	.file span {
		display: inline-block;
		border: 1px solid var(--ink-soft);
		background: var(--sand-50);
		border-radius: 6px;
		padding: 0.35rem 0.75rem;
	}
	.file:focus-within span {
		outline: 3px solid #3b82c4;
		outline-offset: 2px;
	}
	.new {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		align-items: end;
		margin-top: 0.75rem;
		padding: 0.75rem;
		background: var(--sand-50);
		border-radius: var(--radius);
		color: var(--ink);
	}
	.new label {
		display: flex;
		flex-direction: column;
		font-size: 0.85rem;
	}
	.grow {
		flex: 1 1 14rem;
	}
</style>
