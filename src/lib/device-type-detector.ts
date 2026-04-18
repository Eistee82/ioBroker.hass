/**
 * Heuristic classifier: HASS entity + attributes → Type-Detector device-type.
 *
 * The rules below reflect the mapping table in Spec Abschnitt 5.4 + Anhang B.
 * Order matters: more specific types are tried first (rgb before dimmer,
 * dimmer before plain light).
 */
import type { HassEntity, HassState } from './hass-types.js';
import type { DeviceType } from './state-definitions.js';

export function detectDeviceType(entity: HassEntity, state: HassState | undefined): DeviceType | null {
    const domain = entity.entity_id.split('.')[0] ?? '';
    const attrs = state?.attributes ?? {};
    const deviceClass =
        entity.device_class ?? entity.original_device_class ?? (attrs.device_class as string | undefined) ?? null;

    switch (domain) {
        case 'light': {
            const hasColor =
                Array.isArray(attrs.rgb_color) ||
                (attrs.supported_color_modes as string[] | undefined)?.some(isColorMode);
            const hasBrightness =
                'brightness' in attrs || (attrs.supported_color_modes as string[] | undefined)?.some(isBrightnessMode);
            if (hasColor) {
                return 'rgb';
            }
            if (hasBrightness) {
                return 'dimmer';
            }
            return 'light';
        }
        case 'switch':
        case 'input_boolean':
            return 'socket';
        case 'climate':
            return Array.isArray(attrs.hvac_modes) ? 'thermostat' : null;
        case 'cover':
            if (deviceClass === 'window') {
                return 'window';
            }
            if (deviceClass === 'door' || deviceClass === 'garage' || deviceClass === 'gate') {
                return 'door';
            }
            // default: anything with position is a blind, otherwise skip
            return 'current_position' in attrs ? 'blind' : null;
        case 'binary_sensor':
            switch (deviceClass) {
                case 'motion':
                case 'occupancy':
                case 'presence':
                    return 'motion';
                case 'window':
                case 'opening':
                    return 'window';
                case 'door':
                case 'garage_door':
                    return 'door';
                default:
                    return null;
            }
        case 'sensor':
            switch (deviceClass) {
                case 'temperature':
                    return 'temperature';
                case 'humidity':
                    return 'humidity';
                default:
                    return null;
            }
        case 'media_player':
            return 'media';
        case 'vacuum':
            return 'vacuum';
        case 'lock':
            return 'lock';
        case 'button':
        case 'input_button':
            return 'button';
        default:
            return null;
    }
}

function isColorMode(m: string): boolean {
    return ['rgb', 'rgbw', 'rgbww', 'hs', 'xy'].includes(m);
}

function isBrightnessMode(m: string): boolean {
    return ['brightness', 'color_temp', 'rgb', 'rgbw', 'rgbww', 'hs', 'xy', 'white'].includes(m);
}
