<!-- Yes and no for one waiting request, right on the card. A no offers the
     reasons from design 6 (the person sees the reason in Glowfin). -->
<script lang="ts">
	import Button from '#lib/ui/Button.svelte';

	let { name, onanswer, onlater, small = false }: { name: string; onanswer: (yes: boolean, note?: string) => void; onlater?: () => void; small?: boolean } = $props();

	const REASONS = ['Too grown-up', 'Already have something like it', 'Not enough space'];
	let saying = $state(false);
	let own = $state('');
</script>

<div class="harbor-answer" class:small>
	{#if !saying}
		<Button variant="primary" size="sm" icon="check" onclick={() => onanswer(true)} aria-label={`Approve ${name}`}>Approve</Button>
		{#if onlater}<Button variant="secondary" size="sm" onclick={onlater} aria-label={`Not now: ${name}`}>Not now</Button>{/if}
		<Button variant="plain" size="sm" onclick={() => (saying = true)} aria-label={`Say no to ${name}`}>No</Button>
	{:else}
		<span class="why">Say no, with a reason they will see:</span>
		<div class="reasons">
			{#each REASONS as r (r)}<button type="button" class="hchip" onclick={() => onanswer(false, r)}>{r}</button>{/each}
			<form class="own" onsubmit={(e) => { e.preventDefault(); onanswer(false, own.trim()); }}>
				<input bind:value={own} placeholder="Write my own" aria-label="Write my own reason" />
			</form>
			<button type="button" class="hchip quiet" onclick={() => onanswer(false, '')}>Just no</button>
			<button type="button" class="hchip quiet" onclick={() => (saying = false)}>Back</button>
		</div>
	{/if}
</div>

<style>
	.harbor-answer { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
	.why { flex-basis: 100%; font: 500 13px/1.3 var(--font-ui); color: var(--text-muted); }
	.reasons { display: flex; flex-wrap: wrap; gap: 6px; }
	.hchip { min-height: 32px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: 999px; background: var(--surface-1); color: var(--text); font: 500 13px/1 var(--font-ui); cursor: pointer; }
	.hchip:hover { background: var(--surface-2); }
	.hchip.quiet { border-color: transparent; color: var(--text-muted); }
	.own input { width: 150px; min-height: 32px; padding: 0 12px; border: 1px dashed var(--line-strong); border-radius: 999px; background: transparent; color: var(--text); font: 500 13px/1 var(--font-ui); }
	.hchip:focus-visible, .own input:focus-visible { outline: none; box-shadow: var(--focus-ring); }
</style>
