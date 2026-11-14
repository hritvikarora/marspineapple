import { describe, expect, it } from 'vitest';
import {
  QUALITY_CODE,
  type EffectivePolicyWeights,
  type PolicyId,
  type RegionRoutingBundle,
} from '../../src/contracts/routing.js';
import {
  DIR_COUNT,
  DIR_DC,
  DIR_DR,
  DIR_IS_DIAG,
  NOMINAL_POLICY_WEIGHTS,
  QUALITY_PENALTY_BY_CODE,
  type QualityCode,
} from '../../src/routing/types.js';
import {
  createFixtureF09SubtestACounterexampleBundle,
  createFixtureF09SubtestCMixedUnknownLowBundle,
} from '../fixtures/f09.js';

function computeEffectiveWeights(
  bundle: RegionRoutingBundle,
  policies: PolicyId[]
): Partial<Record<PolicyId, EffectivePolicyWeights>> {
  let minU = Number.POSITIVE_INFINITY;
  let maxU = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < bundle.qualityCode.length; i++) {
    const q = bundle.qualityCode[i] as QualityCode;
    if (q === QUALITY_CODE.INVALID) continue;
    const u = QUALITY_PENALTY_BY_CODE[q];
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
  }
  const isUniform = Math.abs(maxU - minU) <= 1e-12;
  const out: Partial<Record<PolicyId, EffectivePolicyWeights>> = {};
  for (const p of policies) {
    const nominal = NOMINAL_POLICY_WEIGHTS[p];
    const override = p === 'uncertainty' && isUniform;
    out[p] = {
      policyId: p,
      nominal,
      effective: {
        alpha: nominal.alpha,
        beta: nominal.beta,
        gamma: override ? 0 : nominal.gamma,
      },
      uniformQualityOverride: override,
      minAdmissibleU: minU,
      maxAdmissibleU: maxU,
    };
  }
  return out;
}

function computeEdgeCost(
  bundle: RegionRoutingBundle,
  u: number,
  v: number,
  dir: number,
  weights: EffectivePolicyWeights['effective'],
  maxSlopeDeg = 20
): number {
  const w = bundle.gridWidth;
  const ru = Math.floor(u / w);
  const cu = u - ru * w;
  const rv = Math.floor(v / w);
  const cv = v - rv * w;
  const dStep = Math.hypot((cv - cu) * bundle.cellSpacingEastM, (ru - rv) * bundle.cellSpacingNorthM);
  const sNorm = Math.min(1, Math.max(bundle.terrainSlopeDeg[u], bundle.terrainSlopeDeg[v]) / maxSlopeDeg);
  const rNorm = Math.min(1, Math.max(bundle.roughnessNormalized[u], bundle.roughnessNormalized[v]));
  let uPen = Math.max(
    QUALITY_PENALTY_BY_CODE[bundle.qualityCode[u] as QualityCode],
    QUALITY_PENALTY_BY_CODE[bundle.qualityCode[v] as QualityCode]
  );
  if (DIR_IS_DIAG[dir]) {
    const w1 = ru * w + cv;
    const w2 = rv * w + cu;
    uPen = Math.max(
      uPen,
      QUALITY_PENALTY_BY_CODE[bundle.qualityCode[w1] as QualityCode],
      QUALITY_PENALTY_BY_CODE[bundle.qualityCode[w2] as QualityCode]
    );
  }
  return dStep * (1 + weights.alpha * sNorm + weights.beta * rNorm + weights.gamma * uPen);
}

function solveDijkstra(
  bundle: RegionRoutingBundle,
  startIdx: number,
  goalIdx: number,
  weights: EffectivePolicyWeights['effective']
): { cellIndices: number[]; totalCost: number } {
  const w = bundle.gridWidth;
  const h = bundle.gridHeight;
  const n = w * h;
  const dist = new Float64Array(n).fill(Number.POSITIVE_INFINITY);
  const parent = new Int32Array(n).fill(-1);
  const visited = new Uint8Array(n);
  dist[startIdx] = 0;

  for (let step = 0; step < n; step++) {
    let u = -1;
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < n; i++) {
      if (!visited[i] && dist[i] < best) {
        best = dist[i];
        u = i;
      }
    }
    if (u === -1 || u === goalIdx) break;
    visited[u] = 1;
    const r = Math.floor(u / w);
    const c = u - r * w;
    for (let d = 0; d < DIR_COUNT; d++) {
      const nr = r + DIR_DR[d];
      const nc = c + DIR_DC[d];
      if (nr < 0 || nr >= h || nc < 0 || nc >= w) continue;
      const v = nr * w + nc;
      const cost = dist[u] + computeEdgeCost(bundle, u, v, d, weights);
      if (cost < dist[v] - 1e-12) {
        dist[v] = cost;
        parent[v] = u;
      }
    }
  }

  const cellIndices: number[] = [];
  let cur = goalIdx;
  while (cur !== -1) {
    cellIndices.push(cur);
    cur = parent[cur];
  }
  cellIndices.reverse();
  return { cellIndices, totalCost: dist[goalIdx] };
}

function scorePathCost(
  bundle: RegionRoutingBundle,
  path: number[],
  weights: EffectivePolicyWeights['effective']
): number {
  const w = bundle.gridWidth;
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const u = path[i - 1];
    const v = path[i];
    const dr = Math.floor(v / w) - Math.floor(u / w);
    const dc = (v % w) - (u % w);
    let dir = 0;
    for (let d = 0; d < DIR_COUNT; d++) {
      if (DIR_DR[d] === dr && DIR_DC[d] === dc) {
        dir = d;
        break;
      }
    }
    total += computeEdgeCost(bundle, u, v, dir, weights);
  }
  return total;
}

describe('T36: Fixture F09 uniform-quality counterexample, standalone uncertainty, and mixed quality trade-off', () => {
  it('Subtest A (Finding 1): Raw gamma=2 prefers direct 120.0 over detour 120.710678, whereas gamma_eff=0 selects [5,1,2,3,9] at 48.28427125', () => {
    const bundle = createFixtureF09SubtestACounterexampleBundle();
    const directPath = [5, 6, 7, 8, 9];
    const detourPath = [5, 1, 2, 3, 9];

    // Raw unshifted gamma = 2 counterexample
    const rawWeights = NOMINAL_POLICY_WEIGHTS.uncertainty;
    const rawDirect = scorePathCost(bundle, directPath, rawWeights);
    const rawDetour = scorePathCost(bundle, detourPath, rawWeights);
    expect(rawDirect).toBeCloseTo(120.0, 7);
    expect(rawDetour).toBeCloseTo((20 + 20 * Math.SQRT2) * 2.5, 7);
    expect(rawDirect).toBeLessThan(rawDetour);
    expect(solveDijkstra(bundle, 5, 9, rawWeights).cellIndices).toEqual(directPath);

    // Explicit Effective-Policy Model Rule: U_min = U_max = 0.75 => gamma_eff = 0
    const eff = computeEffectiveWeights(bundle, ['shortest', 'terrain', 'uncertainty']);
    expect(eff.uncertainty?.uniformQualityOverride).toBe(true);
    expect(eff.uncertainty?.effective.gamma).toBe(0);
    expect(eff.uncertainty?.minAdmissibleU).toBe(0.75);
    expect(eff.uncertainty?.maxAdmissibleU).toBe(0.75);

    const terrainRes = solveDijkstra(bundle, 5, 9, eff.terrain!.effective);
    const uncRes = solveDijkstra(bundle, 5, 9, eff.uncertainty!.effective);
    expect(terrainRes.cellIndices).toEqual(uncRes.cellIndices);
    expect(terrainRes.cellIndices).not.toContain(7);
    expect(terrainRes.totalCost).toBeCloseTo(20 + 20 * Math.SQRT2, 7);
    expect(uncRes.totalCost).toBeCloseTo(20 + 20 * Math.SQRT2, 7);
    expect(scorePathCost(bundle, detourPath, eff.uncertainty!.effective)).toBeCloseTo(
      20 + 20 * Math.SQRT2,
      7
    );
  });

  it('Subtest B (Finding 7): Standalone ["uncertainty"] resolves via gamma_eff without requiring or injecting "terrain"', () => {
    const bundle = createFixtureF09SubtestACounterexampleBundle();
    const standaloneWeights = computeEffectiveWeights(bundle, ['uncertainty']);

    expect(Object.keys(standaloneWeights)).toEqual(['uncertainty']);
    expect(standaloneWeights.terrain).toBeUndefined();
    expect(standaloneWeights.uncertainty?.effective.gamma).toBe(0);

    const res = solveDijkstra(bundle, 5, 9, standaloneWeights.uncertainty!.effective);
    expect(res.cellIndices).not.toContain(7);
    expect(res.totalCost).toBeCloseTo(20 + 20 * Math.SQRT2, 7);
  });

  it('Subtest C (Findings 1 & 6): Mixed UNKNOWN (0.75) and LOW (1.0) keeps unshifted U and activates Branch Q2 conditions', () => {
    const bundle = createFixtureF09SubtestCMixedUnknownLowBundle();
    const eff = computeEffectiveWeights(bundle, ['shortest', 'terrain', 'uncertainty']);

    expect(eff.uncertainty?.uniformQualityOverride).toBe(false);
    expect(eff.uncertainty?.effective.gamma).toBe(2);
    expect(eff.uncertainty?.minAdmissibleU).toBe(0.75);
    expect(eff.uncertainty?.maxAdmissibleU).toBe(1.0);

    const detourCost = scorePathCost(bundle, [5, 1, 2, 3, 9], eff.uncertainty!.effective);
    expect(detourCost).toBeCloseTo((20 + 20 * Math.SQRT2) * 2.5, 7);

    // Adding a single ACCEPTABLE cell at distant corner (0,4) [index 4] does not alter corridor edge costs
    const withAcceptableCorner: RegionRoutingBundle = {
      ...bundle,
      qualityCode: new Uint8Array(bundle.qualityCode),
    };
    withAcceptableCorner.qualityCode[4] = QUALITY_CODE.ACCEPTABLE;
    const cornerEff = computeEffectiveWeights(withAcceptableCorner, ['uncertainty']);
    expect(cornerEff.uncertainty?.effective.gamma).toBe(2);
    expect(
      computeEdgeCost(withAcceptableCorner, 5, 6, 2, cornerEff.uncertainty!.effective)
    ).toBeCloseTo(25.0, 7);
    expect(
      computeEdgeCost(withAcceptableCorner, 6, 7, 2, cornerEff.uncertainty!.effective)
    ).toBeCloseTo(30.0, 7);
    expect(scorePathCost(withAcceptableCorner, [5, 1, 2, 3, 9], cornerEff.uncertainty!.effective)).toBeCloseTo(
      detourCost,
      7
    );

    // Verify Branch Q2 condition holds between direct [5,6,7,8,9] (20m LOW, 20m UNKNOWN)
    // and corner-clear detour [5,1,2,3,9] (0m LOW, 48.284271m UNKNOWN)
    const directLowM = 20.0;
    const directUnkM = 20.0;
    const detourLowM = 0.0;
    const detourUnkM = 20 + 20 * Math.SQRT2;
    expect(detourLowM - directLowM).toBeLessThan(-1e-4);
    expect(detourUnkM - directUnkM).toBeGreaterThan(1e-4);
  });
});
