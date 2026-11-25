<script lang="ts">
	import { FinishSetupCard } from '#lib/setup/index.ts';
	import { t } from '#lib/core/i18n/i18n.svelte.ts';
	// Harbor: the Settings home is one search box and six plain groups (lib/harbor/HarborSettings.svelte, bold redesign part 7).
	// The search is still HolyArrs's: every page and every hand-made entry, found by its words. My account is in the account menu.
	import { HarborSettings } from '#lib/harbor/index.ts';
	import { entryLabel, resultKey, searchSettings, settingIndex, type SettingEntry } from './(home)/settings-search.ts';
	import { clearFlight, settingsNav } from './(home)/zoom.ts';
	import { offPartName, partsNow } from '#lib/mediafiles/index.ts';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { to } from '#lib/core/paths.ts';
	import { groups as allGroups, sections as all, visible } from '#lib/core/settings.ts';
	import { session } from '#lib/core/session.svelte.ts';
	import { settingsFind } from '#lib/core/settings-find.svelte.ts';

	const sections = $derived(visible(all, session.can).filter((section) => !offPartName(partsNow.answer, section.href)));
	const open = $derived(new Set(sections.map((s) => s.href)));
	const sectionOf = (href: string) => all.find((s) => s.href === href);
	const groupLabel = (href: string) => allGroups.find((g) => g.id === sectionOf(href)?.group)?.label ?? '';

	// Pages are results too, so "subtitles" finds the page as well as its fields.
	const index = $derived<SettingEntry[]>([...sections.map((s) => ({ label: s.label, href: s.href, anchor: '', words: s.about })), ...settingIndex]);

	// The top bar's "Search settings" (or a link with ?q=) hands over the words too.
	const q0 = page.url.searchParams.get('q');
	if (q0) settingsFind.term = q0;
	const results = $derived(searchSettings(settingsFind.term, (h) => open.has(h), groupLabel, index).slice(0, 30));
	const link = (r: SettingEntry) => to(r.href) + (r.anchor ? `#${r.anchor}` : '');
	// Enter in the top bar field opens the first match.
	$effect(() => {
		settingsFind.first = results[0] ? link(results[0]) : '';
	});
	const hits = $derived(
		results.map((r) => {
			const s = sectionOf(r.href);
			return {
				key: resultKey(r),
				label: entryLabel(r),
				where: r.anchor ? `${s?.label ?? ''}${r.advanced ? ' › ' + t('settings.home.advanced') : ''}` : 'Settings page',
				href: link(r),
				icon: s?.icon ?? 'tools',
				tint: s?.tint ?? 'gray'
			};
		})
	);

	// Coming back from a page: the layout covers the screen to shrink it into a card. There are no cards here, so the cover just goes.
	onMount(() => {
		settingsNav.move = null;
		clearFlight();
	});
</script>

<svelte:head><title>{t('settings.home.title')} · HolyArrs</title></svelte:head>

<div class="finish-setup"><FinishSetupCard /></div>
<HarborSettings {sections} results={hits} />

<style>
	.finish-setup:empty { display: none; }
	.finish-setup { margin-bottom: var(--s-4); }
</style>
