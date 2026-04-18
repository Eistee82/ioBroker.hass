/**
 * Translates ioBroker state-changes (ack=false writes) into HASS `call_service`
 * invocations. Applies optimistic updates, coalesces rapid successive writes,
 * and reports timeouts/errors via the ObjectStore quality flag.
 */
import { WriteCoalescer } from './write-coalescer.js';
import { hexToRgbArray } from './rgb-converter.js';
import { errorMsg } from './errors.js';
import type { ObjectStore, StateWrite } from './object-store.js';
import type { RegistryCache } from './registry-cache.js';
import type { HassEntity } from './hass-types.js';
import type { DeviceType } from './state-definitions.js';

export interface DispatcherOptions {
    namespace: string;
    /** Coalescing window per target_entity_id. */
    coalesceMs: number;
    /** Await HASS ack for this long before timing out the write. */
    responseTimeoutMs: number;
    /** Custom mapping overrides (same shape as projector). */
    customMappings?: Record<string, { type: DeviceType | 'none' }>;
    logger?: {
        debug?(msg: string): void;
        info?(msg: string): void;
        warn?(msg: string): void;
        error?(msg: string): void;
    };
}

export interface HassServiceCaller {
    callService(domain: string, service: string, data?: Record<string, unknown>, target?: unknown): Promise<unknown>;
}

interface QueuedPayload {
    stateId: string;
    entity: HassEntity;
    value: boolean | number | string | null;
    deviceType?: DeviceType;
    stateKind?: string;
}

export class ServiceDispatcher {
    private readonly coalescer: WriteCoalescer<QueuedPayload>;

    constructor(
        private readonly client: HassServiceCaller,
        private readonly registry: RegistryCache,
        private readonly store: ObjectStore,
        private readonly opts: DispatcherOptions,
    ) {
        this.coalescer = new WriteCoalescer<QueuedPayload>(opts.coalesceMs, (key, payload) =>
            this.execute(key, payload),
        );
    }

    /**
     * Handle an ioBroker state-change (ack=false). stateId has the shape
     * `<namespace>.entities.<domain>.<id>.state|<attr>` or
     * `<namespace>.devices.<device_id>.<type>.<STATE>`.
     */
    handleStateChange(stateId: string, val: boolean | number | string | null, ack: boolean): void {
        if (ack) {
            return; // ignore our own confirmations
        }
        const parsed = this.parseStateId(stateId);
        if (!parsed) {
            this.opts.logger?.debug?.(`skip write ${stateId} — cannot resolve to HASS target`);
            return;
        }
        const entity = this.registry.getEntity(parsed.entityId);
        if (!entity) {
            this.opts.logger?.warn?.(`write ${stateId} → entity ${parsed.entityId} not in registry`);
            return;
        }
        this.opts.logger?.debug?.(
            `dispatch write: ${stateId} → ${parsed.entityId} (${parsed.deviceType ?? 'entity-tree'}.${parsed.stateKind ?? 'state'})`,
        );
        // NB: no optimistic setState here. Writing ack=false back to the same id
        // would re-trigger our own stateChange listener (infinite loop). Instead
        // we let the HASS subscribe_entities delta ack the value, and only update
        // on failure/timeout below.
        this.coalescer.push(stateId, {
            stateId,
            entity,
            value: val,
            deviceType: parsed.deviceType,
            stateKind: parsed.stateKind,
        });
    }

    flush(): void {
        this.coalescer.flush();
    }

    stop(): void {
        this.coalescer.cancel();
    }

    private async execute(_key: string, payload: QueuedPayload): Promise<void> {
        const call = this.buildCall(payload);
        if (!call) {
            this.opts.logger?.warn?.(`no service mapping for write to ${payload.stateId}`);
            await this.store.setState(payload.stateId, { val: payload.value, ack: false, q: 0x80 });
            return;
        }
        const timeoutMs = this.opts.responseTimeoutMs;
        try {
            await withTimeout(this.client.callService(call.domain, call.service, call.data, call.target), timeoutMs);
        } catch (e) {
            const isTimeout = errorMsg(e).includes('timeout');
            await this.store.setState(payload.stateId, {
                val: payload.value,
                ack: false,
                q: isTimeout ? 0x40 : 0x84,
            });
            this.opts.logger?.warn?.(`service call failed for ${payload.stateId}: ${errorMsg(e)}`);
        }
        // On success we do NOT ack here — the incoming subscribe_entities delta will do it.
    }

    private buildCall(
        payload: QueuedPayload,
    ): { domain: string; service: string; data?: Record<string, unknown>; target: { entity_id: string } } | null {
        const entityId = payload.entity.entity_id;
        const target = { entity_id: entityId };
        const domain = entityId.split('.')[0] ?? '';

        if (payload.deviceType && payload.stateKind) {
            // devices.*-tree write: use the type-specific mapping.
            return this.buildForDeviceType(payload, target, domain);
        }
        return this.buildForEntityTree(payload, target, domain);
    }

    private buildForDeviceType(
        p: QueuedPayload,
        target: { entity_id: string },
        domain: string,
    ): {
        domain: string;
        service: string;
        data?: Record<string, unknown>;
        target: { entity_id: string };
    } | null {
        const t = p.deviceType!;
        const kind = p.stateKind!;
        if (t === 'light' || t === 'dimmer' || t === 'rgb') {
            if (kind === 'ON_SET') {
                return {
                    domain: 'light',
                    service: p.value ? 'turn_on' : 'turn_off',
                    target,
                };
            }
            if (kind === 'SET' && t === 'dimmer') {
                const percent = Number(p.value ?? 0);
                const brightness = Math.max(0, Math.min(255, Math.round((percent / 100) * 255)));
                return { domain: 'light', service: 'turn_on', data: { brightness }, target };
            }
            if (kind === 'DIMMER' && t === 'rgb') {
                const percent = Number(p.value ?? 0);
                const brightness = Math.max(0, Math.min(255, Math.round((percent / 100) * 255)));
                return { domain: 'light', service: 'turn_on', data: { brightness }, target };
            }
            if (kind === 'RGB' && t === 'rgb' && typeof p.value === 'string') {
                const rgb = hexToRgbArray(p.value);
                if (!rgb) {
                    return null;
                }
                return { domain: 'light', service: 'turn_on', data: { rgb_color: rgb }, target };
            }
        }
        if (t === 'socket') {
            if (kind === 'SET') {
                return {
                    domain: domain === 'input_boolean' ? 'input_boolean' : 'switch',
                    service: p.value ? 'turn_on' : 'turn_off',
                    target,
                };
            }
        }
        if (t === 'thermostat') {
            if (kind === 'SET') {
                return {
                    domain: 'climate',
                    service: 'set_temperature',
                    data: { temperature: Number(p.value) },
                    target,
                };
            }
            if (kind === 'MODE') {
                return {
                    domain: 'climate',
                    service: 'set_hvac_mode',
                    data: { hvac_mode: String(p.value) },
                    target,
                };
            }
        }
        if (t === 'blind') {
            if (kind === 'SET') {
                return {
                    domain: 'cover',
                    service: 'set_cover_position',
                    data: { position: Number(p.value) },
                    target,
                };
            }
            if (kind === 'STOP' && p.value) {
                return { domain: 'cover', service: 'stop_cover', target };
            }
            if (kind === 'TILT_SET') {
                return {
                    domain: 'cover',
                    service: 'set_cover_tilt_position',
                    data: { tilt_position: Number(p.value) },
                    target,
                };
            }
        }
        if (t === 'media') {
            const serviceMap: Record<string, string> = {
                PLAY: 'media_play',
                PAUSE: 'media_pause',
                STOP: 'media_stop',
                NEXT: 'media_next_track',
                PREVIOUS: 'media_previous_track',
            };
            if (serviceMap[kind] && p.value) {
                return { domain: 'media_player', service: serviceMap[kind], target };
            }
            if (kind === 'VOLUME') {
                return {
                    domain: 'media_player',
                    service: 'volume_set',
                    data: { volume_level: Math.max(0, Math.min(1, Number(p.value) / 100)) },
                    target,
                };
            }
            if (kind === 'MUTE') {
                return {
                    domain: 'media_player',
                    service: 'volume_mute',
                    data: { is_volume_muted: Boolean(p.value) },
                    target,
                };
            }
        }
        if (t === 'vacuum' && kind === 'POWER') {
            return {
                domain: 'vacuum',
                service: p.value ? 'start' : 'stop',
                target,
            };
        }
        if (t === 'lock' && kind === 'SET') {
            return {
                domain: 'lock',
                service: p.value ? 'lock' : 'unlock',
                target,
            };
        }
        if (t === 'button' && kind === 'PRESS') {
            return { domain: 'button', service: 'press', target };
        }
        return null;
    }

    private buildForEntityTree(
        p: QueuedPayload,
        target: { entity_id: string },
        domain: string,
    ): {
        domain: string;
        service: string;
        data?: Record<string, unknown>;
        target: { entity_id: string };
    } | null {
        // Simple domain.state → turn_on/turn_off or toggle
        const last = p.stateId.split('.').pop();
        if (last === 'state') {
            switch (domain) {
                case 'light':
                case 'switch':
                case 'input_boolean':
                case 'fan':
                    return {
                        domain,
                        service: p.value ? 'turn_on' : 'turn_off',
                        target,
                    };
                case 'lock':
                    return { domain, service: p.value ? 'lock' : 'unlock', target };
                case 'button':
                case 'input_button':
                    return { domain, service: 'press', target };
                default:
                    return null;
            }
        }
        return null;
    }

    private parseStateId(stateId: string): { entityId: string; deviceType?: DeviceType; stateKind?: string } | null {
        const prefix = `${this.opts.namespace}.`;
        if (!stateId.startsWith(prefix)) {
            return null;
        }
        const rest = stateId.slice(prefix.length).split('.');
        if (rest[0] === 'entities') {
            // entities.<domain>.<suffix>.<kind>
            if (rest.length < 4) {
                return null;
            }
            const domain = rest[1];
            const suffix = rest[2];
            const entityId = `${domain}.${suffix}`;
            return { entityId };
        }
        if (rest[0] === 'devices') {
            // devices.<dev_id>.<channel>.<STATE>
            // Channel can be either "<type>" (single entity of that type per device)
            // or "<type>_<entity-suffix>" (multiple entities of the same type).
            if (rest.length < 4) {
                return null;
            }
            const deviceIdSafe = rest[1];
            const channelName = rest[2];
            const stateKind = rest[3];
            const device = this.registry
                .getAllDevices()
                .find(d => d.id.replace(/[^a-zA-Z0-9_]/g, '_') === deviceIdSafe);
            if (!device) {
                return null;
            }
            const entities = this.registry.getEntitiesForDevice(device.id);
            const { type, entitySuffix } = extractTypeFromChannel(channelName);
            if (!type) {
                return null;
            }
            // Prefer entity matching suffix; otherwise fall back to domain heuristic.
            const entity = entitySuffix
                ? (entities.find(
                      e => (e.entity_id.split('.')[1] ?? '').replace(/[^a-zA-Z0-9_]/g, '_') === entitySuffix,
                  ) ?? pickEntityForType(entities, type))
                : pickEntityForType(entities, type);
            if (!entity) {
                return null;
            }
            return {
                entityId: entity.entity_id,
                deviceType: type,
                stateKind,
            };
        }
        return null;
    }
}

const KNOWN_DEVICE_TYPES: ReadonlyArray<DeviceType> = [
    'rgb',
    'dimmer',
    'light',
    'socket',
    'thermostat',
    'blind',
    'window',
    'door',
    'motion',
    'temperature',
    'humidity',
    'media',
    'vacuum',
    'lock',
    'button',
];

function extractTypeFromChannel(channel: string): { type: DeviceType | null; entitySuffix: string | null } {
    // Exact match first.
    if (KNOWN_DEVICE_TYPES.includes(channel as DeviceType)) {
        return { type: channel as DeviceType, entitySuffix: null };
    }
    // Prefix match with underscore separator.
    for (const t of KNOWN_DEVICE_TYPES) {
        if (channel.startsWith(`${t}_`)) {
            return { type: t, entitySuffix: channel.slice(t.length + 1) };
        }
    }
    return { type: null, entitySuffix: null };
}

function pickEntityForType(entities: HassEntity[], type: DeviceType): HassEntity | undefined {
    const preferredDomains: Record<DeviceType, string[]> = {
        light: ['light'],
        dimmer: ['light'],
        rgb: ['light'],
        socket: ['switch', 'input_boolean'],
        thermostat: ['climate'],
        blind: ['cover'],
        window: ['cover', 'binary_sensor'],
        door: ['cover', 'binary_sensor'],
        motion: ['binary_sensor'],
        temperature: ['sensor'],
        humidity: ['sensor'],
        media: ['media_player'],
        vacuum: ['vacuum'],
        lock: ['lock'],
        button: ['button', 'input_button'],
    };
    const doms = preferredDomains[type] ?? [];
    return entities.find(e => doms.includes(e.entity_id.split('.')[0] ?? ''));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`service call timeout after ${ms}ms`)), ms);
        promise.then(
            v => {
                clearTimeout(t);
                resolve(v);
            },
            e => {
                clearTimeout(t);
                reject(e instanceof Error ? e : new Error(String(e)));
            },
        );
    });
}

export function _stateWriteAck(): StateWrite {
    return { val: null, ack: true };
}
