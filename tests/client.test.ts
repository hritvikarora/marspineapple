import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { GridBundle, RouteRequest, RouteResponse } from '../src/contracts';
import { loadAndValidateBundle } from '../src/data/loadBundle';
import { MODEL_VERSION } from '../src/routing';
import { RouteWorkerClient } from '../src/worker/client';
import { FIXTURE_MANIFEST, FakeWorker, fileFetch } from './helpers';

let bundle: GridBundle;
beforeAll(async () => {
  bundle = await loadAndValidateBundle(FIXTURE_MANIFEST, { fetchImpl: fileFetch() });
});
const pos = (id: string) => bundle.manifest.pointsOfInterest.find((p) => p.id === id)!.position;
const req = (requestId: string, over: Partial<RouteRequest> = {}): RouteRequest => ({
  requestId, bundleVersion: bundle.bundleVersion, modelVersion: MODEL_VERSION,
  start: pos('syn-outpost'), destination: pos('syn-east-bench'),
  policies: ['shortest-feasible', 'uncertainty-aware'], strictQuality: false, roundTrip: false, ...over,
});

describe('RouteWorkerClient', () => {
  it('round-trips a route through the worker protocol with progress', async () => {
    const c = new RouteWorkerClient({ createWorker: () => new FakeWorker() });
    await c.loadBundle(bundle);
    const updates: RouteResponse['status'][] = [];
    const r = await c.route(req('a'), (u) => updates.push(u.status)).done;
    expect(r.status).toBe('success');
    expect(updates[0]).toBe('progress');
    expect(updates.at(-1)).toBe('success');
    c.dispose();
  });

  it('never detaches the main-thread bundle buffers', async () => {
    const c = new RouteWorkerClient({ createWorker: () => new FakeWorker() });
    await c.loadBundle(bundle);
    expect(bundle.elevation.byteLength).toBe(960);
    expect(bundle.quality.byteLength).toBe(240);
    expect(bundle.elevation[0]).toBe(-2600);
    c.dispose();
  });

  it('supersedes an in-flight request: old resolves cancelled, its late reply is never delivered', async () => {
    const workers: FakeWorker[] = [];
    const c = new RouteWorkerClient({ createWorker: () => { const w = new FakeWorker({ delayMs: 20 }); workers.push(w); return w; } });
    await c.loadBundle(bundle);
    const seenA: string[] = [];
    const a = c.route(req('A'), (u) => seenA.push(u.status));
    const b = c.route(req('B', { strictQuality: true }));
    expect((await a.done).status).toBe('cancelled');
    const rb = await b.done;
    expect(rb.status).toBe('success');
    expect(rb.requestId).toBe('B');
    expect(seenA).not.toContain('success');
    expect(workers[0]!.terminated).toBe(true); // obsolete work does not block the new request
  });

  it('drops messages whose requestId/bundleVersion do not match the active request', async () => {
    let w!: FakeWorker;
    const c = new RouteWorkerClient({ createWorker: () => (w = new FakeWorker({ silent: true })) });
    await c.loadBundle(bundle);
    const h = c.route(req('live'));
    const fake = (response: RouteResponse) => w.onmessage!({ data: { type: 'route-response', response } } as MessageEvent);
    fake({ status: 'cancelled', requestId: 'stale', bundleVersion: bundle.bundleVersion, modelVersion: MODEL_VERSION });
    fake({ status: 'cancelled', requestId: 'live', bundleVersion: 'other-bundle', modelVersion: MODEL_VERSION });
    expect(c.staleDropped).toBe(2);
    expect(c.activeRequestId).toBe('live');
    h.cancel();
    expect((await h.done).status).toBe('cancelled');
  });

  it('times out, terminates the worker and recovers for the next request', async () => {
    vi.useFakeTimers();
    try {
      let n = 0;
      const c = new RouteWorkerClient({ timeoutMs: 1000, createWorker: () => new FakeWorker({ silent: n++ === 0 }) });
      const loaded = c.loadBundle(bundle);
      await vi.advanceTimersByTimeAsync(10);
      await loaded;
      const h = c.route(req('slow'));
      await vi.advanceTimersByTimeAsync(1001);
      const r = await h.done;
      expect(r).toMatchObject({ status: 'timeout', limitMs: 1000 });
      expect(c.workerStarts).toBe(2);
      const h2 = c.route(req('next'));
      await vi.advanceTimersByTimeAsync(50);
      expect((await h2.done).status).toBe('success');
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports a worker crash as data-error', async () => {
    let w!: FakeWorker;
    const c = new RouteWorkerClient({ createWorker: () => (w = new FakeWorker({ silent: true })) });
    await c.loadBundle(bundle);
    const h = c.route(req('boom'));
    w.onerror!({ message: 'kaboom' } as ErrorEvent);
    expect(await h.done).toMatchObject({ status: 'data-error', stage: 'worker-crash' });
  });
});
