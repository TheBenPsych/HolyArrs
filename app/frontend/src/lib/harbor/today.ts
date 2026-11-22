// Harbor's Today page: one sentence that says how things are, the few things
// that need you, and a line of today's arrivals. No tiles of numbers.
// Pure functions; HarborToday.svelte loads the data and draws it.
// Design: harbor-5-from-scratch, screen 1.
import { etaWords, sameDay, type BoardCard } from './board.ts';
import type { CalendarEntry } from '#lib/core/types.ts';

export interface TodayFacts {
	/** Requests waiting for a yes (people who approve only) plus cards in trouble. */
	needYou: number;
	/** Cards still moving: looking, coming in, inspection. */
	onTheWay: number;
	/** Seconds until the next download lands, when a downloader knows. */
	nextEta: number | null;
	landedToday: number;
	trouble: number;
}

/** A piece of the sentence; a tone marks the number to colour. */
export interface Bit {
	text: string;
	tone?: 'need' | 'moving' | 'landed' | 'bad';
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * todaySentence says how things are in plain words:
 * "3 things need you. 5 are on the way, the next lands in 4 min. 12 landed today and nothing is in trouble."
 */
export function todaySentence(f: TodayFacts): Bit[] {
	const out: Bit[] = [];
	if (f.needYou) out.push({ text: `${f.needYou} ${plural(f.needYou, 'thing needs', 'things need')} you`, tone: 'need' }, { text: '. ' });
	else out.push({ text: 'Nothing needs you. ' });
	if (f.onTheWay) {
		out.push({ text: `${f.onTheWay} ${plural(f.onTheWay, 'is', 'are')} on the way`, tone: 'moving' });
		out.push({ text: f.nextEta != null ? `, the next lands in ${etaWords(f.nextEta)}. ` : '. ' });
	} else out.push({ text: 'Nothing is on the way. ' });
	if (f.landedToday) out.push({ text: `${f.landedToday} landed today`, tone: 'landed' });
	else out.push({ text: 'Nothing has landed yet today' });
	if (f.trouble) out.push({ text: ' and ' }, { text: `${f.trouble} ${plural(f.trouble, 'is', 'are')} in trouble`, tone: 'bad' }, { text: '.' });
	else out.push({ text: ' and nothing is in trouble.' });
	return out;
}

/** todayFacts counts the Board's cards the way the sentence needs. */
export function todayFacts(cards: BoardCard[], now: Date, approver: boolean): TodayFacts {
	const waiting = approver ? cards.filter((c) => c.lane === 'asked').length : 0;
	const trouble = cards.filter((c) => c.trouble).length;
	const moving = cards.filter((c) => c.lane === 'looking' || c.lane === 'coming' || c.lane === 'inspection');
	const etas = moving.map((c) => c.eta).filter((e): e is number => typeof e === 'number' && e > 0);
	const landedToday = cards.filter((c) => c.lane === 'landed' && c.at && sameDay(new Date(c.at), now)).length;
	return { needYou: waiting + trouble, onTheWay: moving.length, nextEta: etas.length ? Math.min(...etas) : null, landedToday, trouble };
}

/** The arrivals line runs from 6 AM to midnight. */
export const LINE_START = 6;
export const LINE_HOURS = 18;

export interface Arrival {
	key: string;
	name: string;
	/** Landed (filled dot) or expected (hollow dot). */
	landed: boolean;
	at: Date;
	/** 0 to 100 along the line. */
	x: number;
	href?: string;
}

/** lineX places a time on the arrivals line (0 at 6 AM, 100 at midnight); earlier times sit at the start. */
export function lineX(at: Date, today: Date): number {
	const start = new Date(today);
	start.setHours(LINE_START, 0, 0, 0);
	const h = (at.getTime() - start.getTime()) / 3_600_000;
	return Math.max(0, Math.min(100, (h / LINE_HOURS) * 100));
}

/** episodeName is "The Bear S4E4" for an episode, else the title's name. */
export function entryName(e: Pick<CalendarEntry, 'name' | 'kind' | 'season' | 'episode'>): string {
	return e.kind === 'episode' && e.season != null && e.episode != null ? `${e.name} S${e.season}E${e.episode}` : e.name;
}

/**
 * arrivals builds today's line: what landed today (filled), downloads that
 * will land later today (hollow, at their expected time) and tonight's new
 * episodes with an air time (hollow). Sorted by time.
 */
export function arrivals(cards: BoardCard[], calendar: CalendarEntry[], now: Date): Arrival[] {
	const out: Arrival[] = [];
	const midnight = new Date(now);
	midnight.setHours(24, 0, 0, 0);
	for (const c of cards) {
		if (c.lane === 'landed' && c.at) {
			const at = new Date(c.at);
			if (sameDay(at, now)) out.push({ key: c.key, name: c.name, landed: true, at, x: lineX(at, now), href: c.href });
		} else if (c.lane === 'coming' && c.eta) {
			const at = new Date(now.getTime() + c.eta * 1000);
			if (at < midnight) out.push({ key: c.key, name: c.name, landed: false, at, x: lineX(at, now), href: c.href });
		}
	}
	for (const e of calendar) {
		if (!e.timed || e.kind !== 'episode' || e.state === 'in_library') continue;
		const at = new Date(e.date);
		if (!sameDay(at, now) || at <= now) continue;
		out.push({ key: `cal-${e.title_id}-${e.season}-${e.episode}`, name: entryName(e), landed: false, at, x: lineX(at, now), href: `/library/${e.title_id}` });
	}
	return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** clock says a time as "4:10 PM". */
export function clock(d: Date): string {
	return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** spaceWords says free space as "8.2 TB". */
export function spaceWords(bytes: number): string {
	const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
	let v = bytes;
	let i = 0;
	while (v >= 1000 && i < units.length - 1) {
		v /= 1000;
		i++;
	}
	return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/** dayLine is the quiet line under the sentence: "Friday 20 November · Tower has 8.2 TB free · every connection is working". */
export function dayLine(now: Date, freeBytes: number | null, broken: string[] | null): string {
	const parts = [now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })];
	if (freeBytes != null && freeBytes > 0) parts.push(`Tower has ${spaceWords(freeBytes)} free`);
	if (broken) parts.push(broken.length === 0 ? 'every connection is working' : broken.length === 1 ? `${broken[0]} is not answering` : `${broken.length} connections are not answering`);
	return parts.join(' · ');
}

/** ago says how long ago in a few words: "just now", "12 minutes ago", "3 hours ago", "2 days ago". */
export function ago(iso: string | undefined, now: Date): string {
	const t = Date.parse(iso ?? '');
	if (!t) return '';
	const s = Math.max(0, (now.getTime() - t) / 1000);
	if (s < 90) return 'just now';
	if (s < 3600) return `${Math.round(s / 60)} minutes ago`;
	if (s < 5400) return 'an hour ago';
	if (s < 86400) return `${Math.round(s / 3600)} hours ago`;
	const d = Math.round(s / 86400);
	return d === 1 ? 'yesterday' : `${d} days ago`;
}

// ---- The bold Today (design harbor-10, screen 1; build list part 2) ----

/** greetWord is "Good morning", "Good afternoon" or "Good evening". */
export function greetWord(now: Date): string {
	const h = now.getHours();
	return h >= 4 && h < 12 ? 'Good morning' : h >= 12 && h < 17 ? 'Good afternoon' : 'Good evening';
}

/** whenWords says a time ahead as "Tonight 9 PM", "Today 3 PM" or "Tomorrow 10 AM". */
export function whenWords(at: Date, now: Date): string {
	const time = at.toLocaleTimeString([], { hour: 'numeric', minute: at.getMinutes() ? '2-digit' : undefined });
	if (sameDay(at, now)) return `${at.getHours() >= 17 ? 'Tonight' : 'Today'} ${time}`;
	const tomorrow = new Date(now);
	tomorrow.setDate(tomorrow.getDate() + 1);
	if (sameDay(at, tomorrow)) return `Tomorrow ${time}`;
	return `${at.toLocaleDateString([], { weekday: 'long' })} ${time}`;
}

export interface Upcoming {
	key: string;
	/** The show's name. */
	name: string;
	/** "S4 E4". */
	ep: string;
	at: Date;
	/** "Tonight 9 PM". */
	when: string;
	poster?: string;
	href: string;
}

/**
 * nextDay lists the new episodes that air in the next 24 hours and that
 * Harbor will grab by itself (shows kept up to date, not already on the
 * shelves), soonest first. Only episodes with a real air time count.
 */
export function nextDay(calendar: CalendarEntry[], now: Date): Upcoming[] {
	const end = now.getTime() + 86_400_000;
	const out: Upcoming[] = [];
	const seen = new Set<string>();
	for (const e of calendar) {
		if (e.kind !== 'episode' || !e.timed || e.state === 'in_library' || e.keep_up_to_date === false) continue;
		const at = new Date(e.date);
		if (!(at.getTime() > now.getTime() && at.getTime() <= end)) continue;
		const key = `${e.title_id}-${e.season}-${e.episode}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({ key, name: e.name, ep: e.season != null && e.episode != null ? `S${e.season} E${e.episode}` : '', at, when: whenWords(at, now), poster: e.poster, href: `/library/${e.title_id}` });
	}
	return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** wayLine is the caption under a poster in On the way: "63% · 4 min", "Looking for a copy", "Stuck · retrying". */
export function wayLine(c: BoardCard): string {
	if (c.trouble) return c.lane === 'looking' ? 'Stuck · looking again' : 'Needs a look';
	if (c.lane === 'looking') return 'Looking for a copy';
	if (c.lane === 'inspection') return 'Checking and filing it';
	const eta = c.eta && c.eta > 0 ? etaWords(c.eta) : '';
	return [c.line, eta].filter(Boolean).join(' · ') || 'Coming in';
}

/** ringPercent is how full a poster's ring is (0 to 100), or null when there is no number to show. */
export function ringPercent(c: BoardCard): number | null {
	if (c.lane === 'inspection') return 100;
	if (c.lane !== 'coming' || c.progress == null) return null;
	return Math.max(0, Math.min(100, Math.round(c.progress * 100)));
}
