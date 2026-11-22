// Tower: the words and shapes behind Harbor's fifth place. Everything here is
// plain logic over what HolyArrs already reports (status rows, jobs, downloads
// and settings), so it can be tested without a page.
// Design: harbor-5-from-scratch screens 6 and 7, harbor-6-board-round2 screen 6.
import type { DownloadRow, PickRulesView } from '#lib/core/types.ts';
import type { DownloaderSettings } from '#lib/downloads/index.ts';
import type { ScheduleRow, StatusRow } from '#lib/health/index.ts';
import type { GateDefaults, TitleDefaults } from '#lib/mediafiles/index.ts';

export type Tone = 'ok' | 'wait' | 'fail' | 'idle';

export const TOWER_TABS = [
	{ id: 'health', label: 'Health' },
	{ id: 'jobs', label: 'Jobs' },
	{ id: 'downloads', label: 'Downloads' },
	{ id: 'rules', label: 'Rules' },
	{ id: 'shrinker', label: 'Shrinker' }
] as const;
export type TowerTab = (typeof TOWER_TABS)[number]['id'];

export function towerTab(v: string | null | undefined): TowerTab {
	return TOWER_TABS.find((t) => t.id === v)?.id ?? 'health';
}

// ---------- Health: the wiring map ----------

/** One box on the map, joined to Harbor by a line. */
export interface MapNode {
	id: string;
	name: string;
	/** What it is doing, in a few words. */
	line: string;
	tone: Tone;
	/** The page that fixes or adds it. */
	href: string;
	side: 'left' | 'right';
	/** The status rows behind this box, for its week of dots. */
	keys: string[];
}

const worst = (rows: Pick<StatusRow, 'tone'>[]): Tone =>
	rows.some((r) => r.tone === 'fail') ? 'fail' : rows.some((r) => r.tone === 'wait') ? 'wait' : rows.some((r) => r.tone === 'ok') ? 'ok' : 'idle';

const lower = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);

/** Several parts of one kind as a single box: "17 of 18 working · 1337x is broken". */
function together(rows: StatusRow[], none: string): { line: string; tone: Tone } {
	if (!rows.length) return { line: none, tone: 'idle' };
	const on = rows.filter((r) => r.tone !== 'idle');
	if (!on.length) return { line: rows.length === 1 ? 'Switched off' : `All ${rows.length} switched off`, tone: 'idle' };
	const ok = on.filter((r) => r.tone === 'ok').length;
	const bad = on.find((r) => r.tone === 'fail') ?? on.find((r) => r.tone === 'wait');
	if (!bad) return { line: on.length === 1 ? 'Working' : `All ${on.length} working`, tone: 'ok' };
	return { line: `${ok} of ${on.length} working · ${bad.name} is ${lower(bad.word)}`, tone: worst(on) };
}

/** A part shown by its own name: "qBittorrent · Working". */
const single = (r: StatusRow, side: MapNode['side']): MapNode => ({
	id: r.key,
	name: r.name,
	line: r.tone === 'ok' || !r.reason ? r.word : `${r.word} · ${r.reason}`,
	tone: r.tone,
	href: r.fix ?? '/health',
	side,
	keys: [r.key]
});

/**
 * towerMap turns the Status rows into the boxes around Harbor. Downloaders and
 * media servers get a box each (there are only ever a few); search sites,
 * subtitle sites, lists and alerts are counted together.
 */
export function towerMap(rows: StatusRow[]): MapNode[] {
	const of = (g: StatusRow['group']) => rows.filter((r) => r.group === g);
	const nodes: MapNode[] = [];
	const group = (id: string, name: string, g: StatusRow['group'], href: string, none: string, side: MapNode['side'], always = true) => {
		const list = of(g);
		if (!list.length && !always) return;
		nodes.push({ id, name, ...together(list, none), href, side, keys: list.map((r) => r.key) });
	};

	const media = of('media');
	if (media.length && media.length <= 3) for (const r of media) nodes.push(single(r, 'left'));
	else group('media', 'Media servers', 'media', '/settings/media-servers', 'None linked yet', 'left');
	group('subtitles', 'Subtitle sites', 'subtitles', '/settings/subtitles', 'None added yet', 'left', false);
	group('lists', 'Outside lists', 'lists', '/settings/outside-lists', 'None added yet', 'left', false);
	group('alerts', 'Alerts', 'alerts', '/settings/alerts', 'None added yet', 'left', false);
	const meta = of('metadata')[0];
	if (meta) nodes.push({ ...single(meta, 'left'), name: 'Posters and details', href: '/settings/this-app' });

	// A downloader's own row first; folder checks about downloaders ride along in the count.
	const dls = of('downloaders');
	const links = dls.filter((r) => r.key.startsWith('link:') || r.check?.kind === 'downloader');
	if (links.length && links.length <= 3 && links.length === dls.length) for (const r of links) nodes.push(single(r, 'right'));
	else group('downloaders', 'Downloaders', 'downloaders', '/settings/downloaders', 'None linked yet', 'right');
	group('sources', 'Search sites', 'sources', '/settings/sources', 'None added yet', 'right');
	const space = of('library');
	if (space.length) {
		const bad = space.find((r) => r.tone === 'fail') ?? space.find((r) => r.tone === 'wait');
		const free = space.find((r) => r.key.startsWith('disk_space') && r.reason);
		nodes.push({ id: 'space', name: 'Media space', line: bad ? `${bad.name} · ${bad.reason || bad.word}` : free?.reason || 'Folders and backups are fine', tone: worst(space), href: (bad ?? space[0]).fix ?? '/settings/library-folders', side: 'right', keys: space.map((r) => r.key) });
	}
	return nodes;
}

/** The line under HARBOR in the middle of the map. */
export function hubLine(rows: StatusRow[]): string {
	const app = rows.filter((r) => r.group === 'app');
	const bad = app.find((r) => r.tone === 'fail' || r.tone === 'wait');
	if (bad) return bad.reason || `${bad.name}: ${lower(bad.word)}`;
	return app.length ? 'Up to date' : 'Running';
}

/** Broken first, then warnings. Jobs have their own tab but a failed one still counts. */
export function lookAt(rows: StatusRow[]): StatusRow[] {
	return rows.filter((r) => r.tone === 'fail').concat(rows.filter((r) => r.tone === 'wait'));
}

/** The sentence at the top of Health. */
export function healthSentence(rows: StatusRow[]): string {
	const n = lookAt(rows).length;
	if (!rows.length) return 'Harbor has nothing linked yet.';
	if (!n) return 'Every line is working.';
	return n === 1 ? 'One thing to look at.' : `${n} things to look at.`;
}

// ---------- Jobs ----------

export interface JobLine {
	kind: string;
	name: string;
	about: string;
	last: string;
	next: string;
	tone: Tone;
	/** Shown instead of the times when the job is off or failed. */
	note: string;
	running: boolean;
	canRun: boolean;
}

const real = (s?: string | null) => (s && !s.startsWith('0001-') ? Date.parse(s) : NaN);
const count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** "5 minutes ago", "3 hours ago", "2 days ago". */
export function ago(iso: string | null | undefined, now: number): string {
	const at = real(iso);
	if (Number.isNaN(at)) return 'Not yet';
	const sec = Math.max(0, Math.round((now - at) / 1000));
	if (sec < 60) return 'Just now';
	if (sec < 3600) return `${count(Math.round(sec / 60), 'minute')} ago`;
	if (sec < 86400) return `${count(Math.round(sec / 3600), 'hour')} ago`;
	return `${count(Math.round(sec / 86400), 'day')} ago`;
}

/** "In 15 minutes", "In 2 hours", "Any moment". */
export function inWords(iso: string | null | undefined, now: number): string {
	const at = real(iso);
	if (Number.isNaN(at)) return 'When needed';
	const sec = Math.round((at - now) / 1000);
	if (sec <= 30) return 'Any moment';
	if (sec < 3600) return `In ${count(Math.round(sec / 60), 'minute')}`;
	if (sec < 86400) return `In ${count(Math.round(sec / 3600), 'hour')}`;
	return `In ${count(Math.round(sec / 86400), 'day')}`;
}

/** Everything Harbor does by itself, running jobs first, then the next to run. */
export function jobLines(schedules: ScheduleRow[], now: number): JobLine[] {
	const lines = schedules.map((s): JobLine & { at: number } => {
		const off = !s.enabled || s.state === 'off' || s.state === 'part_off' || s.state === 'safe_mode';
		const running = s.state === 'running' || s.state === 'queued';
		const failed = !off && !running && s.last_job === 'failed';
		const next = real(s.next_run);
		return {
			kind: s.kind,
			name: s.label,
			about: s.about,
			last: ago(s.last_job_ended || s.last_run, now),
			next: off ? 'Off' : running ? 'Running now' : inWords(s.next_run, now),
			tone: off ? 'idle' : failed ? 'fail' : 'ok',
			note: failed ? s.last_job_error || 'The last run failed' : !s.enabled ? 'Switched off' : s.state === 'part_off' ? 'Its part of Harbor is switched off' : s.state === 'safe_mode' ? 'Waiting while Harbor is in safe mode' : '',
			running,
			canRun: !off && !running,
			at: running ? -1 : off ? Infinity : Number.isNaN(next) ? Number.MAX_SAFE_INTEGER : next
		};
	});
	return lines.sort((a, b) => a.at - b.at || a.name.localeCompare(b.name)).map(({ at: _at, ...l }) => l);
}

// ---------- Downloads ----------

const COMING = new Set(['waiting', 'downloading', 'stalled', 'paused']);
const CHECKING = new Set(['importing', 'waiting_to_import']);
const NEEDS_YOU = new Set(['needs_a_decision', 'import_refused']);
const FAILED = new Set(['failed', 'vanished']);

export interface DownloadSummary {
	coming: number;
	checking: number;
	needsYou: number;
	failed: number;
	paused: number;
	/** The few furthest along, for the short list. */
	top: { id: number; name: string; progress: number; line: string }[];
	sentence: string;
}

type Dl = Pick<DownloadRow, 'id' | 'phase' | 'title' | 'name' | 'progress'>;

export function downloadSummary(downloads: Dl[]): DownloadSummary {
	const n = (set: Set<string>) => downloads.filter((d) => set.has(d.phase)).length;
	const coming = n(COMING);
	const checking = n(CHECKING);
	const needsYou = n(NEEDS_YOU);
	const failed = n(FAILED);
	const paused = downloads.filter((d) => d.phase === 'paused').length;
	const top = downloads
		.filter((d) => COMING.has(d.phase))
		.sort((a, b) => b.progress - a.progress)
		.slice(0, 5)
		.map((d) => {
			const pct = `${Math.round(d.progress * 100)}%`;
			return { id: d.id, name: d.title || d.name, progress: d.progress, line: d.phase === 'stalled' ? `Stuck at ${pct}` : d.phase === 'paused' ? `Paused at ${pct}` : d.phase === 'waiting' ? 'Waiting its turn' : pct };
		});
	const bits: string[] = [];
	if (coming) bits.push(`${coming} coming in`);
	if (checking) bits.push(`${checking} being checked`);
	let sentence = bits.length ? bits.join(' and ') + '.' : 'Nothing is downloading right now.';
	sentence = sentence[0].toUpperCase() + sentence.slice(1);
	if (needsYou) sentence += ` ${needsYou} ${needsYou === 1 ? 'needs' : 'need'} your choice.`;
	if (failed) sentence += ` ${failed} failed and ${failed === 1 ? 'is' : 'are'} being replaced.`;
	if (coming && paused === coming) sentence += ' Everything is paused.';
	return { coming, checking, needsYou, failed, paused, top, sentence };
}

// ---------- Rules: settings written as sentences ----------

/** How a word is changed right in the sentence. Without one, the word opens its settings page. */
export type WordEdit =
	| { key: RuleKey; kind: 'toggle'; on: boolean }
	| { key: RuleKey; kind: 'number'; value: number; min: number; max: number; unit: string }
	| { key: RuleKey; kind: 'choice'; value: string; options: [string, string][] };

export type RuleKey = 'movieRules' | 'showRules' | 'gate' | 'gateDays' | 'dangerous' | 'stuckHours' | 'swapHours' | 'removeFailed' | 'binDays';

export interface RuleWord {
	word: string;
	/** The HolyArrs page that holds this setting. */
	href: string;
	/** Dashed underline: the rule is switched off. */
	off?: boolean;
	edit?: WordEdit;
}
export type RulePart = string | RuleWord;

export interface RuleBlock {
	id: string;
	title: string;
	parts: RulePart[];
	/** The page with every setting behind this block. */
	more: string;
}

export interface RulesInput {
	rules?: PickRulesView[] | null;
	defaults?: TitleDefaults | null;
	gate?: GateDefaults | null;
	subtitles?: { languages: { language: string; forced: boolean }[]; better: boolean; better_days: number } | null;
	music?: { album_choice: string } | null;
	downloaders?: DownloaderSettings | null;
	files?: { holding_days: number } | null;
	/** Turns "en" into "English". */
	langName?: (code: string) => string;
}

const GATES: [string, string][] = [
	['announced', 'announced'],
	['in_cinemas', 'in cinemas'],
	['released', 'out to watch at home']
];
const ALBUMS: Record<string, string> = { all: 'every album', future: 'only albums still to come', missing: 'the albums with no files yet', none: 'nothing until asked' };

const days = (n: number) => count(n, 'day');
const hours = (n: number) => count(n, 'hour');

function list(parts: RulePart[][]): RulePart[] {
	const out: RulePart[] = [];
	parts.forEach((p, i) => {
		if (i) out.push(i === parts.length - 1 ? ' and ' : ', ');
		out.push(...p);
	});
	return out;
}

/**
 * ruleBlocks writes the everyday settings as sentences. A block is left out
 * when its settings could not be read, so a sentence never shows a guess.
 */
export function ruleBlocks(i: RulesInput): RuleBlock[] {
	const blocks: RuleBlock[] = [];
	const rules = i.rules ?? [];
	const ruleWord = (key: 'movieRules' | 'showRules', kind: string, id: number | undefined): RuleWord => {
		const fits = rules.filter((r) => !r.kinds?.length || r.kinds.includes(kind));
		const name = rules.find((r) => r.id === id)?.name;
		return {
			word: name ?? 'no rule yet',
			off: !name,
			href: '/settings/title-defaults',
			edit: fits.length ? { key, kind: 'choice', value: String(id ?? ''), options: fits.map((r) => [String(r.id), r.name]) } : undefined
		};
	};

	if (i.defaults) {
		const parts: RulePart[] = ['Pick movie copies by the ', ruleWord('movieRules', 'movie', i.defaults.movie?.pick_rules_id), ' rule and show copies by the ', ruleWord('showRules', 'show', i.defaults.show?.pick_rules_id), ' rule.'];
		if (i.gate) {
			const g = GATES.find(([v]) => v === i.gate!.release_gate);
			parts.push(' Start looking for a movie once it is ', { word: g?.[1] ?? i.gate.release_gate, href: '/settings/title-defaults', edit: { key: 'gate', kind: 'choice', value: i.gate.release_gate, options: GATES } }, ', after waiting ', {
				word: days(i.gate.gate_delay_days),
				off: i.gate.gate_delay_days === 0,
				href: '/settings/title-defaults',
				edit: { key: 'gateDays', kind: 'number', value: i.gate.gate_delay_days, min: 0, max: 365, unit: 'days' }
			}, '.');
		}
		const keep = i.defaults.movie?.keep_up_to_date;
		parts.push(' ', { word: keep ? 'Keep looking' : 'Stop looking', off: !keep, href: '/settings/title-defaults' }, ' for a better copy after the first one lands.');
		blocks.push({ id: 'screen', title: 'Movies and shows', parts, more: '/settings/pick-rules' });
	}

	if (i.subtitles) {
		const name = i.langName ?? ((c: string) => c);
		const wants = i.subtitles.languages ?? [];
		const parts: RulePart[] = wants.length
			? ['Find subtitles in ', ...list(wants.map((w): RulePart[] => [{ word: name(w.language) + (w.forced ? ' (signs only)' : ''), href: '/settings/subtitles' }])), '.']
			: [{ word: 'No subtitle languages', off: true, href: '/settings/subtitles' }, ' are chosen yet, so Harbor is not looking for any.'];
		if (wants.length) parts.push(' ', { word: i.subtitles.better ? `Keep looking for ${days(i.subtitles.better_days)}` : 'Stop looking', off: !i.subtitles.better, href: '/settings/subtitles' }, ' for a better match once one is found.');
		blocks.push({ id: 'subtitles', title: 'Subtitles', parts, more: '/settings/subtitles' });
	}

	if (i.music) {
		blocks.push({
			id: 'music',
			title: 'Music',
			parts: ['When an artist is added, get ', { word: ALBUMS[i.music.album_choice] ?? i.music.album_choice, href: '/settings/music' }, '.'],
			more: '/settings/music'
		});
	}

	if (i.downloaders || i.files) {
		const d = i.downloaders;
		const parts: RulePart[] = [];
		if (d) {
			parts.push(
				{ word: d.fail_dangerous ? 'Never take' : 'Allow', off: !d.fail_dangerous, href: '/settings/downloaders', edit: { key: 'dangerous', kind: 'toggle', on: d.fail_dangerous } },
				' files with programs hidden inside. Call a download stuck after ',
				{ word: hours(d.stalled_after_hours), href: '/settings/downloaders', edit: { key: 'stuckHours', kind: 'number', value: d.stalled_after_hours, min: 1, max: Math.min(168, d.stalled_act_hours), unit: 'hours' } },
				' with no progress, and swap it for another copy after ',
				{ word: hours(d.stalled_act_hours), href: '/settings/downloaders', edit: { key: 'swapHours', kind: 'number', value: d.stalled_act_hours, min: Math.max(1, d.stalled_after_hours), max: 720, unit: 'hours' } },
				'. ',
				{ word: d.remove_failed ? 'Clear away' : 'Leave', off: !d.remove_failed, href: '/settings/downloaders', edit: { key: 'removeFailed', kind: 'toggle', on: d.remove_failed } },
				' downloads that failed.'
			);
		}
		if (i.files) {
			const n = i.files.holding_days;
			parts.push(d ? ' ' : '', 'Keep deleted files for ', { word: n > 0 ? days(n) : 'as long as you like', off: n === 0, href: '/settings/naming', edit: { key: 'binDays', kind: 'number', value: n, min: 0, max: 3650, unit: 'days' } }, n > 0 ? ' so they can be brought back.' : ', until you empty the bin yourself.');
		}
		blocks.push({ id: 'safety', title: 'Safety and tidying', parts: parts.filter((p) => p !== ''), more: '/settings/downloaders' });
	}
	return blocks;
}

// ---------- Coming from the old apps ----------

export interface OldName {
	/** What the old app called it. */
	old: string;
	/** Where it lives in Harbor. */
	now: string;
	href: string;
}

export const OLD_NAMES: OldName[] = [
	{ old: 'Sonarr › Settings › Profiles › Quality profiles', now: 'Every setting › Pick rules', href: '/settings/pick-rules' },
	{ old: 'Radarr › Settings › Profiles › Quality profiles', now: 'Every setting › Pick rules', href: '/settings/pick-rules' },
	{ old: 'Radarr › Settings › Custom Formats', now: 'Every setting › Pick rules › points for each trait', href: '/settings/pick-rules' },
	{ old: 'Sonarr › Settings › Profiles › Delay profiles', now: 'Rules › “after waiting … days”', href: '/tower?tab=rules' },
	{ old: 'Radarr › Settings › Profiles › Minimum availability', now: 'Rules › “once it is …”', href: '/tower?tab=rules' },
	{ old: 'Sonarr › Settings › Media Management › Root folders', now: 'Every setting › Library folders', href: '/settings/library-folders' },
	{ old: 'Radarr › Settings › Media Management › Root folders', now: 'Every setting › Library folders', href: '/settings/library-folders' },
	{ old: 'Sonarr › Settings › Media Management › Episode naming', now: 'Every setting › Naming', href: '/settings/naming' },
	{ old: 'Radarr › Settings › Media Management › Movie naming', now: 'Every setting › Naming', href: '/settings/naming' },
	{ old: 'Radarr › Settings › Media Management › Recycle bin', now: 'Rules › “Keep deleted files for …”', href: '/tower?tab=rules' },
	{ old: 'Sonarr › Settings › Download clients', now: 'Every setting › Downloaders', href: '/settings/downloaders' },
	{ old: 'Radarr › Settings › Download clients', now: 'Every setting › Downloaders', href: '/settings/downloaders' },
	{ old: 'Sonarr › Settings › Indexers', now: 'Every setting › Sources', href: '/settings/sources' },
	{ old: 'Prowlarr › Indexers', now: 'Every setting › Sources', href: '/settings/sources' },
	{ old: 'Sonarr › Settings › Import Lists', now: 'Every setting › Outside lists', href: '/settings/outside-lists' },
	{ old: 'Radarr › Settings › Lists', now: 'Every setting › Outside lists', href: '/settings/outside-lists' },
	{ old: 'Sonarr › Settings › Connect', now: 'Every setting › Alerts and Media servers', href: '/settings/alerts' },
	{ old: 'Sonarr › Activity › Queue', now: 'Tower › Downloads', href: '/tower?tab=downloads' },
	{ old: 'Sonarr › Activity › History', now: 'Tower › Downloads › History', href: '/downloads/history' },
	{ old: 'Sonarr › Activity › Blocklist', now: 'Tower › Downloads › Safety checks', href: '/library/turned-down' },
	{ old: 'Sonarr › System › Status', now: 'Tower › Health', href: '/tower' },
	{ old: 'Sonarr › System › Tasks', now: 'Tower › Jobs', href: '/tower?tab=jobs' },
	{ old: 'Sonarr › System › Backup', now: 'Every setting › Backups', href: '/settings/backups' },
	{ old: 'Sonarr › System › Logs', now: 'Every setting › Logs', href: '/settings/logs' },
	{ old: 'Lidarr › Settings › Metadata profiles', now: 'Every setting › Music', href: '/settings/music' },
	{ old: 'Bazarr › Settings › Languages', now: 'Rules › “Find subtitles in …”', href: '/tower?tab=rules' },
	{ old: 'Bazarr › Settings › Languages › Forced', now: 'Every setting › Subtitles › signs only', href: '/settings/subtitles' },
	{ old: 'Bazarr › Settings › Providers', now: 'Every setting › Subtitles › sites', href: '/settings/subtitles' },
	{ old: 'Seerr › Settings › Users', now: 'People', href: '/settings/users' },
	{ old: 'Seerr › Settings › General › Auto-approve', now: 'Every setting › Requests', href: '/settings/requests' },
	{ old: 'Cleanuparr › Malware blocker', now: 'Rules › “Never take files with programs hidden inside”', href: '/tower?tab=rules' },
	{ old: 'Cleanuparr › Queue cleaner › Stalled', now: 'Rules › “Call a download stuck after …”', href: '/tower?tab=rules' },
	{ old: 'Recyclarr › TRaSH Guides sync', now: 'Every setting › Pick rules › TRaSH Guides', href: '/settings/pick-rules' }
];

/** Finds settings by the old app's name for them. Every typed word must appear. */
export function findOldName(q: string, names: OldName[] = OLD_NAMES): OldName[] {
	const words = q.toLowerCase().split(/[\s›>/]+/).filter(Boolean);
	if (!words.length) return [];
	return names.filter((n) => words.every((w) => n.old.toLowerCase().includes(w))).slice(0, 8);
}
