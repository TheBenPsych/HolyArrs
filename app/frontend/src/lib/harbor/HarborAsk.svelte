<!-- Harbor's Ask bar: wraps HolyArrs's one search box so it also takes plain
     commands ("pause downloads", "get dune") and questions ("why is one piece
     missing?"). A plain title still searches exactly as before. Enter runs
     the command shown in the panel. Design: harbor-5-from-scratch, screen 5. -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Icon from '#lib/ui/Icon.svelte';
	import { api } from '#lib/core/api.ts';
	import { appPath, to } from '#lib/core/paths.ts';
	import { session } from '#lib/core/session.svelte.ts';
	import { toasts } from '#lib/core/toasts.svelte.ts';
	import { searchField } from '#lib/core/search-field.svelte.ts';
	import type { Ask } from '#lib/core/types.ts';
	import { detailPath } from '#lib/metadata/index.ts';
	import { artistHref } from '#lib/music/index.ts';
	import { ask, askStory as story, bestMatch, EXAMPLES } from './ask-bar.ts';

	let { children }: { children: Snippet } = $props();

	let focused = $state(false);
	let typed = $state('');
	const inSettings = $derived(appPath(page.url.pathname).startsWith('/settings'));
	const cmd = $derived(inSettings ? null : ask(typed));

	// What a command will do, worked out as you type (a title lookup or a request's story).
	interface Plan {
		says: string;
		detail?: string;
		enter: string;
		run: () => void | Promise<void>;
	}
	let plan = $state<Plan | null>(null);
	let seq = 0;

	type Row = { kind: string; name: string; sub?: string; title_id?: number; tmdb?: string; mbid?: string };
	function rowHref(r: Row): string {
		if ((r.kind === 'movie' || r.kind === 'show') && r.title_id) return to(`/library/${r.title_id}`);
		if ((r.kind === 'movie' || r.kind === 'show') && r.tmdb) return to(detailPath(r.kind, r.tmdb));
		if (r.kind === 'artist' && r.mbid) return artistHref(r.mbid);
		return to(`/search?q=${encodeURIComponent(r.name)}`);
	}

	let asks: Ask[] | null = null;
	let asksAt = 0;
	async function readAsks(): Promise<Ask[]> {
		if (asks && Date.now() - asksAt < 20_000) return asks;
		const r = await api.get<{ asks: Ask[] }>('/asks');
		asks = r.asks ?? [];
		asksAt = Date.now();
		return asks;
	}

	async function work(c: typeof cmd) {
		const my = ++seq;
		if (!c) return void (plan = null);
		const manager = session.can('manage_library');
		if (c.kind === 'go') {
			plan = { says: `Open ${c.label}`, enter: 'open it', run: () => goto(to(c.href)) };
		} else if (c.kind === 'pause' || c.kind === 'resume') {
			const pause = c.kind === 'pause';
			plan = manager
				? {
						says: pause ? 'Pause every download' : 'Start every download again',
						detail: pause ? 'Type “resume downloads” when you want them back.' : undefined,
						enter: pause ? 'pause them' : 'start them',
						run: async () => {
							try {
								await api.post(pause ? '/downloads/pause-all' : '/downloads/resume-all');
								toasts.push(pause ? 'Paused every download' : 'Started every download again', 'ok', pause ? { body: 'Type “resume downloads” in the Ask bar to start them again.' } : {});
							} catch (e) {
								toasts.push(pause ? 'Could not pause the downloads' : 'Could not start the downloads', 'fail', { body: e instanceof Error ? e.message : String(e) });
							}
						}
					}
				: { says: 'Only people who look after downloads can do that', enter: '', run: () => {} };
		} else if (c.kind === 'get') {
			plan = { says: `Looking for “${c.q}”…`, enter: 'search', run: () => goto(to(`/search?q=${encodeURIComponent(c.q)}`)) };
			await new Promise((r) => setTimeout(r, 200));
			if (my !== seq) return;
			try {
				const a = await api.get<{ items: Row[] }>(`/search/suggest?q=${encodeURIComponent(c.q)}`);
				if (my !== seq) return;
				const hit = (a.items ?? []).find((r) => r.kind === 'movie' || r.kind === 'show' || r.kind === 'artist');
				plan = hit
					? { says: `Ask for ${hit.name}`, detail: hit.sub, enter: 'open it and ask', run: () => goto(rowHref(hit)) }
					: { says: `Nothing called “${c.q}” found yet`, enter: 'search everywhere', run: () => goto(to(`/search?q=${encodeURIComponent(c.q)}`)) };
			} catch {
				// Keep the plain search plan.
			}
		} else if (c.kind === 'why') {
			plan = { says: 'Reading the requests…', enter: 'search', run: () => goto(to(`/search?q=${encodeURIComponent(c.q)}`)) };
			try {
				const list = await readAsks();
				if (my !== seq) return;
				const a = bestMatch(list, c.q);
				plan = a
					? { says: a.name, detail: story(a), enter: 'open its request', run: () => goto(to(`/requests?ask=${a.id}`)) }
					: { says: `No request for “${c.q}” yet`, detail: 'Nobody has asked for it, so Harbor is not looking for it.', enter: 'search for it', run: () => goto(to(`/search?q=${encodeURIComponent(c.q)}`)) };
			} catch {
				// Keep the plain search plan.
			}
		}
	}
	$effect(() => void work(cmd));

	function input(e: Event) {
		const el = e.target;
		if (el instanceof HTMLInputElement && el.type === 'search') typed = el.value;
	}
	function key(e: KeyboardEvent) {
		if (e.key !== 'Enter' || !cmd || !plan || !plan.enter) return;
		const el = e.target;
		if (!(el instanceof HTMLInputElement) || el.type !== 'search') return;
		e.preventDefault();
		e.stopPropagation();
		const run = plan.run;
		typed = '';
		searchField.term = '';
		el.blur();
		void run();
	}
	// The box keeps its words across pages; read them again when it changes from outside (the × button, a new page).
	$effect(() => {
		if (!searchField.term && typed && !inSettings) typed = '';
	});
	const showHints = $derived(focused && !typed.trim() && !inSettings);
</script>

<div class="harbor-ask" oninputcapture={input} onkeydowncapture={key} onfocusin={() => (focused = true)} onfocusout={() => setTimeout(() => (focused = false), 150)} role="presentation">
	{@render children()}
	{#if focused && cmd && plan}
		<div class="panel" data-testid="harbor-ask-panel" role="status" aria-live="polite">
			<span class="label">Answers</span>
			<div class="row">
				<span class="ic" aria-hidden="true"><Icon name={cmd.kind === 'pause' ? 'pause' : cmd.kind === 'resume' ? 'play' : cmd.kind === 'why' ? 'requests' : cmd.kind === 'get' ? 'plus' : 'chevronRight'} size={16} /></span>
				<div class="words">
					<strong>{plan.says}</strong>
					{#if plan.detail}<span>{plan.detail}</span>{/if}
				</div>
				{#if plan.enter}<kbd>Enter</kbd>{/if}
			</div>
			{#if plan.enter}<p class="foot">Press Enter to {plan.enter}. Keep typing to search instead.</p>{/if}
		</div>
	{:else if showHints}
		<div class="panel hints" data-testid="harbor-ask-hints">
			<span class="label">Things you can type</span>
			{#each EXAMPLES as x (x.text)}
				<div class="hint"><code>› {x.text}</code><span>{x.does}</span></div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.harbor-ask { position: relative; display: flex; justify-content: center; }
	.panel { position: absolute; top: calc(100% + 10px); left: 50%; z-index: 40; width: min(560px, 92vw); transform: translateX(-50%); padding: 12px 14px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface-1); box-shadow: var(--shadow-modal); text-align: start; }
	.label { display: block; margin-bottom: 8px; font: 700 11px/1 var(--font-ui); letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-faint); }
	.row { display: grid; grid-template-columns: 32px 1fr auto; align-items: center; gap: 10px; padding: 8px; border-radius: 10px; background: var(--accent-soft); }
	.ic { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; background: var(--surface-1); color: var(--accent-text); }
	.words { display: grid; gap: 2px; min-width: 0; }
	.words strong { font: 600 15px/1.3 var(--font-ui); color: var(--text); }
	.words span { font: 500 13px/1.35 var(--font-ui); color: var(--text-muted); }
	kbd { padding: 3px 8px; border: 1px solid var(--line-strong); border-radius: 6px; font: 600 11px/1.3 var(--font-ui); color: var(--text-muted); }
	.foot { margin: 8px 2px 0; font: 500 12px/1.3 var(--font-ui); color: var(--text-faint); }
	.hint { display: flex; justify-content: space-between; gap: 12px; padding: 5px 2px; font: 500 13px/1.3 var(--font-ui); color: var(--text-muted); }
	.hint code { font: 600 13px/1.3 var(--font-ui); color: var(--text); }
	@media (max-width: 767px) { .hint span { display: none; } }
</style>
