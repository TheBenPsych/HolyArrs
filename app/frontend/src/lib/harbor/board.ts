// Harbor's Board: every request as a card moving through five lanes, from
// "asked" to "on Glowfin". The HolyArrs Requests and Downloads pages stay as
// the detail underneath; this file only sorts what they already know into
// lanes. Pure functions, so the Today page and the Board read the same truth.
// Design: harbor-5-from-scratch (screen 2) and harbor-6-board-round2 (screen 1).
import type { Ask, DownloadRow } from '#lib/core/types.ts';
import type { TitleLive } from '#lib/requests/index.ts';

export type Lane = 'asked' | 'looking' | 'coming' | 'inspection' | 'landed';

export const LANES: { id: Lane; name: string; hint: string }[] = [
	{ id: 'asked', name: 'Asked', hint: 'Waiting for your yes' },
	{ id: 'looking', name: 'Looking', hint: 'Searching the sites' },
	{ id: 'coming', name: 'Coming in', hint: 'Downloading' },
	{ id: 'inspection', name: 'Inspection', hint: 'Checking and filing it' },
	{ id: 'landed', name: 'Landed', hint: 'On Glowfin now' }
];

export type CardKind = 'movie' | 'show' | 'music';

export interface BoardCard {
	key: string;
	lane: Lane;
	name: string;
	kind: CardKind;
	/** Who asked, or '' for things that came by themselves. */
	who: string;
	/** The small line under the name: seasons, progress, why it is stuck. */
	line: string;
	/** 0 to 1 while downloading. */
	progress?: number;
	/** Seconds left, when the downloader knows. */
	eta?: number;
	/** Set when the card needs a look, with the reason in plain words. */
	trouble?: string;
	/** New episodes and better copies nobody asked for. */
	byItself: boolean;
	/** Where tapping the card goes (its story). */
	href: string;
	poster?: string;
	askId?: number;
	/** When it was asked, or when it landed. */
	at?: string;
	/** The download behind a Coming in card, for "Do this first". */
	downloadId?: number;
	/** Bytes a second, while downloading. */
	speed?: number;
	/** The whole copy's size in bytes, when known. */
	size?: number;
	/** The Downloader already has it first in its line. */
	first?: boolean;
	/** Harbor may change this download in its Downloader (not watch-only, not someone else's). */
	canAct?: boolean;
}

const KIND: Record<string, CardKind> = { movie: 'movie', show: 'show', artist: 'music' };
export const kindOf = (k: string | undefined): CardKind => KIND[k ?? ''] ?? 'movie';
export const KIND_WORD: Record<CardKind, string> = { movie: 'movie', show: 'show', music: 'music' };

const DOWNLOADING = new Set(['waiting', 'downloading', 'stalled', 'paused']);
const INSPECTING = new Set(['importing', 'waiting_to_import']);
const STUCK = new Set(['needs_a_decision', 'import_refused']);
const FAILED = new Set(['failed', 'vanished']);

const DAY = 86_400_000;
/** How long a landed card stays on the Board. */
export const LANDED_DAYS = 3;

/** sameDay says two times fall on the same day on the person's own clock. */
export function sameDay(a: Date, b: Date): boolean {
	return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** etaWords says a time left the way a person would: "4 min", "2 hr", "3 days". */
export function etaWords(sec: number): string {
	if (sec < 60) return 'under a minute';
	if (sec < 3600) return `${Math.round(sec / 60)} min`;
	if (sec < DAY / 1000) return `${Math.round(sec / 3600)} hr`;
	const d = Math.round(sec / 86400);
	return d === 1 ? '1 day' : `${d} days`;
}

function pct(p: number): string {
	return `${Math.round(Math.max(0, Math.min(1, p)) * 100)}%`;
}

function askLine(a: Ask): string {
	return a.season_words || a.album_words || '';
}

/** askLane places one request: its state first, then what the pipeline is doing for it. */
export function askLane(a: Ask, live: TitleLive | undefined): { lane: Lane; line: string; progress?: number; trouble?: string } | null {
	if (a.state === 'turned_down') return null;
	if (a.state === 'asked') return { lane: 'asked', line: askLine(a) };
	if (a.state === 'available') return { lane: 'landed', line: askLine(a) };
	// Approved from here on.
	if (!a.title_id && !a.adding) return { lane: 'looking', line: 'Could not be added', trouble: a.problem || 'It could not be added to the Library' };
	const d = live?.download;
	if (d?.phase === 'downloading') return { lane: 'coming', line: pct(d.progress), progress: d.progress };
	if (d?.phase === 'importing') return { lane: 'inspection', line: 'Checking and filing it' };
	if (d?.phase === 'stuck') return { lane: 'inspection', line: 'Downloaded, waiting on a choice', trouble: 'Downloaded, but it needs your choice before it can land' };
	if (d?.phase === 'failed') return { lane: 'looking', line: 'That copy failed', trouble: d.reason || 'The download failed. Harbor will look for another copy' };
	const step = a.step?.kind;
	if (step === 'downloading') return { lane: 'coming', line: a.step?.text || 'Downloading' };
	if (step === 'importing') return { lane: 'inspection', line: a.step?.text || 'Checking and filing it' };
	if (a.problem) return { lane: 'looking', line: a.problem, trouble: a.problem };
	if (step === 'not_out') return { lane: 'looking', line: a.step?.text || 'Not out yet' };
	if (live?.searching) return { lane: 'looking', line: 'Searching the sites now' };
	return { lane: 'looking', line: a.step?.text || 'Searching the sites' };
}

function askHref(a: Ask): string {
	return `/requests?ask=${a.id}`;
}

export interface BoardInput {
	asks: Ask[];
	live: Map<number, TitleLive>;
	/** Downloads (the Downloads page's rows). Ones that belong to a request are skipped; the rest are "By itself". */
	downloads: DownloadRow[];
	/** Every download read (also for people who don't see "By itself" cards), so a request's card knows its speed and time left. */
	rows?: DownloadRow[];
	now: Date;
}

/**
 * boardCards turns requests and downloads into Board cards. A request is one
 * card however many seasons it covers (it carries the season words). Downloads
 * that belong to no request are "By itself": new episodes and better copies.
 */
export function boardCards({ asks, live, downloads, rows, now }: BoardInput): BoardCard[] {
	const out: BoardCard[] = [];
	const byId = new Map((rows ?? downloads).map((d) => [d.id, d]));
	const askTitles = new Set<number>();
	for (const a of asks) {
		if (a.title_id && a.state !== 'turned_down') askTitles.add(a.title_id);
		const placed = askLane(a, a.title_id ? live.get(a.title_id) : undefined);
		if (!placed) continue;
		const at = placed.lane === 'landed' ? a.available_at : a.asked_at;
		if (placed.lane === 'landed' && (!at || now.getTime() - Date.parse(at) > LANDED_DAYS * DAY)) continue;
		const dlId = placed.lane === 'coming' && a.title_id ? live.get(a.title_id)?.download?.id : undefined;
		const row = dlId != null ? byId.get(dlId) : undefined;
		out.push({
			key: `ask-${a.id}`,
			lane: placed.lane,
			name: a.name,
			kind: kindOf(a.kind),
			who: a.asked_by?.name ?? '',
			line: placed.line,
			progress: placed.progress,
			trouble: placed.trouble,
			byItself: false,
			href: askHref(a),
			poster: a.poster,
			askId: a.id,
			at,
			...(row ? moving(row) : {})
		});
	}
	for (const d of downloads) {
		if (d.replaced || (d.client_item && d.outside && !d.title_id)) continue;
		if (d.title_id && askTitles.has(d.title_id)) continue;
		let lane: Lane | null = null;
		let trouble: string | undefined;
		let line = d.label || '';
		if (DOWNLOADING.has(d.phase)) {
			lane = d.progress >= 1 ? 'inspection' : 'coming';
			line = lane === 'coming' ? (d.phase === 'stalled' ? `Stuck at ${pct(d.progress)}` : d.phase === 'paused' ? `Paused at ${pct(d.progress)}` : pct(d.progress)) : 'Checking and filing it';
		} else if (INSPECTING.has(d.phase)) {
			lane = 'inspection';
			line = 'Checking and filing it';
		} else if (STUCK.has(d.phase)) {
			lane = 'inspection';
			line = 'Waiting on a choice';
			trouble = d.refused_why || 'Downloaded, but it needs your choice before it can land';
		} else if (FAILED.has(d.phase)) {
			lane = 'looking';
			line = 'That copy failed';
			trouble = d.text?.trim() || 'The download failed';
		} else if (d.phase === 'done' && d.finished_at && now.getTime() - Date.parse(d.finished_at) <= LANDED_DAYS * DAY) {
			lane = 'landed';
		}
		if (!lane) continue;
		out.push({
			key: `dl-${d.id}`,
			lane,
			name: d.title || d.name,
			kind: kindOf(d.kind),
			who: d.requested_by ?? '',
			line,
			progress: lane === 'coming' ? d.progress : undefined,
			eta: lane === 'coming' && d.eta && d.eta > 0 ? d.eta : undefined,
			trouble,
			byItself: !d.requested_by,
			href: '/downloads',
			poster: d.covers || d.artwork,
			at: lane === 'landed' ? d.finished_at : d.started_at,
			...(lane === 'coming' ? moving(d) : {})
		});
	}
	// Each lane: trouble first, then the oldest asks (Asked), the furthest along (Coming in) or the newest (Landed).
	const rank = (c: BoardCard) => (c.trouble ? 0 : 1);
	return out.sort((x, y) => {
		if (x.lane !== y.lane) return LANES.findIndex((l) => l.id === x.lane) - LANES.findIndex((l) => l.id === y.lane);
		if (rank(x) !== rank(y)) return rank(x) - rank(y);
		if (x.lane === 'coming') return (y.progress ?? 0) - (x.progress ?? 0);
		const tx = Date.parse(x.at ?? '') || 0;
		const ty = Date.parse(y.at ?? '') || 0;
		return x.lane === 'landed' ? ty - tx : tx - ty;
	});
}

/** moving is what a Coming in card knows from its download: which one, how fast, how big, and its place in line. */
function moving(d: DownloadRow): Pick<BoardCard, 'downloadId' | 'speed' | 'size' | 'eta' | 'first' | 'canAct'> {
	return {
		downloadId: d.id,
		speed: d.speed > 0 ? d.speed : undefined,
		size: d.size > 0 ? d.size : undefined,
		eta: d.eta && d.eta > 0 ? d.eta : undefined,
		first: d.queue_pos === 1 || undefined,
		canAct: d.can_act && !d.client_locked
	};
}

export interface DoneBy {
	/** Cards still coming in. */
	count: number;
	/** When the last one should be done, rounded up to five minutes; null when nobody can tell (nothing is moving). */
	at: Date | null;
	/** Bytes a second across every download. */
	speed: number;
	/** 0 to 1 across them all, by size when the sizes are known. */
	progress: number;
}

const FIVE_MIN = 300_000;

/**
 * doneBy says when everything coming in should be finished (build list part 4,
 * "All done by 9:40 PM"). Downloads share one line, so the honest time is the
 * bytes still to come over the speed of them all together; when that is not
 * known, the slowest download's own time left.
 */
export function doneBy(cards: BoardCard[], now: Date): DoneBy | null {
	const coming = cards.filter((c) => c.lane === 'coming');
	if (!coming.length) return null;
	const speed = coming.reduce((n, c) => n + (c.speed ?? 0), 0);
	const sized = coming.filter((c) => c.size != null && c.progress != null);
	const total = sized.reduce((n, c) => n + c.size!, 0);
	const left = sized.reduce((n, c) => n + c.size! * (1 - Math.max(0, Math.min(1, c.progress!))), 0);
	let sec = 0;
	if (speed > 0 && sized.length === coming.length) sec = left / speed;
	for (const c of coming) if (c.eta) sec = Math.max(sec, c.eta);
	const progress = total > 0 ? 1 - left / total : coming.reduce((n, c) => n + (c.progress ?? 0), 0) / coming.length;
	const at = sec > 0 ? new Date(Math.ceil((now.getTime() + sec * 1000) / FIVE_MIN) * FIVE_MIN) : null;
	return { count: coming.length, at, speed, progress: Math.max(0, Math.min(1, progress)) };
}

/** doneByTime says the finish time the way a person would: "9:40 PM", "tomorrow 7:15 AM", "Tuesday 3:00 PM". */
export function doneByTime(at: Date, now: Date): string {
	const time = at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
	if (sameDay(at, now)) return time;
	if (sameDay(at, new Date(now.getTime() + DAY))) return `tomorrow ${time}`;
	if (at.getTime() - now.getTime() < 6 * DAY) return `${at.toLocaleDateString([], { weekday: 'long' })} ${time}`;
	return `${at.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
}

/** doneByLead is the words before the time: "All 7 done by about", or "Done by about" for one. */
export function doneByLead(count: number): string {
	return count === 1 ? 'Done by about' : `All ${count} done by about`;
}

/** speedWords says a download speed: "38 MB/s", "640 KB/s". */
export function speedWords(bps: number): string {
	if (bps >= 1024 ** 2) {
		const mb = bps / 1024 ** 2;
		return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB/s`;
	}
	return `${Math.max(1, Math.round(bps / 1024))} KB/s`;
}

/** putFirst moves the cards asked to go first (or already first in the Downloader's line) to the front, keeping the rest in order. */
export function putFirst(list: BoardCard[], firsts: Set<string>): BoardCard[] {
	const up = (c: BoardCard) => firsts.has(c.key) || !!c.first;
	return [...list.filter(up), ...list.filter((c) => !up(c))];
}

/** swipeAnswer reads a phone swipe on a waiting request: far enough right is a yes, far enough left a no. */
export function swipeAnswer(dx: number, width: number): 'yes' | 'no' | null {
	const far = Math.max(80, width * 0.35);
	if (dx >= far) return 'yes';
	if (dx <= -far) return 'no';
	return null;
}

export type BoardFilter = 'all' | 'people' | 'itself' | CardKind;

/** filterCards keeps the cards a filter chip asks for; 'trouble' keeps only cards that need a look. */
export function filterCards(cards: BoardCard[], f: BoardFilter, troubleOnly = false): BoardCard[] {
	return cards.filter((c) => {
		if (troubleOnly && !c.trouble) return false;
		if (f === 'all') return true;
		if (f === 'people') return !c.byItself;
		if (f === 'itself') return c.byItself;
		return c.kind === f;
	});
}

/** byLane groups cards per lane, keeping the lane order. */
export function byLane(cards: BoardCard[]): Record<Lane, BoardCard[]> {
	const out = { asked: [], looking: [], coming: [], inspection: [], landed: [] } as Record<Lane, BoardCard[]>;
	for (const c of cards) out[c.lane].push(c);
	return out;
}
