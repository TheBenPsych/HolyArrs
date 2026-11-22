<!-- Harbor: Tower > Shrinker. How the night-time video shrinker on Tower is
     doing (a glowing orb and four tiles), what to look at with Fix it
     buttons, the last 7 nights, last night's files with Put back, and the
     settings. Harbor only leaves notes in Tdarr's folder; Tower's helper does
     the work within 2 minutes. Server: health/harbor_shrinker.go. -->
<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import { api, message } from '#lib/core/api.ts';
	import { session } from '#lib/core/session.svelte.ts';
	import { toasts } from '#lib/core/toasts.svelte.ts';
	import { dayName, weekDots, weekWords } from './tower-bold.ts';
	import { FLOOR_CHOICES, KEEP_CHOICES, barHeights, hourWord, hoursWords, nightName, sameSettings, sizeWord, smaller, toggleFolder, withValue, type ShrinkSettings, type ShrinkView } from './shrinker.ts';

	let view = $state<ShrinkView | null>(null);
	let failed = $state(false);
	let busy = $state('');
	let edit = $state<ShrinkSettings | null>(null);
	let showAll = $state(false);
	const canAct = $derived(session.can('settings') && !session.kid);
	const changed = $derived(!!edit && !!view?.settings && !sameSettings(edit, view.settings));
	const bars = $derived(view ? barHeights(view.nights) : []);
	const files = $derived(view ? (showAll ? view.files : view.files.slice(0, 8)) : []);
	const tdarrHref = $derived(typeof location === 'undefined' ? '#' : `${location.protocol}//${location.hostname}:8265`);
	const hours = Array.from({ length: 24 }, (_, h) => h);

	function take(v: ShrinkView) {
		view = v;
		failed = false;
		if (!changed) edit = v.settings ? { ...v.settings, folders_off: [...v.settings.folders_off] } : null;
	}

	async function load() {
		try {
			take(await api.get<ShrinkView>('/harbor/shrinker'));
		} catch {
			failed = true;
		}
	}

	async function act(key: string, body: Record<string, string>, done: string) {
		busy = key;
		try {
			take(await api.post<ShrinkView>('/harbor/shrinker/action', body));
			toasts.push(done, 'ok');
		} catch (e) {
			toasts.push('Could not ask Tower', 'fail', { body: message(e) });
		} finally {
			busy = '';
		}
	}

	async function save() {
		if (!edit) return;
		busy = 'save';
		try {
			const v = await api.put<ShrinkView>('/harbor/shrinker/settings', edit);
			edit = null;
			take(v);
			toasts.push('Saved. Tower puts the new settings in within a few minutes.', 'ok');
		} catch (e) {
			toasts.push('Could not save', 'fail', { body: message(e) });
		} finally {
			busy = '';
		}
	}

	function undo() {
		edit = view?.settings ? { ...view.settings, folders_off: [...view.settings.folders_off] } : null;
	}

	onMount(() => {
		void load();
		const t = setInterval(() => void load(), 60_000);
		return () => clearInterval(t);
	});
</script>

<section class="pane shrinker" aria-label="Shrinker" data-testid="harbor-shrinker">
	{#if !view}
		<div class="hero">
			<div class="orb idle" aria-hidden="true"><span class="ball"></span><span class="in"><b>…</b><small>checking</small></span></div>
			<div class="hero-words">
				<h1>{failed ? 'Harbor could not read the shrinker' : 'Checking the shrinker…'}</h1>
				<p class="line">{failed ? 'Try again in a minute.' : ' '}</p>
			</div>
		</div>
	{:else if !view.connected}
		<div class="hero">
			<div class="orb idle" aria-hidden="true"><span class="ball"></span><span class="in"><Icon name="plug" size={42} /><small>not linked</small></span></div>
			<div class="hero-words">
				<h1>{view.headline}</h1>
				<p class="line">{view.why}</p>
			</div>
		</div>
	{:else}
		<div class="hero">
			<div class="orb {view.tone}" aria-hidden="true">
				<span class="ball"></span>
				<span class="in"><b>{view.saved_last_gb >= 10 ? Math.round(view.saved_last_gb) : view.saved_last_gb}</b><small>GB saved last night</small></span>
			</div>
			<div class="hero-words">
				<h1>{view.headline}</h1>
				<p class="line">{view.line}</p>
				<div class="acts">
					<button type="button" class="hbtn" onclick={load} disabled={!!busy}><Icon name="refresh" size={15} />Check everything</button>
					{#if canAct}
						{#if view.skipping_tonight}
							<button type="button" class="hbtn" onclick={() => act('skip', { action: 'unskip' }, 'Tonight is back on')} disabled={!!busy}><Icon name="play" size={15} />Run tonight after all</button>
						{:else}
							<button type="button" class="hbtn" onclick={() => act('skip', { action: 'skip' }, 'Skipping tonight')} disabled={!!busy}><Icon name="moon" size={15} />Skip tonight</button>
						{/if}
					{/if}
					<a class="hbtn" href={tdarrHref} target="_blank" rel="noreferrer">Open Tdarr<Icon name="arrowUpRight" size={14} /></a>
				</div>
			</div>
		</div>

		<div class="tiles">
			{#each view.tiles as t (t.key)}
				{@const dots = weekDots([t.key], view.week, t.tone)}
				<div class="tile glass {t.tone}" data-testid="shrinker-tile">
					<span class="tt"><i class="dot" aria-hidden="true"></i><strong>{t.name}</strong></span>
					<span class="ln">{t.line}</span>
					<span class="week" role="img" aria-label="Last 7 days: {weekWords(dots)}">
						{#each dots as d, i (i)}<i class="wd {d}" title="{view.week?.days[i] ? dayName(view.week.days[i]) : ''}"></i>{/each}
					</span>
				</div>
			{/each}
		</div>

		{#if view.things.length}
			<h2>Things to look at <span>{view.things.length}</span></h2>
			<ul class="issues">
				{#each view.things as th (th.key)}
					<li class="glass {th.tone}">
						<div class="words"><p class="what"><strong>{th.title}</strong></p><p class="why">{th.line}</p></div>
						{#if canAct && th.fix && th.fix_label}
							<button type="button" class="hbtn small go-btn" onclick={() => act(th.key, { action: 'fix', fix: th.fix! }, 'Asked Tower. It does it within 2 minutes.')} disabled={!!busy}>{th.fix_label}</button>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}

		<h2>The last 7 nights <span>{sizeWord(view.saved_week_gb)} saved{view.waiting ? ` · ${view.waiting.toLocaleString()} files still waiting` : ''}</span></h2>
		<div class="nights glass" role="list">
			{#each view.nights as n, i (n.date)}
				<div class="night" role="listitem" aria-label="{nightName(n.date)}: {n.files} files, {sizeWord(n.saved_gb)} saved">
					<span class="amt">{n.saved_gb ? sizeWord(n.saved_gb) : ''}</span>
					<span class="bar-box"><span class="bar" class:last={i === view.nights.length - 1} style:height="{bars[i]}%"></span></span>
					<span class="nm">{nightName(n.date)}</span>
					<span class="cnt">{n.files ? `${n.files} files` : '—'}</span>
				</div>
			{/each}
		</div>

		<h2>Last night's files <span>{view.files.length ? `${view.files.length} shrunk · put back any that look worse` : 'none'}</span></h2>
		{#if view.files.length}
			<ul class="files">
				{#each files as f (f.path)}
					<li class="glass" class:small={f.after_gb < 0.5}>
						<div class="words">
							<p class="what"><strong>{f.name}</strong></p>
							<p class="why">{sizeWord(f.before_gb)} → {sizeWord(f.after_gb)} · {smaller(f.before_gb, f.after_gb)} · {f.at.slice(11)}</p>
						</div>
						{#if f.put_back_asked}
							<span class="note">Putting back…</span>
						{:else if f.can_put_back && canAct}
							<button type="button" class="hbtn small" onclick={() => act('put:' + f.path, { action: 'putback', path: f.path }, 'Putting the original back. It stays as it is from now on.')} disabled={!!busy}><Icon name="replay" size={14} />Put back</button>
						{:else if !f.can_put_back}
							<span class="note">Original gone</span>
						{/if}
					</li>
				{/each}
			</ul>
			{#if view.files.length > 8}
				<button type="button" class="link" onclick={() => (showAll = !showAll)}>{showAll ? 'Show fewer' : `Show all ${view.files.length}`}</button>
			{/if}
		{:else}
			<p class="quiet">Nothing was shrunk last night.</p>
		{/if}

		{#if edit}
			<h2>Settings <span>{view.settings_pending ? 'New settings on their way to Tower' : 'Tower puts changes in within a few minutes'}</span></h2>
			<div class="sets">
				<label class="set glass">
					<strong>Hours</strong>
					<span class="ln">{hoursWords(edit.night_start, edit.night_end)}</span>
					<span class="two">
						<select bind:value={edit.night_start} disabled={!canAct} aria-label="Start">{#each hours as h (h)}<option value={h}>{hourWord(h)}</option>{/each}</select>
						<span>to</span>
						<select bind:value={edit.night_end} disabled={!canAct} aria-label="End">{#each hours as h (h)}<option value={h}>{hourWord(h)}</option>{/each}</select>
					</span>
				</label>
				<label class="set glass">
					<strong>Episodes bigger than</strong>
					<span class="ln">Smaller episodes are left alone</span>
					<span class="two"><input type="number" min="0.5" max="20" step="0.1" bind:value={edit.episode_gb} disabled={!canAct} /><span>GB</span></span>
				</label>
				<label class="set glass">
					<strong>Movies bigger than</strong>
					<span class="ln">Smaller movies are left alone</span>
					<span class="two"><input type="number" min="0.5" max="50" step="0.1" bind:value={edit.movie_gb} disabled={!canAct} /><span>GB</span></span>
				</label>
				<label class="set glass">
					<strong>How small</strong>
					<span class="ln">Of the old size</span>
					<select bind:value={edit.keep_percent} disabled={!canAct}>{#each withValue(KEEP_CHOICES, edit.keep_percent, (v) => `About ${v}%`) as c (c.value)}<option value={c.value}>{c.label}</option>{/each}</select>
				</label>
				<label class="set glass">
					<strong>Never smaller than</strong>
					<span class="ln">For 1080p files</span>
					<select bind:value={edit.min_kbps_1080} disabled={!canAct}>{#each withValue(FLOOR_CHOICES, edit.min_kbps_1080, (v) => `${v} kbps`) as c (c.value)}<option value={c.value}>{c.label}</option>{/each}</select>
				</label>
				<label class="set glass">
					<strong>Keep originals for</strong>
					<span class="ln">So you can put one back</span>
					<span class="two"><input type="number" min="1" max="14" step="1" bind:value={edit.backup_days} disabled={!canAct} /><span>days</span></span>
				</label>
				<label class="set glass">
					<strong>Keep free space</strong>
					<span class="ln">Waits when the disk gets this full</span>
					<span class="two"><input type="number" min="50" max="5000" step="50" bind:value={edit.min_free_gb} disabled={!canAct} /><span>GB</span></span>
				</label>
				<label class="set glass check">
					<strong>Sound and subtitles</strong>
					<span class="ln">{edit.trim_languages ? 'Keeps English and the original language' : 'Keeps every language'}</span>
					<span class="two"><input type="checkbox" bind:checked={edit.trim_languages} disabled={!canAct} /><span>Only English and the original</span></span>
				</label>
			</div>
			{#if view.folders.length}
				<p class="sub">Folders it shrinks <span>tap to switch one off</span></p>
				<div class="chips">
					{#each view.folders as f (f)}
						{@const on = !edit.folders_off.includes(f)}
						<button type="button" class="chip" class:on aria-pressed={on} disabled={!canAct} onclick={() => edit && (edit.folders_off = toggleFolder(edit.folders_off, f))}>
							{#if on}<Icon name="check" size={14} />{/if}{f}
						</button>
					{/each}
				</div>
			{/if}
			{#if canAct && changed}
				<div class="acts save-row">
					<button type="button" class="hbtn go-btn" onclick={save} disabled={!!busy}>{busy === 'save' ? 'Saving…' : 'Save settings'}</button>
					<button type="button" class="hbtn" onclick={undo} disabled={!!busy}>Undo</button>
				</div>
			{/if}
		{/if}

		{#if view.notes.length}
			<details class="notes">
				<summary>What Tower's helper did lately</summary>
				<ul>{#each view.notes as n, i (i)}<li>{n}</li>{/each}</ul>
			</details>
		{/if}
	{/if}
</section>

<style>
	.pane { display: grid; gap: 16px; min-width: 0; }
	.pane > h2 { margin-top: 14px; }
	h1 { margin: 0; font: 800 clamp(32px, 4vw, 46px)/1.05 var(--font-display); letter-spacing: -0.025em; color: var(--text); }
	h2 { display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px; margin: 0; font: 700 21px/1.2 var(--font-display); letter-spacing: -0.015em; color: var(--text); }
	h2 span, .sub span { font: 600 14px/1.2 var(--font-ui); letter-spacing: 0; color: var(--text-muted); }
	.hbtn:focus-visible, .chip:focus-visible, .link:focus-visible { outline: none; box-shadow: var(--focus-ring); }

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
	.acts { display: flex; flex-wrap: wrap; gap: 10px; }

	.hbtn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 40px; padding: 0 16px; border: 1px solid var(--harbor-edge); border-radius: 999px; background: var(--harbor-glass); color: var(--text); font: 600 14px/1 var(--font-ui); text-decoration: none; cursor: pointer; white-space: nowrap; }
	.hbtn:hover:not(:disabled) { background: var(--harbor-glass-2); }
	.hbtn:disabled { opacity: 0.6; cursor: default; }
	.hbtn.small { min-height: 32px; padding: 0 12px; font-size: 13px; }
	.hbtn.go-btn { border: 0; background: var(--harbor-grad); color: #fff; font-weight: 700; }
	.quiet { margin: 0; font: 500 15px/1.4 var(--font-ui); color: var(--text-faint); }
	.link { justify-self: start; padding: 0; border: 0; background: none; color: var(--accent-text); font: 600 13px/1.2 var(--font-ui); cursor: pointer; }

	.tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
	.tile { display: grid; align-content: start; gap: 4px; min-width: 0; padding: 14px 16px; border-radius: 18px; color: var(--text); }
	.tile.fail { border-color: color-mix(in srgb, var(--harbor-red) 55%, transparent); }
	.tile.wait { border-color: color-mix(in srgb, var(--harbor-amber) 45%, transparent); }
	.tt { display: flex; align-items: center; gap: 10px; min-width: 0; }
	.tt strong { font: 700 15px/1.25 var(--font-display); overflow-wrap: anywhere; }
	.ln { font: 500 13px/1.35 var(--font-ui); color: var(--text-muted); overflow-wrap: anywhere; }
	.tile.fail .ln { color: var(--fail-text); }
	.dot { flex: none; width: 12px; height: 12px; border-radius: 50%; background: #8d93a8; }
	.ok > .tt .dot { background: var(--harbor-mint); box-shadow: 0 0 12px var(--harbor-mint); }
	.wait > .tt .dot { background: var(--harbor-amber); box-shadow: 0 0 12px var(--harbor-amber); }
	.fail > .tt .dot { background: var(--harbor-red); box-shadow: 0 0 12px var(--harbor-red); }
	.week { display: flex; gap: 7px; margin-top: 8px; }
	.wd { width: 10px; height: 10px; border-radius: 50%; background: var(--harbor-glass-2); border: 1px solid var(--harbor-edge); box-sizing: border-box; }
	.wd.ok { background: var(--harbor-mint); border: 0; }
	.wd.wait { background: var(--harbor-amber); border: 0; }
	.wd.fail { background: var(--harbor-red); border: 0; box-shadow: 0 0 8px var(--harbor-red); }
	.wd.idle { background: #8d93a8; border: 0; opacity: 0.6; }

	.issues, .files { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
	.issues li, .files li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; border-radius: 16px; }
	.issues li { border-inline-start: 4px solid var(--harbor-amber); }
	.issues li.fail { border-inline-start-color: var(--harbor-red); }
	.issues li.idle { border-inline-start-color: #8d93a8; }
	.files li.small { border-inline-start: 4px solid var(--harbor-amber); }
	.words { min-width: 0; flex: 1; }
	.what { margin: 0; font: 500 14px/1.35 var(--font-ui); color: var(--text); overflow-wrap: anywhere; }
	.why { margin: 2px 0 0; font: 500 13px/1.4 var(--font-ui); color: var(--text-muted); overflow-wrap: anywhere; }
	.note { flex: none; font: 600 12px/1.2 var(--font-ui); color: var(--text-faint); }

	.nights { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 10px; padding: 16px; border-radius: 20px; }
	.night { display: grid; justify-items: center; gap: 6px; min-width: 0; }
	.amt { min-height: 16px; font: 700 12px/1.3 var(--font-ui); color: var(--text); white-space: nowrap; }
	.bar-box { display: flex; align-items: flex-end; width: 100%; max-width: 46px; height: 120px; border-radius: 10px; background: var(--harbor-glass-2); overflow: hidden; }
	.bar { width: 100%; border-radius: 10px; background: color-mix(in srgb, var(--harbor-mint) 70%, var(--harbor-sky)); }
	.bar.last { background: var(--harbor-grad); }
	.nm { font: 700 13px/1.2 var(--font-ui); color: var(--text); }
	.cnt { font: 500 11px/1.2 var(--font-ui); color: var(--text-faint); white-space: nowrap; }

	.sets { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
	.set { display: grid; align-content: start; gap: 6px; min-width: 0; padding: 14px 16px; border-radius: 18px; color: var(--text); }
	.set strong { font: 700 15px/1.25 var(--font-display); }
	.two { display: flex; align-items: center; gap: 8px; font: 500 13px/1.3 var(--font-ui); color: var(--text-muted); }
	.set select, .set input[type='number'] { min-width: 0; min-height: 36px; padding: 0 10px; border: 1px solid var(--harbor-edge); border-radius: 10px; background: var(--harbor-glass-2); color: var(--text); font: 600 14px/1 var(--font-ui); }
	.set input[type='number'] { width: 90px; }
	.set > select { width: 100%; }
	.set input[type='checkbox'] { width: 20px; height: 20px; accent-color: var(--harbor-mint); }
	.sub { display: flex; gap: 10px; align-items: baseline; margin: 4px 0 0; font: 700 16px/1.2 var(--font-display); color: var(--text); }
	.chips { display: flex; flex-wrap: wrap; gap: 8px; }
	.chip { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 14px; border: 1px solid var(--harbor-edge); border-radius: 999px; background: var(--harbor-glass); color: var(--text-muted); font: 600 13px/1 var(--font-ui); cursor: pointer; }
	.chip.on { border-color: color-mix(in srgb, var(--harbor-mint) 60%, transparent); background: color-mix(in srgb, var(--harbor-mint) 16%, transparent); color: var(--text); }
	.chip:disabled { cursor: default; }
	.save-row { position: sticky; bottom: 12px; z-index: 2; }

	.notes { font: 500 13px/1.5 var(--font-ui); color: var(--text-muted); }
	.notes summary { cursor: pointer; font-weight: 700; color: var(--text); }
	.notes ul { margin: 8px 0 0; padding-left: 18px; }

	@media (max-width: 1100px) {
		.sets { grid-template-columns: repeat(2, minmax(0, 1fr)); }
	}
	@media (max-width: 899px) {
		.tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
	}
	@media (max-width: 767px) {
		.hero { flex-direction: column; align-items: flex-start; gap: 12px; }
		.orb { width: 170px; height: 170px; align-self: center; }
		.in b { font-size: 42px; }
		.nights { gap: 4px; padding: 12px 8px; }
		.bar-box { height: 90px; }
		.amt { font-size: 10px; }
		.cnt { display: none; }
		.sets { grid-template-columns: minmax(0, 1fr); }
		.files li, .issues li { flex-wrap: wrap; }
	}
	@media (max-width: 420px) {
		.tiles { grid-template-columns: minmax(0, 1fr); }
	}
	@media (prefers-reduced-motion: reduce) {
		.ball { animation: none; }
	}
</style>
