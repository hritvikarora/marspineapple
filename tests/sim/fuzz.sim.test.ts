/**
 * Seeded randomized simulation: random terrains (3 families) x random endpoint pairs/options,
 * every response checked against the contract invariants and the reference oracles.
 * Reproduce a failure:  SIM_FUZZ_SEED=<seed> npx vitest run tests/sim/fuzz.sim.test.ts
 * More coverage:        SIM_FUZZ_TERRAINS=300 npx vitest run tests/sim/fuzz.sim.test.ts
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { LocalPoint, RoutePolicyId, RouteRequest } from '../../src/contracts';
import {
  ALL_POLICIES,
  FUZZ_FAMILIES,
  buildRandomTerrain,
  checkResponse,
  dataValid,
  mulberry32,
  randInt,
  type RouteEngine,
} from '../../src/sim';
import { getEngine, stripTiming } from './engineUnderTest';
import { checkExpectations, uncertaintyNoWorse } from './expectations';

const BASE_SEED = 20261114;
const TERRAINS = Number(process.env.SIM_FUZZ_TERRAINS ?? 30);
const PAIRS_PER_TERRAIN = 7; // 30 x 7 = 210 requests by default
/** Seeds that once failed (kept forever). 20261608: uncertainty-aware crossed more unknown metres (placeholder 0.1.0). */
const REGRESSION_SEEDS = [20261608];
const ONLY = process.env.SIM_FUZZ_SEED ? Number(process.env.SIM_FUZZ_SEED) : null;

let engine: RouteEngine;
beforeAll(async () => {
  engine = await getEngine();
});

function randomPoint(rand: () => number, W: number, H: number, de: number, dn: number, valid: number[]): LocalPoint {
  const u = rand();
  if (u > 0.35 && valid.length) {
    // A data-valid cell, at a random spot inside it (exercises snapping).
    const i = valid[randInt(rand, 0, valid.length - 1)]!;
    return { east_m: ((i % W) + rand()) * de, north_m: (H - Math.floor(i / W) - rand()) * dn };
  }
  if (u < 0.06) return { east_m: (rand() * 1.4 - 0.2) * W * de, north_m: (rand() * 1.4 - 0.2) * H * dn }; // may be outside
  if (u < 0.1) return { east_m: rand() < 0.5 ? 0 : W * de, north_m: rand() * H * dn }; // on the west/east edge
  return { east_m: rand() * W * de, north_m: rand() * H * dn }; // anywhere inside (off-centre)
}

describe('seeded fuzz: invariants hold for random terrains and endpoints', () => {
  it(`${ONLY !== null ? 1 : TERRAINS + REGRESSION_SEEDS.length} terrains x ${PAIRS_PER_TERRAIN} requests`, async () => {
    const seeds = ONLY !== null ? [ONLY] : [...Array.from({ length: TERRAINS }, (_, k) => BASE_SEED + k), ...REGRESSION_SEEDS];
    const tally: Record<string, number> = {};
    let requests = 0;
    for (const seed of seeds) {
      const family = FUZZ_FAMILIES[seed % FUZZ_FAMILIES.length]!;
      const t = await buildRandomTerrain(seed, family);
      const { width: W, height: H, cellSizeEast_m: de, cellSizeNorth_m: dn } = t.bundle.manifest.grid;
      const rand = mulberry32(seed ^ 0x5eed);
      const valid = Array.from({ length: W * H }, (_, i) => i).filter((i) => dataValid(t.bundle, i));
      for (let k = 0; k < PAIRS_PER_TERRAIN; k++) {
        const policies = ALL_POLICIES.filter(() => rand() < 0.7);
        const req: RouteRequest = {
          requestId: `fuzz-${seed}-${k}`, bundleVersion: t.bundle.bundleVersion, modelVersion: engine.modelVersion,
          start: randomPoint(rand, W, H, de, dn, valid), destination: rand() < 0.05 ? { east_m: NaN, north_m: 1 } : randomPoint(rand, W, H, de, dn, valid),
          policies: (policies.length || rand() < 0.9 ? (policies.length ? policies : ['shortest-feasible']) : []) as RoutePolicyId[],
          strictQuality: rand() < 0.25, roundTrip: rand() < 0.3,
        };
        if (family === 'flat-quality' && k < 3) req.policies = ['shortest-feasible', 'uncertainty-aware'];
        if (randInt(rand, 0, 9) === 0) req.destination = { ...req.start }; // start == goal
        const res = engine.solve(t.bundle, req);
        const v = [
          ...checkResponse(t.bundle, req, res, engine.modelVersion),
          ...checkExpectations(t.bundle, req, res),
          ...(family === 'flat-quality' && !req.strictQuality ? uncertaintyNoWorse(res) : []),
        ];
        const again = JSON.stringify(stripTiming(engine.solve(t.bundle, req)));
        if (again !== JSON.stringify(stripTiming(res))) v.push('non-deterministic: second run differs');
        expect(v, `FAILING SEED ${seed} (family ${family}, request #${k}); reproduce with SIM_FUZZ_SEED=${seed}\nrequest=${JSON.stringify(req)}`).toEqual([]);
        const key = res.status === 'invalid-input' ? `invalid:${res.reason}` : res.status === 'no-path' ? `no-path:${res.reason}` : res.status;
        tally[key] = (tally[key] ?? 0) + 1;
        requests++;
      }
    }
    console.info(`[fuzz] ${requests} requests on ${seeds.length} terrains:`, tally);
    if (ONLY === null) {
      expect(requests).toBeGreaterThanOrEqual(200);
      // The generator must actually exercise the interesting outcomes.
      expect(tally.success ?? 0).toBeGreaterThan(80);
      expect(Object.keys(tally).some((k) => k.startsWith('no-path'))).toBe(true);
      expect(Object.keys(tally).some((k) => k.startsWith('invalid:endpoint'))).toBe(true);
    }
  }, 60000);
});
