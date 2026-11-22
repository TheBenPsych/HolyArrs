import { describe, expect, it } from 'vitest';
import type { ScheduleRow, StatusRow } from '#lib/health/index.ts';
import { changeLine, clock, labelRows, cpuWords, dayLine, diskUse, everyWords, graphArea, graphPath, keep, nextUp, orbOf, settingsGroups, sizeWords, weekDots, weekWords, whenWords } from './tower-bold.ts';

const row = (p: Partial<StatusRow>): StatusRow => ({ group: 'sources', key: 'k', name: 'Part', tone: 'ok', word: 'Working', reason: '', ...p });

describe('orbOf', () => {
	it('glows mint when all is well', () => {
		const o = orbOf([row({})]);
		expect(o).toMatchObject({ tone: 'ok', count: 0, headline: 'Tower is all good' });
	});
	it('glows amber and names the slow one', () => {
		const o = orbOf([row({}), row({ key: 'x', name: '1337x', tone: 'wait', word: 'Retrying', reason: 'Takes over 20 seconds to answer.' })]);
		expect(o.tone).toBe('wait');
		expect(o.headline).toBe('Tower is nearly perfect');
		expect(o.line).toBe('1337x is retrying: takes over 20 seconds to answer. Everything else is working.');
		expect(o.label).toBe('thing to look at');
	});
	it('glows red when something is broken', () => {
		const o = orbOf([row({ tone: 'fail', word: 'Broken', name: 'qBittorrent' }), row({ key: 'y', tone: 'wait', word: 'Slow' })]);
		expect(o).toMatchObject({ tone: 'fail', count: 2, headline: 'Something is broken' });
		expect(o.line).toContain('And 1 more thing to look at.');
	});
	it('waits when nothing is linked', () => {
		expect(orbOf([]).tone).toBe('idle');
	});
});

describe('weekDots', () => {
	const week = { days: ['1', '2', '3', '4', '5', '6', '7'], keys: { a: ['', '', 'ok', 'ok', 'fail', 'ok', 'ok'], b: ['', '', 'ok', 'wait', 'ok', 'ok', 'ok'] } };
	it('shows the worst of a tile’s rows each day, and today live', () => {
		expect(weekDots(['a', 'b'], week, 'wait')).toEqual(['none', 'none', 'ok', 'wait', 'fail', 'ok', 'wait']);
	});
	it('is all empty but today before anything was noted', () => {
		expect(weekDots(['z'], null, 'ok')).toEqual(['none', 'none', 'none', 'none', 'none', 'none', 'ok']);
	});
	it('says how the week went', () => {
		expect(weekWords(['none', 'none', 'none', 'none', 'none', 'none', 'ok'])).toBe('Started keeping track today');
		expect(weekWords(['ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok'])).toBe('Fine all week');
		expect(weekWords(['none', 'none', 'ok', 'ok', 'ok', 'ok', 'ok'])).toBe('Fine for 5 days');
		expect(weekWords(['ok', 'fail', 'ok', 'wait', 'ok', 'ok', 'ok'])).toBe('Trouble on 2 days');
	});
});

describe('graphs', () => {
	it('keeps the last readings only', () => {
		expect(keep([1, 2, 3], 4, 3)).toEqual([2, 3, 4]);
	});
	it('draws a line ending at the right edge', () => {
		const d = graphPath([0, 50, 100], 200, 70, 100, 3);
		expect(d.startsWith('M0.0 68.0')).toBe(true);
		expect(d.endsWith('200.0 4.0')).toBe(true);
		expect(graphArea(d, 200, 70).endsWith('L200 70 L0.0 70 Z')).toBe(true);
		expect(graphPath([], 200, 70, 100)).toBe('');
	});
	it('says how busy the processor is', () => {
		expect(cpuWords(-1)).toBe('Cannot read it here');
		expect(cpuWords(5)).toBe('Resting');
		expect(cpuWords(90)).toBe('Flat out');
	});
	it('counts each disk once', () => {
		const u = diskUse([{ free_bytes: 8e12, total_bytes: 32e12 }, { free_bytes: 8e12, total_bytes: 32e12 }, { free_bytes: -1, total_bytes: -1 }])!;
		expect(u).toMatchObject({ total: 32e12, free: 8e12, percent: 75 });
		expect(sizeWords(8.2e12)).toBe('8.2 TB');
		expect(sizeWords(640e9)).toBe('640 GB');
		expect(diskUse([])).toBeNull();
	});
});

describe('dayLine', () => {
	const at = (h: number, m = 0) => new Date(2026, 10, 22, h, m).getTime();
	const iso = (ms: number) => new Date(ms).toISOString();
	const sch = (p: Partial<ScheduleRow>): ScheduleRow => ({ kind: 'k', label: 'Job', about: '', every_s: 86400, min_s: 60, max_s: 86400, step_s: 60, enabled: true, state: 'waiting', part: 'core', ...p });
	const now = at(14, 10);
	it('lays out what ran, what runs and what repeats all day', () => {
		const line = dayLine(
			[
				sch({ kind: 'backup', label: 'Backup', last_run: iso(at(3)), next_run: iso(at(27)) }),
				sch({ kind: 'manga', label: 'Manga check', every_s: 12 * 3600, last_run: iso(at(6)), next_run: iso(at(18)) }),
				sch({ kind: 'rss', label: 'Feed check', every_s: 900, next_run: iso(at(14, 15)) }),
				sch({ kind: 'off', label: 'Off job', enabled: false, next_run: iso(at(16)) }),
				sch({ kind: 'sweep', label: 'Missing sweep', every_s: 6 * 3600, state: 'running' })
			],
			now
		);
		expect(line.points.map((p) => `${p.name}@${p.time}:${p.state}`)).toEqual(['Backup@3 AM:done', 'Manga check@6 AM:done', 'Missing sweep@Now:now', 'Manga check@6 PM:next']);
		expect(line.often).toEqual([{ kind: 'rss', name: 'Feed check', every: 'every 15 minutes', state: 'ok' }]);
		expect(line.now).toBeCloseTo((14 * 60 + 10) / 1440, 5);
		expect(nextUp(line)?.name).toBe('Manga check');
	});
	it('draws a few runs ahead of an hourly job, no more', () => {
		const line = dayLine([sch({ kind: 'h', label: 'Hourly', every_s: 3600, next_run: iso(at(15)) })], now);
		expect(line.points.map((p) => p.time)).toEqual(['3 PM', '4 PM', '5 PM', '6 PM']);
	});
	it('marks a failed run red', () => {
		const line = dayLine([sch({ last_run: iso(at(2)), last_job: 'failed' })], now);
		expect(line.points[0].state).toBe('fail');
	});
	it('says times and gaps plainly', () => {
		expect(clock(at(0))).toBe('12 AM');
		expect(clock(at(18, 30))).toBe('6:30 PM');
		expect(everyWords(300)).toBe('every 5 minutes');
		expect(everyWords(7200)).toBe('every 2 hours');
		expect(everyWords(86400)).toBe('every day');
	});
});

describe('settingsGroups', () => {
	const s = (href: string) => ({ href });
	it('puts pages into the six groups, and unknown pages into Upkeep', () => {
		const g = settingsGroups([s('/settings/sources'), s('/settings/downloaders'), s('/settings/new-thing'), s('/settings/account'), s('/settings/backups')]);
		expect(g.map((x) => x.group.label)).toEqual(['How it finds things', 'Downloading', 'Upkeep']);
		expect(g[2].items.map((i) => i.href)).toEqual(['/settings/backups', '/settings/new-thing']);
	});
});

describe('What changed lately', () => {
	it('says each change in plain words', () => {
		expect(changeLine({ Kind: 'settings_changed', Summary: '', actor_name: 'Ben', Data: { area: 'sources', action: 'changed', name: '1337x' } })).toBe('Ben changed search site “1337x”');
		expect(changeLine({ Kind: 'settings_changed', Summary: '', actor_name: 'Ben', Data: { area: 'downloaders', action: 'deleted', name: 'qBit' } })).toBe('Ben removed downloader “qBit”');
		expect(changeLine({ Kind: 'settings_changed', Summary: '', actor_name: 'Ben', Data: { area: 'release-gate', action: 'changed' } })).toBe('Ben changed the release gate settings');
		expect(changeLine({ Kind: 'secrets_imported', Summary: '', actor_name: '' })).toBe('Harbor brought in keys from the old apps');
		expect(changeLine({ Kind: 'setting_changed', Summary: 'Theme set to dark', actor_name: 'Ben' })).toBe('Theme set to dark');
	});
	it('says when', () => {
		const now = new Date(2026, 10, 22, 14, 0).getTime();
		expect(whenWords(new Date(2026, 10, 22, 10, 12).toISOString(), now)).toBe('Today 10:12 AM');
		expect(whenWords(new Date(2026, 10, 21, 4, 8).toISOString(), now)).toBe('Yesterday 4:08 AM');
		expect(whenWords(new Date(2026, 10, 2, 4, 8).toISOString(), now)).toBe('Nov 2');
	});
});

describe('labelRows', () => {
	it('puts close names above and below in turn, and drops a third', () => {
		expect(labelRows([0.08, 0.12, 0.17, 0.2, 0.5])).toEqual(['up', 'down', 'none', 'up', 'up']);
	});
});
