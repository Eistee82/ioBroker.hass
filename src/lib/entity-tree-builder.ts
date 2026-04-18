/**
 * Build the `entities.<domain>.<entity_id>.*` sub-tree from a HASS entity
 * and its current state. 1:1 mirror with roles picked per role-mapper.
 */
import type { ObjectDefinition, ObjectStore, StateWrite } from './object-store.js';
import type { HassEntity, HassState } from './hass-types.js';
import { roleForAttribute, roleForState } from './role-mapper.js';

const ENTITIES_ROOT = 'entities';

export interface EntityTreeOptions {
    /** Namespace prefix injected by the adapter, e.g. "hass.0". */
    namespace: string;
}

export class EntityTreeBuilder {
    constructor(
        private readonly store: ObjectStore,
        private readonly opts: EntityTreeOptions,
    ) {}

    async apply(entity: HassEntity, state: HassState | undefined): Promise<void> {
        const domain = entity.entity_id.split('.')[0] ?? 'unknown';
        const suffix = entity.entity_id.slice(domain.length + 1);
        const safeSuffix = sanitize(suffix);
        const channelId = `${this.opts.namespace}.${ENTITIES_ROOT}.${domain}.${safeSuffix}`;

        // Channel object (one per entity).
        const friendly =
            typeof state?.attributes.friendly_name === 'string'
                ? state.attributes.friendly_name
                : (entity.name ?? entity.original_name ?? entity.entity_id);
        await this.store.setObject(channelId, {
            type: 'channel',
            common: { name: friendly },
            native: { entity_id: entity.entity_id, device_id: entity.device_id ?? undefined },
        });

        // Primary .state
        const writable = !entity.disabled_by && !entity.hidden_by;
        const hint = roleForState(domain, entity.device_class ?? entity.original_device_class, writable);
        await this.store.setObject(`${channelId}.state`, {
            type: 'state',
            common: {
                name: 'state',
                type: hint.type,
                role: hint.role,
                read: hint.read,
                write: hint.write,
                ...(hint.unit ? { unit: hint.unit } : {}),
            },
            native: { primary: true },
        });
        if (state) {
            await this.store.setStateChanged(`${channelId}.state`, coerceStateValue(hint.type, state.state));
        }

        // Attributes
        if (state) {
            for (const [attrName, attrValue] of Object.entries(state.attributes)) {
                if (attrName === 'friendly_name') {
                    continue; // captured as channel name
                }
                const hintA = roleForAttribute(domain, attrName);
                const safeAttr = sanitize(attrName);
                if (hintA) {
                    await this.store.setObject(`${channelId}.${safeAttr}`, {
                        type: 'state',
                        common: {
                            name: attrName,
                            type: hintA.type,
                            role: hintA.role,
                            read: hintA.read,
                            write: hintA.write,
                            ...(hintA.unit ? { unit: hintA.unit } : {}),
                        },
                        native: { attribute: attrName },
                    });
                    await this.store.setStateChanged(
                        `${channelId}.${safeAttr}`,
                        coerceAttribute(hintA.type, attrValue),
                    );
                } else {
                    // Unknown attribute — stringify to keep something visible.
                    await this.store.setObject(`${channelId}.${safeAttr}`, {
                        type: 'state',
                        common: {
                            name: attrName,
                            type: 'string',
                            role: 'text',
                            read: true,
                            write: false,
                        },
                        native: { attribute: attrName },
                    });
                    await this.store.setStateChanged(`${channelId}.${safeAttr}`, {
                        val: stringify(attrValue),
                        ack: true,
                    });
                }
            }
        }
    }
}

export function sanitize(segment: string): string {
    return segment.replace(/[^a-zA-Z0-9_]/g, '_');
}

function coerceStateValue(type: 'boolean' | 'number' | 'string', raw: string): StateWrite {
    if (type === 'boolean') {
        return { val: isTruthyHassState(raw), ack: true };
    }
    if (type === 'number') {
        const n = Number(raw);
        return { val: Number.isFinite(n) ? n : null, ack: true };
    }
    return { val: raw, ack: true };
}

function coerceAttribute(type: 'boolean' | 'number' | 'string', raw: unknown): StateWrite {
    if (raw === null || raw === undefined) {
        return { val: null, ack: true };
    }
    if (type === 'boolean') {
        if (typeof raw === 'boolean') {
            return { val: raw, ack: true };
        }
        if (typeof raw === 'string') {
            return { val: isTruthyHassState(raw), ack: true };
        }
        return { val: null, ack: true };
    }
    if (type === 'number') {
        const n = typeof raw === 'number' ? raw : Number(raw);
        return { val: Number.isFinite(n) ? n : null, ack: true };
    }
    if (type === 'string') {
        return { val: typeof raw === 'string' ? raw : stringify(raw), ack: true };
    }
    return { val: null, ack: true };
}

function isTruthyHassState(raw: string): boolean {
    return ['on', 'open', 'home', 'unlocked', 'true', 'active', 'playing'].includes(raw.toLowerCase());
}

function stringify(v: unknown): string {
    if (v === null || v === undefined) {
        return '';
    }
    if (typeof v === 'string') {
        return v;
    }
    try {
        const s = JSON.stringify(v);
        return typeof s === 'string' ? s : '';
    } catch {
        return '';
    }
}

export function _objectDefinitionForChannel(name: string): ObjectDefinition {
    return { type: 'channel', common: { name } };
}
