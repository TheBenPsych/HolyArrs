// Harbor's Ask bar: the one search box also takes plain commands and
// questions. ask() reads what was typed and says what Harbor can do with it;
// plain titles fall through to HolyArrs's own search, unchanged.
// Design: harbor-5-from-scratch, screen 5.

export type AskCommand =
	| { kind: 'get'; q: string }
	| { kind: 'why'; q: string }
	| { kind: 'pause' }
	| { kind: 'resume' }
	| { kind: 'go'; href: string; label: string };

/** Places and settings you can jump to by name. Several words can lead to one place. */
export const JUMPS: { words: string[]; href: string; label: string }[] = [
	{ words: ['today', 'home'], href: '/', label: 'Today' },
	{ words: ['board'], href: '/board', label: 'the Board' },
	{ words: ['explore', 'popular', 'trending'], href: '/explore', label: 'Explore' },
	{ words: ['shelves', 'library'], href: '/library', label: 'Shelves' },
	{ words: ['tower', 'status'], href: '/health', label: 'Tower' },
	{ words: ['calendar', 'coming up', 'tonight'], href: '/calendar', label: 'the Calendar' },
	{ words: ['requests'], href: '/requests', label: 'Requests' },
	{ words: ['downloads', 'queue'], href: '/downloads', label: 'Downloads' },
	{ words: ['history'], href: '/downloads/history', label: 'History' },
	{ words: ['settings'], href: '/settings', label: 'Settings' },
	{ words: ['subtitles', 'subs'], href: '/settings/subtitles', label: 'Settings › Subtitles' },
	{ words: ['sites', 'sources', 'indexers'], href: '/settings/sources', label: 'Settings › Sources' },
	{ words: ['downloaders', 'qbittorrent', 'torrent client'], href: '/settings/downloaders', label: 'Settings › Downloaders' },
	{ words: ['quality', 'pick rules', 'profiles'], href: '/settings/pick-rules', label: 'Settings › Pick rules' },
	{ words: ['folders', 'library folders', 'root folders'], href: '/settings/library-folders', label: 'Settings › Library folders' },
	{ words: ['naming', 'rename'], href: '/settings/naming', label: 'Settings › Naming' },
	{ words: ['users', 'family'], href: '/settings/users', label: 'Settings › Users' },
	{ words: ['jellyfin', 'media servers', 'plex'], href: '/settings/media-servers', label: 'Settings › Media servers' },
	{ words: ['backups', 'backup'], href: '/settings/backups', label: 'Settings › Backups' },
	{ words: ['schedules', 'jobs'], href: '/settings/schedules', label: 'Settings › Schedules' },
	{ words: ['remote access', 'remote'], href: '/settings/remote-access', label: 'Settings › Remote access' },
	{ words: ['appearance', 'theme', 'dark mode', 'light mode'], href: '/settings/appearance', label: 'Settings › Appearance' },
	{ words: ['logs'], href: '/settings/logs', label: 'Settings › Logs' },
	{ words: ['music settings'], href: '/settings/music', label: 'Settings › Music' },
	{ words: ['request settings', 'auto approve', 'auto-approve'], href: '/settings/requests', label: 'Settings › Requests' }
];

const clean = (s: string) => s.trim().replace(/\s+/g, ' ');
const strip = (s: string) => clean(s.replace(/[?.!]+$/, ''));

/** ask reads the box and returns a command, or null when it is a plain search. */
export function ask(typed: string): AskCommand | null {
	const t = clean(typed);
	const low = t.toLowerCase();
	if (!low) return null;
	if (/^(pause|stop|hold)( all)?( the)? downloads?\b/.test(low)) return { kind: 'pause' };
	if (/^(resume|restart|unpause|start)( all)?( the)? downloads?\b/.test(low)) return { kind: 'resume' };
	let m = /^(?:get|ask for|request|download|add) (.+)$/i.exec(t);
	if (m && strip(m[1])) return { kind: 'get', q: strip(m[1]) };
	m = /^(?:why is|why's|why isn't|where is|where's|what happened to|status of|how is|how's) (.+?)(?: missing| not here| not on glowfin| not there| stuck| doing)?\s*\??$/i.exec(t);
	if (m && strip(m[1])) return { kind: 'why', q: strip(m[1]) };
	const word = strip(low);
	for (const j of JUMPS) if (j.words.includes(word)) return { kind: 'go', href: j.href, label: j.label };
	return null;
}

/** EXAMPLES are the "Things you can type" hints shown under the box. */
export const EXAMPLES: { text: string; does: string }[] = [
	{ text: 'get dune part three', does: 'Finds it so you can ask for it' },
	{ text: 'why is one piece missing?', does: 'Answers from its request' },
	{ text: 'pause downloads', does: 'Handy on game night' },
	{ text: 'subtitles', does: 'Jumps to that setting' }
];

/** bestMatch finds the request whose name fits the words best: exact, then starts with, then contains. */
export function bestMatch<T extends { name: string }>(list: T[], q: string): T | undefined {
	const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();
	const want = norm(q.replace(/\b(season|s)\s*\d+\b.*$/i, '').replace(/\b(episode|ep|e)\s*\d+\b.*$/i, '')) || norm(q);
	if (!want) return undefined;
	return list.find((x) => norm(x.name) === want) ?? list.find((x) => norm(x.name).startsWith(want)) ?? list.find((x) => norm(x.name).includes(want));
}
