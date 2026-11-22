import { describe, expect, it } from 'vitest';
import { airLine, badgeOf, didYouMean, distance, heroLabel, jumpsFor, nextHero, norm, ownedLine, seasonName, splitFound } from './explore.ts';

describe('explore helpers', () => {
	it('rotates the hero and names it', () => {
		expect(nextHero(0, 5)).toBe(1);
		expect(nextHero(4, 5)).toBe(0);
		expect(nextHero(0, 0)).toBe(0);
		expect(heroLabel(1)).toBe('Trending #2 this week');
	});
	it('badges posters', () => {
		expect(badgeOf(undefined, 4)?.text).toBe('On Glowfin');
		expect(badgeOf('downloading')?.text).toBe('Coming in');
		expect(badgeOf('approved')?.tone).toBe('coming');
		expect(badgeOf('requested')?.text).toBe('Asked');
		expect(badgeOf('missing')).toBeNull();
	});
	it('says counts and days', () => {
		expect(ownedLine(2, 3)).toBe('2 of 3 owned');
		expect(airLine('2026-11-27')).toBe('New on Fridays');
		expect(airLine(undefined)).toBe('');
		expect(seasonName(new Date(2026, 10, 22))).toBe('Fall 2026');
	});
});

describe('did you mean', () => {
	const names = ["Frieren: Beyond Journey's End", 'Dune: Part Three', 'Dune', 'The Bear', 'Severance'];
	it('reads number words as digits', () => {
		expect(norm('Dune: Part Three')).toBe('dune part 3');
	});
	it('counts swaps as one change', () => {
		expect(distance('fireen', 'frieren')).toBe(2);
		expect(distance('abc', 'abc')).toBe(0);
	});
	it('fixes typos', () => {
		expect(didYouMean('fireen', names)).toBe("Frieren: Beyond Journey's End");
		expect(didYouMean('dun part 3', names)).toBe('Dune: Part Three');
		expect(didYouMean('severence', names)).toBe('Severance');
	});
	it('stays quiet when the words already match or nothing is close', () => {
		expect(didYouMean('frieren', names)).toBeNull();
		expect(didYouMean('dune', names)).toBeNull();
		expect(didYouMean('zzzzzz', names)).toBeNull();
		expect(didYouMean('bea', names)).toBeNull();
	});
});

describe('search groups', () => {
	it('splits found rows', () => {
		const s = splitFound([
			{ kind: 'show', name: 'Frieren', title_id: 3 },
			{ kind: 'movie', name: 'Frieren Movie' },
			{ kind: 'person', name: 'Someone' },
			{ kind: 'artist', name: 'Band', state: 'have' }
		]);
		expect(s.yours.map((r) => r.name)).toEqual(['Frieren', 'Band']);
		expect(s.notYet.map((r) => r.name)).toEqual(['Frieren Movie']);
		expect(s.people.length).toBe(1);
	});
	it('finds settings by their words', () => {
		const j = [
			{ words: ['subtitles', 'subs'], href: '/settings/subtitles', label: 'Settings › Subtitles' },
			{ words: ['folders'], href: '/settings/library-folders', label: 'Settings › Library folders' }
		];
		expect(jumpsFor('subt', j).map((x) => x.href)).toEqual(['/settings/subtitles']);
		expect(jumpsFor('su', j)).toEqual([]);
	});
});
