<!-- Harbor's Tower: three live graphs (download speed, how busy the
     processor is, and disk space), so you can see when Tower is working hard.
     Reads /harbor/tower/pulse every 5 seconds while the page is open and in
     view, and /health/disks once a minute; the last 5 minutes are drawn.
     Nothing is stored. Design: harbor-11 idea "speedgraph". -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '#lib/core/api.ts';
	import { speedWords } from './board.ts';
	import { GRAPH_POINTS, cpuWords, diskUse, graphArea, graphPath, keep, sizeWords, type DiskUse, type Pulse } from './tower-bold.ts';

	const W = 240;
	const H = 70;

	let down = $state<number[]>([]);
	let cpu = $state<number[]>([]);
	let last = $state<Pulse | null>(null);
	let failed = $state(false);
	let disk = $state<DiskUse | null>(null);
	let diskRead = $state(false);

	const downLine = $derived(graphPath(down, W, H, 1024 ** 2));
	const cpuLine = $derived(graphPath(cpu.map((v) => Math.max(0, v)), W, H, 100));
	const cpuKnown = $derived((last?.cpu ?? -1) >= 0);

	async function read() {
		try {
			const p = await api.get<Pulse>('/harbor/tower/pulse');
			last = p;
			down = keep(down, p.down_bps);
			cpu = keep(cpu, p.cpu);
			failed = false;
		} catch {
			failed = true;
		}
	}
	async function readDisks() {
		try {
			const r = await api.get<{ disks?: { free_bytes: number; total_bytes: number }[] }>('/health/disks');
			disk = diskUse(r.disks ?? []);
		} catch {
			// The disk card says it could not read.
		} finally {
			diskRead = true;
		}
	}

	onMount(() => {
		void read();
		void readDisks();
		const fast = setInterval(() => {
			if (document.visibilityState === 'visible') void read();
		}, 5000);
		const slow = setInterval(() => {
			if (document.visibilityState === 'visible') void readDisks();
		}, 60_000);
		return () => {
			clearInterval(fast);
			clearInterval(slow);
		};
	});
</script>

<div class="pulse" data-testid="tower-pulse">
	<article class="card glass c-aqua">
		<p class="lbl">Download speed</p>
		<p class="big">{last ? (last.down_bps > 0 ? speedWords(last.down_bps) : 'Quiet') : '…'}</p>
		<p class="sub">{failed ? 'Could not read it just now' : last ? (last.downloading ? `${last.downloading} downloading${last.up_bps > 0 ? ` · sharing ${speedWords(last.up_bps)}` : ''}` : 'Nothing downloading') : 'Reading…'}</p>
		<svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" aria-hidden="true">
			{#if downLine}<path class="area" d={graphArea(downLine, W, H)} /><path class="line" d={downLine} />{/if}
		</svg>
	</article>
	<article class="card glass c-violet">
		<p class="lbl">Processor</p>
		<p class="big">{last ? (cpuKnown ? `${last.cpu}%` : '–') : '…'}</p>
		<p class="sub">{last ? cpuWords(last.cpu) : 'Reading…'}</p>
		<svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" aria-hidden="true">
			{#if cpuKnown && cpuLine}<path class="area" d={graphArea(cpuLine, W, H)} /><path class="line" d={cpuLine} />{/if}
		</svg>
	</article>
	<article class="card glass c-pink">
		<p class="lbl">Disk space</p>
		<p class="big">{disk ? `${disk.percent}% full` : diskRead ? '–' : '…'}</p>
		<p class="sub">{disk ? `${sizeWords(disk.free)} free of ${sizeWords(disk.total)}` : diskRead ? 'No Library folder to measure yet' : 'Reading…'}</p>
		<div class="meter" aria-hidden="true"><span style:width="{disk?.percent ?? 0}%"></span></div>
	</article>
	<p class="note">Live: the last {Math.round((GRAPH_POINTS * 5) / 60)} minutes, a new reading every 5 seconds.</p>
</div>

<style>
	.pulse { display: grid; align-items: stretch; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
	.glass { border: 1px solid var(--harbor-edge); background: var(--harbor-glass); -webkit-backdrop-filter: blur(18px) saturate(140%); backdrop-filter: blur(18px) saturate(140%); }
	.card { position: relative; margin: 0; display: grid; align-content: start; gap: 2px; min-width: 0; padding: 16px 18px 12px; border-radius: 20px; overflow: hidden; }
	.c-aqua { --c: var(--harbor-aqua); }
	.c-violet { --c: var(--harbor-violet); }
	.c-pink { --c: var(--harbor-pink); }
	.lbl { margin: 0; font: 700 12px/1.3 var(--font-ui); letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); }
	.big { margin: 2px 0 0; font: 800 28px/1.1 var(--font-display); letter-spacing: -0.02em; color: var(--c); text-shadow: 0 0 18px color-mix(in srgb, var(--c) 50%, transparent); }
	.sub { margin: 0; font: 500 13px/1.35 var(--font-ui); color: var(--text-muted); overflow-wrap: anywhere; }
	svg { display: block; width: 100%; height: 74px; margin-top: 8px; overflow: visible; }
	.line { fill: none; stroke: var(--c); stroke-width: 2.5; stroke-linecap: round; filter: drop-shadow(0 0 6px var(--c)); vector-effect: non-scaling-stroke; }
	.area { fill: color-mix(in srgb, var(--c) 16%, transparent); stroke: none; }
	.meter { height: 14px; margin: 20px 0 30px; border-radius: 9px; background: var(--harbor-glass-2); overflow: hidden; }
	.meter span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--harbor-violet), var(--harbor-pink)); box-shadow: 0 0 14px var(--harbor-pink); transition: width 600ms var(--ease-out, ease-out); }
	.note { grid-column: 1 / -1; margin: -4px 0 0; font: 500 12px/1.4 var(--font-ui); color: var(--text-faint); }
	@media (max-width: 899px) {
		.pulse { grid-template-columns: 1fr; }
		svg { height: 60px; }
	}
	@media (prefers-reduced-motion: reduce) {
		.meter span { transition: none; }
	}
</style>
