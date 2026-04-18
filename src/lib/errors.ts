/**
 * Error taxonomy for ioBroker.hass v3.
 * See docs/superpowers/specs/2026-04-18-hass-v3-design.md section 10.
 */

export type HassError =
    | { kind: 'auth_failed'; detail: string }
    | { kind: 'connection_lost'; reconnectAttempt: number }
    | { kind: 'service_timeout'; service: string; target: string }
    | { kind: 'service_failed'; service: string; hassError: string }
    | { kind: 'unmapped_entity'; entity_id: string; reason: string }
    | { kind: 'registry_stale'; affectedIds: string[] }
    | { kind: 'config_invalid'; field: string; message: string };

/**
 * Extract a human-readable message from an unknown error value.
 * Never leaks secret-looking tokens or PEM blocks (redacted to `[redacted]`).
 */
export function errorMsg(e: unknown): string {
    if (e === undefined) {
        return 'undefined';
    }
    const raw = e instanceof Error ? e.message : typeof e === 'string' ? e : (JSON.stringify(e) ?? String(e));
    return redactSecrets(raw);
}

const JWT_PATTERN = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
const PEM_PATTERN = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;

export function redactSecrets(input: string): string {
    return input.replace(JWT_PATTERN, '[redacted-token]').replace(PEM_PATTERN, '[redacted-private-key]');
}
