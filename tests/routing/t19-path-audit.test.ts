import { describe, expect, it } from 'vitest';
import {
  QUALITY_CODE,
  type ConstraintProfile,
  type EffectivePolicyWeights,
  type ExclusionReasonCode,
  type QualityCode,
  type QualityMode,
  type RegionRoutingBundle,
} from '../../src/contracts/routing.js';
import {
  assertAStarMatchesDijkstra,
  verifyPathAdmissibility,
} from '../../src/routing/pathAudit.js';
import {
  DIR_DC,
  DIR_DR,
  DIR_IS_DIAG,
  NOMINAL_POLICY_WEIGHTS,
  QUALITY_PENALTY_BY_CODE,
  type CellAdmissibilityPort,
  type EdgeEvaluatorPort,
  type SinglePolicySolveResult,
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

function makeBundle(width: number, height: number, dx = 10, dy = 10): RegionRoutingBundle {
  const n = width * height;
  return {
    regionId: 'audit-test',
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

function makeLocalCellAdmissibility(): CellAdmissibilityPort {
  return {
    getCellExclusionReason(
      bundle: RegionRoutingBundle,
      row: number,
      col: number,
      profile: ConstraintProfile,
      qualityMode: QualityMode
    ): ExclusionReasonCode | null {
      if (row < 0 || row >= bundle.gridHeight || col < 0 || col >= bundle.gridWidth) {
        return 'OUT_OF_BOUNDS';
      }
      const idx = row * bundle.gridWidth + col;
      const z = bundle.elevationM[idx];
      if (!Number.isFinite(z) || Math.abs(z - bundle.noDataSentinel) <= 1e-5) {
        return 'NO_DATA';
      }
      if (bundle.qualityCode[idx] === QUALITY_CODE.INVALID) {
        return 'INTERPOLATED_OR_UNRELIABLE';
      }
      if (bundle.terrainSlopeDeg[idx] > profile.maxTerrainSlopeDeg) {
        return 'MAX_TERRAIN_SLOPE_EXCEEDED';
      }
      if (qualityMode === 'strict' && bundle.qualityCode[idx] !== QUALITY_CODE.ACCEPTABLE) {
        return 'STRICT_QUALITY_EXCLUDED';
      }
      return null;
    },
  };
}

function makeLocalEdgeEvaluator(cellAdm: CellAdmissibilityPort): EdgeEvaluatorPort {
  return {
    isEdgeAdmissible(bundle, uIndex, vIndex, dir, profile, qualityMode): boolean {
      const w = bundle.gridWidth;
      const uRow = (uIndex / w) | 0;
      const uCol = uIndex - uRow * w;
      const vRow = (vIndex / w) | 0;
      const vCol = vIndex - vRow * w;
      if (
        cellAdm.getCellExclusionReason(bundle, uRow, uCol, profile, qualityMode) !== null ||
        cellAdm.getCellExclusionReason(bundle, vRow, vCol, profile, qualityMode) !== null
      ) {
        return false;
      }
      if (DIR_IS_DIAG[dir]) {
        const dr = DIR_DR[dir];
        const dc = DIR_DC[dir];
        if (
          cellAdm.getCellExclusionReason(bundle, uRow + dr, uCol, profile, qualityMode) !== null ||
          cellAdm.getCellExclusionReason(bundle, uRow, uCol + dc, profile, qualityMode) !== null
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

      const s = Math.max(
        0,
        Math.min(
          1,
          Math.max(
            bundle.terrainSlopeDeg[uIndex] / profile.maxTerrainSlopeDeg,
            bundle.terrainSlopeDeg[vIndex] / profile.maxTerrainSlopeDeg
          )
        )
      );
      const r = Math.max(
        0,
        Math.min(1, Math.max(bundle.roughnessNormalized[uIndex], bundle.roughnessNormalized[vIndex]))
      );
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

describe('T19 Independent Post-Solve Path Admissibility & Cost Auditor', () => {
  it('detects an illegal diagonal step cutting across a blocked corner', () => {
    const bundle = makeBundle(5, 5, 10, 10);
    // Block corner cell (3, 2)
    bundle.terrainSlopeDeg[3 * 5 + 2] = 26;

    const profile = makeProfile();
    const cellAdm = makeLocalCellAdmissibility();
    const edgeEval = makeLocalEdgeEvaluator(cellAdm);

    // Illegal diagonal (3,1) -> (4,2) past blocked (3,2)
    const illegalPath = [2 * 5 + 0, 3 * 5 + 1, 4 * 5 + 2, 3 * 5 + 3, 2 * 5 + 4];
    const res = verifyPathAdmissibility({
      bundle,
      cellIndices: illegalPath,
      expectedStartIndex: 2 * 5 + 0,
      expectedGoalIndex: 2 * 5 + 4,
      profile,
      qualityMode: 'prefer',
      weights: NOMINAL_POLICY_WEIGHTS.shortest,
      cellAdmissibility: cellAdm,
      edgeEvaluator: edgeEval,
    });

    expect(res.valid).toBe(false);
    expect(res.failureReason).toMatch(/inadmissible/i);
  });

  it('detects a 0-edge same-cell path on an INVALID quality cell', () => {
    const bundle = makeBundle(5, 5, 5, 5);
    const cellIdx = 2 * 5 + 2;
    bundle.qualityCode[cellIdx] = QUALITY_CODE.INVALID;

    const profile = makeProfile();
    const cellAdm = makeLocalCellAdmissibility();
    const edgeEval = makeLocalEdgeEvaluator(cellAdm);

    const res = verifyPathAdmissibility({
      bundle,
      cellIndices: [cellIdx],
      expectedStartIndex: cellIdx,
      expectedGoalIndex: cellIdx,
      profile,
      qualityMode: 'prefer',
      weights: NOMINAL_POLICY_WEIGHTS.shortest,
      cellAdmissibility: cellAdm,
      edgeEvaluator: edgeEval,
    });

    expect(res.valid).toBe(false);
    expect(res.failureReason).toMatch(/INTERPOLATED_OR_UNRELIABLE/);
  });

  it('passes valid cardinal and diagonal paths and verifies cost equality within 1e-7', () => {
    const bundle = makeBundle(5, 5, 10, 10);
    bundle.terrainSlopeDeg[3 * 5 + 2] = 5; // S = 0.25
    bundle.terrainSlopeDeg[4 * 5 + 2] = 5;

    const profile = makeProfile();
    const cellAdm = makeLocalCellAdmissibility();
    const edgeEval = makeLocalEdgeEvaluator(cellAdm);

    // South corridor: (2,0) -> (3,1) [diag] -> (3,2) [card] -> (3,3) [card] -> (2,4) [diag]
    const path = [2 * 5 + 0, 3 * 5 + 1, 3 * 5 + 2, 3 * 5 + 3, 2 * 5 + 4];
    const expectedCost = 30 + 20 * Math.SQRT2;

    const audit = verifyPathAdmissibility({
      bundle,
      cellIndices: path,
      expectedStartIndex: 2 * 5 + 0,
      expectedGoalIndex: 2 * 5 + 4,
      profile,
      qualityMode: 'prefer',
      weights: NOMINAL_POLICY_WEIGHTS.uncertainty,
      cellAdmissibility: cellAdm,
      edgeEvaluator: edgeEval,
    });

    expect(audit.valid).toBe(true);
    expect(Math.abs(audit.recomputedCost - expectedCost)).toBeLessThan(1e-7);

    const aStarRes: SinglePolicySolveResult = {
      status: 'success',
      cellIndices: path,
      totalCost: expectedCost,
      exploredNodes: 7,
    };
    const dijkstraRes: SinglePolicySolveResult = {
      status: 'success',
      cellIndices: path,
      totalCost: expectedCost,
      exploredNodes: 20,
    };

    expect(() => assertAStarMatchesDijkstra(aStarRes, dijkstraRes, audit)).not.toThrow();

    // Verify assertions throw on violations
    expect(() =>
      assertAStarMatchesDijkstra(
        { ...aStarRes, totalCost: expectedCost + 1e-4 },
        dijkstraRes,
        audit
      )
    ).toThrow();
    expect(() =>
      assertAStarMatchesDijkstra(
        { ...aStarRes, exploredNodes: 25 },
        dijkstraRes,
        audit
      )
    ).toThrow();
    expect(() =>
      assertAStarMatchesDijkstra(
        aStarRes,
        { ...dijkstraRes, status: 'no_path' },
        audit
      )
    ).toThrow();
  });

  it('rejects non-8-neighbor jumps and endpoint mismatches', () => {
    const bundle = makeBundle(5, 5, 10, 10);
    const profile = makeProfile();
    const cellAdm = makeLocalCellAdmissibility();
    const edgeEval = makeLocalEdgeEvaluator(cellAdm);

    const jumpRes = verifyPathAdmissibility({
      bundle,
      cellIndices: [0, 2],
      expectedStartIndex: 0,
      expectedGoalIndex: 2,
      profile,
      qualityMode: 'prefer',
      weights: NOMINAL_POLICY_WEIGHTS.shortest,
      cellAdmissibility: cellAdm,
      edgeEvaluator: edgeEval,
    });
    expect(jumpRes.valid).toBe(false);
    expect(jumpRes.failureReason).toMatch(/8-neighbor/);

    const emptyRes = verifyPathAdmissibility({
      bundle,
      cellIndices: [],
      expectedStartIndex: 0,
      expectedGoalIndex: 0,
      profile,
      qualityMode: 'prefer',
      weights: NOMINAL_POLICY_WEIGHTS.shortest,
      cellAdmissibility: cellAdm,
      edgeEvaluator: edgeEval,
    });
    expect(emptyRes.valid).toBe(false);
  });
});
