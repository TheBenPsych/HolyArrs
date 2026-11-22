<!-- Harbor's big top picture on Explore (design harbor-10 screen 2; build
     list part 3, Ben's Yes "the big top picture changes every few seconds").
     A full-width picture that runs up behind the top menu, the title in big
     poster letters, + Get and More about it. It moves through the five
     most-trending titles every 8 seconds; the dots jump to one. It holds
     still while the pointer or the remote's focus is on it, and while the
     tab is hidden. -->
<script lang="ts">
	import Icon from '#lib/ui/Icon.svelte';
	import { sized } from '#lib/core/tmdb-image.ts';
	import { cardTmdb, type ExploreCard } from '#lib/ui/title-cards.ts';
	import { badgeOf, HERO_EVERY, HERO_MAX, heroLabel, nextHero } from './explore.ts';
	import { getting, mayGet } from './get.svelte.ts';

	let {
		cards,
		hrefOf,
		onget,
		genresOf
	}: {
		cards: ExploreCard[];
		hrefOf: (c: ExploreCard) => string | undefined;
		onget: (c: ExploreCard) => void;
		genresOf?: (c: ExploreCard) => string[];
	} = $props();

	const shown = $derived(cards.slice(0, HERO_MAX));
	let at = $state(0);
	let held = $state(false);
	const i = $derived(shown.length ? at % shown.length : 0);
	const c = $derived(shown[i]);

	$effect(() => {
		const n = shown.length;
		if (n < 2 || held) return;
		const tick = setInterval(() => {
			if (!document.hidden) at = nextHero(at % n, n);
		}, HERO_EVERY);
		return () => clearInterval(tick);
	});

	const meta = (x: ExploreCard) => [x.year ? String(x.year) : '', x.kind === 'show' ? 'Show' : 'Movie', ...(genresOf?.(x) ?? []).slice(0, 2)].filter(Boolean).join(' · ');
	const badge = $derived(c ? badgeOf(c.status, c.titleId) : null);
	const canGet = $derived(!!c && !badge && !!cardTmdb(c) && (c.kind === 'movie' || c.kind === 'show') && mayGet());
</script>

{#if c}
	<section class="harbor-hero" aria-roledescription="carousel" aria-label="Trending this week" data-testid="harbor-hero"
		onpointerenter={() => (held = true)} onpointerleave={() => (held = false)} onfocusin={() => (held = true)} onfocusout={() => (held = false)}>
		{#each shown as s, k (s.key)}
			<div class="pic" class:on={k === i} aria-hidden="true">
				{#if s.wide ?? s.image}<img src={sized(s.wide ?? s.image, 'backdrop', 1600)} alt="" loading={k === 0 ? 'eager' : 'lazy'} decoding="async" />{/if}
			</div>
		{/each}
		<div class="shade" aria-hidden="true"></div>
		<div class="words" aria-live="polite">
			<span class="lbl">{heroLabel(i)}</span>
			{#if c.art?.logo}
				<h2 class="logo"><img src={c.art.logo} alt={c.name} /></h2>
			{:else}
				<h2 class="name">{c.name}</h2>
			{/if}
			<p class="meta">{meta(c)}{#if badge}<span class="tag tone-{badge.tone}"><i></i>{badge.text}</span>{/if}</p>
			<div class="btns">
				{#if canGet}
					<button type="button" class="go" aria-busy={getting(c.kind, cardTmdb(c)) || undefined} onclick={() => onget(c)} data-testid="hero-get"><Icon name="plus" size={18} />Get</button>
				{/if}
				{#if hrefOf(c)}<a class="more" href={hrefOf(c)}>More about it</a>{/if}
			</div>
		</div>
		{#if shown.length > 1}
			<div class="dots" role="group" aria-label="Pick a title">
				{#each shown as s, k (s.key)}
					<button type="button" class:on={k === i} aria-label="Show {s.name}" aria-current={k === i || undefined} onclick={() => (at = k)}><span></span></button>
				{/each}
			</div>
		{/if}
	</section>
{/if}

<style>
	.harbor-hero { position: relative; display: flex; align-items: flex-end; min-height: clamp(380px, 52vh, 560px);
		margin: calc(-1 * (var(--topbar) + var(--s-6))) calc(-1 * var(--gutter)) 0; padding: calc(var(--topbar) + 40px) var(--gutter) 56px; overflow: hidden; isolation: isolate; }
	.pic { position: absolute; inset: 0; z-index: -2; opacity: 0; transition: opacity 900ms ease; -webkit-mask-image: linear-gradient(#000 60%, transparent); mask-image: linear-gradient(#000 60%, transparent); }
	.pic.on { opacity: 1; }
	.pic img { width: 100%; height: 100%; object-fit: cover; object-position: center 25%; }
	.pic.on img { animation: harbor-hero-drift 9s ease-out both; }
	@keyframes harbor-hero-drift { from { transform: scale(1.06); } to { transform: scale(1); } }
	.shade { position: absolute; inset: 0; z-index: -1; background: linear-gradient(90deg, color-mix(in srgb, var(--bg) 92%, transparent) 8%, color-mix(in srgb, var(--bg) 40%, transparent) 45%, transparent 70%), linear-gradient(transparent 55%, var(--bg)); }
	.words { display: grid; justify-items: start; gap: 10px; max-width: min(640px, 62%); }
	.lbl { font: 800 12px/1 var(--font-ui); letter-spacing: 0.12em; text-transform: uppercase; color: var(--harbor-amber); }
	.name { margin: 0; font: 700 clamp(40px, 6vw, 76px)/0.95 var(--font-poster); letter-spacing: 0.01em; text-transform: uppercase; color: var(--text); text-wrap: balance; }
	.logo { margin: 4px 0; }
	.logo img { display: block; max-width: min(460px, 100%); max-height: 150px; object-fit: contain; object-position: left bottom; filter: drop-shadow(0 4px 18px rgb(0 0 0 / 45%)); }
	.meta { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 0; font: 600 16px/1.3 var(--font-ui); color: color-mix(in srgb, var(--text) 85%, transparent); }
	.tag { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 99px; background: rgb(0 0 0 / 45%); font: 700 12px/1 var(--font-ui); color: #fff; }
	.tag i { width: 8px; height: 8px; border-radius: 50%; background: var(--c); box-shadow: 0 0 8px var(--c); }
	.tone-on { --c: var(--harbor-mint); } .tone-coming { --c: var(--harbor-sky); } .tone-asked { --c: var(--harbor-pink); }
	.btns { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 8px; }
	.btns > * { display: inline-flex; align-items: center; gap: 8px; height: 46px; padding: 0 22px; border-radius: 99px; font: 700 15px/1 var(--font-ui); text-decoration: none; cursor: pointer; }
	.go { border: 0; background: var(--harbor-grad); color: #fff; box-shadow: 0 10px 26px rgb(255 95 162 / 35%); }
	.go:hover { filter: brightness(1.08); }
	.go[aria-busy='true'] { opacity: 0.7; cursor: progress; }
	.more { border: 1px solid var(--harbor-edge); background: var(--harbor-glass-2); color: var(--text); -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px); }
	.more:hover { background: var(--harbor-glass); }
	.btns > *:focus-visible, .dots button:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--bg), 0 0 0 5px var(--harbor-aqua); }
	.dots { position: absolute; left: var(--gutter); bottom: 22px; display: flex; gap: 4px; }
	.dots button { display: grid; place-items: center; height: 24px; padding: 0 3px; border: 0; background: none; cursor: pointer; }
	.dots span { display: block; width: 10px; height: 6px; border-radius: 9px; background: color-mix(in srgb, var(--text) 35%, transparent); transition: width 300ms ease, background 300ms ease; }
	.dots .on span { width: 34px; background: var(--text); }
	@media (prefers-reduced-motion: reduce) { .pic { transition: none; } .pic.on img { animation: none; } }
	@media (max-width: 767px) {
		.harbor-hero { min-height: 420px; padding-bottom: 50px; }
		.words { max-width: 100%; }
		.shade { background: linear-gradient(transparent 20%, color-mix(in srgb, var(--bg) 70%, transparent) 60%, var(--bg)); }
		.name { font-size: clamp(34px, 10vw, 48px); }
		.logo img { max-height: 96px; }
	}
</style>
