import { describe, expect, it } from 'vitest';
import { harborTitle } from './name.ts';

describe('harborTitle', () => {
	it('names Harbor in page titles', () => {
		expect(harborTitle('Library · HolyArrs')).toBe('Library · Harbor');
		expect(harborTitle('HolyArrs')).toBe('Harbor');
	});
	it('leaves other titles alone', () => {
		expect(harborTitle('Dune · Harbor')).toBe('Dune · Harbor');
		expect(harborTitle('HolyArrsX')).toBe('HolyArrsX');
	});
});
