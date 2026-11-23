import { describe, expect, it } from 'vitest';
import { FLOOR_CHOICES, aimMB, barHeights, goalBar, goalWords, hourWord, hoursWords, sameSettings, sizeWord, smaller, toggleFolder, withValue, type ShrinkSettings } from './shrinker.ts';

const s: ShrinkSettings = { night_start: 1, night_end: 8, episode_min_mb: 400, episode_max_mb: 800, movie_min_mb: 800, movie_max_mb: 1500, aim: 'top', floor_mb_min: 12, hevc_max_cut: 50, picture_check: true, download_sizes: 'good', backup_days: 3, min_free_gb: 300, trim_languages: true, folders_off: ['b', 'a'] };

describe('shrinker words', () => {
	it('says hours like a person', () => {
		expect(hourWord(0)).toBe('midnight');
		expect(hourWord(1)).toBe('1 AM');
		expect(hourWord(12)).toBe('noon');
		expect(hourWord(23)).toBe('11 PM');
		expect(hoursWords(1, 8)).toBe('1 AM to 8 AM (7 hours)');
		expect(hoursWords(23, 6)).toBe('11 PM to 6 AM (7 hours)');
	});
	it('says sizes', () => {
		expect(sizeWord(0.4)).toBe('400 MB');
		expect(sizeWord(1.96)).toBe('2.0 GB');
		expect(sizeWord(1234.4)).toBe('1234 GB');
		expect(smaller(2, 1)).toBe('50% smaller');
	});
});

describe('barHeights', () => {
	it('makes the best night 100 and keeps small nights visible', () => {
		expect(barHeights([{ date: 'a', files: 0, saved_gb: 0 }, { date: 'b', files: 3, saved_gb: 0.1 }, { date: 'c', files: 9, saved_gb: 20 }])).toEqual([0, 6, 100]);
		expect(barHeights([{ date: 'a', files: 0, saved_gb: 0 }])).toEqual([0]);
	});
});

describe('settings helpers', () => {
	it('toggles folders', () => {
		expect(toggleFolder(['a'], 'b')).toEqual(['a', 'b']);
		expect(toggleFolder(['a', 'b'], 'a')).toEqual(['b']);
	});
	it('compares settings without caring about folder order', () => {
		expect(sameSettings(s, { ...s, folders_off: ['a', 'b'] })).toBe(true);
		expect(sameSettings(s, { ...s, night_end: 7 })).toBe(false);
	});
	it('keeps an odd saved value in the choices', () => {
		expect(withValue(FLOOR_CHOICES, 14, (v) => `${v}`).map((c) => c.value)).toEqual([12, 14, 16]);
		expect(withValue(FLOOR_CHOICES, 12, (v) => `${v}`)).toBe(FLOOR_CHOICES);
	});
});

describe('size goals', () => {
	it('aims like Tower does', () => {
		expect(aimMB(400, 800, 'top')).toBe(750);
		expect(aimMB(800, 1500, 'top')).toBe(1413);
		expect(aimMB(400, 800, 'middle')).toBe(600);
		expect(aimMB(400, 800, 'bottom')).toBe(450);
	});
	it('says goals in MB or GB', () => {
		expect(goalWords(400, 800)).toBe('400 – 800 MB');
		expect(goalWords(800, 1500)).toBe('0.8 – 1.5 GB');
	});
	it('splits the library bar into whole numbers', () => {
		expect(goalBar({ shrunk: 1, already_fine: 1, to_do: 1 })).toEqual({ shrunk: 33, fine: 33, todo: 34 });
		expect(goalBar({ shrunk: 0, already_fine: 0, to_do: 0 })).toEqual({ shrunk: 0, fine: 0, todo: 0 });
	});
});
