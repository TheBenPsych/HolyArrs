// Harbor's five places, each with its own row of tabs (design harbor-10 "bold look").
// The top pill menu shows the places; the row under it shows the tabs of the
// place you are in. Every page the old sidebar listed becomes a tab of one
// place, so nothing is lost: a page harborPlaces does not know goes to Tower
// (or to Today for people without Tower). Pure, so it is testable without a browser.

import type { HarborItem, HarborSection } from './nav.ts';

export type PlaceId = 'today' | 'explore' | 'board' | 'shelves' | 'tower';

export interface HarborPlaceTab {
	href: string;
	label: string;
	badge?: number;
}

export interface HarborPlace {
	id: PlaceId;
	label: string;
	icon: string;
	href: string;
	badge?: number;
	dot?: boolean;
	/** Short line under the name, for screen readers and the tooltip. */
	hint: string;
	tabs: HarborPlaceTab[];
}

const ORDER: PlaceId[] = ['today', 'explore', 'board', 'shelves', 'tower'];
const BY_LABEL: Record<string, PlaceId> = { Today: 'today', Explore: 'explore', Board: 'board', Shelves: 'shelves', Tower: 'tower' };
const HINTS: Record<PlaceId, string> = {
	today: 'What happened and what needs you',
	explore: 'Find new things to get',
	board: 'Everything asked for, on its way in',
	shelves: 'Everything you already have',
	tower: 'How the server is doing'
};

const base = (href: string) => href.split('?')[0];

/** Which place a page belongs to, for pages that are not a tab (title pages, people, settings pages). */
export function homeOf(path: string, has: Set<PlaceId>): PlaceId | null {
	const under = (p: string) => path === p || path.startsWith(p + '/');
	if (path === '/' || under('/calendar')) return 'today';
	if (under('/explore') || under('/popular') || under('/search') || under('/ai')) return 'explore';
	if (under('/board') || under('/requests')) return 'board';
	if (under('/library') || under('/title') || under('/people') || under('/music')) return 'shelves';
	if (under('/tower') || under('/health') || under('/plugins') || under('/settings')) return has.has('tower') ? 'tower' : null;
	if (under('/downloads')) return has.has('tower') ? 'tower' : has.has('board') ? 'board' : null;
	return null;
}

/** Where an old sidebar row goes. */
function tabHome(href: string, has: Set<PlaceId>): PlaceId {
	const p = base(href);
	// Downloads for people without Tower (they watch their own) sits on Board.
	if (p === '/downloads' && !has.has('tower')) return has.has('board') ? 'board' : 'today';
	return homeOf(p, has) ?? (has.has('tower') ? 'tower' : 'today');
}

/**
 * harborPlaces turns harborNav's sections (five places first, then every old
 * row) into the five places with their tabs. A place's own page is always
 * its first tab.
 */
export function harborPlaces(sections: HarborSection[]): HarborPlace[] {
	const five = sections[0]?.items ?? [];
	const rest = sections.slice(1).flatMap((s) => s.items);
	const places: HarborPlace[] = [];
	for (const id of ORDER) {
		const item = five.find((i) => BY_LABEL[i.label] === id);
		if (!item) continue;
		places.push({ id, label: item.label, icon: item.icon, href: item.href, badge: item.badge || undefined, dot: item.dot || undefined, hint: HINTS[id], tabs: [] });
	}
	const has = new Set(places.map((p) => p.id));
	const get = (id: PlaceId) => places.find((p) => p.id === id);
	const add = (id: PlaceId, tab: HarborPlaceTab) => {
		const pl = get(id);
		if (pl && !pl.tabs.some((t) => t.href === tab.href)) pl.tabs.push(tab);
	};
	const firstTab: Record<PlaceId, string> = { today: 'Today', explore: 'Explore', board: 'Board', shelves: 'Everything', tower: 'Overview' };
	for (const p of places) p.tabs.push({ href: p.href, label: firstTab[p.id] });

	const keeps = (i: HarborItem) => ({ href: i.href, label: i.label, badge: i.badge || undefined });
	// Harbor's own pages that the old sidebar never listed.
	const manager = rest.some((i) => i.href === '/library/stats');
	for (const i of rest) add(tabHome(i.href, has), keeps(i));
	// Tower reads: Overview, Jobs, Downloads, History, Rules, then the HolyArrs detail pages (sorted below).
	if (has.has('tower')) {
		add('tower', { href: '/tower?tab=jobs', label: 'Jobs' });
		add('tower', { href: '/tower?tab=rules', label: 'Rules' });
	}
	if (has.has('explore') && !get('explore')!.tabs.some((t) => t.href === '/search')) add('explore', { href: '/search', label: 'Search' });
	if (manager && has.has('shelves')) {
		add('shelves', { href: '/library/manga', label: 'Manga' });
		add('shelves', { href: '/library/tidy', label: 'Tidy' });
	}
	sortTabs(get('tower'), ['/tower', '/tower?tab=jobs', '/downloads', '/downloads/history', '/tower?tab=rules', '/health', '/plugins', '/settings']);
	sortTabs(get('shelves'), ['/library', '/library?kind=movie', '/library?kind=show', '/library?kind=artist', '/library/manga', '/library/stats', '/library/tidy']);
	return places;
}

function sortTabs(pl: HarborPlace | undefined, order: string[]) {
	if (!pl) return;
	const rank = (h: string) => {
		const i = order.indexOf(h);
		return i === -1 ? order.length : i;
	};
	pl.tabs.sort((a, b) => rank(a.href) - rank(b.href));
}

function matches(href: string, path: string, search: Pick<URLSearchParams, 'get'>): boolean {
	const [p, query] = href.split('?');
	if (query) {
		if (path !== p) return false;
		for (const [k, v] of new URLSearchParams(query).entries()) if (search.get(k) !== v) return false;
		return true;
	}
	if (p === '/') return path === '/';
	return path === p || path.startsWith(p + '/');
}

/** The place and tab for this page; exact query matches beat plain ones, longer paths beat shorter. */
export function placeHere(places: HarborPlace[], path: string, search: Pick<URLSearchParams, 'get'>): { place: HarborPlace | null; tab: string | null } {
	let best: { place: HarborPlace; href: string } | null = null;
	const better = (h: string) => !best || Number(h.includes('?')) - Number(best.href.includes('?')) > 0 || (h.includes('?') === best.href.includes('?') && h.length > best.href.length);
	for (const pl of places)
		for (const t of pl.tabs)
			if (matches(t.href, path, search) && better(t.href)) best = { place: pl, href: t.href };
	if (best) return { place: best.place, tab: best.href };
	const id = homeOf(path, new Set(places.map((p) => p.id)));
	return { place: places.find((p) => p.id === id) ?? null, tab: null };
}

/** The parts of a phone tab Harbor fills. Matches Tab in routes/(frame)/TabBar.svelte. */
export interface HarborTab {
	label: string;
	icon: string;
	href?: string;
	current?: boolean;
	badge?: number;
	dot?: boolean;
}

/**
 * harborTabs builds the phone tab bar from all five places (design harbor-10:
 * a floating glass bar). The old More sheet is not needed: every other page
 * is a tab of its place, and your account and alerts sit in the top bar.
 */
export function harborTabs<T extends HarborTab>(places: HarborPlace[], here: PlaceId | null, to: (href: string) => string): T[] {
	return places.map((p) => ({ href: to(p.href), label: p.label, icon: p.icon, current: p.id === here, badge: p.badge, dot: p.dot }) as T);
}
