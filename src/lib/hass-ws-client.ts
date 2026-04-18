import { EventEmitter } from 'node:events';
import { WebSocket } from 'ws';
import type {
    EntityDelta,
    HassConfig,
    HassServices,
    WsAuthInvalid,
    WsAuthOk,
    WsAuthRequired,
    WsEvent,
    WsMessageBase,
    WsResult,
} from './hass-types.js';
import { errorMsg } from './errors.js';

/**
 * Minimum HASS-Core version this client supports.
 * Gate for `subscribe_entities` compressed-delta stream (stable since 2023.4,
 * we pin 2024.4 for safer registry_updated event shape).
 */
export const MIN_HASS_VERSION = '2024.4';

export interface HassWsClientOptions {
    host: string;
    port: number;
    secure: boolean;
    accessToken: string;
    /** Optional PEM CA bundle for self-signed servers. */
    caCertificate?: string;
    /** Allow self-signed TLS certificates (only together with `secure: true`). */
    allowSelfSignedCert?: boolean;
    /** Logger injection — defaults to no-op. */
    logger?: {
        trace?(msg: string): void;
        debug?(msg: string): void;
        info?(msg: string): void;
        warn?(msg: string): void;
        error?(msg: string): void;
    };
    /** Reconnect-backoff steps in milliseconds; last value is the cap. */
    reconnectBackoffMs?: number[];
    /** Total response-wait timeout for `result` messages. */
    responseTimeoutMs?: number;
}

type Pending = {
    resolve: (value: unknown) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
};

type SubscriptionHandler = (event: unknown) => void;

const DEFAULT_BACKOFF_MS = [1_000, 2_000, 5_000, 15_000, 30_000];

/**
 * HassWsClient — native WebSocket client for Home Assistant.
 *
 * Lifecycle:
 *   new -> connect() -> 'connected' + ready -> … -> close() -> 'disconnected'
 *
 * Events:
 *   - 'connected'       (ha_version: string)
 *   - 'disconnected'    (code: number, reason: string)
 *   - 'authError'       (message: string) — fatal, no reconnect
 *   - 'hassError'       (err: HassError)
 *   - 'reconnecting'    (attempt: number, delayMs: number)
 *   - 'registryChanged' (kind: 'area'|'device'|'entity', action, payload) — convenience re-emit
 */
export class HassWsClient extends EventEmitter {
    private ws: WebSocket | null = null;
    private nextId = 1;
    private pending = new Map<number, Pending>();
    private subscriptions = new Map<number, SubscriptionHandler>();
    private entityCallback: ((delta: EntityDelta) => void) | null = null;
    private entityCallbackSubId: number | null = null;
    private readonly backoff: number[];
    private reconnectAttempt = 0;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private shouldReconnect = true;
    private connected = false;
    private readonly responseTimeoutMs: number;
    private readonly options: HassWsClientOptions;

    constructor(options: HassWsClientOptions) {
        super();
        this.options = options;
        this.backoff = options.reconnectBackoffMs?.length ? options.reconnectBackoffMs : DEFAULT_BACKOFF_MS;
        this.responseTimeoutMs = options.responseTimeoutMs ?? 10_000;
    }

    get isConnected(): boolean {
        return this.connected;
    }

    /** Open the WebSocket and perform auth handshake. Resolves on auth_ok. */
    connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.shouldReconnect = true;
            this.openSocket(resolve, reject);
        });
    }

    private openSocket(resolveConnect?: () => void, rejectConnect?: (e: Error) => void): void {
        const { host, port, secure, accessToken, allowSelfSignedCert, caCertificate } = this.options;
        const url = `${secure ? 'wss' : 'ws'}://${host}:${port}/api/websocket`;
        const wsOpts: { rejectUnauthorized?: boolean; ca?: string } = {};
        if (secure && allowSelfSignedCert) {
            wsOpts.rejectUnauthorized = false;
        }
        if (caCertificate) {
            wsOpts.ca = caCertificate;
        }
        this.log('debug', `connecting to ${url}`);
        const ws = new WebSocket(url, wsOpts);
        this.ws = ws;

        let authDone = false;

        ws.on('open', () => {
            this.log('trace', 'socket open');
        });

        ws.on('message', (raw: Buffer) => {
            let msg: WsMessageBase;
            try {
                msg = JSON.parse(raw.toString());
            } catch (e) {
                this.log('warn', `malformed WS message: ${errorMsg(e)}`);
                return;
            }

            if (!authDone) {
                this.handleAuthMessage(msg, accessToken, () => {
                    authDone = true;
                    this.connected = true;
                    this.reconnectAttempt = 0;
                    this.emit('connected', (msg as WsAuthOk).ha_version ?? '');
                    resolveConnect?.();
                    resolveConnect = undefined;
                    rejectConnect = undefined;
                }, (err) => {
                    authDone = true;
                    this.shouldReconnect = false;
                    this.emit('authError', err);
                    rejectConnect?.(new Error(err));
                    resolveConnect = undefined;
                    rejectConnect = undefined;
                    try { ws.close(); } catch { /* ignore */ }
                });
                return;
            }

            this.handlePostAuthMessage(msg);
        });

        ws.on('error', (err: Error) => {
            this.log('warn', `socket error: ${errorMsg(err)}`);
            rejectConnect?.(err);
            resolveConnect = undefined;
            rejectConnect = undefined;
        });

        ws.on('close', (code: number, reasonBuf: Buffer) => {
            const reason = reasonBuf.toString();
            this.connected = false;
            this.emit('disconnected', code, reason);
            this.failPending('connection closed');
            this.subscriptions.clear();
            this.entityCallbackSubId = null;
            this.ws = null;
            if (this.shouldReconnect) {
                this.scheduleReconnect();
            }
        });
    }

    private handleAuthMessage(
        msg: WsMessageBase,
        token: string,
        onOk: () => void,
        onFail: (reason: string) => void,
    ): void {
        if (msg.type === 'auth_required') {
            const version = (msg as WsAuthRequired).ha_version;
            this.log('debug', `auth_required, ha_version=${version}`);
            this.sendRaw({ type: 'auth', access_token: token });
        } else if (msg.type === 'auth_ok') {
            this.log('info', `auth_ok, ha_version=${(msg as WsAuthOk).ha_version}`);
            onOk();
        } else if (msg.type === 'auth_invalid') {
            onFail((msg as WsAuthInvalid).message || 'auth_invalid');
        } else {
            this.log('warn', `unexpected pre-auth message type: ${msg.type}`);
        }
    }

    private handlePostAuthMessage(msg: WsMessageBase): void {
        if (msg.type === 'result' && typeof (msg as WsResult).id === 'number') {
            const r = msg as WsResult;
            const pending = this.pending.get(r.id);
            if (pending) {
                clearTimeout(pending.timer);
                this.pending.delete(r.id);
                if (r.success) {
                    pending.resolve(r.result);
                } else {
                    pending.reject(
                        new Error(
                            `hass-error [${r.error?.code ?? 'unknown'}]: ${r.error?.message ?? 'no detail'}`,
                        ),
                    );
                }
            }
            return;
        }

        if (msg.type === 'event' && typeof (msg as WsEvent).id === 'number') {
            const ev = msg as WsEvent;
            const handler = this.subscriptions.get(ev.id);
            if (handler) {
                try {
                    handler(ev.event);
                } catch (e) {
                    this.log('warn', `subscription handler threw: ${errorMsg(e)}`);
                }
            }
            return;
        }

        this.log('trace', `unhandled message type: ${msg.type}`);
    }

    /** Send a request/response message and return the `result` payload. */
    call<T = unknown>(payload: { type: string } & Record<string, unknown>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                reject(new Error('not connected'));
                return;
            }
            const id = this.nextId++;
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`hass response timeout after ${this.responseTimeoutMs}ms`));
            }, this.responseTimeoutMs);
            this.pending.set(id, {
                resolve: v => resolve(v as T),
                reject,
                timer,
            });
            try {
                this.ws.send(JSON.stringify({ id, ...payload }));
            } catch (e) {
                clearTimeout(timer);
                this.pending.delete(id);
                reject(e instanceof Error ? e : new Error(String(e)));
            }
        });
    }

    /** Convenience: fetch HASS /api/config equivalent over WS. */
    getConfig(): Promise<HassConfig> {
        return this.call<HassConfig>({ type: 'get_config' });
    }

    getServices(): Promise<HassServices> {
        return this.call<HassServices>({ type: 'get_services' });
    }

    getAreaRegistry(): Promise<unknown[]> {
        return this.call<unknown[]>({ type: 'config/area_registry/list' });
    }

    getDeviceRegistry(): Promise<unknown[]> {
        return this.call<unknown[]>({ type: 'config/device_registry/list' });
    }

    getEntityRegistry(): Promise<unknown[]> {
        return this.call<unknown[]>({ type: 'config/entity_registry/list' });
    }

    /**
     * Subscribe to the compressed entity-delta stream.
     * First emission is a full snapshot in `{a: {...}}`. Subsequent emissions
     * are incremental.
     *
     * Only one entity subscription is allowed at a time per client (HASS limitation).
     */
    async subscribeEntities(callback: (delta: EntityDelta) => void): Promise<number> {
        if (this.entityCallbackSubId !== null) {
            throw new Error('subscribeEntities: already subscribed');
        }
        this.entityCallback = callback;
        const id = this.nextId++;
        // Register the subscription handler BEFORE sending so the first snapshot is not lost.
        this.subscriptions.set(id, raw => {
            this.entityCallback?.(raw as EntityDelta);
        });
        // Pending-list slot so the ACK resolves cleanly.
        const ackPromise = new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error('subscribe_entities ack timeout'));
            }, this.responseTimeoutMs);
            this.pending.set(id, {
                resolve: () => resolve(),
                reject,
                timer,
            });
        });
        this.sendRaw({ id, type: 'subscribe_entities' });
        await ackPromise;
        this.entityCallbackSubId = id;
        return id;
    }

    /** Subscribe to a named HASS event (e.g. 'area_registry_updated'). Returns subscription id. */
    async subscribeEvents(eventType: string, callback: SubscriptionHandler): Promise<number> {
        const id = this.nextId++;
        this.subscriptions.set(id, callback);
        const ackPromise = new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`subscribe_events(${eventType}) ack timeout`));
            }, this.responseTimeoutMs);
            this.pending.set(id, {
                resolve: () => resolve(),
                reject,
                timer,
            });
        });
        this.sendRaw({ id, type: 'subscribe_events', event_type: eventType });
        await ackPromise;
        return id;
    }

    async unsubscribe(subscriptionId: number): Promise<void> {
        this.subscriptions.delete(subscriptionId);
        if (this.entityCallbackSubId === subscriptionId) {
            this.entityCallbackSubId = null;
            this.entityCallback = null;
        }
        try {
            await this.call({ type: 'unsubscribe_events', subscription: subscriptionId });
        } catch (e) {
            this.log('debug', `unsubscribe failed (ignored): ${errorMsg(e)}`);
        }
    }

    /** Call a HASS service. Returns when HASS acknowledges. */
    callService(
        domain: string,
        service: string,
        serviceData?: Record<string, unknown>,
        target?: unknown,
    ): Promise<unknown> {
        const payload: { type: string } & Record<string, unknown> = {
            type: 'call_service',
            domain,
            service,
        };
        if (serviceData) {
            payload.service_data = serviceData;
        }
        if (target) {
            payload.target = target;
        }
        return this.call(payload);
    }

    /** Graceful close. Suppresses reconnect. */
    close(): void {
        this.shouldReconnect = false;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        try {
            this.ws?.close(1000, 'client close');
        } catch {
            /* ignore */
        }
    }

    // --- Internals ---

    private scheduleReconnect(): void {
        if (this.reconnectTimer) {
            return;
        }
        const idx = Math.min(this.reconnectAttempt, this.backoff.length - 1);
        const delay = this.backoff[idx] ?? 30_000;
        this.reconnectAttempt += 1;
        this.emit('reconnecting', this.reconnectAttempt, delay);
        this.log('info', `reconnecting in ${delay}ms (attempt ${this.reconnectAttempt})`);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.openSocket();
        }, delay);
    }

    private failPending(reason: string): void {
        for (const [, pending] of this.pending) {
            clearTimeout(pending.timer);
            pending.reject(new Error(reason));
        }
        this.pending.clear();
    }

    private sendRaw(obj: unknown): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error('not connected');
        }
        this.ws.send(JSON.stringify(obj));
    }

    private log(level: 'trace' | 'debug' | 'info' | 'warn' | 'error', msg: string): void {
        this.options.logger?.[level]?.(`[HassWsClient] ${msg}`);
    }
}
