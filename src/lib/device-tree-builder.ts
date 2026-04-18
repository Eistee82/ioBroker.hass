/**
 * Build the `devices.<device_id>.<type_channel>.*` sub-tree — type-detector
 * conform. Aggregates all entities of one HASS-device into separate channels
 * per detected device-type.
 */
import type { ObjectStore, StateWrite } from './object-store.js';
import type { HassDevice, HassEntity, HassState } from './hass-types.js';
import { detectDeviceType } from './device-type-detector.js';
import { DEVICE_TYPE_SCHEMAS, type DeviceType, type StateSchema } from './state-definitions.js';
import { rgbArrayToHex } from './rgb-converter.js';
import { sanitize } from './entity-tree-builder.js';

const DEVICES_ROOT = 'devices';

export interface DeviceTreeOptions {
    namespace: string;
    /** Custom overrides per entity_id → forced DeviceType or 'none' to skip. */
    customMappings?: Record<string, { type: DeviceType | 'none' }>;
}

export class DeviceTreeBuilder {
    constructor(
        private readonly store: ObjectStore,
        private readonly opts: DeviceTreeOptions,
    ) {}

    async applyDevice(
        device: HassDevice,
        entities: HassEntity[],
        getState: (entityId: string) => HassState | undefined,
    ): Promise<void> {
        const safeDevId = sanitize(device.id);
        const devRoot = `${this.opts.namespace}.${DEVICES_ROOT}.${safeDevId}`;
        const friendly = device.name_by_user ?? device.name ?? device.id;

        await this.store.setObject(devRoot, {
            type: 'device',
            common: { name: friendly },
            native: {
                device_id: device.id,
                manufacturer: device.manufacturer ?? '',
                model: device.model ?? '',
            },
        });

        // Group entities by detected type (or overridden type).
        const grouped = new Map<DeviceType, Array<{ entity: HassEntity; state: HassState | undefined }>>();
        for (const ent of entities) {
            const override = this.opts.customMappings?.[ent.entity_id];
            const state = getState(ent.entity_id);
            const type = override?.type === 'none' ? null : (override?.type ?? detectDeviceType(ent, state));
            if (type === null) {
                continue;
            }
            if (!grouped.has(type)) {
                grouped.set(type, []);
            }
            grouped.get(type)!.push({ entity: ent, state });
        }

        for (const [type, members] of grouped) {
            // Channel one-per-type per device. If multiple entities map to the same
            // type, we suffix the channel id with the first entity's local name.
            for (let i = 0; i < members.length; i++) {
                const m = members[i];
                const channelSuffix =
                    members.length === 1 ? type : `${type}_${sanitize(m.entity.entity_id.split('.')[1] ?? String(i))}`;
                const channelId = `${devRoot}.${channelSuffix}`;
                await this.store.setObject(channelId, {
                    type: 'channel',
                    common: { name: `${friendly} — ${type}` },
                    native: { device_type: type, entity_id: m.entity.entity_id },
                });
                await this.populateChannelStates(channelId, type, m.entity, m.state);
            }
        }
    }

    private async populateChannelStates(
        channelId: string,
        type: DeviceType,
        entity: HassEntity,
        state: HassState | undefined,
    ): Promise<void> {
        const schemas = DEVICE_TYPE_SCHEMAS[type] ?? [];
        for (const schema of schemas) {
            const stateId = `${channelId}.${schema.id}`;
            await this.store.setObject(stateId, {
                type: 'state',
                common: {
                    name: schema.description.en,
                    type: schema.type,
                    role: schema.role,
                    read: schema.read,
                    write: schema.write,
                    ...(schema.unit ? { unit: schema.unit } : {}),
                    ...(schema.min !== undefined ? { min: schema.min } : {}),
                    ...(schema.max !== undefined ? { max: schema.max } : {}),
                },
                native: { device_type: type, source_entity: entity.entity_id, state_id: schema.id },
            });
            const value = this.deriveValue(schema, type, entity, state);
            if (value !== undefined) {
                await this.store.setStateChanged(stateId, value);
            }
        }
    }

    private deriveValue(
        schema: StateSchema,
        type: DeviceType,
        _entity: HassEntity,
        state: HassState | undefined,
    ): StateWrite | undefined {
        if (!state) {
            return undefined;
        }
        const raw = state.state;
        const attrs = state.attributes;
        const key = `${type}.${schema.id}`;

        switch (key) {
            case 'light.ON_ACTUAL':
            case 'dimmer.ON_ACTUAL':
            case 'rgb.ON_ACTUAL':
                return { val: raw === 'on', ack: true };
            case 'light.ON_SET':
            case 'dimmer.ON_SET':
            case 'rgb.ON_SET':
                return undefined; // write-only, no actual value to mirror
            case 'dimmer.ACTUAL':
            case 'dimmer.SET': {
                const brightness = attrs.brightness;
                return typeof brightness === 'number'
                    ? { val: Math.round((brightness / 255) * 100), ack: true }
                    : undefined;
            }
            case 'rgb.RGB': {
                const rgb = attrs.rgb_color;
                const hex = Array.isArray(rgb) ? rgbArrayToHex(rgb as number[]) : null;
                return hex ? { val: hex, ack: true } : undefined;
            }
            case 'rgb.DIMMER': {
                const b = attrs.brightness;
                return typeof b === 'number' ? { val: Math.round((b / 255) * 100), ack: true } : undefined;
            }
            case 'socket.SET':
                return undefined;
            case 'socket.ACTUAL':
                return { val: raw === 'on', ack: true };
            case 'socket.ELECTRIC_POWER': {
                const p = attrs.current_power_w;
                return typeof p === 'number' ? { val: p, ack: true } : undefined;
            }
            case 'thermostat.SET': {
                const t = attrs.temperature;
                return typeof t === 'number' ? { val: t, ack: true } : undefined;
            }
            case 'thermostat.ACTUAL': {
                const t = attrs.current_temperature;
                return typeof t === 'number' ? { val: t, ack: true } : undefined;
            }
            case 'thermostat.MODE':
                return { val: raw, ack: true };
            case 'thermostat.HUMIDITY': {
                const h = attrs.current_humidity;
                return typeof h === 'number' ? { val: h, ack: true } : undefined;
            }
            case 'blind.SET':
            case 'blind.ACTUAL': {
                const p = attrs.current_position;
                return typeof p === 'number' ? { val: p, ack: true } : undefined;
            }
            case 'blind.TILT_SET': {
                const p = attrs.current_tilt_position;
                return typeof p === 'number' ? { val: p, ack: true } : undefined;
            }
            case 'blind.STOP':
                return undefined;
            case 'window.ACTUAL':
            case 'door.ACTUAL':
                return { val: raw === 'open' || raw === 'on', ack: true };
            case 'motion.ACTUAL':
                return { val: raw === 'on', ack: true };
            case 'temperature.ACTUAL':
            case 'humidity.ACTUAL': {
                const n = Number(raw);
                return Number.isFinite(n) ? { val: n, ack: true } : undefined;
            }
            case 'media.STATE':
                return { val: raw, ack: true };
            case 'media.VOLUME': {
                const v = attrs.volume_level;
                return typeof v === 'number' ? { val: Math.round(v * 100), ack: true } : undefined;
            }
            case 'media.MUTE': {
                const m = attrs.is_volume_muted;
                return typeof m === 'boolean' ? { val: m, ack: true } : undefined;
            }
            case 'media.ARTIST':
                return { val: typeof attrs.media_artist === 'string' ? attrs.media_artist : '', ack: true };
            case 'media.TITLE':
                return { val: typeof attrs.media_title === 'string' ? attrs.media_title : '', ack: true };
            case 'vacuum.POWER':
                return { val: raw === 'cleaning' || raw === 'on', ack: true };
            case 'vacuum.BATTERY': {
                const b = attrs.battery_level;
                return typeof b === 'number' ? { val: b, ack: true } : undefined;
            }
            case 'vacuum.STATE':
                return { val: raw, ack: true };
            case 'lock.SET':
            case 'lock.ACTUAL':
                return { val: raw === 'locked', ack: true };
            default:
                return undefined;
        }
    }
}
