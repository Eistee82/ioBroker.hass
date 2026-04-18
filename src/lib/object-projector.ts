/**
 * Orchestrates the projection of HASS entities into the ioBroker object tree.
 *
 * Reads from:
 *   - RegistryCache (seeded from config/*_registry/list)
 *   - HassWsClient subscribe_entities compressed deltas
 *
 * Writes to:
 *   - ObjectStore (ioBroker adapter bridge)
 *
 * Optional two parallel projection branches (entities.* mirror + devices.* type-detector)
 * are both updated via Promise.allSettled so that a failure in one branch does not
 * block the other.
 */
import { EntityTreeBuilder } from './entity-tree-builder.js';
import { DeviceTreeBuilder } from './device-tree-builder.js';
import { Debouncer } from './debouncer.js';
import type { ObjectStore } from './object-store.js';
import type { RegistryCache } from './registry-cache.js';
import type { CompressedState, EntityDelta, HassEntity, HassState } from './hass-types.js';
import type { DeviceType } from './state-definitions.js';
import { errorMsg } from './errors.js';

export interface ProjectorOptions {
    namespace: string;
    enableEntitiesTree: boolean;
    enableDevicesTree: boolean;
    /** Per-entity_id mapping override. */
    customMappings?: Record<string, { type: DeviceType | 'none' }>;
    /** Default debounce window for state changes (ms). */
    debounceMs: number;
    /** Glob → ms overrides. Supported: exact or `prefix.*`. */
    debounceOverrides?: Array<{ pattern: string; ms: number }>;
    /** Entity-id filter: returns true if entity should be projected. */
    shouldInclude?: (entity: HassEntity) => boolean;
    logger?: {
        debug?(msg: string): void;
        info?(msg: string): void;
        warn?(msg: string): void;
        error?(msg: string): void;
    };
}

export class ObjectProjector {
    private readonly stateCache = new Map<string, HassState>();
    private readonly debouncer: Debouncer<HassState>;
    private readonly entityBuilder: EntityTreeBuilder | null;
    private readonly deviceBuilder: DeviceTreeBuilder | null;

    constructor(
        private readonly store: ObjectStore,
        private readonly registry: RegistryCache,
        private readonly opts: ProjectorOptions,
    ) {
        this.entityBuilder = opts.enableEntitiesTree
            ? new EntityTreeBuilder(store, { namespace: opts.namespace })
            : null;
        this.deviceBuilder = opts.enableDevicesTree
            ? new DeviceTreeBuilder(store, { namespace: opts.namespace, customMappings: opts.customMappings })
            : null;
        this.debouncer = new Debouncer<HassState>(
            opts.debounceMs,
            (key, state) => this.applyEntity(key, state),
            key => this.resolveDebounceMs(key),
        );
    }

    /** Feed a compressed delta from subscribe_entities. */
    handleDelta(delta: EntityDelta): void {
        if (delta.a) {
            for (const [entityId, cs] of Object.entries(delta.a)) {
                const state = decompress(entityId, cs, undefined);
                this.stateCache.set(entityId, state);
                this.debouncer.push(entityId, state);
            }
        }
        if (delta.c) {
            for (const [entityId, change] of Object.entries(delta.c)) {
                const prev = this.stateCache.get(entityId);
                if (!prev) {
                    continue;
                }
                const state = applyChange(prev, change);
                this.stateCache.set(entityId, state);
                this.debouncer.push(entityId, state);
            }
        }
        if (delta.r) {
            for (const entityId of delta.r) {
                this.stateCache.delete(entityId);
            }
        }
    }

    /** Force flush pending debounced writes (e.g. on shutdown). */
    flush(): void {
        this.debouncer.flush();
    }

    /** Cancel pending debounced writes without firing. */
    stop(): void {
        this.debouncer.cancel();
    }

    /**
     * Remove ioBroker objects under `namespace.<root>` that are not produced by the
     * current projection. Called once after initial sync to clean up stale v2 paths.
     */
    async deleteStale(rootsToScan: Array<'entities' | 'devices'> = ['entities', 'devices']): Promise<number> {
        const wanted = new Set<string>();
        for (const [entityId, state] of this.stateCache) {
            const entity = this.registry.getEntity(entityId);
            if (!entity) {
                continue;
            }
            if (this.opts.shouldInclude && !this.opts.shouldInclude(entity)) {
                continue;
            }
            this.collectWantedIds(entity, state, wanted);
        }
        let deleted = 0;
        for (const root of rootsToScan) {
            const prefix = `${this.opts.namespace}.${root}.`;
            const existing = await this.store.listObjectIds(prefix);
            for (const id of existing) {
                if (!wanted.has(id) && !isAncestor(id, wanted)) {
                    await this.store.deleteObject(id);
                    deleted += 1;
                }
            }
        }
        return deleted;
    }

    private collectWantedIds(entity: HassEntity, _state: HassState, wanted: Set<string>): void {
        const ns = this.opts.namespace;
        if (this.entityBuilder) {
            const domain = entity.entity_id.split('.')[0] ?? 'unknown';
            const suffix = entity.entity_id.slice(domain.length + 1).replace(/[^a-zA-Z0-9_]/g, '_');
            wanted.add(`${ns}.entities.${domain}.${suffix}`);
            wanted.add(`${ns}.entities.${domain}.${suffix}.state`);
        }
        if (this.deviceBuilder && entity.device_id) {
            const devIdSafe = entity.device_id.replace(/[^a-zA-Z0-9_]/g, '_');
            wanted.add(`${ns}.devices.${devIdSafe}`);
        }
    }

    private resolveDebounceMs(key: string): number | undefined {
        const overrides = this.opts.debounceOverrides ?? [];
        for (const o of overrides) {
            if (matchPattern(o.pattern, key)) {
                return o.ms;
            }
        }
        return undefined;
    }

    private async applyEntity(entityId: string, state: HassState): Promise<void> {
        this.opts.logger?.debug?.(`applyEntity: ${entityId} state=${state.state}`);
        const entity = this.registry.getEntity(entityId);
        if (!entity) {
            this.opts.logger?.debug?.(`skip ${entityId} — not in entity registry`);
            return;
        }
        if (this.opts.shouldInclude && !this.opts.shouldInclude(entity)) {
            return;
        }
        const branches: Array<Promise<unknown>> = [];
        if (this.entityBuilder) {
            branches.push(this.entityBuilder.apply(entity, state));
        }
        if (this.deviceBuilder && entity.device_id) {
            const device = this.registry.getDevice(entity.device_id);
            if (device) {
                const deviceEntities = this.registry.getEntitiesForDevice(device.id);
                branches.push(this.deviceBuilder.applyDevice(device, deviceEntities, id => this.stateCache.get(id)));
            }
        }
        const results = await Promise.allSettled(branches);
        for (const r of results) {
            if (r.status === 'rejected') {
                this.opts.logger?.warn?.(`branch write failed for ${entityId}: ${errorMsg(r.reason)}`);
            }
        }
        this.opts.logger?.debug?.(`applyEntity done: ${entityId} branches=${branches.length}`);
    }
}

function decompress(entityId: string, cs: CompressedState, prev: HassState | undefined): HassState {
    const now = new Date().toISOString();
    return {
        entity_id: entityId,
        state: cs.s,
        attributes: cs.a ?? prev?.attributes ?? {},
        last_changed: cs.lc ? new Date(cs.lc * 1000).toISOString() : (prev?.last_changed ?? now),
        last_updated: cs.lu ? new Date(cs.lu * 1000).toISOString() : (prev?.last_updated ?? now),
        context:
            typeof cs.c === 'string'
                ? { id: cs.c, parent_id: null, user_id: null }
                : cs.c
                  ? { id: cs.c.id, parent_id: cs.c.parent_id ?? null, user_id: cs.c.user_id ?? null }
                  : (prev?.context ?? { id: '', parent_id: null, user_id: null }),
    };
}

function applyChange(
    prev: HassState,
    change: { '+'?: Partial<CompressedState> & { a?: Record<string, unknown> }; '-'?: { a?: string[] } },
): HassState {
    const nextAttrs: Record<string, unknown> = { ...prev.attributes };
    if (change['-']?.a) {
        for (const k of change['-'].a) {
            delete nextAttrs[k];
        }
    }
    if (change['+']?.a) {
        for (const [k, v] of Object.entries(change['+'].a)) {
            nextAttrs[k] = v;
        }
    }
    const now = new Date().toISOString();
    return {
        ...prev,
        state: change['+']?.s ?? prev.state,
        attributes: nextAttrs,
        last_changed: change['+']?.lc ? new Date(change['+'].lc * 1000).toISOString() : prev.last_changed,
        last_updated: change['+']?.lu ? new Date(change['+'].lu * 1000).toISOString() : now,
    };
}

function matchPattern(pattern: string, key: string): boolean {
    if (pattern === key) {
        return true;
    }
    if (pattern.endsWith('.*')) {
        return key.startsWith(pattern.slice(0, -1));
    }
    if (pattern.endsWith('*')) {
        return key.startsWith(pattern.slice(0, -1));
    }
    return false;
}

function isAncestor(id: string, wanted: Set<string>): boolean {
    // If any wanted id starts with this id + '.', keep it (it's an ancestor of a wanted child).
    for (const w of wanted) {
        if (w.startsWith(`${id}.`)) {
            return true;
        }
    }
    return false;
}
