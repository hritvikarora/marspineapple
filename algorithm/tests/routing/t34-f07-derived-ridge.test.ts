import { describe, expect, it } from 'vitest';
import {
  type EffectivePolicyWeights,
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
  createFixtureF07AInclinedPlane,
  createFixtureF07BDerivedRidgeBundle,
} from '../fixtures/f07.js';

function solveReferenceDijkstra(
  bundle: RegionRoutingBundle,
  startIdx: number,
  goalIdx: number,
  weights: EffectivePolicyWeights['effective'],
  maxSlopeDeg = 20,
  maxGradeDeg = 20
): { cellIndices: number[]; totalCost: number; horizontalDistanceM: number } {
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
      if (bundle.terrainSlopeDeg[v] > maxSlopeDeg) continue;

      if (DIR_IS_DIAG[d]) {
        const w1 = r * w + nc;
        const w2 = nr * w + c;
        if (bundle.terrainSlopeDeg[w1] > maxSlopeDeg || bundle.terrainSlopeDeg[w2] > maxSlopeDeg) {
          continue;
        }
      }

      const dStep = Math.hypot((nc - c) * bundle.cellSpacingEastM, (r - nr) * bundle.cellSpacingNorthM);
      const dz = Math.abs(bundle.elevationM[v] - bundle.elevationM[u]);
      const gradeDeg = (Math.atan2(dz, dStep) * 180) / Math.PI;
      if (gradeDeg > maxGradeDeg) continue;

      const sNorm = Math.min(1, Math.max(bundle.terrainSlopeDeg[u], bundle.terrainSlopeDeg[v]) / maxSlopeDeg);
      const rNorm = Math.min(1, Math.max(bundle.roughnessNormalized[u], bundle.roughnessNormalized[v]));
      let uPenalty = Math.max(
        QUALITY_PENALTY_BY_CODE[bundle.qualityCode[u] as QualityCode],
        QUALITY_PENALTY_BY_CODE[bundle.qualityCode[v] as QualityCode]
      );
      if (DIR_IS_DIAG[d]) {
        const w1 = r * w + nc;
        const w2 = nr * w + c;
        uPenalty = Math.max(
          uPenalty,
          QUALITY_PENALTY_BY_CODE[bundle.qualityCode[w1] as QualityCode],
          QUALITY_PENALTY_BY_CODE[bundle.qualityCode[w2] as QualityCode]
        );
      }

      const edgeCost =
        dStep * (1 + weights.alpha * sNorm + weights.beta * rNorm + weights.gamma * uPenalty);
      const cand = dist[u] + edgeCost;
      if (cand < dist[v] - 1e-12) {
        dist[v] = cand;
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

  let horiz = 0;
  for (let i = 1; i < cellIndices.length; i++) {
    const a = cellIndices[i - 1];
    const b = cellIndices[i];
    const ra = Math.floor(a / w);
    const ca = a - ra * w;
    const rb = Math.floor(b / w);
    const cb = b - rb * w;
    horiz += Math.hypot((cb - ca) * bundle.cellSpacingEastM, (ra - rb) * bundle.cellSpacingNorthM);
  }

  return { cellIndices, totalCost: dist[goalIdx], horizontalDistanceM: horiz };
}

describe('T34: Fixtures F07A (Float64 vs Float32) and F07B (7x9 Halo Ridge)', () => {
  it('F07A: Float64 Horn slope matches 12.0 deg to <= 1e-12 and Float32Array bundle satisfies Finding 8 tolerances', () => {
    const { slopeDegF64, rmsResidualF64, rmsResidualFromFloat32M, bundle } =
      createFixtureF07AInclinedPlane(12);

    expect(bundle.gridWidth).toBe(7);
    expect(bundle.gridHeight).toBe(5);
    expect(slopeDegF64.length).toBe(35);

    for (let i = 0; i < 35; i++) {
      expect(Math.abs(slopeDegF64[i] - 12.0)).toBeLessThanOrEqual(1e-12);
      expect(rmsResidualF64[i]).toBeLessThanOrEqual(1e-12);

      expect(Math.abs(bundle.terrainSlopeDeg[i] - 12.0)).toBeLessThanOrEqual(1e-3);
      expect(rmsResidualFromFloat32M[i]).toBeLessThanOrEqual(1e-4);
    }
  });

  it('F07B: Derived 7x9 halo ridge produces exact Row 0 zeros, Row 3 slopes/roughness, and optimal shortest vs terrain/uncertainty routes', () => {
    const { bundle, rmsResidualM } = createFixtureF07BDerivedRidgeBundle();

    expect(bundle.gridWidth).toBe(7);
    expect(bundle.gridHeight).toBe(5);

    // Interior Row 0 has exact 0.000000 deg slope and 0.000000 m roughness across all 7 columns
    for (let c = 0; c < 7; c++) {
      expect(bundle.terrainSlopeDeg[c]).toBe(0);
      expect(rmsResidualM[c]).toBe(0);
      expect(bundle.roughnessNormalized[c]).toBe(0);
    }

    // Interior Row 3 (indices 21..27) matches documented Float32 Horn slopes & RMS roughness
    const expectedRow3Slopes = [0, 7.125016, 14.036243, 0, 14.036243, 7.125016, 0];
    const expectedRow3Rms = [0, 0.589256, 0, 1.178511, 0, 0.589256, 0];
    for (let c = 0; c < 7; c++) {
      const k = 3 * 7 + c;
      expect(bundle.terrainSlopeDeg[k]).toBeCloseTo(expectedRow3Slopes[c], 4);
      expect(rmsResidualM[k]).toBeCloseTo(expectedRow3Rms[c], 5);
    }

    // Start (2,0) k=14 -> Goal (2,6) k=20
    const shortest = solveReferenceDijkstra(bundle, 14, 20, NOMINAL_POLICY_WEIGHTS.shortest);
    expect(shortest.cellIndices).toEqual([14, 15, 16, 17, 18, 19, 20]);
    expect(shortest.horizontalDistanceM).toBeCloseTo(60.0, 6);
    expect(shortest.totalCost).toBeCloseTo(60.0, 6);

    // Verify terrain cost along row-2 direct climb is strictly higher than the northern detour
    let row2TerrainCost = 0;
    for (let i = 1; i < shortest.cellIndices.length; i++) {
      const u = shortest.cellIndices[i - 1];
      const v = shortest.cellIndices[i];
      const sNorm = Math.min(1, Math.max(bundle.terrainSlopeDeg[u], bundle.terrainSlopeDeg[v]) / 20);
      const rNorm = Math.min(1, Math.max(bundle.roughnessNormalized[u], bundle.roughnessNormalized[v]));
      row2TerrainCost += 10 * (1 + 2 * sNorm + 1 * rNorm);
    }
    expect(row2TerrainCost).toBeCloseTo(182.08464, 4);

    // Terrain and uncertainty detour along flat northern valley floor
    const expectedDetourCost = 60 + 20 * Math.SQRT2;
    const terrain = solveReferenceDijkstra(bundle, 14, 20, NOMINAL_POLICY_WEIGHTS.terrain);
    expect(terrain.totalCost).toBeLessThan(row2TerrainCost);
    expect(terrain.cellIndices).toEqual([14, 7, 1, 2, 3, 4, 5, 13, 20]);
    expect(terrain.horizontalDistanceM).toBeCloseTo(expectedDetourCost, 6);
    expect(terrain.totalCost).toBeCloseTo(expectedDetourCost, 7);

    const uncertainty = solveReferenceDijkstra(bundle, 14, 20, {
      ...NOMINAL_POLICY_WEIGHTS.uncertainty,
      gamma: 0,
    });
    expect(uncertainty.cellIndices).toEqual([14, 7, 1, 2, 3, 4, 5, 13, 20]);
    expect(uncertainty.totalCost).toBeCloseTo(expectedDetourCost, 7);
  });
});
