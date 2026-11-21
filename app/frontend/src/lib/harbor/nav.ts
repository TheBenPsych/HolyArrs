// Harbor's five-place menu: Today, Board, Explore, Shelves and Tower.
// HolyArrs builds its own sidebar sections (routes/(frame)/nav.ts); harborNav
// reshapes them so the five places sit on top and every HolyArrs page is kept
// underneath in a "More" group. Nothing is dropped and no permission rule
// changes: a place only shows when the HolyArrs page it opens is allowed.
// Design: harbor-5-from-scratch and harbor-6-board-round2.

/** The parts of a sidebar row Harbor reads. Matches NavItem in routes/(frame)/nav.ts. */
export interface HarborItem {
	href: string;
	label: string;
	icon: string;
	need: string | null;
	also?: string[];
	badge?: number;
	badgeLabel?: string;
	ring?: number;
	dot?: boolean;
}

/** The parts of a sidebar section Harbor reads. Matches NavSection in routes/(frame)/nav.ts. */
export interface HarborSection<I extends HarborItem = HarborItem> {
	id: string;
	label: string | null;
	items: I[];
}

export const HARBOR_PLACES = ['Today', 'Board', 'Explore', 'Shelves', 'Tower'] as const;
export const HARBOR_MORE = 'More';

const base = (href: string) => href.split('?')[0];

/**
 * harborNav puts Harbor's five places first and keeps HolyArrs's own pages
 * under "More". Each place borrows the badge of the page it opens (waiting
 * requests on Board, the settings flag on Tower).
 */
export function harborNav<I extends HarborItem, S extends HarborSection<I>>(sections: S[]): S[] {
	const items = sections.flatMap((s) => s.items);
	const find = (...hrefs: string[]) => {
		for (const h of hrefs) {
			const hit = items.find((i) => i.href === h);
			if (hit) return hit;
		}
		return items.find((i) => hrefs.some((h) => base(i.href) === h));
	};
	const place = (from: I | undefined, label: string, icon: string, also: string[]): I | null =>
		from ? ({ ...from, href: base(from.href), label, icon, also } as I) : null;

	const home = find('/');
	const requests = find('/requests');
	const downloads = find('/downloads');
	const explore = find('/explore');
	const library = find('/library?kind=movie', '/library?kind=show', '/library?kind=artist', '/library');
	const health = find('/health');
	const settings = find('/settings');

	// Tower opens Status for people who may see it, otherwise Settings. It carries the settings flag either way.
	const towerFrom = health ?? settings;
	const tower = towerFrom ? place({ ...towerFrom, dot: settings?.dot ?? towerFrom.dot } as I, 'Tower', 'tools', ['/settings', '/plugins', '/health']) : null;

	const five = [
		place(home, 'Today', 'calendarDay', []),
		// Board is the requests page; someone who cannot ask follows their downloads there instead.
		place(requests ?? downloads, 'Board', 'requests', requests ? ['/requests'] : ['/downloads']),
		place(explore, 'Explore', 'compass', ['/popular', '/search']),
		// Shelves opens the whole Library; the badge of a single kind does not apply.
		library ? ({ ...place(library, 'Shelves', 'library', ['/library', '/title'])!, badge: undefined, badgeLabel: undefined, ring: undefined, dot: undefined } as I) : null,
		tower
	].filter((x): x is I => x !== null);

	const taken = new Set(five.map((p) => p.href));
	// Everything else HolyArrs offers stays reachable, in its own groups, under More.
	const more = sections
		.map((s) => ({ ...s, items: s.items.filter((i) => !taken.has(i.href)) }))
		.filter((s) => s.items.length > 0);
	const search = { href: '/search', label: 'Search', icon: 'search', need: null } as I;
	const top = more.find((s) => s.id === 'top');
	if (top && !items.some((i) => i.href === '/search')) top.items.push(search);

	const out: S[] = [{ id: 'top', label: null, items: five } as unknown as S];
	for (const s of more) out.push({ ...s, id: s.id === 'top' ? 'harbor-more' : s.id, label: s.id === 'top' ? HARBOR_MORE : s.label } as S);
	return out;
}

/** The parts of a phone tab Harbor reads. Matches Tab in routes/(frame)/TabBar.svelte. */
export interface HarborTab {
	label: string;
	icon: string;
	href?: string;
	current?: boolean;
	badge?: number;
	dot?: boolean;
	onclick?: () => void;
}

/**
 * harborTabs builds the phone tab bar from the first four places, then keeps
 * HolyArrs's last tab (More, or Manage for people who run the server), which
 * opens the sheet with every place including Tower.
 */
export function harborTabs<T extends HarborTab>(tabs: T[], sections: HarborSection[], to: (href: string) => string, path: string): T[] {
	const last = tabs[tabs.length - 1];
	const five = sections[0]?.items ?? [];
	const on = (i: HarborItem) => [i.href, ...(i.also ?? [])].some((h) => (h === '/' ? path === '/' : path === h || path.startsWith(h + '/')));
	const list = five
		.filter((i) => i.label !== 'Tower')
		.slice(0, 4)
		.map((i) => ({ href: to(i.href), label: i.label, icon: i.icon, current: on(i), badge: i.badge || undefined }) as T);
	if (!last || last.href) return list;
	return [...list, { ...last, current: !five.some(on) || five.some((i) => i.label === 'Tower' && on(i)) }];
}
