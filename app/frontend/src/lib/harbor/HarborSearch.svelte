<!-- Harbor's one search (design harbor-10 screen 3; build list part 3):
     press the search pill or Ctrl K anywhere and a glass panel opens.
     Results come in groups, each with its own button: Yours (Open), Not
     yours yet (+ Get, which follows your quality rules and never asks),
     People, Manga (Open in Manga) and Settings (Open setting). A typo such
     as "fireen" still finds Frieren and says "Did you mean Frieren?". The
     Ask bar's commands ("pause downloads", "why is one piece missing?")
     work here too. Enter opens the highlighted row; Esc closes. -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import Icon from '#lib/ui/Icon.svelte';
	import { api } from '#lib/core/api.ts';
	import { to } from '#lib/core/paths.ts';
	import { session } from '#lib/core/session.svelte.ts';
	import { sized } from '#lib/core/tmdb-image.ts';
	import { toasts } from '#lib/core/toasts.svelte.ts';
	import type { Ask } from '#lib/core/types.ts';
	import { suggestHref, subline, type SuggestAnswer, type SuggestRow } from '#lib/discover/index.ts';
	import { ask, askStory, bestMatch, EXAMPLES, JUMPS } from './ask-bar.ts';
	import { didYouMean, foundTag, jumpsFor, norm, splitFound } from './explore.ts';
	import { getKey, getting, gotten, harborGet, mayGet } from './get.svelte.ts';
	import { hitLine, type MangaSearch, type MangaView } from './manga.ts';
	import { closeSearch, harborSearch } from './search.svelte.ts';

	let dialog = $state<HTMLDialogElement>();
	let input = $state<HTMLInputElement>();
	let answer = $state<SuggestAnswer | null>(null);
	let fixed = $state<{ to: string; answer: SuggestAnswer | null } | null>(null);
	let looking = $state(false);
	let manga = $state<MangaSearch | null>(null);
	let mangaOn = $state(false);
	let story = $state<{ name: string; says: string; href: string } | null>(null);
	let active = $state(0);
	let names: string[] = [];
	let namesRead = false;

	const term = $derived(harborSearch.term);
	const cmd = $derived(ask(term));
	const words = $derived(cmd && (cmd.kind === 'get' || cmd.kind === 'why') ? cmd.q : term.trim());

	$effect(() => {
		if (!dialog) return;
		if (harborSearch.open && !dialog.open) {
			dialog.showModal();
			input?.focus();
			input?.select();
			void readNames();
			if (session.can('manage_library')) api.get<MangaView>('/harbor/manga').then((v) => (mangaOn = !!(v.on && v.engine)), () => (mangaOn = false));
		} else if (!harborSearch.open && dialog.open) dialog.close();
	});

	/** The names Harbor knows (your shelves), for "Did you mean?". Read once. */
	async function readNames() {
		if (namesRead) return;
		namesRead = true;
		try {
			names = (await api.get<{ names: string[] | null }>('/harbor/names')).names ?? [];
		} catch {
			namesRead = false;
		}
	}

	const suggest = (q: string, signal: AbortSignal) => api.get<SuggestAnswer>(`/search/suggest?q=${encodeURIComponent(q)}`, signal);

	// Titles: 180 ms after the last key. A typo with nothing matching also looks up the name it was probably meant to be.
	$effect(() => {
		const q = words;
		answer = null;
		fixed = null;
		active = 0;
		if ([...q].length < 2) return void (looking = false);
		looking = true;
		const ctl = new AbortController();
		const wait = setTimeout(async () => {
			try {
				const a = await suggest(q, ctl.signal);
				answer = a;
				const direct = a.items.some((r) => norm(r.name).includes(norm(q)));
				const guess = direct ? null : didYouMean(q, [...names, ...a.items.map((r) => r.name), ...a.completions]);
				if (guess) {
					fixed = { to: guess, answer: null };
					const b = await suggest(guess, ctl.signal);
					if (fixed?.to === guess) fixed = { to: guess, answer: b };
				}
			} catch {
				// Nothing found; the panel says so.
			} finally {
				if (!ctl.signal.aborted) looking = false;
			}
		}, 180);
		return () => {
			clearTimeout(wait);
			ctl.abort();
		};
	});

	// Manga: after a longer pause, because it asks every manga site.
	$effect(() => {
		const q = words;
		manga = null;
		if (!mangaOn || q.length < 3) return;
		const wait = setTimeout(() => {
			api.get<MangaSearch>(`/harbor/manga/search?q=${encodeURIComponent(q)}`).then((r) => words === q && (manga = r), () => {});
		}, 1200);
		return () => clearTimeout(wait);
	});

	// "why is one piece missing?": the request's story.
	let asks: Ask[] | null = null;
	$effect(() => {
		story = null;
		if (cmd?.kind !== 'why') return;
		const q = cmd.q;
		(asks ? Promise.resolve(asks) : api.get<{ asks: Ask[] }>('/asks').then((r) => (asks = r.asks ?? [])))
			.then((list) => {
				const a = bestMatch(list, q);
				story = a ? { name: a.name, says: askStory(a), href: to(`/requests?ask=${a.id}`) } : { name: `No request for “${q}” yet`, says: 'Nobody has asked for it, so Harbor is not looking for it.', href: '' };
			})
			.catch(() => {});
	});

	type Act = { label: string; run: () => void; go?: boolean; busy?: boolean };
	interface Line { key: string; group: string; name: string; sub: string; art?: string; round?: boolean; icon?: string; href?: string; act?: Act; tag?: string }

	function go(href: string) {
		closeSearch();
		void goto(href);
	}
	function command(): Line[] {
		if (!cmd) return [];
		const manager = session.can('manage_library');
		if (cmd.kind === 'go') return [{ key: 'cmd', group: 'Answers', name: `Open ${cmd.label}`, sub: 'Jump straight there', icon: 'chevronRight', act: { label: 'Open', go: true, run: () => go(to(cmd.href)) } }];
		if (cmd.kind === 'pause' || cmd.kind === 'resume') {
			const pause = cmd.kind === 'pause';
			if (!manager) return [{ key: 'cmd', group: 'Answers', name: 'Only people who look after downloads can do that', sub: '', icon: 'info' }];
			const run = async () => {
				closeSearch();
				try {
					await api.post(pause ? '/downloads/pause-all' : '/downloads/resume-all');
					toasts.push(pause ? 'Paused every download' : 'Started every download again', 'ok', pause ? { body: 'Type “resume downloads” in search to start them again.' } : {});
				} catch (e) {
					toasts.push(pause ? 'Could not pause the downloads' : 'Could not start the downloads', 'fail', { body: e instanceof Error ? e.message : String(e) });
				}
			};
			return [{ key: 'cmd', group: 'Answers', name: pause ? 'Pause every download' : 'Start every download again', sub: pause ? 'Handy on game night' : '', icon: pause ? 'pause' : 'play', act: { label: pause ? 'Pause' : 'Start', go: true, run } }];
		}
		if (cmd.kind === 'why' && story) return [{ key: 'cmd', group: 'Answers', name: story.name, sub: story.says, icon: 'requests', ...(story.href ? { act: { label: 'Open request', go: true, run: () => go(story!.href) } } : {}) }];
		return [];
	}
	function titleLine(r: SuggestRow, group: string): Line {
		const href = suggestHref(r);
		const tmdb = r.tmdb ?? '';
		const k = r.kind === 'movie' || r.kind === 'show' ? r.kind : null;
		const got = k && tmdb ? gotten.get(getKey(k, tmdb)) : undefined;
		const line: Line = { key: `${group}-${r.kind}-${r.title_id ?? r.tmdb ?? r.mbid ?? r.person_id ?? r.name}`, group, name: r.name, sub: subline(r), art: r.art, round: r.kind === 'artist' || r.kind === 'person', href };
		if (group === 'Yours' || group === 'People') return { ...line, act: { label: 'Open', go: group === 'Yours', run: () => go(href) } };
		const tag = got?.titleId ? 'On your shelves' : got?.ask === 'approved' ? 'Getting it' : got?.ask ? 'Asked' : foundTag(r);
		if (k && tmdb && !tag && mayGet()) return { ...line, act: { label: '+ Get', run: () => void harborGet(k, tmdb, r.name), busy: getting(k, tmdb) } };
		return { ...line, tag, act: { label: 'Open', run: () => go(href) } };
	}
	const shown = $derived(fixed?.answer && fixed.answer.items.length ? fixed.answer : answer);
	const lines = $derived.by<Line[]>(() => {
		const out: Line[] = [...command()];
		const s = splitFound(shown?.items ?? []);
		out.push(...s.yours.slice(0, 4).map((r) => titleLine(r, 'Yours')));
		out.push(...s.notYet.slice(0, 5).map((r) => titleLine(r, 'Not yours yet')));
		out.push(...s.people.slice(0, 2).map((r) => titleLine(r, 'People')));
		for (const h of manga?.hits.slice(0, 3) ?? []) {
			const href = to(`/library/manga?q=${encodeURIComponent(h.title)}`);
			out.push({ key: `manga-${h.key}`, group: 'Manga', name: h.title, sub: `${hitLine(h)}${h.official ? ' Official release.' : ''}`, art: h.cover ? to(h.cover) : undefined, href, act: { label: 'Open in Manga', run: () => go(href) } });
		}
		for (const j of jumpsFor(words, JUMPS)) {
			const href = to(j.href);
			out.push({ key: `set-${j.href}`, group: j.href.startsWith('/settings') ? 'Settings' : 'Places', name: j.label.replace(/^Settings › /, ''), sub: j.href.startsWith('/settings') ? 'A setting' : 'A place in Harbor', icon: j.href.startsWith('/settings') ? 'settings' : 'compass', href, act: { label: j.href.startsWith('/settings') ? 'Open setting' : 'Open', run: () => go(href) } });
		}
		return out;
	});
	const groups = $derived(lines.reduce<{ name: string; lines: (Line & { i: number })[] }[]>((acc, l, i) => {
		const g = acc.find((x) => x.name === l.group) ?? (acc.push({ name: l.group, lines: [] }), acc[acc.length - 1]);
		g.lines.push({ ...l, i });
		return acc;
	}, []));
	const everything = $derived(words ? to(`/search?q=${encodeURIComponent(fixed?.answer?.items.length ? fixed.to : words)}`) : to('/search'));

	function keyed(e: KeyboardEvent) {
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			if (!lines.length) return;
			active = (active + (e.key === 'ArrowDown' ? 1 : -1) + lines.length) % lines.length;
			document.getElementById(`hs-${active}`)?.scrollIntoView({ block: 'nearest' });
		} else if (e.key === 'Enter') {
			e.preventDefault();
			const l = lines[active];
			if (l?.act) l.act.run();
			else if (words) go(everything);
		}
	}
	function closed() {
		harborSearch.open = false;
	}
	const fix = (to: string) => {
		harborSearch.term = to;
		input?.focus();
	};
</script>

<dialog bind:this={dialog} class="harbor-search" aria-label="Search everything" onclose={closed} onclick={(e) => e.target === dialog && closeSearch()} data-testid="harbor-search">
	<div class="hs-panel">
		<div class="hs-field">
			<Icon name="search" size={22} />
			<input bind:this={input} type="search" bind:value={harborSearch.term} onkeydown={keyed} placeholder="Search everything, or type what you want done" autocomplete="off" spellcheck="false" enterkeyhint="search" aria-label="Search everything" aria-controls="hs-list" aria-activedescendant={lines.length ? `hs-${active}` : undefined} data-testid="harbor-search-box" />
			<button type="button" class="hs-esc" onclick={closeSearch} aria-label="Close search"><kbd>Esc</kbd></button>
		</div>
		<div class="hs-body" id="hs-list" role="listbox" aria-label="Results">
			{#if fixed}
				<p class="hs-dym" data-testid="harbor-dym">Did you mean <button type="button" onclick={() => fix(fixed!.to)}>{fixed.to}</button>?{#if fixed.answer?.items.length}{" "}Showing those.{/if}</p>
			{/if}
			{#if !words}
				<span class="hs-lbl">Things you can type</span>
				{#each EXAMPLES as x (x.text)}
					<button type="button" class="hs-hint" onclick={() => fix(x.text)}><code>› {x.text}</code><span>{x.does}</span></button>
				{/each}
			{:else}
				{#each groups as g (g.name)}
					<span class="hs-lbl">{g.name}</span>
					{#each g.lines as l (l.key)}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<div class="hs-hit" class:on={l.i === active} id="hs-{l.i}" role="option" tabindex="-1" aria-selected={l.i === active} onpointerenter={() => (active = l.i)} onclick={(e) => { if (!(e.target as Element).closest('button, a')) l.act?.run(); }}>
							{#if l.icon}
								<span class="hs-ic" aria-hidden="true"><Icon name={l.icon as 'search'} size={20} /></span>
							{:else}
								<span class="hs-art" class:round={l.round} aria-hidden="true">{#if l.art}<img src={sized(l.art, 'poster', 96)} alt="" loading="lazy" />{:else}{l.name.slice(0, 1)}{/if}</span>
							{/if}
							<span class="hs-words"><b>{l.name}</b>{#if l.sub}<span>{l.sub}</span>{/if}</span>
							{#if l.tag}<span class="hs-tag">{l.tag}</span>{/if}
							{#if l.act}
								<button type="button" class="hs-btn" class:go={l.act.go} class:get={l.act.label === '+ Get'} aria-busy={l.act.busy || undefined} tabindex="-1" onclick={() => l.act!.run()}>{l.act.label}</button>
							{/if}
						</div>
					{/each}
				{:else}
					<p class="hs-none">{looking ? 'Looking…' : `Nothing found for “${words}”.`}</p>
				{/each}
				<a class="hs-all" href={everything} onclick={closeSearch}>See every result<Icon name="chevronRight" size={14} /></a>
			{/if}
		</div>
	</div>
</dialog>

<style>
	.harbor-search { width: min(820px, calc(100vw - 24px)); max-width: none; max-height: calc(100dvh - 120px); margin: 70px auto auto; padding: 0; border: 1px solid var(--harbor-edge); border-radius: 26px; background: color-mix(in srgb, var(--surface-1) 88%, transparent); -webkit-backdrop-filter: blur(28px) saturate(150%); backdrop-filter: blur(28px) saturate(150%); color: var(--text); box-shadow: 0 40px 90px rgb(0 0 0 / 55%); overflow: hidden; }
	.harbor-search::backdrop { background: rgb(2 5 10 / 55%); -webkit-backdrop-filter: blur(6px) brightness(0.7); backdrop-filter: blur(6px) brightness(0.7); }
	.harbor-search[open] { animation: hs-in 180ms ease-out; }
	@keyframes hs-in { from { opacity: 0; transform: translateY(-8px) scale(0.98); } }
	.hs-panel { display: grid; grid-template-rows: auto 1fr; max-height: inherit; }
	.hs-field { display: flex; align-items: center; gap: 12px; padding: 18px 22px; border-bottom: 1px solid var(--harbor-edge); color: var(--text-muted); }
	.hs-field input { flex: 1; min-width: 0; border: 0; background: none; color: var(--text); font: 600 22px/1.3 var(--font-display); caret-color: var(--harbor-pink); }
	.hs-field input:focus, .hs-field input:focus-visible { outline: none; box-shadow: none; }
	.hs-field input { padding: 0; height: auto; border-radius: 0; box-shadow: none; }
	.hs-field input::-webkit-search-cancel-button { display: none; }
	.hs-esc { padding: 0; border: 0; background: none; cursor: pointer; }
	kbd { display: inline-block; padding: 3px 8px; border: 1px solid var(--harbor-edge); border-radius: 6px; font: 600 12px/1.2 var(--font-ui); color: var(--text-muted); }
	.hs-body { display: grid; align-content: start; gap: 2px; padding: 10px 14px 16px; overflow-y: auto; overscroll-behavior: contain; }
	.hs-lbl { margin: 12px 8px 6px; font: 800 11px/1 var(--font-ui); letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-faint); }
	.hs-dym { margin: 8px 8px 0; font: 600 15px/1.4 var(--font-ui); color: var(--text-muted); }
	.hs-dym button { padding: 0; border: 0; background: none; font: inherit; font-weight: 800; color: var(--harbor-pink); cursor: pointer; }
	.hs-hit { display: flex; align-items: center; gap: 14px; padding: 8px; border-radius: 16px; cursor: pointer; }
	.hs-hit.on { background: var(--harbor-glass-2); }
	.hs-art, .hs-ic { display: grid; flex: none; place-items: center; width: 44px; height: 64px; overflow: hidden; border-radius: 10px; background: var(--harbor-glass-2); font: 700 18px/1 var(--font-display); color: var(--text-muted); }
	.hs-ic { height: 44px; border-radius: 12px; }
	.hs-art.round { height: 44px; border-radius: 50%; }
	.hs-art img { width: 100%; height: 100%; object-fit: cover; }
	.hs-words { display: grid; gap: 2px; flex: 1; min-width: 0; }
	.hs-words b { font: 700 15px/1.3 var(--font-ui); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.hs-words span { font: 500 13px/1.35 var(--font-ui); color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; }
	.hs-tag { flex: none; padding: 4px 10px; border-radius: 99px; background: var(--harbor-glass-2); font: 700 12px/1 var(--font-ui); color: var(--text-muted); }
	.hs-btn { flex: none; height: 34px; padding: 0 16px; border: 1px solid var(--harbor-edge); border-radius: 99px; background: var(--harbor-glass-2); color: var(--text); font: 700 13px/1 var(--font-ui); cursor: pointer; white-space: nowrap; }
	.hs-btn.go { border: 0; background: var(--harbor-grad); color: #fff; box-shadow: 0 6px 18px rgb(255 95 162 / 30%); }
	.hs-btn.get { border: 0; background: #fff; color: #0b1220; }
	.hs-btn[aria-busy='true'] { opacity: 0.6; cursor: progress; }
	.hs-hint { display: flex; justify-content: space-between; gap: 12px; padding: 8px; border: 0; border-radius: 12px; background: none; font: 500 13px/1.3 var(--font-ui); color: var(--text-muted); text-align: start; cursor: pointer; }
	.hs-hint:hover { background: var(--harbor-glass-2); }
	.hs-hint code { font: 600 14px/1.3 var(--font-ui); color: var(--text); }
	.hs-none { margin: 14px 8px; font: 500 14px/1.4 var(--font-ui); color: var(--text-muted); }
	.hs-all { display: inline-flex; align-items: center; gap: 4px; justify-self: start; margin: 12px 8px 0; font: 700 13px/1 var(--font-ui); color: var(--accent-text); text-decoration: none; }
	@media (max-width: 767px) {
		.harbor-search { width: 100vw; max-height: 100dvh; height: 100dvh; margin: 0; border: 0; border-radius: 0; }
		.hs-field input { font-size: 18px; }
		.hs-hint span { display: none; }
		.hs-btn { padding: 0 12px; }
	}
	@media (prefers-reduced-motion: reduce) { .harbor-search[open] { animation: none; } }
</style>
