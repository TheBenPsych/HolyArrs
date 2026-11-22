<!-- Harbor's Tidy tab: clean-ups pulled together from what the Library already
     knows (better copies wanted, gaps, missing posters, missing subtitles, the
     bin). Tidy only ever suggests: every button opens the HolyArrs tool that
     does the job, and nothing is removed without a tap there.
     Design: harbor-6-board-round2, screen 5. -->
<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import { api } from '#lib/core/api.ts';
	import { to } from '#lib/core/paths.ts';
	import { session } from '#lib/core/session.svelte.ts';
	import type { TitleView } from '#lib/core/types.ts';
	import { libraryGrid } from '#lib/mediafiles/index.ts';
	import { toasts } from '#lib/core/toasts.svelte.ts';
	import { bestHeight, lowQuality, noPoster, tidyItems } from './shelves.ts';

	let titles = $state<TitleView[]>([]);
	let loaded = $state(false);
	let failed = $state(false);
	let missingSubs = $state<number | null>(null);
	let binned = $state<number | null>(null);
	const manage = $derived(session.can('manage_library') && !session.kid);
	const items = $derived(tidyItems({ titles, missingSubs, binned }));
	const posterless = $derived(titles.filter(noPoster).slice(0, 24));
	// Movies only in DVD quality or worse, best-loved first. "Find better
	// copies" is the same search as a title's own Search button, so it follows
	// the movie's quality rule (1080p at most).
	const lowq = $derived(lowQuality(titles));
	let showAllLow = $state(false);
	let looking = $state<Record<number, boolean>>({});
	async function findBetter(list: TitleView[]) {
		let failedN = 0;
		for (const t of list) {
			looking[t.id] = true;
			await api.post(`/titles/${t.id}/search`, {}).catch(() => failedN++);
		}
		toasts.push(failedN ? `Asked Harbor to look for ${list.length - failedN} of ${list.length}. ${failedN} could not start.` : list.length === 1 ? `Harbor is looking for a better copy of ${list[0].name}.` : `Harbor is looking for better copies of all ${list.length}. They show up on the Board as they come in.`, failedN ? 'fail' : 'info');
	}

	onMount(() => {
		void Promise.all([
			libraryGrid().then((t) => (titles = t), () => (failed = true)),
			api.get<{ total?: number }>('/subtitles/missing?limit=1').then((r) => (missingSubs = r.total ?? 0), () => {}),
			api.get<{ files?: unknown[] }>('/holding').then((r) => (binned = r.files?.length ?? 0), () => {})
		]).finally(() => (loaded = true));
	});
	const icon = (k: string): 'trash' | 'subtitle' | 'image' | 'search' | 'sparkle' => (k === 'bin' ? 'trash' : k === 'subs' ? 'subtitle' : k === 'posters' ? 'image' : k.startsWith('gap') ? 'search' : 'sparkle');
</script>

<section class="harbor-tidy" data-testid="harbor-tidy">
	<a class="back" href={to('/library')}><Icon name="chevronLeft" size={14} />Shelves</a>
	<h1>Tidy</h1>
	<p class="lead">Clean-ups Harbor has noticed on your shelves. Tidy only ever suggests: nothing is removed or changed until you tap it in the tool it opens, and removed files wait in the bin so you can undo.</p>

	{#if !manage}
		<p class="empty">Only people who look after the library can tidy it.</p>
	{:else if !loaded}
		<p class="empty" aria-busy="true">Looking over the shelves…</p>
	{:else if failed}
		<p class="empty">Harbor could not read the shelves just now. Try again in a minute.</p>
	{:else if !items.length}
		<p class="empty"><Icon name="check" size={18} />Everything looks tidy. Nothing to suggest right now.</p>
	{:else}
		<ul class="items">
			{#each items as it (it.key)}
				<li>
					<span class="ico" aria-hidden="true"><Icon name={icon(it.key)} size={18} /></span>
					<div class="words">
						<p class="what"><strong>{it.count.toLocaleString('en-US')} {it.unit}</strong> · {it.what}</p>
						<p class="why">{it.why}</p>
					</div>
					{#if it.href.startsWith('#')}
						<a class="go" href={it.href}>{it.action}<Icon name="chevronRight" size={14} /></a>
					{:else}
						<a class="go" href={to(it.href)}>{it.action}<Icon name="chevronRight" size={14} /></a>
					{/if}
				</li>
			{/each}
		</ul>
		{#if lowq.length}
			<div class="lowq" id="low-quality" data-testid="harbor-low-quality">
				<div class="lowq-head">
					<h2>Low-quality movies <span class="n">{lowq.length}</span></h2>
					<button class="go" type="button" onclick={() => findBetter(lowq)}>Find better copies of all</button>
				</div>
				<p class="why">Movies you only have in DVD quality or worse. Best-loved first (by their score and how many people rated them), since Harbor can't see what gets watched on Glowfin. Harbor looks for a 1080p copy at most, like your quality rule says.</p>
				<ul>
					{#each showAllLow ? lowq : lowq.slice(0, 12) as t (t.id)}
						<li>
							<a class="nm" href={to(`/library/${t.id}`)}>{t.year ? `${t.name} (${t.year})` : t.name}</a>
							<span class="q">{bestHeight(t)}p{t.score ? ` · ${t.score.toFixed(1)}★` : ''}</span>
							<button class="find" type="button" disabled={looking[t.id]} onclick={() => findBetter([t])}>{looking[t.id] ? 'Looking…' : 'Find better copy'}</button>
						</li>
					{/each}
				</ul>
				{#if lowq.length > 12 && !showAllLow}
					<button class="more" type="button" onclick={() => (showAllLow = true)}>Show all {lowq.length}</button>
				{/if}
			</div>
		{/if}
		{#if posterless.length}
			<div class="posters" id="posters">
				<h2>Missing posters</h2>
				<p class="why">Open a title and choose Refresh details from its menu, or pick its match again.</p>
				<ul>
					{#each posterless as t (t.id)}
						<li><a href={to(`/library/${t.id}`)}><span class="blank"><Icon name={t.kind === 'show' ? 'tv' : t.kind === 'artist' ? 'music' : 'film'} size={20} /></span><span class="nm">{t.year ? `${t.name} (${t.year})` : t.name}</span></a></li>
					{/each}
				</ul>
			</div>
		{/if}
	{/if}
	<p class="later">Coming later: the same song twice and leftover duplicate folders, once Harbor can read the folders on Tower.</p>
</section>

<style>
	.harbor-tidy { display: grid; gap: 14px; max-width: 880px; padding-bottom: 48px; }
	.back { display: inline-flex; align-items: center; gap: 2px; justify-self: start; font: 600 14px/1 var(--font-ui); color: var(--accent-text); text-decoration: none; }
	h1 { margin: 0; font: 700 30px/1.2 var(--font-display); color: var(--text); }
	.lead { margin: -4px 0 4px; max-width: 64ch; font: 500 15px/1.5 var(--font-ui); color: var(--text-muted); }
	.empty { display: flex; align-items: center; gap: 8px; margin: 0; padding: 18px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface-1); font: 500 15px/1.4 var(--font-ui); color: var(--text-muted); }
	.items { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
	.items li { display: grid; grid-template-columns: 40px 1fr auto; align-items: center; gap: 14px; padding: 14px 16px; border: 1px solid var(--line); border-inline-start: 4px solid var(--wait); border-radius: 14px; background: color-mix(in srgb, var(--wait) 7%, var(--surface-1)); }
	.ico { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 10px; background: var(--surface-1); color: var(--text-muted); }
	.words { display: grid; gap: 3px; min-width: 0; }
	.what { margin: 0; font: 500 16px/1.3 var(--font-display); color: var(--text); }
	.what strong { font-weight: 700; }
	.why { margin: 0; font: 500 13px/1.4 var(--font-ui); color: var(--text-muted); }
	.go { display: inline-flex; align-items: center; gap: 2px; height: 34px; padding: 0 14px; border-radius: 999px; background: var(--accent); color: #fff; font: 600 14px/1 var(--font-ui); text-decoration: none; white-space: nowrap; }
	.go:hover { filter: brightness(1.08); }
	.posters { display: grid; gap: 8px; margin-top: 8px; }
	.posters h2 { margin: 0; font: 600 18px/1.2 var(--font-display); color: var(--text); }
	.posters ul { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; margin: 4px 0 0; padding: 0; list-style: none; }
	.posters a { display: flex; align-items: center; gap: 10px; padding: 8px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface-1); color: var(--text); text-decoration: none; }
	.posters a:hover { border-color: var(--accent); }
	.blank { display: grid; place-items: center; flex: none; width: 32px; height: 46px; border: 1.5px dashed color-mix(in srgb, var(--text) 30%, transparent); border-radius: 6px; color: var(--text-faint); }
	.nm { font: 600 13px/1.25 var(--font-ui); overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; }
	.lowq { display: grid; gap: 8px; margin-top: 8px; }
	.lowq-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
	.lowq h2 { margin: 0; font: 600 18px/1.2 var(--font-display); color: var(--text); }
	.lowq .n { font: 600 14px/1 var(--font-ui); color: var(--text-muted); }
	.lowq button.go { border: 0; cursor: pointer; }
	.lowq ul { display: grid; gap: 6px; margin: 4px 0 0; padding: 0; list-style: none; }
	.lowq li { display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 12px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface-1); }
	.lowq li .nm { display: block; color: var(--text); text-decoration: none; -webkit-line-clamp: 1; line-clamp: 1; }
	.lowq li .nm:hover { color: var(--accent-text); }
	.lowq .q { font: 600 12px/1 var(--font-ui); color: var(--text-muted); white-space: nowrap; }
	.lowq .find, .lowq .more { height: 30px; padding: 0 12px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface-2, var(--surface-1)); color: var(--text); font: 600 13px/1 var(--font-ui); cursor: pointer; white-space: nowrap; }
	.lowq .find:disabled { opacity: 0.6; cursor: default; }
	.lowq .more { justify-self: start; }
	.later { margin: 6px 0 0; font: 500 13px/1.4 var(--font-ui); color: var(--text-faint); }
	@media (max-width: 767px) {
		.items li { grid-template-columns: 36px 1fr; }
		.items .go { grid-column: 1 / -1; justify-self: start; }
		.lowq li { grid-template-columns: 1fr auto; }
		.lowq .find { grid-column: 1 / -1; justify-self: start; }
	}
</style>
