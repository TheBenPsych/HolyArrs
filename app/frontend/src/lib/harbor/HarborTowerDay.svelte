<!-- Harbor's Tower: today's jobs as one line from midnight to midnight, with a
     dot for each run (what already ran, what is running and what runs next)
     and a glowing "Now". Jobs that run more often than every hour are listed
     under the line. Design: harbor-11 idea "jobline". -->
<script lang="ts">
	import type { ScheduleRow } from '#lib/health/index.ts';
	import { clock, dayLine, labelRows, nextUp } from './tower-bold.ts';

	let { schedules, now }: { schedules: ScheduleRow[]; now: number } = $props();

	const line = $derived(dayLine(schedules, now));
	const next = $derived(nextUp(line));
	const rows = $derived(labelRows(line.points.map((p) => p.x)));
	// Labels sit above or below the line (labelRows), so close dots do not cover each other.
	const HOURS = [0, 6, 12, 18];
	const word = { done: 'Ran', next: 'Runs', fail: 'Failed', now: 'Running now' } as const;
</script>

<section class="day glass" aria-label="Today's jobs" data-testid="tower-day">
	<div class="head">
		<h2>Today <span>{line.points.length ? `${line.points.length} ${line.points.length === 1 ? 'run' : 'runs'} on the line` : 'Nothing on the line today'}</span></h2>
		{#if next}<p class="nextup">Next up: <strong>{next.name}</strong> at {next.time}</p>{/if}
	</div>
	<div class="track-wrap">
		<div class="track" role="list">
			<span class="rail" aria-hidden="true"></span>
			<span class="past" aria-hidden="true" style:width="{line.now * 100}%"></span>
			{#each HOURS as h (h)}<span class="hour" aria-hidden="true" style:left="{(h / 24) * 100}%">{clock(new Date(new Date(now).setHours(h, 0, 0, 0)).getTime())}</span>{/each}
			<span class="nowmark" style:left="{line.now * 100}%" aria-hidden="true"><i></i><b>Now</b></span>
			{#each line.points as p, i (p.kind + p.at)}
				<span class="pt {p.state}" class:low={rows[i] === 'down'} class:quiet={rows[i] === 'none'} role="listitem" style:left="{p.x * 100}%" title="{word[p.state]}: {p.name} · {p.time}">
					<i aria-hidden="true"></i>
					<span class="pl"><b>{p.name}</b><em>{p.time}</em></span>
					<span class="sr-only">{word[p.state]}: {p.name} at {p.time}</span>
				</span>
			{/each}
		</div>
	</div>
	{#if line.often.length}
		<div class="often">
			<p class="lbl">All day long</p>
			<ul>
				{#each line.often as o (o.kind)}<li class={o.state}><i aria-hidden="true"></i>{o.name} <em>{o.every}</em></li>{/each}
			</ul>
		</div>
	{/if}
	<p class="key"><span class="k done"></span>Ran <span class="k now"></span>Running <span class="k next"></span>Coming up <span class="k fail"></span>Failed</p>
</section>

<style>
	.glass { border: 1px solid var(--harbor-edge); background: var(--harbor-glass); -webkit-backdrop-filter: blur(18px) saturate(140%); backdrop-filter: blur(18px) saturate(140%); }
	.day { display: grid; gap: 12px; padding: 18px 20px 14px; border-radius: 22px; min-width: 0; }
	.head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 6px 16px; }
	h2 { display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px; margin: 0; font: 700 21px/1.2 var(--font-display); letter-spacing: -0.015em; color: var(--text); }
	h2 span { font: 600 14px/1.2 var(--font-ui); letter-spacing: 0; color: var(--text-muted); }
	.nextup { margin: 0; font: 500 14px/1.3 var(--font-ui); color: var(--text-muted); }
	.nextup strong { color: var(--text); }
	.lbl { margin: 0; font: 700 12px/1.3 var(--font-ui); letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); }

	/* The line scrolls sideways on narrow screens instead of squeezing the labels together. */
	.track-wrap { overflow-x: auto; margin: 0 -20px; padding: 0 20px; scrollbar-width: thin; }
	.track { position: relative; min-width: 1000px; height: 162px; margin: 0 50px; }
	.rail, .past { position: absolute; left: 0; top: 74px; height: 3px; border-radius: 3px; }
	.rail { right: 0; background: var(--harbor-glass-2); }
	.past { background: var(--harbor-grad); box-shadow: 0 0 12px rgb(157 107 255 / 50%); }
	.hour { position: absolute; top: 142px; transform: translateX(-50%); font: 600 11px/1 var(--font-ui); color: var(--text-faint); white-space: nowrap; }
	.hour::before { content: ''; position: absolute; left: 50%; top: -60px; height: 6px; border-left: 1px solid var(--harbor-edge); }
	.nowmark { position: absolute; top: 62px; transform: translateX(-50%); display: grid; justify-items: center; z-index: 2; pointer-events: none; }
	.nowmark i { width: 4px; height: 28px; border-radius: 4px; background: var(--text); box-shadow: 0 0 12px var(--text); }
	.nowmark b { margin-top: 30px; padding: 3px 8px; border-radius: 99px; background: var(--text); color: var(--bg); font: 800 11px/1 var(--font-ui); }
	.pt { position: absolute; top: 66px; transform: translateX(-50%); display: grid; justify-items: center; width: 110px; z-index: 1; }
	.pt i { width: 18px; height: 18px; border-radius: 50%; background: var(--c); box-shadow: 0 0 12px var(--c); border: 3px solid color-mix(in srgb, var(--bg) 70%, transparent); box-sizing: border-box; }
	.pt.next i { background: color-mix(in srgb, var(--c) 30%, var(--bg)); border-color: var(--c); }
	.pt .pl { position: absolute; bottom: 24px; display: grid; justify-items: center; gap: 1px; text-align: center; }
	.pt.low .pl { bottom: auto; top: 24px; }
	.pt.quiet .pl { display: none; }
	.pl b { font: 700 13px/1.2 var(--font-ui); color: var(--text); white-space: nowrap; max-width: 110px; overflow: hidden; text-overflow: ellipsis; }
	.pl em { font: 500 12px/1.2 var(--font-ui); font-style: normal; color: var(--text-muted); }
	.done, .k.done { --c: var(--harbor-mint); }
	.next, .k.next { --c: var(--harbor-sky); }
	.fail, .k.fail { --c: var(--harbor-red); }
	.pt.now, .k.now { --c: var(--harbor-violet); }
	.pt.now i { animation: beat 1.4s ease-in-out infinite alternate; }
	@keyframes beat { to { transform: scale(1.25); } }

	.often { display: grid; gap: 8px; }
	.often ul { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; list-style: none; }
	.often li { display: inline-flex; align-items: center; gap: 8px; height: 32px; padding: 0 12px; border-radius: 99px; border: 1px solid var(--harbor-edge); background: var(--harbor-glass-2); font: 600 13px/1 var(--font-ui); color: var(--text); --c: var(--harbor-mint); }
	.often li.now { --c: var(--harbor-violet); }
	.often li.fail { --c: var(--harbor-red); }
	.often li i { width: 9px; height: 9px; border-radius: 50%; background: var(--c); box-shadow: 0 0 8px var(--c); }
	.often em { font-style: normal; font-weight: 500; color: var(--text-muted); }
	.key { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0; font: 500 12px/1.4 var(--font-ui); color: var(--text-faint); }
	.k { display: inline-block; width: 10px; height: 10px; margin-left: 8px; border-radius: 50%; background: var(--c); }
	.k:first-child { margin-left: 0; }
	@media (prefers-reduced-motion: reduce) {
		.pt.now i { animation: none; }
	}
</style>
