import { describe, expect, it } from 'vitest';
import type { CalendarEntry } from '#lib/core/types.ts';
import type { BoardCard } from './board.ts';
import { ago, arrivals, dayLine, greetWord, lineX, nextDay, ringPercent, spaceWords, todayFacts, todaySentence, wayLine, whenWords } from './today.ts';
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

describe('bold Today', () => {
	it('greets by the time of day', () => {
		expect(greetWord(new Date('2026-11-20T08:00:00'))).toBe('Good morning');
		expect(greetWord(new Date('2026-11-20T13:00:00'))).toBe('Good afternoon');
		expect(greetWord(new Date('2026-11-20T21:00:00'))).toBe('Good evening');
	});
	it('says when in plain words', () => {
		expect(whenWords(new Date('2026-11-20T21:00:00'), now)).toMatch(/^Tonight 9/);
		expect(whenWords(new Date('2026-11-20T16:30:00'), now)).toMatch(/^Today 4:30/);
		expect(whenWords(new Date('2026-11-21T10:00:00'), now)).toMatch(/^Tomorrow 10/);
	});
	it('lists the next 24 hours of new episodes, soonest first', () => {
		const e = (o: Partial<CalendarEntry>): CalendarEntry => ({ title_id: 1, name: 'The Bear', kind: 'episode', date: '2026-11-20T21:00:00', season: 4, episode: 4, timed: true, ...o });
		const got = nextDay(
			[
				e({ title_id: 2, name: 'Frieren', date: '2026-11-21T10:00:00', season: 2, episode: 1 }),
				e({}),
				e({ title_id: 3, date: '2026-11-20T12:00:00' }), // already aired
				e({ title_id: 4, date: '2026-11-21T18:00:00' }), // more than 24 hours away
				e({ title_id: 5, state: 'in_library' }),
				e({ title_id: 6, timed: false }),
				e({ title_id: 7, kind: 'digital' })
			],
			now
		);
		expect(got.map((g) => `${g.name} ${g.ep}`)).toEqual(['The Bear S4 E4', 'Frieren S2 E1']);
		expect(got[0].href).toBe('/library/1');
	});
	it('captions On the way', () => {
		expect(wayLine(card({ lane: 'coming', line: '63%', eta: 240 }))).toBe('63% · 4 min');
		expect(wayLine(card({ lane: 'looking' }))).toBe('Looking for a copy');
		expect(wayLine(card({ lane: 'looking', trouble: 'x' }))).toBe('Stuck · looking again');
		expect(ringPercent(card({ lane: 'coming', progress: 0.634 }))).toBe(63);
		expect(ringPercent(card({ lane: 'looking' }))).toBeNull();
		expect(ringPercent(card({ lane: 'inspection' }))).toBe(100);
	});
});
