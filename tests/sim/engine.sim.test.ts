/**
 * Scenario simulations through the RouteRequest/RouteResponse contract against the engine under test
 * (src/routing by default; SIM_ENGINE=... to swap). Placeholder-independent unless noted.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { RouteFinalResponse, RouteSuccess } from '../../src/contracts';
import {
  SCENARIO_IDS,
  buildScenario,
  checkResponse,
  octile,
  referenceShortest,
  dataValid,
  type RouteEngine,
  type ScenarioInstance,
  type SimCase,
} from '../../src/sim';
import { getEngine, requestFor, stripTiming } from './engineUnderTest';
import { checkExpectations, uncertaintyNoWorse } from './expectations';

let engine: RouteEngine;
const scenarios = new Map<string, ScenarioInstance>();
const SMALL = SCENARIO_IDS.filter((id) => id !== 'large-512');
beforeAll(async () => {
  engine = await getEngine();
  for (const id of SCENARIO_IDS) scenarios.set(id, await buildScenario(id));
});
const sc = (id: string) => scenarios.get(id)!;
const caseOf = (id: string, caseId: string) => sc(id).cases.find((c) => c.id === caseId)!;
function run(id: string, c: SimCase, over: Partial<ReturnType<typeof requestFor>> = {}): RouteFinalResponse {
  const req = { ...requestFor(sc(id), c, engine), ...over };
  const res = engine.solve(sc(id).bundle, req);
  const v = [...checkResponse(sc(id).bundle, req, res, engine.modelVersion), ...checkExpectations(sc(id).bundle, req, res)];
  expect(v, `${id}/${c.id}`).toEqual([]);
  return res;
}
const success = (r: RouteFinalResponse): RouteSuccess => {
  expect(r.status).toBe('success');
  return r as RouteSuccess;
};
const by = (r: RouteSuccess, policy: string) => r.candidates.find((c) => c.policies.includes(policy as never))!;

describe('every scenario case: contract invariants + declared expectation + oracle', () => {
  const all = () => SMALL.flatMap((id) => sc(id).cases.map((c) => [id, c] as const));
  it('all small-scenario cases', () => {
    let n = 0;
    for (const [id, c] of all()) {
      const r = run(id, c);
      const e = c.expect;
      if (e.status === 'oracle') { n++; continue; }
      expect(r.status, `${id}/${c.id}`).toBe(e.status);
      if (e.status === 'no-path' && e.reason && r.status === 'no-path') expect(r.reason, `${id}/${c.id}`).toBe(e.reason);
      if (e.status === 'invalid-input' && r.status === 'invalid-input') {
        expect(r.reason, `${id}/${c.id}`).toBe(e.reason);
        if (e.field !== undefined) expect(r.field, `${id}/${c.id}`).toBe(e.field);
      }
      if (e.status === 'success' && e.zeroLength && r.status === 'success') {
        for (const k of r.candidates) expect(k.outbound.metrics.horizontalDistance_m).toBe(0);
      }
      if (c.mustPassThroughAnyOf && r.status === 'success') {
        for (const k of r.candidates) expect(k.outbound.cells.some((i) => c.mustPassThroughAnyOf!.includes(i)), `${id}/${c.id}/${k.candidateId}`).toBe(true);
      }
      n++;
    }
    expect(n).toBeGreaterThanOrEqual(35);
  });
});

describe('geometry', () => {
  it('flat plain: shortest length equals the octile distance and lies within [euclid, 1.0824 x euclid]', () => {
    for (const cid of ['diagonal', 'off-axis-round-trip']) {
      const r = success(run('flat-plain', caseOf('flat-plain', cid)));
      const sf = by(r, 'shortest-feasible').outbound.metrics.horizontalDistance_m;
      const euclid = Math.hypot(r.destination.accepted.east_m - r.start.accepted.east_m, r.destination.accepted.north_m - r.start.accepted.north_m);
      expect(sf).toBeCloseTo(octile(sc('flat-plain').bundle, r.start.cell.index, r.destination.cell.index), 6);
      expect(sf).toBeGreaterThanOrEqual(euclid - 1e-9);
      expect(sf).toBeLessThanOrEqual(euclid * (1 + (Math.SQRT2 - 1) / Math.sqrt(4 - 2 * Math.SQRT2)) + 1e-9);
    }
  });

  it('endpoints snap to cell centres even when the request is off-centre', () => {
    const r = success(run('flat-plain', caseOf('flat-plain', 'same-cell')));
    expect(r.destination.requested).not.toEqual(r.destination.accepted);
    expect(r.destination.accepted).toEqual(r.start.accepted);
    expect(r.start.cell.index).toBe(r.destination.cell.index);
    expect(r.candidates[0]!.outbound.cells).toHaveLength(1);
  });

  it('uniform slope plane: route reports the analytic slope, net elevation change is exact', () => {
    const s = sc('slope-plane');
    const r = success(run('slope-plane', caseOf('slope-plane', 'uphill-round-trip')));
    for (const c of r.candidates) {
      expect(c.outbound.metrics.maxTerrainSlope_deg).toBeCloseTo(s.facts.slopeDeg!, 2);
      const net = s.bundle.elevation[r.destination.cell.index]! - s.bundle.elevation[r.start.cell.index]!;
      expect(c.outbound.metrics.ascent_m - c.outbound.metrics.descent_m).toBeCloseTo(net, 3);
      expect(c.outbound.metrics.surfaceDistance_m).toBeGreaterThan(c.outbound.metrics.horizontalDistance_m);
    }
  });

  it('ridge: every policy goes through the single gap cell', () => {
    for (const cid of ['straight-across', 'north-to-south']) {
      const r = success(run('ridge-gap', caseOf('ridge-gap', cid)));
      const W = sc('ridge-gap').bundle.width;
      for (const c of r.candidates) {
        const ridgeCells = c.outbound.cells.filter((i) => i % W === 20);
        expect(ridgeCells.map((i) => Math.floor(i / W))).toEqual([14]);
      }
    }
  });

  it('maze: serpentine length equals the reference optimum and exceeds the corridor lower bound', () => {
    const s = sc('maze');
    const r = success(run('maze', caseOf('maze', 'serpentine')));
    const hd = by(r, 'shortest-feasible').outbound.metrics.horizontalDistance_m;
    expect(hd).toBeGreaterThan(s.facts.minHorizontal_m!);
    expect(hd).toBeCloseTo(referenceShortest(s.bundle, r.start.cell.index, r.destination.cell.index, (i) => dataValid(s.bundle, i), false), 6);
  });

  it('crater: the floor is unreachable from outside, but routes exist on each side', () => {
    expect(run('crater-basin', caseOf('crater-basin', 'outside-to-floor')).status).toBe('no-path');
    expect(run('crater-basin', caseOf('crater-basin', 'floor-to-outside-round-trip')).status).toBe('no-path');
    expect(run('crater-basin', caseOf('crater-basin', 'around-the-rim')).status).toBe('success');
    expect(run('crater-basin', caseOf('crater-basin', 'across-the-floor')).status).toBe('success');
  });
});

describe('quality policies', () => {
  it('uncertainty-aware crosses less unknown-quality terrain than shortest-feasible (and pays in length)', () => {
    const r = success(run('quality-patchwork', caseOf('quality-patchwork', 'across-band')));
    const sf = by(r, 'shortest-feasible').outbound.metrics, ua = by(r, 'uncertainty-aware').outbound.metrics;
    expect(sf.unknownQualityLength_m).toBeGreaterThan(100);
    expect(ua.unknownQualityLength_m).toBeLessThan(sf.unknownQualityLength_m);
    expect(ua.horizontalDistance_m).toBeGreaterThan(sf.horizontalDistance_m);
    expect(uncertaintyNoWorse(r)).toEqual([]);
  });

  it('strict mode never touches unknown quality; when that disconnects, reason says so', () => {
    const r = success(run('quality-patchwork', caseOf('quality-patchwork', 'across-band-strict')));
    for (const c of r.candidates) expect(c.outbound.metrics.unknownQualityLength_m).toBe(0);
    const np = run('quality-wall', caseOf('quality-wall', 'strict'));
    expect(np).toMatchObject({ status: 'no-path', reason: 'strict-quality-disconnects' });
    expect(run('quality-wall', caseOf('quality-wall', 'non-strict')).status).toBe('success');
  });
});

describe('round trips', () => {
  it('return leg runs destination -> start and is as long as the outbound on symmetric terrain', () => {
    for (const [id, cid] of [['flat-plain', 'off-axis-round-trip'], ['degenerate-endpoints', 'corner-to-corner-round-trip'], ['strip-row', 'end-to-end'], ['ridge-gap', 'north-to-south']] as const) {
      const r = success(run(id, caseOf(id, cid)));
      for (const c of r.candidates) {
        expect(c.missionStatus, `${id}`).toBe('round-trip-complete');
        expect(c.returnLeg!.cells[0]).toBe(r.destination.cell.index);
        expect(c.returnLeg!.cells.at(-1)).toBe(r.start.cell.index);
        if (c.policies.includes('shortest-feasible'))
          expect(c.returnLeg!.metrics.horizontalDistance_m, id).toBeCloseTo(c.outbound.metrics.horizontalDistance_m, 6);
        expect(c.returnLeg!.metrics.ascent_m).toBeCloseTo(c.outbound.metrics.descent_m, 3);
      }
    }
  });

  it('start == goal round trip is two zero-length legs', () => {
    const r = success(run('degenerate-endpoints', caseOf('degenerate-endpoints', 'start-equals-goal')));
    expect(r.candidates[0]!.returnLeg!.metrics.horizontalDistance_m).toBe(0);
  });
});

describe('request validation', () => {
  it('version mismatch, model mismatch and missing bundle are invalid-input, never a route', () => {
    const c = caseOf('flat-plain', 'diagonal');
    const v = engine.solve(sc('flat-plain').bundle, { ...requestFor(sc('flat-plain'), c, engine), bundleVersion: 'other' });
    expect(v).toMatchObject({ status: 'invalid-input', reason: 'version-mismatch', field: 'bundleVersion' });
    const m = engine.solve(sc('flat-plain').bundle, { ...requestFor(sc('flat-plain'), c, engine), modelVersion: 'someone-else-9' });
    expect(m).toMatchObject({ status: 'invalid-input', reason: 'model-mismatch' });
    const n = engine.solve(null as never, requestFor(sc('flat-plain'), c, engine));
    expect(n).toMatchObject({ status: 'invalid-input', reason: 'bundle-not-loaded' });
  });
});

describe('determinism', () => {
  it('same input => identical output across 20 runs (every small scenario case)', () => {
    for (const id of SMALL) for (const c of sc(id).cases) {
      const req = requestFor(sc(id), c, engine);
      const first = JSON.stringify(stripTiming(engine.solve(sc(id).bundle, req)));
      for (let k = 0; k < 19; k++) expect(JSON.stringify(stripTiming(engine.solve(sc(id).bundle, req))), `${id}/${c.id} run ${k + 2}`).toBe(first);
    }
  });

  it('policy order in the request does not change the routes found', () => {
    const c = caseOf('quality-patchwork', 'across-band');
    const a = success(run('quality-patchwork', c));
    const b = success(run('quality-patchwork', c, { policies: ['uncertainty-aware', 'terrain-aware', 'shortest-feasible'] }));
    const paths = (r: RouteSuccess) => r.candidates.map((k) => k.outbound.cells.join(',')).sort();
    expect(paths(b)).toEqual(paths(a));
  });
});

describe('performance', () => {
  it('512x512 grid, three policies: within a generous budget', () => {
    const s = sc('large-512');
    const c = s.cases[0]!;
    const req = requestFor(s, c, engine);
    const t0 = performance.now();
    const r = engine.solve(s.bundle, req);
    const ms = performance.now() - t0;
    const v = [...checkResponse(s.bundle, req, r, engine.modelVersion), ...checkExpectations(s.bundle, req, r)];
    expect(v).toEqual([]);
    expect(r.status).toBe('success');
    console.info(`[perf] large-512 (${s.bundle.width}x${s.bundle.height}, 3 policies): ${ms.toFixed(0)} ms, ${(r as RouteSuccess).candidates.length} candidate(s)`);
    expect(ms).toBeLessThan(Number(process.env.SIM_PERF_BUDGET_MS ?? 8000));
  });
});
