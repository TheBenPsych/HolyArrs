import { describe, expect, it } from 'vitest';
import type { Ask, EpisodeView, EventRecord, SeasonSummary, ShowInfo } from '#lib/core/types.ts';
import { andList, episodeCard, episodeStrip, fileHeadline, fileLines, focusSeason, howLong, languageName, outWords, seasonRing, seasonRings, storySteps } from './title.ts';

const season = (o: Partial<SeasonSummary>): SeasonSummary => ({ number: 1, name: '', keep_up_to_date: true, episodes: 10, aired: 10, in_library: 10, missing: 0, not_out_yet: 0, better_wanted: 0, ...o });
const show = (seasons: SeasonSummary[]) => ({ seasons }) as ShowInfo;
const ep = (n: number, state: string, o: Partial<EpisodeView> = {}): EpisodeView => ({ id: n, season: 2, episode: n, keep_up_to_date: true, ids: {}, slots: [{ id: n, version: 'main', version_id: 1, state, state_label: '' }], ...o });
const ev = (Kind: string, At: string, o: Partial<EventRecord> = {}): EventRecord => ({ ID: Math.random(), At, Kind, Summary: '', TitleID: 1, ...o });
const ask = (o: Partial<Ask>): Ask => ({ id: 1, kind: 'show', tmdb_id: '1', name: 'Frieren', state: 'approved', state_label: '', asked_by: { id: 2, name: 'Jake' }, asked_at: '2026-11-02T10:00:00Z', people: [], auto_approved: false, mine: false, ...o }) as Ask;

describe('season rings', () => {
	it('fill as episodes arrive', () => {
		expect(seasonRing(season({}))).toMatchObject({ name: 'Season 1', words: '10 of 10', percent: 100, tone: 'mint' });
		expect(seasonRing(season({ number: 2, in_library: 6, downloading: 1, missing: 4 }))).toMatchObject({ words: '6 of 10 · 1 coming in', percent: 60, tone: 'sky' });
		expect(seasonRing(season({ in_library: 4, missing: 6 })).tone).toBe('pink');
		expect(seasonRing(season({ aired: 0, in_library: 0, not_out_yet: 8, episodes: 8 }))).toMatchObject({ words: '8 episodes, not out yet', tone: 'faint', percent: 0 });
	});
	it('put Specials last, only when some are kept', () => {
		expect(seasonRings(show([season({ number: 0, in_library: 0 }), season({ number: 1 })])).map((r) => r.name)).toEqual(['Season 1']);
		const rings = seasonRings(show([season({ number: 0, episodes: 4, aired: 4, in_library: 2, missing: 2 }), season({ number: 1 })]));
		expect(rings.map((r) => r.name)).toEqual(['Season 1', 'Specials']);
		expect(rings[1].tone).toBe('amber');
	});
	it('focus the season that is moving', () => {
		expect(focusSeason(show([season({ number: 1 }), season({ number: 2, in_library: 6, downloading: 1 }), season({ number: 3, aired: 0, in_library: 0 })]))).toBe(2);
		expect(focusSeason(show([season({ number: 1, in_library: 3 }), season({ number: 2 })]))).toBe(1);
		expect(focusSeason(show([season({ number: 1 }), season({ number: 2 }), season({ number: 3, aired: 0, in_library: 0 })]))).toBe(2);
		expect(focusSeason(null)).toBeNull();
	});
});

describe('episode strip', () => {
	const now = new Date('2026-11-22T15:00:00');
	it('names each episode state', () => {
		expect(episodeCard(ep(5, 'in_library', { name: 'The Priest' }), now)).toMatchObject({ name: 'E5 The Priest', state: 'here', words: 'Here' });
		expect(episodeCard(ep(7, 'downloading'), now)).toMatchObject({ state: 'coming', words: 'Coming in' });
		expect(episodeCard(ep(8, 'not_out_yet', { air_date: '2026-11-28' }), now)).toMatchObject({ state: 'later', words: 'Out Saturday' });
		expect(episodeCard(ep(9, 'not_out_yet', { air_date: '2026-12-06' }), now).words).toBe('Out Dec 6');
		expect(episodeCard(ep(3, 'wanted'), now).state).toBe('missing');
		expect(episodeCard(ep(3, 'wanted', { keep_up_to_date: false }), now).state).toBe('skipped');
	});
	it('says when', () => {
		expect(outWords('2026-11-22', now)).toBe('Out today');
		expect(outWords('2026-11-23', now)).toBe('Out tomorrow');
		expect(outWords(undefined, now)).toBe('Not out yet');
	});
	it('sums up and keeps what is next in view', () => {
		const eps = [...Array.from({ length: 10 }, (_, i) => ep(i + 1, 'in_library')), ep(11, 'downloading'), ep(12, 'not_out_yet', { air_date: '2026-11-29' })];
		const s = episodeStrip(eps, now, 6);
		expect(s.summary).toBe('10 here · 1 coming in · 1 not out yet');
		expect(s.cards.map((c) => c.number)).toEqual([7, 8, 9, 10, 11, 12]);
		expect(episodeStrip(eps.slice(0, 3), now, 6).cards).toHaveLength(3);
	});
});

describe('how it got here', () => {
	it('tells the story of an asked-for show', () => {
		const steps = storySteps({
			kind: 'show',
			asks: [ask({ decided_by: { id: 1, name: 'Ben' }, decided_at: '2026-11-02T11:00:00Z', available_at: '2026-11-03T09:00:00Z' })],
			events: [ev('download_sent', '2026-11-03T08:00:00Z'), ev('download_finished', '2026-11-03T08:06:00Z'), ev('import_done', '2026-11-03T08:07:00Z')],
			onDisk: true,
			resolution: '1080p',
			sizeEach: 1.4e9,
			me: 'ben'
		});
		expect(steps.map((s) => [s.name, s.sub, s.done])).toEqual([
			['Asked', 'Jake · Nov 2', true],
			['Approved', 'Ben · Nov 2', true],
			['Found', '1080p · Nov 3', true],
			['Downloaded', '1.4 GB · 6 min', true],
			['On Glowfin', 'Nov 3 · Jake was told', true]
		]);
	});
	it('shows what is still to come', () => {
		const steps = storySteps({ kind: 'movie', asks: [ask({ state: 'asked', asked_by: { id: 1, name: 'Ben' } })], onDisk: false, me: 'Ben' });
		expect(steps.map((s) => [s.name, s.sub, s.done])).toEqual([
			['Asked', 'You · Nov 2', true],
			['Approved', 'Waiting for a yes', false],
			['Found', 'Looking for a good copy', false],
			['Downloaded', 'Not yet', false],
			['On Glowfin', 'Not yet', false]
		]);
		const moving = storySteps({ kind: 'movie', onDisk: false, moving: true, progress: 0.48, addedAt: '2026-11-20T10:00:00Z' });
		expect(moving.find((s) => s.key === 'downloaded')?.sub).toBe('Coming in · 48%');
		expect(moving[0]).toMatchObject({ name: 'Added', done: true });
	});
	it('skips the download for a title found on Tower', () => {
		const steps = storySteps({ kind: 'movie', events: [ev('adopted', '2026-10-01T10:00:00Z')], onDisk: true });
		expect(steps.map((s) => [s.name, s.sub])).toEqual([
			['Added', 'Found on Tower · Oct 1'],
			['On Glowfin', 'Oct 1']
		]);
	});
	it('says how long', () => {
		expect(howLong('2026-11-03T08:00:00Z', '2026-11-03T10:10:00Z')).toBe('2 hr 10 min');
		expect(howLong('2026-11-01T08:00:00Z', '2026-11-04T08:00:00Z')).toBe('3 days');
		expect(howLong(undefined, '2026-11-04T08:00:00Z')).toBe('');
	});
});

describe('what you have', () => {
	it('puts the files in plain words', () => {
		const lines = fileLines({ files: 24, resolution: '1080p', size_total: 33.6e9, size_each: 1.4e9, audio: ['jpn', 'eng'], channels: '2.0', subtitles: ['eng'], forced: true, video_codec: 'hevc' }, 'show');
		expect(lines.map((l) => [l.label, l.value])).toEqual([
			['Picture', '1080p, sharp'],
			['Size', '1.4 GB per episode, 33.6 GB in all'],
			['Sound', 'Japanese and English, stereo'],
			['Subtitles', 'English, plus signs-only']
		]);
		const movie = fileLines({ files: 1, resolution: '2160p', hdr: 'dv', size_total: 22e9, size_each: 22e9, audio: ['en'], channels: '5.1', subtitles: [] }, 'movie');
		expect(movie.map((l) => l.value)).toEqual(['4K, very sharp with Dolby Vision', '22.0 GB', 'English, surround', 'None']);
		expect(fileLines({ files: 0, size_total: 0, size_each: 0, audio: [], subtitles: [] }, 'movie')).toEqual([]);
		expect(fileLines({ files: 3, resolution: '720p', mixed: true, size_total: 3e9, size_each: 1e9, audio: [], subtitles: [] }, 'show')[0].value).toBe('Mostly 720p, good');
	});
	it('names languages and lists', () => {
		expect(languageName('jpn')).toBe('Japanese');
		expect(languageName('en')).toBe('English');
		expect(languageName('und')).toBe('');
		expect(andList(['English', 'Japanese', 'French', 'German'])).toBe('English, Japanese and 2 more');
		expect(fileHeadline({ files: 24, size_total: 1, size_each: 1, audio: [], subtitles: [] }, 'show')).toBe('24 episodes on Tower');
	});
});
