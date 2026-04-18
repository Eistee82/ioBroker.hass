/**
 * Adapter-backed implementation of the ObjectStore interface.
 *
 * Delegates to `adapter.setObjectAsync`, `adapter.setStateChangedAsync` etc.
 * Kept as a small bridge so the rest of the v3 code stays framework-agnostic
 * and fully unit-testable.
 */
import type { ObjectDefinition, ObjectStore, StateWrite } from './object-store.js';

type AdapterLike = ioBroker.Adapter;

export class IoBrokerObjectStore implements ObjectStore {
    constructor(private readonly adapter: AdapterLike) {}

    async setObject(id: string, obj: ObjectDefinition): Promise<void> {
        const def: ioBroker.SettableObject = {
            type: obj.type,
            common: obj.common as ioBroker.ObjectCommon,
            native: obj.native ?? {},
        } as ioBroker.SettableObject;
        await this.adapter.setObjectAsync(stripNamespace(id, this.adapter.namespace), def);
    }

    async setState(id: string, value: StateWrite): Promise<void> {
        const relative = stripNamespace(id, this.adapter.namespace);
        const payload: Record<string, unknown> = {
            val: value.val,
            ack: value.ack,
        };
        if (value.q !== undefined && value.q !== 0) {
            payload.q = value.q;
        }
        await this.adapter.setStateAsync(relative, payload as ioBroker.SettableState);
    }

    async setStateChanged(id: string, value: StateWrite): Promise<void> {
        const relative = stripNamespace(id, this.adapter.namespace);
        const payload: Record<string, unknown> = {
            val: value.val,
            ack: value.ack,
        };
        if (value.q !== undefined && value.q !== 0) {
            payload.q = value.q;
        }
        await this.adapter.setStateChangedAsync(relative, payload as ioBroker.SettableState);
    }

    async deleteObject(id: string): Promise<void> {
        const relative = stripNamespace(id, this.adapter.namespace);
        await this.adapter.delObjectAsync(relative, { recursive: true });
    }

    async listObjectIds(prefix: string): Promise<string[]> {
        const relativePrefix = stripNamespace(prefix, this.adapter.namespace);
        const objects = await this.adapter.getObjectViewAsync('system', 'state', {
            startkey: `${this.adapter.namespace}.${relativePrefix}`,
            endkey: `${this.adapter.namespace}.${relativePrefix}\u9999`,
        });
        const fromStates = objects.rows.map((r: { id: string }) => r.id);
        const channels = await this.adapter.getObjectViewAsync('system', 'channel', {
            startkey: `${this.adapter.namespace}.${relativePrefix}`,
            endkey: `${this.adapter.namespace}.${relativePrefix}\u9999`,
        });
        const fromChannels = channels.rows.map((r: { id: string }) => r.id);
        const devices = await this.adapter.getObjectViewAsync('system', 'device', {
            startkey: `${this.adapter.namespace}.${relativePrefix}`,
            endkey: `${this.adapter.namespace}.${relativePrefix}\u9999`,
        });
        const fromDevices = devices.rows.map((r: { id: string }) => r.id);
        return Array.from(new Set([...fromStates, ...fromChannels, ...fromDevices]));
    }
}

function stripNamespace(id: string, namespace: string): string {
    const prefix = `${namespace}.`;
    return id.startsWith(prefix) ? id.slice(prefix.length) : id;
}
