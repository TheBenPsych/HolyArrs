// Tower in the bold look (redesign part 7): the glowing orb, the week of
// health dots, the live graphs, today's jobs as a timeline, the six plain
// Settings groups and "What changed lately". Plain logic only, so it is
// testable without a page. Design: harbor-10 screen 7 and harbor-11 ideas
// speedgraph, jobline, uptime and changes.
import type { EventRecord } from '#lib/core/types.ts';
import type { IconName } from '#lib/ui/Icon.svelte';
import type { ScheduleRow, StatusRow } from '#lib/health/index.ts';
import { lookAt, type Tone } from './tower.ts';

// ---------- The orb ----------

export interface Orb {
	tone: Tone;
	/** The big number inside: things to look at (0 shows a tick). */
	count: number;
	/** The words under the number. */
	label: string;
	headline: string;
	line: string;
}

const lower = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);

/** orbOf sums up Tower in one glowing ball: mint all good, amber look at something, red broken. */
export function orbOf(rows: StatusRow[]): Orb {
	const trouble = lookAt(rows);
	const broken = trouble.filter((r) => r.tone === 'fail').length;
	const n = trouble.length;
	if (!rows.length) return { tone: 'idle', count: 0, label: 'nothing linked', headline: 'Tower is waiting', line: 'Nothing is linked to Harbor yet. Add your first connection in Settings.' };
	if (!n) return { tone: 'ok', count: 0, label: 'all good', headline: 'Tower is all good', line: 'Every connection is working.' };
	const first = trouble[0];
	const what = `${first.name} is ${lower(first.word)}${first.reason ? `: ${lower(first.reason).replace(/\.$/, '')}` : ''}.`;
	const rest = n === 1 ? ' Everything else is working.' : ` And ${n - 1} more ${n - 1 === 1 ? 'thing' : 'things'} to look at.`;
	return {
		tone: broken ? 'fail' : 'wait',
		count: n,
		label: n === 1 ? 'thing to look at' : 'things to look at',
		headline: broken ? (broken === 1 ? 'Something is broken' : `${broken} things are broken`) : 'Tower is nearly perfect',
		line: what + rest
	};
}

// ---------- A week of health dots ----------

export interface Week {
	/** The last 7 days, oldest first ("2026-11-22"). */
	days: string[];
	/** Each status row's worst tone per day; "" when nothing was noted that day. */
	keys: Record<string, string[]>;
}

export type Dot = Tone | 'none';

const RANK: Record<string, number> = { idle: 1, ok: 2, wait: 3, fail: 4 };

/** weekDots is one dot per day for a tile: the worst of its rows that day. Today uses the live tone. */
export function weekDots(keys: string[], week: Week | null, today: Tone): Dot[] {
	const n = week?.days.length || 7;
	const out: Dot[] = [];
	for (let i = 0; i < n; i++) {
		let worst = '';
		for (const k of keys) {
			const t = week?.keys[k]?.[i] ?? '';
			if ((RANK[t] ?? 0) > (RANK[worst] ?? 0)) worst = t;
		}
		out.push((worst || 'none') as Dot);
	}
	out[n - 1] = today;
	return out;
}

/** "Mon", "Tue" for a day's dot. */
export function dayName(day: string): string {
	const d = new Date(`${day}T12:00:00`);
	return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { weekday: 'short' });
}

/** The line under a tile's dots: "Fine all week", "Trouble on 2 days". */
export function weekWords(dots: Dot[]): string {
	const seen = dots.filter((d) => d !== 'none');
	if (seen.length <= 1) return 'Started keeping track today';
	const bad = dots.filter((d) => d === 'fail' || d === 'wait').length;
	if (!bad) return seen.length === dots.length ? 'Fine all week' : `Fine for ${seen.length} days`;
	return bad === 1 ? 'Trouble on 1 day' : `Trouble on ${bad} days`;
}

// ---------- The live graphs ----------

export interface Pulse {
	cpu: number;
	down_bps: number;
	up_bps: number;
	downloading: number;
}

/** How many readings a graph keeps (one every 5 seconds: the last 5 minutes). */
export const GRAPH_POINTS = 60;

/** keep adds a reading and drops the oldest past the graph's width. */
export function keep(list: number[], v: number, max = GRAPH_POINTS): number[] {
	const next = [...list, v];
	return next.length > max ? next.slice(next.length - max) : next;
}

/** graphPath draws the readings as a smooth line across w by h; top is the reading at the very top. */
export function graphPath(values: number[], w: number, h: number, top: number, slots = GRAPH_POINTS): string {
	if (!values.length) return '';
	const peak = Math.max(top, ...values, 1);
	const step = w / Math.max(1, slots - 1);
	const start = w - step * (values.length - 1);
	const pts = values.map((v, i) => [start + i * step, h - 2 - (Math.max(0, v) / peak) * (h - 6)] as const);
	if (pts.length === 1) return `M${(w - 1).toFixed(1)} ${pts[0][1].toFixed(1)} L${w} ${pts[0][1].toFixed(1)}`;
	let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
	for (let i = 1; i < pts.length; i++) {
		const [x0, y0] = pts[i - 1];
		const [x1, y1] = pts[i];
		const mx = ((x0 + x1) / 2).toFixed(1);
		d += ` C${mx} ${y0.toFixed(1)} ${mx} ${y1.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
	}
	return d;
}

/** The same line closed along the bottom, for the soft glow under it. */
export function graphArea(line: string, w: number, h: number): string {
	if (!line) return '';
	const x0 = line.slice(1).split(' ')[0];
	return `${line} L${w} ${h} L${x0} ${h} Z`;
}

/** "How busy" words for the processor. */
export function cpuWords(pct: number): string {
	if (pct < 0) return 'Cannot read it here';
	if (pct < 15) return 'Resting';
	if (pct < 45) return 'Ticking along';
	if (pct < 80) return 'Working hard';
	return 'Flat out';
}

export interface DiskUse {
	used: number;
	total: number;
	free: number;
	percent: number;
}

/** diskUse adds up the disks the Library folders sit on, each disk counted once (same size, same free space). */
export function diskUse(disks: { free_bytes: number; total_bytes: number }[]): DiskUse | null {
	const seen = new Set<string>();
	let total = 0;
	let free = 0;
	for (const d of disks) {
		if (d.total_bytes <= 0 || d.free_bytes < 0) continue;
		const k = `${d.total_bytes}:${d.free_bytes}`;
		if (seen.has(k)) continue;
		seen.add(k);
		total += d.total_bytes;
		free += d.free_bytes;
	}
	if (!total) return null;
	return { used: total - free, total, free, percent: Math.round(((total - free) / total) * 100) };
}

/** "8.2 TB", "640 GB". */
export function sizeWords(bytes: number): string {
	const tb = bytes / 1e12;
	if (tb >= 1) return `${tb >= 10 ? Math.round(tb) : tb.toFixed(1)} TB`;
	return `${Math.max(0, Math.round(bytes / 1e9))} GB`;
}

// ---------- Today's jobs as a timeline ----------

export interface DayPoint {
	kind: string;
	name: string;
	/** 0 at midnight, 1 at the next midnight. */
	x: number;
	at: number;
	/** done: already ran today; next: still to come; fail: ran today and failed; now: running. */
	state: 'done' | 'next' | 'fail' | 'now';
	time: string;
}

export interface DayLine {
	points: DayPoint[];
	/** Where "Now" sits, 0 to 1. */
	now: number;
	/** Jobs that run more often than every hour: shown as a list, not dots. */
	often: { kind: string; name: string; every: string; state: 'ok' | 'fail' | 'now' }[];
}

const real = (s?: string | null) => (s && !s.startsWith('0001-') ? Date.parse(s) : NaN);

/** "2 AM", "6:30 PM". */
export function clock(ms: number): string {
	const d = new Date(ms);
	const h = d.getHours();
	const m = d.getMinutes();
	return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "every 5 minutes", "every 2 hours", "every day". */
export function everyWords(sec: number): string {
	if (sec < 3600) {
		const m = Math.max(1, Math.round(sec / 60));
		return m === 1 ? 'every minute' : `every ${m} minutes`;
	}
	if (sec < 86400) {
		const h = Math.round(sec / 3600);
		return h === 1 ? 'every hour' : `every ${h} hours`;
	}
	const d = Math.round(sec / 86400);
	return d === 1 ? 'every day' : `every ${d} days`;
}

/** At most this many future runs of one job are drawn (a job every hour would cover the line). */
const MAX_AHEAD = 4;

/**
 * dayLine lays today's jobs along one line from midnight to midnight: what
 * already ran (its last run, if today), what is running, and what runs next
 * before midnight. Jobs that run more often than every hour would cover the
 * line, so they are listed under it instead.
 */
export function dayLine(schedules: ScheduleRow[], now: number): DayLine {
	const d = new Date(now);
	const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
	const end = start + 86400e3;
	const x = (ms: number) => (ms - start) / (end - start);
	const points: DayPoint[] = [];
	const often: DayLine['often'] = [];
	for (const s of schedules) {
		const off = !s.enabled || s.state === 'off' || s.state === 'part_off' || s.state === 'safe_mode';
		if (off) continue;
		const running = s.state === 'running' || s.state === 'queued';
		const failed = s.last_job === 'failed';
		if (s.every_s > 0 && s.every_s < 3600) {
			often.push({ kind: s.kind, name: s.label, every: everyWords(s.every_s), state: running ? 'now' : failed ? 'fail' : 'ok' });
			continue;
		}
		const last = real(s.last_job_ended || s.last_run);
		if (running) points.push({ kind: s.kind, name: s.label, x: x(now), at: now, state: 'now', time: 'Now' });
		else if (!Number.isNaN(last) && last >= start && last <= now) points.push({ kind: s.kind, name: s.label, x: x(last), at: last, state: failed ? 'fail' : 'done', time: clock(last) });
		let next = real(s.next_run);
		for (let k = 0; k < MAX_AHEAD && !Number.isNaN(next) && next < end; k++) {
			if (next > now) points.push({ kind: s.kind, name: s.label, x: x(next), at: next, state: 'next', time: clock(next) });
			if (!(s.every_s > 0)) break;
			next += s.every_s * 1000;
		}
	}
	points.sort((a, b) => a.at - b.at || a.name.localeCompare(b.name));
	often.sort((a, b) => a.name.localeCompare(b.name));
	return { points, now: x(now), often };
}

/**
 * labelRows says where each dot's name goes on the timeline: above the line,
 * below it, or nowhere (too close to both neighbours; the dot keeps its
 * tooltip). gap is the room one label needs, as a share of the line.
 */
export function labelRows(xs: number[], gap = 0.11): ('up' | 'down' | 'none')[] {
	let up = -Infinity;
	let down = -Infinity;
	return xs.map((x) => {
		if (x - up >= gap) return (up = x), 'up';
		if (x - down >= gap) return (down = x), 'down';
		return 'none';
	});
}

/** The very next job to run, for the line above the timeline. */
export function nextUp(line: DayLine): DayPoint | null {
	return line.points.find((p) => p.state === 'next') ?? null;
}

// ---------- Settings: a search box and six plain groups ----------

export type GroupColour = 'pink' | 'violet' | 'sky' | 'aqua' | 'mint' | 'amber';

export interface SettingsGroup {
	id: string;
	label: string;
	line: string;
	colour: GroupColour;
	icon: IconName;
	/** Settings pages in this group, in this order. */
	pages: string[];
}

export const SETTINGS_GROUPS: SettingsGroup[] = [
	{ id: 'files', label: 'Where files go', line: 'Folders, file names and what each title keeps', colour: 'pink', icon: 'folder', pages: ['/settings/library-folders', '/settings/title-defaults', '/settings/naming', '/settings/music', '/settings/move'] },
	{ id: 'finding', label: 'How it finds things', line: 'Search sites, lists, subtitles and posters', colour: 'violet', icon: 'search', pages: ['/settings/sources', '/settings/search', '/settings/outside-lists', '/settings/subtitles', '/settings/tmdb'] },
	{ id: 'downloading', label: 'Downloading', line: 'Downloaders, quality rules and when jobs run', colour: 'sky', icon: 'download', pages: ['/settings/downloaders', '/settings/pick-rules', '/settings/schedules'] },
	{ id: 'people', label: 'People and sign-in', line: 'Who comes in and what they can ask for', colour: 'aqua', icon: 'people', pages: ['/settings/users', '/settings/requests', '/settings/sign-in', '/settings/appearance'] },
	{ id: 'linked', label: 'Linked apps', line: 'Glowfin, alerts and other apps', colour: 'mint', icon: 'tv', pages: ['/settings/media-servers', '/settings/alerts', '/settings/ai', '/settings/api', '/settings/remote-access'] },
	{ id: 'upkeep', label: 'Upkeep', line: 'Health, backups, logs and the parts of Harbor', colour: 'amber', icon: 'tools', pages: ['/settings/health', '/settings/backups', '/settings/logs', '/settings/this-app', '/settings/parts', '/settings/danger'] }
];

/**
 * settingsGroups puts the pages a person may open into the six groups. A page
 * no group names lands in Upkeep, so nothing is ever lost; My account stays
 * in the account menu. Empty groups are left out.
 */
export function settingsGroups<S extends { href: string }>(sections: S[], groups: SettingsGroup[] = SETTINGS_GROUPS): { group: SettingsGroup; items: S[] }[] {
	const placed = new Set(groups.flatMap((g) => g.pages));
	const out = groups.map((group) => ({
		group,
		items: group.pages.map((h) => sections.find((s) => s.href === h)).filter((s): s is S => !!s)
	}));
	const lost = sections.filter((s) => !placed.has(s.href) && s.href !== '/settings/account');
	if (lost.length) out[out.length - 1].items.push(...lost);
	return out.filter((g) => g.items.length);
}

// ---------- What changed lately ----------

export const CHANGE_KINDS = 'settings_changed,setting_changed,secrets_imported';

const AREAS: Record<string, string> = {
	'pick-rules': 'pick rule',
	'library-folders': 'Library folder',
	downloaders: 'downloader',
	sources: 'search site',
	'outside-lists': 'outside list',
	'own-traits': 'trait',
	'sign-in': 'sign-in'
};

/** changeLine says one settings change in plain words: "Ben turned off search site 1337x". */
export function changeLine(e: Pick<EventRecord, 'Kind' | 'Summary' | 'Data' | 'actor_name'>): string {
	const who = e.actor_name || 'Harbor';
	const data = (e.Data ?? {}) as Record<string, unknown>;
	const area = typeof data.area === 'string' ? data.area : '';
	const action = typeof data.action === 'string' ? data.action : '';
	const name = typeof data.name === 'string' ? data.name : '';
	if (e.Kind === 'secrets_imported') return `${who} brought in keys from the old apps`;
	if (e.Kind === 'settings_changed' && action) {
		const one = AREAS[area];
		if (one && name) return `${who} ${action === 'deleted' ? 'removed' : action} ${one} “${name}”`;
		if (area === 'sign-in') return `${who} changed the sign-in settings`;
		const what = typeof data.what === 'string' ? data.what : area.replace(/-/g, ' ');
		return `${who} ${action} the ${what} settings`;
	}
	return e.Summary || 'A setting changed';
}

/** "Today 10:12 AM", "Yesterday 4:08 AM", "Mon 9 PM", "Nov 2". */
export function whenWords(iso: string, now: number): string {
	const at = Date.parse(iso);
	if (Number.isNaN(at)) return '';
	const d = new Date(at);
	const today = new Date(now);
	const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
	const days = Math.round((startOf(today) - startOf(d)) / 86400e3);
	if (days <= 0) return `Today ${clock(at)}`;
	if (days === 1) return `Yesterday ${clock(at)}`;
	if (days < 7) return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${clock(at)}`;
	return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
