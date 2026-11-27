<script lang="ts">
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<title>dunes-ledger</title>
</svelte:head>

{@render children()}

<style>
	:global(:root) {
		--sand-50: #fbf7f0;
		--sand-100: #f6efe4;
		--sand-200: #eadcc6;
		--sand-300: #d8a05c;
		--sand-500: #b5733a;
		--sand-700: #7c4a1f;
		--ink: #22303c;
		--ink-soft: #4d5965;
		--muted: #6b6257;
		--sun: #f0c26a;
		--good: #2f6b3f;
		--bad: #9a2f22;
		--line: #ddd0bb;
		--radius: 10px;
		color-scheme: light;
		font-family:
			system-ui,
			-apple-system,
			'Segoe UI',
			Roboto,
			sans-serif;
		color: var(--ink);
		background: var(--sand-100);
		line-height: 1.45;
	}
	:global(body) {
		margin: 0;
	}
	:global(*, *::before, *::after) {
		box-sizing: border-box;
	}
	:global(h1, h2, h3) {
		line-height: 1.2;
		margin: 0;
	}
	:global(button, input, select) {
		font: inherit;
		color: inherit;
	}
	:global(button) {
		cursor: pointer;
		border: 1px solid var(--ink-soft);
		background: var(--sand-50);
		border-radius: 6px;
		padding: 0.35rem 0.75rem;
	}
	:global(button:hover) {
		background: var(--sand-200);
	}
	:global(button.primary) {
		background: var(--ink);
		color: var(--sand-50);
		border-color: var(--ink);
	}
	:global(button.primary:hover) {
		background: #33475a;
	}
	:global(button:disabled) {
		opacity: 0.55;
		cursor: not-allowed;
	}
	:global(input, select) {
		border: 1px solid #b9ab95;
		border-radius: 6px;
		padding: 0.35rem 0.5rem;
		background: #fff;
		min-width: 0;
	}
	:global(:focus-visible) {
		outline: 3px solid #3b82c4;
		outline-offset: 2px;
	}
	:global(.visually-hidden) {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
		border: 0;
	}
	:global(.panel) {
		background: var(--sand-50);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 1rem 1.1rem;
	}
	:global(.panel > h2) {
		font-size: 1.05rem;
		margin-bottom: 0.75rem;
	}
	:global(table) {
		border-collapse: collapse;
		width: 100%;
	}
	:global(th, td) {
		text-align: left;
		padding: 0.35rem 0.5rem;
		border-bottom: 1px solid var(--line);
		vertical-align: top;
	}
	:global(th) {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--muted);
	}
	:global(td.num, th.num) {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	:global(.error) {
		color: var(--bad);
	}
</style>
