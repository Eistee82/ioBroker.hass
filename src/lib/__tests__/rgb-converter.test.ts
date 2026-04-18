import { describe, it, expect } from 'vitest';
import { rgbArrayToHex, hexToRgbArray } from '../rgb-converter.js';

describe('rgbArrayToHex', () => {
    it('converts [255, 0, 128] to #ff0080', () => {
        expect(rgbArrayToHex([255, 0, 128])).toBe('#ff0080');
    });

    it('pads single-digit components with zero', () => {
        expect(rgbArrayToHex([1, 2, 3])).toBe('#010203');
    });

    it('returns null for null/undefined/short arrays', () => {
        expect(rgbArrayToHex(null)).toBeNull();
        expect(rgbArrayToHex(undefined)).toBeNull();
        expect(rgbArrayToHex([1, 2])).toBeNull();
    });

    it('returns null for out-of-range values', () => {
        expect(rgbArrayToHex([256, 0, 0])).toBeNull();
        expect(rgbArrayToHex([-1, 0, 0])).toBeNull();
        expect(rgbArrayToHex([1.5, 0, 0])).toBeNull();
    });
});

describe('hexToRgbArray', () => {
    it('parses #ff0080 to [255, 0, 128]', () => {
        expect(hexToRgbArray('#ff0080')).toEqual([255, 0, 128]);
    });

    it('works without leading hash', () => {
        expect(hexToRgbArray('010203')).toEqual([1, 2, 3]);
    });

    it('is case-insensitive', () => {
        expect(hexToRgbArray('#FF00AA')).toEqual([255, 0, 170]);
    });

    it('returns null for malformed input', () => {
        expect(hexToRgbArray(null)).toBeNull();
        expect(hexToRgbArray('')).toBeNull();
        expect(hexToRgbArray('#xyz')).toBeNull();
        expect(hexToRgbArray('#ff00')).toBeNull();
    });
});
