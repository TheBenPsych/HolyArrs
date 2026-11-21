import { describe, expect, it } from 'vitest';
import type { Ask, DownloadRow } from '#lib/core/types.ts';
import type { TitleLive } from '#lib/requests/index.ts';
import { askLane, boardCards, byLane, etaWords, filterCards } from './board.ts';

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
