import { describe, expect, it } from 'vitest';
import type { Ask, DownloadRow } from '#lib/core/types.ts';
import type { TitleLive } from '#lib/requests/index.ts';
import { askLane, boardCards, byLane, doneBy, doneByLead, doneByTime, etaWords, filterCards, putFirst, speedWords, swipeAnswer, type BoardCard } from './board.ts';

const now = new Date('2026-11-20T16:10:00');
const ask = (o: Partial<Ask>): Ask =>
	({ id: 1, kind: 'movie', tmdb_id: '1', name: 'Dune: Part Three', state: 'asked', state_label: '', asked_by: { id: 2, name: 'Mom' }, asked_at: '2026-11-20T15:58:00', people: [], auto_approved: false, mine: false, ...o }) as Ask;
const dl = (o: Partial<DownloadRow>): DownloadRow =>
	({ id: 9, state: '', label: '', text: '', progress: 0.5, speed: 0, active: true, phase: 'downloading', name: 'x', title: 'The Last of Us', version: '', downloader: 'qb', size: 1, updated_at: '', can_act: true, kind: 'show', ...o }) as DownloadRow;

describe('askLane', () => {
	it('follows a request from asked to landed', () => {
		expect(askLane(ask({}), undefined)?.lane).toBe('asked');
		expect(askLane(ask({ state: 'approved', title_id: 5 }), undefined)?.lane).toBe('looking');
		const down: TitleLive = { download: { phase: 'downloading', progress: 0.63 } };
		expect(askLane(ask({ state: 'approved', title_id: 5 }), down)).toMatchObject({ lane: 'coming', line: '63%', progress: 0.63 });
		expect(askLane(ask({ state: 'approved', title_id: 5 }), { download: { phase: 'importing', progress: 1 } })?.lane).toBe('inspection');
		expect(askLane(ask({ state: 'available', title_id: 5 }), undefined)?.lane).toBe('landed');
		expect(askLane(ask({ state: 'turned_down' }), undefined)).toBeNull();
	});
	it('marks trouble with a reason', () => {
		const failed = askLane(ask({ state: 'approved', title_id: 5 }), { download: { phase: 'failed', progress: 0, reason: 'no progress for 6 hours.' } });
		expect(failed).toMatchObject({ lane: 'looking', trouble: 'no progress for 6 hours.' });
		expect(askLane(ask({ state: 'approved' }), undefined)?.trouble).toBeTruthy();
	});
});

describe('boardCards', () => {
	it('adds downloads nobody asked for as "By itself" and skips ones that belong to a request', () => {
		const cards = boardCards({
			asks: [ask({ id: 1, state: 'approved', title_id: 5 })],
			live: new Map([[5, { download: { phase: 'downloading', progress: 0.2 } }]]),
			downloads: [dl({ id: 1, title_id: 5 }), dl({ id: 2, title_id: 7, eta: 240, progress: 0.63 })],
			now
		});
		expect(cards.map((c) => [c.key, c.lane, c.byItself])).toEqual([
			['dl-2', 'coming', true],
			['ask-1', 'coming', false]
		]);
		expect(cards[0].eta).toBe(240);
	});
	it('keeps landed cards for three days only', () => {
		const cards = boardCards({
			asks: [ask({ id: 1, state: 'available', available_at: '2026-11-20T15:00:00' }), ask({ id: 2, state: 'available', available_at: '2026-11-10T15:00:00' })],
			live: new Map(),
			downloads: [],
			now
		});
		expect(cards.map((c) => c.key)).toEqual(['ask-1']);
	});
	it('puts trouble first in its lane', () => {
		const cards = boardCards({
			asks: [ask({ id: 1, state: 'approved', title_id: 5 }), ask({ id: 2, state: 'approved', title_id: 6, problem: 'Only fakes so far' })],
			live: new Map(),
			downloads: [],
			now
		});
		expect(cards[0].key).toBe('ask-2');
	});
});

describe('filters and lanes', () => {
	const cards = boardCards({ asks: [ask({ id: 1 }), ask({ id: 2, kind: 'show', state: 'approved', title_id: 3 })], live: new Map(), downloads: [dl({ id: 4, title_id: 8 })], now });
	it('filters by who and by kind', () => {
		expect(filterCards(cards, 'itself').map((c) => c.key)).toEqual(['dl-4']);
		expect(filterCards(cards, 'people').length).toBe(2);
		expect(filterCards(cards, 'show').map((c) => c.key)).toEqual(['ask-2', 'dl-4']);
	});
	it('groups by lane', () => {
		const l = byLane(cards);
		expect(l.asked.length).toBe(1);
		expect(l.looking.length).toBe(1);
		expect(l.coming.length).toBe(1);
	});
	it('says time left plainly', () => {
		expect(etaWords(30)).toBe('under a minute');
		expect(etaWords(240)).toBe('4 min');
		expect(etaWords(7200)).toBe('2 hr');
		expect(etaWords(86400)).toBe('1 day');
	});
});

describe('All done by', () => {
	const card = (o: Partial<BoardCard>): BoardCard => ({ key: 'k', lane: 'coming', name: 'x', kind: 'show', who: '', line: '', byItself: true, href: '/downloads', ...o });
	it('uses the bytes left over the speed of everything together, rounded up to five minutes', () => {
		const MB = 1024 ** 2;
		const d = doneBy([card({ key: 'a', size: 1000 * MB, progress: 0.5, speed: 2 * MB }), card({ key: 'b', size: 1000 * MB, progress: 0.9, speed: 1 * MB }), card({ key: 'c', lane: 'landed' })], now);
		// 600 MB left at 3 MB/s = 200 s from 16:10 -> 16:13:20 -> 16:15.
		expect(d).toMatchObject({ count: 2, speed: 3 * MB });
		expect(d!.at!.getHours()).toBe(16);
		expect(d!.at!.getMinutes()).toBe(15);
		expect(d!.progress).toBeCloseTo(0.7);
	});
	it('never says sooner than the slowest download says itself', () => {
		const d = doneBy([card({ size: 10, progress: 0.5, speed: 1000, eta: 3600 })], now);
		expect(d!.at!.getHours()).toBe(17);
		expect(d!.at!.getMinutes()).toBe(10);
	});
	it('has no time when nothing is moving, and nothing at all when nothing is coming in', () => {
		expect(doneBy([card({ progress: 0.2 })], now)).toMatchObject({ count: 1, at: null });
		expect(doneBy([card({ lane: 'asked' })], now)).toBeNull();
	});
	it('says the day when it is not today', () => {
		expect(doneByTime(new Date('2026-11-20T21:40:00'), now)).not.toMatch(/tomorrow/);
		expect(doneByTime(new Date('2026-11-21T07:15:00'), now)).toMatch(/^tomorrow /);
		expect(doneByLead(1)).toBe('Done by about');
		expect(doneByLead(7)).toBe('All 7 done by about');
	});
	it('says speeds plainly', () => {
		expect(speedWords(38 * 1024 ** 2)).toBe('38 MB/s');
		expect(speedWords(1.5 * 1024 ** 2)).toBe('1.5 MB/s');
		expect(speedWords(640 * 1024)).toBe('640 KB/s');
	});
});

describe('Do this first and swipe', () => {
	const c = (key: string, first?: boolean) => ({ key, first }) as BoardCard;
	it('moves the cards asked to go first to the front, keeping the rest in order', () => {
		expect(putFirst([c('a'), c('b'), c('c', true), c('d')], new Set(['b'])).map((x) => x.key)).toEqual(['b', 'c', 'a', 'd']);
	});
	it('reads a swipe far enough right as yes and left as no', () => {
		expect(swipeAnswer(150, 360)).toBe('yes');
		expect(swipeAnswer(-150, 360)).toBe('no');
		expect(swipeAnswer(60, 360)).toBeNull();
		expect(swipeAnswer(85, 200)).toBe('yes');
	});
	it('gives a request card its download speed and place in line', () => {
		const cards = boardCards({
			asks: [ask({ id: 1, state: 'approved', title_id: 5 })],
			live: new Map([[5, { download: { phase: 'downloading', progress: 0.2, id: 3 } }]]),
			downloads: [],
			rows: [dl({ id: 3, title_id: 5, speed: 2048, size: 4096, eta: 90, queue_pos: 1 })],
			now
		});
		expect(cards[0]).toMatchObject({ lane: 'coming', downloadId: 3, speed: 2048, size: 4096, eta: 90, first: true, canAct: true });
	});
});
