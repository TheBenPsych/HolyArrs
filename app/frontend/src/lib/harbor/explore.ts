// Harbor's Explore and one search (design harbor-10 screens 2 and 3; build
// list part 3). Pure helpers, so they are testable without a browser.

/** The big top picture shows the first five trending titles, eight seconds each. */
export const HERO_MAX = 5;
export const HERO_EVERY = 8000;

export const nextHero = (i: number, n: number): number => (n > 0 ? (i + 1) % n : 0);

export const heroLabel = (i: number): string => `Trending #${i + 1} this week`;

/** The little glowing tag on a poster. */
export type BadgeTone = 'on' | 'coming' | 'asked';
export function badgeOf(status: string | undefined, titleId?: number): { text: string; tone: BadgeTone } | null {
	if (titleId !== undefined || status === 'in_library') return { text: 'On Glowfin', tone: 'on' };
	if (status === 'downloading' || status === 'approved') return { text: 'Coming in', tone: 'coming' };
	if (status === 'requested') return { text: 'Asked', tone: 'asked' };
	return null;
}

/** "2 of 3 owned" for a collection. */
export const ownedLine = (owned: number, total: number): string => `${owned} of ${total} owned`;

const DAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

/** "New on Fridays" from the next episode's air date (YYYY-MM-DD). Empty when unknown. */
export function airLine(airDate: string | undefined): string {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(airDate ?? '');
	if (!m) return '';
	const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
	return `New on ${DAYS[d.getUTCDay()]}`;
}

/** The anime season a date falls in: Winter (Jan to Mar), Spring, Summer, Fall. */
export function seasonName(now: Date): string {
	const s = ['Winter', 'Spring', 'Summer', 'Fall'][Math.floor(now.getMonth() / 3)];
	return `${s} ${now.getFullYear()}`;
}

// ---- One search: "Did you mean?" ----

const NUMBERS: Record<string, string> = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', ii: '2', iii: '3', iv: '4' };

/** Lower case, letters and digits only, number words as digits ("Part Three" and "part 3" read the same). */
export function norm(s: string): string {
	return s
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/&/g, ' and ')
		.replace(/[^\p{L}\p{N} ]+/gu, ' ')
		.split(/\s+/)
		.filter(Boolean)
		.map((w) => NUMBERS[w] ?? w)
		.join(' ');
}

/** Edit distance with swapped neighbours counting as one change ("fireen" is 2 from "frieren"). */
export function distance(a: string, b: string): number {
	if (a === b) return 0;
	const n = a.length;
	const m = b.length;
	if (!n) return m;
	if (!m) return n;
	const d: number[][] = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
	for (let i = 1; i <= n; i++) {
		for (let j = 1; j <= m; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
		}
	}
	return d[n][m];
}

/** How many changes a typo of this length may have. */
const allowed = (len: number): number => (len <= 3 ? 0 : len <= 5 ? 1 : len <= 9 ? 2 : 3);

/**
 * didYouMean finds the name the words were probably meant to be, from the
 * names Harbor knows (your shelves, what search found, places). null when
 * the words already match a name, or nothing is close enough.
 */
export function didYouMean(typed: string, names: string[]): string | null {
	const q = norm(typed);
	if (q.length < 4) return null;
	const words = q.split(' ').length;
	let best: { name: string; d: number; len: number } | null = null;
	for (const name of names) {
		const n = norm(name);
		if (!n) continue;
		if (n.includes(q)) return null;
		// The same number of words from the start: "fireen" against "frieren", not the whole long name.
		const head = n.split(' ').slice(0, words).join(' ');
		const d = Math.min(distance(q, head), distance(q, n));
		if (d === 0 || d > allowed(q.length)) continue;
		if (!best || d < best.d || (d === best.d && n.length < best.len)) best = { name, d, len: n.length };
	}
	return best?.name ?? null;
}

// ---- One search: groups ----

export interface FoundRow {
	kind: string;
	name: string;
	sub?: string;
	art?: string;
	state?: string;
	title_id?: number;
	tmdb?: string;
}

export interface SettingJump {
	words: string[];
	href: string;
	label: string;
}

/** Settings and places whose name or words start with, or hold, what was typed. */
export function jumpsFor(typed: string, jumps: SettingJump[], max = 3): SettingJump[] {
	const q = norm(typed);
	if (q.length < 3) return [];
	const hit = (j: SettingJump) => j.words.some((w) => norm(w).startsWith(q) || q.startsWith(norm(w))) || norm(j.label).includes(q);
	const seen = new Set<string>();
	return jumps.filter((j) => hit(j) && !seen.has(j.href) && seen.add(j.href)).slice(0, max);
}

/** Splits what search found into Yours (on your shelves) and Not yours yet; people go with neither. */
export function splitFound<T extends FoundRow>(items: T[]): { yours: T[]; notYet: T[]; people: T[] } {
	const yours: T[] = [];
	const notYet: T[] = [];
	const people: T[] = [];
	for (const r of items) {
		if (r.kind === 'person') people.push(r);
		else if (r.title_id || r.state === 'have') yours.push(r);
		else notYet.push(r);
	}
	return { yours, notYet, people };
}

/** The short tag for a found row that is not yours yet. */
export function foundTag(r: FoundRow): string {
	if (r.state === 'asked') return 'Asked';
	if (r.state === 'following') return 'Following';
	return '';
}
