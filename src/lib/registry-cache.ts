import { EventEmitter } from 'node:events';
import type { HassArea, HassDevice, HassEntity, HassServices } from './hass-types.js';

/**
 * In-memory mirror of HASS registries.
 *
 * Populated once at startup via `config/area_registry/list` + `config/device_registry/list` +
 * `config/entity_registry/list` + `get_services`. Kept in sync via registry-update events.
 *
 * Consumers read via getters; write paths emit events so that ObjectProjector can
 * resync affected branches of the object tree.
 */
export class RegistryCache extends EventEmitter {
    private areas = new Map<string, HassArea>();
    private devices = new Map<string, HassDevice>();
    private entities = new Map<string, HassEntity>();
    private services: HassServices = {};

    /** Full snapshot seed — replaces previous content. */
    setAreas(areas: HassArea[]): void {
        this.areas = new Map(areas.map(a => [a.area_id, a]));
        this.emit('areas:snapshot', areas);
    }

    setDevices(devices: HassDevice[]): void {
        this.devices = new Map(devices.map(d => [d.id, d]));
        this.emit('devices:snapshot', devices);
    }

    setEntities(entities: HassEntity[]): void {
        this.entities = new Map(entities.map(e => [e.entity_id, e]));
        this.emit('entities:snapshot', entities);
    }

    setServices(services: HassServices): void {
        this.services = services;
        this.emit('services:snapshot', services);
    }

    // --- Getters ---

    getArea(id: string): HassArea | undefined {
        return this.areas.get(id);
    }

    getDevice(id: string): HassDevice | undefined {
        return this.devices.get(id);
    }

    getEntity(id: string): HassEntity | undefined {
        return this.entities.get(id);
    }

    getServices(): HassServices {
        return this.services;
    }

    getAllAreas(): HassArea[] {
        return Array.from(this.areas.values());
    }

    getAllDevices(): HassDevice[] {
        return Array.from(this.devices.values());
    }

    getAllEntities(): HassEntity[] {
        return Array.from(this.entities.values());
    }

    /** Entities belonging to a device. */
    getEntitiesForDevice(deviceId: string): HassEntity[] {
        return this.getAllEntities().filter(e => e.device_id === deviceId);
    }

    // --- Incremental updates (from registry_updated events) ---

    upsertArea(area: HassArea): void {
        const existed = this.areas.has(area.area_id);
        this.areas.set(area.area_id, area);
        this.emit(existed ? 'area:updated' : 'area:added', area);
    }

    removeArea(areaId: string): void {
        const area = this.areas.get(areaId);
        if (!area) {
            return;
        }
        this.areas.delete(areaId);
        this.emit('area:removed', area);
    }

    upsertDevice(device: HassDevice): void {
        const existed = this.devices.has(device.id);
        this.devices.set(device.id, device);
        this.emit(existed ? 'device:updated' : 'device:added', device);
    }

    removeDevice(deviceId: string): void {
        const device = this.devices.get(deviceId);
        if (!device) {
            return;
        }
        this.devices.delete(deviceId);
        this.emit('device:removed', device);
    }

    upsertEntity(entity: HassEntity): void {
        const existed = this.entities.has(entity.entity_id);
        this.entities.set(entity.entity_id, entity);
        this.emit(existed ? 'entity:updated' : 'entity:added', entity);
    }

    removeEntity(entityId: string): void {
        const entity = this.entities.get(entityId);
        if (!entity) {
            return;
        }
        this.entities.delete(entityId);
        this.emit('entity:removed', entity);
    }

    /** Clear all cached data. Used on disconnect. */
    clear(): void {
        this.areas.clear();
        this.devices.clear();
        this.entities.clear();
        this.services = {};
        this.emit('cleared');
    }
}
