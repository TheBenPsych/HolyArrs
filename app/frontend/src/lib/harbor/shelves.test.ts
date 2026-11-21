import { describe, expect, it } from 'vitest';
import type { SeasonSummary, TitleView } from '#lib/core/types.ts';
import { hasGap, isAnime, seasonBlock, seasonBlocks, shelfCounts, tidyItems, titleStory } from './shelves.ts';

const base = (o: Partial<TitleView>): TitleView => ({ id: 1, kind: 'movie', name: 'X', ids: null, keep_up_to_date: true, why_added: '', release_gate: '', gate_delay_days: 0, stage: 'released', gate_open: true, gate_reason: '', artwork: ['p.jpg'], versions: [], slots: [], ...o }) as TitleView;
const season = (o: Partial<SeasonSummary>): SeasonSummary => ({ number: 1, name: '', keep_up_to_date: true, episodes: 10, aired: 10, in_library: 10, missing: 0, not_out_yet: 0, better_wanted: 0, ...o });

describe('season blocks', () => {
	it('colours each season', () => {
		expect(seasonBlock(season({})).state).toBe('complete');
		expect(seasonBlock(season({ in_library: 8, missing: 2 }))).toEqual({ number: 1, state: 'gaps', label: 'Season 1: 2 episodes missing' });
		expect(seasonBlock(season({ in_library: 8, downloading: 2 })).state).toBe('coming');
		expect(seasonBlock(season({ aired: 0, in_library: 0, not_out_yet: 10 })).state).toBe('unaired');
		expect(seasonBlock(season({ in_library: 0, keep_up_to_date: false })).label).toBe('Season 1: not asked for');
	});
	it('leaves specials out', () => {
		const t = base({ kind: 'show', show: { seasons: [season({ number: 0 }), season({ number: 1 })] } as TitleView['show'] });
		expect(seasonBlocks(t).map((b) => b.number)).toEqual([1]);
	});
});

describe('title story', () => {
	it('says a movie is on Glowfin with its quality and size', () => {
		const t = base({ size_bytes: 2.8e9, slots: [{ id: 1, version: '', version_id: 1, state: 'in_library', state_label: '', file: { RelativePath: 'a', Size: 1, AddedAt: '', Quality: { resolution: 1080 } } }] });
		expect(titleStory(t)).toEqual({ tone: 'landed', sentence: 'On Glowfin.', facts: ['1080p', '2.8 GB'] });
	});
	it('counts a show’s missing episodes', () => {
		const t = base({ kind: 'show', show: { episodes: 62, not_out_yet: 0, missing: 4, in_library: 58, seasons: [] } as unknown as TitleView['show'] });
		expect(titleStory(t).sentence).toBe('58 of 62 aired episodes are on Glowfin, 4 episodes missing.');
		expect(hasGap(t)).toBe(true);
	});
});

describe('shelves', () => {
	it('counts shelves and anime', () => {
		const c = shelfCounts([base({}), base({ kind: 'show', original_language: 'ja', genres: ['Animation'] }), base({ kind: 'artist' })]);
		expect(c).toEqual({ movie: 1, show: 1, artist: 1, anime: 1 });
		expect(isAnime({ original_language: 'en', genres: ['Animation'] })).toBe(false);
	});
	it('only suggests what is there', () => {
		const items = tidyItems({ titles: [base({ artwork: [] }), base({ slots: [{ id: 1, version: '', version_id: 1, state: 'better_wanted', state_label: '' }] })], missingSubs: 0, binned: 3 });
		expect(items.map((i) => i.key)).toEqual(['better-movies', 'posters', 'bin']);
	});
});
