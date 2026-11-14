import { beforeAll, describe, expect, it } from 'vitest';
import type { GridBundle, RouteSuccess } from '../src/contracts';
import { loadAndValidateBundle } from '../src/data/loadBundle';
import { MODEL_VERSION, solveRoute } from '../src/routing';
import { buildRouteRequest, createInitialState, reducer, type Action, type AppState } from '../src/state/store';
import { FIXTURE_MANIFEST, fileFetch } from './helpers';

let bundle: GridBundle;
beforeAll(async () => {
  bundle = await loadAndValidateBundle(FIXTURE_MANIFEST, { fetchImpl: fileFetch() });
});
const run = (s: AppState, ...as: Action[]) => as.reduce(reducer, s);
const pos = (id: string) => bundle.manifest.pointsOfInterest.find((p) => p.id === id)!.position;

/** A state with a finished successful route. */
function routed(): AppState {
  let s = run(
    createInitialState(MODEL_VERSION),
    { type: 'region/loaded', bundle },
    { type: 'mission/setStart', endpoint: { point: pos('syn-outpost'), poiId: 'syn-outpost' } },
    { type: 'mission/setDestination', endpoint: { point: pos('syn-east-bench'), poiId: 'syn-east-bench' } },
    { type: 'route/requested', requestId: 'r1' },
  );
  const response = solveRoute(bundle, buildRouteRequest(s, 'r1')!) as RouteSuccess;
  s = reducer(s, { type: 'route/update', response });
  expect(s.routeCandidates.length).toBeGreaterThan(0);
  expect(s.isStale).toBe(false);
  return s;
}

describe('store invalidation rules (plan 2.1)', () => {
  const invalidating: [string, Action][] = [
    ['endpoint change', { type: 'mission/setDestination', endpoint: { point: { east_m: 55, north_m: 55 }, poiId: null } }],
    ['start change', { type: 'mission/setStart', endpoint: null }],
    ['policy change', { type: 'mission/setPolicies', policies: ['terrain-aware'] }],
    ['weight change', { type: 'mission/setWeights', policy: 'terrain-aware', weights: { slope: 2, roughness: 0, quality: 0 } }],
    ['strict quality toggle', { type: 'mission/setStrictQuality', value: true }],
    ['round-trip toggle', { type: 'mission/setRoundTrip', value: true }],
    ['model change', { type: 'mission/setModelVersion', modelVersion: 'x' }],
  ];
  it.each(invalidating)('%s marks routes stale', (_n, a) => {
    const s = reducer(routed(), a);
    expect(s.isStale).toBe(true);
    expect(s.routeCandidates.length).toBeGreaterThan(0); // kept for labelled comparison
  });

  const nonInvalidating: [string, Action][] = [
    ['layer visibility', { type: 'view/setLayer', layer: 'slope', visible: true }],
    ['layer opacity', { type: 'view/setLayer', layer: 'quality', opacity: 0.2 }],
    ['camera', { type: 'view/setCamera', camera: { orbit: 1 } }],
    ['panel', { type: 'view/setPanel', panel: 'evidence', expanded: true }],
    ['2D/3D toggle', { type: 'view/setMode', mode: '3d' }],
    ['candidate selection', { type: 'route/select', candidateId: 'c1' }],
  ];
  it.each(nonInvalidating)('%s does NOT invalidate', (_n, a) => {
    const before = routed();
    const s = reducer(before, a);
    expect(s.isStale).toBe(false);
    expect(s.routeCandidates).toBe(before.routeCandidates);
    expect(s.currentMission).toBe(before.currentMission);
  });

  it('region version change clears routes and endpoints', () => {
    const other = { ...bundle, bundleVersion: 'other-v1', manifest: { ...bundle.manifest, bundleVersion: 'other-v1' } };
    const s = reducer(routed(), { type: 'region/loaded', bundle: other });
    expect(s.routeCandidates).toEqual([]);
    expect(s.currentMission.start).toBeNull();
    expect(s.selectedCandidateId).toBeNull();
  });

  it('invalidation while running detaches the request so its late response is ignored', () => {
    let s = routed();
    s = reducer(s, { type: 'route/requested', requestId: 'r2' });
    const late = solveRoute(bundle, buildRouteRequest(s, 'r2')!);
    s = reducer(s, { type: 'mission/setRoundTrip', value: true });
    expect(s.activeRequestId).toBeNull();
    const after = reducer(s, { type: 'route/update', response: late });
    expect(after).toBe(s);
  });

  it('ignores responses for other requestIds or bundle versions', () => {
    let s = routed();
    s = reducer(s, { type: 'route/requested', requestId: 'r3' });
    const resp = solveRoute(bundle, buildRouteRequest(s, 'r3')!);
    expect(reducer(s, { type: 'route/update', response: { ...resp, requestId: 'r-old' } })).toBe(s);
    expect(reducer(s, { type: 'route/update', response: { ...resp, bundleVersion: 'x' } })).toBe(s);
    expect(reducer(s, { type: 'route/update', response: resp }).routeRun.kind).toBe('finished');
  });

  it('selecting an unknown candidate is a no-op; first candidate auto-selected', () => {
    const s = routed();
    expect(s.selectedCandidateId).toBe('c0');
    expect(reducer(s, { type: 'route/select', candidateId: 'nope' })).toBe(s);
  });

  it('buildRouteRequest echoes bundle+model versions and refuses incomplete missions', () => {
    const s = routed();
    const r = buildRouteRequest(s, 'q')!;
    expect(r).toMatchObject({ requestId: 'q', bundleVersion: 'synthetic-v0.1.0', modelVersion: MODEL_VERSION, roundTrip: false, strictQuality: false });
    expect(buildRouteRequest(reducer(s, { type: 'mission/setStart', endpoint: null }), 'q')).toBeNull();
  });
});
