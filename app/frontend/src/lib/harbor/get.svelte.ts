// Harbor's + Get (build list: "Every + Get follows Ben's quality rules,
// 1080p at most, and never asks"). One tap: it asks for the whole title
// with no sheet, and a person who may approve says yes to their own ask
// straight away, with the household's default folder and quality rules
// (library_folder_id and pick_rules_id 0), so there is never a picker.
import { SvelteMap } from 'svelte/reactivity';
import { api, message, ApiError } from '#lib/core/api.ts';
import { session } from '#lib/core/session.svelte.ts';
import { toasts } from '#lib/core/toasts.svelte.ts';
import { refreshInbox } from '#lib/core/inbox.svelte.ts';
import type { Ask, AskState } from '#lib/core/types.ts';
import { cardTmdb, liveCard, type ExploreCard } from '#lib/ui/title-cards.ts';

/** What each + Get on this visit did, by TMDB kind and id ("movie:438631"). */
export const gotten = new SvelteMap<string, { ask?: AskState; titleId?: number }>();
const busy = new SvelteMap<string, boolean>();

export const getKey = (kind: string, tmdb: string) => `${kind}:${tmdb}`;
export const getting = (kind: string, tmdb: string) => busy.get(getKey(kind, tmdb)) ?? false;

/** Whether this person may press + Get at all. */
export const mayGet = () => session.can('ask') || session.can('manage_library') || session.can('approve');

export async function harborGet(kind: 'movie' | 'show', tmdb: string, name: string): Promise<void> {
	const key = getKey(kind, tmdb);
	if (!tmdb || busy.get(key)) return;
	busy.set(key, true);
	try {
		const r = await api.post<{ ask: Ask; joined: boolean }>('/asks', kind === 'movie' ? { id: `tmdb:${tmdb}`, follow: true } : { kind: 'show', id: `tmdb:${tmdb}`, seasons: [], follow: true });
		let state = r.ask.state;
		if (state === 'asked' && session.can('approve')) {
			try {
				await api.post(`/asks/${r.ask.id}/approve`, { note: '', library_folder_id: 0, pick_rules_id: 0 });
				state = 'approved';
			} catch {
				// It stays asked; the Board shows it.
			}
		}
		gotten.set(key, { ask: state });
		if (state === 'approved') toasts.push(`Getting ${name}`, 'ok', { body: 'It follows your quality rules (1080p at most). Watch it on the Board.' });
		else if (r.joined) toasts.push(`${name} was already asked for`, 'ok', { body: 'Harbor is on it.' });
		else toasts.push(`Asked for ${name}`, 'ok', { body: 'It waits for a yes on the Board.' });
		void refreshInbox();
	} catch (err) {
		if (err instanceof ApiError && err.status === 409 && typeof err.body.title_id === 'number') {
			gotten.set(key, { titleId: err.body.title_id });
			toasts.push(`${name} is already on your shelves`, 'info');
			return;
		}
		toasts.push(`Could not get ${name}`, 'fail', { body: message(err) });
	} finally {
		busy.delete(key);
	}
}

/** The card as it stands after a + Get on this visit. */
export function gotCard(c: ExploreCard): ExploreCard {
	const tmdb = cardTmdb(c);
	return tmdb ? liveCard(c, gotten.get(getKey(c.kind, tmdb))) : c;
}
