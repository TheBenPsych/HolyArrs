// Loads what the Board and Today show: requests, downloads and running
// searches, read from HolyArrs's own lists, and keeps them fresh on the same
// live events the sidebar uses. One copy per page.
import { onDestroy } from 'svelte';
import { api } from '#lib/core/api.ts';
import { live } from '#lib/core/live.svelte.ts';
import { session } from '#lib/core/session.svelte.ts';
import { toasts } from '#lib/core/toasts.svelte.ts';
import { refreshInbox } from '#lib/core/inbox.svelte.ts';
import { liveByTitle, type TitleLive } from '#lib/requests/index.ts';
import type { Ask, DownloadRow, SearchView } from '#lib/core/types.ts';
import { boardCards, type BoardCard } from './board.ts';

/** Everything the Downloads page lists, so new episodes and better copies show as "By itself". */
const ALL_DOWNLOADS = '/downloads/view?limit=100&outside_limit=2000';
/** Only downloads for requests (what a member may see). */
const ASKED_DOWNLOADS = '/downloads/view?asked=1';

export function createBoardData() {
	let asks = $state<Ask[]>([]);
	let downloads = $state<DownloadRow[]>([]);
	let titleLive = $state(new Map<number, TitleLive>());
	let loaded = $state(false);
	let failed = $state('');
	let now = $state(new Date());
	/** Requests answered here a moment ago, hidden until the next read lands. */
	let answered = $state(new Set<number>());

	const approver = $derived(session.can('approve'));
	const manager = $derived(session.can('manage_library'));
	const canAsk = $derived(session.can('ask') || approver);

	let busy = false;
	let again = false;
	async function load() {
		if (busy) return void (again = true);
		busy = true;
		try {
			const [a, d, s] = await Promise.all([
				canAsk ? api.get<{ asks: Ask[] }>('/asks') : Promise.resolve({ asks: [] as Ask[] }),
				api.get<{ downloads: DownloadRow[] }>(manager ? ALL_DOWNLOADS : ASKED_DOWNLOADS).catch(() => ({ downloads: [] as DownloadRow[] })),
				manager ? api.get<{ running: SearchView[] }>('/searches').catch(() => ({ running: [] as SearchView[] })) : Promise.resolve({ running: [] as SearchView[] })
			]);
			asks = a.asks ?? [];
			downloads = d.downloads ?? [];
			titleLive = liveByTitle(downloads, s.running ?? []);
			answered = new Set();
			failed = '';
		} catch (e) {
			failed = e instanceof Error ? e.message : String(e);
		} finally {
			now = new Date();
			loaded = true;
			busy = false;
			if (again) {
				again = false;
				void load();
			}
		}
	}

	// Live news moves cards; a quiet read every 30 seconds keeps the times right.
	let soon: ReturnType<typeof setTimeout> | undefined;
	const later = () => {
		if (soon) return;
		soon = setTimeout(() => {
			soon = undefined;
			void load();
		}, 1200);
	};
	const offs = ['ask', 'ask_removed', 'download', 'import', 'title', 'search'].map((topic) => live.on(topic, later));
	const tick = setInterval(() => void load(), 30_000);
	onDestroy(() => {
		offs.forEach((off) => off());
		clearInterval(tick);
		clearTimeout(soon);
	});

	const cards = $derived<BoardCard[]>(
		boardCards({ asks: asks.filter((a) => !answered.has(a.id)), live: titleLive, downloads: manager ? downloads : [], rows: downloads, now })
	);

	/** Says yes or no to a waiting request. A no carries the reason the person will see. */
	async function answer(id: number, yes: boolean, note = '') {
		const a = asks.find((x) => x.id === id);
		answered = new Set([...answered, id]);
		try {
			await api.post(`/asks/${id}/${yes ? 'approve' : 'turn-down'}`, yes ? { note, library_folder_id: 0, pick_rules_id: 0 } : { note });
			toasts.push(yes ? `Approved ${a?.name ?? 'the request'}` : `Said no to ${a?.name ?? 'the request'}`, 'ok');
			void refreshInbox();
		} catch (e) {
			answered = new Set([...answered].filter((x) => x !== id));
			toasts.push(`Could not answer ${a?.name ?? 'the request'}`, 'fail', { body: e instanceof Error ? e.message : String(e) });
		}
		void load();
	}

	/**
	 * answerSoon is the phone swipe: the card goes at once, and the answer is
	 * sent after a few seconds unless Undo is pressed.
	 */
	const UNDO_MS = 5000;
	function answerSoon(id: number, yes: boolean) {
		const a = asks.find((x) => x.id === id);
		answered = new Set([...answered, id]);
		const send = setTimeout(() => void answer(id, yes), UNDO_MS);
		toasts.push(yes ? `Approving ${a?.name ?? 'the request'}` : `Saying no to ${a?.name ?? 'the request'}`, 'info', {
			ms: UNDO_MS,
			action: {
				label: 'Undo',
				run: () => {
					clearTimeout(send);
					answered = new Set([...answered].filter((x) => x !== id));
				}
			}
		});
	}

	/** Do this first: puts a download at the front of its Downloader's line. */
	let firsts = $state(new Set<string>());
	async function first(c: BoardCard) {
		if (c.downloadId == null) return;
		firsts = new Set([...firsts, c.key]);
		try {
			await api.post(`/downloads/${c.downloadId}/top`, {});
			toasts.push(`${c.name} is first in line now`, 'ok');
		} catch (e) {
			firsts = new Set([...firsts].filter((k) => k !== c.key));
			toasts.push(`Could not move ${c.name} to the front`, 'fail', { body: e instanceof Error ? e.message : String(e) });
		}
	}

	return {
		load,
		answer,
		answerSoon,
		first,
		get firsts() { return firsts; },
		get cards() { return cards; },
		get asks() { return asks; },
		get loaded() { return loaded; },
		get failed() { return failed; },
		get now() { return now; },
		get approver() { return approver; },
		get manager() { return manager; }
	};
}
