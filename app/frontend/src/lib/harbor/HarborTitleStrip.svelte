<!-- Harbor's first layer on a title page: one plain sentence about where the
     title stands, a block per season for shows (green complete, magenta gaps,
     amber on the way, grey not aired), and the "More" row that opens the full
     HolyArrs tools (pick a copy, files, rule, rename) on the same page.
     Sits above the HolyArrs title page. Design: harbor-5 screen 4, harbor-6 screen 4. -->
<script lang="ts">
	import { tick } from 'svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import { session } from '#lib/core/session.svelte.ts';
	import type { TitleView } from '#lib/core/types.ts';
	import { BLOCK_WORD, seasonBlocks, titleStory, type BlockState } from './shelves.ts';

	let { title }: { title: TitleView } = $props();

	const story = $derived(titleStory(title));
	const blocks = $derived(title.kind === 'show' ? seasonBlocks(title) : []);
	const shownStates = $derived([...new Set(blocks.map((b) => b.state))] as BlockState[]);
	const manage = $derived(session.can('manage_library') && !session.kid);

	// The HolyArrs title page keeps its tools on its Library tab; each More
	// button opens that tab, then goes to (or presses) the part it names.
	type Target = { label: string; icon: 'grid' | 'copy' | 'tools' | 'tv'; find: string; press?: boolean };
	const more = $derived<Target[]>([
		{ label: 'Pick a copy yourself', icon: 'grid', find: '[data-testid="lib-pane"] .lib-status .lib-btn:not(.primary)', press: true },
		...(title.kind === 'show' ? [{ label: 'Seasons and episodes', icon: 'tv' as const, find: '[data-testid="lib-pane"] .lib-h' }] : []),
		{ label: 'Files', icon: 'copy', find: '[data-testid="version-card"]' },
		{ label: title.kind === 'show' ? 'Rule for this show' : 'Rule for this movie', icon: 'tools', find: '[data-testid="quality-row"]' },
		{ label: 'Rename', icon: 'copy', find: '[data-testid="rename-row"]', press: true }
	]);
	let hasTabs = $state(false);
	$effect(() => {
		void title.id;
		// The tabs appear once the title page has loaded the Library record.
		const look = () => (hasTabs = !!document.querySelector('[data-testid="own-tabs"]'));
		look();
		const t = setInterval(look, 800);
		return () => clearInterval(t);
	});

	async function openMore(target: Target) {
		const tabs = [...document.querySelectorAll<HTMLElement>('[data-testid="own-tabs"] [role="tab"]')];
		const lib = tabs[tabs.length - 1];
		if (lib && lib.getAttribute('aria-selected') !== 'true') lib.click();
		await tick();
		for (let i = 0; i < 20; i++) {
			const el = document.querySelector<HTMLElement>(target.find);
			if (el) {
				el.scrollIntoView({ block: 'center', behavior: 'smooth' });
				if (target.press) el.click();
				else el.focus?.({ preventScroll: true });
				return;
			}
			await new Promise((r) => setTimeout(r, 100));
		}
		document.querySelector('[data-testid="own-pane"]')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
	}
</script>

<section class="harbor-strip tone-{story.tone}" aria-label="Where this stands" data-testid="harbor-title-strip">
	<p class="sentence"><span class="dot" aria-hidden="true"></span>{story.sentence}</p>
	{#if story.facts.length}<p class="facts">{#each story.facts as f (f)}<span>{f}</span>{/each}</p>{/if}

	{#if blocks.length}
		<div class="seasons" data-testid="harbor-seasons">
			<ul class="blocks" aria-label="Seasons">
				{#each blocks as b (b.number)}
					<li class="block {b.state}" title={b.label}><span class="n">{b.number}</span><span class="sr-only">{b.label}</span></li>
				{/each}
			</ul>
			<p class="key">{#each shownStates as s (s)}<span class="k {s}"></span>{BLOCK_WORD[s]}{/each}</p>
		</div>
	{/if}

	{#if manage && hasTabs}
		<div class="more" data-testid="harbor-more">
			<span class="more-word">More</span>
			{#each more as m (m.label)}
				<button type="button" onclick={() => void openMore(m)}><Icon name={m.icon} size={15} />{m.label}</button>
			{/each}
		</div>
	{/if}
</section>

<style>
	.harbor-strip {
		--tone: var(--info);
		display: grid; grid-template-columns: minmax(0, 1fr); min-width: 0; gap: 10px; margin: 0 0 18px; padding: 14px 18px;
		border: 1px solid var(--line); border-inline-start: 4px solid var(--tone); border-radius: 14px;
		background: color-mix(in srgb, var(--tone) 7%, var(--surface-1));
	}
	.tone-landed { --tone: var(--ok); }
	.tone-moving { --tone: var(--info); }
	.tone-need { --tone: var(--accent); }
	.tone-bad { --tone: var(--fail); }
	.tone-quiet { --tone: var(--text-faint); }
	.sentence { display: flex; align-items: baseline; gap: 10px; margin: 0; font: 600 18px/1.35 var(--font-display); color: var(--text); }
	.dot { flex: none; width: 10px; height: 10px; border-radius: 50%; background: var(--tone); transform: translateY(-1px); }
	.facts { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding-inline-start: 20px; }
	.facts span { padding: 3px 9px; border-radius: 999px; background: var(--surface-2, var(--surface-1)); border: 1px solid var(--line); font: 600 12px/1.3 var(--font-ui); color: var(--text-muted); }

	.seasons { display: grid; gap: 6px; padding-inline-start: 20px; }
	.blocks { display: flex; flex-wrap: wrap; gap: 4px; margin: 0; padding: 0; list-style: none; }
	.block { display: grid; place-items: center; min-width: 26px; height: 22px; padding: 0 4px; border-radius: 5px; font: 700 11px/1 var(--font-ui); color: #fff; }
	.block.complete, .k.complete { background: var(--ok); }
	.block.gaps, .k.gaps { background: var(--accent); }
	.block.coming, .k.coming { background: var(--wait); }
	.block.unaired, .k.unaired { background: color-mix(in srgb, var(--text) 30%, transparent); }
	.block.skipped, .k.skipped { background: transparent; border: 1.5px dashed color-mix(in srgb, var(--text) 35%, transparent); color: var(--text-muted); }
	.key { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0; font: 500 12px/1 var(--font-ui); color: var(--text-faint); }
	.k { width: 10px; height: 10px; border-radius: 3px; margin-inline-start: 8px; }
	.k:first-child { margin-inline-start: 0; }

	.more { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding-top: 8px; border-top: 1px solid var(--line); }
	.more-word { font: 700 12px/1 var(--font-ui); letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-faint); margin-inline-end: 4px; }
	.more button { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface-1); color: var(--text); font: 600 13px/1 var(--font-ui); cursor: pointer; }
	.more button:hover { border-color: var(--tone); }
	.more button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

	@media (max-width: 767px) {
		.harbor-strip { padding: 12px 14px; }
		.sentence { font-size: 16px; }
		.facts, .seasons { padding-inline-start: 0; }
		.more { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; margin-inline: -14px; padding-inline: 14px; }
		.more button { flex: none; }
	}
</style>
