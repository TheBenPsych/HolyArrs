<!-- Harbor's Today, in the bold look (design harbor-10, screen 1; build list
     part 2): a big greeting with four glowing counts, who is watching on
     Glowfin right now, the requests that need your yes as big picture cards,
     On the way as posters with filling rings, Landed today, and the new
     episodes coming in the next 24 hours. Sits at the top of the HolyArrs
     home page; HolyArrs's own rows stay below. -->
<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import { api } from '#lib/core/api.ts';
	import { to } from '#lib/core/paths.ts';
	import { session } from '#lib/core/session.svelte.ts';
	import { sized } from '#lib/core/tmdb-image.ts';
	import type { CalendarEntry, HealthCheck, LibraryFolder } from '#lib/core/types.ts';
	import { createBoardData } from './board-data.svelte.ts';
	import { KIND_WORD, etaWords, sameDay, type BoardCard } from './board.ts';
	import { ago, clock, dayLine, greetWord, nextDay, ringPercent, todayFacts, wayLine } from './today.ts';
	import HarborAnswer from './HarborAnswer.svelte';

	interface Watching { who: string; device: string; name: string; episode?: string; kind: string; percent: number; paused: boolean; title_id?: number; poster?: string }

	const data = createBoardData();
	let calendar = $state<CalendarEntry[]>([]);
	let freeBytes = $state<number | null>(null);
	let broken = $state<string[] | null>(null);
	let watching = $state<Watching[]>([]);
	let watchServers = $state(0);

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
	// Who is watching: asked of Glowfin's server every 20 seconds while Today is open.
	async function loadWatching() {
		if (!data.manager) return;
		const w = await api.get<{ watching: Watching[] | null; servers: number }>('/media-servers/watching').catch(() => null);
		watching = w?.watching ?? [];
		watchServers = w?.servers ?? 0;
	}

	onMount(() => {
		readLater();
		void data.load();
		void loadSide();
		void loadWatching();
		const t = setInterval(() => void loadSide(), 120_000);
		const w = setInterval(() => void loadWatching(), 20_000);
		return () => {
			clearInterval(t);
			clearInterval(w);
		};
	});

	const facts = $derived(todayFacts(data.cards, data.now, data.approver));
	const line = $derived(dayLine(data.now, freeBytes, broken));
	const name = $derived(session.s.name ? session.s.name.charAt(0).toUpperCase() + session.s.name.slice(1) : '');
	const asks = $derived<BoardCard[]>(data.approver ? data.cards.filter((c) => c.lane === 'asked' && !c.trouble && !later.has(c.key)) : []);
	const trouble = $derived<BoardCard[]>(data.cards.filter((c) => c.trouble));
	const needs = $derived([...asks, ...trouble]);
	const NEEDS_SHOWN = 3;
	const way = $derived<BoardCard[]>(
		data.cards
			.filter((c) => c.lane === 'looking' || c.lane === 'coming' || c.lane === 'inspection')
			.sort((a, b) => (a.eta ?? 1e12) - (b.eta ?? 1e12))
	);
	const landed = $derived<BoardCard[]>(data.cards.filter((c) => c.lane === 'landed' && c.at && sameDay(new Date(c.at), data.now)).sort((a, b) => Date.parse(b.at!) - Date.parse(a.at!)));
	const soon = $derived(nextDay(calendar, data.now));
	const nextEta = $derived(facts.nextEta);

	const counts = $derived([
		{ n: facts.needYou - facts.trouble, label: 'need you', tone: 'pink', href: '/board' },
		{ n: facts.onTheWay, label: 'on the way', tone: 'sky', href: '/board' },
		{ n: facts.landedToday, label: 'landed today', tone: 'mint', href: '/board' },
		{ n: facts.trouble, label: 'in trouble', tone: 'red', href: '/board' }
	]);

	function whoLine(c: BoardCard): string {
		return [KIND_WORD[c.kind].replace(/^./, (x) => x.toUpperCase()), c.line].filter(Boolean).join(' · ');
	}
	const R = 17;
	const L = 2 * Math.PI * R;
</script>

{#snippet poster(src: string | undefined, title: string, w: number)}
	<span class="po" style:width="{w}px" style:height="{Math.round(w * 1.5)}px">
		{#if src}<img src={sized(src, 'poster', w * 2)} alt="" loading="lazy" decoding="async" />{:else}<span class="po-name">{title}</span>{/if}
	</span>
{/snippet}

<section class="harbor-today" aria-label="Today" data-testid="harbor-today">
	<header class="hello">
		<div class="hello-words">
			<p class="lbl">{line}</p>
			<h1 class="greet" data-testid="harbor-greeting">{greetWord(data.now)}{name ? `, ${name}` : ''}</h1>
		</div>
		<div class="counts" data-testid="harbor-counts" aria-busy={!data.loaded}>
			{#each counts as c (c.label)}
				<a class="count glass tone-{c.tone}" class:zero={data.loaded && !c.n} href={to(c.href)}>
					<span class="blob" aria-hidden="true"></span>
					<span class="n">{data.loaded ? c.n : '–'}</span>
					<span class="l">{c.label}</span>
				</a>
			{/each}
		</div>
	</header>

	{#if watching.length}
		<div class="block" data-testid="harbor-watching">
			<h2>Watching on Glowfin now <span>{watching.length === 1 ? '1 person' : `${watching.length} people`}</span></h2>
			<div class="rail">
				{#each watching as w, i (i)}
					<a class="watch glass" href={w.title_id ? to(`/library/${w.title_id}`) : undefined}>
						{@render poster(w.poster, w.name, 58)}
						<span class="watch-words">
							<span class="watch-who"><span class="av">{w.who.charAt(0).toUpperCase()}</span><b>{w.who}</b><span class="live" class:paused={w.paused} title={w.paused ? 'Paused' : 'Playing'}></span>{#if w.paused}<span class="paused-word">Paused</span>{/if}</span>
							<span class="watch-title">{w.name}</span>
							<span class="watch-sub">{[w.episode, w.device].filter(Boolean).join(' · ')}</span>
							<span class="bar"><i style:width="{w.percent}%"></i></span>
						</span>
					</a>
				{/each}
			</div>
		</div>
	{:else if watchServers > 0}
		<p class="quiet-line" data-testid="harbor-watching-none"><span class="live off"></span>Nobody is watching on Glowfin right now.</p>
	{/if}

	{#if data.loaded}
		<div class="block">
			<h2>
				{trouble.length && !asks.length ? 'Needs a look' : 'Needs your yes'}
				<span>{[asks.length ? `${asks.length} ${asks.length === 1 ? 'ask' : 'asks'}` : '', trouble.length ? `${trouble.length} in trouble` : ''].filter(Boolean).join(' · ') || 'all clear'}</span>
				<a href={to('/board')}>All on the Board<Icon name="chevronRight" size={14} /></a>
			</h2>
			{#if needs.length}
				<div class="asks" data-testid="harbor-needs">
					{#each needs.slice(0, NEEDS_SHOWN) as c (c.key)}
						<article class="ask" class:bad={!!c.trouble}>
							<span class="ask-bg" aria-hidden="true">{#if c.poster}<img src={sized(c.poster, 'poster', 200)} alt="" loading="lazy" decoding="async" />{/if}</span>
							<span class="ask-fade" aria-hidden="true"></span>
							<a class="ask-po" href={to(c.href)} tabindex="-1" aria-hidden="true">{@render poster(c.poster, c.name, 96)}</a>
							<div class="ask-words">
								<a class="ask-name" href={to(c.href)}>{c.name}</a>
								<span class="ask-kind">{whoLine(c)}</span>
								{#if c.trouble}
									<span class="ask-trouble">{c.trouble}</span>
								{:else if c.who}
									<span class="ask-who"><span class="av">{c.who.charAt(0).toUpperCase()}</span><b>{c.who}</b><span class="muted">asked {ago(c.at, data.now)}</span></span>
								{/if}
								<div class="ask-acts">
									{#if c.lane === 'asked' && !c.trouble && c.askId}
										<HarborAnswer name={c.name} onanswer={(yes, note) => void data.answer(c.askId!, yes, note)} onlater={() => notNow(c.key)} />
									{:else}
										<a class="look" href={to(c.href)}>Take a look<Icon name="chevronRight" size={14} /></a>
									{/if}
								</div>
							</div>
						</article>
					{/each}
				</div>
				{#if needs.length > NEEDS_SHOWN}<a class="more" href={to('/board')}>{needs.length - NEEDS_SHOWN} more on the Board<Icon name="chevronRight" size={14} /></a>{/if}
			{:else}
				<p class="empty glass">Nothing needs your yes right now.</p>
			{/if}
		</div>

		<div class="two">
			<div class="block way">
				<h2>On the way <span>{way.length ? (nextEta != null ? `next lands in ${etaWords(nextEta)}` : `${way.length} moving`) : 'nothing right now'}</span></h2>
				{#if way.length}
					<div class="rail" data-testid="harbor-way">
						{#each way as c (c.key)}
							{@const p = ringPercent(c)}
							<a class="way-card" href={to(c.href)}>
								<span class="way-art">
									{@render poster(c.poster, c.name, 124)}
									{#if p != null}
										<span class="ring" class:done={p === 100}>
											<svg viewBox="0 0 42 42" aria-hidden="true"><circle class="ring-bg" cx="21" cy="21" r={R} /><circle class="ring-fg" cx="21" cy="21" r={R} stroke-dasharray="{(L * p) / 100} {L}" /></svg>
											<span>{p === 100 ? '' : `${p}%`}{#if p === 100}<Icon name="check" size={14} />{/if}</span>
										</span>
									{:else}
										<span class="shimmer" aria-hidden="true"></span>
									{/if}
								</span>
								<span class="cap">{c.name}<small class:bad={!!c.trouble}>{wayLine(c)}</small></span>
							</a>
						{/each}
					</div>
				{:else}
					<p class="empty glass">Nothing is on the way. New episodes show up here as soon as Harbor finds them.</p>
				{/if}
			</div>
			<div class="block landed">
				<h2>Landed today <span>{landed.length ? `${landed.length}` : ''}</span></h2>
				{#if landed.length}
					<ul class="landed-list" data-testid="harbor-landed">
						{#each landed.slice(0, 5) as c (c.key)}
							<li>
								<a class="landed-row glass" href={to(c.href)}>
									{@render poster(c.poster, c.name, 40)}
									<span class="landed-words"><b>{c.name}</b><small>{[c.line, c.at ? clock(new Date(c.at)) : '', c.who ? `${c.who} was told` : ''].filter(Boolean).join(' · ')}</small></span>
									<span class="tick"><Icon name="check" size={16} /></span>
								</a>
							</li>
						{/each}
					</ul>
					{#if landed.length > 5}<a class="more" href={to('/board')}>{landed.length - 5} more on the Board<Icon name="chevronRight" size={14} /></a>{/if}
				{:else}
					<p class="empty glass">Nothing has landed yet today.</p>
				{/if}
			</div>
		</div>

		{#if soon.length}
			<div class="block" data-testid="harbor-next-day">
				<h2>Next 24 hours <span>Harbor will grab these by itself</span><a href={to('/calendar')}>Calendar<Icon name="chevronRight" size={14} /></a></h2>
				<div class="rail">
					{#each soon as s (s.key)}
						<a class="way-card soon" href={to(s.href)}>
							<span class="way-art">{@render poster(s.poster, s.name, 112)}<span class="badge">{s.when.split(' ')[0]}</span></span>
							<span class="cap">{s.name}<small>{[s.ep, s.when].filter(Boolean).join(' · ')}</small></span>
						</a>
					{/each}
				</div>
			</div>
		{/if}
	{:else}
		<p class="quiet-line" aria-busy="true">Looking at how things are…</p>
	{/if}
</section>

<style>
	/* The HolyArrs greeting and buttons above Today: Today has its own greeting and the top menu has the search. */
	:global(.home > .top.harbor-hide) { display: none; }

	.harbor-today { display: grid; gap: 26px; margin: 4px 0 40px; }
	.glass { border: 1px solid var(--harbor-edge); background: var(--harbor-glass); -webkit-backdrop-filter: blur(18px) saturate(140%); backdrop-filter: blur(18px) saturate(140%); }

	.hello { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 20px; }
	.hello-words { min-width: 0; }
	.lbl { margin: 0; font: 700 12px/1.3 var(--font-ui); letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); }
	.greet { margin: 6px 0 0; font: 800 clamp(32px, 4vw, 46px)/1.05 var(--font-display); letter-spacing: -0.025em; color: var(--text); }
	.counts { display: flex; flex-wrap: wrap; gap: 12px; margin-inline-start: auto; }
	.count { position: relative; display: grid; gap: 2px; min-width: 128px; padding: 12px 18px; overflow: hidden; border-radius: 20px; text-decoration: none; transition: transform var(--dur, 160ms) var(--ease-out, ease-out); }
	.count:hover { transform: translateY(-2px); }
	.count .blob { position: absolute; right: -20px; bottom: -30px; width: 80px; height: 80px; border-radius: 50%; background: var(--c); filter: blur(30px); opacity: 0.6; }
	.count .n { position: relative; font: 800 36px/1 var(--font-display); color: var(--c); text-shadow: 0 0 18px color-mix(in srgb, var(--c) 55%, transparent); }
	.count .l { position: relative; font: 600 13px/1.2 var(--font-ui); color: var(--text-muted); }
	.count.zero { opacity: 0.6; }
	.count.zero .blob { opacity: 0.25; }
	.tone-pink { --c: var(--harbor-pink); }
	.tone-sky { --c: var(--harbor-sky); }
	.tone-mint { --c: var(--harbor-mint); }
	.tone-red { --c: var(--harbor-red); }

	.block { display: grid; gap: 12px; min-width: 0; }
	h2 { display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px; margin: 0; font: 700 21px/1.2 var(--font-display); letter-spacing: -0.015em; color: var(--text); }
	h2 span { font: 600 14px/1.2 var(--font-ui); letter-spacing: 0; color: var(--text-muted); }
	h2 a, .more, .look { display: inline-flex; align-items: center; gap: 2px; font: 700 14px/1 var(--font-ui); letter-spacing: 0; color: var(--accent-text); text-decoration: none; }
	h2 a { margin-inline-start: auto; }
	h2 a:hover, .more:hover, .look:hover { text-decoration: underline; }
	.more { justify-self: start; }
	.empty { margin: 0; padding: 16px 18px; border-radius: 18px; font: 500 14px/1.4 var(--font-ui); color: var(--text-muted); }
	.quiet-line { display: flex; align-items: center; gap: 8px; margin: -10px 0 0; font: 500 14px/1.4 var(--font-ui); color: var(--text-muted); }

	/* Posters: the real artwork, or the name on a glow when there is none. */
	.po { position: relative; display: grid; flex: none; place-items: end center; overflow: hidden; border-radius: 12px; background: linear-gradient(160deg, color-mix(in srgb, var(--harbor-violet) 55%, #0b1220), color-mix(in srgb, var(--harbor-pink) 40%, #0b1220)); box-shadow: 0 8px 22px rgb(0 0 0 / 30%); }
	.po img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
	.po-name { padding: 8px 6px; font: 700 12px/1.05 var(--font-poster); letter-spacing: 0.04em; text-align: center; text-transform: uppercase; color: #fff; overflow-wrap: anywhere; }

	.rail { display: flex; gap: 14px; overflow-x: auto; padding: 2px 2px 8px; scroll-snap-type: x proximity; scrollbar-width: thin; }
	.rail > * { scroll-snap-align: start; }

	/* Who is watching. */
	.watch { display: flex; flex: none; gap: 14px; align-items: center; width: 330px; max-width: 86vw; padding: 10px 14px 10px 10px; border-radius: 18px; color: var(--text); text-decoration: none; }
	.watch-words { display: grid; flex: 1; gap: 3px; min-width: 0; }
	.watch-who { display: flex; align-items: center; gap: 8px; font: 600 14px/1 var(--font-ui); }
	.watch-title { overflow: hidden; font: 700 16px/1.25 var(--font-display); text-overflow: ellipsis; white-space: nowrap; }
	.watch-sub { overflow: hidden; font: 500 12px/1.3 var(--font-ui); color: var(--text-muted); text-overflow: ellipsis; white-space: nowrap; }
	.bar { height: 6px; margin-top: 5px; overflow: hidden; border-radius: 9px; background: color-mix(in srgb, var(--text) 14%, transparent); }
	.bar i { display: block; height: 100%; border-radius: 9px; background: var(--harbor-grad); }
	.paused-word { font: 600 12px/1 var(--font-ui); color: var(--text-muted); }
	.live { width: 9px; height: 9px; border-radius: 50%; background: var(--harbor-mint); box-shadow: 0 0 10px var(--harbor-mint); }
	.live.paused { background: var(--harbor-amber); box-shadow: 0 0 10px var(--harbor-amber); }
	.live.off { background: var(--text-faint); box-shadow: none; }
	.av { display: grid; flex: none; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: var(--harbor-grad); font: 800 11px/1 var(--font-ui); color: #fff; }

	/* Needs your yes: big picture cards. */
	.asks { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 360px), 1fr)); gap: 16px; }
	.ask { position: relative; display: flex; gap: 16px; min-height: 186px; padding: 16px; overflow: hidden; border-radius: 22px; background: #0b1220; box-shadow: 0 12px 30px rgb(0 0 0 / 40%); color: #f3f7fb; }
	.ask-bg { position: absolute; inset: -10px; }
	.ask-bg img { width: 100%; height: 100%; object-fit: cover; filter: blur(14px) saturate(140%); opacity: 0.85; }
	.ask-fade { position: absolute; inset: 0; background: linear-gradient(90deg, rgb(6 11 18 / 94%) 30%, rgb(6 11 18 / 40%)); }
	.ask.bad { box-shadow: 0 12px 30px rgb(0 0 0 / 40%), inset 0 0 0 2px color-mix(in srgb, var(--harbor-red) 70%, transparent); }
	.ask-po { position: relative; flex: none; align-self: flex-start; }
	.ask-words { position: relative; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
	.ask-name { overflow: hidden; font: 700 20px/1.2 var(--font-display); color: #fff; text-decoration: none; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; }
	.ask-name:hover { text-decoration: underline; }
	.ask-kind { font: 500 13px/1.3 var(--font-ui); color: #a3b2c3; }
	.ask-who { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 6px; font: 500 13px/1.2 var(--font-ui); }
	.ask-who .muted { color: #a3b2c3; }
	.ask-trouble { margin-top: 6px; font: 600 13px/1.35 var(--font-ui); color: #ff8a8a; }
	.ask-acts { margin-top: auto; padding-top: 10px; }
	.ask .look { color: #ff8fc0; }
	/* The answer buttons sit on a dark picture whatever the theme. */
	.ask :global(.harbor-answer .ui-btn.secondary) { background: rgb(255 255 255 / 12%); color: #fff; border-color: rgb(255 255 255 / 18%); }
	.ask :global(.harbor-answer .ui-btn.plain) { color: #d9e2ea; }
	.ask :global(.harbor-answer .why) { color: #a3b2c3; }
	.ask :global(.harbor-answer .hchip) { background: rgb(255 255 255 / 10%); border-color: rgb(255 255 255 / 20%); color: #fff; }

	/* On the way and Landed today side by side. */
	.two { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(280px, 1fr); gap: 28px; align-items: start; }
	.way-card { display: grid; flex: none; align-content: start; gap: 8px; width: 124px; color: var(--text); text-decoration: none; }
	.way-card.soon { width: 112px; }
	.way-art { position: relative; display: block; }
	.way-card:hover .po { transform: translateY(-3px); box-shadow: 0 14px 28px rgb(0 0 0 / 40%); }
	.po { transition: transform var(--dur, 160ms) var(--ease-out, ease-out), box-shadow var(--dur, 160ms); }
	.cap { display: grid; gap: 2px; font: 700 13px/1.25 var(--font-ui); overflow: hidden; }
	.cap small { font: 500 12px/1.3 var(--font-ui); color: var(--text-muted); }
	.cap small.bad { color: var(--fail-text); }
	.ring { position: absolute; right: 8px; bottom: 8px; display: grid; place-items: center; width: 44px; height: 44px; }
	.ring svg { position: absolute; inset: 0; width: 100%; height: 100%; transform: rotate(-90deg); }
	.ring-bg { fill: rgb(6 11 18 / 72%); stroke: rgb(255 255 255 / 18%); stroke-width: 4; }
	.ring-fg { fill: none; stroke: var(--harbor-aqua); stroke-width: 4; stroke-linecap: round; filter: drop-shadow(0 0 4px var(--harbor-aqua)); transition: stroke-dasharray 600ms ease; }
	.ring.done .ring-fg { stroke: var(--harbor-mint); filter: drop-shadow(0 0 4px var(--harbor-mint)); }
	.ring > span { position: relative; display: inline-flex; font: 800 11px/1 var(--font-ui); color: #fff; }
	.shimmer { position: absolute; right: 8px; bottom: 10px; left: 8px; height: 5px; overflow: hidden; border-radius: 9px; background: rgb(255 255 255 / 16%); }
	.shimmer::after { content: ''; position: absolute; inset: 0; width: 40%; border-radius: 9px; background: var(--harbor-grad); }
	.badge { position: absolute; top: 8px; left: 8px; padding: 4px 8px; border-radius: 999px; background: color-mix(in srgb, var(--harbor-sky) 26%, rgb(6 11 18 / 80%)); font: 800 11px/1 var(--font-ui); color: #fff; box-shadow: 0 0 12px color-mix(in srgb, var(--harbor-sky) 45%, transparent); }

	.landed-list { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
	.landed-row { display: flex; align-items: center; gap: 12px; padding: 8px; border-radius: 16px; color: var(--text); text-decoration: none; }
	.landed-row:hover { background: var(--harbor-glass-2); }
	.landed-words { display: grid; flex: 1; gap: 2px; min-width: 0; }
	.landed-words b { overflow: hidden; font: 700 14px/1.25 var(--font-ui); text-overflow: ellipsis; white-space: nowrap; }
	.landed-words small { overflow: hidden; font: 500 12px/1.3 var(--font-ui); color: var(--text-muted); text-overflow: ellipsis; white-space: nowrap; }
	.tick { display: grid; flex: none; place-items: center; width: 28px; height: 28px; margin-inline-end: 6px; border-radius: 50%; background: color-mix(in srgb, var(--harbor-mint) 18%, transparent); color: var(--ok-text); box-shadow: 0 0 14px color-mix(in srgb, var(--harbor-mint) 40%, transparent); }

	@media (max-width: 1100px) {
		.two { grid-template-columns: minmax(0, 1fr); }
	}
	@media (max-width: 767px) {
		.harbor-today { gap: 22px; }
		.counts { display: grid; grid-template-columns: 1fr 1fr; width: 100%; margin: 0; gap: 10px; }
		.count { min-width: 0; padding: 10px 14px; }
		.count .n { font-size: 30px; }
		.ask { min-height: 0; padding: 14px; gap: 12px; }
		.ask-po :global(.po) { width: 72px !important; height: 108px !important; }
	}
	@media (prefers-reduced-motion: no-preference) {
		.shimmer::after { animation: harbor-shimmer 1.6s ease-in-out infinite; }
		@keyframes harbor-shimmer { from { transform: translateX(-100%); } to { transform: translateX(250%); } }
		.live:not(.off):not(.paused) { animation: harbor-pulse 2s ease-in-out infinite; }
		@keyframes harbor-pulse { 50% { opacity: 0.45; } }
		.ask, .watch, .count { animation: harbor-rise 260ms var(--ease-out, ease-out) both; }
		@keyframes harbor-rise { from { opacity: 0; transform: translateY(8px); } }
	}
</style>
