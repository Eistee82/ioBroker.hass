import { describe, it, expect } from 'vitest';
import { EntityTreeBuilder, sanitize } from '../entity-tree-builder.js';
import { InMemoryObjectStore } from '../object-store.js';
import type { HassEntity, HassState } from '../hass-types.js';

const NS = 'hass.0';

const mkEntity = (entity_id: string, overrides: Partial<HassEntity> = {}): HassEntity => ({
    entity_id,
    device_id: null,
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

describe('EntityTreeBuilder', () => {
    it('creates channel + .state for a simple switch', async () => {
        const store = new InMemoryObjectStore();
        const builder = new EntityTreeBuilder(store, { namespace: NS });
        await builder.apply(
            mkEntity('switch.wohnzimmer'),
            mkState('switch.wohnzimmer', 'on'),
        );
        const channel = store.objects.get('hass.0.entities.switch.wohnzimmer');
        expect(channel).toBeDefined();
        expect(channel?.type).toBe('channel');
        const state = store.objects.get('hass.0.entities.switch.wohnzimmer.state');
        expect(state?.common.role).toBe('switch');
        expect(store.states.get('hass.0.entities.switch.wohnzimmer.state')?.val).toBe(true);
    });

    it('maps light brightness attribute to level.dimmer', async () => {
        const store = new InMemoryObjectStore();
        const builder = new EntityTreeBuilder(store, { namespace: NS });
        await builder.apply(
            mkEntity('light.kitchen'),
            mkState('light.kitchen', 'on', { brightness: 128, friendly_name: 'Kitchen' }),
        );
        const brightness = store.objects.get('hass.0.entities.light.kitchen.brightness');
        expect(brightness?.common.role).toBe('level.dimmer');
        expect(store.states.get('hass.0.entities.light.kitchen.brightness')?.val).toBe(128);
        const chanName = store.objects.get('hass.0.entities.light.kitchen')?.common.name;
        expect(chanName).toBe('Kitchen');
    });

    it('sanitises non-ascii characters in entity_id suffix', () => {
        expect(sanitize('küche-haupt')).toBe('k_che_haupt');
    });

    it('stringifies unknown attributes with text role', async () => {
        const store = new InMemoryObjectStore();
        const builder = new EntityTreeBuilder(store, { namespace: NS });
        await builder.apply(
            mkEntity('sensor.energy'),
            mkState('sensor.energy', '42.5', { vendor_meta: { obj: true, list: [1, 2] } }),
        );
        const vendor = store.objects.get('hass.0.entities.sensor.vendor_meta') ?? store.objects.get('hass.0.entities.sensor.energy.vendor_meta');
        expect(vendor?.common.role).toBe('text');
        const val = store.states.get('hass.0.entities.sensor.energy.vendor_meta')?.val;
        expect(val).toBe('{"obj":true,"list":[1,2]}');
    });

    it('coerces binary_sensor state to boolean', async () => {
        const store = new InMemoryObjectStore();
        const builder = new EntityTreeBuilder(store, { namespace: NS });
        await builder.apply(
            mkEntity('binary_sensor.front_door', { device_class: 'door' }),
            mkState('binary_sensor.front_door', 'off'),
        );
        expect(store.states.get('hass.0.entities.binary_sensor.front_door.state')?.val).toBe(false);
    });

    it('treats disabled entities as read-only', async () => {
        const store = new InMemoryObjectStore();
        const builder = new EntityTreeBuilder(store, { namespace: NS });
        await builder.apply(
            mkEntity('light.old', { disabled_by: 'user' }),
            mkState('light.old', 'off'),
        );
        const state = store.objects.get('hass.0.entities.light.old.state');
        expect(state?.common.write).toBe(false);
    });
});
