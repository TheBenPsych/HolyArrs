<!-- Harbor's own rows at the top of Explore (build list part 3, Ben's Yes
     picks): Finish the collection (movie series you own part of, with
     "2 of 3 owned" and + for the next one), New on streaming this week
     (movies that just came out to stream, when good copies show up), and
     This anime season (with the day each new episode comes out). Each row
     hides itself when it has nothing to show. -->
<script lang="ts">
	import { api } from '#lib/core/api.ts';
	import { discoverCard, type ExploreCard, type ProviderItem } from '#lib/ui/title-cards.ts';
	import HarborPosterRow, { type HarborPoster } from './HarborPosterRow.svelte';
	import { airLine, ownedLine, seasonName } from './explore.ts';
	import { gotCard, harborGet } from './get.svelte.ts';

	let { type, live, hrefOf }: { type: string; live: (c: ExploreCard) => ExploreCard; hrefOf: (c: ExploreCard) => string | undefined } = $props();

	interface Finish { id: string; name: string; owned: number; total: number; missing: ProviderItem[] }
	const ROW = 20;

	let finish = $state<Finish[]>([]);
	let streaming = $state<ProviderItem[]>([]);
	let anime = $state<ProviderItem[]>([]);
	let airs = $state<Record<string, string>>({});

	const movies = $derived(type === 'all' || type === 'movies');
	const shows = $derived(type === 'all' || type === 'shows');

	const row = (r: string, kind: string) => api.get<{ items: ProviderItem[] | null }>(`/discover?row=${r}&kind=${kind}`).then((a) => (a.items ?? []).slice(0, ROW));

	$effect(() => {
		if (!movies || finish.length) return;
		api.get<{ collections: Finish[] | null }>('/harbor/finish').then((a) => (finish = a.collections ?? []), () => {});
	});
	$effect(() => {
		if (!movies || streaming.length) return;
		row('harbor_streaming', 'movie').then((x) => (streaming = x), () => {});
	});
	$effect(() => {
		if (!shows || anime.length) return;
		row('harbor_anime_season', 'show').then((x) => {
			anime = x;
			void readAirs(x.filter((i) => !i.in_library).slice(0, 12).concat(x.filter((i) => i.in_library).slice(0, 4)));
		}, () => {});
	});

	/** The day each anime's next episode comes out, a few at a time. */
	async function readAirs(items: ProviderItem[]) {
		const queue = [...items];
		const one = async () => {
			for (let i = queue.shift(); i; i = queue.shift()) {
				try {
					const d = await api.get<{ next_episode?: { air_date?: string } }>(`/metadata/show/${i.tmdb_id}`);
					const line = airLine(d.next_episode?.air_date);
					if (line) airs = { ...airs, [i.tmdb_id]: line };
				} catch {
					// No day for this one.
				}
			}
		};
		await Promise.all([one(), one(), one()]);
	}

	function poster(c: ExploreCard, extra: Partial<HarborPoster> = {}): HarborPoster {
		const x = gotCard(live(c));
		return { key: x.key, kind: x.kind === 'show' ? 'show' : 'movie', tmdb: x.ref?.slice(5) ?? '', name: x.name, image: x.image, href: hrefOf(x), status: x.status, titleId: x.titleId, ...extra };
	}
	const get = (p: HarborPoster) => void harborGet(p.kind, p.tmdb, p.name);

	const finishPosters = $derived(
		finish.flatMap((f) => {
			const next = f.missing[0];
			if (!next) return [];
			const p = poster(discoverCard(next, 'finish'), { tag: ownedLine(f.owned, f.total), line: `Next: ${next.name}` });
			return [{ ...p, key: `finish-${f.id}`, name: f.name.replace(/\s+Collection$/i, '') }];
		})
	);
	const streamingPosters = $derived(streaming.map((i) => poster(discoverCard(i, 'streaming'))));
	const animePosters = $derived(anime.map((i) => poster(discoverCard(i, 'anime'), { line: airs[i.tmdb_id] })));
</script>

{#if type !== 'music'}
	<div class="harbor-rows" data-testid="harbor-explore-rows">
		{#if movies && finishPosters.length}
			<HarborPosterRow id="harbor-finish" title="Finish the collection" note="you own part of these" posters={finishPosters} onget={get} testid="harbor-finish" />
		{/if}
		{#if movies && streamingPosters.length >= 3}
			<HarborPosterRow id="harbor-streaming" title="New on streaming this week" note="good copies usually show up now" posters={streamingPosters} onget={get} testid="harbor-streaming" />
		{/if}
		{#if shows && animePosters.length >= 3}
			<HarborPosterRow id="harbor-anime" title="This anime season" note={seasonName(new Date())} posters={animePosters} onget={get} testid="harbor-anime" />
		{/if}
	</div>
{/if}

<style>
	.harbor-rows { display: grid; gap: 32px; min-width: 0; }
	.harbor-rows:empty { display: none; }
</style>
