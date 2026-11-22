<!-- One of Harbor's poster rows on Explore (design harbor-10 screen 2): a
     heading with a short note, then big posters. Each poster can wear a
     glowing tag (On Glowfin, Coming in, Asked, or its own words such as
     "2 of 3 owned") and a round + that gets the title in one tap. -->
<script lang="ts" module>
	export interface HarborPoster {
		key: string;
		kind: 'movie' | 'show';
		tmdb: string;
		name: string;
		image?: string | null;
		href?: string;
		status?: string;
		titleId?: number;
		/** Its own tag, shown amber, instead of the state tag. */
		tag?: string;
		/** A short line under the name, such as "New on Fridays". */
		line?: string;
	}
</script>

<script lang="ts">
	import Icon from '#lib/ui/Icon.svelte';
	import { sized } from '#lib/core/tmdb-image.ts';
	import { badgeOf } from './explore.ts';
	import { getting, mayGet } from './get.svelte.ts';

	let { id, title, note, posters, onget, testid }: { id: string; title: string; note?: string; posters: HarborPoster[]; onget: (p: HarborPoster) => void; testid?: string } = $props();
</script>

<section class="harbor-row" aria-labelledby="{id}-h" data-testid={testid}>
	<h2 id="{id}-h">{title}{#if note}<span>{note}</span>{/if}</h2>
	<ul class="posters">
		{#each posters as p (p.key)}
			{@const b = badgeOf(p.status, p.titleId)}
			<li class="hcard">
				<a class="po" href={p.href} aria-label={p.name}>
					{#if p.image}<img src={sized(p.image, 'poster', 340)} alt="" loading="lazy" decoding="async" />{:else}<span class="po-name">{p.name}</span>{/if}
					{#if p.tag && !b}<span class="tag tone-own"><i></i>{p.tag}</span>{:else if b}<span class="tag tone-{b.tone}"><i></i>{b.text}</span>{/if}
				</a>
				{#if !b && p.tmdb && mayGet()}
					<button type="button" class="plus" aria-label="Get {p.name}" aria-busy={getting(p.kind, p.tmdb) || undefined} onclick={() => onget(p)}><Icon name="plus" size={18} /></button>
				{/if}
				<span class="cap">{p.name}</span>
				{#if p.line}<span class="line">{p.line}</span>{/if}
			</li>
		{/each}
	</ul>
</section>

<style>
	.harbor-row { display: grid; gap: 12px; min-width: 0; }
	h2 { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; margin: 0; font: 700 22px/1.2 var(--font-display); letter-spacing: -0.01em; color: var(--text); }
	h2 span { font: 600 13px/1.2 var(--font-ui); letter-spacing: 0; color: var(--text-muted); }
	.posters { display: flex; gap: 16px; margin: 0 calc(-1 * var(--gutter)); padding: 6px var(--gutter) 10px; overflow-x: auto; overscroll-behavior-x: contain; scroll-snap-type: x proximity; scroll-padding-inline: var(--gutter); scrollbar-width: none; list-style: none; }
	.posters::-webkit-scrollbar { display: none; }
	.hcard { position: relative; display: grid; align-content: start; gap: 4px; flex: none; width: var(--harbor-poster, 158px); scroll-snap-align: start; }
	.po { position: relative; display: grid; place-items: end center; aspect-ratio: 2 / 3; overflow: hidden; border-radius: 16px; background: linear-gradient(160deg, color-mix(in srgb, var(--harbor-violet) 55%, #0b1220), color-mix(in srgb, var(--harbor-pink) 40%, #0b1220)); box-shadow: 0 10px 26px rgb(0 0 0 / 30%); transition: transform 160ms ease-out, box-shadow 160ms ease-out; }
	.po img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
	.po-name { position: relative; padding: 10px 8px; font: 700 15px/1.05 var(--font-poster); letter-spacing: 0.04em; text-align: center; text-transform: uppercase; color: #fff; overflow-wrap: anywhere; }
	.hcard:hover .po, .po:focus-visible { transform: translateY(-4px); box-shadow: 0 16px 34px rgb(0 0 0 / 42%), 0 0 0 2px var(--harbor-aqua); }
	.po:focus-visible { outline: none; }
	.tag { position: absolute; top: 8px; left: 8px; display: inline-flex; align-items: center; gap: 5px; max-width: calc(100% - 16px); padding: 4px 8px; border-radius: 99px; background: rgb(6 11 18 / 72%); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); font: 700 11px/1 var(--font-ui); color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.tag i { flex: none; width: 7px; height: 7px; border-radius: 50%; background: var(--c); box-shadow: 0 0 8px var(--c); }
	.tone-on { --c: var(--harbor-mint); } .tone-coming { --c: var(--harbor-sky); } .tone-asked { --c: var(--harbor-pink); } .tone-own { --c: var(--harbor-amber); }
	.plus { position: absolute; top: calc(var(--harbor-poster, 158px) * 1.5 - 44px); right: 8px; display: grid; place-items: center; width: 36px; height: 36px; border: 0; border-radius: 50%; background: #fff; color: #0b1220; box-shadow: 0 6px 16px rgb(0 0 0 / 35%); cursor: pointer; transition: transform 140ms ease-out; }
	.plus:hover { transform: scale(1.08); background: var(--harbor-grad); color: #fff; }
	.plus:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--bg), 0 0 0 5px var(--harbor-aqua); }
	.plus[aria-busy='true'] { opacity: 0.6; cursor: progress; }
	.cap { margin-top: 6px; font: 700 14px/1.25 var(--font-ui); color: var(--text); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
	.line { font: 600 12px/1.25 var(--font-ui); color: var(--text-muted); }
	@media (min-width: 1800px) { .hcard { --harbor-poster: 190px; } }
	@media (max-width: 767px) { .hcard { --harbor-poster: 124px; } .posters { gap: 12px; } h2 { font-size: 19px; } }
	@media (prefers-reduced-motion: reduce) { .po, .plus { transition: none; } }
</style>
