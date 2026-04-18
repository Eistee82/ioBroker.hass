import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ServiceDispatcher } from '../service-dispatcher.js';
import { InMemoryObjectStore } from '../object-store.js';
import { RegistryCache } from '../registry-cache.js';
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

function mkFixture() {
    const calls: Array<{ domain: string; service: string; data?: Record<string, unknown>; target?: unknown }> = [];
    const client = {
        callService: vi.fn(async (domain: string, service: string, data?: Record<string, unknown>, target?: unknown) => {
            calls.push({ domain, service, data, target });
            return {};
        }),
    };
    const registry = new RegistryCache();
    const store = new InMemoryObjectStore();
    return { client, registry, store, calls };
}

describe('ServiceDispatcher — devices.* tree writes', () => {
    it('light.ON_SET → turn_on / turn_off', async () => {
        const { client, registry, store, calls } = mkFixture();
        registry.setDevices([mkDevice('dev_1')]);
        registry.setEntities([mkEntity('light.kitchen', 'dev_1')]);
        const d = new ServiceDispatcher(client, registry, store, {
            namespace: NS,
            coalesceMs: 10,
            responseTimeoutMs: 1_000,
        });
        d.handleStateChange(`${NS}.devices.dev_1.light.ON_SET`, true, false);
        await vi.advanceTimersByTimeAsync(20);
        expect(calls[0]).toMatchObject({
            domain: 'light',
            service: 'turn_on',
            target: { entity_id: 'light.kitchen' },
        });

        d.handleStateChange(`${NS}.devices.dev_1.light.ON_SET`, false, false);
        await vi.advanceTimersByTimeAsync(20);
        expect(calls[1]?.service).toBe('turn_off');
    });

    it('dimmer.SET converts 50% to brightness=128', async () => {
        const { client, registry, store, calls } = mkFixture();
        registry.setDevices([mkDevice('dev')]);
        registry.setEntities([mkEntity('light.dim', 'dev')]);
        const d = new ServiceDispatcher(client, registry, store, {
            namespace: NS,
            coalesceMs: 10,
            responseTimeoutMs: 1_000,
        });
        d.handleStateChange(`${NS}.devices.dev.dimmer.SET`, 50, false);
        await vi.advanceTimersByTimeAsync(20);
        expect(calls[0]).toMatchObject({
            domain: 'light',
            service: 'turn_on',
            data: { brightness: 128 },
        });
    });

    it('rgb.RGB converts hex to rgb_color array', async () => {
        const { client, registry, store, calls } = mkFixture();
        registry.setDevices([mkDevice('dev')]);
        registry.setEntities([mkEntity('light.rgb', 'dev')]);
        const d = new ServiceDispatcher(client, registry, store, {
            namespace: NS,
            coalesceMs: 10,
            responseTimeoutMs: 1_000,
        });
        d.handleStateChange(`${NS}.devices.dev.rgb.RGB`, '#ff8000', false);
        await vi.advanceTimersByTimeAsync(20);
        expect(calls[0]).toMatchObject({
            domain: 'light',
            service: 'turn_on',
            data: { rgb_color: [255, 128, 0] },
        });
    });

    it('thermostat.SET calls climate.set_temperature', async () => {
        const { client, registry, store, calls } = mkFixture();
        registry.setDevices([mkDevice('dev')]);
        registry.setEntities([mkEntity('climate.home', 'dev')]);
        const d = new ServiceDispatcher(client, registry, store, {
            namespace: NS,
            coalesceMs: 10,
            responseTimeoutMs: 1_000,
        });
        d.handleStateChange(`${NS}.devices.dev.thermostat.SET`, 21.5, false);
        await vi.advanceTimersByTimeAsync(20);
        expect(calls[0]).toMatchObject({
            domain: 'climate',
            service: 'set_temperature',
            data: { temperature: 21.5 },
        });
    });

    it('thermostat.MODE calls climate.set_hvac_mode', async () => {
        const { client, registry, store, calls } = mkFixture();
        registry.setDevices([mkDevice('dev')]);
        registry.setEntities([mkEntity('climate.home', 'dev')]);
        const d = new ServiceDispatcher(client, registry, store, {
            namespace: NS,
            coalesceMs: 10,
            responseTimeoutMs: 1_000,
        });
        d.handleStateChange(`${NS}.devices.dev.thermostat.MODE`, 'heat', false);
        await vi.advanceTimersByTimeAsync(20);
        expect(calls[0]).toMatchObject({
            domain: 'climate',
            service: 'set_hvac_mode',
            data: { hvac_mode: 'heat' },
        });
    });

    it('blind.SET calls cover.set_cover_position', async () => {
        const { client, registry, store, calls } = mkFixture();
        registry.setDevices([mkDevice('dev')]);
        registry.setEntities([mkEntity('cover.blind', 'dev')]);
        const d = new ServiceDispatcher(client, registry, store, {
            namespace: NS,
            coalesceMs: 10,
            responseTimeoutMs: 1_000,
        });
        d.handleStateChange(`${NS}.devices.dev.blind.SET`, 80, false);
        await vi.advanceTimersByTimeAsync(20);
        expect(calls[0]).toMatchObject({
            domain: 'cover',
            service: 'set_cover_position',
            data: { position: 80 },
        });
    });

    it('media.PLAY triggers media_player.media_play', async () => {
        const { client, registry, store, calls } = mkFixture();
        registry.setDevices([mkDevice('dev')]);
        registry.setEntities([mkEntity('media_player.sonos', 'dev')]);
        const d = new ServiceDispatcher(client, registry, store, {
            namespace: NS,
            coalesceMs: 10,
            responseTimeoutMs: 1_000,
        });
        d.handleStateChange(`${NS}.devices.dev.media.PLAY`, true, false);
        await vi.advanceTimersByTimeAsync(20);
        expect(calls[0]).toMatchObject({ domain: 'media_player', service: 'media_play' });
    });

    it('media.VOLUME converts 50% to volume_level=0.5', async () => {
        const { client, registry, store, calls } = mkFixture();
        registry.setDevices([mkDevice('dev')]);
        registry.setEntities([mkEntity('media_player.x', 'dev')]);
        const d = new ServiceDispatcher(client, registry, store, {
            namespace: NS,
            coalesceMs: 10,
            responseTimeoutMs: 1_000,
        });
        d.handleStateChange(`${NS}.devices.dev.media.VOLUME`, 50, false);
        await vi.advanceTimersByTimeAsync(20);
        expect(calls[0]).toMatchObject({
            data: { volume_level: 0.5 },
        });
    });

    it('socket.SET uses input_boolean domain for input_boolean entity', async () => {
        const { client, registry, store, calls } = mkFixture();
        registry.setDevices([mkDevice('dev')]);
        registry.setEntities([mkEntity('input_boolean.urlaub', 'dev')]);
        const d = new ServiceDispatcher(client, registry, store, {
            namespace: NS,
            coalesceMs: 10,
            responseTimeoutMs: 1_000,
        });
        d.handleStateChange(`${NS}.devices.dev.socket.SET`, true, false);
        await vi.advanceTimersByTimeAsync(20);
        expect(calls[0]).toMatchObject({ domain: 'input_boolean', service: 'turn_on' });
    });
});

describe('ServiceDispatcher — entities.* tree writes', () => {
    it('switch.x.state maps to switch.turn_on', async () => {
        const { client, registry, store, calls } = mkFixture();
        registry.setEntities([mkEntity('switch.x', null)]);
        const d = new ServiceDispatcher(client, registry, store, {
            namespace: NS,
            coalesceMs: 10,
            responseTimeoutMs: 1_000,
        });
        d.handleStateChange(`${NS}.entities.switch.x.state`, true, false);
        await vi.advanceTimersByTimeAsync(20);
        expect(calls[0]).toMatchObject({ domain: 'switch', service: 'turn_on' });
    });

    it('button.x.state triggers button.press', async () => {
        const { client, registry, store, calls } = mkFixture();
        registry.setEntities([mkEntity('button.x', null)]);
        const d = new ServiceDispatcher(client, registry, store, {
            namespace: NS,
            coalesceMs: 10,
            responseTimeoutMs: 1_000,
        });
        d.handleStateChange(`${NS}.entities.button.x.state`, true, false);
        await vi.advanceTimersByTimeAsync(20);
        expect(calls[0]).toMatchObject({ domain: 'button', service: 'press' });
    });
});

describe('ServiceDispatcher — plumbing', () => {
    it('ignores ack=true writes', async () => {
        const { client, registry, store, calls } = mkFixture();
        registry.setEntities([mkEntity('switch.x', null)]);
        const d = new ServiceDispatcher(client, registry, store, {
            namespace: NS,
            coalesceMs: 10,
            responseTimeoutMs: 1_000,
        });
        d.handleStateChange(`${NS}.entities.switch.x.state`, true, true);
        await vi.advanceTimersByTimeAsync(20);
        expect(calls).toHaveLength(0);
    });

    it('coalesces rapid successive writes to one call', async () => {
        const { client, registry, store, calls } = mkFixture();
        registry.setDevices([mkDevice('d')]);
        registry.setEntities([mkEntity('light.x', 'd')]);
        const d = new ServiceDispatcher(client, registry, store, {
            namespace: NS,
            coalesceMs: 30,
            responseTimeoutMs: 1_000,
        });
        d.handleStateChange(`${NS}.devices.d.dimmer.SET`, 10, false);
        d.handleStateChange(`${NS}.devices.d.dimmer.SET`, 20, false);
        d.handleStateChange(`${NS}.devices.d.dimmer.SET`, 30, false);
        await vi.advanceTimersByTimeAsync(40);
        expect(calls).toHaveLength(1);
        expect(calls[0]?.data?.brightness).toBe(Math.round((30 / 100) * 255));
    });

    it('emits optimistic state immediately (ack=false)', async () => {
        const { client, registry, store } = mkFixture();
        registry.setDevices([mkDevice('d')]);
        registry.setEntities([mkEntity('light.x', 'd')]);
        const dsp = new ServiceDispatcher(client, registry, store, {
            namespace: NS,
            coalesceMs: 30,
            responseTimeoutMs: 1_000,
        });
        dsp.handleStateChange(`${NS}.devices.d.dimmer.SET`, 80, false);
        // microtask queue so that `void this.store.setState()` resolves.
        await Promise.resolve();
        const write = store.writeLog[0];
        expect(write?.value).toMatchObject({ val: 80, ack: false, q: 0 });
    });

    it('flags timeout with quality=0x40 when HASS never acks', async () => {
        const { client, registry, store } = mkFixture();
        client.callService.mockImplementationOnce(() => new Promise(() => {
            // never resolves, to simulate timeout
        }));
        registry.setDevices([mkDevice('d')]);
        registry.setEntities([mkEntity('light.x', 'd')]);
        const d = new ServiceDispatcher(client, registry, store, {
            namespace: NS,
            coalesceMs: 5,
            responseTimeoutMs: 50,
        });
        d.handleStateChange(`${NS}.devices.d.light.ON_SET`, true, false);
        await vi.advanceTimersByTimeAsync(10); // coalesce window
        await vi.advanceTimersByTimeAsync(80); // timeout window
        await Promise.resolve();
        const timeoutWrite = store.writeLog.find(w => w.value.q === 0x40);
        expect(timeoutWrite).toBeDefined();
    });

    it('skips writes when entity id cannot be resolved', async () => {
        const { client, registry, store, calls } = mkFixture();
        // registry is empty
        const d = new ServiceDispatcher(client, registry, store, {
            namespace: NS,
            coalesceMs: 10,
            responseTimeoutMs: 1_000,
        });
        d.handleStateChange(`${NS}.entities.switch.unknown.state`, true, false);
        await vi.advanceTimersByTimeAsync(20);
        expect(calls).toHaveLength(0);
    });
});
