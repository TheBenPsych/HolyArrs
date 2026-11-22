// "Open in Glowfin": where a Library title opens in Glowfin's browser app.
// Harbor asks the server once per title (it finds the title on Jellyfin and
// builds the Glowfin link), then opens it in a new tab.
import { api } from '#lib/core/api.ts';

export type GlowfinLink = { url: string; jellyfin?: string };

const known = new Map<number, GlowfinLink>();

export async function glowfinLink(titleId: number): Promise<GlowfinLink> {
	const had = known.get(titleId);
	if (had) return had;
	const got = await api.get<GlowfinLink>(`/harbor/shelves/glowfin?title=${titleId}`);
	if (got.url) known.set(titleId, got);
	return got;
}

/**
 * openInGlowfin opens the title in Glowfin. The tab is opened at once (so the
 * browser does not block it as a pop-up) and pointed at Glowfin when the
 * answer comes. Says why when it can't.
 */
export async function openInGlowfin(titleId: number): Promise<string | null> {
	const tab = window.open('', '_blank');
	try {
		const l = await glowfinLink(titleId);
		if (!l.url) {
			tab?.close();
			return 'Glowfin does not have this one yet, or Jellyfin is not linked in Settings.';
		}
		if (tab) tab.location.href = l.url;
		else window.location.href = l.url;
		return null;
	} catch {
		tab?.close();
		return 'Could not reach Jellyfin to find this title.';
	}
}
