/**
 * Home Assistant WebSocket protocol types.
 * Based on HASS docs https://developers.home-assistant.io/docs/api/websocket and
 * inspected against HA-Core 2026.4.3.
 */

export interface HassConfig {
    version: string;
    location_name: string;
    time_zone: string;
    country: string | null;
    components: string[];
    unit_system: {
        length: string;
        mass: string;
        temperature: string;
    };
}

export interface HassArea {
    area_id: string;
    name: string;
    picture: string | null;
    icon: string | null;
    aliases?: string[];
    labels?: string[];
    floor_id?: string | null;
}

export interface HassDevice {
    id: string;
    area_id: string | null;
    name: string | null;
    name_by_user: string | null;
    manufacturer: string | null;
    model: string | null;
    model_id?: string | null;
    sw_version: string | null;
    hw_version: string | null;
    disabled_by: string | null;
    entry_type: string | null;
    identifiers: Array<[string, string]>;
    connections: Array<[string, string]>;
    labels?: string[];
}

export interface HassEntity {
    entity_id: string;
    device_id: string | null;
    area_id: string | null;
    platform: string;
    unique_id: string | null;
    name: string | null;
    original_name: string | null;
    icon: string | null;
    original_icon: string | null;
    disabled_by: string | null;
    hidden_by: string | null;
    entity_category: string | null;
    device_class: string | null;
    original_device_class: string | null;
    unit_of_measurement: string | null;
    options?: Record<string, unknown>;
    labels?: string[];
}

export interface HassState {
    entity_id: string;
    state: string;
    attributes: Record<string, unknown>;
    last_changed: string;
    last_updated: string;
    last_reported?: string;
    context: { id: string; parent_id: string | null; user_id: string | null };
}

export interface HassService {
    name?: string;
    description?: string;
    fields: Record<
        string,
        {
            name?: string;
            description?: string;
            example?: unknown;
            selector?: unknown;
            required?: boolean;
        }
    >;
    target?: unknown;
    response?: unknown;
}

export type HassServices = Record<string, Record<string, HassService>>;

// --- WebSocket message types ---

export interface WsMessageBase {
    id?: number;
    type: string;
}

export interface WsAuthRequired {
    type: 'auth_required';
    ha_version: string;
}

export interface WsAuth {
    type: 'auth';
    access_token: string;
}

export interface WsAuthOk {
    type: 'auth_ok';
    ha_version: string;
}

export interface WsAuthInvalid {
    type: 'auth_invalid';
    message: string;
}

export interface WsResult<T = unknown> {
    id: number;
    type: 'result';
    success: boolean;
    result?: T;
    error?: { code: string; message: string };
}

export interface WsEvent<T = unknown> {
    id: number;
    type: 'event';
    event: T;
}

/**
 * Compressed-state delta format for `subscribe_entities`.
 * Docs: https://developers.home-assistant.io/docs/api/websocket#subscribe-to-entities
 *
 * - First message is a snapshot: `{ <entity_id>: <CompressedState> }` in `a` field only.
 * - Subsequent messages contain `a` (added), `c` (changed), `r` (removed).
 */
export interface EntityDelta {
    a?: Record<string, CompressedState>;
    c?: Record<string, CompressedStateChange>;
    r?: string[];
}

export interface CompressedState {
    s: string; // state
    a?: Record<string, unknown>; // attributes
    c?: string | { id: string; parent_id?: string; user_id?: string }; // context
    lc?: number; // last_changed epoch
    lu?: number; // last_updated epoch
}

export interface CompressedStateChange {
    '+'?: Partial<CompressedState> & { a?: Record<string, unknown> };
    '-'?: { a?: string[] }; // removed attributes
}

// --- Registry update events ---

export interface AreaRegistryUpdateEvent {
    action: 'create' | 'remove' | 'update';
    area_id: string;
}

export interface DeviceRegistryUpdateEvent {
    action: 'create' | 'remove' | 'update';
    device_id: string;
    changes?: Record<string, unknown>;
}

export interface EntityRegistryUpdateEvent {
    action: 'create' | 'remove' | 'update';
    entity_id: string;
    old_entity_id?: string;
    changes?: Record<string, unknown>;
}
