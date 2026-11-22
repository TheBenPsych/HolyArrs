// Harbor: the Shrinker tab of the Tower. It shows how the night-time video
// shrinker on Tower is doing, last night's files (with Put back), and its
// settings. The server works everything out (health/harbor_shrinker.go);
// these are the small helpers for the page, kept here so they can be tested.
import type { Tone } from './tower.ts';
import type { Week } from './tower-bold.ts';

export interface ShrinkSettings {
	night_start: number;
	night_end: number;
	episode_gb: number;
	movie_gb: number;
	keep_percent: number;
	min_kbps_1080: number;
	backup_days: number;
	min_free_gb: number;
	trim_languages: boolean;
	folders_off: string[];
}

export interface ShrinkTile {
	key: string;
	name: string;
	tone: Tone;
	line: string;
	fix?: string;
}

export interface ShrinkThing {
	key: string;
	tone: Tone;
	title: string;
	line: string;
	fix?: string;
	fix_label?: string;
}

export interface ShrinkNight {
	date: string;
	files: number;
	saved_gb: number;
}

export interface ShrinkFile {
	at: string;
	path: string;
	name: string;
	before_gb: number;
	after_gb: number;
	can_put_back: boolean;
	put_back_asked: boolean;
}

export interface ShrinkView {
	connected: boolean;
	why?: string;
	tone: Tone;
	headline: string;
	line: string;
	saved_last_gb: number;
	tiles: ShrinkTile[];
	things: ShrinkThing[];
	nights: ShrinkNight[];
	saved_week_gb: number;
	files: ShrinkFile[];
	settings: ShrinkSettings | null;
	settings_pending: boolean;
	folders: string[];
	skipping_tonight: boolean;
	waiting: number;
	free_gb: number;
	kept_gb: number;
	notes: string[];
	asked_fixes: string[];
	week: Week | null;
}

/** 1 -> "1 AM", 13 -> "1 PM", 0 -> "midnight". Matches the server. */
export function hourWord(h: number): string {
	if (h === 0) return 'midnight';
	if (h === 12) return 'noon';
	return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

/** 0.86 -> "0.9 GB", 0.4 -> "400 MB", 1234 -> "1234 GB". */
export function sizeWord(gb: number): string {
	if (gb < 1) return `${Math.round(gb * 1000)} MB`;
	if (gb >= 100) return `${Math.round(gb)} GB`;
	return `${gb.toFixed(1)} GB`;
}

/** How much smaller a file got: 1.96 -> 1.10 is "44% smaller". */
export function smaller(before: number, after: number): string {
	if (before <= 0) return '';
	return `${Math.round((1 - after / before) * 100)}% smaller`;
}

/** Bar heights for the nights, 0 to 100, tallest night = 100. A night with files is never under 6, so it shows. */
export function barHeights(nights: ShrinkNight[]): number[] {
	const top = Math.max(0, ...nights.map((n) => n.saved_gb));
	return nights.map((n) => (top <= 0 || n.saved_gb <= 0 ? 0 : Math.max(6, Math.round((n.saved_gb / top) * 100))));
}

/** "Mon" for "2026-11-23". */
export function nightName(date: string): string {
	const d = new Date(`${date}T12:00:00`);
	return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString('en', { weekday: 'short' });
}

/** The hours sentence: "1 AM to 8 AM (7 hours)". */
export function hoursWords(start: number, end: number): string {
	let n = end - start;
	if (n <= 0) n += 24;
	return `${hourWord(start)} to ${hourWord(end)} (${n} hour${n === 1 ? '' : 's'})`;
}

/** The "how small" choices: the percent kept, with plain words. */
export const KEEP_CHOICES = [
	{ value: 40, label: 'Very small (about 40%)' },
	{ value: 50, label: 'Half size (about 50%)' },
	{ value: 60, label: 'A bit smaller (about 60%)' },
	{ value: 70, label: 'Gentle (about 70%)' }
];

/** The smallest a 1080p file may get, as a speed; with the size it means for a 45-minute episode. */
export const FLOOR_CHOICES = [
	{ value: 1500, label: 'About 500 MB per 45 minutes' },
	{ value: 2200, label: 'About 750 MB per 45 minutes' },
	{ value: 3000, label: 'About 1 GB per 45 minutes' },
	{ value: 4000, label: 'About 1.3 GB per 45 minutes' }
];

/** Puts a saved value into a choice list when it isn't one of the choices, so the page never hides it. */
export function withValue(choices: { value: number; label: string }[], v: number, label: (v: number) => string) {
	return choices.some((c) => c.value === v) ? choices : [...choices, { value: v, label: label(v) }].sort((a, b) => a.value - b.value);
}

/** Folder chips: on unless the folder is in folders_off. */
export function toggleFolder(off: string[], name: string): string[] {
	return off.includes(name) ? off.filter((f) => f !== name) : [...off, name].sort();
}

/** Changed settings, for the Save button. */
export function sameSettings(a: ShrinkSettings | null, b: ShrinkSettings | null): boolean {
	if (!a || !b) return a === b;
	const k = (s: ShrinkSettings) => JSON.stringify({ ...s, folders_off: [...s.folders_off].sort() });
	return k(a) === k(b);
}
