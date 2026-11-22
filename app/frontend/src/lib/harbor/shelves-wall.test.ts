import { describe, expect, it } from 'vitest';
import type { TitleView } from '#lib/core/types.ts';
import { filterCounts, freeLine, isNewThisWeek, matchesWords, playsLine, qualityBadge, readShelf, shelfListView, shelfOf, shelfTileCounts, shelvesFor, sortShelf, spaceBar, spaceWords, type Plays } from './shelves.ts';

const t = (o: Partial<TitleView>): TitleView => ({ id: 1, kind: 'movie', name: 'X', ids: null, keep_up_to_date: true, why_added: '', release_gate: '', gate_delay_days: 0, stage: 'released', gate_open: true, gate_reason: '', artwork: [], versions: [], slots: [], ...o }) as TitleView;
const file = (resolution: number, state = 'in_library') => [{ id: 1, version: '', version_id: 1, state, state_label: '', file: { RelativePath: 'a', Size: 1, AddedAt: '', Quality: { resolution } } }] as unknown as TitleView['slots'];
const anime = { original_language: 'ja', genres: ['Animation'] };

describe('shelves', () => {
	it('gives Anime and Manga shelves of their own, and no Manga or Music for Kids', () => {
		expect(shelvesFor({ kid: false, manage: true })).toEqual(['movie', 'show', 'anime', 'artist', 'manga']);
		expect(shelvesFor({ kid: false, manage: false })).toEqual(['movie', 'show', 'anime', 'artist']);
		expect(shelvesFor({ kid: true, manage: true })).toEqual(['movie', 'show', 'anime']);
	});
	it('reads the shelf from the link, falling back when not allowed', () => {
		expect(readShelf('anime', ['movie', 'anime'])).toBe('anime');
		expect(readShelf('manga', ['movie', 'show'])).toBe('movie');
		expect(readShelf('nonsense', ['show'])).toBe('show');
	});
	it('puts anime on the Anime shelf only', () => {
		expect(shelfOf(t({ kind: 'show', ...anime }))).toBe('anime');
		expect(shelfOf(t({ kind: 'movie', ...anime }))).toBe('anime');
		expect(shelfOf(t({ kind: 'show' }))).toBe('show');
		const c = shelfTileCounts([t({ kind: 'show', ...anime }), t({ kind: 'show' }), t({}), t({ kind: 'artist' })], 3);
		expect(c).toEqual({ movie: 1, show: 1, anime: 1, artist: 1, manga: 3 });
	});
	it('shows the HolyArrs list only when asked, and never for Anime or Manga', () => {
		expect(shelfListView(new URLSearchParams('kind=movie&list=1'))).toBe(true);
		expect(shelfListView(new URLSearchParams('kind=movie'))).toBe(false);
		expect(shelfListView(new URLSearchParams('kind=anime&list=1'))).toBe(false);
	});
});

describe('filters and search', () => {
	const now = Date.parse('2026-11-22T12:00:00Z');
	it('counts new, missing and better copies', () => {
		const ts = [t({ added_at: '2026-11-20T00:00:00Z', slots: file(1080) }), t({ slots: file(720, 'better_wanted') }), t({ slots: [] })];
		expect(filterCounts(ts, now)).toEqual({ gaps: 0, better: 1, missing: 1, new: 1 });
		expect(isNewThisWeek({ added_at: '2026-11-01T00:00:00Z' }, now)).toBe(false);
	});
	it('matches every word, ignoring accents', () => {
		expect(matchesWords('Pokémon: The First Movie', 'pokemon first')).toBe(true);
		expect(matchesWords('Heat', 'heat 2')).toBe(false);
	});
});

describe('sorting by what the family watches', () => {
	const a = t({ id: 1, name: 'Arrival', added_at: '2026-01-01T00:00:00Z' });
	const b = t({ id: 2, name: 'Blade Runner', added_at: '2025-01-01T00:00:00Z' });
	const c = t({ id: 3, name: 'Coco', added_at: '2026-06-01T00:00:00Z' });
	const plays = new Map<number, Plays>([[1, { plays: 9, last: '2026-11-01T00:00:00Z' }], [3, { plays: 2, last: '2026-10-01T00:00:00Z' }]]);
	it('puts the most watched first', () => {
		expect(sortShelf([a, b, c], 'most', plays).map((x) => x.name)).toEqual(['Arrival', 'Coco', 'Blade Runner']);
	});
	it('puts never watched first, the longest waiting first', () => {
		expect(sortShelf([a, b, c], 'never', plays).map((x) => x.name)).toEqual(['Blade Runner', 'Coco', 'Arrival']);
	});
	it('sorts A to Z without "The"', () => {
		expect(sortShelf([t({ name: 'The Thing' }), t({ name: 'Heat' }), t({ name: 'Up' })], 'name', plays).map((x) => x.name)).toEqual(['Heat', 'The Thing', 'Up']);
	});
	it('words the line under a poster', () => {
		expect(playsLine(undefined)).toBe('Never watched');
		expect(playsLine({ plays: 1 })).toBe('1 play');
	});
});

describe('quality badge', () => {
	it('marks copies below 1080p', () => {
		expect(qualityBadge(t({ slots: file(1080) }))).toEqual({ text: '1080p', low: false });
		expect(qualityBadge(t({ slots: file(720) }))).toEqual({ text: '720p', low: true });
		expect(qualityBadge(t({ slots: file(2160) }))).toEqual({ text: '4K', low: false });
		expect(qualityBadge(t({}))).toBeNull();
	});
});

describe('Tower space bar', () => {
	it('counts a shared disk once and splits it by shelf', () => {
		const disks = [{ path: '/media/movies', free_bytes: 8.2e12, total_bytes: 32e12 }, { path: '/media/tv', free_bytes: 8.2e12, total_bytes: 32e12 }];
		const s = spaceBar(disks, [t({ size_bytes: 10e12 }), t({ kind: 'show', size_bytes: 6.7e12 }), t({ kind: 'show', ...anime, size_bytes: 2.1e12 })])!;
		expect(s.total).toBe(32e12);
		expect(freeLine(s)).toBe('8.2 TB free of 32.0 TB');
		expect(spaceWords(s)).toBe('Movies 10.0 TB · Shows 6.7 TB · Anime 2.1 TB');
		expect(Math.round(s.other / 1e9)).toBe(5000);
	});
	it('has nothing to show without disks', () => {
		expect(spaceBar([], [])).toBeNull();
	});
});
