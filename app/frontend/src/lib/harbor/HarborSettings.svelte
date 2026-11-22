<!-- Harbor's Settings home: one search box and six plain groups (Where files
     go, How it finds things, Downloading, People and sign-in, Linked apps,
     Upkeep), every page listed in its group so each is one tap away, and
     "What changed lately" at the bottom. The search itself is HolyArrs's
     settings search (the page hands the results in), plus the old apps'
     names. Design: harbor-10 screen 7, harbor-11 idea "changes". -->
<script lang="ts">
	import { onMount } from 'svelte';
	import Icon, { type IconName } from '#lib/ui/Icon.svelte';
	import SettingsTile from '#lib/ui/SettingsTile.svelte';
	import type { Tint } from '#lib/core/settings.ts';
	import { api } from '#lib/core/api.ts';
	import { to } from '#lib/core/paths.ts';
	import { session } from '#lib/core/session.svelte.ts';
	import { settingsFind } from '#lib/core/settings-find.svelte.ts';
	import type { EventPage, EventRecord } from '#lib/core/types.ts';
	import { groupState, settingsNow, stateWords } from '#lib/alerts/index.ts';
	import { findOldName } from './tower.ts';
	import { CHANGE_KINDS, changeLine, settingsGroups, whenWords } from './tower-bold.ts';

	interface Page {
		href: string;
		label: string;
		about: string;
		icon: IconName;
	}
	interface Hit {
		key: string;
		label: string;
		where: string;
		href: string;
		icon: IconName;
		tint: Tint;
	}
	let { sections, results }: { sections: Page[]; results: Hit[] } = $props();

	const groups = $derived(settingsGroups(sections));
	const query = $derived(settingsFind.term);
	// Old names that point at a settings page show only when that page is open to this person.
	const old = $derived(findOldName(query).filter((o) => !o.href.startsWith('/settings/') || sections.some((s) => o.href.split('#')[0] === s.href)));
	const answer = $derived(settingsNow.answer);

	let changes = $state<EventRecord[] | null>(null);
	const now = Date.now();
	onMount(() => {
		if (!session.can('settings') && !session.can('users')) return;
		api.get<EventPage>(`/events?kind=${CHANGE_KINDS}&limit=6`).then(
			(r) => (changes = r.events ?? []),
			() => (changes = [])
		);
	});
</script>

<div class="harbor-settings" data-testid="harbor-settings">
	<header class="top">
		<h1>Settings</h1>
		<p class="lede">Six groups, or just search. Every page is one tap away.</p>
		<div class="find glass">
			<Icon name="search" size={20} />
			<label class="sr-only" for="harbor-settings-find">Search settings</label>
			<input id="harbor-settings-find" type="search" placeholder="Search settings, like “quality”, “folders” or “Jellyfin”" autocomplete="off" enterkeyhint="search" bind:value={settingsFind.term} data-testid="harbor-settings-find" />
			{#if query}<button type="button" class="clear" aria-label="Clear the search" onclick={() => (settingsFind.term = '')}><Icon name="x" size={16} /></button>{/if}
		</div>
	</header>

	{#if query.trim()}
		<section class="results glass" aria-label="Matching settings">
			{#if results.length || old.length}
				<ul>
					{#each results as r (r.key)}
						<li>
							<a href={r.href} data-testid="setting-result" onclick={() => (settingsFind.term = '')}>
								<SettingsTile icon={r.icon} tint={r.tint} size="lg" />
								<span class="words"><strong>{r.label}</strong><span>{r.where}</span></span>
								<Icon name="chevronRight" size={16} />
							</a>
						</li>
					{/each}
					{#each old as o (o.old)}
						<li>
							<a href={to(o.href)} onclick={() => (settingsFind.term = '')}>
								<span class="ico"><Icon name="arrow" size={15} /></span>
								<span class="words"><strong>{o.now}</strong><span>Called “{o.old}” in the old apps</span></span>
								<Icon name="chevronRight" size={16} />
							</a>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="none">Nothing called “{query.trim()}”. Try one plain word, like “subtitles” or “backup”.</p>
			{/if}
		</section>
	{:else}
		<div class="groups">
			{#each groups as { group, items } (group.id)}
				{@const gs = answer ? groupState(answer, items.map((i) => i.href)) : null}
				<section class="group glass c-{group.colour}" id="group-{group.id}" aria-labelledby="g-{group.id}" data-testid="settings-group">
					<div class="gh">
						<span class="badge" aria-hidden="true"><Icon name={group.icon} size={20} /></span>
						<div class="gw">
							<h2 id="g-{group.id}">{group.label}</h2>
							<p>{group.line}</p>
						</div>
						{#if gs && (gs.state === 'attention' || gs.state === 'unset') && stateWords(gs)}<span class="flag {gs.state === 'attention' ? 'fail' : 'wait'}" data-testid="group-status">{stateWords(gs)}</span>{/if}
					</div>
					<ul>
						{#each items as s (s.href)}
							<li><a href={to(s.href)}><strong>{s.label}</strong><span>{s.about}</span><Icon name="chevronRight" size={15} /></a></li>
						{/each}
					</ul>
				</section>
			{/each}
		</div>
	{/if}

	{#if changes}
		<section class="changes glass" aria-labelledby="changed-h" data-testid="settings-changes">
			<h2 id="changed-h">What changed lately</h2>
			{#if changes.length}
				<ul>
					{#each changes as e (e.ID)}<li><span>{changeLine(e)}</span><time datetime={e.At}>{whenWords(e.At, now)}</time></li>{/each}
				</ul>
			{:else}
				<p class="none">No settings have changed yet.</p>
			{/if}
		</section>
	{/if}
</div>

<style>
	.harbor-settings { display: grid; gap: 22px; max-width: 1280px; margin: 0 auto; padding: 18px 0 48px; }
	.glass { border: 1px solid var(--harbor-edge); background: var(--harbor-glass); -webkit-backdrop-filter: blur(18px) saturate(140%); backdrop-filter: blur(18px) saturate(140%); }
	.top { display: grid; gap: 6px; }
	h1 { margin: 0; font: 800 clamp(32px, 4vw, 46px)/1.05 var(--font-display); letter-spacing: -0.025em; color: var(--text); }
	.lede { margin: 0 0 10px; font: 500 16px/1.4 var(--font-ui); color: var(--text-muted); }
	.find { display: flex; align-items: center; gap: 12px; max-width: 760px; height: 58px; padding: 0 12px 0 20px; border-radius: 99px; color: var(--text-muted); box-shadow: 0 0 0 1px transparent, 0 18px 40px -24px rgb(157 107 255 / 60%); }
	.find:focus-within { border-color: var(--harbor-violet); box-shadow: 0 0 0 1px var(--harbor-violet), 0 0 34px -8px var(--harbor-violet); }
	.find input { flex: 1; min-width: 0; height: 100%; border: 0; background: none; color: var(--text); font: 500 17px/1 var(--font-ui); outline: none; }
	.find input::-webkit-search-cancel-button { display: none; }
	.clear { display: grid; place-items: center; width: 36px; height: 36px; border: 0; border-radius: 50%; background: var(--harbor-glass-2); color: var(--text); cursor: pointer; }

	.results { padding: 8px; border-radius: 22px; }
	.results ul, .group ul, .changes ul { margin: 0; padding: 0; list-style: none; }
	.results a { display: flex; align-items: center; gap: 14px; padding: 10px 12px; border-radius: 16px; color: var(--text); text-decoration: none; }
	.results a:hover, .results a:focus-visible { background: var(--harbor-glass-2); outline: none; }
	.ico { display: grid; place-items: center; flex: none; width: 28px; height: 28px; border-radius: 8px; background: var(--harbor-glass-2); color: var(--text); }
	.words { display: grid; gap: 2px; flex: 1; min-width: 0; }
	.words strong { font: 700 15px/1.25 var(--font-ui); }
	.words span { font: 500 13px/1.3 var(--font-ui); color: var(--text-muted); }
	.none { margin: 0; padding: 14px; font: 500 15px/1.4 var(--font-ui); color: var(--text-muted); }

	.groups { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; align-items: start; }
	.group { position: relative; display: grid; gap: 10px; padding: 18px 16px 12px; border-radius: 22px; overflow: hidden; scroll-margin-top: calc(var(--topbar) + 16px); }
	.group::before { content: ''; position: absolute; top: -70px; right: -70px; width: 180px; height: 180px; border-radius: 50%; background: var(--c); filter: blur(70px); opacity: 0.28; pointer-events: none; }
	.c-pink { --c: var(--harbor-pink); }
	.c-violet { --c: var(--harbor-violet); }
	.c-sky { --c: var(--harbor-sky); }
	.c-aqua { --c: var(--harbor-aqua); }
	.c-mint { --c: var(--harbor-mint); }
	.c-amber { --c: var(--harbor-amber); }
	.gh { position: relative; display: flex; align-items: center; gap: 12px; padding: 0 4px; }
	.badge { display: grid; place-items: center; flex: none; width: 42px; height: 42px; border-radius: 13px; background: var(--c); color: #0b1220; box-shadow: 0 6px 18px -4px var(--c); }
	.gw { min-width: 0; }
	.gw h2 { margin: 0; font: 700 18px/1.2 var(--font-display); letter-spacing: -0.01em; color: var(--text); }
	.gw p { margin: 2px 0 0; font: 500 13px/1.3 var(--font-ui); color: var(--text-muted); }
	.flag { margin-left: auto; align-self: flex-start; padding: 5px 9px; border-radius: 99px; font: 700 11px/1 var(--font-ui); white-space: nowrap; }
	.flag.fail { background: color-mix(in srgb, var(--harbor-red) 22%, transparent); color: var(--fail-text); }
	.flag.wait { background: color-mix(in srgb, var(--harbor-amber) 22%, transparent); color: var(--wait-text); }
	.group ul { position: relative; display: grid; }
	.group li + li { border-top: 1px solid var(--harbor-edge); }
	.group a { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 1px 8px; padding: 9px 6px; border-radius: 10px; color: var(--text); text-decoration: none; }
	.group a strong { font: 650 15px/1.25 var(--font-ui); }
	.group a span { grid-column: 1; font: 500 12.5px/1.3 var(--font-ui); color: var(--text-muted); }
	.group a > :global(.icon) { grid-column: 2; grid-row: 1 / span 2; color: var(--text-faint); }
	.group a:hover, .group a:focus-visible { background: var(--harbor-glass-2); outline: none; }
	.group a:hover > :global(.icon) { color: var(--c); }

	.changes { display: grid; gap: 8px; padding: 18px 20px; border-radius: 22px; }
	.changes h2 { margin: 0 0 4px; font: 700 19px/1.2 var(--font-display); color: var(--text); }
	.changes li { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 16px; padding: 10px 0; border-top: 1px solid var(--harbor-edge); font: 500 14px/1.4 var(--font-ui); color: var(--text); }
	.changes time { color: var(--text-muted); font-size: 13px; white-space: nowrap; }
	.changes .none { padding: 0; }

	@media (max-width: 1100px) { .groups { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
	@media (max-width: 767px) {
		.harbor-settings { padding: 12px 0 96px; }
		.groups { grid-template-columns: 1fr; }
		.find { height: 52px; }
		.find input { font-size: 16px; }
	}
</style>
