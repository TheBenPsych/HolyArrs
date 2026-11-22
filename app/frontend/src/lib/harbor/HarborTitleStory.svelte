<!-- Two cards under a title page's top (build list part 6):
     "How it got here", the story of the title as a picture timeline
     (asked, approved, found, downloaded, on Glowfin), and "What you have",
     the files in plain words (picture, size, sound, subtitles) instead of
     codes like "x265 DDP5.1". Ideas-2 "story" and "plainfile". -->
<script lang="ts">
	import Icon from '#lib/ui/Icon.svelte';
	import { api } from '#lib/core/api.ts';
	import { session } from '#lib/core/session.svelte.ts';
	import type { EventPage, EventRecord, TitleView } from '#lib/core/types.ts';
	import { STORY_KINDS, fileHeadline, fileLines, storySteps, type FileFacts } from './title.ts';

	let { title, name }: { title: TitleView; name: string } = $props();

	const manage = $derived(session.can('manage_library') && !session.kid);
	let events = $state<EventRecord[]>([]);
	let files = $state<FileFacts | null>(null);
	$effect(() => {
		const id = title.id;
		let live = true;
		events = [];
		files = null;
		if (manage) {
			api.get<EventPage>(`/events?title=${id}&kind=${STORY_KINDS.join(',')}&limit=200`).then(
				(r) => live && (events = r.events ?? []),
				() => {}
			);
		}
		api.get<FileFacts>(`/harbor/title-files?title=${id}`).then(
			(r) => live && (files = r),
			() => {}
		);
		return () => (live = false);
	});

	const dl = $derived(title.slots.find((s) => s.download?.active)?.download);
	const onDisk = $derived(title.kind === 'show' ? (title.show?.in_library ?? 0) > 0 : title.slots.some((s) => !!s.file));
	const moving = $derived(!!dl || (title.show?.downloading ?? 0) > 0);
	const steps = $derived(
		storySteps({
			kind: title.kind,
			asks: title.asks,
			events,
			addedAt: title.added_at,
			onDisk,
			moving,
			progress: dl?.progress,
			resolution: files?.resolution,
			sizeEach: files?.size_each,
			me: session.s.name
		})
	);
	const reached = $derived(steps.filter((s) => s.done).length);
	const lines = $derived(fileLines(files, title.kind));
	const head = $derived(fileHeadline(files, title.kind));
	const ICON = { picture: 'film', size: 'archive', sound: 'sound', subtitles: 'subtitle' } as const;
</script>

<section class="hst" aria-label="How it got here and what you have">
	<div class="hst-card story" data-testid="harbor-title-story">
		<h2>How {name} got here</h2>
		<ol class="line" style="--n: {steps.length}; --reached: {Math.max(0, reached - 1)}">
			{#each steps as s (s.key)}
				<li class="step tone-{s.tone}" class:done={s.done}>
					<span class="pip" aria-hidden="true">{#if s.done}<Icon name="check" size={18} />{/if}</span>
					<strong>{s.name}</strong>
					<small>{s.sub}</small>
				</li>
			{/each}
		</ol>
	</div>

	{#if lines.length}
		<div class="hst-card files" data-testid="harbor-title-files">
			<h2>What you have {#if head}<span>{head}</span>{/if}</h2>
			<ul>
				{#each lines as l (l.key)}
					<li class="tone-{l.tone}">
						<span class="ic" aria-hidden="true"><Icon name={ICON[l.key]} size={18} /></span>
						<span class="fw"><small>{l.label}</small><strong>{l.value}</strong></span>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</section>

<style>
	.hst { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: 18px; margin: 4px 0 26px; }
	.hst:not(:has(.files)) { grid-template-columns: minmax(0, 1fr); }
	.hst-card { min-width: 0; padding: 20px 24px 22px; border-radius: 26px; background: var(--harbor-glass); border: 1px solid var(--harbor-edge); -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px); }
	h2 { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; margin: 0 0 18px; font: 700 18px/1.25 var(--font-display); }
	h2 span { font: 500 13px/1.2 var(--font-ui); color: var(--text-muted); }

	.line { position: relative; display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: 8px; margin: 0; padding: 0; list-style: none; }
	/* The line behind the dots: faint all the way, glowing up to the last step reached. */
	.line::before, .line::after { content: ''; position: absolute; top: 19px; left: calc(100% / var(--n) / 2); height: 3px; border-radius: 3px; }
	.line::before { right: calc(100% / var(--n) / 2); background: color-mix(in srgb, var(--text) 14%, transparent); }
	.line::after { width: calc((100% - 100% / var(--n)) * var(--reached) / max(1, var(--n) - 1)); background: linear-gradient(90deg, var(--harbor-pink), var(--harbor-violet), var(--harbor-amber), var(--harbor-sky), var(--harbor-mint)); box-shadow: 0 0 10px rgb(157 107 255 / 50%); }
	.step { position: relative; z-index: 1; display: grid; justify-items: center; gap: 4px; text-align: center; min-width: 0; }
	.pip { display: grid; place-items: center; width: 40px; height: 40px; margin-bottom: 6px; border-radius: 50%; background: color-mix(in srgb, var(--bg) 80%, var(--text) 8%); border: 2px dashed color-mix(in srgb, var(--text) 28%, transparent); color: #0b1220; }
	.step.done .pip { background: var(--c); border: 0; box-shadow: 0 0 20px var(--c); }
	.step strong { font: 700 15px/1.2 var(--font-display); }
	.step small { font: 500 12px/1.3 var(--font-ui); color: var(--text-muted); overflow-wrap: anywhere; }
	.step:not(.done) strong { color: var(--text-muted); }
	.tone-pink { --c: var(--harbor-pink); }
	.tone-violet { --c: var(--harbor-violet); }
	.tone-amber { --c: var(--harbor-amber); }
	.tone-sky { --c: var(--harbor-sky); }
	.tone-mint { --c: var(--harbor-mint); }

	.files ul { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 14px; margin: 0; padding: 0; list-style: none; }
	.files li { display: flex; align-items: center; gap: 12px; min-width: 0; }
	.ic { flex: none; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 13px; background: var(--c); color: #0b1220; box-shadow: 0 6px 18px -4px var(--c); }
	.fw { display: grid; gap: 2px; min-width: 0; }
	.fw small { font: 600 11px/1.2 var(--font-ui); letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-muted); }
	.fw strong { font: 650 15px/1.3 var(--font-ui); overflow-wrap: anywhere; }

	@media (max-width: 1100px) { .hst { grid-template-columns: minmax(0, 1fr); } }
	@media (max-width: 600px) {
		.hst-card { padding: 16px 16px 18px; }
		/* On a phone the timeline runs down the screen. */
		.line { grid-template-columns: minmax(0, 1fr); gap: 14px; }
		.line::before, .line::after { display: none; }
		.step { grid-template-columns: 40px minmax(0, 1fr); justify-items: start; align-items: center; column-gap: 12px; text-align: left; }
		.pip { grid-row: span 2; margin: 0; }
		.files ul { grid-template-columns: minmax(0, 1fr); }
	}
</style>
