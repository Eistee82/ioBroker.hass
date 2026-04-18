import { describe, it, expect } from 'vitest';
import { DeviceTreeBuilder } from '../device-tree-builder.js';
import { InMemoryObjectStore } from '../object-store.js';
import type { HassDevice, HassEntity, HassState } from '../hass-types.js';

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

const mkEntity = (entity_id: string, device_id: string, overrides: Partial<HassEntity> = {}): HassEntity => ({
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
    ...overrides,
});

const mkState = (entity_id: string, state: string, attributes: Record<string, unknown> = {}): HassState => ({
    entity_id,
    state,
    attributes,
    last_changed: '',
    last_updated: '',
    context: { id: '', parent_id: null, user_id: null },
});

describe('DeviceTreeBuilder', () => {
    it('builds a dimmer channel for a light+brightness entity', async () => {
        const store = new InMemoryObjectStore();
        const builder = new DeviceTreeBuilder(store, { namespace: NS });
        const dev = mkDevice('dev_1');
        const ent = mkEntity('light.kitchen', 'dev_1');
        const state = mkState('light.kitchen', 'on', { brightness: 127 });
        await builder.applyDevice(dev, [ent], () => state);

        expect(store.objects.get('hass.0.devices.dev_1')?.type).toBe('device');
        expect(store.objects.get('hass.0.devices.dev_1.dimmer')?.type).toBe('channel');
        expect(store.objects.get('hass.0.devices.dev_1.dimmer.ACTUAL')?.common.role).toBe('value.dimmer');
        // 127/255 ≈ 50% (rounded down to 50)
        expect(store.states.get('hass.0.devices.dev_1.dimmer.ACTUAL')?.val).toBe(50);
    });

    it('builds a thermostat channel for climate+hvac_modes entity', async () => {
        const store = new InMemoryObjectStore();
        const builder = new DeviceTreeBuilder(store, { namespace: NS });
        const dev = mkDevice('dev_2');
        const ent = mkEntity('climate.living', 'dev_2');
        const state = mkState('climate.living', 'heat', {
            hvac_modes: ['off', 'heat'],
            temperature: 21,
            current_temperature: 20.5,
            current_humidity: 45,
        });
        await builder.applyDevice(dev, [ent], () => state);

        expect(store.states.get('hass.0.devices.dev_2.thermostat.SET')?.val).toBe(21);
        expect(store.states.get('hass.0.devices.dev_2.thermostat.ACTUAL')?.val).toBe(20.5);
        expect(store.states.get('hass.0.devices.dev_2.thermostat.MODE')?.val).toBe('heat');
        expect(store.states.get('hass.0.devices.dev_2.thermostat.HUMIDITY')?.val).toBe(45);
    });

    it('builds motion channel from binary_sensor with device_class=motion', async () => {
        const store = new InMemoryObjectStore();
        const builder = new DeviceTreeBuilder(store, { namespace: NS });
        const dev = mkDevice('dev_3');
        const ent = mkEntity('binary_sensor.hall_motion', 'dev_3', { device_class: 'motion' });
        const state = mkState('binary_sensor.hall_motion', 'on');
        await builder.applyDevice(dev, [ent], () => state);
        expect(store.states.get('hass.0.devices.dev_3.motion.ACTUAL')?.val).toBe(true);
    });

    it('aggregates multiple entities of the same device into separate channels', async () => {
        const store = new InMemoryObjectStore();
        const builder = new DeviceTreeBuilder(store, { namespace: NS });
        const dev = mkDevice('dev_multi');
        const light = mkEntity('light.multi_main', 'dev_multi');
        const sensor = mkEntity('sensor.multi_temp', 'dev_multi', { device_class: 'temperature' });
        await builder.applyDevice(
            dev,
            [light, sensor],
            id => (id === 'light.multi_main'
                ? mkState('light.multi_main', 'on')
                : mkState('sensor.multi_temp', '21.3')),
        );
        expect(store.objects.get('hass.0.devices.dev_multi.light')).toBeDefined();
        expect(store.objects.get('hass.0.devices.dev_multi.temperature')).toBeDefined();
        expect(store.states.get('hass.0.devices.dev_multi.temperature.ACTUAL')?.val).toBeCloseTo(21.3);
    });

    it('skips unmappable entities without error', async () => {
        const store = new InMemoryObjectStore();
        const builder = new DeviceTreeBuilder(store, { namespace: NS });
        const dev = mkDevice('dev_weather');
        const ent = mkEntity('weather.home', 'dev_weather');
        await builder.applyDevice(dev, [ent], () => mkState('weather.home', 'sunny'));
        expect(store.objects.get('hass.0.devices.dev_weather.weather')).toBeUndefined();
        // Device root is still created.
        expect(store.objects.get('hass.0.devices.dev_weather')).toBeDefined();
    });

    it('honours a custom mapping override', async () => {
        const store = new InMemoryObjectStore();
        const builder = new DeviceTreeBuilder(store, {
            namespace: NS,
            customMappings: { 'input_boolean.urlaub': { type: 'socket' } },
        });
        const dev = mkDevice('dev_custom');
        const ent = mkEntity('input_boolean.urlaub', 'dev_custom');
        await builder.applyDevice(dev, [ent], () => mkState('input_boolean.urlaub', 'on'));
        expect(store.objects.get('hass.0.devices.dev_custom.socket')).toBeDefined();
    });

    it('honours "none" override to skip an entity entirely', async () => {
        const store = new InMemoryObjectStore();
        const builder = new DeviceTreeBuilder(store, {
            namespace: NS,
            customMappings: { 'switch.test': { type: 'none' } },
        });
        const dev = mkDevice('dev_skip');
        const ent = mkEntity('switch.test', 'dev_skip');
        await builder.applyDevice(dev, [ent], () => mkState('switch.test', 'on'));
        expect(store.objects.get('hass.0.devices.dev_skip.socket')).toBeUndefined();
    });
});
