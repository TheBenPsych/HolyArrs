// The HolyArrs title page keeps its tools on its Library tab. Harbor's
// buttons ("Find a better copy", "Rules", "See every episode") open that
// tab, then scroll to (or press) the part they name.
import { tick } from 'svelte';

export interface MoreTarget {
	/** A CSS selector for the part on the Library tab. */
	find: string;
	/** Press it once found (a button), instead of only scrolling to it. */
	press?: boolean;
}

export const MORE = {
	pickCopy: { find: '[data-testid="lib-pane"] .lib-status .lib-btn:not(.primary)', press: true },
	seasons: { find: '[data-testid="lib-pane"] .lib-h' },
	files: { find: '[data-testid="version-card"]' },
	rule: { find: '[data-testid="quality-row"]' },
	rename: { find: '[data-testid="rename-row"]', press: true }
} satisfies Record<string, MoreTarget>;

export async function openMore(target: MoreTarget): Promise<void> {
	const tabs = [...document.querySelectorAll<HTMLElement>('[data-testid="own-tabs"] [role="tab"]')];
	const lib = tabs[tabs.length - 1];
	if (lib && lib.getAttribute('aria-selected') !== 'true') lib.click();
	await tick();
	for (let i = 0; i < 20; i++) {
		const el = document.querySelector<HTMLElement>(target.find);
		if (el) {
			el.scrollIntoView({ block: 'center', behavior: 'smooth' });
			if (target.press) el.click();
			else el.focus?.({ preventScroll: true });
			return;
		}
		await new Promise((r) => setTimeout(r, 100));
	}
	document.querySelector('[data-testid="own-pane"]')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}
