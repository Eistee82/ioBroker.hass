import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WriteCoalescer } from '../write-coalescer.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('WriteCoalescer', () => {
    it('fires only once with the latest value after the idle window', async () => {
        const onFire = vi.fn();
        const wc = new WriteCoalescer<number>(30, onFire);
        wc.push('k', 1);
        wc.push('k', 2);
        wc.push('k', 3);
        await vi.advanceTimersByTimeAsync(40);
        expect(onFire).toHaveBeenCalledTimes(1);
        expect(onFire).toHaveBeenCalledWith('k', 3);
    });

    it('fires immediately when windowMs <= 0', () => {
        const onFire = vi.fn();
        const wc = new WriteCoalescer<number>(0, onFire);
        wc.push('k', 7);
        expect(onFire).toHaveBeenCalledWith('k', 7);
    });

    it('treats keys independently', async () => {
        const onFire = vi.fn();
        const wc = new WriteCoalescer<string>(20, onFire);
        wc.push('a', 'A');
        wc.push('b', 'B');
        await vi.advanceTimersByTimeAsync(30);
        expect(onFire).toHaveBeenCalledTimes(2);
    });

    it('flush delivers pending payloads synchronously', () => {
        const onFire = vi.fn();
        const wc = new WriteCoalescer<number>(1_000, onFire);
        wc.push('a', 1);
        wc.push('b', 2);
        wc.flush();
        expect(onFire).toHaveBeenCalledTimes(2);
    });

    it('cancel drops pending payloads without firing', async () => {
        const onFire = vi.fn();
        const wc = new WriteCoalescer<number>(30, onFire);
        wc.push('k', 1);
        wc.cancel();
        await vi.advanceTimersByTimeAsync(50);
        expect(onFire).not.toHaveBeenCalled();
    });
});
