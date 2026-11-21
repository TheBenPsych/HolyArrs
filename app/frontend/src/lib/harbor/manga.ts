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
export type MangaView = { on: boolean; library?: string; raw?: string; engine?: string; tidied?: string; error?: string; series: MangaShelfItem[] };

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
