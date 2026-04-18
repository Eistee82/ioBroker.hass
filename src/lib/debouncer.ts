/**
 * Per-key debouncer: coalesces rapid updates for the same key into a single
 * deferred invocation. Used to protect the ioBroker state store from HASS
 * burst updates (sensors, energy monitoring).
 *
 * The CALLBACK receives the LATEST value when the timer fires.
 */
export class Debouncer<V> {
    private timers = new Map<string, NodeJS.Timeout>();
    private latest = new Map<string, V>();

    constructor(
        private readonly defaultMs: number,
        private readonly onFire: (key: string, value: V) => void | Promise<void>,
        private readonly lookupMs?: (key: string) => number | undefined,
    ) {}

    /** Accept a new value for `key`. Fires after the idle window, with the most recent value. */
    push(key: string, value: V): void {
        this.latest.set(key, value);
        const existing = this.timers.get(key);
        if (existing) {
            clearTimeout(existing);
        }
        const ms = this.lookupMs?.(key) ?? this.defaultMs;
        if (ms <= 0) {
            // Fire immediately without deferring.
            this.timers.delete(key);
            this.fire(key);
            return;
        }
        const timer = setTimeout(() => this.fire(key), ms);
        this.timers.set(key, timer);
    }

    /** Fire any pending keys immediately. */
    flush(): void {
        for (const [key, timer] of this.timers) {
            clearTimeout(timer);
            this.fire(key);
        }
        this.timers.clear();
    }

    /** Cancel all pending deliveries without firing. */
    cancel(): void {
        for (const timer of this.timers.values()) {
            clearTimeout(timer);
        }
        this.timers.clear();
        this.latest.clear();
    }

    private fire(key: string): void {
        const value = this.latest.get(key);
        this.latest.delete(key);
        this.timers.delete(key);
        if (value !== undefined) {
            void this.onFire(key, value);
        }
    }

    /** Test-accessor: how many keys are currently waiting. */
    get pendingCount(): number {
        return this.timers.size;
    }
}
