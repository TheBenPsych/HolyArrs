<!-- Harbor's Tower: one place for how the server is doing. Four tabs:
     Health (a wiring map, a broken line is the broken connection), Jobs
     (everything Harbor does by itself, with Run now), Downloads (what is
     coming in, the safety checks, the history) and Rules (the everyday
     settings written as sentences). People and Every setting open HolyArrs's
     own pages, which stay as the deep layer. Reads and writes only HolyArrs's
     existing routes. Design: harbor-5 screens 6 and 7, harbor-6 screen 6. -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { page } from '$app/state';
	import Icon from '#lib/ui/Icon.svelte';
	import { api, message } from '#lib/core/api.ts';
	import { live } from '#lib/core/live.svelte.ts';
	import { to } from '#lib/core/paths.ts';
	import { plainReason } from '#lib/core/plain.ts';
	import { session } from '#lib/core/session.svelte.ts';
	import { toasts } from '#lib/core/toasts.svelte.ts';
	import type { AlertView, DownloadRow, EventPage, EventRecord, PickRulesView, ReleasePage, ReleaseView } from '#lib/core/types.ts';
	import type { DownloaderSettings } from '#lib/downloads/index.ts';
	import { buildRows, type HealthChecks, type HealthStates, type ScheduleRow, type StatusInput, type StatusRow } from '#lib/health/index.ts';
	import type { FileRules, GateDefaults, TitleDefaults } from '#lib/mediafiles/index.ts';
	import { checkMetadata } from '#lib/metadata/index.ts';
	import type { OutsideList } from '#lib/requests/index.ts';
	import { langName, type Language, type SubtitleSettings } from '#lib/subtitles/index.ts';
	import { TOWER_TABS, ago, downloadSummary, findOldName, healthSentence, hubLine, jobLines, lookAt, ruleBlocks, towerMap, towerTab, type MapNode, type RuleKey, type RuleWord } from './tower.ts';

	const tab = $derived(towerTab(page.url.searchParams.get('tab')));
	const canSee = $derived(session.can('settings') || session.can('manage_library'));
	const canAct = $derived(session.can('settings') && !session.kid);
	const tabHref = (id: string) => to(id === 'health' ? '/tower' : `/tower?tab=${id}`);

	let now = $state(Date.now());

	// ----- Health and Jobs share one read -----
	let input = $state<StatusInput | null>(null);
	let healthFailed = $state(false);
	const rows = $derived<StatusRow[]>(input ? buildRows({ ...input, now }) : []);
	const parts = $derived(rows.filter((r) => r.group !== 'jobs'));
	const nodes = $derived(towerMap(parts));
	const left = $derived(nodes.filter((n) => n.side === 'left'));
	const right = $derived(nodes.filter((n) => n.side === 'right'));
	const trouble = $derived(lookAt(rows));
	const jobs = $derived(jobLines(input?.schedules ?? [], now));

	let seq = 0;
	async function loadHealth(force = false) {
		const n = ++seq;
		const [states, checks, sched, lists, alerts, meta] = await Promise.allSettled([
			api.get<HealthStates>('/health/states'),
			api.get<HealthChecks>('/health/checks'),
			api.get<{ schedules: ScheduleRow[] }>('/schedules'),
			api.get<{ outside_lists: OutsideList[] }>('/outside-lists'),
			api.get<{ alerts: AlertView[] }>('/alerts'),
			checkMetadata(force)
		]);
		if (n !== seq) return;
		const val = <T,>(r: PromiseSettledResult<T>) => (r.status === 'fulfilled' ? r.value : undefined);
		healthFailed = states.status === 'rejected' && sched.status === 'rejected';
		if (healthFailed && input) return;
		input = {
			states: val(states)?.states,
			checks: val(checks)?.checks,
			schedules: val(sched)?.schedules,
			lists: val(lists)?.outside_lists,
			alerts: val(alerts)?.alerts,
			metadataUp: meta.status === 'fulfilled' ? meta.value : null
		};
		now = Date.now();
	}

	const running = new SvelteSet<string>();
	async function testEvery() {
		if (running.has('all')) return;
		running.add('all');
		try {
			await api.post('/health/checks/run');
			await loadHealth(true);
			const n = lookAt(rows).length;
			toasts.push(n ? `Tested every line. ${n === 1 ? 'One thing needs' : `${n} things need`} a look.` : 'Tested every line. All working.', n ? 'info' : 'ok');
		} catch (e) {
			toasts.push('Could not test the lines', 'fail', { body: message(e) });
		} finally {
			running.delete('all');
		}
	}
	async function runJob(kind: string, name: string) {
		if (running.has(kind)) return;
		running.add(kind);
		try {
			const res = await api.post<{ already?: boolean }>(`/schedules/${kind}/run`);
			toasts.push(res?.already ? `${name} is already running` : `Started: ${name}`, 'ok');
			await loadHealth();
		} catch (e) {
			toasts.push(`Could not start: ${name}`, 'fail', { body: message(e) });
		} finally {
			running.delete(kind);
		}
	}

	// ----- Downloads -----
	let downloads = $state<DownloadRow[] | null>(null);
	let turned = $state<{ list: ReleaseView[]; total: number } | null>(null);
	let events = $state<EventRecord[] | null>(null);
	const dl = $derived(downloadSummary(downloads ?? []));
	const HISTORY_KINDS = 'import_done,import_partly_done,file_replaced,download_failed,import_failed,import_rejected,download_sent';
	async function loadDownloads() {
		const [d, t, e] = await Promise.allSettled([
			api.get<{ downloads: DownloadRow[] }>('/downloads/view?limit=100'),
			api.get<ReleasePage>('/turned-down?limit=4&offset=0'),
			api.get<EventPage>(`/events?kind=${HISTORY_KINDS}&limit=6`)
		]);
		downloads = d.status === 'fulfilled' ? (d.value.downloads ?? []) : (downloads ?? []);
		turned = t.status === 'fulfilled' ? { list: t.value.releases ?? [], total: t.value.total ?? 0 } : (turned ?? { list: [], total: 0 });
		events = e.status === 'fulfilled' ? (e.value.events ?? []) : (events ?? []);
		now = Date.now();
	}
	let pausing = $state(false);
	async function pauseAll(pause: boolean) {
		if (pausing) return;
		pausing = true;
		try {
			await api.post(pause ? '/downloads/pause-all' : '/downloads/resume-all');
			toasts.push(pause ? 'Paused every download' : 'Started every download again', 'ok');
			await loadDownloads();
		} catch (e) {
			toasts.push(pause ? 'Could not pause the downloads' : 'Could not start the downloads', 'fail', { body: message(e) });
		} finally {
			pausing = false;
		}
	}
	const whyTurned = (r: ReleaseView) => plainReason(r.reasons?.find((x) => x.effect !== 'ok')?.text ?? r.reasons?.[0]?.text ?? '').text || 'Did not pass the checks';
	const eventWord: Record<string, string> = { import_done: 'Landed', import_partly_done: 'Partly landed', file_replaced: 'Better copy landed', download_failed: 'Download failed', import_failed: 'Could not be filed', import_rejected: 'Failed its checks', download_sent: 'Started downloading' };
	const eventTone = (k: string) => (k.includes('failed') || k.includes('rejected') ? 'fail' : k === 'download_sent' ? 'info' : 'ok');

	// ----- Rules -----
	let rulesIn = $state<{ rules?: PickRulesView[]; defaults?: TitleDefaults; gate?: GateDefaults; subtitles?: SubtitleSettings; music?: { album_choice: string }; downloaders?: DownloaderSettings; files?: FileRules } | null>(null);
	let langs = $state<Language[]>([]);
	const blocks = $derived(rulesIn ? ruleBlocks({ ...rulesIn, langName: (c) => langName(c, langs) }) : []);
	async function loadRules() {
		const get = <T,>(path: string) => api.get<T>(path).catch(() => undefined);
		const [rules, defaults, gate, subtitles, music, downloaders, files, l] = await Promise.all([
			get<{ pick_rules: PickRulesView[] }>('/pick-rules'),
			get<TitleDefaults>('/settings/title-defaults'),
			get<GateDefaults>('/settings/release-gate'),
			get<SubtitleSettings>('/settings/subtitles'),
			get<{ album_choice: string }>('/settings/music'),
			get<DownloaderSettings>('/settings/downloaders'),
			get<FileRules>('/settings/files'),
			get<{ languages: Language[] }>('/subtitles/languages')
		]);
		langs = l?.languages ?? [];
		rulesIn = { rules: rules?.pick_rules, defaults, gate, subtitles, music, downloaders, files };
	}

	/** The word being changed right now, by its key. */
	let editing = $state<RuleKey | null>(null);
	let draft = $state('');
	let saving = $state(false);
	function startEdit(w: RuleWord) {
		const e = w.edit;
		if (!e || saving) return;
		if (e.kind === 'toggle') return void save(e.key, !e.on);
		editing = e.key;
		draft = String(e.value);
	}
	async function save(key: RuleKey, v: boolean | number | string) {
		const r = rulesIn;
		if (!r || saving) return;
		saving = true;
		try {
			if ((key === 'movieRules' || key === 'showRules') && r.defaults) {
				const k = key === 'movieRules' ? 'movie' : 'show';
				r.defaults = await api.put<TitleDefaults>('/settings/title-defaults', { ...r.defaults, [k]: { ...r.defaults[k], pick_rules_id: Number(v) } });
			} else if ((key === 'gate' || key === 'gateDays') && r.gate) {
				r.gate = await api.put<GateDefaults>('/settings/release-gate', { ...r.gate, ...(key === 'gate' ? { release_gate: String(v) } : { gate_delay_days: Number(v) }) });
			} else if (key === 'binDays' && r.files) {
				r.files = await api.put<FileRules>('/settings/files', { ...r.files, holding_days: Number(v) });
			} else if (r.downloaders) {
				const field = key === 'dangerous' ? 'fail_dangerous' : key === 'removeFailed' ? 'remove_failed' : key === 'stuckHours' ? 'stalled_after_hours' : 'stalled_act_hours';
				r.downloaders = await api.put<DownloaderSettings>('/settings/downloaders', { ...r.downloaders, [field]: typeof v === 'boolean' ? v : Number(v) });
			}
			rulesIn = { ...r };
			toasts.push('Rule saved', 'ok');
			editing = null;
		} catch (e) {
			toasts.push('Could not save that rule', 'fail', { body: message(e) });
		} finally {
			saving = false;
		}
	}
	function saveNumber(w: RuleWord) {
		const e = w.edit;
		if (e?.kind !== 'number') return;
		const n = Number(draft);
		if (!Number.isFinite(n) || n < e.min || n > e.max) return void toasts.push(`Pick a number from ${e.min} to ${e.max}`, 'fail');
		if (n === e.value) return void (editing = null);
		void save(e.key, n);
	}

	let oldQuery = $state('');
	const oldHits = $derived(findOldName(oldQuery));

	// Each tab reads what it shows when it opens, and again on the live news that changes it.
	let loadedTabs = new Set<string>();
	$effect(() => {
		if (!canSee) return;
		if (tab === 'downloads' && !loadedTabs.has('downloads')) (loadedTabs.add('downloads'), void loadDownloads());
		if (tab === 'rules' && !loadedTabs.has('rules')) (loadedTabs.add('rules'), void loadRules());
	});
	onMount(() => {
		if (!canSee) return;
		void loadHealth(true);
		let soon: ReturnType<typeof setTimeout> | undefined;
		const later = (what: 'health' | 'downloads') => () => {
			if (soon) return;
			soon = setTimeout(() => {
				soon = undefined;
				if (what === 'health') void loadHealth();
				else if (tab === 'downloads') void loadDownloads();
			}, 1200);
		};
		const offs = [live.on('health', later('health')), live.on('job', later('health')), live.on('download', later('downloads')), live.on('import', later('downloads'))];
		const tick = setInterval(() => {
			if (document.visibilityState !== 'visible') return;
			void loadHealth();
			if (tab === 'downloads') void loadDownloads();
		}, 60_000);
		return () => {
			offs.forEach((off) => off());
			clearInterval(tick);
			clearTimeout(soon);
		};
	});
</script>

{#snippet node(n: MapNode)}
	<li class="node {n.tone}" data-testid="tower-node">
		<a href={to(n.href)}>
			<span class="dot" aria-hidden="true"></span>
			<span class="nm">{n.name}</span>
			<span class="ln">{n.line}</span>
		</a>
	</li>
{/snippet}

<div class="harbor-tower" data-testid="harbor-tower">
	<header class="top">
		<h1>Tower</h1>
		<p class="lede">How the server is doing, what it is busy with, and the rules it follows.</p>
	</header>

	<nav class="tabs" aria-label="Tower">
		{#each TOWER_TABS as t (t.id)}
			<a class="ttab" href={tabHref(t.id)} aria-current={tab === t.id ? 'page' : undefined} data-sveltekit-noscroll>
				{t.label}{#if t.id === 'health' && trouble.length}<span class="n">{trouble.length}</span>{/if}
			</a>
		{/each}
		<span class="gap" aria-hidden="true"></span>
		{#if session.can('users')}<a class="ttab out" href={to('/settings/users')}>People<Icon name="chevronRight" size={14} /></a>{/if}
		{#if session.can('settings')}<a class="ttab out" href={to('/settings')}>Every setting<Icon name="chevronRight" size={14} /></a>{/if}
	</nav>

	{#if !canSee}
		<p class="quiet">Only people who look after Harbor can open the Tower.</p>
	{:else if tab === 'health'}
		<section class="pane" aria-label="Health">
			<div class="pane-top">
				<p class="sentence" class:bad={trouble.length > 0}>{input ? healthSentence(rows) : 'Checking every line…'}</p>
				{#if canAct}<button type="button" class="hbtn" onclick={testEvery} disabled={running.has('all')}><Icon name="refresh" size={15} />{running.has('all') ? 'Testing…' : 'Test every line'}</button>{/if}
			</div>
			{#if healthFailed && !input}
				<p class="quiet">Harbor could not read its own status just now. Try again in a minute.</p>
			{:else if input}
				<div class="map" data-testid="tower-map">
					<ul class="side l">{#each left as n (n.id)}{@render node(n)}{/each}</ul>
					<div class="hub">
						<span class="hub-name">HARBOR</span>
						<span class="hub-line">{hubLine(rows)}</span>
					</div>
					<ul class="side r">{#each right as n (n.id)}{@render node(n)}{/each}</ul>
				</div>
				<p class="key"><span class="k ok"></span>Working <span class="k wait"></span>Needs a look <span class="k fail"></span>Broken <span class="k idle"></span>Off or not set up. Tap a box to open its settings.</p>

				{#if trouble.length}
					<h2>{trouble.length === 1 ? 'One thing to look at' : 'Things to look at'}</h2>
					<ul class="issues">
						{#each trouble as r (r.key)}
							<li class={r.tone}>
								<div class="words">
									<p class="what"><strong>{r.name}</strong> · {r.word}</p>
									{#if r.reason}<p class="why">{r.reason}</p>{/if}
								</div>
								{#if r.fix}<a class="go" href={to(r.fix)}>Fix it<Icon name="chevronRight" size={14} /></a>{/if}
							</li>
						{/each}
					</ul>
				{/if}
				<p class="deeper">Want every detail? HolyArrs's full <a href={to('/health')}>Status page</a> is still here, with storage, updates and support.</p>
			{/if}
		</section>
	{:else if tab === 'jobs'}
		<section class="pane" aria-label="Jobs">
			<div class="pane-top"><p class="sentence">{input ? `Harbor does ${jobs.length} jobs by itself.` : 'Reading the jobs…'}</p></div>
			{#if jobs.length}
				<div class="jobs" role="table" aria-label="Jobs">
					<div class="jrow head" role="row"><span role="columnheader">Job</span><span role="columnheader">Last run</span><span role="columnheader">Next</span><span role="columnheader"></span></div>
					{#each jobs as j (j.kind)}
						<div class="jrow {j.tone}" class:busy={j.running} role="row" data-testid="tower-job">
							<span class="jname" role="cell"><strong>{j.name}</strong>{#if j.note}<em class="note">{j.note}</em>{:else if j.about}<em>{j.about}</em>{/if}</span>
							<span role="cell" data-label="Last run">{j.last}</span>
							<span role="cell" data-label="Next">{j.next}</span>
							<span role="cell" class="jact">{#if canAct && j.canRun}<button type="button" class="hbtn small" onclick={() => runJob(j.kind, j.name)} disabled={running.has(j.kind)}>{running.has(j.kind) ? 'Starting…' : 'Run now'}</button>{/if}</span>
						</div>
					{/each}
				</div>
				<p class="deeper">How often each job runs is set on the <a href={to('/settings/schedules')}>Schedules</a> page. Jobs that the Glowfin helper runs will join this list once Harbor is linked to it.</p>
			{:else if input}
				<p class="quiet">No jobs to show.</p>
			{/if}
		</section>
	{:else if tab === 'downloads'}
		<section class="pane" aria-label="Downloads">
			<div class="pane-top">
				<p class="sentence" class:bad={dl.needsYou > 0}>{downloads ? dl.sentence : 'Reading the downloads…'}</p>
				{#if canAct && dl.coming}
					{#if dl.paused === dl.coming}<button type="button" class="hbtn" onclick={() => pauseAll(false)} disabled={pausing}><Icon name="play" size={15} />Start them again</button>
					{:else}<button type="button" class="hbtn" onclick={() => pauseAll(true)} disabled={pausing}><Icon name="pause" size={15} />Pause all</button>{/if}
				{/if}
			</div>
			<div class="cols">
				<article class="tcard sea">
					<h2><Icon name="download" size={17} />Coming in</h2>
					{#if dl.top.length}
						<ul class="lines">
							{#each dl.top as d (d.id)}
								<li><span class="lname">{d.name}</span><span class="lsub">{d.line}</span><span class="bar" aria-hidden="true"><span style:width="{Math.round(d.progress * 100)}%"></span></span></li>
							{/each}
						</ul>
						{#if dl.coming > dl.top.length}<p class="lsub">and {dl.coming - dl.top.length} more</p>{/if}
					{:else}<p class="none">{downloads ? 'Nothing is downloading.' : '…'}</p>{/if}
					{#if dl.needsYou}<p class="warn">{dl.needsYou} downloaded but {dl.needsYou === 1 ? 'needs' : 'need'} your choice before landing.</p>{/if}
					<a class="go" href={to('/downloads')}>Open Downloads<Icon name="chevronRight" size={14} /></a>
				</article>
				<article class="tcard">
					<h2><Icon name="shield" size={17} />Safety checks</h2>
					{#if turned?.list.length}
						<p class="lsub">{turned.total.toLocaleString('en-US')} {turned.total === 1 ? 'copy' : 'copies'} turned down so far. The latest:</p>
						<ul class="lines">
							{#each turned.list as r (r.id)}
								<li><span class="lname">{r.title_name || r.name}</span><span class="lsub">{whyTurned(r)}</span></li>
							{/each}
						</ul>
					{:else}<p class="none">{turned ? 'No copies have been turned down yet.' : '…'}</p>{/if}
					<a class="go" href={to('/library/turned-down')}>See every copy turned down<Icon name="chevronRight" size={14} /></a>
				</article>
				<article class="tcard sand">
					<h2><Icon name="clock" size={17} />History</h2>
					{#if events?.length}
						<ul class="lines">
							{#each events as e (e.ID)}
								<li class={eventTone(e.Kind)}><span class="lname">{e.title_name || e.Summary}</span><span class="lsub">{eventWord[e.Kind] ?? e.Summary}{e.episode ? ` · ${e.episode}` : ''} · {ago(e.At, now).toLowerCase()}</span></li>
							{/each}
						</ul>
					{:else}<p class="none">{events ? 'Nothing has happened yet.' : '…'}</p>{/if}
					<a class="go" href={to('/downloads/history')}>Open the full history<Icon name="chevronRight" size={14} /></a>
				</article>
			</div>
		</section>
	{:else}
		<section class="pane" aria-label="Rules">
			<div class="pane-top"><p class="sentence">The everyday rules, written out.</p></div>
			<p class="lede small">{canAct ? 'Tap an underlined word to change it.' : 'Underlined words are the settings.'} A dashed underline means that rule is switched off.</p>
			{#if !rulesIn}
				<p class="quiet" aria-busy="true">Reading the rules…</p>
			{:else if !blocks.length}
				<p class="quiet">Only people who look after Harbor's settings can read the rules.</p>
			{:else}
				<div class="rules">
					{#each blocks as b (b.id)}
						<article class="rule" data-testid="tower-rule">
							<h2>{b.title}</h2>
							<p class="says">
								{#each b.parts as p, i (i)}
									{#if typeof p === 'string'}{p}
									{:else if !canAct}<span class="word" class:off={p.off}>{p.word}</span>
									{:else if p.edit && editing === p.edit.key}
										{#if p.edit.kind === 'choice'}
											<select class="pick" aria-label="Change {p.word}" bind:value={draft} disabled={saving} onchange={() => p.edit && draft !== String((p.edit as { value: string }).value) && save(p.edit.key, draft)} onblur={() => !saving && (editing = null)}>
												{#each p.edit.options as [v, label] (v)}<option value={v}>{label}</option>{/each}
											</select>
										{:else if p.edit.kind === 'number'}
											<span class="num">
												<!-- svelte-ignore a11y_autofocus -->
												<input type="number" aria-label="Change {p.word}" min={p.edit.min} max={p.edit.max} bind:value={draft} disabled={saving} autofocus onkeydown={(e) => (e.key === 'Enter' ? saveNumber(p) : e.key === 'Escape' ? (editing = null) : null)} />
												{p.edit.unit}
												<button type="button" class="hbtn small" onclick={() => saveNumber(p)} disabled={saving}>Save</button>
												<button type="button" class="link" onclick={() => (editing = null)}>Cancel</button>
											</span>
										{/if}
									{:else if p.edit}<button type="button" class="word" class:off={p.off} onclick={() => startEdit(p)} disabled={saving}>{p.word}</button>
									{:else}<a class="word" class:off={p.off} href={to(p.href)}>{p.word}</a>{/if}
								{/each}
							</p>
							{#if canAct}<a class="go" href={to(b.more)}>More for {b.title.toLowerCase()}<Icon name="chevronRight" size={14} /></a>{/if}
						</article>
					{/each}
				</div>
			{/if}

			<div class="old">
				<h2>Coming from the old apps?</h2>
				<label for="tower-old">Find a setting by its old name</label>
				<input id="tower-old" type="search" placeholder="Try “delay profile” or “blocklist”" bind:value={oldQuery} autocomplete="off" />
				{#if oldQuery.trim()}
					{#if oldHits.length}
						<ul class="olds">
							{#each oldHits as o (o.old)}
								<li><span class="was">{o.old}</span><Icon name="arrow" size={14} /><a href={to(o.href)}>{o.now}</a></li>
							{/each}
						</ul>
					{:else}<p class="none">Nothing by that name. Try one word, or look in <a href={to('/settings')}>Every setting</a>.</p>{/if}
				{/if}
			</div>
		</section>
	{/if}
</div>

<style>
	.harbor-tower {
		--sea: color-mix(in srgb, var(--info) 9%, var(--surface-1));
		--sand: color-mix(in srgb, var(--wait) 11%, var(--surface-1));
		--wire: color-mix(in srgb, var(--text) 30%, transparent);
		max-width: 1200px; padding: 24px 0 48px;
	}
	.top h1 { margin: 0; font: 700 clamp(30px, 3vw, 40px)/1.1 var(--font-display); color: var(--text); }
	.lede { margin: 6px 0 0; font: 500 15px/1.4 var(--font-ui); color: var(--text-muted); }
	.lede.small { margin: 0 0 18px; font-size: 14px; }
	h2 { display: flex; align-items: center; gap: 8px; margin: 0; font: 700 18px/1.2 var(--font-display); color: var(--text); }

	.tabs { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin: 20px 0 22px; border-bottom: 1px solid var(--line); }
	.ttab { display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 0 14px; margin-bottom: -1px; border-bottom: 3px solid transparent; color: var(--text-muted); font: 600 15px/1 var(--font-ui); text-decoration: none; }
	.ttab:hover { color: var(--text); }
	.ttab[aria-current='page'] { border-bottom-color: var(--accent); color: var(--text); }
	.ttab.out { font-size: 14px; }
	.ttab .n { min-width: 20px; padding: 3px 6px; border-radius: 999px; background: var(--fail); color: #fff; font: 700 12px/1 var(--font-ui); text-align: center; box-sizing: border-box; }
	.gap { flex: 1; }
	.ttab:focus-visible, .hbtn:focus-visible, .go:focus-visible, .word:focus-visible, .node a:focus-visible, .link:focus-visible { outline: none; box-shadow: var(--focus-ring); border-radius: 6px; }

	.pane-top { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
	.sentence { margin: 0; font: 700 clamp(22px, 2.2vw, 28px)/1.2 var(--font-display); color: var(--text); }
	.sentence.bad { color: var(--fail-text); }
	.hbtn { display: inline-flex; align-items: center; gap: 6px; min-height: 38px; padding: 0 16px; border: 1px solid var(--line-strong); border-radius: 999px; background: var(--surface-1); color: var(--text); font: 600 14px/1 var(--font-ui); cursor: pointer; }
	.hbtn:hover:not(:disabled) { background: var(--surface-2); }
	.hbtn:disabled { opacity: 0.6; cursor: default; }
	.hbtn.small { min-height: 32px; padding: 0 12px; font-size: 13px; }
	.quiet { margin: 0; padding: 24px 0; font: 500 15px/1.4 var(--font-ui); color: var(--text-faint); }
	.deeper { margin: 24px 0 0; font: 500 13px/1.5 var(--font-ui); color: var(--text-faint); }
	.deeper a, .none a { color: var(--accent-text); font-weight: 600; }
	.go { display: inline-flex; align-items: center; gap: 4px; color: var(--accent-text); font: 600 13px/1.2 var(--font-ui); text-decoration: none; white-space: nowrap; }
	.go:hover { text-decoration: underline; }
	.link { padding: 0; border: 0; background: none; color: var(--accent-text); font: 600 13px/1.2 var(--font-ui); cursor: pointer; }

	/* The wiring map: Harbor in the middle, a line out to every part. */
	.map { display: grid; grid-template-columns: 1fr minmax(150px, 190px) 1fr; align-items: stretch; padding: 28px 20px; border: 1px solid var(--line); border-radius: 18px; background: var(--sea); }
	.side { display: grid; align-content: center; gap: 14px; margin: 0; padding: 0; list-style: none; }
	.hub { display: grid; align-content: center; justify-items: center; gap: 6px; min-height: 180px; padding: 16px 12px; border: 2px solid var(--text); border-radius: 16px; background: var(--surface-1); text-align: center; z-index: 1; }
	.hub-name { font: 700 22px/1 var(--font-display); letter-spacing: 0.14em; color: var(--text); }
	.hub-line { font: 500 13px/1.35 var(--font-ui); color: var(--text-muted); }
	.node { position: relative; display: flex; }
	.side.l .node { padding-right: 44px; justify-content: flex-end; }
	.side.r .node { padding-left: 44px; }
	/* The line from a box to Harbor. Broken lines are dashed and coloured. */
	.node::after { content: ''; position: absolute; top: 50%; width: 44px; border-top: 2px solid var(--wire); }
	.side.l .node::after { right: 0; }
	.side.r .node::after { left: 0; }
	.node.fail::after { border-top: 2px dashed var(--fail); }
	.node.wait::after { border-top-color: var(--wait); }
	.node.idle::after { border-top: 2px dotted var(--wire); }
	.node a { display: grid; grid-template-columns: auto 1fr; gap: 2px 8px; align-items: center; width: min(100%, 300px); padding: 10px 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface-1); box-shadow: var(--shadow-card); text-decoration: none; box-sizing: border-box; }
	.node a:hover { box-shadow: var(--shadow-lift); }
	.node.fail a { border-color: var(--fail); }
	.dot, .k { width: 10px; height: 10px; border-radius: 50%; background: var(--text-faint); }
	.ok .dot, .k.ok { background: var(--ok); }
	.wait .dot, .k.wait { background: var(--wait); }
	.fail .dot, .k.fail { background: var(--fail); }
	.nm { font: 600 15px/1.25 var(--font-display); color: var(--text); overflow-wrap: anywhere; }
	.ln { grid-column: 2; font: 500 12px/1.35 var(--font-ui); color: var(--text-muted); overflow-wrap: anywhere; }
	.node.fail .ln { color: var(--fail-text); }
	.key { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 12px 0 0; font: 500 12px/1.4 var(--font-ui); color: var(--text-faint); }
	.k { display: inline-block; margin-left: 8px; }
	.k:first-child { margin-left: 0; }

	.pane > h2 { margin: 26px 0 10px; }
	.issues { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
	.issues li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; border: 1px solid var(--line); border-inline-start: 4px solid var(--wait); border-radius: 12px; background: var(--surface-1); }
	.issues li.fail { border-inline-start-color: var(--fail); }
	.words { min-width: 0; }
	.what { margin: 0; font: 500 14px/1.35 var(--font-ui); color: var(--text); }
	.why { margin: 2px 0 0; font: 500 13px/1.4 var(--font-ui); color: var(--text-muted); overflow-wrap: anywhere; }

	/* Jobs: one list for everything Harbor does by itself. */
	.jobs { border: 1px solid var(--line); border-radius: 16px; background: var(--surface-1); overflow: hidden; }
	.jrow { display: grid; grid-template-columns: minmax(0, 1fr) 150px 150px 96px; align-items: center; gap: 12px; padding: 10px 16px; border-top: 1px solid var(--line); font: 500 14px/1.35 var(--font-ui); color: var(--text-muted); }
	.jrow.head { border-top: 0; background: var(--surface-2); font: 700 12px/1 var(--font-ui); letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-faint); }
	.jname { display: grid; gap: 2px; min-width: 0; }
	.jname strong { font: 600 15px/1.25 var(--font-display); color: var(--text); }
	.jname em { font: 500 12px/1.35 var(--font-ui); font-style: normal; color: var(--text-faint); }
	.jrow.fail .note { color: var(--fail-text); }
	.jrow.fail { box-shadow: inset 4px 0 0 var(--fail); }
	.jrow.busy { background: var(--sea); }
	.jrow.idle strong { color: var(--text-muted); }
	.jact { display: flex; justify-content: flex-end; }

	/* Downloads: three cards. */
	.cols { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; align-items: start; }
	.tcard { display: grid; gap: 10px; padding: 16px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface-1); min-width: 0; }
	.tcard.sea { background: var(--sea); }
	.tcard.sand { background: var(--sand); }
	.lines { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
	.lines li { display: grid; gap: 2px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface-1); min-width: 0; }
	.lines li.fail { border-inline-start: 4px solid var(--fail); }
	.lname { font: 600 14px/1.3 var(--font-display); color: var(--text); overflow-wrap: anywhere; }
	.lsub { margin: 0; font: 500 12px/1.35 var(--font-ui); color: var(--text-muted); overflow-wrap: anywhere; }
	.bar { height: 5px; margin-top: 4px; border-radius: 5px; background: color-mix(in srgb, var(--text) 10%, transparent); overflow: hidden; }
	.bar span { display: block; height: 100%; border-radius: inherit; background: var(--info); }
	.none { margin: 0; font: 500 13px/1.4 var(--font-ui); color: var(--text-faint); }
	.warn { margin: 0; font: 600 13px/1.4 var(--font-ui); color: var(--fail-text); }

	/* Rules: sentences with underlined words. */
	.rules { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
	.rule { display: grid; gap: 10px; align-content: start; padding: 18px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface-1); }
	.says { margin: 0; font: 500 17px/1.75 var(--font-ui); color: var(--text); }
	.word { display: inline; padding: 0; border: 0; background: none; font: inherit; font-weight: 700; color: var(--accent-text); text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 4px; cursor: pointer; }
	span.word { cursor: default; color: var(--text); }
	.word.off { text-decoration-style: dashed; color: var(--text-muted); }
	.word:hover:not(span) { background: color-mix(in srgb, var(--accent) 12%, transparent); }
	.pick, .num input { min-height: 34px; padding: 0 8px; border: 1px solid var(--line-strong); border-radius: 8px; background: var(--surface-1); color: var(--text); font: 600 15px/1 var(--font-ui); }
	.num { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 15px; }
	.num input { width: 84px; }

	.old { display: grid; gap: 8px; margin-top: 22px; padding: 18px; border: 1px dashed var(--line-strong); border-radius: 16px; }
	.old label { font: 500 13px/1.4 var(--font-ui); color: var(--text-muted); }
	.old input { max-width: 420px; min-height: 40px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: 10px; background: var(--surface-1); color: var(--text); font: 500 15px/1 var(--font-ui); }
	.olds { display: grid; gap: 6px; margin: 4px 0 0; padding: 0; list-style: none; }
	.olds li { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font: 500 14px/1.4 var(--font-ui); color: var(--text-muted); }
	.olds a { color: var(--accent-text); font-weight: 600; }

	@media (max-width: 899px) {
		.cols, .rules { grid-template-columns: 1fr; }
		/* The map stands up: Harbor on top, one trunk down the left, a branch to each box. */
		.map { grid-template-columns: 1fr; padding: 16px; }
		.hub { order: -1; min-height: 0; padding: 14px; }
		.side { gap: 0; margin-left: 18px; border-left: 2px solid var(--wire); }
		.side.l .node, .side.r .node { padding: 12px 0 0 28px; justify-content: flex-start; }
		.side.l .node::after, .side.r .node::after { left: 0; right: auto; top: calc(50% + 6px); width: 28px; }
		.node a { width: 100%; }
		.jrow { grid-template-columns: 1fr auto; gap: 4px 12px; }
		.jrow.head { display: none; }
		.jname { grid-column: 1 / -1; }
		.jrow [data-label]::before { content: attr(data-label) ': '; color: var(--text-faint); }
		.jact { grid-column: 1 / -1; justify-content: flex-start; }
		.jact:empty { display: none; }
	}
	@media (max-width: 767px) {
		.harbor-tower { padding: 16px 16px 96px; }
		.tabs { flex-wrap: nowrap; overflow-x: auto; margin-inline: -16px; padding-inline: 16px; scrollbar-width: none; }
		.ttab { flex: none; }
		.gap { display: none; }
		.says { font-size: 16px; }
	}
</style>
