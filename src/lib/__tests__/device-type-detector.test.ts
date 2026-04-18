import { describe, it, expect } from 'vitest';
import { detectDeviceType } from '../device-type-detector.js';
import type { HassEntity, HassState } from '../hass-types.js';

const mkEntity = (entity_id: string, overrides: Partial<HassEntity> = {}): HassEntity => ({
    entity_id,
    device_id: null,
    area_id: null,
    platform: 'test',
    unique_id: null,
    name: null,
    original_name: null,
    icon: null,
    original_icon: null,
    disabled_by: null,
    hidden_by: null,
    entity_category: null,
    device_class: null,
    original_device_class: null,
    unit_of_measurement: null,
    ...overrides,
});

const mkState = (entity_id: string, attributes: Record<string, unknown> = {}): HassState => ({
    entity_id,
    state: 'unknown',
    attributes,
    last_changed: '',
    last_updated: '',
    context: { id: '', parent_id: null, user_id: null },
});

describe('detectDeviceType', () => {
    it('classifies RGB light via rgb_color attribute', () => {
        expect(
            detectDeviceType(mkEntity('light.rgb'), mkState('light.rgb', { rgb_color: [255, 0, 0] })),
        ).toBe('rgb');
    });

    it('classifies RGB light via supported_color_modes', () => {
        expect(
            detectDeviceType(
                mkEntity('light.xy'),
                mkState('light.xy', { supported_color_modes: ['xy'] }),
            ),
        ).toBe('rgb');
    });

    it('classifies dimmer light via brightness', () => {
        expect(
            detectDeviceType(mkEntity('light.d'), mkState('light.d', { brightness: 128 })),
        ).toBe('dimmer');
    });

    it('classifies plain light without brightness/colour', () => {
        expect(detectDeviceType(mkEntity('light.plain'), mkState('light.plain'))).toBe('light');
    });

    it('classifies switch as socket', () => {
        expect(detectDeviceType(mkEntity('switch.x'), mkState('switch.x'))).toBe('socket');
    });

    it('classifies climate with hvac_modes as thermostat', () => {
        expect(
            detectDeviceType(
                mkEntity('climate.c'),
                mkState('climate.c', { hvac_modes: ['off', 'heat'] }),
            ),
        ).toBe('thermostat');
    });

    it('classifies cover with device_class=window as window', () => {
        expect(
            detectDeviceType(
                mkEntity('cover.w', { device_class: 'window' }),
                mkState('cover.w', { current_position: 50 }),
            ),
        ).toBe('window');
    });

    it('classifies cover with current_position as blind', () => {
        expect(
            detectDeviceType(mkEntity('cover.b'), mkState('cover.b', { current_position: 100 })),
        ).toBe('blind');
    });

    it('classifies binary_sensor device_class=motion as motion', () => {
        expect(
            detectDeviceType(
                mkEntity('binary_sensor.m', { device_class: 'motion' }),
                mkState('binary_sensor.m'),
            ),
        ).toBe('motion');
    });

    it('classifies sensor device_class=temperature as temperature', () => {
        expect(
            detectDeviceType(
                mkEntity('sensor.t', { device_class: 'temperature' }),
                mkState('sensor.t'),
            ),
        ).toBe('temperature');
    });

    it('classifies media_player as media', () => {
        expect(detectDeviceType(mkEntity('media_player.x'), mkState('media_player.x'))).toBe('media');
    });

    it('classifies vacuum as vacuum', () => {
        expect(detectDeviceType(mkEntity('vacuum.x'), mkState('vacuum.x'))).toBe('vacuum');
    });

    it('classifies lock as lock', () => {
        expect(detectDeviceType(mkEntity('lock.x'), mkState('lock.x'))).toBe('lock');
    });

    it('returns null for unknown/unmappable domains', () => {
        expect(detectDeviceType(mkEntity('weather.home'), mkState('weather.home'))).toBeNull();
        expect(detectDeviceType(mkEntity('calendar.x'), mkState('calendar.x'))).toBeNull();
    });

    it('handles missing state gracefully', () => {
        expect(detectDeviceType(mkEntity('light.x'), undefined)).toBe('light');
    });
});
