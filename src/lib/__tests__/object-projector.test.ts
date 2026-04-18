import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ObjectProjector } from '../object-projector.js';
import { RegistryCache } from '../registry-cache.js';
import { InMemoryObjectStore } from '../object-store.js';
import type { HassDevice, HassEntity } from '../hass-types.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const NS = 'hass.0';

const mkDevice = (id: string): HassDevice => ({
    id,
    area_id: null,
    name: `Device ${id}`,
    name_by_user: null,
    manufacturer: 'TestCo',
    model: 'M',
    sw_version: null,
    hw_version: null,
    disabled_by: null,
    entry_type: null,
    identifiers: [],
    connections: [],
});

const mkEntity = (entity_id: string, device_id: string | null): HassEntity => ({
    entity_id,
    device_id,
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
});

describe('ObjectProjector', () => {
    it('projects entities and devices in parallel after a delta snapshot', async () => {
        const store = new InMemoryObjectStore();
        const registry = new RegistryCache();
        registry.setDevices([mkDevice('dev_1')]);
        registry.setEntities([mkEntity('light.kitchen', 'dev_1')]);

        const projector = new ObjectProjector(store, registry, {
            namespace: NS,
            enableEntitiesTree: true,
            enableDevicesTree: true,
            debounceMs: 50,
        });
        projector.handleDelta({
            a: {
                'light.kitchen': {
                    s: 'on',
                    a: { brightness: 127, friendly_name: 'Kitchen' },
                },
            },
        });
        await vi.advanceTimersByTimeAsync(60);
        // Entities-tree
        expect(store.objects.get('hass.0.entities.light.kitchen')).toBeDefined();
        expect(store.states.get('hass.0.entities.light.kitchen.state')?.val).toBe(true);
        // Devices-tree
        expect(store.objects.get('hass.0.devices.dev_1.dimmer')).toBeDefined();
        expect(store.states.get('hass.0.devices.dev_1.dimmer.ACTUAL')?.val).toBe(50);
    });

    it('respects disabled trees', async () => {
        const store = new InMemoryObjectStore();
        const registry = new RegistryCache();
        registry.setDevices([mkDevice('d')]);
        registry.setEntities([mkEntity('light.x', 'd')]);
        const projector = new ObjectProjector(store, registry, {
            namespace: NS,
            enableEntitiesTree: false,
            enableDevicesTree: true,
            debounceMs: 10,
        });
        projector.handleDelta({ a: { 'light.x': { s: 'on', a: {} } } });
        await vi.advanceTimersByTimeAsync(20);
        expect(store.objects.get('hass.0.entities.light.x')).toBeUndefined();
        expect(store.objects.get('hass.0.devices.d.light')).toBeDefined();
    });

    it('applies attribute change deltas', async () => {
        const store = new InMemoryObjectStore();
        const registry = new RegistryCache();
        registry.setEntities([mkEntity('sensor.temp', null)]);
        const projector = new ObjectProjector(store, registry, {
            namespace: NS,
            enableEntitiesTree: true,
            enableDevicesTree: false,
            debounceMs: 10,
        });
        projector.handleDelta({ a: { 'sensor.temp': { s: '21.0', a: {} } } });
        await vi.advanceTimersByTimeAsync(20);
        projector.handleDelta({ c: { 'sensor.temp': { '+': { s: '22.5' } } } });
        await vi.advanceTimersByTimeAsync(20);
        expect(store.states.get('hass.0.entities.sensor.temp.state')?.val).toBe(22.5);
    });

    it('applies per-pattern debounce overrides', async () => {
        const store = new InMemoryObjectStore();
        const registry = new RegistryCache();
        registry.setEntities([mkEntity('sensor.energy_x', null)]);
        const projector = new ObjectProjector(store, registry, {
            namespace: NS,
            enableEntitiesTree: true,
            enableDevicesTree: false,
            debounceMs: 10,
            debounceOverrides: [{ pattern: 'sensor.energy_*', ms: 500 }],
        });
        projector.handleDelta({ a: { 'sensor.energy_x': { s: '1.0', a: {} } } });
        await vi.advanceTimersByTimeAsync(50);
        expect(store.states.get('hass.0.entities.sensor.energy_x.state')).toBeUndefined();
        await vi.advanceTimersByTimeAsync(500);
        expect(store.states.get('hass.0.entities.sensor.energy_x.state')?.val).toBe(1);
    });

    it('filters entities per shouldInclude callback', async () => {
        const store = new InMemoryObjectStore();
        const registry = new RegistryCache();
        registry.setEntities([mkEntity('light.keep', null), mkEntity('light.drop', null)]);
        const projector = new ObjectProjector(store, registry, {
            namespace: NS,
            enableEntitiesTree: true,
            enableDevicesTree: false,
            debounceMs: 10,
            shouldInclude: e => e.entity_id === 'light.keep',
        });
        projector.handleDelta({
            a: {
                'light.keep': { s: 'on', a: {} },
                'light.drop': { s: 'on', a: {} },
            },
        });
        await vi.advanceTimersByTimeAsync(20);
        expect(store.objects.get('hass.0.entities.light.keep')).toBeDefined();
        expect(store.objects.get('hass.0.entities.light.drop')).toBeUndefined();
    });

    it('deletes stale objects that are not part of the projection', async () => {
        const store = new InMemoryObjectStore();
        // Seed stale v2 objects
        await store.setObject('hass.0.entities.light.obsolete', {
            type: 'channel',
            common: { name: 'old' },
        });
        await store.setObject('hass.0.entities.light.obsolete.state', {
            type: 'state',
            common: { name: 'state' },
        });
        const registry = new RegistryCache();
        registry.setEntities([mkEntity('light.keep', null)]);
        const projector = new ObjectProjector(store, registry, {
            namespace: NS,
            enableEntitiesTree: true,
            enableDevicesTree: false,
            debounceMs: 10,
        });
        projector.handleDelta({ a: { 'light.keep': { s: 'on', a: {} } } });
        await vi.advanceTimersByTimeAsync(20);
        const deleted = await projector.deleteStale(['entities']);
        expect(deleted).toBeGreaterThanOrEqual(2);
        expect(store.objects.get('hass.0.entities.light.obsolete')).toBeUndefined();
        expect(store.objects.get('hass.0.entities.light.keep')).toBeDefined();
    });
});
