<!-- Harbor's title page top in the bold look (build list part 6, design
     harbor-10 screen 6). The artwork fills the whole top behind a dark
     fade; the poster, a big poster-style name, a few chips and one plain
     sentence say what it is and where it stands. The big button is
     "Open in Glowfin" when it is on the shelves, or "+ Get" when it is not
     (+ Get follows the quality rules, 1080p at most, and never asks).
     For shows, each season is a ring that fills as its episodes arrive, and
     a strip shows the episodes of the season that is moving.
     It replaces the HolyArrs hero (lib/ui/TitleHero) on the one title page;
     the HolyArrs hero buttons (Follow, More, ...) sit in the small row. -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import { api } from '#lib/core/api.ts';
	import { session } from '#lib/core/session.svelte.ts';
	import { toasts } from '#lib/core/toasts.svelte.ts';
	import { sized } from '#lib/core/tmdb-image.ts';
	import type { EpisodeView, TitleView } from '#lib/core/types.ts';
	import type { TitleDetails } from '#lib/metadata/index.ts';
	import { openInGlowfin } from './glowfin.ts';
	import { getKey, getting, gotten, harborGet, mayGet } from './get.svelte.ts';
	import { isAnime, titleStory } from './shelves.ts';
	import { episodeStrip, focusSeason, seasonRings, type EpisodeStrip } from './title.ts';
	import { MORE, openMore } from './title-more.ts';

	let {
		details,
		owned = null,
		facts = [],
		cert = '',
		tagline = '',
		status = '',
		crumbs = [],
		actions,
		byline
	}: {
		details: TitleDetails;
		owned?: TitleView | null;
		facts?: string[];
		cert?: string;
		tagline?: string;
		status?: string;
		crumbs?: { href: string; label: string }[];
		actions?: Snippet;
		byline?: Snippet;
	} = $props();

	const manage = $derived(session.can('manage_library') && !session.kid);
	const d = $derived(details);
	const backdrop = $derived(d.backdrop ? sized(d.backdrop, 'backdrop') : '');
	const poster = $derived(d.poster ? sized(d.poster, 'poster', 230) : '');
	let posterFailed = $state(false);

	// Where it stands, in one sentence.
	const story = $derived(owned ? titleStory(owned) : null);
	const got = $derived(gotten.get(getKey(d.kind, d.tmdb)));
	const sentence = $derived.by(() => {
		if (story) return story.sentence;
		if (got?.titleId) return 'It is already on your shelves.';
		if (got?.ask === 'approved' || d.ask?.state === 'approved') return 'Harbor is getting it, following your quality rules (1080p at most).';
		if (got?.ask || d.ask) return d.ask?.mine || got?.ask ? 'You asked for it. It waits for a yes on the Board.' : 'Someone asked for it. It waits for a yes on the Board.';
		if (d.neverAdd) return 'This one was turned down, so Harbor will not get it.';
		return 'Not on your shelves yet.';
	});
	const tone = $derived(story?.tone ?? (got?.ask || d.ask ? 'moving' : 'quiet'));

	const onDisk = $derived(!!owned && (owned.kind === 'show' ? (owned.show?.in_library ?? 0) > 0 : owned.slots.some((s) => !!s.file)));
	const showGet = $derived(!owned && !got && !d.ask && !d.neverAdd && mayGet() && (d.kind === 'movie' || d.kind === 'show'));
	const kindChip = $derived(owned && isAnime(owned) ? 'Anime' : d.kind === 'show' ? 'Show' : 'Movie');
	const chips = $derived([...facts.slice(0, 1), kindChip, ...facts.slice(1), cert].filter(Boolean));

	let opening = $state(false);
	async function glowfin() {
		if (!owned || opening) return;
		opening = true;
		const why = await openInGlowfin(owned.id);
		opening = false;
		if (why) toasts.push('Could not open it in Glowfin', 'info', { body: why });
	}

	// Seasons as rings, then the episodes of the season that is moving.
	const rings = $derived(owned?.kind === 'show' ? seasonRings(owned.show) : []);
	const focus = $derived(owned?.kind === 'show' ? focusSeason(owned.show) : null);
	let strip = $state<EpisodeStrip | null>(null);
	$effect(() => {
		const id = owned?.id;
		const n = focus;
		strip = null;
		if (!id || n == null) return;
		let live = true;
		api.get<{ episodes: EpisodeView[] }>(`/titles/${id}/episodes?season=${n}`).then(
			(r) => live && (strip = episodeStrip(r.episodes ?? [])),
			() => {}
		);
		return () => (live = false);
	});
</script>

<section class="ht" data-testid="harbor-title-top">
	<div class="ht-art" aria-hidden="true">
		{#if backdrop}<img src={backdrop} alt="" decoding="async" fetchpriority="high" />{/if}
		<div class="ht-shade"></div>
	</div>

	{#if crumbs.length}
		<nav class="ht-crumbs" aria-label="Where you are">
			{#each crumbs as c, i (c.href)}{#if i}<span aria-hidden="true">›</span>{/if}<a href={c.href}>{c.label}</a>{/each}
		</nav>
	{/if}

	<div class="ht-main">
		<div class="ht-poster">
			{#if poster && !posterFailed}<img src={poster} alt="" decoding="async" onerror={() => (posterFailed = true)} />{:else}<span>{d.name}</span>{/if}
		</div>
		<div class="ht-text">
			<h1 class="ht-name" dir="auto">{d.name}</h1>
			{#if tagline}<p class="ht-sub" dir="auto">{tagline}</p>{/if}
			<ul class="ht-chips">
				{#each chips as c, i (i)}<li>{c}</li>{/each}
				{#if status}<li class="glow">{status}</li>{/if}
			</ul>
			<p class="ht-say tone-{tone}" data-testid="harbor-title-say"><span class="dot" aria-hidden="true"></span>{sentence}</p>
			{#if story?.facts.length}<p class="ht-facts">{#each story.facts as f (f)}<span>{f}</span>{/each}</p>{/if}
			{#if byline}<div class="ht-by">{@render byline()}</div>{/if}

			<div class="ht-go">
				{#if owned && onDisk && manage}
					<button type="button" class="ht-btn go" onclick={() => void glowfin()} aria-busy={opening || undefined} data-testid="harbor-open-glowfin"><Icon name="play" size={18} />Open in Glowfin</button>
				{/if}
				{#if showGet}
					<button type="button" class="ht-btn go" onclick={() => void harborGet(d.kind as 'movie' | 'show', d.tmdb, d.name)} aria-busy={getting(d.kind, d.tmdb) || undefined} data-testid="harbor-title-get"><Icon name="plus" size={18} />Get</button>
				{:else if got}
					<span class="ht-btn done"><Icon name="check" size={16} />{got.titleId ? 'On your shelves' : got.ask === 'approved' ? 'Getting it' : 'Asked'}</span>
				{/if}
				{#if owned && manage}
					<button type="button" class="ht-btn" onclick={() => void openMore(MORE.pickCopy)}><Icon name="search" size={16} />Find a better copy</button>
					<button type="button" class="ht-btn" onclick={() => void openMore(MORE.rule)}><Icon name="tools" size={16} />Rules</button>
				{/if}
			</div>
			{#if showGet}<p class="ht-note">Follows your quality rules, 1080p at most. No questions asked.</p>{/if}
			{#if actions}<div class="ht-tools">{@render actions()}</div>{/if}
		</div>
	</div>

	{#if rings.length}
		<div class="ht-rings" data-testid="harbor-season-rings">
			<ul>
				{#each rings as r (r.number)}
					<li class="tone-{r.tone}" title="{r.name}: {r.words}">
						<span class="ring" style="--p: {r.percent}"><b>{r.percent}%</b></span>
						<span class="rw"><strong>{r.name}</strong><small>{r.words}</small></span>
					</li>
				{/each}
			</ul>
			{#if manage}<button type="button" class="ht-btn small" onclick={() => void openMore(MORE.seasons)}>See every episode</button>{/if}
		</div>
	{/if}

	{#if strip && strip.cards.length && focus != null}
		<h2 class="ht-h">Season {focus} episodes {#if strip.summary}<span>{strip.summary}</span>{/if}</h2>
		<ul class="ht-eps" data-testid="harbor-episodes">
			{#each strip.cards as e (e.id)}
				<li class="ep {e.state}">
					<button type="button" class="ep-art" disabled={e.state !== 'here' || !manage} onclick={() => void glowfin()} aria-label={e.state === 'here' ? `Open ${e.name} in Glowfin` : e.name}>
						{#if e.still}<img src={sized(e.still, 'backdrop', 240)} alt="" loading="lazy" decoding="async" />{/if}
						{#if e.state === 'here' && manage}<span class="ep-play"><Icon name="play" size={18} /></span>{/if}
						{#if e.state === 'coming'}<span class="ep-bar"><i></i></span>{/if}
					</button>
					<span class="ep-name">{e.name}</span>
					<small>{e.words}</small>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.ht { position: relative; isolation: isolate; display: grid; gap: 22px; min-width: 0; margin: calc(-1 * var(--s-6, 24px)) calc(-1 * var(--gutter, 28px)) 8px; padding: 26px var(--gutter, 28px) 10px; }
	.ht-art { position: absolute; inset: 0 0 auto; height: min(760px, 100%); z-index: -1; overflow: hidden; pointer-events: none; }
	.ht-art img { width: 100%; height: 100%; object-fit: cover; object-position: center 25%; }
	.ht-shade { position: absolute; inset: 0; background: linear-gradient(90deg, color-mix(in srgb, var(--bg) 94%, transparent) 22%, color-mix(in srgb, var(--bg) 45%, transparent) 70%, color-mix(in srgb, var(--bg) 30%, transparent)), linear-gradient(0deg, var(--bg), transparent 55%); }

	.ht-crumbs { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font: 600 13px/1.2 var(--font-ui); color: var(--text-muted); }
	.ht-crumbs a { color: inherit; text-decoration: none; }
	.ht-crumbs a:hover { color: var(--text); }

	.ht-main { display: flex; gap: 34px; align-items: flex-start; min-width: 0; }
	.ht-poster { flex: none; display: grid; place-items: end center; width: 230px; aspect-ratio: 2 / 3; overflow: hidden; border-radius: 20px; background: linear-gradient(160deg, color-mix(in srgb, var(--harbor-violet) 55%, #0b1220), color-mix(in srgb, var(--harbor-pink) 40%, #0b1220)); box-shadow: 0 24px 50px rgb(0 0 0 / 45%), 0 0 0 1px var(--harbor-edge); }
	.ht-poster img { width: 100%; height: 100%; object-fit: cover; }
	.ht-poster span { padding: 14px; font: 700 22px/1.05 var(--font-poster); letter-spacing: 0.04em; text-align: center; text-transform: uppercase; color: #fff; }
	.ht-text { display: grid; gap: 12px; align-content: start; min-width: 0; max-width: 760px; }
	.ht-name { margin: 0; font: 700 clamp(40px, 6vw, 72px) / 0.95 var(--font-poster); letter-spacing: 0.03em; text-transform: uppercase; overflow-wrap: anywhere; }
	.ht-sub { margin: -4px 0 0; font: 600 20px/1.3 var(--font-display); color: color-mix(in srgb, var(--text) 82%, var(--harbor-aqua)); }
	.ht-chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 2px 0 0; padding: 0; list-style: none; }
	.ht-chips li { display: inline-flex; align-items: center; height: 30px; padding: 0 13px; border-radius: 99px; background: var(--harbor-glass); border: 1px solid var(--harbor-edge); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); font: 600 13px/1 var(--font-ui); }
	.ht-chips li.glow { background: var(--harbor-grad); color: #fff; border: 0; }
	.ht-say { display: flex; gap: 10px; align-items: baseline; margin: 4px 0 0; font: 500 20px/1.45 var(--font-ui); }
	.ht-say .dot { flex: none; width: 11px; height: 11px; border-radius: 50%; background: var(--c, var(--harbor-aqua)); box-shadow: 0 0 12px var(--c, var(--harbor-aqua)); transform: translateY(-1px); }
	.tone-landed { --c: var(--harbor-mint); }
	.tone-moving { --c: var(--harbor-sky); }
	.tone-need { --c: var(--harbor-amber); }
	.tone-bad { --c: var(--harbor-red); }
	.tone-quiet { --c: color-mix(in srgb, var(--text) 45%, transparent); }
	.ht-facts { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: -4px 0 0 21px; font: 600 13px/1.3 var(--font-ui); color: var(--text-muted); }
	.ht-by { font: 500 14px/1.4 var(--font-ui); color: var(--text-muted); }
	.ht-by:empty { display: none; }
	.ht-go { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 8px; }
	.ht-btn { display: inline-flex; align-items: center; gap: 9px; height: 50px; padding: 0 22px; border-radius: 99px; border: 1px solid var(--harbor-edge); background: var(--harbor-glass); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); color: var(--text); font: 650 15px/1 var(--font-ui); cursor: pointer; white-space: nowrap; transition: transform 140ms ease-out, filter 140ms, background 140ms; }
	.ht-btn:hover { background: var(--harbor-glass-2); transform: translateY(-1px); }
	.ht-btn.go { border: 0; padding: 0 26px; background: var(--harbor-grad); color: #fff; font-size: 16px; box-shadow: 0 10px 28px rgb(255 95 162 / 32%); }
	.ht-btn.go:hover { filter: brightness(1.08); }
	.ht-btn.done { cursor: default; color: var(--harbor-mint); }
	.ht-btn.small { height: 40px; padding: 0 16px; font-size: 14px; }
	.ht-btn[aria-busy='true'] { opacity: 0.7; pointer-events: none; }
	.ht-btn:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--bg), 0 0 0 5px var(--harbor-aqua); }
	.ht-note { margin: -2px 0 0; font: 500 13px/1.3 var(--font-ui); color: var(--text-muted); }
	.ht-tools { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 6px 4px; margin-top: 2px; }
	.ht-tools :global(.tp-actions), .ht-tools :global(.actions) { display: contents; }

	.ht-rings { display: flex; flex-wrap: wrap; align-items: center; gap: 16px 26px; max-width: 1040px; padding: 18px 24px; border-radius: 26px; background: var(--harbor-glass); border: 1px solid var(--harbor-edge); -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px); }
	.ht-rings ul { display: flex; flex-wrap: wrap; gap: 16px 26px; flex: 1; min-width: 0; margin: 0; padding: 0; list-style: none; }
	.ht-rings li { display: flex; align-items: center; gap: 14px; }
	.ht-rings li + li { padding-left: 26px; border-left: 1px solid var(--harbor-edge); }
	.tone-mint { --c: var(--harbor-mint); }
	.tone-sky { --c: var(--harbor-sky); }
	.tone-pink { --c: var(--harbor-pink); }
	.tone-amber { --c: var(--harbor-amber); }
	.tone-faint { --c: color-mix(in srgb, var(--text) 40%, transparent); }
	.ring { position: relative; display: grid; place-items: center; width: 64px; height: 64px; border-radius: 50%; background: conic-gradient(var(--c) calc(var(--p) * 1%), color-mix(in srgb, var(--text) 12%, transparent) 0); filter: drop-shadow(0 0 8px color-mix(in srgb, var(--c) 55%, transparent)); }
	.ring::before { content: ''; position: absolute; inset: 6px; border-radius: 50%; background: color-mix(in srgb, var(--bg) 92%, transparent); }
	.ring b { position: relative; font: 700 14px/1 var(--font-display); }
	.rw { display: grid; gap: 2px; }
	.rw strong { font: 700 17px/1.2 var(--font-display); }
	.rw small { font: 500 13px/1.2 var(--font-ui); color: var(--text-muted); }

	.ht-h { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; margin: 6px 0 -8px; font: 700 22px/1.2 var(--font-display); }
	.ht-h span { font: 500 14px/1.2 var(--font-ui); color: var(--text-muted); }
	.ht-eps { display: flex; gap: 16px; margin: 0; padding: 4px 2px 10px; overflow-x: auto; list-style: none; scrollbar-width: thin; }
	.ep { flex: none; display: grid; gap: 4px; width: 236px; }
	.ep-art { position: relative; display: grid; place-items: center; width: 236px; aspect-ratio: 16 / 9; padding: 0; overflow: hidden; border: 0; border-radius: 16px; background: linear-gradient(150deg, color-mix(in srgb, var(--harbor-violet) 45%, #0b1220), color-mix(in srgb, var(--harbor-aqua) 30%, #0b1220)); box-shadow: 0 10px 24px rgb(0 0 0 / 30%); cursor: default; }
	.ep-art img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
	.ep.here .ep-art:not(:disabled) { cursor: pointer; }
	.ep.here .ep-art:not(:disabled):hover { box-shadow: 0 14px 30px rgb(0 0 0 / 40%), 0 0 0 2px var(--harbor-aqua); }
	.ep.later .ep-art, .ep.skipped .ep-art { opacity: 0.45; }
	.ep-play { position: relative; display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; background: rgb(255 255 255 / 92%); color: #0b1220; box-shadow: 0 6px 18px rgb(0 0 0 / 35%); }
	.ep-bar { position: absolute; left: 10px; right: 10px; bottom: 10px; height: 5px; border-radius: 9px; overflow: hidden; background: rgb(255 255 255 / 25%); }
	.ep-bar i { display: block; width: 40%; height: 100%; background: var(--harbor-sky); box-shadow: 0 0 10px var(--harbor-sky); animation: ht-flow 1.6s ease-in-out infinite alternate; }
	@keyframes ht-flow { from { transform: translateX(-60%); } to { transform: translateX(190%); } }
	.ep-name { font: 650 14px/1.3 var(--font-ui); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.ep small { font: 600 12px/1.2 var(--font-ui); color: var(--text-muted); }
	.ep.here small { color: var(--harbor-mint); }
	.ep.coming small { color: var(--harbor-sky); }
	.ep.missing small, .ep.bad small { color: var(--harbor-amber); }
	@media (prefers-reduced-motion: reduce) { .ep-bar i { animation: none; width: 100%; } }

	@media (max-width: 767px) {
		.ht { gap: 16px; margin-top: calc(-1 * var(--s-4, 16px)); padding-top: 16px; }
		.ht-main { flex-direction: column; align-items: center; gap: 18px; }
		.ht-poster { width: 150px; }
		.ht-text { justify-items: center; text-align: center; }
		.ht-chips, .ht-go, .ht-tools, .ht-facts { justify-content: center; }
		.ht-facts { margin-left: 0; }
		.ht-say { font-size: 17px; }
		.ht-go { width: 100%; }
		.ht-btn { height: 46px; padding: 0 18px; }
		.ht-btn.go { flex: 1 1 100%; justify-content: center; }
		.ht-rings { padding: 14px 16px; }
		.ht-rings li + li { padding-left: 0; border-left: 0; }
		.ring { width: 54px; height: 54px; }
		.ep, .ep-art { width: 200px; }
	}
</style>
