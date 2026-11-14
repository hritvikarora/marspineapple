import { beforeAll, describe, expect, it } from 'vitest';
import type { GridBundle, LocalPoint, RouteFinalResponse, RouteRequest } from '../src/contracts';
import { loadAndValidateBundle } from '../src/data/loadBundle';
import { MODEL_VERSION, solveRoute } from '../src/routing';
import { FIXTURE_MANIFEST, fileFetch } from './helpers';

let b: GridBundle;
beforeAll(async () => {
  b = await loadAndValidateBundle(FIXTURE_MANIFEST, { fetchImpl: fileFetch() });
});
const poi = (id: string): LocalPoint => b.manifest.pointsOfInterest.find((p) => p.id === id)!.position;
const req = (over: Partial<RouteRequest> = {}): RouteRequest => ({
  requestId: 't', bundleVersion: b.bundleVersion, modelVersion: MODEL_VERSION,
  start: poi('syn-outpost'), destination: poi('syn-east-bench'),
  policies: ['shortest-feasible', 'terrain-aware', 'uncertainty-aware'], strictQuality: false, roundTrip: false, ...over,
});
const ok = (r: RouteFinalResponse) => {
  if (r.status !== 'success') throw new Error(`expected success, got ${r.status}: ${JSON.stringify(r)}`);
  return r;
};

describe('placeholder engine on synthetic fixture (pipe sanity; Ayush owns real tests)', () => {
  it('finds a north-gap shortcut and a south-gap uncertainty-aware alternative', () => {
    const r = ok(solveRoute(b, req()));
    const byPolicy = (p: string) => r.candidates.find((c) => c.policies.includes(p as never))!;
    const short = byPolicy('shortest-feasible').outbound.metrics;
    const unc = byPolicy('uncertainty-aware').outbound.metrics;
    expect(short.unknownQualityLength_m).toBeGreaterThan(0);
    expect(unc.unknownQualityLength_m).toBe(0);
    expect(unc.horizontalDistance_m).toBeGreaterThan(short.horizontalDistance_m);
    expect(r.candidates.length).toBeGreaterThanOrEqual(2);
    expect(r.start.accepted).toEqual(poi('syn-outpost'));
  });
  it('is deterministic', () => {
    const a = solveRoute(b, req(), { now: () => 0 });
    const c = solveRoute(b, req(), { now: () => 0 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(c));
  });
  it('strict quality avoids unknown cells', () => {
    const r = ok(solveRoute(b, req({ strictQuality: true })));
    for (const c of r.candidates) expect(c.outbound.metrics.unknownQualityLength_m + c.outbound.metrics.lowQualityLength_m).toBe(0);
  });
  it('sealed basin -> no-path', () => {
    const r = solveRoute(b, req({ destination: poi('syn-sealed-basin') }));
    expect(r.status).toBe('no-path');
    if (r.status === 'no-path') expect(r.reason).toBe('disconnected-under-limits');
  });
  it('strict endpoint in unknown quality -> invalid-input', () => {
    const r = solveRoute(b, req({ destination: poi('syn-unknown-knoll'), strictQuality: true }));
    expect(r).toMatchObject({ status: 'invalid-input', reason: 'endpoint-quality-excluded', field: 'destination' });
  });
  it('rejects bundle version mismatch, outside endpoints and excluded endpoints', () => {
    expect(solveRoute(b, req({ bundleVersion: 'other' }))).toMatchObject({ status: 'invalid-input', reason: 'version-mismatch' });
    expect(solveRoute(b, req({ destination: { east_m: -5, north_m: 50 } }))).toMatchObject({ status: 'invalid-input', reason: 'endpoint-outside-region' });
    expect(solveRoute(b, req({ destination: { east_m: 165, north_m: 115 } }))).toMatchObject({ status: 'invalid-input', reason: 'endpoint-excluded' });
    expect(solveRoute(null, req())).toMatchObject({ status: 'invalid-input', reason: 'bundle-not-loaded' });
  });
  it('same-cell request -> zero-length route without NaN', () => {
    const p = poi('syn-outpost');
    const r = ok(solveRoute(b, req({ destination: { east_m: p.east_m + 1, north_m: p.north_m - 1 } })));
    const m = r.candidates[0]!.outbound.metrics;
    expect(m.horizontalDistance_m).toBe(0);
    expect(m.unknownQualityPct).toBe(0);
    expect(r.candidates[0]!.policies).toHaveLength(3);
  });
  it('round trip adds a return leg', () => {
    const r = ok(solveRoute(b, req({ roundTrip: true, policies: ['shortest-feasible'] })));
    expect(r.candidates[0]!.missionStatus).toBe('round-trip-complete');
    expect(r.candidates[0]!.returnLeg!.cells[0]).toBe(r.destination.cell.index);
  });
});
