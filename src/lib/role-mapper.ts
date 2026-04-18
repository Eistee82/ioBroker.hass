/**
 * Heuristic mapping from HASS domain/device_class/attribute to ioBroker roles
 * for the `entities.*` mirror branch (1:1 mirror of HASS entities).
 *
 * This is distinct from the Type-Detector schemas used for `devices.*` — see
 * state-definitions.ts for that side.
 */
import type { StateRole } from './state-definitions.js';

interface RoleHint {
    role: StateRole;
    type: 'boolean' | 'number' | 'string';
    read: boolean;
    write: boolean;
    unit?: string;
}

/**
 * Map a HASS entity's primary `.state` value to an ioBroker role.
 * Only the domain and device_class are used here — attributes get their
 * own roles via roleForAttribute().
 */
export function roleForState(domain: string, deviceClass: string | null, writable: boolean): RoleHint {
    switch (domain) {
        case 'light':
            return { role: 'switch.light', type: 'boolean', read: true, write: writable };
        case 'switch':
            return { role: 'switch', type: 'boolean', read: true, write: writable };
        case 'input_boolean':
            return { role: 'switch', type: 'boolean', read: true, write: true };
        case 'binary_sensor':
            return {
                role: binarySensorRole(deviceClass),
                type: 'boolean',
                read: true,
                write: false,
            };
        case 'sensor': {
            const numericHint = numericSensorHint(deviceClass);
            return { ...numericHint, read: true, write: false };
        }
        case 'climate':
            return { role: 'level.mode.thermostat', type: 'string', read: true, write: writable };
        case 'cover':
            return coverHint(deviceClass, writable);
        case 'media_player':
            return { role: 'media.state', type: 'string', read: true, write: writable };
        case 'lock':
            return { role: 'switch.lock', type: 'boolean', read: true, write: writable };
        case 'vacuum':
            return { role: 'switch.power', type: 'boolean', read: true, write: writable };
        case 'fan':
            return { role: 'switch', type: 'boolean', read: true, write: writable };
        case 'button':
        case 'input_button':
            return { role: 'button.press', type: 'boolean', read: false, write: true };
        case 'select':
        case 'input_select':
            return { role: 'text', type: 'string', read: true, write: writable };
        case 'input_number':
        case 'number':
            return { role: 'level', type: 'number', read: true, write: writable };
        case 'input_text':
        case 'text':
            return { role: 'text', type: 'string', read: true, write: writable };
        case 'person':
        case 'device_tracker':
            return { role: 'text', type: 'string', read: true, write: false };
        default:
            return { role: 'text', type: 'string', read: true, write: writable };
    }
}

function binarySensorRole(deviceClass: string | null): StateRole {
    switch (deviceClass) {
        case 'motion':
        case 'occupancy':
        case 'presence':
            return 'sensor.motion';
        case 'door':
        case 'garage_door':
            return 'sensor.door';
        case 'window':
        case 'opening':
            return 'sensor.window';
        case 'moisture':
            return 'sensor.alarm.flood';
        case 'smoke':
        case 'gas':
            return 'sensor.alarm.fire';
        case 'light':
            return 'sensor.light';
        case 'connectivity':
            return 'indicator.connected';
        case 'battery':
            return 'indicator.lowbat';
        case 'problem':
        case 'safety':
            return 'indicator';
        default:
            return 'indicator';
    }
}

function numericSensorHint(deviceClass: string | null): Omit<RoleHint, 'read' | 'write'> {
    switch (deviceClass) {
        case 'temperature':
            return { role: 'value.temperature', type: 'number', unit: '°C' };
        case 'humidity':
            return { role: 'value.humidity', type: 'number', unit: '%' };
        case 'power':
            return { role: 'value.power', type: 'number', unit: 'W' };
        case 'energy':
            return { role: 'value.power.consumption', type: 'number', unit: 'kWh' };
        case 'battery':
            return { role: 'value.battery', type: 'number', unit: '%' };
        case 'signal_strength':
            return { role: 'value', type: 'number', unit: 'dBm' };
        case 'illuminance':
            return { role: 'value', type: 'number', unit: 'lx' };
        case 'pressure':
            return { role: 'value', type: 'number', unit: 'hPa' };
        case 'voltage':
            return { role: 'value', type: 'number', unit: 'V' };
        case 'current':
            return { role: 'value', type: 'number', unit: 'A' };
        default:
            return { role: 'value', type: 'number' };
    }
}

function coverHint(deviceClass: string | null, writable: boolean): RoleHint {
    switch (deviceClass) {
        case 'window':
        case 'awning':
            return { role: 'sensor.window', type: 'boolean', read: true, write: writable };
        case 'door':
        case 'garage':
        case 'gate':
            return { role: 'sensor.door', type: 'boolean', read: true, write: writable };
        case 'shutter':
        case 'blind':
        case 'curtain':
        case 'shade':
        default:
            return { role: 'level.blind', type: 'number', read: true, write: writable, unit: '%' };
    }
}

/**
 * Map a HASS attribute (within `attributes`) to an ioBroker role.
 * Attribute name + the entity's domain determine the role.
 */
export function roleForAttribute(domain: string, attributeName: string): RoleHint | null {
    const key = `${domain}.${attributeName}`;
    switch (key) {
        case 'light.brightness':
            return { role: 'level.dimmer', type: 'number', read: true, write: true, unit: '%' };
        case 'light.color_temp':
            return { role: 'level.color.temperature', type: 'number', read: true, write: true };
        case 'light.rgb_color':
            return { role: 'level.color.rgb', type: 'string', read: true, write: true };
        case 'climate.current_temperature':
            return { role: 'value.temperature', type: 'number', read: true, write: false, unit: '°C' };
        case 'climate.temperature':
            return { role: 'level.temperature', type: 'number', read: true, write: true, unit: '°C' };
        case 'climate.current_humidity':
            return { role: 'value.humidity', type: 'number', read: true, write: false, unit: '%' };
        case 'climate.hvac_mode':
            return { role: 'level.mode.thermostat', type: 'string', read: true, write: true };
        case 'cover.current_position':
            return { role: 'level.blind', type: 'number', read: true, write: true, unit: '%' };
        case 'cover.current_tilt_position':
            return { role: 'level.tilt', type: 'number', read: true, write: true, unit: '%' };
        case 'media_player.volume_level':
            return { role: 'level.volume', type: 'number', read: true, write: true, unit: '%' };
        case 'media_player.media_title':
            return { role: 'media.title', type: 'string', read: true, write: false };
        case 'media_player.media_artist':
            return { role: 'media.artist', type: 'string', read: true, write: false };
        case 'media_player.is_volume_muted':
            return { role: 'media.mute', type: 'boolean', read: true, write: true };
        default:
            return null;
    }
}
