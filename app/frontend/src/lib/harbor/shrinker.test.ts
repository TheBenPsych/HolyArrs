import { describe, expect, it } from 'vitest';
import { KEEP_CHOICES, barHeights, hourWord, hoursWords, sameSettings, sizeWord, smaller, toggleFolder, withValue, type ShrinkSettings } from './shrinker.ts';

const s: ShrinkSettings = { night_start: 1, night_end: 8, episode_gb: 1.5, movie_gb: 4, keep_percent: 50, min_kbps_1080: 2200, backup_days: 3, min_free_gb: 300, trim_languages: true, folders_off: ['b', 'a'] };

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
		expect(withValue(KEEP_CHOICES, 45, (v) => `${v}%`).map((c) => c.value)).toEqual([40, 45, 50, 60, 70]);
		expect(withValue(KEEP_CHOICES, 50, (v) => `${v}%`)).toBe(KEEP_CHOICES);
	});
});
