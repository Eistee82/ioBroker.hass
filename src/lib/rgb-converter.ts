/**
 * Convert between HASS `rgb_color: [r, g, b]` and ioBroker hex string `#rrggbb`.
 */

export function rgbArrayToHex(rgb: readonly number[] | null | undefined): string | null {
    if (!rgb || rgb.length < 3) {
        return null;
    }
    const [r, g, b] = rgb;
    if (!isByte(r) || !isByte(g) || !isByte(b)) {
        return null;
    }
    return `#${byteHex(r)}${byteHex(g)}${byteHex(b)}`;
}

export function hexToRgbArray(hex: string | null | undefined): [number, number, number] | null {
    if (!hex) {
        return null;
    }
    const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
    if (!match) {
        return null;
    }
    return [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)];
}

function isByte(n: unknown): n is number {
    return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 255;
}

function byteHex(n: number): string {
    return n.toString(16).padStart(2, '0');
}
