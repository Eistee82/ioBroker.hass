import { describe, it, expect } from 'vitest';
import { roleForAttribute, roleForState } from '../role-mapper.js';

describe('roleForState', () => {
    it('maps light domain to switch.light', () => {
        expect(roleForState('light', null, true)).toEqual({
            role: 'switch.light',
            type: 'boolean',
            read: true,
            write: true,
        });
    });

    it('maps binary_sensor device_class motion to sensor.motion', () => {
        expect(roleForState('binary_sensor', 'motion', false).role).toBe('sensor.motion');
    });

    it('maps binary_sensor device_class battery to indicator.lowbat', () => {
        expect(roleForState('binary_sensor', 'battery', false).role).toBe('indicator.lowbat');
    });

    it('maps numeric sensor with temperature device_class to value.temperature with °C', () => {
        expect(roleForState('sensor', 'temperature', false)).toMatchObject({
            role: 'value.temperature',
            unit: '°C',
            type: 'number',
            write: false,
        });
    });

    it('maps cover with device_class=window to sensor.window', () => {
        expect(roleForState('cover', 'window', true).role).toBe('sensor.window');
    });

    it('maps cover without device_class to level.blind', () => {
        expect(roleForState('cover', null, true).role).toBe('level.blind');
    });

    it('falls back to text for unknown domains', () => {
        expect(roleForState('unknown_domain', null, false).role).toBe('text');
    });
});

describe('roleForAttribute', () => {
    it('maps light.brightness to level.dimmer', () => {
        expect(roleForAttribute('light', 'brightness')).toMatchObject({
            role: 'level.dimmer',
            unit: '%',
        });
    });

    it('maps climate.current_temperature to read-only value.temperature', () => {
        expect(roleForAttribute('climate', 'current_temperature')).toMatchObject({
            role: 'value.temperature',
            write: false,
        });
    });

    it('maps media_player.is_volume_muted to media.mute', () => {
        expect(roleForAttribute('media_player', 'is_volume_muted')?.role).toBe('media.mute');
    });

    it('returns null for unknown attribute keys', () => {
        expect(roleForAttribute('foo', 'bar')).toBeNull();
    });
});
