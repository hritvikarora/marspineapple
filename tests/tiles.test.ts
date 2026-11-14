import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeTileResult, fetchTile, tileUrl } from '../src/app/tiles';
import { TILE_CONFIG } from '../src/config';

const cfg = { ...TILE_CONFIG, enabled: true, timeoutMs: 1000 };
afterEach(() => vi.useRealTimers());

describe('optional tile adapter', () => {
  it('is off by default and reports disabled without fetching', async () => {
    expect(TILE_CONFIG.enabled).toBe(false);
    const f = vi.fn();
    expect(await fetchTile(TILE_CONFIG, 0, 0, 0, f as unknown as typeof fetch)).toEqual({ status: 'disabled' });
    expect(f).not.toHaveBeenCalled();
  });
  it('fills the WMTS template', () => {
    expect(tileUrl('https://t/{z}/{y}/{x}.jpg', 3, 5, 2)).toBe('https://t/3/2/5.jpg');
  });
  it('times out a hanging request, aborts it, and settles', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const hanging = ((_u: string, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => undefined);
    }) as unknown as typeof fetch;
    const p = fetchTile(cfg, 0, 0, 0, hanging);
    await vi.advanceTimersByTimeAsync(1001);
    const r = await p;
    expect(r.status).toBe('timeout');
    expect(signal?.aborted).toBe(true);
    expect(describeTileResult(r)).toMatch(/unaffected/);
  });
  it('maps network failure to offline and HTTP errors to http-error', async () => {
    const offline = (() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch;
    expect((await fetchTile(cfg, 0, 0, 0, offline)).status).toBe('offline');
    const e500 = (() => Promise.resolve(new Response('', { status: 503 }))) as unknown as typeof fetch;
    expect(await fetchTile(cfg, 0, 0, 0, e500)).toMatchObject({ status: 'http-error', message: 'HTTP 503' });
  });
  it('accepts an image response', async () => {
    const ok = (() => Promise.resolve(new Response(new Blob([new Uint8Array([1])], { type: 'image/jpeg' })))) as unknown as typeof fetch;
    expect((await fetchTile(cfg, 0, 0, 0, ok)).status).toBe('ok');
    const html = (() => Promise.resolve(new Response(new Blob(['<html>'], { type: 'text/html' })))) as unknown as typeof fetch;
    expect((await fetchTile(cfg, 0, 0, 0, html)).status).toBe('bad-content');
  });
});
