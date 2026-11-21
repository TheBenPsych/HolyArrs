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
	if (betterMovies) out.push({ key: 'better-movies', count: betterMovies, unit: betterMovies === 1 ? 'movie' : 'movies', what: 'Waiting for a better copy', why: 'Files below your quality rule, like an old 720p where a good 1080p is out. Harbor upgrades them as copies appear.', action: 'See them', href: '/library?kind=movie&show=better' });
	if (betterShows) out.push({ key: 'better-shows', count: betterShows, unit: betterShows === 1 ? 'show' : 'shows', what: 'Episodes waiting for a better copy', why: 'Some episodes are below the show’s quality rule.', action: 'See them', href: '/library?kind=show&show=better' });
	if (gapShows) out.push({ key: 'gap-shows', count: gapShows, unit: gapShows === 1 ? 'show' : 'shows', what: 'Episodes missing', why: 'Aired episodes of shows you follow that are not on Glowfin yet.', action: 'See them', href: '/library?kind=show&show=missing' });
	if (gapMovies) out.push({ key: 'gap-movies', count: gapMovies, unit: gapMovies === 1 ? 'movie' : 'movies', what: 'Asked for but not here yet', why: 'Movies on the shelf with no file yet.', action: 'See them', href: '/library?kind=movie&show=missing' });
	if (posters) out.push({ key: 'posters', count: posters, unit: posters === 1 ? 'title' : 'titles', what: 'Missing poster', why: 'Open one and pick its match again, or refresh its details.', action: 'Fix one at a time', href: '#posters' });
	if (i.missingSubs) out.push({ key: 'subs', count: i.missingSubs, unit: i.missingSubs === 1 ? 'file' : 'files', what: 'Missing subtitles', why: 'Files without the subtitle languages you asked for.', action: 'Find subtitles', href: '/library/missing-subtitles' });
	if (i.binned) out.push({ key: 'bin', count: i.binned, unit: i.binned === 1 ? 'file' : 'files', what: 'Waiting in the bin', why: 'Removed files are kept for a while so you can undo.', action: 'Look or undo', href: '/library/deleted' });
	return out;
}

/** tidyCount is the number shown on the Tidy tab: how many suggestions there are. */
export const tidyCount = (items: TidyItem[]) => items.length;
