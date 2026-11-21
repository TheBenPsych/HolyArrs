<!-- Harbor's Manga shelf. The manga engine downloads chapters under whatever
     name the site gave them; Harbor's librarian (app/backend/harbor/manga)
     shelves them as "Name - Chapter 010", one copy of each, and this page
     shows what it kept and what it left out, and why. Nothing here removes a
     downloaded file. Design: benflix/manga/manga-1-plan. -->
<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import { to } from '#lib/core/paths.ts';
	import { api as client, message } from '#lib/core/api.ts';
	import { gotLine, hitLine, leftCount, leftGroups, queueLine, searchLine, seriesLine, type MangaGot, type MangaHit, type MangaQueue, type MangaSearch, type MangaView } from './manga.ts';

	let view = $state<MangaView | null>(null);
	let failed = $state(false);
	let busy = $state(false);
	const total = $derived((view?.series ?? []).reduce((n, s) => n + s.chapters, 0));

	onMount(() => {
		client.get<MangaView>('/harbor/manga').then((v) => (view = v), () => (failed = true));
	});
	async function tidyNow() {
		busy = true;
		try {
			view = await client.post<MangaView>('/harbor/manga/tidy');
			failed = false;
		} catch {
			failed = true;
		} finally {
			busy = false;
		}
	}

	// Find a title on every site the engine has switched on, and get it.
	let q = $state('');
	let looking = $state(false);
	let found = $state<MangaSearch | null>(null);
	let findError = $state('');
	let getting = $state('');
	let got = $state<MangaGot | null>(null);
	let line = $state<MangaQueue | null>(null);
	const following = $derived(new Set((view?.following ?? []).map((f) => f.title.toLowerCase())));

	async function find(e: SubmitEvent) {
		e.preventDefault();
		const text = q.trim();
		if (text.length < 2 || looking) return;
		looking = true;
		findError = '';
		got = null;
		try {
			found = await client.get<MangaSearch>(`/harbor/manga/search?q=${encodeURIComponent(text)}`);
		} catch (err) {
			found = null;
			findError = message(err);
		} finally {
			looking = false;
		}
	}
	async function get(h: MangaHit) {
		if (getting) return;
		getting = h.key;
		try {
			got = await client.post<MangaGot>('/harbor/manga/get', { title: h.title, on: h.on });
			view = await client.get<MangaView>('/harbor/manga');
			watchLine();
		} catch (err) {
			got = { title: h.title, queued: 0, have: 0, total: 0, by_site: {}, failed: [], error: message(err) };
		} finally {
			getting = '';
		}
	}
	let timer: ReturnType<typeof setTimeout> | undefined;
	async function watchLine() {
		clearTimeout(timer);
		try {
			line = await client.get<MangaQueue>('/harbor/manga/queue');
		} catch {
			line = null;
		}
		if (line?.left) timer = setTimeout(watchLine, 15000);
	}
	$effect(() => {
		if (view?.on && view.engine) watchLine();
		return () => clearTimeout(timer);
	});
	const when = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '');
</script>

<section class="harbor-manga" data-testid="harbor-manga">
	<a class="back" href={to('/library')}><Icon name="chevronLeft" size={14} />Shelves</a>
	<div class="head">
		<h1>Manga</h1>
		{#if view?.on}<button type="button" class="go" onclick={tidyNow} disabled={busy} data-testid="harbor-manga-tidy">{busy ? 'Tidying…' : 'Tidy now'}</button>{/if}
	</div>

	{#if failed}
		<p class="empty">Harbor could not read the manga shelf just now. Try again in a minute.</p>
	{:else if !view}
		<p class="empty" aria-busy="true">Looking over the manga shelf…</p>
	{:else if !view.on}
		<p class="empty">Manga is not switched on yet. Run Harbor's install command on Tower again and this shelf fills in by itself.</p>
	{:else}
		<p class="lead">
			{#if view.series.length}
				{view.series.length.toLocaleString('en-US')} series and {total.toLocaleString('en-US')} chapters on the shelf. Harbor keeps one copy of each chapter, official first, and names them in order.
			{:else}
				Nothing on the shelf yet. When the manga engine downloads a series, Harbor shelves it here within five minutes.
			{/if}
			{#if view.tidied}<span class="at">Last tidied at {when(view.tidied)}.</span>{/if}
		</p>
		{#if view.engine}
			<form class="find" onsubmit={find} data-testid="harbor-manga-find">
				<input type="search" bind:value={q} placeholder="Find a manga on every site" aria-label="Find a manga on every site" autocomplete="off" />
				<button type="submit" class="go" disabled={looking || q.trim().length < 2}>{looking ? 'Asking the sites…' : 'Find'}</button>
			</form>
			{#if queueLine(line)}<p class="line" data-testid="harbor-manga-line">{queueLine(line)}</p>{/if}
			{#if got}<p class="line" class:bad={!!got.error}>{gotLine(got)} {#if got.queued}Chapters appear on the shelf below as they arrive.{/if}</p>{/if}
			{#if findError}<p class="empty bad">The search did not work: {findError}</p>{/if}
			{#if found}
				<p class="at">{searchLine(found)}{#if found.sites && !found.hits.length} Nothing found for that name.{/if}</p>
				<ul class="hits">
					{#each found.hits as h (h.key)}
						<li>
							{#if h.cover}<img src={to(h.cover)} alt="" loading="lazy" width="56" height="80" />{:else}<span class="nocover" aria-hidden="true">{h.title.slice(0, 1)}</span>{/if}
							<div class="words">
								<p class="what">{h.title}</p>
								<p class="why">{hitLine(h)}{#if h.official}{' '}<strong>Has an official release.</strong>{/if}</p>
							</div>
							<button type="button" class="go" onclick={() => get(h)} disabled={!!getting}>
								{getting === h.key ? 'Reading the chapter lists…' : following.has(h.title.toLowerCase()) ? 'Check for more' : 'Get'}
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		{:else}
			<p class="at">Harbor is not connected to the manga engine yet, so it can tidy but not search. Run Harbor's install command on Tower again.</p>
		{/if}
		{#if view.error}<p class="empty bad">Harbor could not read the engine's folder: {view.error}</p>{/if}
		<ul class="series">
			{#each view.series as s (s.series)}
				<li>
					<div class="words">
						<p class="what">{s.series}</p>
						<p class="why">{seriesLine(s)}</p>
						{#if s.added || s.removed}<p class="new">{#if s.added}{s.added.toLocaleString('en-US')} shelved just now.{/if} {#if s.removed}{s.removed.toLocaleString('en-US')} replaced by a whole chapter.{/if}</p>{/if}
						{#if s.error}<p class="err">{s.error}</p>{/if}
						{#if s.left_out.length}
							<details>
								<summary>{leftCount(s)}</summary>
								{#each leftGroups(s) as g (g.why)}
									<p class="why"><strong>{g.why}:</strong> {g.names.slice(0, 12).join(', ')}{g.names.length > 12 ? ` and ${g.names.length - 12} more` : ''}</p>
								{/each}
								<p class="why">These stay in the engine's own folder. Harbor never removes a downloaded file.</p>
							</details>
						{/if}
					</div>
					<span class="count">{s.chapters.toLocaleString('en-US')}</span>
				</li>
			{/each}
		</ul>
		{#if view.following?.length}
			<p class="later">Harbor looks for new chapters four times a day for: {view.following.map((f) => f.title).join(', ')}.</p>
		{/if}
		<p class="later">On Tower the tidy files are in the media folder under <strong>Manga</strong>, one folder for each title. Harbor only asks the sites you switched on in the engine.</p>
	{/if}
</section>

<style>
	.harbor-manga { display: grid; gap: 14px; max-width: 880px; padding-bottom: 48px; }
	.back { display: inline-flex; align-items: center; gap: 2px; justify-self: start; font: 600 14px/1 var(--font-ui); color: var(--accent-text); text-decoration: none; }
	.head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
	h1 { margin: 0; font: 700 30px/1.2 var(--font-display); color: var(--text); }
	.lead { margin: -4px 0 4px; max-width: 64ch; font: 500 15px/1.5 var(--font-ui); color: var(--text-muted); }
	.at { display: block; font-size: 13px; color: var(--text-faint); }
	.empty { margin: 0; padding: 18px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface-1); font: 500 15px/1.4 var(--font-ui); color: var(--text-muted); }
	.empty.bad { border-color: var(--fail); color: var(--fail-text); }
	.series { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
	.series li { display: grid; grid-template-columns: 1fr auto; align-items: start; gap: 14px; padding: 14px 16px; border: 1px solid var(--line); border-inline-start: 4px solid var(--ok); border-radius: 14px; background: var(--surface-1); }
	.words { display: grid; gap: 4px; min-width: 0; }
	.what { margin: 0; font: 700 17px/1.3 var(--font-display); color: var(--text); overflow-wrap: anywhere; }
	.why { margin: 0; font: 500 13px/1.45 var(--font-ui); color: var(--text-muted); overflow-wrap: anywhere; }
	.why strong { color: var(--text); font-weight: 600; }
	.new { margin: 0; font: 600 13px/1.4 var(--font-ui); color: var(--ok-text); }
	.err { margin: 0; font: 600 13px/1.4 var(--font-ui); color: var(--fail-text); }
	details { margin-top: 2px; }
	details > .why { margin-top: 6px; }
	summary { cursor: pointer; font: 600 13px/1.6 var(--font-ui); color: var(--wait-text); }
	.count { display: grid; place-items: center; min-width: 44px; height: 44px; padding: 0 8px; border-radius: 12px; background: var(--surface-2); font: 700 17px/1 var(--font-display); color: var(--text); }
	.go { height: 36px; padding: 0 16px; border: 0; border-radius: 999px; background: var(--accent-fill); color: #fff; font: 600 14px/1 var(--font-ui); cursor: pointer; }
	.go:hover { background: var(--accent-fill-hover); }
	.go:disabled { opacity: 0.6; cursor: default; }
	.find { display: flex; gap: 8px; flex-wrap: wrap; }
	.find input { flex: 1 1 220px; min-width: 0; height: 40px; padding: 0 14px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface-1); color: var(--text); font: 500 15px/1 var(--font-ui); }
	.find .go { height: 40px; }
	.line { margin: 0; padding: 10px 14px; border-radius: 12px; background: var(--surface-2); font: 600 13px/1.45 var(--font-ui); color: var(--text); }
	.line.bad { color: var(--fail-text); }
	.hits { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
	.hits li { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface-1); }
	.hits img, .nocover { width: 56px; height: 80px; border-radius: 8px; object-fit: cover; background: var(--surface-2); }
	.nocover { display: grid; place-items: center; font: 700 22px/1 var(--font-display); color: var(--text-faint); }
	@media (max-width: 520px) {
		.hits li { grid-template-columns: auto 1fr; }
		.hits .go { grid-column: 1 / -1; }
	}
	.later { margin: 6px 0 0; font: 500 13px/1.4 var(--font-ui); color: var(--text-faint); }
	.later strong { color: var(--text-muted); font-weight: 600; }
</style>
