<!-- Harbor's Board: every request as a card moving through five lanes, from
     Asked to Landed. Tap a card to open its story (HolyArrs's request window
     or Downloads). Phones show one lane at a time.
     Design: harbor-5-from-scratch screen 2, harbor-6-board-round2 screen 1. -->
<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import { to } from '#lib/core/paths.ts';
	import { sized } from '#lib/core/tmdb-image.ts';
	import { createBoardData } from './board-data.svelte.ts';
	import { LANES, KIND_WORD, byLane, etaWords, filterCards, type BoardCard, type BoardFilter, type Lane } from './board.ts';
	import { ago, clock } from './today.ts';
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
	const trouble = $derived(data.cards.filter((c) => c.trouble).length);
	const lanes = $derived(byLane(filterCards(data.cards, filter, troubleOnly)));
	const landedToday = $derived(lanes.landed.filter((c) => c.at && new Date(c.at).toDateString() === data.now.toDateString()).length);

	function sub(c: BoardCard): string {
		if (c.lane === 'asked') return [c.who ? `${c.who} asked ${ago(c.at, data.now)}` : '', KIND_WORD[c.kind], c.line].filter(Boolean).join(' · ');
		if (c.lane === 'landed') return [c.at ? clock(new Date(c.at)) : '', c.who && !c.byItself ? `${c.who} was told` : '', c.line].filter(Boolean).join(' · ');
		return [c.who && !c.byItself ? c.who : '', c.line === c.trouble ? '' : c.line, c.eta ? etaWords(c.eta) : ''].filter(Boolean).join(' · ');
	}
	const laneCount = (id: Lane) => (id === 'landed' ? landedToday : lanes[id].length);
	const laneCountWord = (id: Lane) => (id === 'landed' ? `${landedToday} today` : String(lanes[id].length));
</script>

<svelte:head><title>Board · HolyArrs</title></svelte:head>

<div class="harbor-board" data-testid="harbor-board">
	<header class="top">
		<h1>Board</h1>
		<p class="lede">Every request, from asked to on Glowfin.</p>
	</header>

	<div class="filters" role="toolbar" aria-label="Show">
		{#each chips as c (c.id)}
			<button type="button" class="hchip" aria-pressed={filter === c.id} onclick={() => (filter = c.id)}>{c.label}</button>
		{/each}
		{#if trouble}
			<button type="button" class="hchip trouble" aria-pressed={troubleOnly} onclick={() => (troubleOnly = !troubleOnly)} data-testid="harbor-trouble-chip"><Icon name="alert" size={14} />{trouble} in trouble</button>
		{/if}
	</div>

	<div class="phone-lanes" role="tablist" aria-label="Lane">
		{#each LANES as l (l.id)}
			<button type="button" role="tab" class="lane-tab" aria-selected={phoneLane === l.id} onclick={() => (phoneLane = l.id)}>{l.name}<span class="n">{laneCount(l.id)}</span></button>
		{/each}
	</div>

	{#if !data.loaded}
		<p class="quiet" aria-busy="true">Reading the requests…</p>
	{:else if data.failed && !data.cards.length}
		<p class="quiet">Could not read the requests: {data.failed}. <button type="button" class="link" onclick={() => void data.load()}>Try again</button></p>
	{:else}
		<div class="lanes">
			{#each LANES as l (l.id)}
				{@const list = l.id === 'landed' && !showAllLanded ? lanes.landed.slice(0, LANDED_SHOWN) : lanes[l.id]}
				<section class="lane {l.id}" class:phone-on={phoneLane === l.id} aria-labelledby="lane-{l.id}" data-testid="lane-{l.id}">
					<header class="lane-head">
						<h2 id="lane-{l.id}">{l.name}</h2>
						<span class="count">{laneCountWord(l.id)}</span>
						<p class="hint">{l.hint}</p>
					</header>
					{#if list.length}
						<ul class="cards">
							{#each list as c (c.key)}
								<li class="card" class:bad={!!c.trouble}>
									<a class="hit" href={to(c.href)} aria-label="{c.name}: open its story"></a>
									<span class="art" aria-hidden="true">
										{#if c.poster}<img src={sized(c.poster, 'poster', 40)} alt="" loading="lazy" decoding="async" />{:else}<Icon name={c.kind === 'music' ? 'music' : c.kind === 'show' ? 'tv' : 'film'} size={16} />{/if}
									</span>
									<div class="words">
										<span class="name">{c.name}</span>
										<span class="sub">{sub(c)}</span>
										{#if c.byItself}<span class="tag">By itself</span>{/if}
										{#if c.trouble}<span class="why">{c.trouble}</span>{/if}
									</div>
									{#if c.progress != null && c.lane === 'coming'}
										<span class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(c.progress * 100)} aria-label="{c.name} downloaded"><span style:width="{Math.round(c.progress * 100)}%"></span></span>
									{/if}
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
		Want every detail? The full <a href={to('/requests')}>Requests</a> and <a href={to('/downloads')}>Downloads</a> pages are still here, under More.
	</p>
</div>

<style>
	.harbor-board {
		--sea: color-mix(in srgb, var(--info) 9%, var(--surface-1));
		--sand: color-mix(in srgb, var(--wait) 11%, var(--surface-1));
		padding: 24px 0 48px;
	}
	.top h1 { margin: 0; font: 700 clamp(30px, 3vw, 40px)/1.1 var(--font-display); color: var(--text); }
	.lede { margin: 6px 0 0; font: 500 15px/1.4 var(--font-ui); color: var(--text-muted); }
	.filters { display: flex; flex-wrap: wrap; gap: 8px; margin: 20px 0 18px; }
	.hchip { display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 0 14px; border: 1px solid var(--line-strong); border-radius: 999px; background: var(--surface-1); color: var(--text); font: 600 13px/1 var(--font-ui); cursor: pointer; }
	.hchip:hover { background: var(--surface-2); }
	.hchip[aria-pressed='true'] { border-color: var(--text); background: var(--text); color: var(--bg); }
	.hchip.trouble { border-color: var(--fail); color: var(--fail-text); }
	.hchip.trouble[aria-pressed='true'] { background: var(--fail); color: #fff; }
	.hchip:focus-visible, .lane-tab:focus-visible, .link:focus-visible { outline: none; box-shadow: var(--focus-ring); }

	.phone-lanes { display: none; }
	.lanes { display: grid; grid-template-columns: repeat(5, minmax(170px, 1fr)); gap: 14px; align-items: start; overflow-x: auto; padding-bottom: 6px; }
	.lane { display: grid; gap: 10px; padding: 14px 12px; border: 1px solid var(--line); border-radius: 16px; background: var(--sea); min-width: 0; }
	.lane.asked { background: var(--surface-1); border-top: 3px solid var(--accent); }
	.lane.landed { background: var(--sand); }
	.lane-head { display: grid; grid-template-columns: 1fr auto; align-items: baseline; gap: 2px 8px; padding: 0 4px; }
	.lane-head h2 { margin: 0; font: 700 17px/1.2 var(--font-display); color: var(--text); }
	.count { font: 700 13px/1 var(--font-ui); color: var(--text-muted); }
	.hint { grid-column: 1 / -1; margin: 0; font: 500 12px/1.3 var(--font-ui); color: var(--text-faint); }
	.cards { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
	.card { position: relative; display: grid; grid-template-columns: 34px 1fr; gap: 6px 10px; padding: 10px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface-1); box-shadow: var(--shadow-card); transition: box-shadow var(--dur-fast, 120ms) var(--ease-out, ease-out); }
	.card:hover { box-shadow: var(--shadow-lift); }
	.card.bad { border-inline-start: 4px solid var(--fail); }
	.hit { position: absolute; inset: 0; border-radius: inherit; }
	.hit:focus-visible { outline: none; box-shadow: var(--focus-ring); }
	.art { display: grid; place-items: center; width: 34px; height: 50px; overflow: hidden; border-radius: 6px; background: var(--surface-2); color: var(--text-muted); }
	.art img { width: 100%; height: 100%; object-fit: cover; }
	.words { display: grid; gap: 2px; min-width: 0; align-content: start; }
	.name { font: 600 15px/1.25 var(--font-display); color: var(--text); overflow-wrap: anywhere; }
	.sub { font: 500 12px/1.35 var(--font-ui); color: var(--text-muted); }
	.tag { justify-self: start; margin-top: 2px; padding: 2px 8px; border-radius: 999px; background: color-mix(in srgb, var(--info) 16%, transparent); font: 700 11px/1.3 var(--font-ui); color: var(--info-text); }
	.why { font: 500 12px/1.35 var(--font-ui); color: var(--fail-text); }
	.bar { grid-column: 1 / -1; height: 5px; border-radius: 5px; background: color-mix(in srgb, var(--text) 10%, transparent); overflow: hidden; }
	.bar span { display: block; height: 100%; border-radius: inherit; background: var(--info); }
	/* The buttons sit above the card's link. */
	.acts { position: relative; z-index: 1; grid-column: 1 / -1; }
	.empty, .quiet { margin: 0; padding: 4px; font: 500 13px/1.4 var(--font-ui); color: var(--text-faint); }
	.quiet { padding: 24px 0; font-size: 15px; }
	.link { padding: 0; border: 0; background: none; color: var(--accent-text); font: 600 13px/1.2 var(--font-ui); cursor: pointer; }
	.more { justify-self: start; padding: 4px; }
	.deeper { margin: 28px 0 0; font: 500 13px/1.5 var(--font-ui); color: var(--text-faint); }
	.deeper a { color: var(--accent-text); font-weight: 600; }

	@media (max-width: 1099px) {
		.lanes { grid-template-columns: repeat(5, 240px); }
	}
	@media (max-width: 767px) {
		.harbor-board { padding: 16px 16px 96px; }
		.phone-lanes { display: flex; gap: 6px; overflow-x: auto; margin: 0 -16px 14px; padding: 0 16px 4px; scrollbar-width: none; }
		.lane-tab { display: inline-flex; align-items: center; gap: 6px; flex: none; min-height: 36px; padding: 0 12px; border: 0; border-bottom: 3px solid transparent; background: none; color: var(--text-muted); font: 600 14px/1 var(--font-ui); cursor: pointer; }
		.lane-tab[aria-selected='true'] { border-bottom-color: var(--accent); color: var(--text); }
		.lane-tab .n { min-width: 20px; padding: 2px 6px; border-radius: 999px; background: var(--surface-2); font-size: 12px; }
		.lanes { display: block; overflow: visible; }
		.lane { display: none; }
		.lane.phone-on { display: grid; }
	}
</style>
