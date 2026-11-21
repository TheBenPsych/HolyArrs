<!-- Harbor's Today: one sentence that says how things are, the few things that
     need you (with the buttons right there), and a line of today's arrivals.
     Sits at the top of the HolyArrs home page; HolyArrs's own rows stay below.
     Design: harbor-5-from-scratch, screen 1. -->
<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import { api } from '#lib/core/api.ts';
	import { to } from '#lib/core/paths.ts';
	import { sized } from '#lib/core/tmdb-image.ts';
	import type { CalendarEntry, HealthCheck, LibraryFolder } from '#lib/core/types.ts';
	import { createBoardData } from './board-data.svelte.ts';
	import { KIND_WORD, type BoardCard } from './board.ts';
	import { ago, arrivals, clock, dayLine, todayFacts, todaySentence, LINE_HOURS, LINE_START } from './today.ts';
	import HarborAnswer from './HarborAnswer.svelte';

	const data = createBoardData();
	let calendar = $state<CalendarEntry[]>([]);
	let freeBytes = $state<number | null>(null);
	let broken = $state<string[] | null>(null);

	// "Not now" hides a request from Today for this visit; it stays on the Board.
	const LATER_KEY = 'harbor.today.later';
	let later = $state(new Set<string>());
	function readLater() {
		try {
			later = new Set(JSON.parse(sessionStorage.getItem(LATER_KEY) ?? '[]'));
		} catch {
			later = new Set();
		}
	}
	function notNow(key: string) {
		later = new Set([...later, key]);
		try {
			sessionStorage.setItem(LATER_KEY, JSON.stringify([...later]));
		} catch {
			// Private windows: it is hidden until the page is left.
		}
	}

	const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	async function loadSide() {
		const now = new Date();
		const tomorrow = new Date(now.getTime() + 86_400_000);
		const [c, f, h] = await Promise.all([
			api.get<{ dates: CalendarEntry[] | null }>(`/calendar?from=${ymd(now)}&to=${ymd(tomorrow)}`).catch(() => null),
			data.manager ? api.get<{ library_folders: LibraryFolder[] }>('/library-folders').catch(() => null) : Promise.resolve(null),
			data.manager ? api.get<{ checks: HealthCheck[] }>('/health/checks').catch(() => null) : Promise.resolve(null)
		]);
		calendar = c?.dates ?? [];
		// Folders on one disk report the same free space, so the largest is the honest number.
		const frees = (f?.library_folders ?? []).map((x) => x.free_space).filter((n) => n > 0);
		freeBytes = frees.length ? Math.max(...frees) : null;
		broken = h ? h.checks.filter((x) => x.state === 'error' && (x.kind === 'source' || x.kind === 'downloader' || x.kind === 'library_folder')).map((x) => x.subject || 'A connection') : null;
	}

	onMount(() => {
		readLater();
		void data.load();
		void loadSide();
		const t = setInterval(() => void loadSide(), 120_000);
		return () => clearInterval(t);
	});

	const facts = $derived(todayFacts(data.cards, data.now, data.approver));
	const sentence = $derived(todaySentence(facts));
	const line = $derived(dayLine(data.now, freeBytes, broken));
	const needs = $derived<BoardCard[]>([
		...(data.approver ? data.cards.filter((c) => c.lane === 'asked' && !later.has(c.key)) : []),
		...data.cards.filter((c) => c.trouble)
	]);
	const NEEDS_SHOWN = 4;
	const dots = $derived(arrivals(data.cards, calendar, data.now));
	const nowX = $derived(Math.max(0, Math.min(100, ((data.now.getHours() + data.now.getMinutes() / 60 - LINE_START) / LINE_HOURS) * 100)));
	const ticks = [
		{ h: 6, label: '6 AM', minor: false },
		{ h: 9, label: '9', minor: true },
		{ h: 12, label: 'Noon', minor: false },
		{ h: 15, label: '3 PM', minor: true },
		{ h: 18, label: '6', minor: false },
		{ h: 21, label: '9', minor: true },
		{ h: 24, label: 'Midnight', minor: false }
	];
	const tickX = (h: number) => ((h - LINE_START) / LINE_HOURS) * 100;
	const names = $derived(dots.slice(0, 6));
	const more = $derived(dots.length - names.length);

	function whoLine(c: BoardCard): string {
		const bits = [c.who ? `${c.who} asked ${ago(c.at, data.now)}` : '', KIND_WORD[c.kind], c.line].filter(Boolean);
		return bits.join(' · ');
	}
</script>

<section class="harbor-today" aria-label="Today" data-testid="harbor-today">
	{#if data.loaded}
		<p class="sentence" data-testid="harbor-sentence">
			{#each sentence as b, i (i)}{#if b.tone}<strong class="tone-{b.tone}">{b.text}</strong>{:else}{b.text}{/if}{/each}
		</p>
		<p class="day">{line}</p>
	{:else}
		<p class="sentence loading" aria-busy="true">Looking at how things are…</p>
	{/if}

	{#if needs.length}
		<ul class="needs" data-testid="harbor-needs">
			{#each needs.slice(0, NEEDS_SHOWN) as c (c.key)}
				<li class="need" class:bad={!!c.trouble}>
					<a class="art" href={to(c.href)} aria-hidden="true" tabindex="-1">
						{#if c.poster}<img src={sized(c.poster, 'poster', 56)} alt="" loading="lazy" decoding="async" />{:else}<Icon name={c.kind === 'music' ? 'music' : c.kind === 'show' ? 'tv' : 'film'} size={20} />{/if}
					</a>
					<div class="words">
						<a class="name" href={to(c.href)}>{c.name}</a>
						<span class="sub">{c.trouble ?? whoLine(c)}</span>
					</div>
					<div class="acts">
						{#if c.lane === 'asked' && !c.trouble && c.askId}
							<HarborAnswer name={c.name} onanswer={(yes, note) => void data.answer(c.askId!, yes, note)} onlater={() => notNow(c.key)} />
						{:else}
							<a class="open" href={to(c.href)}>Take a look<Icon name="chevronRight" size={14} /></a>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
		{#if needs.length > NEEDS_SHOWN}<a class="all" href={to('/board')}>{needs.length - NEEDS_SHOWN} more on the Board<Icon name="chevronRight" size={14} /></a>{/if}
	{/if}

	<div class="arrivals" data-testid="harbor-arrivals">
		<div class="head">
			<h2>Today's arrivals</h2>
			<span class="links"><a href={to('/board')}>Board<Icon name="chevronRight" size={14} /></a><a href={to('/calendar')}>Calendar<Icon name="chevronRight" size={14} /></a></span>
		</div>
		<div class="track" role="img" aria-label={dots.length ? `${dots.filter((d) => d.landed).length} landed and ${dots.filter((d) => !d.landed).length} still expected today` : 'Nothing on the line today yet'}>
			<span class="rule"></span>
			<span class="past" style:width="{nowX}%"></span>
			{#each ticks as tk (tk.h)}<span class="tick" class:first={tk.h === 6} class:last={tk.h === 24} class:minor={tk.minor} style:left="{tickX(tk.h)}%"><span>{tk.label}</span></span>{/each}
			<span class="now" style:left="{nowX}%"><span>Now {clock(data.now)}</span></span>
			{#each dots as d (d.key)}<span class="dot" class:landed={d.landed} style:left="{d.x}%" title="{d.name}, {d.landed ? 'landed' : 'expected'} {clock(d.at)}"></span>{/each}
		</div>
		<p class="names">
			{#if names.length}
				{#each names as d, i (d.key)}{#if i}<span class="sep">,&nbsp;</span>{/if}<a href={to(d.href ?? '/board')} class:landed={d.landed}>{d.name}</a><span class="when">&nbsp;{d.landed ? clock(d.at) : `due ${clock(d.at)}`}</span>{/each}{#if more > 0}<span class="sep">&nbsp;and {more} more</span>{/if}
			{:else}
				Nothing has landed yet today, and nothing else is due before midnight.
			{/if}
		</p>
		<p class="key"><span class="k landed"></span>Landed <span class="k"></span>Expected</p>
	</div>
</section>

<style>
	.harbor-today {
		--sea: color-mix(in srgb, var(--info) 9%, var(--surface-1));
		--sand: color-mix(in srgb, var(--wait) 10%, var(--surface-1));
		display: grid; gap: 18px; margin: 8px 0 32px;
	}
	.sentence { max-width: 52ch; margin: 0; font: 600 clamp(22px, 2.4vw, 30px)/1.3 var(--font-display); color: var(--text); }
	.sentence.loading { color: var(--text-faint); }
	.sentence strong { font-weight: 700; }
	.sentence .tone-need { color: var(--accent-text); }
	.sentence .tone-moving { color: var(--info-text); }
	.sentence .tone-landed { color: var(--ok-text); }
	.sentence .tone-bad { color: var(--fail-text); }
	.day { margin: -8px 0 0; font: 500 14px/1.4 var(--font-ui); color: var(--text-muted); }

	.needs { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
	.need { display: grid; grid-template-columns: 44px 1fr auto; align-items: center; gap: 14px; padding: 12px 16px; border: 1px solid var(--line); border-inline-start: 4px solid var(--accent); border-radius: 14px; background: var(--surface-1); box-shadow: var(--shadow-card); }
	.need.bad { border-inline-start-color: var(--fail); }
	.art { display: grid; place-items: center; width: 44px; height: 64px; overflow: hidden; border-radius: 8px; background: var(--sea); color: var(--text-muted); }
	.art img { width: 100%; height: 100%; object-fit: cover; }
	.words { display: grid; gap: 3px; min-width: 0; }
	.name { font: 600 17px/1.25 var(--font-display); color: var(--text); text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.name:hover { text-decoration: underline; }
	.sub { font: 500 13px/1.35 var(--font-ui); color: var(--text-muted); }
	.need.bad .sub { color: var(--fail-text); }
	.open, .all, .links a { display: inline-flex; align-items: center; gap: 2px; font: 600 14px/1 var(--font-ui); color: var(--accent-text); text-decoration: none; }
	.open:hover, .all:hover, .links a:hover { text-decoration: underline; }
	.all { justify-self: start; margin-top: -6px; }

	.arrivals { padding: 18px 20px 14px; border: 1px solid var(--line); border-radius: 16px; background: var(--sea); }
	.head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
	.head h2 { margin: 0; font: 600 18px/1.2 var(--font-display); color: var(--text); }
	.links { display: inline-flex; gap: 16px; }
	.track { position: relative; height: 58px; margin: 14px 8px 0; }
	.rule, .past { position: absolute; top: 14px; left: 0; height: 3px; border-radius: 3px; }
	.rule { right: 0; background: color-mix(in srgb, var(--text) 14%, transparent); }
	.past { background: color-mix(in srgb, var(--ok) 60%, transparent); }
	.tick { position: absolute; top: 10px; width: 1px; height: 11px; background: color-mix(in srgb, var(--text) 25%, transparent); }
	.tick span { position: absolute; top: 18px; left: 50%; transform: translateX(-50%); font: 500 11px/1 var(--font-ui); color: var(--text-faint); white-space: nowrap; }
	.tick.first span { transform: none; left: 0; }
	.tick.last span { transform: translateX(-100%); left: 0; }
	.now { position: absolute; top: 2px; width: 2px; height: 27px; background: var(--accent); }
	.now span { position: absolute; top: 34px; left: 50%; transform: translateX(-50%); padding: 2px 6px; border-radius: 999px; background: var(--accent-soft); font: 700 11px/1.2 var(--font-ui); color: var(--accent-text); white-space: nowrap; }
	.dot { position: absolute; top: 9px; width: 13px; height: 13px; margin-left: -6.5px; border: 2px solid var(--info); border-radius: 50%; background: var(--surface-1); }
	.dot.landed { border-color: var(--ok); background: var(--ok); }
	.names { margin: 10px 0 0; font: 500 14px/1.5 var(--font-ui); color: var(--text-muted); }
	.names a { color: var(--text); font-weight: 600; text-decoration: none; }
	.names a:hover { text-decoration: underline; }
	.names .when { color: var(--text-faint); }
	.key { display: flex; align-items: center; gap: 6px; margin: 8px 0 0; font: 500 12px/1 var(--font-ui); color: var(--text-faint); }
	.k { width: 10px; height: 10px; border: 2px solid var(--info); border-radius: 50%; margin-inline-start: 8px; }
	.k:first-child { margin-inline-start: 0; }
	.k.landed { border-color: var(--ok); background: var(--ok); }

	@media (max-width: 767px) {
		.need { grid-template-columns: 40px 1fr; }
		.art { width: 40px; height: 58px; }
		.need .acts { grid-column: 1 / -1; }
		.tick.minor span { display: none; }
		.arrivals { padding: 16px 14px 12px; }
	}
	@media (prefers-reduced-motion: no-preference) {
		.need { animation: rise var(--dur, 200ms) var(--ease-out, ease-out) both; }
		@keyframes rise { from { opacity: 0; transform: translateY(6px); } }
	}
</style>
