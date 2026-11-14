import { describe, expect, it } from 'vitest';
import {
  QUALITY_CODE,
  type ConstraintProfile,
  type EffectivePolicyWeights,
  type QualityCode,
  type QualityMode,
  type RegionRoutingBundle,
} from '../../src/contracts/routing.js';
import { solveDijkstra } from '../../src/routing/dijkstra.js';
import {
  DIR_DC,
  DIR_DR,
  DIR_IS_DIAG,
  NOMINAL_POLICY_WEIGHTS,
  QUALITY_PENALTY_BY_CODE,
  type EdgeEvaluatorPort,
} from '../../src/routing/types.js';

function makeProfile(): ConstraintProfile {
  return {
    profileId: 'educational-eva-v1',
    version: '1.0.0',
    maxTerrainSlopeDeg: 20,
    maxRouteGradeDeg: 20,
    roughnessScaleM: 0.5,
    nominalWalkingSpeedMps: 1.0,
    gradePenaltyKappa: 2.0,
    isSimulatedAssumption: true,
  };
}

function makeBundle(
  width: number,
  height: number,
  dx: number,
  dy: number
): RegionRoutingBundle {
  const n = width * height;
  return {
    regionId: 'test',
    datasetVersion: '1',
    gridWidth: width,
    gridHeight: height,
    cellSpacingEastM: dx,
    cellSpacingNorthM: dy,
    noDataSentinel: -32768,
    roughnessScaleM: 0.5,
    qualityMappingVersion: '1',
    elevationM: new Float32Array(n).fill(-2540.0),
    terrainSlopeDeg: new Float32Array(n).fill(0),
    roughnessNormalized: new Float32Array(n).fill(0),
    qualityCode: new Uint8Array(n).fill(QUALITY_CODE.ACCEPTABLE),
  };
}

function isCellAdmissible(
  bundle: RegionRoutingBundle,
  row: number,
  col: number,
  profile: ConstraintProfile,
  qualityMode: QualityMode
): boolean {
  if (row < 0 || row >= bundle.gridHeight || col < 0 || col >= bundle.gridWidth) return false;
  const idx = row * bundle.gridWidth + col;
  const z = bundle.elevationM[idx];
  if (!Number.isFinite(z) || Math.abs(z - bundle.noDataSentinel) <= 1e-5) return false;
  if (bundle.qualityCode[idx] === QUALITY_CODE.INVALID) return false;
  if (bundle.terrainSlopeDeg[idx] > profile.maxTerrainSlopeDeg) return false;
  if (qualityMode === 'strict' && bundle.qualityCode[idx] !== QUALITY_CODE.ACCEPTABLE) return false;
  return true;
}

function makeEdgeEvaluator(): EdgeEvaluatorPort {
  return {
    isEdgeAdmissible(bundle, uIndex, vIndex, dir, profile, qualityMode): boolean {
      const w = bundle.gridWidth;
      const uRow = (uIndex / w) | 0;
      const uCol = uIndex - uRow * w;
      const vRow = (vIndex / w) | 0;
      const vCol = vIndex - vRow * w;
      if (
        !isCellAdmissible(bundle, uRow, uCol, profile, qualityMode) ||
        !isCellAdmissible(bundle, vRow, vCol, profile, qualityMode)
      ) {
        return false;
      }
      if (DIR_IS_DIAG[dir]) {
        const dr = DIR_DR[dir];
        const dc = DIR_DC[dir];
        if (
          !isCellAdmissible(bundle, uRow + dr, uCol, profile, qualityMode) ||
          !isCellAdmissible(bundle, uRow, uCol + dc, profile, qualityMode)
        ) {
          return false;
        }
      }
      const dist = Math.hypot(
        (vCol - uCol) * bundle.cellSpacingEastM,
        -(vRow - uRow) * bundle.cellSpacingNorthM
      );
      const dz = Math.abs(bundle.elevationM[vIndex] - bundle.elevationM[uIndex]);
      const gradeDeg = Math.atan2(dz, dist) * (180 / Math.PI);
      return gradeDeg <= profile.maxRouteGradeDeg;
    },
    computeEdgeCost(
      bundle: RegionRoutingBundle,
      uIndex: number,
      vIndex: number,
      dir: number,
      profile: ConstraintProfile,
      weights: EffectivePolicyWeights['effective']
    ): number {
      const w = bundle.gridWidth;
      const uRow = (uIndex / w) | 0;
      const uCol = uIndex - uRow * w;
      const vRow = (vIndex / w) | 0;
      const vCol = vIndex - vRow * w;
      const d = Math.hypot(
        (vCol - uCol) * bundle.cellSpacingEastM,
        -(vRow - uRow) * bundle.cellSpacingNorthM
      );

      let s = Math.max(
        bundle.terrainSlopeDeg[uIndex] / profile.maxTerrainSlopeDeg,
        bundle.terrainSlopeDeg[vIndex] / profile.maxTerrainSlopeDeg
      );
      s = Math.max(0, Math.min(1, s));
      let r = Math.max(bundle.roughnessNormalized[uIndex], bundle.roughnessNormalized[vIndex]);
      r = Math.max(0, Math.min(1, r));
      let u = Math.max(
        QUALITY_PENALTY_BY_CODE[bundle.qualityCode[uIndex] as QualityCode],
        QUALITY_PENALTY_BY_CODE[bundle.qualityCode[vIndex] as QualityCode]
      );

      if (DIR_IS_DIAG[dir]) {
        const w1 = (uRow + DIR_DR[dir]) * w + uCol;
        const w2 = uRow * w + (uCol + DIR_DC[dir]);
        u = Math.max(
          u,
          QUALITY_PENALTY_BY_CODE[bundle.qualityCode[w1] as QualityCode],
          QUALITY_PENALTY_BY_CODE[bundle.qualityCode[w2] as QualityCode]
        );
      }

      return d * (1 + weights.alpha * s + weights.beta * r + weights.gamma * u);
    },
  };
}

describe('T18 Standalone Reference Dijkstra Oracle', () => {
  it('solves F01 flat cardinal, pure diagonal, octile, and same-cell cases accurately', () => {
    const bundle = makeBundle(5, 5, 5, 5);
    const profile = makeProfile();
    const edgeEval = makeEdgeEvaluator();
    const weights = NOMINAL_POLICY_WEIGHTS.shortest;

    const cardinal = solveDijkstra({
      bundle,
      startIndex: 2 * 5 + 0,
      goalIndex: 2 * 5 + 4,
      profile,
      qualityMode: 'prefer',
      weights,
      edgeEvaluator: edgeEval,
    });
    expect(cardinal.status).toBe('success');
    expect(cardinal.totalCost).toBeCloseTo(20.0, 9);

    const diag = solveDijkstra({
      bundle,
      startIndex: 4 * 5 + 0,
      goalIndex: 0 * 5 + 4,
      profile,
      qualityMode: 'prefer',
      weights,
      edgeEvaluator: edgeEval,
    });
    expect(diag.status).toBe('success');
    expect(diag.totalCost).toBeCloseTo(20 * Math.SQRT2, 9);

    const octile = solveDijkstra({
      bundle,
      startIndex: 4 * 5 + 0,
      goalIndex: 2 * 5 + 4,
      profile,
      qualityMode: 'prefer',
      weights,
      edgeEvaluator: edgeEval,
    });
    expect(octile.status).toBe('success');
    expect(octile.totalCost).toBeCloseTo(10 * Math.SQRT2 + 10, 9);

    const sameCell = solveDijkstra({
      bundle,
      startIndex: 12,
      goalIndex: 12,
      profile,
      qualityMode: 'prefer',
      weights,
      edgeEvaluator: edgeEval,
    });
    expect(sameCell).toEqual({
      status: 'success',
      cellIndices: [12],
      totalCost: 0,
      exploredNodes: 0,
    });
  });

  it('navigates F02 wall barrier with 1-cell gap and enforces no-corner-cutting', () => {
    const bundle = makeBundle(5, 5, 10, 10);
    for (let r = 1; r <= 4; r++) {
      bundle.elevationM[r * 5 + 2] = -32768;
    }

    const res = solveDijkstra({
      bundle,
      startIndex: 2 * 5 + 0,
      goalIndex: 2 * 5 + 4,
      profile: makeProfile(),
      qualityMode: 'prefer',
      weights: NOMINAL_POLICY_WEIGHTS.shortest,
      edgeEvaluator: makeEdgeEvaluator(),
    });

    expect(res.status).toBe('success');
    expect(res.totalCost).toBeCloseTo(40 + 20 * Math.SQRT2, 6);
    expect(res.cellIndices[0]).toBe(2 * 5 + 0);
    expect(res.cellIndices[res.cellIndices.length - 1]).toBe(2 * 5 + 4);
    expect(res.cellIndices).toHaveLength(7);
    expect(res.cellIndices.slice(2, 5)).toEqual([1, 2, 3]);
  });

  it('matches exact analytical costs on F08 3-corridor policy split', () => {
    const bundle = makeBundle(5, 5, 10, 10);
    const w = 5;

    // Middle corridor (r=2, c=1..3): slope = 15 deg (S = 0.75), roughness = 0.5
    for (let c = 1; c <= 3; c++) {
      bundle.terrainSlopeDeg[2 * w + c] = 15;
      bundle.roughnessNormalized[2 * w + c] = 0.5;
    }
    // North corridor (r=0..1, c=2): LOW quality (U = 1.0)
    bundle.qualityCode[0 * w + 2] = QUALITY_CODE.LOW;
    bundle.qualityCode[1 * w + 2] = QUALITY_CODE.LOW;
    // South corridor (r=3..4, c=2): slope = 5 deg (S = 0.25)
    bundle.terrainSlopeDeg[3 * w + 2] = 5;
    bundle.terrainSlopeDeg[4 * w + 2] = 5;

    const profile = makeProfile();
    const edgeEval = makeEdgeEvaluator();
    const startIndex = 2 * w + 0;
    const goalIndex = 2 * w + 4;

    const shortest = solveDijkstra({
      bundle,
      startIndex,
      goalIndex,
      profile,
      qualityMode: 'prefer',
      weights: NOMINAL_POLICY_WEIGHTS.shortest,
      edgeEvaluator: edgeEval,
    });
    expect(shortest.status).toBe('success');
    expect(shortest.totalCost).toBeCloseTo(40.0, 6);
    expect(shortest.cellIndices).toEqual([10, 11, 12, 13, 14]);

    const terrain = solveDijkstra({
      bundle,
      startIndex,
      goalIndex,
      profile,
      qualityMode: 'prefer',
      weights: NOMINAL_POLICY_WEIGHTS.terrain,
      edgeEvaluator: edgeEval,
    });
    expect(terrain.status).toBe('success');
    expect(terrain.totalCost).toBeCloseTo(20 + 20 * Math.SQRT2, 6);
    expect(terrain.cellIndices).toEqual([10, 6, 7, 8, 14]);

    const uncertainty = solveDijkstra({
      bundle,
      startIndex,
      goalIndex,
      profile,
      qualityMode: 'prefer',
      weights: NOMINAL_POLICY_WEIGHTS.uncertainty,
      edgeEvaluator: edgeEval,
    });
    expect(uncertainty.status).toBe('success');
    expect(uncertainty.totalCost).toBeCloseTo(30 + 20 * Math.SQRT2, 6);
    expect(uncertainty.cellIndices).toEqual([10, 16, 17, 18, 14]);
  });

  it('returns no_path when separated by an impassable barrier', () => {
    const bundle = makeBundle(7, 7, 10, 10);
    for (let r = 0; r < 7; r++) {
      bundle.terrainSlopeDeg[r * 7 + 3] = 26;
    }

    const res = solveDijkstra({
      bundle,
      startIndex: 3 * 7 + 1,
      goalIndex: 3 * 7 + 5,
      profile: makeProfile(),
      qualityMode: 'prefer',
      weights: NOMINAL_POLICY_WEIGHTS.shortest,
      edgeEvaluator: makeEdgeEvaluator(),
    });

    expect(res.status).toBe('no_path');
    expect(res.cellIndices).toEqual([]);
  });
});
