import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Debouncer } from '../debouncer.js';

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe('Debouncer', () => {
    it('fires callback after idle window with latest value', async () => {
        const onFire = vi.fn();
        const d = new Debouncer<number>(50, onFire);
        d.push('k', 1);
        d.push('k', 2);
        d.push('k', 3);
        expect(onFire).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(60);
        expect(onFire).toHaveBeenCalledTimes(1);
        expect(onFire).toHaveBeenCalledWith('k', 3);
    });

    it('debounces independently per key', async () => {
        const onFire = vi.fn();
        const d = new Debouncer<string>(50, onFire);
        d.push('a', 'aa');
        d.push('b', 'bb');
        await vi.advanceTimersByTimeAsync(60);
        expect(onFire).toHaveBeenCalledTimes(2);
        const keys = onFire.mock.calls.map(c => c[0]).sort();
        expect(keys).toEqual(['a', 'b']);
    });

    it('honours per-key override via lookupMs', async () => {
        const onFire = vi.fn();
        const lookup = (k: string): number => (k.startsWith('slow.') ? 500 : 50);
        const d = new Debouncer<string>(50, onFire, lookup);
        d.push('fast.x', 'f');
        d.push('slow.y', 's');
        await vi.advanceTimersByTimeAsync(60);
        expect(onFire).toHaveBeenCalledTimes(1);
        expect(onFire.mock.calls[0]).toEqual(['fast.x', 'f']);
        await vi.advanceTimersByTimeAsync(500);
        expect(onFire).toHaveBeenCalledTimes(2);
    });

    it('flush fires pending keys immediately', () => {
        const onFire = vi.fn();
        const d = new Debouncer<number>(1_000, onFire);
        d.push('a', 1);
        d.push('b', 2);
        d.flush();
        expect(onFire).toHaveBeenCalledTimes(2);
    });

    it('cancel drops pending deliveries', async () => {
        const onFire = vi.fn();
        const d = new Debouncer<number>(50, onFire);
        d.push('a', 1);
        d.cancel();
        await vi.advanceTimersByTimeAsync(100);
        expect(onFire).not.toHaveBeenCalled();
    });

    it('fires immediately when lookupMs returns 0', () => {
        const onFire = vi.fn();
        const d = new Debouncer<number>(50, onFire, () => 0);
        d.push('a', 7);
        expect(onFire).toHaveBeenCalledWith('a', 7);
    });
});
