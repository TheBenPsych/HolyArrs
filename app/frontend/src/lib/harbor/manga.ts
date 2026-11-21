// Harbor's manga shelf: the words for what the librarian did to a series.
// The librarian itself lives in the backend (app/backend/harbor/manga).

export type MangaLeft = { name: string; source: string; why: string };
export type MangaShelfItem = {
	series: string;
	folder: string;
	chapters: number;
	added: number;
	removed: number;
	sources: string[];
	official: number;
	left_out: MangaLeft[];
	first?: string;
	last?: string;
	error?: string;
};
export type MangaFound = { id: number; title: string; cover?: string; site: string };
export type MangaFollowed = { title: string; on: MangaFound[]; since?: string; checked?: string; total?: number; note?: string };
export type MangaView = { on: boolean; library?: string; raw?: string; engine?: string; tidied?: string; error?: string; series: MangaShelfItem[]; following?: MangaFollowed[] };
export type MangaHit = { key: string; title: string; cover?: string; official: boolean; on: MangaFound[] };
export type MangaSearch = { hits: MangaHit[]; sites: number; failed: string[]; skipped?: number };
export type MangaSiteRules = { english_only: boolean; official: 'first' | 'only' | 'any'; off: string[]; order: string[] };
export type MangaSite = { id: string; name: string; lang: string; official: boolean; off: boolean; asked: boolean; why?: string };
export type MangaSites = { rules: MangaSiteRules; sites: MangaSite[] };
export type MangaGot = { title: string; queued: number; have: number; total: number; by_site: Record<string, number>; failed: string[]; error?: string };
export type MangaQueue = { going: boolean; left: number; stuck: number; now: { title: string; chapter: string; state: string; progress: number }[] };

const list = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** One sentence on a series: "98 chapters, 1 to 98, from MangaDex." */
export function seriesLine(s: MangaShelfItem): string {
	if (!s.chapters) return 'No chapters on the shelf yet.';
	const n = `${s.chapters.toLocaleString('en-US')} ${s.chapters === 1 ? 'chapter' : 'chapters'}`;
	const span = s.first && s.last && s.first !== s.last ? `, ${s.first} to ${s.last}` : '';
	const from = s.sources.length ? `, from ${list(s.sources)}` : '';
	const off = s.official === s.chapters ? ' All official.' : s.official ? ` ${s.official.toLocaleString('en-US')} official.` : '';
	return `${n}${span}${from}.${off}`;
}

/** Left-out files grouped by reason, biggest group first. */
export function leftGroups(s: MangaShelfItem): { why: string; names: string[] }[] {
	const m = new Map<string, string[]>();
	for (const l of s.left_out ?? []) {
		// "A part of chapter 10, which..." and "A second copy of chapter 3; ..." each become one group.
		const key = l.why.startsWith('A part of chapter') ? 'Parts of a chapter that is here as one whole chapter' : l.why.startsWith('A second copy') ? 'Second copies of a chapter Harbor already has' : l.why;
		m.set(key, [...(m.get(key) ?? []), l.name.replace(/\.cbz$/i, '')]);
	}
	return [...m.entries()].map(([why, names]) => ({ why, names })).sort((a, b) => b.names.length - a.names.length);
}

/** "3 files left out" or "" when nothing was. */
export function leftCount(s: MangaShelfItem): string {
	const n = s.left_out?.length ?? 0;
	return n ? `${n.toLocaleString('en-US')} ${n === 1 ? 'file' : 'files'} left out` : '';
}

const count = (n: number, one: string, many: string) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/** Where a search hit can come from: "On MangaDex and MANGA Plus." */
export function hitLine(h: MangaHit): string {
	const sites = [...new Set(h.on.map((o) => o.site))];
	return `On ${list(sites)}.`;
}

/** What a search covered: "Asked 6 sites. 1 did not answer: Broken." */
export function searchLine(r: MangaSearch): string {
	if (!r.sites) return r.skipped ? 'Your site rules leave no site to ask. Open Sites and rules below.' : 'No manga sites are switched on in the engine yet.';
	const asked = `Asked ${count(r.sites, 'site', 'sites')}.`;
	return r.failed.length ? `${asked} ${r.failed.length} did not answer: ${r.failed.join(', ')}.` : asked;
}

/** What pressing Get did, in one sentence. */
export function gotLine(g: MangaGot): string {
	if (g.error && !g.total) return `Could not get ${g.title}: ${g.error}`;
	const from = Object.entries(g.by_site ?? {}).sort((a, b) => b[1] - a[1]).map(([site, n]) => `${n.toLocaleString('en-US')} from ${site}`);
	const failed = g.failed?.length ? ` ${list(g.failed)} did not answer.` : '';
	if (g.error) return `Found ${count(g.total, 'chapter', 'chapters')} of ${g.title} but could not start the downloads: ${g.error}`;
	if (!g.queued) return `${g.title}: all ${count(g.total, 'chapter', 'chapters')} are already here.${failed}`;
	const have = g.have ? ` ${count(g.have, 'is', 'are')} already here.` : '';
	return `Getting ${count(g.queued, 'chapter', 'chapters')} of ${g.title}: ${list(from)}.${have}${failed}`;
}

/** The download line in one sentence, or "" when it is empty. */
export function queueLine(q: MangaQueue | null): string {
	if (!q || !q.left) return '';
	const now = q.now[0];
	const doing = now ? ` Now: ${now.title}, ${now.chapter}.` : '';
	const stuck = q.stuck ? ` ${count(q.stuck, 'chapter is', 'chapters are')} stuck; the engine tries them again.` : '';
	const mins = Math.ceil((q.left * 20) / 60);
	const wait = q.going ? ` About ${mins < 90 ? count(mins, 'minute', 'minutes') : count(Math.round(mins / 60), 'hour', 'hours')} left.` : ' The engine is paused.';
	return `${count(q.left, 'chapter', 'chapters')} in line.${doing}${wait}${stuck}`;
}

/** The Sites panel in a few words: "asking 4 of 6, English only, official first". */
export function sitesLine(v: MangaSites): string {
	const asked = v.sites.filter((s) => s.asked).length;
	const mode = v.rules.official === 'only' ? 'official only' : v.rules.official === 'any' ? 'your order' : 'official first';
	return `Asking ${asked.toLocaleString('en-US')} of ${v.sites.length.toLocaleString('en-US')}${v.rules.english_only ? ', English only' : ''}, ${mode}`;
}
