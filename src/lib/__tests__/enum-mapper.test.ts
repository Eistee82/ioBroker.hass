import { describe, it, expect } from 'vitest';
import { EnumMapper, type EnumMember } from '../enum-mapper.js';

const rooms: EnumMember[] = [
    { id: 'enum.rooms.wohnzimmer', name: { en: 'Living Room', de: 'Wohnzimmer' } },
    { id: 'enum.rooms.kueche', name: { en: 'Kitchen', de: 'Küche' } },
];
const functions: EnumMember[] = [
    { id: 'enum.functions.licht', name: { en: 'Light', de: 'Licht' } },
    { id: 'enum.functions.heating', name: { en: 'Heating', de: 'Heizung' } },
];

describe('EnumMapper.suggestRoom', () => {
    it('matches exact case-insensitive on any language', () => {
        const m = new EnumMapper(rooms, functions);
        expect(m.suggestRoom('Wohnzimmer')).toEqual({ enumId: 'enum.rooms.wohnzimmer', exact: true });
        expect(m.suggestRoom('living room')).toEqual({ enumId: 'enum.rooms.wohnzimmer', exact: true });
    });

    it('returns null on no match', () => {
        const m = new EnumMapper(rooms, functions);
        expect(m.suggestRoom('Büro')).toEqual({ enumId: null, exact: false });
    });

    it('handles empty/null area name gracefully', () => {
        const m = new EnumMapper(rooms, functions);
        expect(m.suggestRoom(null).enumId).toBeNull();
        expect(m.suggestRoom(undefined).enumId).toBeNull();
        expect(m.suggestRoom('').enumId).toBeNull();
    });
});

describe('EnumMapper.suggestFunction', () => {
    it('maps light domain to "Licht"', () => {
        const m = new EnumMapper(rooms, functions);
        expect(m.suggestFunction('light').enumId).toBe('enum.functions.licht');
    });

    it('maps climate domain to "Heizung"', () => {
        const m = new EnumMapper(rooms, functions);
        expect(m.suggestFunction('climate').enumId).toBe('enum.functions.heating');
    });

    it('returns null for unknown domains', () => {
        const m = new EnumMapper(rooms, functions);
        expect(m.suggestFunction('weather').enumId).toBeNull();
    });
});
