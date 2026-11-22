<!-- Harbor's Board in the bold look (design harbor-10 screen 4; build list
     part 4): every request as a poster card moving through five glowing
     lanes, from Asked to Landed. On top, "All done by about 9:40 PM" for
     everything coming in, with the download speed. Coming in cards have
     "Do this first", and on a phone a waiting request can be swiped right to
     approve or left for no. Tap a card to open its story (HolyArrs's request
     window or Downloads). Phones show one lane at a time. -->
<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import { to } from '#lib/core/paths.ts';
	import { sized } from '#lib/core/tmdb-image.ts';
	import { createBoardData } from './board-data.svelte.ts';
	import { LANES, KIND_WORD, byLane, doneBy, doneByLead, doneByTime, etaWords, filterCards, putFirst, speedWords, type BoardCard, type BoardFilter, type Lane } from './board.ts';
	import { ago, clock, ringPercent } from './today.ts';
	import { swipeCard } from './swipe.ts';
	import HarborAnswer from './HarborAnswer.svelte';

	const data = createBoardData();
	onMount(() => void data.load());

	let filter = $state<BoardFilter>('all');
	let troubleOnly = $state(false);
	let phoneLane = $state<Lane>('asked');
	let showAllLanded = $state(false);
	const LANDED_SHOWN = 5;

	const kinds = $derived(new Set(data.cards.map((c) => c.kind)));
	const hasItself = $derived(data.cards.some((c) => c.byItself));
	const chips = $derived<{ id: BoardFilter; label: string }[]>([
		{ id: 'all', label: 'Everything' },
		...(hasItself ? [{ id: 'people' as const, label: 'Asked by people' }, { id: 'itself' as const, label: 'By itself' }] : []),
		...(kinds.has('movie') ? [{ id: 'movie' as const, label: 'Movies' }] : []),
		...(kinds.has('show') ? [{ id: 'show' as const, label: 'Shows' }] : []),
		...(kinds.has('music') ? [{ id: 'music' as const, label: 'Music' }] : [])
	]);
	const troubled = $derived(data.cards.filter((c) => c.trouble));
	const lanes = $derived(byLane(filterCards(data.cards, filter, troubleOnly)));
	const coming = $derived(putFirst(lanes.coming, data.firsts));
	const landedToday = $derived(lanes.landed.filter((c) => c.at && new Date(c.at).toDateString() === data.now.toDateString()).length);
	const done = $derived(doneBy(data.cards, data.now));

	// Swipe only where it makes sense: a phone-sized screen with a touch.
	let phone = $state(false);
	onMount(() => {
		const mq = window.matchMedia('(max-width: 767px)');
		const set = () => (phone = mq.matches);
		set();
		mq.addEventListener('change', set);
		return () => mq.removeEventListener('change', set);
	});

	function sub(c: BoardCard): string {
		if (c.lane === 'asked') return [c.who ? `${c.who} · ${ago(c.at, data.now)}` : '', KIND_WORD[c.kind], c.line].filter(Boolean).join(' · ');
		if (c.lane === 'landed') return [c.at ? clock(new Date(c.at)) : '', c.who && !c.byItself ? `${c.who} was told` : '', c.line].filter(Boolean).join(' · ');
		if (c.lane === 'coming') return [c.who && !c.byItself ? c.who : '', c.eta ? `${etaWords(c.eta)} left` : c.line === c.trouble ? '' : c.line].filter(Boolean).join(' · ');
		return [c.who && !c.byItself ? c.who : '', c.line === c.trouble ? '' : c.line].filter(Boolean).join(' · ');
	}
	const isFirst = (c: BoardCard) => data.firsts.has(c.key) || !!c.first;
	const laneCount = (id: Lane) => (id === 'landed' ? landedToday : lanes[id].length);
	const laneCountWord = (id: Lane) => (id === 'landed' ? `${landedToday} today` : String(lanes[id].length));
	const laneList = (id: Lane) => (id === 'coming' ? coming : id === 'landed' && !showAllLanded ? lanes.landed.slice(0, LANDED_SHOWN) : lanes[id]);
	const R = 15;
	const L = 2 * Math.PI * R;
</script>

<svelte:head><title>Board · HolyArrs</title></svelte:head>

{#snippet poster(src: string | undefined, title: string, w: number)}
	<span class="po" style:width="{w}px" style:height="{Math.round(w * 1.5)}px" aria-hidden="true">
		{#if src}<img src={sized(src, 'poster', w * 2)} alt="" loading="lazy" decoding="async" />{:else}<span class="po-name">{title}</span>{/if}
	</span>
{/snippet}

<div class="harbor-board" data-testid="harbor-board">
	<header class="top">
		<div class="head-words">
			<h1>Board</h1>
			<p class="lede">Every request, from asked to on Glowfin.</p>
		</div>
		{#if troubled.length}
			<div class="trouble-pill glass" data-testid="harbor-trouble">
				<i class="dot" aria-hidden="true"></i>
				<span class="tp-words"><b>{troubled.length === 1 ? troubled[0].name : `${troubled.length} in trouble`}</b> <span>{troubled.length === 1 ? troubled[0].trouble : troubled.map((c) => c.name).slice(0, 3).join(', ')}</span></span>
				<button type="button" class="hbtn sm" aria-pressed={troubleOnly} onclick={() => (troubleOnly = !troubleOnly)} data-testid="harbor-trouble-chip">{troubleOnly ? 'Show everything' : troubled.length === 1 ? 'Show only it' : 'Show only these'}</button>
			</div>
		{/if}
	</header>

	{#if done}
		<section class="done glass" aria-label="Coming in" data-testid="harbor-done-by">
			<span class="done-glow" aria-hidden="true"></span>
			<div class="done-row">
				<div class="done-words">
					<p class="lbl">Coming in</p>
					{#if done.at}
						<p class="done-when">{doneByLead(done.count)} <span class="grad">{doneByTime(done.at, data.now)}</span></p>
					{:else}
						<p class="done-when">{done.count === 1 ? '1 thing is' : `${done.count} things are`} coming in <span class="quiet-time">waiting for the Downloader to start</span></p>
					{/if}
				</div>
				{#if done.speed > 0}
					<div class="speed">
						<span class="speed-n">{speedWords(done.speed)}</span>
						<span class="speed-l">download speed</span>
					</div>
				{/if}
			</div>
			<span class="prog" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(done.progress * 100)} aria-label="Everything coming in"><i style:width="{Math.round(done.progress * 100)}%"></i></span>
		</section>
	{/if}

	<div class="filters" role="toolbar" aria-label="Show">
		{#each chips as c (c.id)}
			<button type="button" class="hchip" aria-pressed={filter === c.id} onclick={() => (filter = c.id)}>{c.label}</button>
		{/each}
	</div>

	<div class="phone-lanes" role="tablist" aria-label="Lane">
		{#each LANES as l (l.id)}
			<button type="button" role="tab" class="lane-tab {l.id}" aria-selected={phoneLane === l.id} onclick={() => (phoneLane = l.id)}>{l.name}<span class="n">{laneCount(l.id)}</span></button>
		{/each}
	</div>

	{#if !data.loaded}
		<p class="quiet" aria-busy="true">Reading the requests…</p>
	{:else if data.failed && !data.cards.length}
		<p class="quiet">Could not read the requests: {data.failed}. <button type="button" class="link" onclick={() => void data.load()}>Try again</button></p>
	{:else}
		<div class="lanes">
			{#each LANES as l (l.id)}
				{@const list = laneList(l.id)}
				<section class="lane glass {l.id}" class:phone-on={phoneLane === l.id} aria-labelledby="lane-{l.id}" data-testid="lane-{l.id}">
					<span class="lane-glow" aria-hidden="true"></span>
					<header class="lane-head">
						<h2 id="lane-{l.id}">{l.name}</h2>
						<span class="count">{laneCountWord(l.id)}</span>
						<p class="hint">{l.hint}</p>
					</header>
					{#if l.id === 'asked' && phone && data.approver && list.some((c) => c.askId)}
						<p class="swipe-hint" data-testid="harbor-swipe-hint"><Icon name="chevronLeft" size={14} />No · swipe · Approve<Icon name="chevronRight" size={14} /></p>
					{/if}
					{#if list.length}
						<ul class="cards">
							{#each list as c (c.key)}
								{@const p = ringPercent(c)}
								{@const canSwipe = phone && c.lane === 'asked' && data.approver && !!c.askId}
								<li
									class="bcard"
									class:bad={!!c.trouble}
									class:first={c.lane === 'coming' && isFirst(c)}
									use:swipeCard={{ on: canSwipe, onanswer: (yes) => data.answerSoon(c.askId!, yes) }}
								>
									<span class="swipe-word yes" aria-hidden="true"><Icon name="check" size={16} />Approve</span>
									<span class="swipe-word no" aria-hidden="true">No<Icon name="x" size={16} /></span>
									<a class="hit" href={to(c.href)} aria-label="{c.name}: open its story"></a>
									<span class="art">
										{@render poster(c.poster, c.name, 56)}
										{#if p != null && c.lane === 'coming'}
											<span class="ring">
												<svg viewBox="0 0 36 36" aria-hidden="true"><circle class="ring-bg" cx="18" cy="18" r={R} /><circle class="ring-fg" cx="18" cy="18" r={R} stroke-dasharray="{(L * p) / 100} {L}" /></svg>
												<span>{p}%</span>
											</span>
										{/if}
									</span>
									<div class="words">
										<span class="name">{c.name}</span>
										<span class="sub">{sub(c)}</span>
										{#if c.lane === 'coming' && isFirst(c)}<span class="tag first-tag"><Icon name="sparkle" size={12} />First in line</span>{/if}
										{#if c.byItself}<span class="tag">By itself</span>{/if}
										{#if c.trouble}<span class="why">{c.trouble}</span>{/if}
										{#if c.lane === 'coming' && !isFirst(c) && data.manager && c.canAct && c.downloadId != null}
											<button type="button" class="hbtn sm firstup" onclick={() => void data.first(c)} aria-label="Do {c.name} first">
												<Icon name="chevronUp" size={14} />Do this first
											</button>
										{/if}
									</div>
									{#if c.lane === 'asked' && data.approver && c.askId}
										<div class="acts"><HarborAnswer small name={c.name} onanswer={(yes, note) => void data.answer(c.askId!, yes, note)} /></div>
									{/if}
								</li>
							{/each}
						</ul>
						{#if l.id === 'landed' && lanes.landed.length > LANDED_SHOWN}
							<button type="button" class="link more" onclick={() => (showAllLanded = !showAllLanded)}>{showAllLanded ? 'Show fewer' : `Show the other ${lanes.landed.length - LANDED_SHOWN}`}</button>
						{/if}
					{:else}
						<p class="empty">{l.id === 'asked' ? 'Nothing waiting for a yes.' : l.id === 'landed' ? 'Nothing landed in the last 3 days.' : 'Nothing here right now.'}</p>
					{/if}
				</section>
			{/each}
		</div>
	{/if}

	<p class="deeper">
		Want every detail? The full <a href={to('/requests')}>Requests</a> and <a href={to('/downloads')}>Downloads</a> pages are still here, as tabs at the top.
	</p>
</div>

<style>
	.harbor-board { padding: 24px 0 48px; }
	.glass { border: 1px solid var(--harbor-edge); background: var(--harbor-glass); -webkit-backdrop-filter: blur(18px) saturate(140%); backdrop-filter: blur(18px) saturate(140%); }

	.top { display: flex; flex-wrap: wrap; align-items: center; gap: 16px 24px; }
	.top h1 { margin: 0; font: 800 clamp(32px, 3.4vw, 42px)/1.05 var(--font-display); letter-spacing: -0.025em; color: var(--text); }
	.lede { margin: 6px 0 0; font: 500 15px/1.4 var(--font-ui); color: var(--text-muted); }
	.trouble-pill { display: flex; align-items: center; gap: 12px; margin-inline-start: auto; max-width: 100%; padding: 8px 8px 8px 16px; border-color: color-mix(in srgb, var(--harbor-red) 50%, transparent); border-radius: 999px; box-shadow: 0 0 24px color-mix(in srgb, var(--harbor-red) 22%, transparent); }
	.trouble-pill .dot { flex: none; width: 10px; height: 10px; border-radius: 50%; background: var(--harbor-red); box-shadow: 0 0 10px var(--harbor-red); }
	.tp-words { min-width: 0; overflow: hidden; font: 500 14px/1.3 var(--font-ui); text-overflow: ellipsis; white-space: nowrap; color: var(--text); }
	.tp-words span { color: var(--text-muted); }

	.hbtn { display: inline-flex; flex: none; align-items: center; gap: 6px; min-height: 36px; padding: 0 16px; border: 1px solid var(--harbor-edge); border-radius: 999px; background: var(--harbor-glass-2); color: var(--text); font: 700 13px/1 var(--font-ui); cursor: pointer; }
	.hbtn:hover { background: color-mix(in srgb, var(--text) 14%, transparent); }
	.hbtn.sm { min-height: 30px; padding: 0 12px; font-size: 12px; }
	.hbtn[aria-pressed='true'] { background: var(--harbor-red); border-color: var(--harbor-red); color: #fff; }

	/* All done by… */
	.done { position: relative; margin-top: 22px; padding: 18px 22px 20px; overflow: hidden; border-radius: 24px; }
	.done-glow { position: absolute; inset: -60% -10% auto auto; width: 420px; height: 260px; border-radius: 50%; background: radial-gradient(closest-side, color-mix(in srgb, var(--harbor-sky) 40%, transparent), transparent); pointer-events: none; }
	.done-row { position: relative; display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px 24px; }
	.done-words { min-width: 0; }
	.lbl { margin: 0; font: 700 12px/1.3 var(--font-ui); letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); }
	.done-when { margin: 4px 0 0; font: 800 clamp(22px, 2.6vw, 30px)/1.15 var(--font-display); letter-spacing: -0.02em; color: var(--text); }
	.grad { background: var(--harbor-grad); -webkit-background-clip: text; background-clip: text; color: transparent; }
	.quiet-time { display: block; margin-top: 4px; font: 500 14px/1.3 var(--font-ui); letter-spacing: 0; color: var(--text-muted); }
	.speed { display: grid; justify-items: end; margin-inline-start: auto; white-space: nowrap; }
	.speed-n { font: 800 26px/1 var(--font-display); color: var(--harbor-aqua); text-shadow: 0 0 18px color-mix(in srgb, var(--harbor-aqua) 50%, transparent); }
	.speed-l { margin-top: 4px; font: 500 12px/1 var(--font-ui); color: var(--text-muted); }
	.prog { position: relative; display: block; height: 10px; margin-top: 16px; overflow: hidden; border-radius: 9px; background: color-mix(in srgb, var(--text) 12%, transparent); }
	.prog i { display: block; height: 100%; border-radius: 9px; background: var(--harbor-grad); box-shadow: 0 0 14px color-mix(in srgb, var(--harbor-violet) 60%, transparent); transition: width 600ms ease; }

	.filters { display: flex; flex-wrap: wrap; gap: 8px; margin: 20px 0 18px; }
	.hchip { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 16px; border: 1px solid var(--harbor-edge); border-radius: 999px; background: var(--harbor-glass); color: var(--text); font: 600 13px/1 var(--font-ui); cursor: pointer; }
	.hchip:hover { background: var(--harbor-glass-2); }
	.hchip[aria-pressed='true'] { border-color: var(--harbor-chip-on); background: var(--harbor-chip-on); color: var(--harbor-chip-on-text); }
	.hchip:focus-visible, .hbtn:focus-visible, .lane-tab:focus-visible, .link:focus-visible { outline: none; box-shadow: var(--focus-ring); }

	/* Lanes: each glows its own colour along the top. */
	.asked { --c: var(--harbor-pink); }
	.looking { --c: var(--harbor-amber); }
	.coming { --c: var(--harbor-sky); }
	.inspection { --c: var(--harbor-violet); }
	.landed { --c: var(--harbor-mint); }
	.phone-lanes { display: none; }
	.lanes { display: grid; grid-template-columns: repeat(5, minmax(200px, 1fr)); gap: 16px; align-items: start; overflow-x: auto; padding-bottom: 8px; }
	.lane { position: relative; display: grid; gap: 10px; min-width: 0; min-height: 320px; align-content: start; padding: 14px 12px; overflow: hidden; border-radius: 24px; }
	.lane-glow { position: absolute; top: 0; left: 0; right: 0; height: 4px; background: var(--c); box-shadow: 0 0 22px 4px var(--c); }
	.lane-head { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 2px 8px; padding: 6px 4px 2px; }
	.lane-head h2 { margin: 0; font: 700 19px/1.2 var(--font-display); letter-spacing: -0.01em; color: var(--text); }
	.count { display: grid; place-items: center; min-width: 26px; height: 26px; padding: 0 8px; border-radius: 999px; background: var(--c); color: #0b1220; font: 800 13px/1 var(--font-ui); box-shadow: 0 0 14px color-mix(in srgb, var(--c) 50%, transparent); }
	.hint { grid-column: 1 / -1; margin: 0; font: 500 12px/1.3 var(--font-ui); color: var(--text-muted); }
	.cards { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }

	.bcard { --dx: 0px; position: relative; display: grid; grid-template-columns: 56px 1fr; gap: 8px 12px; padding: 10px; border-radius: 18px; background: var(--harbor-glass-2); transform: translateX(var(--dx)) rotate(calc(var(--dx) / 60)); transition: transform 260ms var(--ease-out, ease-out), box-shadow 160ms ease, background 160ms ease; }
	.bcard:hover { background: color-mix(in srgb, var(--text) 13%, transparent); }
	.bcard.bad { box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--harbor-red) 70%, transparent); }
	.bcard.first { background: color-mix(in srgb, var(--harbor-pink) 14%, transparent); box-shadow: 0 0 0 1px var(--harbor-pink), 0 0 22px -4px var(--harbor-pink); }
	.hit { position: absolute; inset: 0; z-index: 0; border-radius: inherit; }
	.hit:focus-visible { outline: none; box-shadow: var(--focus-ring); }
	.art { position: relative; align-self: start; }
	.po { position: relative; display: grid; place-items: end center; overflow: hidden; border-radius: 10px; background: linear-gradient(160deg, color-mix(in srgb, var(--harbor-violet) 55%, #0b1220), color-mix(in srgb, var(--harbor-pink) 40%, #0b1220)); box-shadow: 0 6px 16px rgb(0 0 0 / 30%); }
	.po img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
	.po-name { padding: 6px 4px; font: 700 10px/1.05 var(--font-poster); letter-spacing: 0.04em; text-align: center; text-transform: uppercase; color: #fff; overflow-wrap: anywhere; }
	.ring { position: absolute; right: -8px; bottom: -8px; display: grid; place-items: center; width: 36px; height: 36px; }
	.ring svg { position: absolute; inset: 0; width: 100%; height: 100%; transform: rotate(-90deg); }
	.ring-bg { fill: rgb(6 11 18 / 80%); stroke: rgb(255 255 255 / 18%); stroke-width: 3.5; }
	.ring-fg { fill: none; stroke: var(--harbor-aqua); stroke-width: 3.5; stroke-linecap: round; filter: drop-shadow(0 0 3px var(--harbor-aqua)); transition: stroke-dasharray 600ms ease; }
	.ring > span { position: relative; font: 800 9px/1 var(--font-ui); color: #fff; }
	.words { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
	.name { font: 700 14px/1.25 var(--font-display); color: var(--text); overflow-wrap: anywhere; }
	.sub { font: 500 12px/1.35 var(--font-ui); color: var(--text-muted); }
	.tag { display: inline-flex; align-self: flex-start; align-items: center; gap: 4px; margin-top: 2px; padding: 3px 8px; border-radius: 999px; background: color-mix(in srgb, var(--harbor-sky) 18%, transparent); font: 700 11px/1.2 var(--font-ui); color: var(--info-text); }
	.first-tag { background: var(--harbor-pink); color: #fff; box-shadow: 0 0 12px color-mix(in srgb, var(--harbor-pink) 55%, transparent); }
	.why { font: 600 12px/1.35 var(--font-ui); color: var(--fail-text); }
	/* Buttons sit above the card's link. */
	.firstup { position: relative; z-index: 1; align-self: flex-start; margin-top: 6px; }
	.acts { position: relative; z-index: 1; grid-column: 1 / -1; }

	/* The phone swipe: the card follows the finger and glows the answer it will give. */
	.swipe-word { position: absolute; top: 10px; right: 10px; z-index: 2; display: none; align-items: center; gap: 4px; padding: 6px 12px; border-radius: 999px; font: 800 13px/1 var(--font-display); color: #0b1220; pointer-events: none; }
	.swipe-word.yes { background: var(--harbor-mint); box-shadow: 0 0 16px var(--harbor-mint); }
	.swipe-word.no { background: var(--harbor-red); box-shadow: 0 0 16px var(--harbor-red); }
	.bcard:global(.swiping) { transition: none; }
	.bcard:global([data-swipe='yes']) { box-shadow: 0 0 0 2px var(--harbor-mint), 0 0 32px color-mix(in srgb, var(--harbor-mint) 45%, transparent); }
	.bcard:global([data-swipe='no']) { box-shadow: 0 0 0 2px var(--harbor-red), 0 0 32px color-mix(in srgb, var(--harbor-red) 45%, transparent); }
	.bcard:global([data-swipe='yes']) .swipe-word.yes, .bcard:global([data-swipe='no']) .swipe-word.no { display: inline-flex; }
	.bcard:global(.gone) { opacity: 0; transition: transform 260ms ease-in, opacity 260ms ease-in; }
	.swipe-hint { display: flex; align-items: center; justify-content: center; gap: 4px; margin: 0; font: 600 12px/1 var(--font-ui); color: var(--text-muted); }

	.empty, .quiet { margin: 0; padding: 4px; font: 500 13px/1.4 var(--font-ui); color: var(--text-muted); }
	.quiet { padding: 24px 0; font-size: 15px; }
	.link { padding: 0; border: 0; background: none; color: var(--accent-text); font: 600 13px/1.2 var(--font-ui); cursor: pointer; }
	.more { justify-self: start; padding: 4px; }
	.deeper { margin: 28px 0 0; font: 500 13px/1.5 var(--font-ui); color: var(--text-faint); }
	.deeper a { color: var(--accent-text); font-weight: 600; }

	@media (prefers-reduced-motion: reduce) {
		.bcard, .prog i, .ring-fg { transition: none; }
	}
	@media (max-width: 1099px) {
		.lanes { grid-template-columns: repeat(5, 250px); }
	}
	@media (max-width: 767px) {
		.harbor-board { padding: 16px 16px 110px; }
		.top { flex-direction: column; align-items: stretch; }
		.trouble-pill { margin-inline-start: 0; }
		.done { margin-top: 16px; padding: 14px 16px 16px; }
		.done-row { flex-wrap: nowrap; align-items: flex-end; }
		.done-when { font-size: 20px; }
		.speed-n { font-size: 17px; }
		.speed-l { font-size: 11px; }
		.filters { flex-wrap: nowrap; overflow-x: auto; margin: 14px -16px 12px; padding: 0 16px 4px; scrollbar-width: none; }
		.hchip { flex: none; }
		.phone-lanes { display: flex; gap: 6px; overflow-x: auto; margin: 0 -16px 14px; padding: 0 16px 4px; scrollbar-width: none; }
		.lane-tab { display: inline-flex; align-items: center; gap: 6px; flex: none; min-height: 38px; padding: 0 14px; border: 1px solid var(--harbor-edge); border-radius: 999px; background: var(--harbor-glass); color: var(--text-muted); font: 600 14px/1 var(--font-ui); cursor: pointer; }
		.lane-tab[aria-selected='true'] { border-color: var(--c); color: var(--text); box-shadow: 0 0 0 1px var(--c), 0 0 18px -4px var(--c); }
		.lane-tab .n { display: grid; place-items: center; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px; background: var(--c); color: #0b1220; font: 800 11px/1 var(--font-ui); }
		.lanes { display: block; overflow: visible; }
		.lane { display: none; min-height: 0; }
		.lane.phone-on { display: grid; }
		/* Vertical scrolling stays the page's; sideways is the swipe. */
		.asked .bcard { touch-action: pan-y; }
		.bcard { grid-template-columns: 64px 1fr; }
	}
</style>
