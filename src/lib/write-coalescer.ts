/**
 * Coalesces repeated writes to the same logical target into a single outbound
 * call after a short idle window. Used to avoid flooding HASS with service-calls
 * during UI slider drags.
 *
 * Unlike the Debouncer (read-path), the WriteCoalescer keeps the LATEST payload
 * and fires it once — consumers supply an onFire that performs the actual
 * `callService` + optimistic state update.
 */
export class WriteCoalescer<P> {
    private timers = new Map<string, NodeJS.Timeout>();
    private payloads = new Map<string, P>();

    constructor(
        private readonly windowMs: number,
        private readonly onFire: (key: string, payload: P) => void | Promise<void>,
    ) {}

    /**
     * Queue or overwrite the pending payload for `key`. After `windowMs` of
     * quiescence, onFire is invoked with the latest payload.
     */
    push(key: string, payload: P): void {
        this.payloads.set(key, payload);
        const existing = this.timers.get(key);
        if (existing) {
            clearTimeout(existing);
        }
        if (this.windowMs <= 0) {
            this.timers.delete(key);
            this.fire(key);
            return;
        }
        const timer = setTimeout(() => this.fire(key), this.windowMs);
        this.timers.set(key, timer);
    }

    flush(): void {
        for (const [key, timer] of this.timers) {
            clearTimeout(timer);
            this.fire(key);
        }
        this.timers.clear();
    }

    cancel(): void {
        for (const timer of this.timers.values()) {
            clearTimeout(timer);
        }
        this.timers.clear();
        this.payloads.clear();
    }

    private fire(key: string): void {
        const payload = this.payloads.get(key);
        this.payloads.delete(key);
        this.timers.delete(key);
        if (payload !== undefined) {
            void this.onFire(key, payload);
        }
    }

    get pendingCount(): number {
        return this.timers.size;
    }
}
