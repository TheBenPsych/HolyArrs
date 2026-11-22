<!-- Harbor's Shelves page (bold redesign part 5, design harbor-10 screen 5).
     At the top of the HolyArrs Library page: five glowing shelf tiles (Movies,
     Shows, Anime, Music, Manga) and the Tower space bar, then search, filter
     chips and sorts, then a big poster wall. Every poster can show a 1080p or
     720p badge and, on hover, a play button that opens it in Glowfin.
     Sorting by Most watched or Never watched uses Glowfin's play counts.
     The HolyArrs list (with all its filters and select mode) stays one tap
     away under "Full list" (?list=1). Manga is for managers only, never Kids. -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import Icon from '#lib/ui/Icon.svelte';
	import { api } from '#lib/core/api.ts';
	import { to } from '#lib/core/paths.ts';
	import { session } from '#lib/core/session.svelte.ts';
	import { toasts } from '#lib/core/toasts.svelte.ts';
	import { sized } from '#lib/core/tmdb-image.ts';
	import type { TitleView } from '#lib/core/types.ts';
	import { libraryGrid, partsNow } from '#lib/mediafiles/index.ts';
	import type { MangaView } from './manga.ts';
	import { openInGlowfin } from './glowfin.ts';
	import {
		FILTER_NAME, SHELF_GLOW, SHELF_NAME, SORT_NAME, filterCounts, freeLine, gb, hasGap, matchesWords, onShelfOf, passesFilter, playsLine, qualityBadge,
		readShelf, readSort, shelfListView, shelfTileCounts, shelvesFor, sortShelf, spaceBar, spaceWords, stillAiring, tidyItems, tileLine, wantsBetter, hasNoFile, isNewThisWeek,
		type Disk, type Plays, type ShelfFilter, type ShelfId, type ShelfSort
	} from './shelves.ts';

	const PAGE = 96;
	const QUALITY_KEY = 'harbor.shelves.quality';

	let titles = $state<TitleView[]>([]);
	let loaded = $state(false);
	let manga = $state<MangaView | null>(null);
	let disks = $state<Disk[]>([]);
	let plays = $state(new Map<number, Plays>());
	let playsOn = $state<boolean | null>(null);
	let missingSubs = $state<number | null>(null);
	let binned = $state<number | null>(null);
	let filling = $state(false);
	let showQuality = $state(false);
	let limit = $state(PAGE);
	let q = $state('');
	let more = $state<HTMLElement | null>(null);

	const manage = $derived(session.can('manage_library') && !session.kid);
	const partOn = (part: string) => partsNow.answer?.parts.find((p) => p.part === part)?.on !== false;
	const shelves = $derived(shelvesFor({ kid: !!session.kid, manage, music: partOn('music'), movies: partOn('movies'), shows: partOn('shows') }));
	const params = $derived(page.url.searchParams);
	const shelf = $derived<ShelfId>(readShelf(params.get('kind'), shelves));
	const sort = $derived<ShelfSort>(readSort(params.get('order')));
	const filter = $derived<ShelfFilter>((['gaps', 'better', 'missing', 'new', 'airing'] as string[]).includes(params.get('only') ?? '') ? (params.get('only') as ShelfFilter) : 'all');
	const airingOnly = $derived(params.get('only') === 'airing');
	const listView = $derived(shelfListView(params));

	const mangaShelf = $derived((manga?.series ?? []).filter((s) => s.chapters > 0 || (s.volumes ?? 0) > 0));
	const counts = $derived(shelfTileCounts(titles, mangaShelf.length));
	const onShelf = $derived(shelf === 'manga' ? [] : onShelfOf(titles, shelf));
	const fCounts = $derived(filterCounts(onShelf));
	const airingCount = $derived(onShelf.filter(stillAiring).length);
	const shown = $derived(
		sortShelf(
			onShelf.filter((t) => (airingOnly ? stillAiring(t) : passesFilter(t, filter)) && (!q.trim() || matchesWords(t.name, q))),
			sort,
			plays
		)
	);
	const space = $derived(manage ? spaceBar(disks, titles) : null);
	const tidy = $derived(tidyItems({ titles, missingSubs, binned }));
	const lowCount = $derived(showQuality ? onShelf.filter((t) => qualityBadge(t)?.low).length : 0);
	const gapsHere = $derived(onShelf.filter(hasGap));
	const canPlay = $derived(manage && (shelf === 'movie' || shelf === 'show' || shelf === 'anime'));
	const filterKeys = $derived((['gaps', 'better', 'missing', 'new'] as const).filter((f) => fCounts[f] > 0 && !(f === 'missing' && shelf !== 'movie' && shelf !== 'anime') && !(f === 'gaps' && shelf === 'movie')));
	const sorts = $derived((Object.keys(SORT_NAME) as ShelfSort[]).filter((s) => manage || (s !== 'most' && s !== 'never')));
	const findWord = $derived(`Search ${SHELF_NAME[shelf].toLowerCase()}`);

	onMount(() => {
		try {
			showQuality = localStorage.getItem(QUALITY_KEY) === 'on';
		} catch {}
		libraryGrid().then((t) => ((titles = t), (loaded = true)), () => (loaded = true));
		if (manage) {
			void api.get<MangaView>('/harbor/manga').then((m) => (manga = m), () => {});
			void api.get<{ disks?: Disk[] }>('/health/disks').then((r) => (disks = r.disks ?? []), () => {});
			void api.get<{ enabled: boolean; titles: { id: number; plays: number; last?: string }[] }>('/harbor/shelves/plays').then(
				(r) => ((playsOn = r.enabled), (plays = new Map(r.titles.map((t) => [t.id, { plays: t.plays, last: t.last }])))),
				() => (playsOn = false)
			);
			void api.get<{ total?: number; titles?: unknown[] }>('/subtitles/missing?limit=1').then((r) => (missingSubs = r.total ?? r.titles?.length ?? 0), () => {});
			void api.get<{ files?: unknown[] }>('/holding').then((r) => (binned = r.files?.length ?? 0), () => {});
		}
	});

	// Show more posters as the wall scrolls into view (2,700 movies stay quick).
	$effect(() => {
		const el = more;
		if (!el) return;
		const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && (limit += PAGE), { rootMargin: '900px' });
		io.observe(el);
		return () => io.disconnect();
	});
	let lastKey = '';
	$effect(() => {
		const key = `${shelf}|${filter}|${sort}|${q}|${airingOnly}`;
		if (key !== lastKey) {
			lastKey = key;
			limit = PAGE;
		}
	});

	function href(set: Record<string, string | null>): string {
		const u = new URL(page.url.href);
		for (const [k, v] of Object.entries(set)) {
			if (v) u.searchParams.set(k, v);
			else u.searchParams.delete(k);
		}
		return u.pathname + u.search;
	}
	const shelfHref = (k: ShelfId) => to(`/library?kind=${k}`);

	function toggleQuality() {
		showQuality = !showQuality;
		try {
			localStorage.setItem(QUALITY_KEY, showQuality ? 'on' : 'off');
		} catch {}
	}

	async function play(t: TitleView) {
		const why = await openInGlowfin(t.id);
		if (why) toasts.push(why, 'info');
	}

	async function fillAll() {
		if (filling || !gapsHere.length) return;
		filling = true;
		let failed = 0;
		for (const t of gapsHere) await api.post(`/titles/${t.id}/search`, {}).catch(() => failed++);
		filling = false;
		toasts.push(failed ? `Asked Harbor to look for ${gapsHere.length - failed} of ${gapsHere.length}. ${failed} could not start.` : `Harbor is looking for all ${gapsHere.length}. They show up on the Board as they come in.`, failed ? 'fail' : 'info');
	}

	function tagOf(t: TitleView): { text: string; tone: string } | null {
		if (hasNoFile(t)) return { text: 'Missing', tone: 'red' };
		if (t.kind !== 'movie' && hasGap(t)) return { text: `${t.show?.missing ?? ''} missing`.trim(), tone: 'amber' };
		if (wantsBetter(t)) return { text: 'Better copy', tone: 'amber' };
		if (isNewThisWeek(t)) return { text: 'New', tone: 'mint' };
		return null;
	}
	function under(t: TitleView): string {
		if (sort === 'most' || sort === 'never') return playsLine(plays.get(t.id));
		if (sort === 'size') return gb(t.size_bytes) || '—';
		if (t.kind === 'show' && t.show) return `${t.show.in_library.toLocaleString('en-US')} episodes${t.year ? ` · ${t.year}` : ''}`;
		return t.year ? String(t.year) : '';
	}
	const mangaCover = (series: string) => to(`/api/v1/harbor/manga/shelf-cover?series=${encodeURIComponent(series)}`);
	const mangaLine = (n: number, v?: number) => (n ? `${n.toLocaleString('en-US')} ${n === 1 ? 'chapter' : 'chapters'}` : `${(v ?? 0).toLocaleString('en-US')} ${v === 1 ? 'volume' : 'volumes'}`);
	const mangaShown = $derived(
		[...mangaShelf].filter((s) => !q.trim() || matchesWords(s.series, q)).sort((a, b) => (sort === 'name' ? 0 : (b.new ?? 0) - (a.new ?? 0)) || a.series.localeCompare(b.series))
	);
</script>

<section class="harbor-shelves" aria-label="Shelves" data-testid="harbor-shelves">
	<div class="hs-tiles" style:--n={shelves.length}>
		{#each shelves as k (k)}
			<a href={shelfHref(k)} class="hs-tile" class:on={k === shelf} style:--glow={SHELF_GLOW[k]} aria-current={k === shelf ? 'page' : undefined} data-testid="harbor-shelf-{k}">
				<span class="hs-blob" aria-hidden="true"></span>
				<strong>{SHELF_NAME[k]}</strong>
				<span>{loaded || k === 'manga' ? tileLine(k, counts[k]) : ' '}</span>
			</a>
		{/each}
		{#if space}
			<div class="hs-space" data-testid="harbor-space">
				<div class="hs-space-top"><b>Tower space</b><span>{freeLine(space)}</span></div>
				<div class="hs-bar" role="img" aria-label="{spaceWords(space)}. {freeLine(space)}.">
					{#each space.parts as p (p.id)}<i style:width="{Math.max(0.6, p.pct)}%" style:--c={SHELF_GLOW[p.id]} title="{SHELF_NAME[p.id]} {gb(p.bytes)}"></i>{/each}
					{#if space.other > 0}<i class="other" style:width="{(space.other / space.total) * 100}%" title="Other files {gb(space.other)}"></i>{/if}
				</div>
				<div class="hs-space-words">{spaceWords(space)}</div>
			</div>
		{/if}
	</div>

	<div class="hs-tools">
		<label class="hs-find">
			<Icon name="search" size={17} />
			<input type="search" bind:value={q} placeholder={findWord} aria-label={findWord} data-testid="harbor-shelf-find" />
		</label>
		{#if shelf !== 'manga'}
			<div class="hs-chips" role="group" aria-label="Show only">
				<a class="hs-chip" class:on={filter === 'all' && !airingOnly} href={href({ only: null })}>All</a>
				{#each filterKeys as f (f)}
					<a class="hs-chip tone-{f}" class:on={filter === f} href={href({ only: filter === f ? null : f })}><i></i>{FILTER_NAME[f]} · {fCounts[f].toLocaleString('en-US')}</a>
				{/each}
				{#if (shelf === 'show' || shelf === 'anime') && airingCount}
					<a class="hs-chip tone-airing" class:on={airingOnly} href={href({ only: airingOnly ? null : 'airing' })}><i></i>Still airing · {airingCount.toLocaleString('en-US')}</a>
				{/if}
			</div>
		{/if}
		<span class="hs-grow"></span>
		{#if shelf !== 'manga'}
			<a class="hs-chip" href={to('/library/stats')}>Stats</a>
			{#if shelf === 'movie'}<a class="hs-chip" href={to('/library/collections')}>Collections</a>{/if}
			{#if manage}<a class="hs-chip" href={to('/library/tidy')} data-testid="harbor-tidy-tab">Tidy{#if tidy.length}{` · ${tidy.length}`}{/if}</a>{/if}
			{#if shelf !== 'anime'}<a class="hs-chip" class:on={listView} href={href({ list: listView ? null : '1' })} data-testid="harbor-full-list">{listView ? 'Posters' : 'Full list'}</a>{/if}
		{:else}
			<a class="hs-chip go" href={to('/library/manga')} data-testid="harbor-manga-tab"><Icon name="plus" size={15} />Find and get manga</a>
		{/if}
	</div>

	{#if !listView}
		{#if shelf !== 'manga'}
			<div class="hs-sorts">
				<div class="hs-chips" role="group" aria-label="Sort">
					{#each sorts as s (s)}
						<a class="hs-chip small" class:on={sort === s} href={href({ order: s === 'added' ? null : s })} data-testid="harbor-sort-{s}">{SORT_NAME[s]}</a>
					{/each}
				</div>
				<span class="hs-grow"></span>
				{#if shelf !== 'artist'}
					<button type="button" class="hs-switch" role="switch" aria-checked={showQuality} onclick={toggleQuality} data-testid="harbor-quality-switch"><span class="knob" aria-hidden="true"></span>Show 1080p / 720p</button>
				{/if}
			</div>
			{#if (sort === 'most' || sort === 'never') && playsOn === false}
				<p class="hs-note">Glowfin's play counts are switched off. <a href={to('/settings/media-servers')}>Turn on "Read watch history"</a> and this sort fills in after the next read.</p>
			{/if}
			{#if showQuality && lowCount}
				<p class="hs-note"><i class="amber"></i>{lowCount.toLocaleString('en-US')} below your 1080p goal. Harbor upgrades them when a better copy turns up.</p>
			{/if}
			{#if filter === 'gaps' && manage && gapsHere.length}
				<div class="hs-note"><span><strong>{gapsHere.length.toLocaleString('en-US')}</strong> on this shelf {gapsHere.length === 1 ? 'has' : 'have'} gaps.</span><button type="button" onclick={() => void fillAll()} disabled={filling}>{filling ? 'Asking…' : 'Fill them all'}</button></div>
			{/if}

			{#if loaded && !shown.length}
				<p class="hs-empty">{q ? `Nothing on ${SHELF_NAME[shelf]} matches "${q}".` : filter !== 'all' || airingOnly ? 'Nothing here right now.' : `${SHELF_NAME[shelf]} is empty so far. Find something on Explore.`}</p>
			{/if}
			<ul class="hs-wall" data-testid="harbor-wall">
				{#each shown.slice(0, limit) as t (t.id)}
					{@const tag = tagOf(t)}
					{@const qb = showQuality ? qualityBadge(t) : null}
					<li class="hs-card" class:square={t.kind === 'artist'}>
						<div class="hs-art">
							<a class="hs-po" href={to(`/library/${t.id}`)} aria-label={t.name}>
								{#if t.artwork?.[0]}<img src={sized(t.artwork[0], 'poster', 340)} alt="" loading="lazy" decoding="async" />{:else}<span class="hs-po-name">{t.name}</span>{/if}
								{#if tag}<span class="hs-tag tone-{tag.tone}"><i></i>{tag.text}</span>{/if}
								{#if qb}<span class="hs-q" class:low={qb.low} data-testid="harbor-quality">{qb.text}</span>{/if}
							</a>
							{#if canPlay && t.kind !== 'artist' && !hasNoFile(t)}
								<button type="button" class="hs-play" aria-label="Open {t.name} in Glowfin" title="Open in Glowfin" onclick={() => void play(t)} data-testid="harbor-play"><Icon name="play" size={20} /></button>
							{/if}
						</div>
						<span class="hs-cap">{t.name}</span>
						<span class="hs-line" class:never={(sort === 'never' || sort === 'most') && !(plays.get(t.id)?.plays)}>{under(t)}</span>
					</li>
				{/each}
			</ul>
			{#if shown.length > limit}<div class="hs-more" bind:this={more}><button type="button" onclick={() => (limit += PAGE)}>Show more</button></div>{/if}
		{:else}
			{#if manga && !mangaShown.length}
				<p class="hs-empty">{q ? `No manga matches "${q}".` : 'No manga on the shelf yet. Press "Find and get manga" to add a series.'}</p>
			{/if}
			<ul class="hs-wall" data-testid="harbor-manga-wall">
				{#each mangaShown as s (s.series)}
					<li class="hs-card">
						<a class="hs-po" class:glow={(s.new ?? 0) > 0} href={to(`/library/manga?q=${encodeURIComponent(s.series)}`)} aria-label={s.series}>
							<span class="hs-po-name">{s.series}</span>
							<img src={mangaCover(s.series)} alt="" loading="lazy" decoding="async" onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')} />
							{#if (s.new ?? 0) > 0}<span class="hs-new" data-testid="harbor-manga-new">+{s.new} new</span>{/if}
							{#if s.gaps?.length}<span class="hs-tag tone-amber"><i></i>{s.gaps.length} missing</span>{/if}
						</a>
						<span class="hs-cap">{s.series}</span>
						<span class="hs-line">{mangaLine(s.chapters, s.volumes)}</span>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</section>

<style>
	.harbor-shelves { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; min-width: 0; margin: 4px 0 20px; }

	/* Shelf tiles and the space bar */
	.hs-tiles { display: grid; grid-template-columns: repeat(var(--n, 5), minmax(0, 1fr)) minmax(0, 1.6fr); gap: 12px; }
	.hs-tile, .hs-space { position: relative; overflow: hidden; display: grid; align-content: center; gap: 2px; min-height: 76px; padding: 14px 18px; border-radius: 20px; background: var(--harbor-glass); border: 1px solid var(--harbor-edge); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); color: var(--text); text-decoration: none; }
	.hs-tile { transition: transform 160ms ease-out, box-shadow 160ms ease-out, border-color 160ms; }
	.hs-tile strong { position: relative; font: 700 20px/1.2 var(--font-display); letter-spacing: -0.01em; }
	.hs-tile span:last-child { position: relative; font: 600 13px/1.3 var(--font-ui); color: var(--text-muted); }
	.hs-blob { position: absolute; right: -22px; top: -32px; width: 96px; height: 96px; border-radius: 50%; background: var(--glow); filter: blur(34px); opacity: 0.5; transition: opacity 160ms; }
	.hs-tile:hover { transform: translateY(-2px); }
	.hs-tile:hover .hs-blob { opacity: 0.75; }
	.hs-tile.on { border-color: var(--glow); box-shadow: 0 0 0 1px var(--glow), 0 0 30px -6px var(--glow); background: color-mix(in srgb, var(--glow) 16%, var(--harbor-glass)); }
	.hs-tile:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--bg), 0 0 0 5px var(--harbor-aqua); }
	.hs-space { align-content: stretch; gap: 8px; }
	.hs-space-top { display: flex; justify-content: space-between; gap: 8px; font: 700 13px/1.2 var(--font-ui); }
	.hs-space-top span { color: var(--text-muted); font-weight: 600; }
	.hs-bar { display: flex; gap: 2px; height: 14px; border-radius: 9px; overflow: hidden; background: color-mix(in srgb, var(--text) 10%, transparent); }
	.hs-bar i { display: block; height: 100%; background: var(--c); box-shadow: 0 0 10px var(--c); }
	.hs-bar i.other { background: color-mix(in srgb, var(--text) 26%, transparent); box-shadow: none; }
	.hs-space-words { font: 500 12px/1.2 var(--font-ui); color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

	/* Search, chips and sorts */
	.hs-tools, .hs-sorts { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-width: 0; }
	.hs-grow { flex: 1; }
	.hs-find { display: flex; align-items: center; gap: 8px; width: 280px; max-width: 100%; height: 42px; padding: 0 16px; border-radius: 99px; background: var(--harbor-glass); border: 1px solid var(--harbor-edge); color: var(--text-muted); }
	.hs-find:focus-within { border-color: var(--harbor-aqua); }
	.hs-find input { flex: 1; min-width: 0; border: 0; background: none; color: var(--text); font: 500 14px/1 var(--font-ui); outline: none; }
	.hs-chips { display: flex; flex-wrap: wrap; gap: 8px; }
	.hs-chip { display: inline-flex; align-items: center; gap: 7px; height: 36px; padding: 0 14px; border-radius: 99px; border: 1px solid var(--harbor-edge); background: var(--harbor-glass); color: var(--text); font: 600 13px/1 var(--font-ui); text-decoration: none; white-space: nowrap; }
	.hs-chip.small { height: 32px; padding: 0 12px; }
	.hs-chip:hover { background: var(--harbor-glass-2); }
	.hs-chip.on { background: var(--harbor-chip-on); color: var(--harbor-chip-on-text); border-color: transparent; }
	.hs-chip i { width: 7px; height: 7px; border-radius: 50%; background: var(--c); box-shadow: 0 0 8px var(--c); }
	.hs-chip.go { background: var(--harbor-grad); color: #fff; border: 0; }
	.tone-gaps, .tone-better, .tone-amber { --c: var(--harbor-amber); }
	.tone-missing, .tone-red { --c: var(--harbor-red); }
	.tone-new, .tone-mint { --c: var(--harbor-mint); }
	.tone-airing { --c: var(--harbor-sky); }
	.hs-switch { display: inline-flex; align-items: center; gap: 9px; height: 32px; padding: 0 12px 0 6px; border: 1px solid var(--harbor-edge); border-radius: 99px; background: var(--harbor-glass); color: var(--text); font: 600 13px/1 var(--font-ui); cursor: pointer; }
	.hs-switch .knob { position: relative; width: 34px; height: 20px; border-radius: 99px; background: color-mix(in srgb, var(--text) 18%, transparent); transition: background 160ms; }
	.hs-switch .knob::after { content: ''; position: absolute; left: 3px; top: 3px; width: 14px; height: 14px; border-radius: 50%; background: #fff; transition: transform 160ms; }
	.hs-switch[aria-checked='true'] .knob { background: var(--harbor-grad); }
	.hs-switch[aria-checked='true'] .knob::after { transform: translateX(14px); }
	.hs-switch:focus-visible, .hs-chip:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--harbor-aqua); }
	.hs-note { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; margin: 0; padding: 10px 14px; border-radius: 14px; background: var(--harbor-glass); border: 1px solid var(--harbor-edge); font: 500 14px/1.4 var(--font-ui); color: var(--text-muted); }
	.hs-note a { color: var(--accent-text); font-weight: 600; }
	.hs-note i.amber { width: 8px; height: 8px; border-radius: 50%; background: var(--harbor-amber); box-shadow: 0 0 8px var(--harbor-amber); }
	.hs-note button { height: 32px; padding: 0 14px; border: 0; border-radius: 99px; background: var(--harbor-grad); color: #fff; font: 600 13px/1 var(--font-ui); cursor: pointer; }
	.hs-note button:disabled { opacity: 0.6; cursor: default; }
	.hs-empty { margin: 8px 0; font: 500 15px/1.4 var(--font-ui); color: var(--text-muted); }

	/* The poster wall */
	.hs-wall { display: grid; grid-template-columns: repeat(auto-fill, minmax(144px, 1fr)); gap: 22px 18px; margin: 0; padding: 0; list-style: none; }
	.hs-card { position: relative; display: grid; align-content: start; gap: 3px; min-width: 0; }
	.hs-po { position: relative; display: grid; place-items: end center; aspect-ratio: 2 / 3; overflow: hidden; border-radius: 16px; background: linear-gradient(160deg, color-mix(in srgb, var(--harbor-violet) 55%, #0b1220), color-mix(in srgb, var(--harbor-pink) 40%, #0b1220)); box-shadow: 0 10px 26px rgb(0 0 0 / 30%); transition: transform 160ms ease-out, box-shadow 160ms ease-out; }
	.square .hs-po { aspect-ratio: 1; }
	.hs-po img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
	.hs-po-name { position: relative; padding: 10px 8px; font: 700 16px/1.05 var(--font-poster); letter-spacing: 0.04em; text-align: center; text-transform: uppercase; color: #fff; overflow-wrap: anywhere; }
	.hs-card:hover .hs-po, .hs-po:focus-visible { transform: translateY(-4px); box-shadow: 0 16px 34px rgb(0 0 0 / 42%), 0 0 0 2px var(--harbor-aqua); }
	.hs-po:focus-visible { outline: none; }
	.hs-po.glow { box-shadow: 0 0 0 2px var(--harbor-pink), 0 0 26px rgb(255 95 162 / 55%); }
	.hs-tag { position: absolute; top: 8px; left: 8px; display: inline-flex; align-items: center; gap: 5px; max-width: calc(100% - 16px); padding: 4px 8px; border-radius: 99px; background: rgb(6 11 18 / 72%); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); font: 700 11px/1 var(--font-ui); color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.hs-tag i { flex: none; width: 7px; height: 7px; border-radius: 50%; background: var(--c); box-shadow: 0 0 8px var(--c); }
	.hs-q { position: absolute; top: 8px; right: 8px; padding: 3px 8px; border-radius: 8px; background: rgb(6 11 18 / 72%); color: #fff; font: 800 11px/1.2 var(--font-display); }
	.hs-q.low { background: var(--harbor-amber); color: #2a1a00; }
	.hs-new { position: absolute; top: 8px; right: 8px; padding: 4px 9px; border-radius: 99px; background: var(--harbor-pink); color: #fff; font: 800 11px/1 var(--font-display); box-shadow: 0 0 14px rgb(255 95 162 / 70%); }
	.hs-art { position: relative; }
	.hs-play { position: absolute; left: 50%; top: 50%; translate: -50% -50%; display: grid; place-items: center; width: 54px; height: 54px; border: 0; border-radius: 50%; background: var(--harbor-grad); color: #fff; box-shadow: 0 8px 24px rgb(0 0 0 / 45%), 0 0 24px rgb(157 107 255 / 55%); cursor: pointer; opacity: 0; scale: 0.85; transition: opacity 140ms ease-out, scale 140ms ease-out; }
	.hs-card:hover .hs-play, .hs-play:focus-visible { opacity: 1; scale: 1; }
	.hs-play:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--bg), 0 0 0 5px var(--harbor-aqua); }
	.hs-cap { margin-top: 8px; font: 700 14px/1.25 var(--font-ui); color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.hs-line { font: 600 12px/1.25 var(--font-ui); color: var(--text-muted); }
	.hs-line.never { color: var(--harbor-amber); }
	.hs-more { display: grid; place-items: center; padding: 10px; }
	.hs-more button { height: 38px; padding: 0 18px; border-radius: 99px; border: 1px solid var(--harbor-edge); background: var(--harbor-glass); color: var(--text); font: 600 14px/1 var(--font-ui); cursor: pointer; }

	/* Touch screens have no hover: the play button sits small in the corner. */
	@media (hover: none) {
		.hs-play { opacity: 0.92; scale: 1; width: 32px; height: 32px; left: auto; top: auto; right: 6px; bottom: 6px; translate: none; }
		.hs-play :global(svg) { width: 15px; height: 15px; }
	}
	@media (max-width: 1100px) {
		.hs-tiles { grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); }
		.hs-space { grid-column: 1 / -1; }
	}
	@media (max-width: 767px) {
		.hs-tiles { display: flex; margin: 0 calc(-1 * var(--gutter, 16px)); padding: 2px var(--gutter, 16px) 4px; overflow-x: auto; scrollbar-width: none; }
		.hs-tiles::-webkit-scrollbar { display: none; }
		.hs-tile { flex: none; width: 128px; min-height: 66px; padding: 12px 14px; }
		.hs-tile strong { font-size: 17px; }
		.hs-space { flex: none; width: 240px; }
		.hs-find { width: 100%; }
		.hs-tools .hs-chips, .hs-sorts .hs-chips { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; margin: 0 calc(-1 * var(--gutter, 16px)); padding: 0 var(--gutter, 16px); max-width: calc(100% + 2 * var(--gutter, 16px)); }
		.hs-grow { display: none; }
		.hs-wall { grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 16px 12px; }
		.hs-cap { font-size: 13px; }
	}
	@media (prefers-reduced-motion: reduce) {
		.hs-tile, .hs-po, .hs-play { transition: none; }
	}
</style>
