import { describe, expect, it } from 'vitest';
import { gotLine, hitLine, leftCount, leftGroups, queueLine, searchLine, seriesLine, type MangaShelfItem } from './manga.ts';

const s: MangaShelfItem = {
	series: 'The Eminence in Shadow', folder: '/manga/The Eminence in Shadow', chapters: 95, added: 95, removed: 0, sources: ['MangaFire'], official: 0, first: '1', last: '94',
	left_out: [
		{ name: 'unofficial_Ch. 0 - please delete.cbz', source: 'MangaFire', why: 'A notice from the site, not a chapter' },
		{ name: 'unofficial_Ch. 10.1.cbz', source: 'MangaFire', why: 'A part of chapter 10, which is here as one whole chapter' },
		{ name: 'unofficial_Ch. 10.2.cbz', source: 'MangaFire', why: 'A part of chapter 10, which is here as one whole chapter' }
	]
};

describe('manga shelf words', () => {
	it('says a series in one sentence', () => {
		expect(seriesLine(s)).toBe('95 chapters, 1 to 94, from MangaFire.');
		expect(seriesLine({ ...s, chapters: 1, first: '1', last: '1', sources: ['MangaDex', 'VIZ'], official: 1 })).toBe('1 chapter, from MangaDex and VIZ. All official.');
		expect(seriesLine({ ...s, chapters: 0 })).toBe('No chapters on the shelf yet.');
	});
	it('groups what was left out by reason', () => {
		const g = leftGroups(s);
		expect(g[0]).toEqual({ why: 'Parts of a chapter that is here as one whole chapter', names: ['unofficial_Ch. 10.1', 'unofficial_Ch. 10.2'] });
		expect(g[1].names).toEqual(['unofficial_Ch. 0 - please delete']);
		expect(leftCount(s)).toBe('3 files left out');
		expect(leftCount({ ...s, left_out: [] })).toBe('');
	});
	it('says what a search and a Get did', () => {
		expect(hitLine({ key: 'x', title: 'X', official: true, on: [{ id: 1, title: 'X', site: 'MangaDex' }, { id: 2, title: 'X', site: 'MANGA Plus' }] })).toBe('On MangaDex and MANGA Plus.');
		expect(searchLine({ hits: [], sites: 3, failed: ['Broken'] })).toBe('Asked 3 sites. 1 did not answer: Broken.');
		expect(gotLine({ title: 'X', queued: 90, have: 5, total: 95, by_site: { MangaFire: 80, 'MANGA Plus': 10 }, failed: [] })).toBe('Getting 90 chapters of X: 80 from MangaFire and 10 from MANGA Plus. 5 are already here.');
		expect(gotLine({ title: 'X', queued: 0, have: 95, total: 95, by_site: {}, failed: [] })).toBe('X: all 95 chapters are already here.');
		expect(queueLine({ going: true, left: 9, stuck: 0, now: [{ title: 'X', chapter: 'Ch. 2', state: 'DOWNLOADING', progress: 0.5 }] })).toBe('9 chapters in line. Now: X, Ch. 2. About 3 minutes left.');
		expect(queueLine({ going: true, left: 0, stuck: 0, now: [] })).toBe('');
	});
});
