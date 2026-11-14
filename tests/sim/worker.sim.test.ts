/**
 * Worker lifecycle simulations: real worker handler + engine (via FakeWorker, async + structured
 * clone like a real Worker) on generated bundles, driven through RouteWorkerClient AND the store
 * reducer, so "only the last request's result is accepted" is checked end to end.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { RouteFinalResponse, RouteRequest, RouteResponse, WorkerToMain } from '../../src/contracts';
import { MODEL_VERSION } from '../../src/routing';
import { buildScenario, mulberry32, randInt, type ScenarioInstance } from '../../src/sim';
import { createInitialState, reducer, type AppState } from '../../src/state/store';
import { createWorkerHandler } from '../../src/worker/handler';
import { RouteWorkerClient } from '../../src/worker/client';
import { FakeWorker } from '../helpers';

let maze: ScenarioInstance, noisy: ScenarioInstance, large: ScenarioInstance;
beforeAll(async () => {
  [maze, noisy, large] = await Promise.all([buildScenario('maze'), buildScenario('noisy-rough'), buildScenario('large-512')]);
});

const reqFor = (s: ScenarioInstance, requestId: string, k = 0, over: Partial<RouteRequest> = {}): RouteRequest => {
  const c = s.cases[k % s.cases.length]!;
  return {
    requestId, bundleVersion: s.bundle.bundleVersion, modelVersion: MODEL_VERSION, start: c.start, destination: c.destination,
    policies: ['shortest-feasible', 'uncertainty-aware'], strictQuality: false, roundTrip: false, ...over,
  };
};

/** Store driven exactly like useRouteRunner: route/requested on send, route/update for every message. */
function storeFor(s: ScenarioInstance) {
  let state: AppState = reducer(createInitialState(MODEL_VERSION), { type: 'region/loaded', bundle: s.bundle });
  return {
    get: () => state,
    send(c: RouteWorkerClient, req: RouteRequest) {
      state = reducer(state, { type: 'route/requested', requestId: req.requestId });
      return c.route(req, (r) => { state = reducer(state, { type: 'route/update', response: r }); });
    },
  };
}

describe('worker lifecycle simulations', () => {
  it('burst of 25 rapid requests: all but the last resolve cancelled; only the last result reaches state', async () => {
    const workers: FakeWorker[] = [];
    const c = new RouteWorkerClient({ createWorker: () => { const w = new FakeWorker({ delayMs: 3 }); workers.push(w); return w; } });
    await c.loadBundle(maze.bundle);
    const st = storeFor(maze);
    const seen: Record<string, RouteResponse['status'][]> = {};
    const handles = Array.from({ length: 25 }, (_, k) => {
      const req = reqFor(maze, `burst-${k}`, k, { roundTrip: k % 2 === 0 });
      seen[req.requestId] = [];
      const h = st.send(c, req);
      void h.done.then((r) => seen[req.requestId]!.push(r.status));
      return h;
    });
    const results = await Promise.all(handles.map((h) => h.done));
    expect(results.slice(0, -1).every((r) => r.status === 'cancelled')).toBe(true);
    expect(results.at(-1)!.status).toBe('success');
    const s = st.get();
    expect(s.routeRun.kind).toBe('finished');
    expect(s.routeRun.kind === 'finished' && s.routeRun.response.requestId).toBe('burst-24');
    expect(s.routeCandidates).toEqual((results.at(-1) as Extract<RouteFinalResponse, { status: 'success' }>).candidates);
    // Every superseded worker was terminated; no late message from them was delivered.
    expect(workers.slice(0, -1).every((w) => w.terminated)).toBe(true);
    expect(c.workerStarts).toBe(25);
    c.dispose();
  });

  it('cancel mid-flight -> cancelled, worker restarted, next request succeeds on the fresh worker', async () => {
    const c = new RouteWorkerClient({ createWorker: () => new FakeWorker({ delayMs: 20 }) });
    await c.loadBundle(noisy.bundle);
    const st = storeFor(noisy);
    const h = st.send(c, reqFor(noisy, 'to-cancel'));
    await new Promise((r) => setTimeout(r, 5));
    h.cancel();
    expect((await h.done).status).toBe('cancelled');
    expect(st.get().routeRun).toMatchObject({ kind: 'finished', response: { status: 'cancelled' } });
    const next = await st.send(c, reqFor(noisy, 'after-cancel', 1)).done;
    expect(next.status).toBe('success');
    expect(c.workerStarts).toBe(2);
    expect(st.get().routeCandidates.length).toBeGreaterThan(0);
    c.dispose();
  });

  it('client timeout -> timeout state (not no-path), worker restarted, later request succeeds', async () => {
    vi.useFakeTimers();
    try {
      let n = 0;
      const c = new RouteWorkerClient({ timeoutMs: 500, createWorker: () => new FakeWorker({ silent: n++ === 0 }) });
      const loaded = c.loadBundle(maze.bundle);
      await vi.advanceTimersByTimeAsync(5);
      await loaded;
      const st = storeFor(maze);
      const h = st.send(c, reqFor(maze, 'hangs'));
      await vi.advanceTimersByTimeAsync(501);
      expect(await h.done).toMatchObject({ status: 'timeout', limitMs: 500 });
      expect(st.get().routeRun).toMatchObject({ kind: 'finished', response: { status: 'timeout' } });
      const h2 = st.send(c, reqFor(maze, 'recovers'));
      await vi.advanceTimersByTimeAsync(50);
      expect((await h2.done).status).toBe('success');
      expect(c.workerStarts).toBe(2);
      c.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('worker crash -> data-error/worker-crash; the next request starts a new worker and succeeds', async () => {
    const workers: FakeWorker[] = [];
    const c = new RouteWorkerClient({ createWorker: () => { const w = new FakeWorker({ delayMs: 10 }); workers.push(w); return w; } });
    await c.loadBundle(maze.bundle);
    const st = storeFor(maze);
    const h = st.send(c, reqFor(maze, 'crashes'));
    workers[0]!.onerror!({ message: 'sim: out of memory' } as ErrorEvent);
    expect(await h.done).toMatchObject({ status: 'data-error', stage: 'worker-crash', message: 'sim: out of memory' });
    const ok = await st.send(c, reqFor(maze, 'after-crash')).done;
    expect(ok.status).toBe('success');
    expect(workers).toHaveLength(2);
    expect(st.get().routeRun).toMatchObject({ kind: 'finished', response: { requestId: 'after-crash', status: 'success' } });
    c.dispose();
  });

  it('region switch mid-flight: old request cancelled, late old-bundle reply is dropped, new bundle routes', async () => {
    const workers: FakeWorker[] = [];
    const c = new RouteWorkerClient({ createWorker: () => { const w = new FakeWorker({ delayMs: 15 }); workers.push(w); return w; } });
    await c.loadBundle(maze.bundle);
    const old = c.route(reqFor(maze, 'old-region'));
    await c.loadBundle(noisy.bundle);
    expect((await old.done).status).toBe('cancelled');
    const h = c.route(reqFor(noisy, 'new-region'));
    // Forge a late reply from the old region on the live worker: must be ignored.
    workers.at(-1)!.onmessage!({ data: { type: 'route-response', response: { status: 'cancelled', requestId: 'new-region', bundleVersion: maze.bundle.bundleVersion, modelVersion: MODEL_VERSION } } } as MessageEvent<WorkerToMain>);
    expect(c.staleDropped).toBeGreaterThanOrEqual(1);
    expect((await h.done).status).toBe('success');
    c.dispose();
  });

  it('seeded random interleaving of route/cancel/wait (80 ops): every handle resolves once; state shows only the latest request', async () => {
    const rand = mulberry32(77);
    const c = new RouteWorkerClient({ createWorker: () => new FakeWorker({ delayMs: randInt(rand, 0, 4) }) });
    await c.loadBundle(maze.bundle);
    const st = storeFor(maze);
    const all: { id: string; done: Promise<RouteFinalResponse>; resolved: number }[] = [];
    let last: string | null = null;
    for (let op = 0; op < 80; op++) {
      const u = rand();
      if (u < 0.55) {
        const id = `mix-${op}`;
        const h = st.send(c, reqFor(maze, id, op));
        const rec = { id, done: h.done, resolved: 0 };
        void h.done.then(() => rec.resolved++);
        all.push(rec);
        last = id;
      } else if (u < 0.7 && all.length) {
        c.cancel();
      } else {
        await new Promise((r) => setTimeout(r, randInt(rand, 0, 6)));
      }
    }
    const final = await Promise.all(all.map((r) => r.done));
    await new Promise((r) => setTimeout(r, 20));
    expect(all.every((r) => r.resolved === 1)).toBe(true);
    // At most one success per request id; only the latest request may still be "live" in state.
    final.forEach((r, k) => expect(r.requestId).toBe(all[k]!.id));
    const s = st.get();
    expect(s.routeRun.kind).toBe('finished');
    if (s.routeRun.kind === 'finished') expect(s.routeRun.response.requestId).toBe(last);
    expect(s.activeRequestId).toBeNull();
    c.dispose();
  });

  it('worker-side soft time budget: the solver itself returns timeout on a large grid (never a false no-path)', () => {
    const out: WorkerToMain[] = [];
    const handle = createWorkerHandler((m) => out.push(m));
    const t = { manifest: large.bundle.manifest, bundleVersion: large.bundle.bundleVersion, width: large.bundle.width, height: large.bundle.height,
      elevation: large.bundle.elevation.slice().buffer, slope: large.bundle.slope.slice().buffer, roughness: large.bundle.roughness.slice().buffer,
      quality: large.bundle.quality.slice().buffer, exclusion: large.bundle.exclusion.slice().buffer };
    handle({ type: 'load-bundle', bundle: t });
    expect(out.at(-1)).toMatchObject({ type: 'bundle-loaded' });
    const now = Date.now;
    let fake = now();
    vi.spyOn(Date, 'now').mockImplementation(() => (fake += 1)); // every check advances 1 ms
    try {
      handle({ type: 'route', request: reqFor(large, 'soft-budget', 0, { timeoutMs: 3, policies: ['shortest-feasible', 'terrain-aware', 'uncertainty-aware'] }) });
    } finally {
      vi.restoreAllMocks();
    }
    const fin = out.filter((m) => m.type === 'route-response' && m.response.status !== 'progress').at(-1);
    expect(fin).toMatchObject({ type: 'route-response', response: { status: 'timeout', requestId: 'soft-budget' } });
    expect(out.some((m) => m.type === 'route-response' && m.response.status === 'progress' && m.response.exploredNodes > 0)).toBe(true);
  });
});
