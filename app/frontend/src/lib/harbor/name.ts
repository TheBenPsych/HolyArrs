// Harbor's name in the browser tab. HolyArrs pages set titles like
// "Library · HolyArrs"; this swaps the app name for Harbor as each title is
// set, so no HolyArrs page needs its own change. The page part before " · "
// is left alone (the top bar reads it).

export const HARBOR_NAME = 'Harbor';

/** harborTitle turns a HolyArrs page title into Harbor's. */
export function harborTitle(title: string): string {
	return title.replace(/\bHolyArrs\b/g, HARBOR_NAME);
}

let watching = false;

/** watchTitles keeps document.title on Harbor's name. Safe to call more than once. */
export function watchTitles(): void {
	if (watching || typeof document === 'undefined') return;
	watching = true;
	const fix = () => {
		const next = harborTitle(document.title);
		if (next !== document.title) document.title = next;
	};
	fix();
	new MutationObserver(fix).observe(document.head, { subtree: true, childList: true, characterData: true });
}
