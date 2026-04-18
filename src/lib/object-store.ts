/**
 * Narrow interface representing the ioBroker adapter's object-persistence API.
 *
 * The real adapter supplies an implementation that delegates to
 * `adapter.setObjectAsync`, `adapter.setStateChangedAsync`, etc. Tests can pass
 * a pure in-memory implementation (InMemoryObjectStore below) to verify the
 * object-projection without spinning up a real js-controller.
 */

export interface ObjectDefinition {
    type: 'device' | 'channel' | 'state';
    common: {
        name: string | { en: string; de: string };
        type?: 'boolean' | 'number' | 'string' | 'mixed' | 'array' | 'object';
        role?: string;
        read?: boolean;
        write?: boolean;
        unit?: string;
        min?: number;
        max?: number;
        states?: Record<string, string>;
        def?: unknown;
    };
    native?: Record<string, unknown>;
}

export interface StateWrite {
    val: boolean | number | string | null;
    ack: boolean;
    q?: number;
    ts?: number;
}

export interface ObjectStore {
    setObject(id: string, obj: ObjectDefinition): Promise<void>;
    setState(id: string, value: StateWrite): Promise<void>;
    /** Write only if the value actually changed (server-side idempotence). */
    setStateChanged(id: string, value: StateWrite): Promise<void>;
    deleteObject(id: string): Promise<void>;
    /** List all object IDs under a prefix (used for deleteStaleObjects). */
    listObjectIds(prefix: string): Promise<string[]>;
}

/**
 * In-memory ObjectStore for unit tests.
 */
export class InMemoryObjectStore implements ObjectStore {
    readonly objects = new Map<string, ObjectDefinition>();
    readonly states = new Map<string, StateWrite>();
    writeLog: Array<{ id: string; value: StateWrite }> = [];
    changedWrites = 0;

    setObject(id: string, obj: ObjectDefinition): Promise<void> {
        this.objects.set(id, obj);
        return Promise.resolve();
    }

    setState(id: string, value: StateWrite): Promise<void> {
        this.states.set(id, value);
        this.writeLog.push({ id, value });
        return Promise.resolve();
    }

    setStateChanged(id: string, value: StateWrite): Promise<void> {
        const prev = this.states.get(id);
        if (prev && prev.val === value.val && prev.ack === value.ack) {
            return Promise.resolve();
        }
        this.states.set(id, value);
        this.writeLog.push({ id, value });
        this.changedWrites += 1;
        return Promise.resolve();
    }

    deleteObject(id: string): Promise<void> {
        this.objects.delete(id);
        this.states.delete(id);
        return Promise.resolve();
    }

    listObjectIds(prefix: string): Promise<string[]> {
        return Promise.resolve(Array.from(this.objects.keys()).filter(k => k.startsWith(prefix)));
    }
}
