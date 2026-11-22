// Harbor's title pages in the bold look (build list part 6): season rings,
// the episode strip, "How it got here" as a timeline, and "What you have"
// (the file details in plain words). Pure functions, so they can be tested
// and every part of the page tells the same story.
// Design: harbor-10-bold-look screen 6; ideas-2 "story" and "plainfile".
import type { Ask, EpisodeView, EventRecord, SeasonSummary, ShowInfo } from '#lib/core/types.ts';
import { gb, seasonBlock, type BlockState } from './shelves.ts';

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

export type RingTone = 'mint' | 'sky' | 'pink' | 'amber' | 'faint';

const RING_TONE: Record<BlockState, RingTone> = { complete: 'mint', coming: 'sky', gaps: 'pink', unaired: 'faint', skipped: 'faint' };

export interface SeasonRing {
	number: number;
	name: string;
	/** "28 of 28", "6 of 10 · 1 coming in", "Not out yet" */
	words: string;
	percent: number;
	tone: RingTone;
}

/** seasonRing is one season as a ring that fills as its episodes arrive. */
export function seasonRing(se: SeasonSummary): SeasonRing {
	const name = se.number === 0 ? 'Specials' : `Season ${se.number}`;
	const block = seasonBlock(se);
	const total = se.aired > 0 ? se.aired : se.episodes;
	const here = Math.min(se.in_library, Math.max(total, se.in_library));
	const percent = total > 0 ? Math.round((here / total) * 100) : 0;
	let words = total > 0 ? `${here} of ${total}` : 'Not out yet';
	if ((se.downloading ?? 0) > 0) words += ` · ${se.downloading} coming in`;
	else if (se.aired === 0 && se.episodes > 0) words = `${plural(se.episodes, 'episode')}, not out yet`;
	else if (block.state === 'skipped') words += ' · not asked for';
	// Specials are optional: a missing special is amber, not a gap.
	const tone = se.number === 0 && block.state === 'gaps' ? 'amber' : RING_TONE[block.state];
	return { number: se.number, name, words, percent, tone };
}

/** seasonRings lists the rings for a show: the seasons in order, then Specials when any are kept. */
export function seasonRings(show?: ShowInfo | null): SeasonRing[] {
	const seasons = show?.seasons ?? [];
	const regular = seasons.filter((s) => s.number > 0).map(seasonRing);
	const specials = seasons.find((s) => s.number === 0 && s.in_library > 0);
	return specials ? [...regular, seasonRing(specials)] : regular;
}

/**
 * focusSeason picks the season the episode strip shows: one with episodes
 * coming in, else the newest followed season with gaps, else the newest
 * season that has aired anything.
 */
export function focusSeason(show?: ShowInfo | null): number | null {
	const seasons = (show?.seasons ?? []).filter((s) => s.number > 0).sort((a, b) => b.number - a.number);
	if (!seasons.length) return null;
	return (
		seasons.find((s) => (s.downloading ?? 0) > 0)?.number ??
		seasons.find((s) => s.keep_up_to_date && !s.dropped && s.aired > s.in_library)?.number ??
		seasons.find((s) => s.aired > 0)?.number ??
		seasons[seasons.length - 1].number
	);
}

export type EpisodeState = 'here' | 'coming' | 'later' | 'missing' | 'bad' | 'skipped';

export interface EpisodeCard {
	id: number;
	number: number;
	name: string;
	state: EpisodeState;
	/** "Here", "Coming in", "Out Saturday", "Missing" */
	words: string;
	still?: string;
}

const DAY = 86_400_000;

/** outWords says when an episode airs: "Out today", "Out Saturday" (this week) or "Out Nov 6". */
export function outWords(airDate: string | undefined, now = new Date()): string {
	if (!airDate) return 'Not out yet';
	const day = new Date(`${airDate.slice(0, 10)}T12:00:00`);
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
	const days = Math.round((day.getTime() - today.getTime()) / DAY);
	if (days <= 0) return 'Out today';
	if (days === 1) return 'Out tomorrow';
	if (days < 7) return `Out ${day.toLocaleDateString('en-US', { weekday: 'long' })}`;
	return `Out ${day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

export function episodeCard(ep: EpisodeView, now = new Date()): EpisodeCard {
	const states = ep.slots.map((s) => s.state);
	const has = (...xs: string[]) => states.some((s) => xs.includes(s));
	const base = { id: ep.id, number: ep.episode, name: ep.name ? `E${ep.episode} ${ep.name}` : `E${ep.episode}`, still: ep.still };
	const future = !!ep.air_date && new Date(`${ep.air_date.slice(0, 10)}T23:59:59`) > now;
	if (has('in_library', 'better_wanted')) return { ...base, state: 'here', words: 'Here' };
	if (has('downloading', 'importing', 'chosen', 'stalled')) return { ...base, state: 'coming', words: has('importing') ? 'Being filed' : 'Coming in' };
	if (has('not_out_yet') || future) return { ...base, state: 'later', words: outWords(ep.air_date, now) };
	if (!ep.keep_up_to_date || ep.dropped) return { ...base, state: 'skipped', words: 'Not asked for' };
	if (has('failed', 'rejected', 'needs_a_decision')) return { ...base, state: 'bad', words: 'Needs a look' };
	return { ...base, state: 'missing', words: 'Missing, Harbor is looking' };
}

export interface EpisodeStrip {
	cards: EpisodeCard[];
	/** "6 here · 1 coming in · 3 not out yet" */
	summary: string;
}

/**
 * episodeStrip lays out a season as cards. With more than `max` episodes
 * it starts a couple before the first one that is not here, so what is
 * coming next is always in view.
 */
export function episodeStrip(eps: EpisodeView[], now = new Date(), max = 8): EpisodeStrip {
	const all = [...eps].sort((a, b) => a.episode - b.episode).map((e) => episodeCard(e, now));
	const count = (s: EpisodeState) => all.filter((c) => c.state === s).length;
	const parts = [
		count('here') ? `${count('here')} here` : '',
		count('coming') ? `${count('coming')} coming in` : '',
		count('missing') + count('bad') ? `${count('missing') + count('bad')} missing` : '',
		count('later') ? `${count('later')} not out yet` : '',
		count('skipped') ? `${count('skipped')} not asked for` : ''
	].filter(Boolean);
	let start = 0;
	if (all.length > max) {
		const first = all.findIndex((c) => c.state !== 'here');
		start = first < 0 ? all.length - max : Math.max(0, Math.min(first - 2, all.length - max));
	}
	return { cards: all.slice(start, start + max), summary: parts.join(' · ') };
}

export type StepTone = 'pink' | 'violet' | 'amber' | 'sky' | 'mint';

export interface StoryStep {
	key: 'asked' | 'added' | 'approved' | 'found' | 'downloaded' | 'glowfin';
	name: string;
	/** "Jake · Nov 2", "1.4 GB · 6 min" */
	sub: string;
	done: boolean;
	tone: StepTone;
}

/** The event kinds the timeline reads, for /events?kind=. */
export const STORY_KINDS = ['title_added', 'adopted', 'ask_made', 'ask_approved', 'download_sent', 'download_finished', 'import_done', 'import_partly_done', 'media_server_told'];

export interface StoryInput {
	kind: string;
	asks?: Ask[];
	events?: EventRecord[];
	addedAt?: string;
	/** Whether anything of the title is on disk (on Glowfin). */
	onDisk: boolean;
	/** Something is downloading right now. */
	moving?: boolean;
	/** How far along it is (0 to 1), when known. */
	progress?: number;
	resolution?: string;
	sizeEach?: number;
	/** The name of the person looking at the page, so their own ask reads "You". */
	me?: string;
}

const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');
const first = (s?: string) => (s ?? '').trim().split(/\s+/)[0] ?? '';

/** howLong says how long a download took: "6 min", "2 hr 10 min", "3 days". */
export function howLong(fromIso?: string, toIso?: string): string {
	if (!fromIso || !toIso) return '';
	const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
	if (!(ms > 0)) return '';
	const min = Math.max(1, Math.round(ms / 60_000));
	if (min < 60) return `${min} min`;
	const hr = Math.floor(min / 60);
	if (hr < 48) return min % 60 ? `${hr} hr ${min % 60} min` : `${hr} hr`;
	return `${Math.round(hr / 24)} days`;
}

/**
 * storySteps tells how a title got to Glowfin as five dots: asked (or
 * added), approved, found, downloaded, on Glowfin. Steps not reached yet
 * come back with done false. The first ask, first yes and the latest
 * download are used, so a show tells the story of its newest episode.
 */
export function storySteps(input: StoryInput): StoryStep[] {
	const events = [...(input.events ?? [])].sort((a, b) => a.At.localeCompare(b.At));
	const firstOf = (...kinds: string[]) => events.find((e) => kinds.includes(e.Kind));
	const lastOf = (...kinds: string[]) => [...events].reverse().find((e) => kinds.includes(e.Kind));
	const asks = [...(input.asks ?? [])].filter((a) => !a.four_k).sort((a, b) => a.asked_at.localeCompare(b.asked_at));
	const ask = asks[0];
	const who = (w?: { name?: string; display_name?: string }) => {
		const n = first(w?.display_name || w?.name);
		return n && input.me && n === first(input.me) ? 'You' : n;
	};
	const steps: StoryStep[] = [];

	if (ask) {
		steps.push({ key: 'asked', name: 'Asked', sub: [who(ask.asked_by), day(ask.asked_at)].filter(Boolean).join(' · '), done: true, tone: 'pink' });
		const yes = ask.decided_at && ask.state !== 'turned_down' ? ask : asks.find((a) => a.decided_at && a.state !== 'turned_down');
		const yesEvent = firstOf('ask_approved');
		const approved = !!yes || !!yesEvent || input.onDisk;
		const by = yes?.auto_approved ? 'Said yes by itself' : who(yes?.decided_by) || yesEvent?.actor_name || '';
		steps.push({ key: 'approved', name: 'Approved', sub: approved ? [first(by), day(yes?.decided_at ?? yesEvent?.At)].filter(Boolean).join(' · ') : 'Waiting for a yes', done: approved, tone: 'violet' });
	} else {
		const added = firstOf('title_added', 'adopted');
		const by = added?.Kind === 'adopted' ? 'Found on Tower' : first(added?.actor_name);
		steps.push({ key: 'added', name: 'Added', sub: [by, day(added?.At ?? input.addedAt)].filter(Boolean).join(' · '), done: true, tone: 'pink' });
	}

	const sent = lastOf('download_sent');
	const finished = lastOf('download_finished');
	const landed = lastOf('import_done', 'import_partly_done', 'adopted');
	const moving = !!input.moving;
	// A title found already on Tower skips straight to Glowfin.
	const skipped = !sent && !moving && input.onDisk;
	if (!skipped) {
		const found = !!sent || moving || input.onDisk;
		steps.push({ key: 'found', name: 'Found', sub: found ? [input.resolution, day(sent?.At)].filter(Boolean).join(' · ') || 'A good copy' : 'Looking for a good copy', done: found, tone: 'amber' });
		const done = !moving && (!!finished || input.onDisk);
		const sub = moving && !done ? (typeof input.progress === 'number' ? `Coming in · ${Math.round(Math.min(1, Math.max(0, input.progress)) * 100)}%` : 'Coming in now') : done ? [gb(input.sizeEach), howLong(sent?.At, finished?.At ?? landed?.At)].filter(Boolean).join(' · ') : 'Not yet';
		steps.push({ key: 'downloaded', name: 'Downloaded', sub: sub || 'Done', done, tone: 'sky' });
	}
	const told = ask?.available_at;
	const asker = ask ? who(ask.asked_by) : '';
	const toldWords = told && asker ? (asker === 'You' ? 'you were told' : `${asker} was told`) : '';
	const glowSub = moving ? 'As soon as it is in' : input.onDisk ? [day(landed?.At ?? told ?? input.addedAt), toldWords].filter(Boolean).join(' · ') : 'Not yet';
	steps.push({ key: 'glowfin', name: 'On Glowfin', sub: glowSub, done: input.onDisk && !moving, tone: 'mint' });
	return steps;
}

/** What the files are, as the server sums them up (GET /api/v1/harbor/title-files). */
export interface FileFacts {
	files: number;
	resolution?: string;
	mixed?: boolean;
	hdr?: string;
	video_codec?: string;
	size_total: number;
	size_each: number;
	audio: string[];
	channels?: string;
	subtitles: string[];
	forced?: boolean;
}

export interface FileLine {
	key: 'picture' | 'size' | 'sound' | 'subtitles';
	label: string;
	value: string;
	tone: 'mint' | 'sky' | 'violet' | 'pink';
}

/** languageName turns "jpn", "ja" or "en-US" into "Japanese" and "English". */
export function languageName(code: string): string {
	const c = code.trim();
	if (!c || /^(und|unknown|zxx|mis)$/i.test(c)) return '';
	const three: Record<string, string> = { eng: 'en', jpn: 'ja', spa: 'es', fre: 'fr', fra: 'fr', ger: 'de', deu: 'de', ita: 'it', kor: 'ko', chi: 'zh', zho: 'zh', por: 'pt', rus: 'ru', hin: 'hi', ara: 'ar', dut: 'nl', nld: 'nl', swe: 'sv', nor: 'no', dan: 'da', fin: 'fi', pol: 'pl', tur: 'tr', tha: 'th', vie: 'vi', heb: 'he', gre: 'el', ell: 'el', cze: 'cs', ces: 'cs', hun: 'hu', ind: 'id', may: 'ms', msa: 'ms', ukr: 'uk', rum: 'ro', ron: 'ro', fil: 'fil', tgl: 'tl', cat: 'ca' };
	const key = three[c.toLowerCase()] ?? c;
	try {
		const n = new Intl.DisplayNames(['en'], { type: 'language' }).of(key);
		return n && n.toLowerCase() !== key.toLowerCase() ? n : c.length > 3 ? c : c.toUpperCase();
	} catch {
		return c;
	}
}

const names = (codes: string[]) => [...new Set(codes.map(languageName).filter(Boolean))];

/** andList: "English", "Japanese and English", "Japanese, English and 2 more". */
export function andList(xs: string[], max = 3): string {
	if (xs.length <= 1) return xs[0] ?? '';
	if (xs.length > max) return `${xs.slice(0, max - 1).join(', ')} and ${xs.length - max + 1} more`;
	return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

function pictureWords(f: FileFacts): string {
	const res = (f.resolution ?? '').toLowerCase();
	const n = Number.parseInt(res, 10);
	const size = n >= 2000 ? '4K' : n ? `${n}p` : '';
	const feel = n >= 2000 ? 'very sharp' : n >= 1000 ? 'sharp' : n >= 700 ? 'good' : n ? 'soft, a better copy would help' : '';
	const hdr = f.hdr ? (/dv/i.test(f.hdr) ? 'Dolby Vision' : 'HDR') : '';
	const words = [size, feel, hdr ? `with ${hdr}` : ''].filter(Boolean).join(', ').replace(', with', ' with');
	if (!words) return 'Not checked yet';
	return f.mixed ? `Mostly ${words}` : words;
}

function soundWords(f: FileFacts): string {
	const langs = names(f.audio);
	const ch = f.channels === '5.1' || f.channels === '7.1' || f.channels === '6.1' ? 'surround' : f.channels === '2.0' ? 'stereo' : f.channels === '1.0' ? 'mono' : '';
	if (!langs.length) return ch ? `One language, ${ch}` : 'Not checked yet';
	return [andList(langs), ch].filter(Boolean).join(', ');
}

/** fileLines turns the file facts into the four plain lines of "What you have". */
export function fileLines(f: FileFacts | null | undefined, kind: string): FileLine[] {
	if (!f || f.files <= 0) return [];
	const each = kind === 'show' && f.files > 1;
	const subs = names(f.subtitles);
	return [
		{ key: 'picture', label: 'Picture', value: pictureWords(f), tone: 'mint' },
		{ key: 'size', label: 'Size', value: each ? `${gb(f.size_each)} per episode, ${gb(f.size_total)} in all` : gb(f.size_total) || 'Not known', tone: 'sky' },
		{ key: 'sound', label: 'Sound', value: soundWords(f), tone: 'violet' },
		{ key: 'subtitles', label: 'Subtitles', value: subs.length ? andList(subs) + (f.forced ? ', plus signs-only' : '') : f.forced ? 'Signs-only' : 'None', tone: 'pink' }
	];
}

/** fileHeadline is the one short line under "What you have": "1 file" or "24 episodes on Tower". */
export function fileHeadline(f: FileFacts | null | undefined, kind: string): string {
	if (!f || f.files <= 0) return '';
	return kind === 'show' ? `${plural(f.files, 'episode')} on Tower` : f.files === 1 ? 'One copy on Tower' : `${plural(f.files, 'copy', 'copies')} on Tower`;
}
