import { describe, expect, it } from 'vitest';
import { harborNav, type HarborSection } from './nav.ts';

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
		expect(out[0].items.map((i) => i.label)).toEqual(['Today', 'Explore', 'Board', 'Shelves', 'Tower']);
		expect(out[0].items.map((i) => i.href)).toEqual(['/', '/explore', '/board', '/library', '/tower']);
		const rest = out.slice(1).flatMap((s) => s.items.map((i) => i.href));
		expect(rest).toEqual(['/popular', '/search', '/library?kind=movie', '/library?kind=show', '/requests', '/health', '/settings']);
		expect(out[1].label).toBe('More');
	});
	it('carries the waiting count to Board and the settings flag to Tower', () => {
		const [top] = harborNav(owner);
		expect(top.items[2].badge).toBe(3);
		expect(top.items[4].dot).toBe(true);
	});
	it('shows only what the person may open', () => {
		const member = owner.filter((s) => s.id !== 'system');
		const labels = harborNav(member)[0].items.map((i) => i.label);
		expect(labels).toEqual(['Today', 'Explore', 'Board', 'Shelves']);
		const noAsk: HarborSection[] = [owner[0], { id: 'yours', label: 'Yours', items: [{ href: '/downloads', label: 'Downloads', icon: 'download', need: null }] }];
		expect(harborNav(noAsk)[0].items.find((i) => i.label === 'Board')?.href).toBe('/board');
	});
});
