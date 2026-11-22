// Harbor's one search (build list part 3, Ben's Yes "one search for
// everything"): the glass panel that opens from the search pill in the top
// menu or from Ctrl K anywhere. Search and Settings keep HolyArrs's own
// field, because their pages are built around it.

export const harborSearch = $state({ open: false, term: '' });

/** Pages that keep their own search field. */
export const ownField = (path: string): boolean => path === '/search' || path.startsWith('/search/') || path === '/settings' || path.startsWith('/settings/');

export function openSearch(term = '') {
	if (!harborSearch.open) harborSearch.term = term;
	harborSearch.open = true;
}

export function closeSearch() {
	harborSearch.open = false;
}

/** Ctrl K and / open the panel, except on pages with their own field. True when it did. */
export function harborSearchKey(path: string): boolean {
	if (ownField(path)) return false;
	openSearch();
	return true;
}
