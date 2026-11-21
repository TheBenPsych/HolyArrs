<!-- Harbor's Shelves band, at the top of the HolyArrs Library page: every
     shelf with its count, an A to Z switch, Collections and the Tidy tab, then
     the gaps line. On the Shows shelf it adds two short rows, "Still airing"
     and "With gaps", each cover with a bar of what is on Glowfin.
     HolyArrs's own Library (sort, filters, A to Z letter rail) stays below.
     Design: harbor-5 screen 4, harbor-6 screen 5. -->
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
	import { libraryGrid } from '#lib/mediafiles/index.ts';
	import { SHELF_WORD, hasGap, shelfCounts, stillAiring, tidyItems, type ShelfKind } from './shelves.ts';

	let titles = $state<TitleView[]>([]);
	let loaded = $state(false);
	let missingSubs = $state<number | null>(null);
	let binned = $state<number | null>(null);
	let filling = $state(false);

	const manage = $derived(session.can('manage_library') && !session.kid);
	const kind = $derived<ShelfKind>((['movie', 'show', 'artist'] as const).find((k) => k === page.url.searchParams.get('kind')) ?? 'movie');
	const counts = $derived(shelfCounts(titles));
	const shelves = $derived((['movie', 'show', 'artist'] as const).filter((k) => !(k === 'artist' && session.kid)));
	const onShelf = $derived(titles.filter((t) => t.kind === kind));
	const gaps = $derived(onShelf.filter(hasGap));
	const tidy = $derived(tidyItems({ titles, missingSubs, binned }));
	const byName = $derived(page.url.searchParams.get('sort') === 'name');
	const airing = $derived(kind === 'show' ? onShelf.filter(stillAiring).slice(0, 12) : []);
	const gapRow = $derived(kind === 'show' ? gaps.slice(0, 12) : []);

	onMount(() => {
		libraryGrid().then((t) => ((titles = t), (loaded = true)), () => (loaded = true));
		if (manage) {
			void api.get<{ total?: number; titles?: unknown[] }>('/subtitles/missing?limit=1').then((r) => (missingSubs = r.total ?? r.titles?.length ?? 0), () => {});
			void api.get<{ files?: unknown[] }>('/holding').then((r) => (binned = r.files?.length ?? 0), () => {});
		}
	});

	function shelfHref(k: ShelfKind) {
		return to(`/library?kind=${k}`);
	}
	function azHref() {
		const u = new URL(page.url.href);
		if (byName) u.searchParams.delete('sort');
		else u.searchParams.set('sort', 'name');
		u.searchParams.delete('dir');
		return u.pathname + u.search;
	}
	function gapsHref() {
		return to(`/library?kind=${kind}&show=missing`);
	}

	async function fillAll() {
		if (filling || !gaps.length) return;
		filling = true;
		let failed = 0;
		for (const t of gaps) await api.post(`/titles/${t.id}/search`, {}).catch(() => failed++);
		filling = false;
		toasts.push(failed ? `Asked Harbor to look for ${gaps.length - failed} of ${gaps.length}. ${failed} could not start.` : `Harbor is looking for all ${gaps.length}. They show up on the Board as they come in.`, failed ? 'fail' : 'info');
	}

	function bar(t: TitleView): number {
		const s = t.show;
		if (!s) return 0;
		const aired = s.episodes - (s.not_out_yet ?? 0);
		return aired > 0 ? Math.min(100, Math.round((s.in_library / aired) * 100)) : 0;
	}
	function under(t: TitleView): string {
		const s = t.show;
		if (!s) return '';
		if (s.missing > 0) return `${s.missing} missing`;
		if (s.next_air_date) return `Next ${new Date(s.next_air_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
		return 'All here';
	}
	const unitOf = (k: ShelfKind, n: number) => (k === 'movie' ? (n === 1 ? 'movie' : 'movies') : k === 'show' ? (n === 1 ? 'show' : 'shows') : n === 1 ? 'artist' : 'artists');
</script>

<section class="harbor-shelves" aria-label="Shelves" data-testid="harbor-shelves">
	<nav class="tabs" aria-label="Shelves">
		{#each shelves as k (k)}
			<a href={shelfHref(k)} class:on={k === kind} aria-current={k === kind ? 'page' : undefined}>{SHELF_WORD[k]}{#if loaded}<span class="n">{counts[k].toLocaleString('en-US')}</span>{/if}</a>
		{/each}
		<span class="grow"></span>
		<a class="tool" class:on={byName} href={azHref()} data-testid="harbor-az" title={byName ? 'Back to the usual order' : 'Sort A to Z with a letter jump'}>A to Z</a>
		{#if kind === 'movie'}<a class="tool" href={to('/library/collections')}>Collections</a>{/if}
		{#if manage}<a class="tool" href={to('/library/manga')} data-testid="harbor-manga-tab">Manga</a>{/if}
		{#if manage}<a class="tool tidy" href={to('/library/tidy')} data-testid="harbor-tidy-tab">Tidy{#if tidy.length}<span class="n">{tidy.length}</span>{/if}</a>{/if}
	</nav>

	{#if loaded && kind === 'show' && counts.anime > 0}
		<p class="note">{counts.anime.toLocaleString('en-US')} of these are anime. They sit on this shelf and on Movies, with Japanese sound and English subtitles.</p>
	{/if}

	{#if loaded && gaps.length}
		<div class="gaps" data-testid="harbor-gaps">
			<p><strong>{gaps.length.toLocaleString('en-US')} {unitOf(kind, gaps.length)}</strong> on this shelf {gaps.length === 1 ? 'has' : 'have'} gaps.</p>
			<a href={gapsHref()}>Show them<Icon name="chevronRight" size={14} /></a>
			{#if manage}<button type="button" onclick={() => void fillAll()} disabled={filling}>{filling ? 'Asking…' : 'Fill them all'}</button>{/if}
		</div>
	{/if}

	{#each [{ name: 'Still airing', list: airing }, { name: 'With gaps', list: gapRow }] as row (row.name)}
		{#if row.list.length}
			<div class="shelf-row">
				<h2>{row.name}</h2>
				<ul>
					{#each row.list as t (t.id)}
						<li>
							<a href={to(`/library/${t.id}`)} title={t.name}>
								<span class="cover">{#if t.artwork?.[0]}<img src={sized(t.artwork[0], 'poster', 120)} alt="" loading="lazy" decoding="async" />{:else}<Icon name="tv" size={22} />{/if}</span>
								<span class="bar" aria-hidden="true"><span style:width="{bar(t)}%" class:gap={(t.show?.missing ?? 0) > 0}></span></span>
								<span class="name">{t.name}</span>
								<span class="sub" class:gap={(t.show?.missing ?? 0) > 0}>{under(t)}</span>
							</a>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	{/each}
</section>

<style>
	.harbor-shelves { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; min-width: 0; margin: 4px 0 20px; }
	.tabs { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding-bottom: 10px; border-bottom: 1px solid var(--line); }
	.tabs a { display: inline-flex; align-items: center; gap: 7px; height: 36px; padding: 0 14px; border-radius: 999px; color: var(--text-muted); font: 600 15px/1 var(--font-display); text-decoration: none; }
	.tabs a:hover { color: var(--text); background: color-mix(in srgb, var(--text) 6%, transparent); }
	.tabs a.on { color: var(--text); background: color-mix(in srgb, var(--info) 14%, var(--surface-1)); }
	.tabs .n { font: 600 12px/1 var(--font-ui); color: var(--text-faint); font-variant-numeric: tabular-nums; }
	.tabs .grow { flex: 1; }
	.tabs .tool { border: 1px solid var(--line); font: 600 13px/1 var(--font-ui); height: 32px; }
	.tabs .tool.on { border-color: var(--info); }
	.tabs .tidy .n { display: inline-grid; place-items: center; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px; background: var(--accent); color: #fff; }
	.note { margin: -4px 0 0; font: 500 13px/1.4 var(--font-ui); color: var(--text-faint); }

	.gaps { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; padding: 12px 16px; border: 1px solid var(--line); border-inline-start: 4px solid var(--accent); border-radius: 14px; background: color-mix(in srgb, var(--accent) 6%, var(--surface-1)); }
	.gaps p { margin: 0; flex: 1 1 220px; font: 500 15px/1.35 var(--font-ui); color: var(--text); }
	.gaps a { display: inline-flex; align-items: center; gap: 2px; font: 600 14px/1 var(--font-ui); color: var(--accent-text); text-decoration: none; }
	.gaps a:hover { text-decoration: underline; }
	.gaps button { height: 34px; padding: 0 14px; border: 0; border-radius: 999px; background: var(--accent); color: #fff; font: 600 14px/1 var(--font-ui); cursor: pointer; }
	.gaps button:disabled { opacity: 0.6; cursor: default; }

	.shelf-row { min-width: 0; }
	.shelf-row h2 { margin: 0 0 8px; font: 600 17px/1.2 var(--font-display); color: var(--text); }
	.shelf-row ul { display: flex; gap: 12px; margin: 0; padding: 0 0 6px; list-style: none; overflow-x: auto; scrollbar-width: thin; }
	.shelf-row li { flex: none; width: 104px; }
	.shelf-row a { display: grid; gap: 5px; color: inherit; text-decoration: none; }
	.cover { display: grid; place-items: center; aspect-ratio: 2 / 3; overflow: hidden; border-radius: 10px; background: color-mix(in srgb, var(--info) 9%, var(--surface-1)); color: var(--text-muted); }
	.cover img { width: 100%; height: 100%; object-fit: cover; }
	.shelf-row a:hover .cover, .shelf-row a:focus-visible .cover { outline: 2px solid var(--accent); outline-offset: 2px; }
	.bar { height: 4px; border-radius: 4px; background: color-mix(in srgb, var(--text) 12%, transparent); overflow: hidden; }
	.bar span { display: block; height: 100%; background: var(--ok); }
	.bar span.gap { background: var(--accent); }
	.name { font: 600 13px/1.25 var(--font-ui); color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.sub { margin-top: -3px; font: 500 12px/1.2 var(--font-ui); color: var(--text-faint); }
	.sub.gap { color: var(--accent-text); }

	@media (max-width: 767px) {
		.tabs { gap: 4px; }
		.tabs a { padding: 0 11px; font-size: 14px; }
		.tabs .grow { flex-basis: 100%; height: 0; }
		.shelf-row li { width: 92px; }
	}
</style>
