import { Adapter, type AdapterOptions } from '@iobroker/adapter-core';
import { HassWsClient, MIN_HASS_VERSION } from './lib/hass-ws-client.js';
import { RegistryCache } from './lib/registry-cache.js';
import { ObjectProjector } from './lib/object-projector.js';
import { ServiceDispatcher } from './lib/service-dispatcher.js';
import { IoBrokerObjectStore } from './lib/iobroker-object-store.js';
import { errorMsg } from './lib/errors.js';
import type { HassArea, HassDevice, HassEntity } from './lib/hass-types.js';
import type { DeviceType } from './lib/state-definitions.js';

interface V3AdapterConfig {
    host: string;
    port: number;
    secure: boolean;
    accessToken: string;
    allowSelfSignedCert?: boolean;
    caCertificate?: string;
    createDevicesTree: boolean;
    createEntitiesTree: boolean;
    autoIncludeNewDevices: boolean;
    debounceMs: number;
    debounceOverrides?: Array<{ pattern: string; ms: number }>;
    writeCoalesceMs: number;
    responseTimeoutMs: number;
    sync?: {
        devices?: Array<{ deviceId: string; enabled: boolean }>;
        entities?: Record<string, boolean>;
        includePatterns?: string[];
        excludePatterns?: string[];
    };
    assignments?: Record<string, { room?: string; function?: string }>;
    customMappings?: Record<string, { type: DeviceType | 'none' }>;
}

class HassAdapter extends Adapter {
    private client: HassWsClient | null = null;
    private registry: RegistryCache | null = null;
    private projector: ObjectProjector | null = null;
    private dispatcher: ServiceDispatcher | null = null;

    constructor(options: Partial<AdapterOptions> = {}) {
        super({ ...options, name: 'hass' });
        this.on('ready', () => {
            void this.main();
        });
        this.on('stateChange', (id, state) => {
            if (!state || !this.dispatcher) {
                return;
            }
            this.dispatcher.handleStateChange(id, state.val ?? null, state.ack ?? false);
        });
        this.on('unload', cb => this.shutdown(cb));
        this.on('message', msg => {
            void this.handleMessage(msg);
        });
    }

    private cfg(): V3AdapterConfig {
        const c = this.config as unknown as V3AdapterConfig;
        return {
            host: c.host ?? '',
            port: c.port ?? 8123,
            secure: c.secure ?? false,
            accessToken: c.accessToken ?? '',
            allowSelfSignedCert: c.allowSelfSignedCert ?? false,
            caCertificate: c.caCertificate,
            createDevicesTree: c.createDevicesTree ?? true,
            createEntitiesTree: c.createEntitiesTree ?? false,
            autoIncludeNewDevices: c.autoIncludeNewDevices ?? true,
            debounceMs: c.debounceMs ?? 50,
            debounceOverrides: c.debounceOverrides,
            writeCoalesceMs: c.writeCoalesceMs ?? 30,
            responseTimeoutMs: c.responseTimeoutMs ?? 2_000,
            sync: c.sync,
            assignments: c.assignments,
            customMappings: c.customMappings,
        };
    }

    private async main(): Promise<void> {
        const cfg = this.cfg();
        await this.setStateChangedAsync('info.connection', { val: false, ack: true });
        if (!cfg.host || !cfg.accessToken) {
            this.log.error('config incomplete — host and accessToken are required');
            return;
        }

        this.registry = new RegistryCache();
        this.client = new HassWsClient({
            host: cfg.host,
            port: cfg.port,
            secure: cfg.secure,
            accessToken: cfg.accessToken,
            allowSelfSignedCert: cfg.allowSelfSignedCert,
            caCertificate: cfg.caCertificate,
            responseTimeoutMs: cfg.responseTimeoutMs,
            logger: {
                debug: m => this.log.debug(m),
                info: m => this.log.info(m),
                warn: m => this.log.warn(m),
                error: m => this.log.error(m),
            },
        });

        this.client.on('connected', (v: string) => {
            this.log.info(`connected to HASS ${v}`);
            void this.setStateChangedAsync('info.connection', { val: true, ack: true });
        });
        this.client.on('disconnected', () => {
            void this.setStateChangedAsync('info.connection', { val: false, ack: true });
        });
        this.client.on('authError', (msg: string) => this.log.error(`HASS auth error: ${msg}`));

        try {
            await this.client.connect();
            await this.assertVersion();
            await this.seedRegistries();
            await this.attachSubscriptions();
            this.setupDispatcher();
            await this.projector?.deleteStale().catch(e => this.log.warn(`stale cleanup skipped: ${errorMsg(e)}`));
            await this.subscribeStatesAsync('*');
        } catch (e) {
            this.log.error(`startup failed: ${errorMsg(e)}`);
            this.terminate?.(1);
        }
    }

    private async assertVersion(): Promise<void> {
        const cfg = await this.client!.getConfig();
        if (!cfg.version) {
            return;
        }
        if (compareVersions(cfg.version, MIN_HASS_VERSION) < 0) {
            this.log.warn(`HASS ${cfg.version} is below recommended minimum ${MIN_HASS_VERSION}`);
        } else {
            this.log.info(`HASS core ${cfg.version} (min ${MIN_HASS_VERSION})`);
        }
    }

    private async seedRegistries(): Promise<void> {
        if (!this.client || !this.registry) {
            return;
        }
        const [areas, devices, entities, services] = await Promise.all([
            this.client.getAreaRegistry() as Promise<HassArea[]>,
            this.client.getDeviceRegistry() as Promise<HassDevice[]>,
            this.client.getEntityRegistry() as Promise<HassEntity[]>,
            this.client.getServices(),
        ]);
        this.registry.setAreas(areas);
        this.registry.setDevices(devices);
        this.registry.setEntities(entities);
        this.registry.setServices(services);
        this.log.info(
            `registries loaded — ${areas.length} areas, ${devices.length} devices, ${entities.length} entities`,
        );
    }

    private async attachSubscriptions(): Promise<void> {
        if (!this.client || !this.registry) {
            return;
        }
        const store = new IoBrokerObjectStore(this);
        const cfg = this.cfg();
        const includeFilter = buildIncludeFilter(cfg);
        this.projector = new ObjectProjector(store, this.registry, {
            namespace: this.namespace,
            enableEntitiesTree: cfg.createEntitiesTree,
            enableDevicesTree: cfg.createDevicesTree,
            customMappings: cfg.customMappings,
            debounceMs: cfg.debounceMs,
            debounceOverrides: cfg.debounceOverrides,
            shouldInclude: includeFilter,
            logger: {
                debug: m => this.log.debug(m),
                info: m => this.log.info(m),
                warn: m => this.log.warn(m),
                error: m => this.log.error(m),
            },
        });
        await this.client.subscribeEntities(delta => this.projector?.handleDelta(delta));
        for (const evt of [
            'area_registry_updated',
            'device_registry_updated',
            'entity_registry_updated',
            'service_registered',
            'service_removed',
        ]) {
            await this.client.subscribeEvents(evt, () => {
                void this.seedRegistries().catch(e => this.log.warn(`registry refresh failed: ${errorMsg(e)}`));
            });
        }
    }

    private setupDispatcher(): void {
        if (!this.client || !this.registry) {
            return;
        }
        const store = new IoBrokerObjectStore(this);
        const cfg = this.cfg();
        this.dispatcher = new ServiceDispatcher(this.client, this.registry, store, {
            namespace: this.namespace,
            coalesceMs: cfg.writeCoalesceMs,
            responseTimeoutMs: cfg.responseTimeoutMs,
            customMappings: cfg.customMappings,
            logger: {
                debug: m => this.log.debug(m),
                info: m => this.log.info(m),
                warn: m => this.log.warn(m),
                error: m => this.log.error(m),
            },
        });
    }

    private async handleMessage(msg: ioBroker.Message): Promise<void> {
        if (!msg || !msg.command) {
            return;
        }
        switch (msg.command) {
            case 'testConnection': {
                const result = await this.runTestConnection(
                    msg.message as { host?: string; port?: number; secure?: boolean; accessToken?: string },
                );
                this.replyTo(msg, result);
                return;
            }
            case 'callService': {
                const { domain, service, service_data, target } = (msg.message ?? {}) as {
                    domain: string;
                    service: string;
                    service_data?: Record<string, unknown>;
                    target?: unknown;
                };
                try {
                    const result = await this.client?.callService(domain, service, service_data, target);
                    this.replyTo(msg, { ok: true, result });
                } catch (e) {
                    this.replyTo(msg, { ok: false, error: errorMsg(e) });
                }
                return;
            }
            case 'forceSync': {
                try {
                    await this.seedRegistries();
                    this.replyTo(msg, { ok: true });
                } catch (e) {
                    this.replyTo(msg, { ok: false, error: errorMsg(e) });
                }
                return;
            }
            case 'listDevices': {
                this.replyTo(msg, { rows: this.snapshotDeviceRows() });
                return;
            }
            case 'listEntities': {
                this.replyTo(msg, { rows: this.snapshotEntityRows() });
                return;
            }
            case 'listAssignmentRows': {
                this.replyTo(msg, { rows: await this.snapshotAssignmentRows() });
                return;
            }
            case 'listMappingRows': {
                this.replyTo(msg, { rows: this.snapshotMappingRows() });
                return;
            }
            default:
                this.log.warn(`unknown message command: ${msg.command}`);
        }
    }

    private snapshotDeviceRows(): Array<Record<string, unknown>> {
        if (!this.registry) {
            return [];
        }
        return this.registry.getAllDevices().map(d => {
            const entities = this.registry!.getEntitiesForDevice(d.id);
            return {
                deviceId: d.id,
                name: d.name_by_user ?? d.name ?? d.id,
                manufacturer: d.manufacturer ?? '',
                model: d.model ?? '',
                disabled: Boolean(d.disabled_by),
                entityCount: entities.length,
            };
        });
    }

    private snapshotEntityRows(): Array<Record<string, unknown>> {
        if (!this.registry) {
            return [];
        }
        return this.registry.getAllEntities().map(e => ({
            entityId: e.entity_id,
            domain: e.entity_id.split('.')[0] ?? '',
            name: e.name ?? e.original_name ?? e.entity_id,
            deviceId: e.device_id ?? '',
            areaId: e.area_id ?? '',
            disabled: Boolean(e.disabled_by),
            hidden: Boolean(e.hidden_by),
        }));
    }

    private async snapshotAssignmentRows(): Promise<Array<Record<string, unknown>>> {
        if (!this.registry) {
            return [];
        }
        const rooms = await this.loadEnumChoices('rooms');
        const functions = await this.loadEnumChoices('functions');
        return this.registry.getAllDevices().map(d => {
            const area = d.area_id ? this.registry!.getArea(d.area_id) : undefined;
            return {
                deviceId: d.id,
                name: d.name_by_user ?? d.name ?? d.id,
                hassArea: area?.name ?? '',
                roomChoices: rooms,
                functionChoices: functions,
            };
        });
    }

    private snapshotMappingRows(): Array<Record<string, unknown>> {
        if (!this.registry) {
            return [];
        }
        return this.registry.getAllEntities().map(e => ({
            entityId: e.entity_id,
            domain: e.entity_id.split('.')[0] ?? '',
            deviceId: e.device_id ?? '',
        }));
    }

    private async loadEnumChoices(kind: 'rooms' | 'functions'): Promise<Array<{ id: string; name: string }>> {
        try {
            const objects = await this.getObjectViewAsync('system', 'enum', {
                startkey: `enum.${kind}.`,
                endkey: `enum.${kind}.\u9999`,
            });
            return objects.rows.map(
                (r: { id: string; value?: { common?: { name?: string | Record<string, string> } } }) => {
                    const common = r.value?.common;
                    let displayName = r.id;
                    if (typeof common?.name === 'string') {
                        displayName = common.name;
                    } else if (common?.name && typeof common.name === 'object') {
                        displayName = common.name.de ?? common.name.en ?? r.id;
                    }
                    return { id: r.id, name: displayName };
                },
            );
        } catch (e) {
            this.log.warn(`loadEnumChoices(${kind}) failed: ${errorMsg(e)}`);
            return [];
        }
    }

    private replyTo(msg: ioBroker.Message, payload: unknown): void {
        if (msg.callback && msg.from) {
            this.sendTo(msg.from, msg.command, payload, msg.callback);
        }
    }

    private async runTestConnection(opts: {
        host?: string;
        port?: number;
        secure?: boolean;
        accessToken?: string;
    }): Promise<{ ok: boolean; version?: string; error?: string }> {
        const client = new HassWsClient({
            host: opts.host ?? '',
            port: opts.port ?? 8123,
            secure: opts.secure ?? false,
            accessToken: opts.accessToken ?? '',
            responseTimeoutMs: 5_000,
        });
        try {
            await client.connect();
            const cfg = await client.getConfig();
            client.close();
            return { ok: true, version: cfg.version };
        } catch (e) {
            return { ok: false, error: errorMsg(e) };
        }
    }

    private shutdown(cb: () => void): void {
        try {
            this.projector?.stop();
            this.dispatcher?.stop();
            this.client?.close();
            this.client = null;
            this.projector = null;
            this.dispatcher = null;
            this.registry = null;
        } catch (e) {
            this.log.error(`unload error: ${errorMsg(e)}`);
        }
        cb();
    }
}

function buildIncludeFilter(cfg: V3AdapterConfig): ((entity: HassEntity) => boolean) | undefined {
    const { sync } = cfg;
    if (!sync) {
        return undefined;
    }
    const excludePatterns = sync.excludePatterns ?? [];
    const includePatterns = sync.includePatterns ?? [];
    const entityMap = sync.entities ?? {};
    const deviceMap = new Map<string, boolean>((sync.devices ?? []).map(d => [d.deviceId, d.enabled] as const));
    return (entity: HassEntity) => {
        for (const p of excludePatterns) {
            if (globMatch(p, entity.entity_id)) {
                return false;
            }
        }
        if (entity.entity_id in entityMap) {
            return entityMap[entity.entity_id];
        }
        if (entity.device_id && deviceMap.has(entity.device_id)) {
            if (!deviceMap.get(entity.device_id)) {
                return false;
            }
        }
        if (includePatterns.length > 0) {
            return includePatterns.some(p => globMatch(p, entity.entity_id));
        }
        return cfg.autoIncludeNewDevices;
    };
}

function globMatch(pattern: string, id: string): boolean {
    if (pattern === id) {
        return true;
    }
    if (pattern.includes('*')) {
        const re = new RegExp(`^${pattern.replace(/[.]/g, '\\.').replace(/\*/g, '.*')}$`);
        return re.test(id);
    }
    return false;
}

function compareVersions(a: string, b: string): number {
    const pa = a.split(/[.-]/).map(Number);
    const pb = b.split(/[.-]/).map(Number);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
        const da = pa[i] ?? 0;
        const db = pb[i] ?? 0;
        if (Number.isNaN(da) || Number.isNaN(db)) {
            continue;
        }
        if (da !== db) {
            return da - db;
        }
    }
    return 0;
}

if (require.main !== module) {
    module.exports = (options: Partial<AdapterOptions>) => new HassAdapter(options);
} else {
    (() => new HassAdapter())();
}
