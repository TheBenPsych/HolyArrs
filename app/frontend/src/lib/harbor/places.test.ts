import { describe, expect, it } from 'vitest';
import { harborNav, type HarborSection } from './nav.ts';
import { harborPlaces, harborTabs, placeHere } from './places.ts';

// What buildNav gives an owner (routes/(frame)/nav.ts), trimmed to the parts Harbor reads.
const owner: HarborSection[] = [
	{ id: 'top', label: null, items: [
		{ href: '/', label: 'Home', icon: 'home', need: null },
		{ href: '/explore', label: 'Explore', icon: 'compass', need: null },
		{ href: '/popular', label: 'New & popular', icon: 'sparkle', need: null }
	] },
	{ id: 'library', label: 'Library', items: [
		{ href: '/library?kind=movie', label: 'Movies', icon: 'film', need: null },
		{ href: '/library?kind=show', label: 'Shows', icon: 'tv', need: null },
		{ href: '/library?kind=artist', label: 'Music', icon: 'music', need: null },
		{ href: '/library/stats', label: 'Stats', icon: 'gauge', need: 'manage_library' }
	] },
	{ id: 'yours', label: 'Yours', items: [
		{ href: '/calendar', label: 'Calendar', icon: 'calendar', need: null },
		{ href: '/requests', label: 'Requests', icon: 'requests', need: 'wishlist', badge: 3 }
	] },
	{ id: 'activity', label: 'Activity', items: [
		{ href: '/downloads', label: 'Downloads', icon: 'download', need: 'manage_library', badge: 2 },
		{ href: '/downloads/history', label: 'History', icon: 'clock', need: 'manage_library' }
	] },
	{ id: 'system', label: 'System', items: [
		{ href: '/health', label: 'Status', icon: 'shield', need: 'manage_library' },
		{ href: '/plugins', label: 'Plugins', icon: 'grid', need: 'owner' },
		{ href: '/settings', label: 'Settings', icon: 'settings', need: 'staff', dot: true }
	] }
];

const member: HarborSection[] = [
	owner[0],
	{ id: 'library', label: 'Library', items: owner[1].items.slice(0, 2) },
	{ id: 'yours', label: 'Yours', items: [
		{ href: '/downloads', label: 'Downloads', icon: 'download', need: null },
		{ href: '/calendar', label: 'Calendar', icon: 'calendar', need: null },
		{ href: '/requests', label: 'Requests', icon: 'requests', need: 'wishlist' }
	] }
];

const q = (s = '') => new URLSearchParams(s);

describe('harborPlaces', () => {
	it('gives the five places in order, each with its tabs', () => {
		const places = harborPlaces(harborNav(owner));
		expect(places.map((p) => p.label)).toEqual(['Today', 'Explore', 'Board', 'Shelves', 'Tower']);
		const tabs = Object.fromEntries(places.map((p) => [p.id, p.tabs.map((t) => t.label)]));
		expect(tabs.today).toEqual(['Today', 'Calendar']);
		expect(tabs.explore).toEqual(['Explore', 'New & popular', 'Search']);
		expect(tabs.board).toEqual(['Board', 'Requests']);
		expect(tabs.shelves).toEqual(['Everything', 'Movies', 'Shows', 'Music', 'Manga', 'Stats', 'Tidy']);
		expect(tabs.tower).toEqual(['Overview', 'Jobs', 'Downloads', 'History', 'Rules', 'Status', 'Plugins', 'Settings']);
	});
	it('loses no page the old sidebar listed', () => {
		const old = owner.flatMap((s) => s.items.map((i) => i.href));
		const now = harborPlaces(harborNav(owner)).flatMap((p) => p.tabs.map((t) => t.href));
		for (const h of old) expect(now).toContain(h);
	});
	it('carries the waiting count to Board and the settings flag to Tower', () => {
		const places = harborPlaces(harborNav(owner));
		expect(places.find((p) => p.id === 'board')?.badge).toBe(3);
		expect(places.find((p) => p.id === 'tower')?.dot).toBe(true);
	});
	it('puts a member\'s own downloads on Board and shows no Tower', () => {
		const places = harborPlaces(harborNav(member));
		expect(places.map((p) => p.id)).toEqual(['today', 'explore', 'board', 'shelves']);
		expect(places.find((p) => p.id === 'board')?.tabs.map((t) => t.href)).toContain('/downloads');
		expect(places.find((p) => p.id === 'shelves')?.tabs.map((t) => t.label)).not.toContain('Tidy');
	});
});

describe('placeHere', () => {
	const places = harborPlaces(harborNav(owner));
	it('finds the tab, query and all', () => {
		expect(placeHere(places, '/library', q('kind=show'))).toMatchObject({ place: { id: 'shelves' }, tab: '/library?kind=show' });
		expect(placeHere(places, '/tower', q('tab=jobs'))).toMatchObject({ place: { id: 'tower' }, tab: '/tower?tab=jobs' });
		expect(placeHere(places, '/tower', q())).toMatchObject({ place: { id: 'tower' }, tab: '/tower' });
		expect(placeHere(places, '/downloads/history', q())).toMatchObject({ place: { id: 'tower' }, tab: '/downloads/history' });
		expect(placeHere(places, '/', q())).toMatchObject({ place: { id: 'today' }, tab: '/' });
	});
	it('puts pages that are not tabs in their place', () => {
		expect(placeHere(places, '/title/12', q())).toMatchObject({ place: { id: 'shelves' }, tab: null });
		expect(placeHere(places, '/settings/users', q())).toMatchObject({ place: { id: 'tower' }, tab: '/settings' });
		expect(placeHere(places, '/account', q())).toEqual({ place: null, tab: null });
	});
});

describe('harborTabs', () => {
	it('puts all five places on the phone bar', () => {
		const places = harborPlaces(harborNav(owner));
		const tabs = harborTabs(places, 'tower', (h) => '/app' + h);
		expect(tabs.map((t) => t.label)).toEqual(['Today', 'Explore', 'Board', 'Shelves', 'Tower']);
		expect(tabs.map((t) => t.current)).toEqual([false, false, false, false, true]);
		expect(tabs[0].href).toBe('/app/');
	});
});
