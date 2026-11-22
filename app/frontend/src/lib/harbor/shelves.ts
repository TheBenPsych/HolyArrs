// Harbor's Shelves and title pages: plain words and simple shapes drawn from
// what HolyArrs already knows about each title. Pure functions, so the shelf
// band, the Tidy tab and the title strip all tell the same story.
// Design: harbor-5-from-scratch (screen 4) and harbor-6-board-round2 (screens 4 and 5).
import type { SeasonSummary, TitleView } from '#lib/core/types.ts';

export type ShelfKind = 'movie' | 'show' | 'artist';

export const SHELF_WORD: Record<ShelfKind, string> = { movie: 'Movies', show: 'Shows', artist: 'Music' };

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/** isAnime says a show or movie looks like anime: Japanese and animated. */
export function isAnime(t: Pick<TitleView, 'original_language' | 'genres'>): boolean {
	return t.original_language === 'ja' && (t.genres ?? []).some((g) => /anim/i.test(g));
}

export interface ShelfCounts {
	movie: number;
	show: number;
	artist: number;
	/** Shows and movies that look like anime (already counted in their own shelf). */
	anime: number;
}

export function shelfCounts(ts: TitleView[]): ShelfCounts {
	const c: ShelfCounts = { movie: 0, show: 0, artist: 0, anime: 0 };
	for (const t of ts) {
		if (t.kind === 'movie' || t.kind === 'show' || t.kind === 'artist') c[t.kind]++;
		if ((t.kind === 'movie' || t.kind === 'show') && isAnime(t)) c.anime++;
	}
	return c;
}

/** hasGap says a title is followed but something that is out is not on Glowfin yet. */
export function hasGap(t: TitleView): boolean {
	if (t.kind === 'show') return !!t.show && t.keep_up_to_date && t.show.missing > 0;
	if (t.kind === 'artist') return !!t.artist && t.keep_up_to_date && t.artist.in_library < t.artist.tracks;
	return t.keep_up_to_date && t.slots.some((s) => s.state === 'wanted' || s.state === 'failed');
}

/** stillAiring says a show is still making new episodes. */
export function stillAiring(t: TitleView): boolean {
	const s = t.show?.status?.toLowerCase() ?? '';
	return t.kind === 'show' && (s.includes('continu') || s.includes('returning') || s.includes('production') || !!t.show?.next_air_date);
}

/** Season block colours: green complete, magenta gaps, amber on the way, grey not aired, faint not asked for. */
export type BlockState = 'complete' | 'gaps' | 'coming' | 'unaired' | 'skipped';

export interface SeasonBlock {
	number: number;
	state: BlockState;
	/** "Season 2: 2 episodes missing" */
	label: string;
}

export const BLOCK_WORD: Record<BlockState, string> = {
	complete: 'Complete',
	gaps: 'Has gaps',
	coming: 'On the way',
	unaired: 'Not aired yet',
	skipped: 'Not asked for'
};

export function seasonBlock(se: SeasonSummary): SeasonBlock {
	const name = `Season ${se.number}`;
	const missing = Math.max(0, se.aired - se.in_library);
	let state: BlockState;
	let words: string;
	if ((se.downloading ?? 0) > 0) {
		state = 'coming';
		words = `${plural(se.downloading ?? 0, 'episode')} coming in`;
	} else if (se.aired === 0) {
		state = 'unaired';
		words = 'not aired yet';
	} else if (missing === 0) {
		state = 'complete';
		words = se.not_out_yet > 0 ? `every aired episode, ${se.not_out_yet} still to air` : 'complete';
	} else if (!se.keep_up_to_date || se.dropped) {
		state = 'skipped';
		words = se.in_library ? `${se.in_library} of ${se.aired} episodes, not followed` : 'not asked for';
	} else {
		state = 'gaps';
		words = `${plural(missing, 'episode')} missing`;
	}
	return { number: se.number, state, label: `${name}: ${words}` };
}

/** Season blocks for a show, specials left out. */
export function seasonBlocks(t: Pick<TitleView, 'show'>): SeasonBlock[] {
	return (t.show?.seasons ?? []).filter((s) => s.number > 0).map(seasonBlock);
}

export type StripTone = 'landed' | 'moving' | 'need' | 'bad' | 'quiet';

export interface TitleStory {
	tone: StripTone;
	/** The one sentence at the top of a title page. */
	sentence: string;
	/** Small facts after it: quality, size, rule. */
	facts: string[];
}

const short = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');

export function gb(bytes?: number): string {
	if (!bytes || bytes <= 0) return '';
	if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`;
	if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
	return `${Math.max(1, Math.round(bytes / 1e6))} MB`;
}

function resolution(t: TitleView): string {
	for (const s of t.slots) {
		const q = s.file?.Quality as { resolution?: number } | undefined;
		if (q?.resolution) return q.resolution >= 2000 ? '4K' : `${q.resolution}p`;
	}
	return '';
}

/** titleStory is the plain status line at the top of a movie, show or music page. */
export function titleStory(t: TitleView): TitleStory {
	const facts: string[] = [];
	if (t.pick_rules_name) facts.push(`Rule: ${t.pick_rules_name}`);
	if (t.kind === 'show' && t.show) {
		const sh = t.show;
		const aired = sh.episodes - (sh.not_out_yet ?? 0);
		const missing = Math.max(0, sh.missing);
		const next = sh.next_air_date ? `Next episode ${short(sh.next_air_date)}.` : '';
		if (gb(t.size_bytes)) facts.unshift(gb(t.size_bytes));
		if ((sh.downloading ?? 0) > 0) return { tone: 'moving', sentence: `${plural(sh.downloading ?? 0, 'episode')} coming in now. ${sh.in_library} of ${aired} aired episodes are on Glowfin.`, facts };
		if ((sh.failed ?? 0) > 0) return { tone: 'bad', sentence: `${plural(sh.failed ?? 0, 'episode')} failed to download. Harbor will look for another copy.`, facts };
		if (aired <= 0) return { tone: 'quiet', sentence: `Nothing has aired yet. ${next}`.trim(), facts };
		if (missing === 0 && sh.in_library >= aired) return { tone: 'landed', sentence: `All ${plural(aired, 'aired episode')} are on Glowfin. ${next}`.trim(), facts };
		if (!t.keep_up_to_date) return { tone: 'quiet', sentence: `${sh.in_library} of ${aired} aired episodes are on Glowfin. Harbor is not following this show.`, facts };
		return { tone: 'need', sentence: `${sh.in_library} of ${aired} aired episodes are on Glowfin, ${plural(missing, 'episode')} missing. ${next}`.trim(), facts };
	}
	if (t.kind === 'artist' && t.artist) {
		const a = t.artist;
		if (a.in_library >= a.tracks && a.tracks > 0) return { tone: 'landed', sentence: `All ${plural(a.tracks, 'song')} from ${plural(a.included, 'album')} are on Glowfin.`, facts };
		if (a.in_library === 0) return { tone: t.keep_up_to_date ? 'need' : 'quiet', sentence: t.keep_up_to_date ? `No songs on Glowfin yet. Harbor is looking for ${plural(a.tracks, 'song')}.` : 'No songs on Glowfin, and Harbor is not following this artist.', facts };
		return { tone: t.keep_up_to_date ? 'need' : 'quiet', sentence: `${a.in_library} of ${plural(a.tracks, 'song')} are on Glowfin.`, facts };
	}
	const states = t.slots.map((s) => s.state);
	const dl = t.slots.find((s) => s.download?.active);
	const res = resolution(t);
	const size = gb(t.size_bytes || t.slots.reduce((n, s) => n + (s.file?.Size ?? 0), 0));
	if (size) facts.unshift(size);
	if (res) facts.unshift(res);
	if (dl?.download) return { tone: 'moving', sentence: `Coming in now, ${Math.floor(Math.min(1, Math.max(0, dl.download.progress)) * 100)}% done.`, facts };
	if (states.some((s) => s === 'importing' || s === 'waiting_to_import')) return { tone: 'moving', sentence: 'Downloaded. Harbor is checking it and filing it.', facts };
	if (states.includes('better_wanted')) return { tone: 'landed', sentence: 'On Glowfin. Harbor is watching for a better copy.', facts };
	if (states.includes('in_library')) return { tone: 'landed', sentence: 'On Glowfin.', facts };
	if (states.includes('failed')) return { tone: 'bad', sentence: 'The download failed. Harbor will look for another copy.', facts };
	if (states.includes('not_out_yet')) {
		const when = short(t.digital_date ?? t.physical_date);
		return { tone: 'quiet', sentence: when ? `Not out to buy or stream until ${when}. Harbor grabs it then.` : 'Not out yet. Harbor grabs it when it is.', facts };
	}
	if (!t.keep_up_to_date) return { tone: 'quiet', sentence: 'Not on Glowfin, and Harbor is not looking for it.', facts };
	return { tone: 'need', sentence: 'Not on Glowfin yet. Harbor is looking for a good copy.', facts };
}

/** One Tidy suggestion: a count, what it means, and where to go to sort it out. */
export interface TidyItem {
	key: string;
	count: number;
	unit: string;
	what: string;
	why: string;
	action: string;
	href: string;
}

export interface TidyInput {
	titles: TitleView[];
	/** Titles with missing subtitles, or null when unknown. */
	missingSubs: number | null;
	/** Files in the 7-day bin, or null when unknown. */
	binned: number | null;
}

/** bestHeight is the tallest picture among a title's files (0 when none is known). */
export function bestHeight(t: TitleView): number {
	let h = 0;
	for (const s of t.slots) {
		const q = s.file?.Quality as { resolution?: number } | undefined;
		if (q?.resolution && q.resolution > h) h = q.resolution;
	}
	return h;
}

/** lowQuality is the movies whose best file is DVD quality or worse (576 lines or
 *  fewer), best-loved first. Harbor can't see Glowfin's play counts, so "most
 *  loved" (score weighted by how many people voted) stands in for most watched. */
export function lowQuality(titles: TitleView[]): TitleView[] {
	const love = (t: TitleView) => (t.score ?? 0) * Math.log10(10 + (t.votes ?? 0));
	return titles
		.filter((t) => t.kind === 'movie' && bestHeight(t) > 0 && bestHeight(t) <= 576)
		.sort((a, b) => love(b) - love(a) || a.name.localeCompare(b.name));
}

export function noPoster(t: TitleView): boolean {
	return !t.artwork?.length;
}

/** tidyItems pulls clean-ups together from what the Library already knows. Only ever suggestions; each button opens the HolyArrs tool that does it. */
export function tidyItems(i: TidyInput): TidyItem[] {
	const out: TidyItem[] = [];
	const betterMovies = i.titles.filter((t) => t.kind === 'movie' && t.slots.some((s) => s.state === 'better_wanted')).length;
	const betterShows = i.titles.filter((t) => t.kind === 'show' && (t.show?.better_wanted ?? 0) > 0).length;
	const gapShows = i.titles.filter((t) => t.kind === 'show' && hasGap(t)).length;
	const gapMovies = i.titles.filter((t) => t.kind === 'movie' && hasGap(t)).length;
	const posters = i.titles.filter(noPoster).length;
	const lowq = lowQuality(i.titles).length;
	if (betterMovies) out.push({ key: 'better-movies', count: betterMovies, unit: betterMovies === 1 ? 'movie' : 'movies', what: 'Waiting for a better copy', why: 'Files below your quality rule, like an old 720p where a good 1080p is out. Harbor upgrades them as copies appear.', action: 'See them', href: '/library?kind=movie&show=better' });
	if (betterShows) out.push({ key: 'better-shows', count: betterShows, unit: betterShows === 1 ? 'show' : 'shows', what: 'Episodes waiting for a better copy', why: 'Some episodes are below the show’s quality rule.', action: 'See them', href: '/library?kind=show&show=better' });
	if (gapShows) out.push({ key: 'gap-shows', count: gapShows, unit: gapShows === 1 ? 'show' : 'shows', what: 'Episodes missing', why: 'Aired episodes of shows you follow that are not on Glowfin yet.', action: 'See them', href: '/library?kind=show&show=missing' });
	if (gapMovies) out.push({ key: 'gap-movies', count: gapMovies, unit: gapMovies === 1 ? 'movie' : 'movies', what: 'Asked for but not here yet', why: 'Movies on the shelf with no file yet.', action: 'See them', href: '/library?kind=movie&show=missing' });
	if (lowq) out.push({ key: 'low-quality', count: lowq, unit: lowq === 1 ? 'movie' : 'movies', what: 'Only in DVD quality or worse', why: 'Best-loved first. Harbor can look for a better copy, up to 1080p.', action: 'See the list', href: '#low-quality' });
	if (posters) out.push({ key: 'posters', count: posters, unit: posters === 1 ? 'title' : 'titles', what: 'Missing poster', why: 'Open one and pick its match again, or refresh its details.', action: 'Fix one at a time', href: '#posters' });
	if (i.missingSubs) out.push({ key: 'subs', count: i.missingSubs, unit: i.missingSubs === 1 ? 'file' : 'files', what: 'Missing subtitles', why: 'Files without the subtitle languages you asked for.', action: 'Find subtitles', href: '/library/missing-subtitles' });
	if (i.binned) out.push({ key: 'bin', count: i.binned, unit: i.binned === 1 ? 'file' : 'files', what: 'Waiting in the bin', why: 'Removed files are kept for a while so you can undo.', action: 'Look or undo', href: '/library/deleted' });
	return out;
}

/** tidyCount is the number shown on the Tidy tab: how many suggestions there are. */
export const tidyCount = (items: TidyItem[]) => items.length;

// ---- Part 5 of the bold redesign (harbor-10 screen 5, build list row 5) ----
// The Shelves page: five shelf tiles (Movies, Shows, Anime, Music, Manga), the
// Tower space bar, filter chips, sort by what the family watches, quality
// badges and the play button that opens a title in Glowfin.

/** A shelf on the Shelves page. Anime and Manga are shelves of their own. */
export type ShelfId = 'movie' | 'show' | 'anime' | 'artist' | 'manga';

export const SHELF_IDS: ShelfId[] = ['movie', 'show', 'anime', 'artist', 'manga'];

export const SHELF_NAME: Record<ShelfId, string> = { movie: 'Movies', show: 'Shows', anime: 'Anime', artist: 'Music', manga: 'Manga' };

/** Each shelf's glow colour (a Harbor colour variable). */
export const SHELF_GLOW: Record<ShelfId, string> = { movie: 'var(--harbor-pink)', show: 'var(--harbor-sky)', anime: 'var(--harbor-violet)', artist: 'var(--harbor-amber)', manga: 'var(--harbor-mint)' };

/** Which shelves a person sees: Music needs the part on and is not for Kids; Manga is for managers and never for Kids. */
export function shelvesFor(o: { kid: boolean; manage: boolean; music?: boolean; movies?: boolean; shows?: boolean }): ShelfId[] {
	return SHELF_IDS.filter((k) => {
		if (k === 'movie') return o.movies !== false;
		if (k === 'show' || k === 'anime') return o.shows !== false || k === 'anime';
		if (k === 'artist') return !o.kid && o.music !== false;
		return !o.kid && o.manage;
	});
}

/** shelfListView says the page shows the HolyArrs list (?list=1) instead of the poster wall. Anime and Manga have only the wall. */
export function shelfListView(p: Pick<URLSearchParams, 'get'>): boolean {
	const k = p.get('kind');
	return p.get('list') === '1' && k !== 'anime' && k !== 'manga';
}

/** readShelf reads ?kind= from the page link; anything else is Movies. */
export function readShelf(v: string | null, allowed: ShelfId[]): ShelfId {
	const k = (SHELF_IDS as string[]).includes(v ?? '') ? (v as ShelfId) : 'movie';
	return allowed.includes(k) ? k : (allowed[0] ?? 'movie');
}

/** shelfOf says which shelf a Library title sits on. Anime is not also on Movies or Shows. */
export function shelfOf(t: TitleView): ShelfId | null {
	if (t.kind === 'artist') return 'artist';
	if (t.kind !== 'movie' && t.kind !== 'show') return null;
	return isAnime(t) ? 'anime' : t.kind;
}

/** Titles on one shelf (not Manga, which has its own list). */
export const onShelfOf = (ts: TitleView[], k: ShelfId): TitleView[] => ts.filter((t) => shelfOf(t) === k);

/** Count per shelf; Manga comes from the manga list. */
export function shelfTileCounts(ts: TitleView[], manga: number): Record<ShelfId, number> {
	const c: Record<ShelfId, number> = { movie: 0, show: 0, anime: 0, artist: 0, manga };
	for (const t of ts) {
		const k = shelfOf(t);
		if (k) c[k]++;
	}
	return c;
}

/** "2,715 titles", "479 artists", "3 series" under each tile. */
export function tileLine(k: ShelfId, n: number): string {
	const w = k === 'artist' ? (n === 1 ? 'artist' : 'artists') : k === 'manga' ? 'series' : n === 1 ? 'title' : 'titles';
	return `${n.toLocaleString('en-US')} ${w}`;
}

// -- Filters --

export type ShelfFilter = 'all' | 'gaps' | 'better' | 'missing' | 'new';

export const FILTER_NAME: Record<Exclude<ShelfFilter, 'all'>, string> = { gaps: 'Has gaps', better: 'Better copy', missing: 'Missing', new: 'New this week' };

const WEEK = 7 * 24 * 3600 * 1000;

/** isNewThisWeek: added to the Library in the last 7 days. */
export function isNewThisWeek(t: Pick<TitleView, 'added_at'>, now = Date.now()): boolean {
	const at = t.added_at ? Date.parse(t.added_at) : NaN;
	return Number.isFinite(at) && now - at < WEEK && now - at >= -60_000;
}

/** hasNoFile: a movie asked for with nothing on Glowfin yet. Shows and music use "Has gaps". */
export function hasNoFile(t: TitleView): boolean {
	return t.kind === 'movie' && !t.slots.some((s) => s.state === 'in_library' || s.state === 'better_wanted');
}

export function wantsBetter(t: TitleView): boolean {
	return t.kind === 'show' ? (t.show?.better_wanted ?? 0) > 0 : t.slots.some((s) => s.state === 'better_wanted');
}

export function passesFilter(t: TitleView, f: ShelfFilter, now = Date.now()): boolean {
	switch (f) {
		case 'gaps':
			return t.kind !== 'movie' && hasGap(t);
		case 'better':
			return wantsBetter(t);
		case 'missing':
			return hasNoFile(t);
		case 'new':
			return isNewThisWeek(t, now);
		default:
			return true;
	}
}

export function filterCounts(ts: TitleView[], now = Date.now()): Record<Exclude<ShelfFilter, 'all'>, number> {
	const c = { gaps: 0, better: 0, missing: 0, new: 0 };
	for (const t of ts) for (const f of ['gaps', 'better', 'missing', 'new'] as const) if (passesFilter(t, f, now)) c[f]++;
	return c;
}

/** Plain-words search on the wall: every word must be in the name (accents and case ignored). */
export function matchesWords(name: string, q: string): boolean {
	const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
	const n = fold(name);
	return fold(q).split(/\s+/).filter(Boolean).every((w) => n.includes(w));
}

// -- Sorting --

export type ShelfSort = 'added' | 'name' | 'most' | 'never' | 'size';

export const SORT_NAME: Record<ShelfSort, string> = { added: 'Recently added', name: 'A to Z', most: 'Most watched', never: 'Never watched', size: 'Biggest files' };

export interface Plays {
	plays: number;
	/** Last time anyone watched it (ISO). */
	last?: string;
}

export function readSort(v: string | null): ShelfSort {
	return v && v in SORT_NAME ? (v as ShelfSort) : 'added';
}

const sortName = (t: TitleView) => t.name.replace(/^(the|a|an)\s+/i, '');

/**
 * sortShelf puts a shelf in order. Most watched: most plays first. Never
 * watched: titles nobody played first (oldest added first, so the ones that
 * waited longest lead), then the least watched, longest ago.
 */
export function sortShelf(ts: TitleView[], by: ShelfSort, plays: Map<number, Plays>): TitleView[] {
	const p = (t: TitleView) => plays.get(t.id)?.plays ?? 0;
	const last = (t: TitleView) => {
		const l = plays.get(t.id)?.last;
		return l ? Date.parse(l) || 0 : 0;
	};
	const added = (t: TitleView) => (t.added_at ? Date.parse(t.added_at) || 0 : 0);
	const byName = (a: TitleView, b: TitleView) => sortName(a).localeCompare(sortName(b), 'en', { sensitivity: 'base' });
	const out = [...ts];
	switch (by) {
		case 'name':
			return out.sort(byName);
		case 'most':
			return out.sort((a, b) => p(b) - p(a) || last(b) - last(a) || byName(a, b));
		case 'never':
			return out.sort((a, b) => p(a) - p(b) || (p(a) === 0 ? added(a) - added(b) : last(a) - last(b)) || byName(a, b));
		case 'size':
			return out.sort((a, b) => (b.size_bytes ?? 0) - (a.size_bytes ?? 0) || byName(a, b));
		default:
			return out.sort((a, b) => added(b) - added(a) || byName(a, b));
	}
}

/** The small line under a poster when sorted by plays: "12 plays · Nov 3" or "Never watched". */
export function playsLine(p: Plays | undefined): string {
	if (!p || p.plays <= 0) return 'Never watched';
	const when = p.last ? new Date(p.last).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: new Date(p.last).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }) : '';
	return `${p.plays.toLocaleString('en-US')} ${p.plays === 1 ? 'play' : 'plays'}${when ? ` · ${when}` : ''}`;
}

// -- Quality badge --

export interface QualityBadge {
	text: string;
	/** Below Ben's 1080p goal: shown amber. */
	low: boolean;
}

/** qualityBadge is the "1080p" or "720p" tag on a poster; null when Harbor does not know the picture size. */
export function qualityBadge(t: TitleView): QualityBadge | null {
	const h = bestHeight(t);
	if (!h) return null;
	if (h >= 2000) return { text: '4K', low: false };
	if (h >= 1000) return { text: '1080p', low: false };
	if (h >= 700) return { text: '720p', low: true };
	if (h >= 560) return { text: 'DVD', low: true };
	return { text: `${h}p`, low: true };
}

// -- Tower space bar --

export interface Disk {
	path: string;
	free_bytes: number;
	total_bytes: number;
}

export interface SpacePart {
	id: ShelfId;
	bytes: number;
	/** Share of the whole disk, 0 to 100. */
	pct: number;
}

export interface SpaceBar {
	total: number;
	free: number;
	parts: SpacePart[];
	/** What the shelves don't explain: other files on the same disks. */
	other: number;
}

/**
 * spaceBar works out what fills Tower. Library folders on the same disk
 * report the same size and free space, so each disk is counted once.
 */
export function spaceBar(disks: Disk[], ts: TitleView[]): SpaceBar | null {
	const seen = new Set<string>();
	let total = 0;
	let free = 0;
	for (const d of disks) {
		if (!d.total_bytes) continue;
		const key = `${d.total_bytes}:${d.free_bytes}`;
		if (seen.has(key)) continue;
		seen.add(key);
		total += d.total_bytes;
		free += d.free_bytes;
	}
	if (!total) return null;
	const by: Record<ShelfId, number> = { movie: 0, show: 0, anime: 0, artist: 0, manga: 0 };
	for (const t of ts) {
		const k = shelfOf(t);
		if (k) by[k] += t.size_bytes ?? 0;
	}
	const used = Math.max(0, total - free);
	const shelves = SHELF_IDS.reduce((n, k) => n + by[k], 0);
	const parts = SHELF_IDS.filter((k) => by[k] > 0).map((k) => ({ id: k, bytes: by[k], pct: (by[k] / total) * 100 }));
	return { total, free, parts, other: Math.max(0, used - shelves) };
}

/** "8.2 TB free of 32" */
export function freeLine(s: SpaceBar): string {
	return `${gb(s.free) || '0 MB'} free of ${gb(s.total)}`;
}

/** "Movies 10 TB · Shows 6.7 TB · Anime 2.1 TB", biggest three. */
export function spaceWords(s: SpaceBar): string {
	return [...s.parts]
		.sort((a, b) => b.bytes - a.bytes)
		.slice(0, 3)
		.map((p) => `${SHELF_NAME[p.id]} ${gb(p.bytes)}`)
		.join(' · ');
}
