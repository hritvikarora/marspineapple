/**
 * Real-data checks on Role A's Jezero bundles (HiRISE 1 m + CTX 20 m), through the production loader,
 * the engine under test and the worker client. Records route timings against the 8 s budget.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { QUALITY, cellCenter, type GridBundle, type RouteRequest, type RouteSuccess } from '../src/contracts';
import { loadAndValidateBundle } from '../src/data/loadBundle';
import { serializeRouteExport } from '../src/export/serialize';
import { MODEL_VERSION, solveRoute } from '../src/routing';
import { checkResponse } from '../src/sim';
import { createInitialState } from '../src/state/store';
import { RouteWorkerClient } from '../src/worker/client';
import { FakeWorker, fileFetch } from './helpers';

const HIRISE = 'jezero-west-hirise-v0.1.0';
const CTX = 'jezero-west-ctx20m-v0.1.0';
const BUDGET_MS = Number(process.env.SIM_PERF_BUDGET_MS ?? 8000);
const PAIRS = [['poi-p3', 'poi-p4'], ['poi-p4', 'poi-p5'], ['poi-p3', 'poi-p5']] as const;
const bundles: Record<string, GridBundle> = {};

beforeAll(async () => {
  for (const id of [HIRISE, CTX]) bundles[id] = await loadAndValidateBundle(`http://test.local/bundles/${id}/manifest.json`, { fetchImpl: fileFetch() });
}, 60000);

const poi = (b: GridBundle, id: string) => b.manifest.pointsOfInterest.find((p) => p.id === id)!.position;
const req = (b: GridBundle, a: string, z: string, over: Partial<RouteRequest> = {}): RouteRequest => ({
  requestId: `real-${a}-${z}`, bundleVersion: b.bundleVersion, modelVersion: MODEL_VERSION, start: poi(b, a), destination: poi(b, z),
  policies: ['shortest-feasible', 'terrain-aware', 'uncertainty-aware'], strictQuality: false, roundTrip: true, ...over,
});

describe('real Jezero bundles load and match their documented properties', () => {
  it.each([HIRISE, CTX])('%s: hashes verified, real data, uniform unknown quality, strict unsupported', (id) => {
    const b = bundles[id]!;
    expect(b.hashesVerified).toBe(true);
    expect(b.manifest.synthetic).toBe(false);
    expect(b.manifest.crs.body).toBe('Mars');
    expect(b.manifest.strictQualitySupported).toBe(false);
    expect(Array.from(b.quality).every((q) => q === QUALITY.UNKNOWN)).toBe(true);
    expect(Array.from(b.elevation).every(Number.isFinite)).toBe(true);
    for (const p of ['poi-p3', 'poi-p4', 'poi-p5']) {
      const pos = poi(b, p);
      const e = b.manifest.grid.extent;
      expect(pos.east_m > e.west_m && pos.east_m < e.east_m && pos.north_m > e.south_m && pos.north_m < e.north_m, p).toBe(true);
    }
  });

  it('HiRISE cells are anisotropic ground metres (0.94857 m E x 1 m N) and the shared adapter honours that', () => {
    const g = bundles[HIRISE]!.manifest.grid;
    expect(g.cellSizeEast_m).toBeCloseTo(0.948567, 6);
    expect(g.cellSizeNorth_m).toBe(1);
    expect(g.extent.east_m - g.extent.west_m).toBeCloseTo(1000 * 0.948567, 3);
    expect(cellCenter(g, 0, 1).east_m - cellCenter(g, 0, 0).east_m).toBeCloseTo(0.948567, 6);
    expect(cellCenter(g, 0, 0).north_m - cellCenter(g, 1, 0).north_m).toBeCloseTo(1, 9);
  });
});

describe('routes between the HiRISE science stops (P3, P4, P5)', () => {
  it.each(PAIRS)('%s <-> %s: valid round trip within the time budget; step lengths use anisotropic cells', (a, z) => {
    const b = bundles[HIRISE]!;
    const r = req(b, a, z);
    const t0 = performance.now();
    const res = solveRoute(b, r);
    const ms = performance.now() - t0;
    expect(checkResponse(b, r, res, MODEL_VERSION)).toEqual([]);
    expect(res.status).toBe('success');
    const s = res as RouteSuccess;
    const de = b.manifest.grid.cellSizeEast_m, dn = b.manifest.grid.cellSizeNorth_m;
    const allowed = [de, dn, Math.hypot(de, dn)];
    for (const c of s.candidates) {
      const p = c.outbound.path;
      for (let k = 1; k < p.length; k++) {
        const step = Math.hypot(p[k]!.east_m - p[k - 1]!.east_m, p[k]!.north_m - p[k - 1]!.north_m);
        expect(allowed.some((x) => Math.abs(x - step) < 1e-6)).toBe(true);
      }
      expect(c.missionStatus).toBe('round-trip-complete');
      // Uniform quality: every metre is unknown for every policy; least-unknown cannot reduce it.
      expect(c.outbound.metrics.unknownQualityPct).toBeCloseTo(100, 9);
      expect(c.outbound.metrics.lowQualityLength_m).toBe(0);
    }
    const sf = s.candidates.find((c) => c.policies.includes('shortest-feasible'))!.outbound.metrics.horizontalDistance_m;
    const straight = Math.hypot(s.destination.accepted.east_m - s.start.accepted.east_m, s.destination.accepted.north_m - s.start.accepted.north_m);
    expect(sf).toBeGreaterThanOrEqual(straight);
    expect(sf).toBeLessThan(straight * 1.25); // gentle delta-front terrain: no long detours expected
    console.info(`[real] ${HIRISE} ${a}->${z} round trip, 3 policies: ${ms.toFixed(0)} ms; straight ${straight.toFixed(1)} m; ` +
      s.candidates.map((c) => `${c.candidateId}[${c.policies.join('+')}] ${c.outbound.metrics.horizontalDistance_m.toFixed(1)} m`).join(', '));
    expect(ms).toBeLessThan(BUDGET_MS);
  }, 60000);

  it('CTX 20 m fallback gives consistent lengths (within 10 % of HiRISE) for the same stops', () => {
    const b = bundles[CTX]!;
    for (const [a, z] of PAIRS) {
      const r = req(b, a, z, { policies: ['shortest-feasible'], roundTrip: false });
      const res = solveRoute(b, r);
      expect(checkResponse(b, r, res, MODEL_VERSION)).toEqual([]);
      expect(res.status).toBe('success');
      const hd = (res as RouteSuccess).candidates[0]!.outbound.metrics.horizontalDistance_m;
      const ref = solveRoute(bundles[HIRISE]!, req(bundles[HIRISE]!, a, z, { policies: ['shortest-feasible'], roundTrip: false })) as RouteSuccess;
      const hr = ref.candidates[0]!.outbound.metrics.horizontalDistance_m;
      expect(Math.abs(hd - hr) / hr, `${a}-${z}: CTX ${hd} vs HiRISE ${hr}`).toBeLessThan(0.1);
    }
  }, 60000);

  it('strict quality is refused (no documented acceptable classes), never a blocking no-path', () => {
    for (const id of [HIRISE, CTX]) {
      const b = bundles[id]!;
      expect(solveRoute(b, req(b, 'poi-p3', 'poi-p4', { strictQuality: true }))).toMatchObject({ status: 'invalid-input', reason: 'strict-quality-unsupported' });
    }
  });

  it('full pipeline on HiRISE: worker client (14 MB copy) -> success -> deterministic export without local paths', async () => {
    const b = bundles[HIRISE]!;
    const c = new RouteWorkerClient({ createWorker: () => new FakeWorker() });
    await c.loadBundle(b);
    const r = req(b, 'poi-p3', 'poi-p4', { roundTrip: false });
    const res = (await c.route(r).done) as RouteSuccess;
    c.dispose();
    expect(res.status).toBe('success');
    expect(b.elevation.byteLength).toBe(4_000_000); // main-thread buffers never detached
    const mission = { ...createInitialState(MODEL_VERSION).currentMission, start: { point: r.start, poiId: 'poi-p3' }, destination: { point: r.destination, poiId: 'poi-p4' } };
    const input = { release: { appVersion: '0.1.0', bundleVersion: b.bundleVersion, modelVersion: MODEL_VERSION }, manifest: b.manifest, mission, response: res, selectedCandidateId: 'c0' };
    const a = serializeRouteExport(input);
    expect(serializeRouteExport(input)).toBe(a);
    const parsed = JSON.parse(a);
    expect(parsed.region.synthetic).toBe(false);
    expect(parsed.region.bundleVersion).toBe(HIRISE);
    expect(parsed.request.startPoiId).toBe('poi-p3');
  }, 60000);
});
