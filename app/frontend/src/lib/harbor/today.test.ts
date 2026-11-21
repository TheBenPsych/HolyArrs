import { describe, expect, it } from 'vitest';
import type { CalendarEntry } from '#lib/core/types.ts';
import type { BoardCard } from './board.ts';
import { ago, arrivals, dayLine, lineX, spaceWords, todayFacts, todaySentence } from './today.ts';
import { ask, bestMatch } from './ask-bar.ts';

const now = new Date('2026-11-20T16:10:00');
const card = (o: Partial<BoardCard>): BoardCard => ({ key: 'k', lane: 'asked', name: 'x', kind: 'movie', who: '', line: '', byItself: false, href: '/', ...o });
const text = (bits: { text: string }[]) => bits.map((b) => b.text).join('');

describe('todaySentence', () => {
	it('says how things are in one sentence', () => {
		expect(text(todaySentence({ needYou: 3, onTheWay: 5, nextEta: 240, landedToday: 12, trouble: 0 }))).toBe('3 things need you. 5 are on the way, the next lands in 4 min. 12 landed today and nothing is in trouble.');
		expect(text(todaySentence({ needYou: 0, onTheWay: 0, nextEta: null, landedToday: 0, trouble: 1 }))).toBe('Nothing needs you. Nothing is on the way. Nothing has landed yet today and 1 is in trouble.');
		expect(text(todaySentence({ needYou: 1, onTheWay: 1, nextEta: null, landedToday: 1, trouble: 2 }))).toBe('1 thing needs you. 1 is on the way. 1 landed today and 2 are in trouble.');
	});
	it('counts from the Board', () => {
		const f = todayFacts(
			[card({ key: 'a' }), card({ key: 'b', lane: 'coming', eta: 600 }), card({ key: 'c', lane: 'coming', eta: 240 }), card({ key: 'd', lane: 'landed', at: '2026-11-20T09:00:00' }), card({ key: 'e', lane: 'looking', trouble: 'fakes' })],
			now,
			true
		);
		expect(f).toEqual({ needYou: 2, onTheWay: 3, nextEta: 240, landedToday: 1, trouble: 1 });
		expect(todayFacts([card({})], now, false).needYou).toBe(0);
	});
});

describe('arrivals line', () => {
	it('places 6 AM at the start and midnight at the end', () => {
		expect(lineX(new Date('2026-11-20T06:00:00'), now)).toBe(0);
		expect(lineX(new Date('2026-11-20T15:00:00'), now)).toBe(50);
		expect(lineX(new Date('2026-11-20T03:00:00'), now)).toBe(0);
	});
	it('shows landed, downloads due today and tonight\'s episodes, in time order', () => {
		const cal = [
			{ title_id: 1, name: 'The Bear', kind: 'episode', season: 4, episode: 4, date: '2026-11-20T20:00:00', timed: true },
			{ title_id: 2, name: 'Old', kind: 'episode', season: 1, episode: 1, date: '2026-11-20T10:00:00', timed: true }
		] as CalendarEntry[];
		const out = arrivals([card({ key: 'l', lane: 'landed', name: 'Sinners', at: '2026-11-20T09:00:00' }), card({ key: 'c', lane: 'coming', name: 'The Last of Us', eta: 240 })], cal, now);
		expect(out.map((a) => [a.name, a.landed])).toEqual([
			['Sinners', true],
			['The Last of Us', false],
			['The Bear S4E4', false]
		]);
	});
});

describe('little words', () => {
	it('says space, time and the day line', () => {
		expect(spaceWords(8.2e12)).toBe('8.2 TB');
		expect(ago('2026-11-20T15:58:00', now)).toBe('12 minutes ago');
		expect(dayLine(now, 8.2e12, [])).toContain('Tower has 8.2 TB free · every connection is working');
		expect(dayLine(now, null, ['qBittorrent'])).toContain('qBittorrent is not answering');
	});
});

describe('Ask bar', () => {
	it('reads commands and questions', () => {
		expect(ask('pause downloads for 2 hours')).toEqual({ kind: 'pause' });
		expect(ask('resume downloads')).toEqual({ kind: 'resume' });
		expect(ask('get dune part three')).toEqual({ kind: 'get', q: 'dune part three' });
		expect(ask('Why is One Piece missing?')).toEqual({ kind: 'why', q: 'One Piece' });
		expect(ask('subtitles')).toMatchObject({ kind: 'go', href: '/settings/subtitles' });
		expect(ask('board')).toMatchObject({ kind: 'go', href: '/board' });
	});
	it('leaves plain titles to the normal search', () => {
		expect(ask('dune')).toBeNull();
		expect(ask('the getaway')).toBeNull();
		expect(ask('')).toBeNull();
	});
	it('finds the request a question is about', () => {
		const list = [{ name: 'One Piece' }, { name: 'One Punch Man' }, { name: 'Dune: Part Three' }];
		expect(bestMatch(list, 'one piece episode 12')?.name).toBe('One Piece');
		expect(bestMatch(list, 'dune part three')?.name).toBe('Dune: Part Three');
		expect(bestMatch(list, 'frieren')).toBeUndefined();
	});
});
