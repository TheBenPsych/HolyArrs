import { describe, expect, it } from 'vitest';
import { harborNav, harborTabs, type HarborSection, type HarborTab } from './nav.ts';

const owner: HarborSection[] = [
	{ id: 'top', label: null, items: [
		{ href: '/', label: 'Home', icon: 'home', need: null },
		{ href: '/explore', label: 'Explore', icon: 'compass', need: null },
		{ href: '/popular', label: 'New & popular', icon: 'sparkle', need: null }
	] },
	{ id: 'library', label: 'Library', items: [
		{ href: '/library?kind=movie', label: 'Movies', icon: 'film', need: null },
		{ href: '/library?kind=show', label: 'Shows', icon: 'tv', need: null }
	] },
	{ id: 'yours', label: 'Yours', items: [{ href: '/requests', label: 'Requests', icon: 'requests', need: 'wishlist', badge: 3 }] },
	{ id: 'system', label: 'System', items: [
		{ href: '/health', label: 'Status', icon: 'shield', need: 'manage_library' },
		{ href: '/settings', label: 'Settings', icon: 'settings', need: 'staff', dot: true }
	] }
];

describe('harborNav', () => {
	it('puts the five places first and keeps every HolyArrs page under them', () => {
		const out = harborNav(owner);
		expect(out[0].items.map((i) => i.label)).toEqual(['Today', 'Board', 'Explore', 'Shelves', 'Tower']);
		expect(out[0].items.map((i) => i.href)).toEqual(['/', '/requests', '/explore', '/library', '/health']);
		const rest = out.slice(1).flatMap((s) => s.items.map((i) => i.href));
		expect(rest).toEqual(['/popular', '/search', '/library?kind=movie', '/library?kind=show', '/settings']);
		expect(out[1].label).toBe('More');
	});
	it('carries the waiting count to Board and the settings flag to Tower', () => {
		const [top] = harborNav(owner);
		expect(top.items[1].badge).toBe(3);
		expect(top.items[4].dot).toBe(true);
	});
	it('shows only what the person may open', () => {
		const member = owner.filter((s) => s.id !== 'system');
		const labels = harborNav(member)[0].items.map((i) => i.label);
		expect(labels).toEqual(['Today', 'Board', 'Explore', 'Shelves']);
		const noAsk: HarborSection[] = [owner[0], { id: 'yours', label: 'Yours', items: [{ href: '/downloads', label: 'Downloads', icon: 'download', need: null }] }];
		expect(harborNav(noAsk)[0].items.find((i) => i.label === 'Board')?.href).toBe('/downloads');
	});
});

describe('harborTabs', () => {
	it('uses the first four places and keeps the More tab last', () => {
		const more = { label: 'Manage', icon: 'inbox', onclick: () => {} };
		const tabs = harborTabs<HarborTab>([{ label: 'Home', icon: 'home', href: '/' }, more], harborNav(owner), (h) => h, '/settings/users');
		expect(tabs.map((t) => t.label)).toEqual(['Today', 'Board', 'Explore', 'Shelves', 'Manage']);
		expect(tabs[4].current).toBe(true);
		expect(tabs[0].current).toBe(false);
	});
});
