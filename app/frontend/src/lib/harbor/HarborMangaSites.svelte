<!-- Harbor: the Sites panel on the Manga shelf. It lists the manga sites the
     owner switched on in the engine and lets them say which ones Harbor
     asks, in what order, whether official sites lead, and English only.
     Harbor adds no sites itself; that is done in the engine's own page. -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { api as client, message } from '#lib/core/api.ts';
	import { sitesLine, type MangaSites, type MangaSiteRules } from './manga.ts';

	let { engine }: { engine: string } = $props();
	let view = $state<MangaSites | null>(null);
	let error = $state('');
	let saving = $state(false);

	onMount(() => {
		client.get<MangaSites>('/harbor/manga/sites').then((v) => (view = v), (e) => (error = message(e)));
	});
	async function save(rules: MangaSiteRules) {
		if (!view || saving) return;
		saving = true;
		error = '';
		try {
			view = await client.put<MangaSites>('/harbor/manga/sites', rules);
		} catch (e) {
			error = message(e);
		} finally {
			saving = false;
		}
	}
	const rules = $derived(view?.rules ?? { english_only: true, official: 'first' as const, off: [], order: [] });
	function toggle(id: string) {
		const off = rules.off.includes(id) ? rules.off.filter((x) => x !== id) : [...rules.off, id];
		void save({ ...rules, off });
	}
	function move(id: string, by: number) {
		if (!view) return;
		const ids = view.sites.map((s) => s.id);
		const at = ids.indexOf(id);
		const to = at + by;
		if (at < 0 || to < 0 || to >= ids.length) return;
		[ids[at], ids[to]] = [ids[to], ids[at]];
		void save({ ...rules, order: ids });
	}
	const official = [
		{ id: 'first', label: 'Official first', why: 'Official sites lead. Fan sites only fill the gaps.' },
		{ id: 'only', label: 'Official only', why: 'Nothing from fan sites, even if chapters are missing.' },
		{ id: 'any', label: 'My order', why: 'Only the order below decides.' }
	] as const;
</script>

<details class="harbor-manga-sites" data-testid="harbor-manga-sites">
	<summary>Sites and rules{#if view}<span class="sum">{sitesLine(view)}</span>{/if}</summary>
	{#if error}<p class="bad">Harbor could not read the sites: {error}</p>{/if}
	{#if view}
		<label class="tick">
			<input type="checkbox" checked={rules.english_only} disabled={saving} onchange={(e) => save({ ...rules, english_only: e.currentTarget.checked })} />
			<span><strong>English only.</strong> Sites in another language are never asked.</span>
		</label>
		<fieldset>
			<legend>Official releases</legend>
			{#each official as o (o.id)}
				<label class="tick">
					<input type="radio" name="harbor-manga-official" checked={rules.official === o.id} disabled={saving} onchange={() => save({ ...rules, official: o.id })} />
					<span><strong>{o.label}.</strong> {o.why}</span>
				</label>
			{/each}
		</fieldset>
		{#if view.sites.length}
			<p class="note">Your order, best first. When two sites have the same chapter, the higher one is used.</p>
			<ol>
				{#each view.sites as s, i (s.id)}
					<li class:idle={!s.asked}>
						<span class="place">{i + 1}</span>
						<span class="words">
							<span class="name">{s.name}{#if s.official}<span class="tag">Official</span>{/if}</span>
							<span class="why">{s.asked ? (s.lang.toLowerCase().startsWith('en') ? 'English' : s.lang.toUpperCase()) : s.why}</span>
						</span>
						<span class="acts">
							<button type="button" class="arrow" onclick={() => move(s.id, -1)} disabled={saving || i === 0} aria-label={`Move ${s.name} up`}>↑</button>
							<button type="button" class="arrow" onclick={() => move(s.id, 1)} disabled={saving || i === view.sites.length - 1} aria-label={`Move ${s.name} down`}>↓</button>
							<button type="button" class="onoff" class:on={!s.off} onclick={() => toggle(s.id)} disabled={saving} aria-pressed={!s.off}>{s.off ? 'Off' : 'On'}</button>
						</span>
					</li>
				{/each}
			</ol>
		{:else}
			<p class="note">No manga sites are switched on in the engine yet.</p>
		{/if}
		<p class="note">To add or remove a site itself, open <a href={engine} target="_blank" rel="noreferrer">the engine's own page</a>, then Settings, Browse, Extensions.</p>
	{:else if !error}
		<p class="note" aria-busy="true">Reading the sites…</p>
	{/if}
</details>

<style>
	.harbor-manga-sites { padding: 10px 14px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface-1); }
	summary { cursor: pointer; font: 700 15px/1.6 var(--font-display); color: var(--text); }
	.sum { margin-inline-start: 10px; font: 500 13px/1.4 var(--font-ui); color: var(--text-muted); }
	.tick { display: flex; align-items: flex-start; gap: 10px; margin-top: 10px; font: 500 14px/1.4 var(--font-ui); color: var(--text-muted); cursor: pointer; }
	.tick input { margin-top: 3px; inline-size: 18px; block-size: 18px; accent-color: var(--accent-fill); flex: none; }
	.tick strong { color: var(--text); font-weight: 600; }
	fieldset { margin: 14px 0 0; padding: 0; border: 0; }
	legend { padding: 0; font: 700 13px/1.2 var(--font-ui); color: var(--text-faint); text-transform: uppercase; letter-spacing: 0.06em; }
	.note { margin: 14px 0 0; font: 500 13px/1.45 var(--font-ui); color: var(--text-muted); }
	.note a { color: var(--accent-text); }
	.bad { margin: 10px 0 0; font: 600 13px/1.4 var(--font-ui); color: var(--fail-text); }
	ol { display: grid; gap: 6px; margin: 8px 0 0; padding: 0; list-style: none; }
	li { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 12px; background: var(--surface-2); }
	li.idle .name, li.idle .place { opacity: 0.55; }
	.place { min-width: 22px; font: 700 14px/1 var(--font-display); color: var(--text-faint); text-align: center; }
	.words { display: grid; gap: 2px; min-width: 0; }
	.name { font: 600 14px/1.3 var(--font-ui); color: var(--text); overflow-wrap: anywhere; }
	.tag { margin-inline-start: 8px; padding: 2px 7px; border-radius: 999px; background: var(--ok); color: #fff; font: 700 11px/1.3 var(--font-ui); }
	.why { font: 500 12px/1.3 var(--font-ui); color: var(--text-muted); }
	.acts { display: flex; align-items: center; gap: 6px; }
	.arrow, .onoff { height: 36px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface-1); color: var(--text); font: 600 14px/1 var(--font-ui); cursor: pointer; }
	.arrow { width: 36px; }
	.onoff { min-width: 48px; padding: 0 10px; }
	.onoff.on { border-color: transparent; background: var(--accent-fill); color: #fff; }
	.arrow:disabled, .onoff:disabled { opacity: 0.45; cursor: default; }
</style>
