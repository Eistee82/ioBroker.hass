import { describe, it, expect, vi } from 'vitest';
import { RegistryCache } from '../registry-cache.js';
import type { HassArea, HassDevice, HassEntity } from '../hass-types.js';

const mkArea = (id: string, name: string): HassArea => ({
    area_id: id,
    name,
    picture: null,
    icon: null,
});

const mkDevice = (id: string, areaId: string | null = null): HassDevice => ({
    id,
    area_id: areaId,
    name: `Device ${id}`,
    name_by_user: null,
    manufacturer: 'TestCo',
    model: 'T1',
    sw_version: null,
    hw_version: null,
    disabled_by: null,
    entry_type: null,
    identifiers: [],
    connections: [],
});

const mkEntity = (id: string, deviceId: string | null = null): HassEntity => ({
    entity_id: id,
    device_id: deviceId,
    area_id: null,
    platform: 'test',
    unique_id: id,
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

describe('RegistryCache', () => {
    it('stores and retrieves areas', () => {
        const cache = new RegistryCache();
        cache.setAreas([mkArea('living_room', 'Wohnzimmer'), mkArea('kitchen', 'Küche')]);
        expect(cache.getArea('living_room')?.name).toBe('Wohnzimmer');
        expect(cache.getAllAreas()).toHaveLength(2);
    });

    it('stores and retrieves devices and entities', () => {
        const cache = new RegistryCache();
        cache.setDevices([mkDevice('dev_1'), mkDevice('dev_2')]);
        cache.setEntities([mkEntity('light.a', 'dev_1'), mkEntity('sensor.b', 'dev_1'), mkEntity('sun.sun', null)]);
        expect(cache.getDevice('dev_1')?.manufacturer).toBe('TestCo');
        expect(cache.getEntitiesForDevice('dev_1')).toHaveLength(2);
        expect(cache.getEntitiesForDevice('unknown')).toHaveLength(0);
    });

    it('emits area:added on upsert of new area', () => {
        const cache = new RegistryCache();
        const handler = vi.fn();
        cache.on('area:added', handler);
        cache.upsertArea(mkArea('a', 'A'));
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0]?.[0]).toMatchObject({ area_id: 'a', name: 'A' });
    });

    it('emits area:updated on upsert of existing area', () => {
        const cache = new RegistryCache();
        cache.setAreas([mkArea('a', 'A')]);
        const added = vi.fn();
        const updated = vi.fn();
        cache.on('area:added', added);
        cache.on('area:updated', updated);
        cache.upsertArea(mkArea('a', 'A-new'));
        expect(added).not.toHaveBeenCalled();
        expect(updated).toHaveBeenCalledTimes(1);
        expect(cache.getArea('a')?.name).toBe('A-new');
    });

    it('emits area:removed and drops the area', () => {
        const cache = new RegistryCache();
        cache.setAreas([mkArea('a', 'A')]);
        const removed = vi.fn();
        cache.on('area:removed', removed);
        cache.removeArea('a');
        expect(removed).toHaveBeenCalledTimes(1);
        expect(cache.getArea('a')).toBeUndefined();
    });

    it('does not emit when removing unknown id', () => {
        const cache = new RegistryCache();
        const removed = vi.fn();
        cache.on('area:removed', removed);
        cache.removeArea('unknown');
        expect(removed).not.toHaveBeenCalled();
    });

    it('supports device and entity upsert/remove identically', () => {
        const cache = new RegistryCache();
        const devAdded = vi.fn();
        const entAdded = vi.fn();
        cache.on('device:added', devAdded);
        cache.on('entity:added', entAdded);
        cache.upsertDevice(mkDevice('d'));
        cache.upsertEntity(mkEntity('light.x', 'd'));
        expect(devAdded).toHaveBeenCalledTimes(1);
        expect(entAdded).toHaveBeenCalledTimes(1);
        cache.removeEntity('light.x');
        cache.removeDevice('d');
        expect(cache.getDevice('d')).toBeUndefined();
        expect(cache.getEntity('light.x')).toBeUndefined();
    });

    it('clear() resets everything and emits cleared', () => {
        const cache = new RegistryCache();
        cache.setAreas([mkArea('a', 'A')]);
        cache.setDevices([mkDevice('d')]);
        cache.setEntities([mkEntity('light.x', 'd')]);
        const cleared = vi.fn();
        cache.on('cleared', cleared);
        cache.clear();
        expect(cleared).toHaveBeenCalledTimes(1);
        expect(cache.getAllAreas()).toHaveLength(0);
        expect(cache.getAllDevices()).toHaveLength(0);
        expect(cache.getAllEntities()).toHaveLength(0);
    });
});
