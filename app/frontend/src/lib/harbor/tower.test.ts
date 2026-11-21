import { describe, expect, it } from 'vitest';
import type { ScheduleRow, StatusRow } from '#lib/health/index.ts';
import { ago, downloadSummary, findOldName, healthSentence, inWords, jobLines, lookAt, ruleBlocks, towerMap, towerTab, type RuleWord } from './tower.ts';

const row = (p: Partial<StatusRow>): StatusRow => ({ group: 'sources', key: 'k', name: 'Part', tone: 'ok', word: 'Working', reason: '', ...p });
const now = Date.parse('2026-11-20T16:00:00Z');

describe('towerTab', () => {
	it('falls back to Health for anything unknown', () => {
		expect(towerTab('jobs')).toBe('jobs');
		expect(towerTab('nope')).toBe('health');
		expect(towerTab(null)).toBe('health');
	});
});

describe('towerMap', () => {
	it('counts search sites together and names the slow one', () => {
		const rows = [row({ key: 'link:source:1', name: 'A' }), row({ key: 'link:source:2', name: '1337x', tone: 'fail', word: 'Broken' }), row({ key: 'link:source:3', name: 'Off one', tone: 'idle', word: 'Off' })];
		const sites = towerMap(rows).find((n) => n.id === 'sources')!;
		expect(sites.line).toBe('1 of 2 working · 1337x is broken');
		expect(sites.tone).toBe('fail');
		expect(sites.href).toBe('/settings/sources');
	});
	it('gives each downloader and media server its own box', () => {
		const rows = [
			row({ group: 'downloaders', key: 'link:downloader:1', name: 'qBittorrent', fix: '/settings/downloaders' }),
			row({ group: 'media', key: 'link:media_server:1', name: 'Jellyfin', fix: '/settings/media-servers' })
		];
		const map = towerMap(rows);
		expect(map.find((n) => n.name === 'qBittorrent')).toMatchObject({ side: 'right', tone: 'ok', line: 'Working' });
		expect(map.find((n) => n.name === 'Jellyfin')).toMatchObject({ side: 'left', href: '/settings/media-servers' });
	});
	it('still shows the boxes a fresh install needs, as not set up', () => {
		const map = towerMap([]);
		expect(map.map((n) => [n.name, n.tone])).toEqual([
			['Media servers', 'idle'],
			['Downloaders', 'idle'],
			['Search sites', 'idle']
		]);
	});
	it('puts broken things first in the list to look at', () => {
		const rows = [row({ key: 'a', tone: 'wait' }), row({ key: 'b', tone: 'fail' }), row({ key: 'c' })];
		expect(lookAt(rows).map((r) => r.key)).toEqual(['b', 'a']);
		expect(healthSentence(rows)).toBe('2 things to look at.');
		expect(healthSentence([row({})])).toBe('Every line is working.');
	});
});

describe('jobs', () => {
	const job = (p: Partial<ScheduleRow>): ScheduleRow => ({ kind: 'k', label: 'Job', about: '', every_s: 900, min_s: 60, max_s: 86400, step_s: 60, enabled: true, state: 'waiting', part: 'core', ...p });
	it('says times in plain words', () => {
		expect(ago('2026-11-20T15:55:00Z', now)).toBe('5 minutes ago');
		expect(ago('0001-01-01T00:00:00Z', now)).toBe('Not yet');
		expect(inWords('2026-11-20T16:15:00Z', now)).toBe('In 15 minutes');
		expect(inWords('2026-11-21T16:00:00Z', now)).toBe('In 1 day');
	});
	it('lists running jobs first, then the next to run, then the ones that are off', () => {
		const lines = jobLines(
			[
				job({ kind: 'off', label: 'Off job', enabled: false }),
				job({ kind: 'later', label: 'Later', next_run: '2026-11-20T18:00:00Z' }),
				job({ kind: 'run', label: 'Running', state: 'running' }),
				job({ kind: 'soon', label: 'Soon', next_run: '2026-11-20T16:15:00Z', last_job: 'failed', last_job_error: 'No sites answered' })
			],
			now
		);
		expect(lines.map((l) => l.kind)).toEqual(['run', 'soon', 'later', 'off']);
		expect(lines[0]).toMatchObject({ next: 'Running now', canRun: false });
		expect(lines[1]).toMatchObject({ tone: 'fail', note: 'No sites answered', canRun: true });
		expect(lines[3]).toMatchObject({ next: 'Off', canRun: false, note: 'Switched off' });
	});
});

describe('downloadSummary', () => {
	const d = (id: number, phase: string, progress = 0) => ({ id, phase, progress, title: `T${id}`, name: `n${id}` });
	it('writes one sentence for what is going on', () => {
		const s = downloadSummary([d(1, 'downloading', 0.6), d(2, 'stalled', 0.2), d(3, 'importing'), d(4, 'needs_a_decision')]);
		expect(s.sentence).toBe('2 coming in and 1 being checked. 1 needs your choice.');
		expect(s.top.map((t) => [t.name, t.line])).toEqual([
			['T1', '60%'],
			['T2', 'Stuck at 20%']
		]);
	});
	it('says so when nothing is downloading or everything is paused', () => {
		expect(downloadSummary([]).sentence).toBe('Nothing is downloading right now.');
		expect(downloadSummary([d(1, 'paused', 0.1)]).sentence).toBe('1 coming in. Everything is paused.');
	});
});

describe('ruleBlocks', () => {
	const words = (parts: (string | RuleWord)[]) => parts.map((p) => (typeof p === 'string' ? p : `[${p.word}]`)).join('');
	it('writes the safety settings as a sentence with changeable words', () => {
		const [b] = ruleBlocks({ downloaders: { stalled_after_hours: 6, stalled_act_hours: 24, remove_failed: true, fail_dangerous: true, replace_vanished: true, grab_spacing_seconds: 0, try_next_downloader: true, remove_delete_files: true, remove_turn_down: true, remove_search_again: true }, files: { holding_days: 7 } });
		expect(b.title).toBe('Safety and tidying');
		expect(words(b.parts)).toBe('[Never take] files with programs hidden inside. Call a download stuck after [6 hours] with no progress, and swap it for another copy after [24 hours]. [Clear away] downloads that failed. Keep deleted files for [7 days] so they can be brought back.');
		const stuck = b.parts.find((p): p is RuleWord => typeof p !== 'string' && p.edit?.key === 'stuckHours')!;
		expect(stuck.edit).toMatchObject({ kind: 'number', value: 6, min: 1, max: 24 });
	});
	it('names the pick rules and marks switched-off words', () => {
		const [b] = ruleBlocks({
			rules: [{ id: 1, name: 'HD 1080p', kinds: ['movie', 'show'], preset: true }, { id: 2, name: 'Anime', kinds: ['show'], preset: false }],
			defaults: { movie: { library_folder_id: 1, pick_rules_id: 1, keep_up_to_date: false, search_on_add: true }, show: { library_folder_id: 2, pick_rules_id: 2, keep_up_to_date: true, search_on_add: true } },
			gate: { release_gate: 'released', gate_delay_days: 0, bulk_search_respects_gate: true }
		});
		expect(words(b.parts)).toBe('Pick movie copies by the [HD 1080p] rule and show copies by the [Anime] rule. Start looking for a movie once it is [out to watch at home], after waiting [0 days]. [Stop looking] for a better copy after the first one lands.');
		const off = b.parts.filter((p): p is RuleWord => typeof p !== 'string' && !!p.off).map((p) => p.word);
		expect(off).toEqual(['0 days', 'Stop looking']);
		const movie = b.parts.find((p): p is RuleWord => typeof p !== 'string' && p.edit?.key === 'movieRules')!;
		expect(movie.edit).toMatchObject({ kind: 'choice', options: [['1', 'HD 1080p']] });
	});
	it('lists subtitle languages and leaves out blocks it could not read', () => {
		const blocks = ruleBlocks({ subtitles: { languages: [{ language: 'en', forced: false }, { language: 'es', forced: true }], better: true, better_days: 7 }, langName: (c) => ({ en: 'English', es: 'Spanish' })[c] ?? c });
		expect(blocks.map((b) => b.id)).toEqual(['subtitles']);
		expect(words(blocks[0].parts)).toBe('Find subtitles in [English] and [Spanish (signs only)]. [Keep looking for 7 days] for a better match once one is found.');
	});
});

describe('findOldName', () => {
	it('finds a setting by the old app’s words', () => {
		expect(findOldName('delay profile')[0]).toMatchObject({ now: 'Rules › “after waiting … days”' });
		expect(findOldName('bazarr forced')[0].href).toBe('/settings/subtitles');
		expect(findOldName('')).toEqual([]);
		expect(findOldName('zzz')).toEqual([]);
	});
});
