// Harbor's five-place menu: Today, Explore, Board, Shelves and Tower.
// The top menu (HarborTopMenu) shows the five; places.ts turns every row kept
// under "More" here into a tab of one place, so the old groups are not shown.
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

export const HARBOR_PLACES = ['Today', 'Explore', 'Board', 'Shelves', 'Tower'] as const;
export const HARBOR_MORE = 'More';
export const HARBOR_BOARD = '/board';
export const HARBOR_TOWER = '/tower';

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
	const board = (from: I | undefined): I | null => (from ? ({ ...from, href: HARBOR_BOARD, label: 'Board', icon: 'requests', also: [] } as I) : null);

	const home = find('/');
	const requests = find('/requests');
	const downloads = find('/downloads');
	const explore = find('/explore');
	const library = find('/library?kind=movie', '/library?kind=show', '/library?kind=artist', '/library');
	const health = find('/health');
	const settings = find('/settings');

	// Tower shows for people who may see Status or Settings. It carries the settings flag either way.
	const towerFrom = health ?? settings;
	// It is Harbor's own page (lib/harbor/HarborTower); Status and Settings stay under More for the detail.
	const tower = towerFrom ? ({ ...towerFrom, dot: settings?.dot ?? towerFrom.dot, href: HARBOR_TOWER, label: 'Tower', icon: 'tools', also: ['/plugins'], badge: undefined, badgeLabel: undefined, ring: undefined } as I) : null;

	const five = [
		// Today is the home page; the Calendar belongs to it (its arrivals line links there).
		place(home, 'Today', 'calendarDay', ['/calendar']),
		// Explore comes second (design harbor-9): finding new things is the next thing people do.
		place(explore, 'Explore', 'compass', ['/popular', '/search']),
		// Board is Harbor's own page (lib/harbor/HarborBoard). It shows for anyone who may see requests or downloads,
		// and borrows that page's badge. The Requests and Downloads pages stay under More for the detail.
		board(requests ?? downloads),
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
