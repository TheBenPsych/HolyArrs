<!-- Harbor's floating top menu (design harbor-10 "bold look"): the Harbor mark,
     a glass pill with the five places (Today, Explore, Board, Shelves, Tower),
     the one search, alerts and your account. Under it, a row of tabs for the
     place you are in: every page the old sidebar listed is one of those tabs.
     Replaces HolyArrs's sidebar and top bar (hooked in routes/+layout.svelte).
     It keeps the class ui-topbar, so the top bar's hide-on-scroll and
     see-through-over-a-hero rules (lib/discover/scroll-bar) still apply. -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon, { type IconName } from '#lib/ui/Icon.svelte';
	import { SearchField, topBar } from '#lib/discover/index.ts';
	import HarborAsk from './HarborAsk.svelte';
	import type { HarborPlace } from './places.ts';

	let {
		places,
		place,
		tab,
		link,
		brandHref,
		history = false,
		searchKey,
		searchHref,
		tools
	}: {
		places: HarborPlace[];
		/** The place this page belongs to. */
		place: HarborPlace | null;
		/** The href of the tab this page is. */
		tab: string | null;
		/** Turns an app path into a link (base path). */
		link: (href: string) => string;
		brandHref: string;
		/** A detail page: show a back arrow. */
		history?: boolean;
		searchKey: string;
		/** The Search page, for the phone's search button. */
		searchHref: string;
		/** Alerts and your account, on the right. */
		tools?: Snippet;
	} = $props();

	const tabs = $derived(place && place.tabs.length > 1 ? place.tabs : []);
</script>

<header class="ui-topbar harbor-top" class:away={topBar.hidden} class:has-tabs={tabs.length > 0} data-testid="harbor-top">
	<div class="row">
		<div class="lead">
			<a class="brand" href={brandHref} aria-label="Harbor, Today">
				<span class="mk" aria-hidden="true"></span><span class="word">Harbor</span>
			</a>
			{#if history}
				<button type="button" class="ib glass back" aria-label="Back" title="Back" onclick={() => window.history.back()}><Icon name="chevronLeft" size={20} /></button>
			{/if}
		</div>
		<nav class="pill glass" aria-label="Places" data-testid="harbor-places">
			{#each places as p (p.id)}
				<a href={link(p.href)} class:on={place?.id === p.id} aria-current={place?.id === p.id ? 'page' : undefined} title={p.hint}>
					<Icon name={p.icon as IconName} size={19} /><span class="t">{p.label}</span>
					{#if p.badge}<em aria-label="{p.badge} waiting">{p.badge > 99 ? '99+' : p.badge}</em>{:else if p.dot}<i aria-label="needs a look"></i>{/if}
				</a>
			{/each}
		</nav>
		<div class="tools">
			<div class="srch"><HarborAsk><SearchField {searchKey} /></HarborAsk></div>
			<a class="ib glass phone-search" href={searchHref} aria-label="Search"><Icon name="search" size={20} /></a>
			{#if tools}<div class="me">{@render tools()}</div>{/if}
		</div>
	</div>
	{#if place && tabs.length}
		<nav class="tabs" aria-label="{place.label} pages" data-testid="harbor-tabs">
			{#each tabs as t (t.href)}
				<a href={link(t.href)} class="tab" class:on={tab === t.href} aria-current={tab === t.href ? 'page' : undefined}>{t.label}{#if t.badge}<b>{t.badge > 99 ? '99+' : t.badge}</b>{/if}</a>
			{/each}
		</nav>
	{/if}
</header>

<style>
	.harbor-top {
		position: sticky; top: 0; z-index: 30; display: flex; flex-direction: column; gap: 6px;
		padding: 12px var(--gutter) 10px;
		/* A soft fade, not a slab: the page drifts under the floating glass. */
		background: linear-gradient(to bottom, color-mix(in srgb, var(--bg) 92%, transparent) 0, color-mix(in srgb, var(--bg) 70%, transparent) 70%, transparent);
		transition: transform var(--bar-glide, 0.3s ease), background-color var(--dur-slow, 0.4s) var(--ease-out, ease);
		will-change: transform;
	}
	.harbor-top.away { transform: translateY(-100%); pointer-events: none; }
	:global(html.over-hero) .harbor-top { background: transparent; }
	@media (prefers-reduced-motion: reduce) { .harbor-top { transition: none; } }

	.row { display: flex; align-items: center; gap: 14px; min-height: 52px; }
	.lead, .tools { flex: 1 1 0; display: flex; align-items: center; gap: 10px; min-width: 0; }
	.tools { justify-content: flex-end; }

	.glass {
		background: var(--harbor-glass); border: 1px solid var(--harbor-edge);
		-webkit-backdrop-filter: blur(22px) saturate(140%); backdrop-filter: blur(22px) saturate(140%);
		box-shadow: 0 10px 30px rgb(0 0 0 / 22%);
	}

	.brand { display: flex; align-items: center; gap: 10px; height: 44px; border-radius: 14px; color: var(--text); text-decoration: none; white-space: nowrap; }
	.brand:focus-visible { outline: none; box-shadow: var(--focus-ring); }
	.mk { width: 36px; height: 36px; flex: none; display: grid; place-items: center; border-radius: 12px; background: var(--harbor-grad); box-shadow: 0 6px 20px rgb(157 107 255 / 45%); }
	/* Harbor's mark on the glow gradient: a small white chart diamond. */
	.mk::after { content: ''; width: 10px; height: 20px; background: #fff; clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); }
	.word { font: 800 20px/1 var(--font-display); letter-spacing: 0.01em; }

	.ib { width: 44px; height: 44px; flex: none; display: grid; place-items: center; border-radius: 50%; color: var(--text); }
	.ib:hover { background: var(--harbor-glass-2); }
	.ib:focus-visible { outline: none; box-shadow: var(--focus-ring); }

	.pill { flex: none; display: flex; gap: 4px; padding: 5px; border-radius: 999px; }
	.pill a {
		position: relative; display: flex; align-items: center; gap: 8px; height: 42px; padding: 0 18px; border-radius: 999px;
		color: var(--text-muted); font: 700 15px/1 var(--font-ui); text-decoration: none; white-space: nowrap;
		transition: color var(--dur-fast, 0.15s) var(--ease-out, ease), background-color var(--dur-fast, 0.15s) var(--ease-out, ease), box-shadow var(--dur, 0.25s) var(--ease-out, ease);
	}
	.pill a:hover { color: var(--text); background: var(--harbor-glass-2); }
	.pill a.on { color: #fff; background: var(--harbor-grad); box-shadow: 0 6px 22px rgb(255 95 162 / 35%); }
	.pill a:focus-visible { outline: none; box-shadow: var(--focus-ring); }
	.pill em { font-style: normal; min-width: 20px; height: 20px; padding: 0 6px; display: grid; place-items: center; border-radius: 999px; background: #fff; color: #0b1220; font: 800 11px/1 var(--font-ui); }
	.pill i { position: absolute; top: 8px; right: 10px; width: 8px; height: 8px; border-radius: 50%; background: var(--harbor-amber); box-shadow: 0 0 10px var(--harbor-amber); }

	/* The one search, a slimmer glass pill so the places stay in the middle. */
	.srch { min-width: 0; }
	.srch :global(.ui-search) { width: clamp(200px, 20vw, 300px); }
	.phone-search { display: none; }

	.me { display: flex; align-items: center; gap: 6px; }

	.tabs { display: flex; justify-content: center; gap: 8px; overflow-x: auto; scrollbar-width: none; padding: 2px 0; }
	.tabs::-webkit-scrollbar { display: none; }
	.tab {
		flex: none; display: flex; align-items: center; gap: 7px; height: 34px; padding: 0 16px; border-radius: 999px;
		background: var(--harbor-glass); border: 1px solid var(--harbor-edge); color: var(--text-muted);
		-webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px);
		font: 700 13.5px/1 var(--font-ui); text-decoration: none; white-space: nowrap;
		transition: color var(--dur-fast, 0.15s) var(--ease-out, ease), background-color var(--dur-fast, 0.15s) var(--ease-out, ease);
	}
	.tab:hover { color: var(--text); }
	.tab.on { background: var(--harbor-chip-on); color: var(--harbor-chip-on-text); border-color: transparent; }
	.tab:focus-visible { outline: none; box-shadow: var(--focus-ring); }
	.tab b { min-width: 18px; height: 18px; padding: 0 5px; display: grid; place-items: center; border-radius: 999px; background: var(--accent-fill); color: #fff; font: 800 10.5px/1 var(--font-ui); }

	/* Narrower screens: the places show icons only, then the search becomes a button. */
	@media (max-width: 1239px) {
		.pill a { padding: 0 14px; }
		.srch :global(.ui-search) { width: clamp(180px, 18vw, 240px); }
	}
	@media (max-width: 1099px) {
		.pill a .t { display: none; }
		.pill a { padding: 0 13px; }
	}
	@media (max-width: 899px) {
		.srch { display: none; }
		.phone-search { display: grid; }
	}
	/* Phones: the places move to the floating tab bar at the bottom; the top keeps the mark, search, alerts and you. */
	@media (max-width: 767px) {
		.harbor-top { padding: 8px var(--gutter) 6px; gap: 4px; }
		.row { min-height: 46px; }
		.pill { display: none; }
		.word { font-size: 18px; }
		.mk { width: 32px; height: 32px; border-radius: 10px; }
		.tabs { justify-content: flex-start; margin: 0 calc(-1 * var(--gutter)); padding: 2px var(--gutter); }
	}
</style>
