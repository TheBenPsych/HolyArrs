<!-- Harbor's Tower in the bold look (redesign part 7): one place for how the
     server is doing. Overview has a glowing orb (mint all good, amber look at
     something, red broken), a tile per connection with its last 7 days as
     dots, live graphs of download speed, processor and disk, and the six
     Settings groups. Jobs shows today as a timeline, then every job with Run
     now. Downloads and Rules (the everyday settings written as sentences)
     stay. The tabs live in the top menu. Reads and writes HolyArrs's own
     routes, plus /harbor/tower/week and /harbor/tower/pulse. -->
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
	import { TOWER_TABS, ago, downloadSummary, findOldName, jobLines, lookAt, ruleBlocks, towerMap, towerTab, type RuleKey, type RuleWord } from './tower.ts';
	import { SETTINGS_GROUPS, dayName, orbOf, weekDots, weekWords, type Week } from './tower-bold.ts';
	import HarborTowerPulse from './HarborTowerPulse.svelte';
	import HarborTowerDay from './HarborTowerDay.svelte';
	import HarborShrinker from './HarborShrinker.svelte';

	const tab = $derived(towerTab(page.url.searchParams.get('tab')));
	const canSee = $derived(session.can('settings') || session.can('manage_library'));
	const canAct = $derived(session.can('settings') && !session.kid);
	const tabLabel = $derived(TOWER_TABS.find((t) => t.id === tab)?.label ?? 'Tower');

	let now = $state(Date.now());

	// ----- Health and Jobs share one read -----
	let input = $state<StatusInput | null>(null);
	let healthFailed = $state(false);
	const rows = $derived<StatusRow[]>(input ? buildRows({ ...input, now }) : []);
	const parts = $derived(rows.filter((r) => r.group !== 'jobs'));
	const nodes = $derived(towerMap(parts));
	const trouble = $derived(lookAt(rows));
	const orb = $derived(orbOf(rows));
	const jobs = $derived(jobLines(input?.schedules ?? [], now));
	// The last 7 days of each connection, noted by Harbor itself (harbor-health-week.json).
	let week = $state<Week | null>(null);

	let seq = 0;
	async function loadHealth(force = false) {
		const n = ++seq;
		const [states, checks, sched, lists, alerts, meta, wk] = await Promise.allSettled([
			api.get<HealthStates>('/health/states'),
			api.get<HealthChecks>('/health/checks'),
			api.get<{ schedules: ScheduleRow[] }>('/schedules'),
			api.get<{ outside_lists: OutsideList[] }>('/outside-lists'),
			api.get<{ alerts: AlertView[] }>('/alerts'),
			checkMetadata(force),
			api.get<Week>('/harbor/tower/week')
		]);
		if (n !== seq) return;
		if (wk.status === 'fulfilled') week = wk.value;
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

<div class="harbor-tower" data-testid="harbor-tower">
	{#if !canSee}
		<header class="top"><h1>Tower</h1></header>
		<p class="quiet">Only people who look after Harbor can open the Tower.</p>
	{:else if tab === 'health'}
		<section class="pane" aria-label="Overview">
			<div class="hero">
				<div class="orb {input ? orb.tone : 'idle'}" aria-hidden="true">
					<span class="ball"></span>
					<span class="in">
						{#if !input}<b>…</b>{:else if orb.count}<b>{orb.count}</b>{:else}<Icon name="check" size={46} />{/if}
						<small>{input ? orb.label : 'checking'}</small>
					</span>
				</div>
				<div class="hero-words">
					<h1>{input ? orb.headline : healthFailed ? 'Tower could not answer' : 'Checking every line…'}</h1>
					<p class="line">{input ? orb.line : healthFailed ? 'Harbor could not read its own status just now. Try again in a minute.' : ' '}</p>
					{#if trouble[0]}
						{@const r = trouble[0]}
						<div class="issue glass {r.tone}">
							<i class="dot" aria-hidden="true"></i>
							<div class="words"><p class="what">{r.name} · {r.word}</p>{#if r.reason}<p class="why">{r.reason}</p>{/if}</div>
							{#if r.fix}<a class="hbtn go-btn" href={to(r.fix)}>Fix it</a>{/if}
						</div>
					{/if}
					<div class="acts">
						{#if canAct}<button type="button" class="hbtn" onclick={testEvery} disabled={running.has('all')}><Icon name="refresh" size={15} />{running.has('all') ? 'Testing…' : 'Test every line'}</button>{/if}
						<a class="hbtn" href={to('/health')}>Full status page<Icon name="chevronRight" size={14} /></a>
					</div>
				</div>
			</div>

			{#if input}
				<div class="tiles" data-testid="tower-map">
					{#each nodes as n (n.id)}
						{@const dots = weekDots(n.keys, week, n.tone)}
						<a class="tile glass {n.tone}" href={to(n.href)} data-testid="tower-node">
							<span class="tt"><i class="dot" aria-hidden="true"></i><strong>{n.name}</strong></span>
							<span class="ln">{n.line}</span>
							<span class="week" role="img" aria-label="Last 7 days: {weekWords(dots)}" data-testid="tower-week">
								{#each dots as d, i (i)}<i class="wd {d}" title="{week?.days[i] ? dayName(week.days[i]) : ''}: {d === 'none' ? 'not noted' : d === 'ok' ? 'working' : d === 'wait' ? 'needed a look' : d === 'fail' ? 'broken' : 'off'}"></i>{/each}
							</span>
							<span class="wk">{weekWords(dots)}</span>
						</a>
					{/each}
				</div>
				<p class="key"><span class="k ok"></span>Working <span class="k wait"></span>Needs a look <span class="k fail"></span>Broken <span class="k idle"></span>Off or not set up. The small dots are the last 7 days, today on the right.</p>

				{#if trouble.length > 1}
					<h2>Things to look at <span>{trouble.length}</span></h2>
					<ul class="issues">
						{#each trouble as r (r.key)}
							<li class="glass {r.tone}">
								<div class="words">
									<p class="what"><strong>{r.name}</strong> · {r.word}</p>
									{#if r.reason}<p class="why">{r.reason}</p>{/if}
								</div>
								{#if r.fix}<a class="go" href={to(r.fix)}>Fix it<Icon name="chevronRight" size={14} /></a>{/if}
							</li>
						{/each}
					</ul>
				{/if}
			{/if}

			<h2>Live <span>How hard Tower is working right now</span></h2>
			<HarborTowerPulse />

			{#if session.can('settings') || session.can('users')}
				<h2>Settings <span>6 groups · or just search</span><a class="go" href={to('/settings')}>Open Settings<Icon name="chevronRight" size={14} /></a></h2>
				<div class="sgroups">
					{#each SETTINGS_GROUPS as g (g.id)}
						<a class="sg glass c-{g.colour}" href={to(`/settings#group-${g.id}`)}><span class="badge" aria-hidden="true"><Icon name={g.icon} size={20} /></span><strong>{g.label}</strong></a>
					{/each}
				</div>
			{/if}
		</section>
	{:else if tab === 'shrinker'}
		<HarborShrinker />
	{:else if tab === 'jobs'}
		<header class="top"><h1>Jobs</h1><p class="lede">{input ? `Harbor does ${jobs.length} jobs by itself. Here is today, and every job.` : 'Reading the jobs…'}</p></header>
		<section class="pane" aria-label="Jobs">
			{#if input}<HarborTowerDay schedules={input.schedules ?? []} {now} />{/if}
			{#if jobs.length}
				<div class="jobs glass" role="table" aria-label="Every job">
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
				<p class="deeper">How often each job runs is set on the <a href={to('/settings/schedules')}>Schedules</a> page.</p>
			{:else if input}
				<p class="quiet">No jobs to show.</p>
			{/if}
		</section>
	{:else}
		<header class="top"><h1>{tabLabel}</h1><p class="lede">{tab === 'rules' ? 'The everyday rules Harbor follows, written out.' : 'What is coming in, the safety checks, and what happened.'}</p></header>
	{#if tab === 'downloads'}
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
	{/if}
</div>

<style>
	.harbor-tower { --sea: color-mix(in srgb, var(--harbor-aqua) 10%, var(--harbor-glass)); --sand: color-mix(in srgb, var(--harbor-amber) 10%, var(--harbor-glass)); display: grid; gap: 0; max-width: 1280px; margin: 0 auto; padding: 18px 0 48px; }
	.glass { border: 1px solid var(--harbor-edge); background: var(--harbor-glass); -webkit-backdrop-filter: blur(18px) saturate(140%); backdrop-filter: blur(18px) saturate(140%); }
	.top { margin-bottom: 18px; }
	.top h1, .hero h1 { margin: 0; font: 800 clamp(32px, 4vw, 46px)/1.05 var(--font-display); letter-spacing: -0.025em; color: var(--text); }
	.lede { margin: 6px 0 0; font: 500 16px/1.4 var(--font-ui); color: var(--text-muted); }
	.lede.small { margin: 0 0 18px; font-size: 14px; }
	h2 { display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px; margin: 0; font: 700 21px/1.2 var(--font-display); letter-spacing: -0.015em; color: var(--text); }
	h2 span { font: 600 14px/1.2 var(--font-ui); letter-spacing: 0; color: var(--text-muted); }
	h2 .go { margin-inline-start: auto; font-size: 14px; }
	.pane { display: grid; gap: 16px; min-width: 0; }
	.pane > h2 { margin-top: 14px; }
	.hbtn:focus-visible, .go:focus-visible, .word:focus-visible, .tile:focus-visible, .sg:focus-visible, .link:focus-visible { outline: none; box-shadow: var(--focus-ring); }

	/* The orb: one glowing ball says how Tower is. */
	.hero { display: flex; align-items: center; gap: 32px; padding: 8px 0 6px; }
	.orb { --c1: #d8fff0; --c2: var(--harbor-mint); --c3: #0f7a54; --glow: rgb(79 240 176 / 42%); --ink: #04261a; position: relative; flex: none; width: 230px; height: 230px; display: grid; place-items: center; }
	.orb.wait { --c1: #ffe3a3; --c2: var(--harbor-amber); --c3: #a86b00; --glow: rgb(255 194 92 / 45%); --ink: #2a1a00; }
	.orb.fail { --c1: #ffc4c4; --c2: var(--harbor-red); --c3: #9c1f1f; --glow: rgb(255 107 107 / 48%); --ink: #2b0606; }
	.orb.idle { --c1: #e6e9f2; --c2: #8d93a8; --c3: #3d4256; --glow: rgb(141 147 168 / 30%); --ink: #11131c; }
	.ball { position: absolute; inset: 18px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, var(--c1), var(--c2) 42%, var(--c3)); box-shadow: 0 0 60px 10px var(--glow), inset 0 -20px 40px rgb(0 0 0 / 28%); animation: breathe 2.6s ease-in-out infinite alternate; }
	@keyframes breathe { to { transform: scale(1.04); box-shadow: 0 0 80px 18px var(--glow), inset 0 -20px 40px rgb(0 0 0 / 28%); } }
	.in { position: relative; display: grid; justify-items: center; gap: 2px; color: var(--ink); text-align: center; }
	.in b { font: 800 56px/1 var(--font-display); }
	.in small { font: 800 14px/1.2 var(--font-ui); max-width: 140px; }
	.hero-words { display: grid; gap: 10px; flex: 1; min-width: 0; }
	.line { margin: 0; font: 500 17px/1.45 var(--font-ui); color: var(--text-muted); }
	.issue { display: flex; align-items: center; gap: 14px; max-width: 680px; padding: 12px 12px 12px 18px; border-radius: 20px; --c: var(--harbor-amber); border-color: color-mix(in srgb, var(--c) 45%, transparent); }
	.issue.fail { --c: var(--harbor-red); }
	.issue .words { flex: 1; }
	.issue .what { font-weight: 700; }
	.issue .dot { background: var(--c); box-shadow: 0 0 10px var(--c); }
	.acts { display: flex; flex-wrap: wrap; gap: 10px; }

	.hbtn { display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 0 16px; border: 1px solid var(--harbor-edge); border-radius: 999px; background: var(--harbor-glass); color: var(--text); font: 600 14px/1 var(--font-ui); text-decoration: none; cursor: pointer; white-space: nowrap; }
	.hbtn:hover:not(:disabled) { background: var(--harbor-glass-2); }
	.hbtn:disabled { opacity: 0.6; cursor: default; }
	.hbtn.small { min-height: 32px; padding: 0 12px; font-size: 13px; }
	.hbtn.go-btn { margin-left: auto; border: 0; background: var(--harbor-grad); color: #fff; font-weight: 700; }
	.quiet { margin: 0; padding: 24px 0; font: 500 15px/1.4 var(--font-ui); color: var(--text-faint); }
	.deeper { margin: 4px 0 0; font: 500 13px/1.5 var(--font-ui); color: var(--text-faint); }
	.deeper a, .none a { color: var(--accent-text); font-weight: 600; }
	.go { display: inline-flex; align-items: center; gap: 4px; color: var(--accent-text); font: 700 13px/1.2 var(--font-ui); text-decoration: none; white-space: nowrap; }
	.go:hover { text-decoration: underline; }
	.link { padding: 0; border: 0; background: none; color: var(--accent-text); font: 600 13px/1.2 var(--font-ui); cursor: pointer; }

	/* Each connection is a tile with a live dot and its last 7 days. */
	.tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
	.tile { display: grid; align-content: start; gap: 4px; min-width: 0; padding: 14px 16px; border-radius: 18px; color: var(--text); text-decoration: none; transition: transform 160ms var(--ease-out, ease-out); }
	.tile:hover { transform: translateY(-2px); background: var(--harbor-glass-2); }
	.tile.fail { border-color: color-mix(in srgb, var(--harbor-red) 55%, transparent); }
	.tile.wait { border-color: color-mix(in srgb, var(--harbor-amber) 45%, transparent); }
	.tt { display: flex; align-items: center; gap: 10px; min-width: 0; }
	.tt strong { font: 700 15px/1.25 var(--font-display); overflow-wrap: anywhere; }
	.ln { font: 500 13px/1.35 var(--font-ui); color: var(--text-muted); overflow-wrap: anywhere; }
	.tile.fail .ln { color: var(--fail-text); }
	.dot, .k { flex: none; width: 12px; height: 12px; border-radius: 50%; background: #8d93a8; }
	.ok > .tt .dot, .k.ok { background: var(--harbor-mint); box-shadow: 0 0 12px var(--harbor-mint); }
	.wait > .tt .dot, .k.wait { background: var(--harbor-amber); box-shadow: 0 0 12px var(--harbor-amber); }
	.fail > .tt .dot, .k.fail { background: var(--harbor-red); box-shadow: 0 0 12px var(--harbor-red); }
	.week { display: flex; gap: 7px; margin-top: 8px; }
	.wd { width: 10px; height: 10px; border-radius: 50%; background: var(--harbor-glass-2); border: 1px solid var(--harbor-edge); box-sizing: border-box; }
	.wd.ok { background: var(--harbor-mint); border: 0; }
	.wd.wait { background: var(--harbor-amber); border: 0; }
	.wd.fail { background: var(--harbor-red); border: 0; box-shadow: 0 0 8px var(--harbor-red); }
	.wd.idle { background: #8d93a8; border: 0; opacity: 0.6; }
	.wk { font: 600 11px/1.3 var(--font-ui); color: var(--text-faint); }
	.key { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: -4px 0 0; font: 500 12px/1.4 var(--font-ui); color: var(--text-faint); }
	.k { display: inline-block; width: 10px; height: 10px; margin-left: 8px; box-shadow: none !important; }
	.k:first-child { margin-left: 0; }

	.issues { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
	.issues li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; border-radius: 16px; border-inline-start: 4px solid var(--harbor-amber); }
	.issues li.fail { border-inline-start-color: var(--harbor-red); }
	.words { min-width: 0; }
	.what { margin: 0; font: 500 14px/1.35 var(--font-ui); color: var(--text); }
	.why { margin: 2px 0 0; font: 500 13px/1.4 var(--font-ui); color: var(--text-muted); overflow-wrap: anywhere; }

	/* Six colourful settings tiles, each opening its group. */
	.sgroups { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px; }
	.sg { position: relative; display: grid; gap: 10px; align-content: start; padding: 16px; border-radius: 18px; overflow: hidden; color: var(--text); text-decoration: none; font: 700 15px/1.25 var(--font-ui); transition: transform 160ms var(--ease-out, ease-out); }
	.sg:hover { transform: translateY(-2px); }
	.badge { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px; background: var(--c); color: #0b1220; box-shadow: 0 6px 18px -4px var(--c); }
	.c-pink { --c: var(--harbor-pink); }
	.c-violet { --c: var(--harbor-violet); }
	.c-sky { --c: var(--harbor-sky); }
	.c-aqua { --c: var(--harbor-aqua); }
	.c-mint { --c: var(--harbor-mint); }
	.c-amber { --c: var(--harbor-amber); }

	/* Jobs: today's line, then one list for everything Harbor does by itself. */
	.jobs { border-radius: 20px; overflow: hidden; }
	.jrow { display: grid; grid-template-columns: minmax(0, 1fr) 150px 150px 96px; align-items: center; gap: 12px; padding: 10px 18px; border-top: 1px solid var(--harbor-edge); font: 500 14px/1.35 var(--font-ui); color: var(--text-muted); }
	.jrow.head { border-top: 0; background: var(--harbor-glass-2); font: 700 12px/1 var(--font-ui); letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-faint); }
	.jname { display: grid; gap: 2px; min-width: 0; }
	.jname strong { font: 600 15px/1.25 var(--font-display); color: var(--text); }
	.jname em { font: 500 12px/1.35 var(--font-ui); font-style: normal; color: var(--text-faint); }
	.jrow.fail .note { color: var(--fail-text); }
	.jrow.fail { box-shadow: inset 4px 0 0 var(--harbor-red); }
	.jrow.busy { background: color-mix(in srgb, var(--harbor-violet) 12%, transparent); }
	.jrow.idle strong { color: var(--text-muted); }
	.jact { display: flex; justify-content: flex-end; }

	/* Downloads: three cards. */
	.pane-top { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
	.sentence { margin: 0; font: 700 clamp(20px, 2vw, 24px)/1.25 var(--font-display); color: var(--text); }
	.sentence.bad { color: var(--fail-text); }
	.cols { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; align-items: start; }
	.tcard { display: grid; gap: 10px; padding: 16px; border: 1px solid var(--harbor-edge); border-radius: 20px; background: var(--harbor-glass); min-width: 0; }
	.tcard.sea { background: var(--sea); }
	.tcard.sand { background: var(--sand); }
	.tcard h2 { font-size: 18px; align-items: center; gap: 8px; }
	.lines { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
	.lines li { display: grid; gap: 2px; padding: 8px 10px; border: 1px solid var(--harbor-edge); border-radius: 12px; background: var(--harbor-glass-2); min-width: 0; }
	.lines li.fail { border-inline-start: 4px solid var(--harbor-red); }
	.lname { font: 600 14px/1.3 var(--font-display); color: var(--text); overflow-wrap: anywhere; }
	.lsub { margin: 0; font: 500 12px/1.35 var(--font-ui); color: var(--text-muted); overflow-wrap: anywhere; }
	.bar { height: 5px; margin-top: 4px; border-radius: 5px; background: var(--harbor-glass-2); overflow: hidden; }
	.bar span { display: block; height: 100%; border-radius: inherit; background: var(--harbor-grad); }
	.none { margin: 0; font: 500 13px/1.4 var(--font-ui); color: var(--text-faint); }
	.warn { margin: 0; font: 600 13px/1.4 var(--font-ui); color: var(--fail-text); }

	/* Rules: sentences with underlined words. */
	.rules { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
	.rule { display: grid; gap: 10px; align-content: start; padding: 18px; border: 1px solid var(--harbor-edge); border-radius: 20px; background: var(--harbor-glass); }
	.rule h2 { font-size: 18px; }
	.says { margin: 0; font: 500 17px/1.75 var(--font-ui); color: var(--text); }
	.word { display: inline; padding: 0; border: 0; background: none; font: inherit; font-weight: 700; color: var(--accent-text); text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 4px; cursor: pointer; }
	span.word { cursor: default; color: var(--text); }
	.word.off { text-decoration-style: dashed; color: var(--text-muted); }
	.word:hover:not(span) { background: color-mix(in srgb, var(--accent) 12%, transparent); }
	.pick, .num input { min-height: 34px; padding: 0 8px; border: 1px solid var(--line-strong); border-radius: 8px; background: var(--surface-1); color: var(--text); font: 600 15px/1 var(--font-ui); }
	.num { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 15px; }
	.num input { width: 84px; }

	.old { display: grid; gap: 8px; margin-top: 8px; padding: 18px; border: 1px dashed var(--harbor-edge); border-radius: 20px; }
	.old label { font: 500 13px/1.4 var(--font-ui); color: var(--text-muted); }
	.old input { max-width: 420px; min-height: 40px; padding: 0 14px; border: 1px solid var(--harbor-edge); border-radius: 99px; background: var(--harbor-glass); color: var(--text); font: 500 15px/1 var(--font-ui); }
	.olds { display: grid; gap: 6px; margin: 4px 0 0; padding: 0; list-style: none; }
	.olds li { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font: 500 14px/1.4 var(--font-ui); color: var(--text-muted); }
	.olds a { color: var(--accent-text); font-weight: 600; }

	@media (max-width: 1100px) {
		.tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
		.sgroups { grid-template-columns: repeat(3, minmax(0, 1fr)); }
	}
	@media (max-width: 899px) {
		.cols, .rules { grid-template-columns: 1fr; }
		.jrow { grid-template-columns: 1fr auto; gap: 4px 12px; }
		.jrow.head { display: none; }
		.jname { grid-column: 1 / -1; }
		.jrow [data-label]::before { content: attr(data-label) ': '; color: var(--text-faint); }
		.jact { grid-column: 1 / -1; justify-content: flex-start; }
		.jact:empty { display: none; }
	}
	@media (max-width: 767px) {
		.harbor-tower { padding: 12px 0 96px; }
		.hero { flex-direction: column; align-items: flex-start; gap: 8px; }
		.orb { width: 150px; height: 150px; align-self: center; }
		.ball { inset: 12px; }
		.in b { font-size: 40px; }
		.in small { font-size: 12px; max-width: 100px; }
		.hero h1 { font-size: 30px; }
		.line { font-size: 15px; }
		.issue { flex-wrap: wrap; }
		.tiles { grid-template-columns: 1fr; }
		.sgroups { grid-template-columns: repeat(2, minmax(0, 1fr)); }
		.says { font-size: 16px; }
	}
	@media (prefers-reduced-motion: reduce) {
		.ball { animation: none; }
		.tile, .sg { transition: none; }
	}
</style>
