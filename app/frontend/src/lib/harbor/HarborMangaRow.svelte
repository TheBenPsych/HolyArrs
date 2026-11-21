<!-- Harbor: a Manga row for the main Search page. It asks the manga engine
     for the words typed (after a pause, because it asks every site) and
     each answer opens the Manga shelf with that title looked up, where Get
     lives. Shows nothing when manga is off or the engine is not connected. -->
<script lang="ts">
	import { api as client } from '#lib/core/api.ts';
	import { to } from '#lib/core/paths.ts';
	import { hitLine, searchLine, type MangaSearch, type MangaView } from './manga.ts';

	let { term }: { term: string } = $props();
	let on = $state(false);
	let looking = $state(false);
	let found = $state<MangaSearch | null>(null);
	let asked = '';

	$effect(() => {
		client.get<MangaView>('/harbor/manga').then((v) => (on = !!(v.on && v.engine)), () => (on = false));
	});
	$effect(() => {
		const text = term.trim();
		if (!on || text.length < 3) {
			found = null;
			asked = '';
			return;
		}
		if (text === asked) return;
		const wait = setTimeout(async () => {
			asked = text;
			looking = true;
			try {
				const r = await client.get<MangaSearch>(`/harbor/manga/search?q=${encodeURIComponent(text)}`);
				if (asked === text) found = r;
			} catch {
				if (asked === text) found = null;
			} finally {
				if (asked === text) looking = false;
			}
		}, 1200);
		return () => clearTimeout(wait);
	});
	const shelf = (title: string) => to(`/library/manga?q=${encodeURIComponent(title)}`);
</script>

{#if on && term.trim().length >= 3 && (looking || found)}
	<section class="harbor-manga-row" aria-labelledby="harbor-manga-row-h" data-testid="harbor-manga-row">
		<div class="top">
			<h2 id="harbor-manga-row-h">Manga</h2>
			<a class="all" href={shelf(term.trim())}>Open the Manga shelf</a>
		</div>
		{#if looking && !found}
			<p class="note" aria-busy="true">Asking your manga sites…</p>
		{:else if found}
			{#if found.hits.length}
				<ul>
					{#each found.hits.slice(0, 8) as h (h.key)}
						<li>
							<a href={shelf(h.title)}>
								{#if h.cover}<img src={to(h.cover)} alt="" loading="lazy" width="56" height="80" />{:else}<span class="nocover" aria-hidden="true">{h.title.slice(0, 1)}</span>{/if}
								<span class="words">
									<span class="what">{h.title}</span>
									<span class="why">{hitLine(h)}{#if h.official}{' '}Official release.{/if}</span>
								</span>
							</a>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="note">No manga by that name. {searchLine(found)}</p>
			{/if}
		{/if}
	</section>
{/if}

<style>
	.harbor-manga-row { display: grid; gap: 10px; margin: 8px 0 24px; }
	.top { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
	h2 { margin: 0; font: 700 20px/1.2 var(--font-display); color: var(--text); }
	.all { font: 600 13px/1 var(--font-ui); color: var(--accent-text); text-decoration: none; }
	.note { margin: 0; font: 500 14px/1.4 var(--font-ui); color: var(--text-muted); }
	ul { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 8px; margin: 0; padding: 0; list-style: none; }
	a[href] { text-decoration: none; }
	li a { display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 12px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface-1); }
	li a:hover { background: var(--surface-2); }
	img, .nocover { width: 56px; height: 80px; border-radius: 8px; object-fit: cover; background: var(--surface-2); }
	.nocover { display: grid; place-items: center; font: 700 22px/1 var(--font-display); color: var(--text-faint); }
	.words { display: grid; gap: 3px; min-width: 0; }
	.what { font: 700 15px/1.3 var(--font-display); color: var(--text); overflow-wrap: anywhere; }
	.why { font: 500 13px/1.4 var(--font-ui); color: var(--text-muted); }
</style>
