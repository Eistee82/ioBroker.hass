import { test, expect } from '@playwright/test';
import { HassWsClient } from '../../build/lib/hass-ws-client.js';
import { RegistryCache } from '../../build/lib/registry-cache.js';
import type {
    EntityDelta,
    HassArea,
    HassConfig,
    HassDevice,
    HassEntity,
} from '../../build/lib/hass-types.js';

const HASS_HOST = process.env.HASS_HOST ?? '192.168.178.151';
const HASS_PORT = Number(process.env.HASS_PORT ?? 8123);
const HASS_LLT = process.env.HASS_LLT ?? '';

test.describe('HassWsClient — live against HASS-VM', () => {
    test.setTimeout(60_000);

    test('connects, authenticates and reports HASS version', async () => {
        const client = new HassWsClient({
            host: HASS_HOST,
            port: HASS_PORT,
            secure: false,
            accessToken: HASS_LLT,
        });
        const versionPromise = new Promise<string>(resolve => {
            client.once('connected', (v: string) => resolve(v));
        });
        await client.connect();
        const version = await versionPromise;
        expect(version).toMatch(/^\d{4}\.\d+(\.\d+)?/);
        const config = await client.getConfig();
        expect(config).toMatchObject<Partial<HassConfig>>({ version: expect.any(String) });
        client.close();
    });

    test('fetches the three registries and caches them', async () => {
        const client = new HassWsClient({
            host: HASS_HOST,
            port: HASS_PORT,
            secure: false,
            accessToken: HASS_LLT,
        });
        await client.connect();
        const [areas, devices, entities, services] = await Promise.all([
            client.getAreaRegistry() as Promise<HassArea[]>,
            client.getDeviceRegistry() as Promise<HassDevice[]>,
            client.getEntityRegistry() as Promise<HassEntity[]>,
            client.getServices(),
        ]);
        const cache = new RegistryCache();
        cache.setAreas(areas);
        cache.setDevices(devices);
        cache.setEntities(entities);
        cache.setServices(services);
        expect(cache.getAllEntities().length).toBeGreaterThan(0);
        expect(Object.keys(cache.getServices()).length).toBeGreaterThan(0);
        client.close();
    });

    test('subscribes to entities and receives a snapshot within 3s', async () => {
        const client = new HassWsClient({
            host: HASS_HOST,
            port: HASS_PORT,
            secure: false,
            accessToken: HASS_LLT,
        });
        await client.connect();
        const gotSnapshot = new Promise<EntityDelta>((resolve, reject) => {
            const t = setTimeout(() => reject(new Error('no snapshot within 3s')), 3_000);
            client.subscribeEntities(delta => {
                clearTimeout(t);
                resolve(delta);
            }).catch(reject);
        });
        const delta = await gotSnapshot;
        expect(delta.a).toBeDefined();
        const count = Object.keys(delta.a ?? {}).length;
        expect(count).toBeGreaterThan(0);
        client.close();
    });

    test('subscribes to registry-updated events without error', async () => {
        const client = new HassWsClient({
            host: HASS_HOST,
            port: HASS_PORT,
            secure: false,
            accessToken: HASS_LLT,
        });
        await client.connect();
        const id = await client.subscribeEvents('area_registry_updated', () => {
            // no-op; we just care that the subscribe ACKs
        });
        expect(id).toBeGreaterThan(0);
        client.close();
    });
});
