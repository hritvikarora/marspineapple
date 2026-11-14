import { describe, expect, it } from 'vitest';
import {
  QUALITY_CODE,
  type ConstraintProfile,
  type ExclusionReasonCode,
  type QualityMode,
  type RegionRoutingBundle,
} from '../../src/contracts/routing.js';
import {
  areCellsInSameComponent,
  computeConnectedComponentsAndAdjMask,
} from '../../src/routing/components.js';
import {
  DIR_DC,
  DIR_DR,
  DIR_IS_DIAG,
  type CellAdmissibilityPort,
  type EdgeEvaluatorPort,
} from '../../src/routing/types.js';

function makeFlatProfile(): ConstraintProfile {
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
      if (bundle.derivativeSupportMask && bundle.derivativeSupportMask[idx] === 0) {
        return 'UNSUPPORTED_DERIVATIVE';
      }
      if (bundle.explicitExclusionMask && bundle.explicitExclusionMask[idx] !== 0) {
        return 'EXPLICIT_HAZARD_MASK';
      }
      const slope = bundle.terrainSlopeDeg[idx];
      if (!Number.isFinite(slope)) return 'UNSUPPORTED_DERIVATIVE';
      if (slope > profile.maxTerrainSlopeDeg) return 'MAX_TERRAIN_SLOPE_EXCEEDED';
      if (qualityMode === 'strict' && bundle.qualityCode[idx] !== QUALITY_CODE.ACCEPTABLE) {
        return 'STRICT_QUALITY_EXCLUDED';
      }
      return null;
    },
  };
}

function makeLocalEdgeEvaluator(
  cellAdmissibility: CellAdmissibilityPort
): Pick<EdgeEvaluatorPort, 'isEdgeAdmissible'> {
  return {
    isEdgeAdmissible(bundle, uIndex, vIndex, dir, profile, qualityMode): boolean {
      const w = bundle.gridWidth;
      const uRow = (uIndex / w) | 0;
      const uCol = uIndex - uRow * w;
      const vRow = (vIndex / w) | 0;
      const vCol = vIndex - vRow * w;
      if (
        cellAdmissibility.getCellExclusionReason(bundle, uRow, uCol, profile, qualityMode) !== null ||
        cellAdmissibility.getCellExclusionReason(bundle, vRow, vCol, profile, qualityMode) !== null
      ) {
        return false;
      }
      if (DIR_IS_DIAG[dir]) {
        const dr = DIR_DR[dir];
        const dc = DIR_DC[dir];
        if (
          cellAdmissibility.getCellExclusionReason(bundle, uRow + dr, uCol, profile, qualityMode) !== null ||
          cellAdmissibility.getCellExclusionReason(bundle, uRow, uCol + dc, profile, qualityMode) !== null
        ) {
          return false;
        }
      }
      const dx = (vCol - uCol) * bundle.cellSpacingEastM;
      const dy = -(vRow - uRow) * bundle.cellSpacingNorthM;
      const dist = Math.hypot(dx, dy);
      const dz = Math.abs(bundle.elevationM[vIndex] - bundle.elevationM[uIndex]);
      const gradeDeg = Math.atan2(dz, dist) * (180 / Math.PI);
      return gradeDeg <= profile.maxRouteGradeDeg;
    },
  };
}

describe('T16 Lazy Connected-Component Labeler & 8-Bit Adjacency Mask Builder', () => {
  it('detects F04 separated Western vs Eastern basin despite degree-8 goal cell', () => {
    const width = 7;
    const height = 7;
    const n = width * height;
    const elevationM = new Float32Array(n).fill(-2540.0);
    const terrainSlopeDeg = new Float32Array(n).fill(0);
    const roughnessNormalized = new Float32Array(n).fill(0);
    const qualityCode = new Uint8Array(n).fill(QUALITY_CODE.ACCEPTABLE);

    // Column c = 3 is an impassable 26 deg ridge
    for (let r = 0; r < height; r++) {
      terrainSlopeDeg[r * width + 3] = 26;
    }

    const bundle: RegionRoutingBundle = {
      regionId: 'f04',
      datasetVersion: '1',
      gridWidth: width,
      gridHeight: height,
      cellSpacingEastM: 10,
      cellSpacingNorthM: 10,
      noDataSentinel: -32768,
      roughnessScaleM: 0.5,
      qualityMappingVersion: '1',
      elevationM,
      terrainSlopeDeg,
      roughnessNormalized,
      qualityCode,
    };

    const profile = makeFlatProfile();
    const cellAdm = makeLocalCellAdmissibility();
    const edgeEval = makeLocalEdgeEvaluator(cellAdm);

    const componentIdOut = new Int32Array(n);
    const adjMaskOut = new Uint8Array(n);
    const bfsQueue = new Int32Array(n);

    const { componentCount } = computeConnectedComponentsAndAdjMask(
      bundle,
      profile,
      'prefer',
      edgeEval,
      cellAdm,
      componentIdOut,
      adjMaskOut,
      bfsQueue
    );

    const startIdx = 3 * width + 1;
    const goalIdx = 3 * width + 5;
    const ridgeIdx = 3 * width + 3;

    expect(componentCount).toBe(2);
    expect(adjMaskOut[goalIdx]).toBe(0b11111111); // degree 8 at goal
    expect(componentIdOut[startIdx]).toBe(0);
    expect(componentIdOut[goalIdx]).toBe(1);
    expect(componentIdOut[ridgeIdx]).toBe(-1);
    expect(adjMaskOut[ridgeIdx]).toBe(0);

    expect(areCellsInSameComponent(componentIdOut, startIdx, goalIdx)).toBe(false);
    expect(areCellsInSameComponent(componentIdOut, startIdx, 0 * width + 0)).toBe(true);
    expect(areCellsInSameComponent(componentIdOut, goalIdx, 4 * width + 6)).toBe(true);
    expect(areCellsInSameComponent(componentIdOut, ridgeIdx, ridgeIdx)).toBe(false);
  });

  it('respects diagonal no-corner-cutting in F03B double checkerboard pinch', () => {
    const width = 3;
    const height = 3;
    const n = width * height;
    const elevationM = new Float32Array(n).fill(-2540.0);
    elevationM[0 * width + 1] = -32768; // (0,1) blocked
    elevationM[1 * width + 2] = -32768; // (1,2) blocked

    const bundle: RegionRoutingBundle = {
      regionId: 'f03b',
      datasetVersion: '1',
      gridWidth: width,
      gridHeight: height,
      cellSpacingEastM: 5,
      cellSpacingNorthM: 5,
      noDataSentinel: -32768,
      roughnessScaleM: 0.5,
      qualityMappingVersion: '1',
      elevationM,
      terrainSlopeDeg: new Float32Array(n).fill(0),
      roughnessNormalized: new Float32Array(n).fill(0),
      qualityCode: new Uint8Array(n).fill(QUALITY_CODE.ACCEPTABLE),
    };

    const profile = makeFlatProfile();
    const cellAdm = makeLocalCellAdmissibility();
    const edgeEval = makeLocalEdgeEvaluator(cellAdm);

    const componentIdOut = new Int32Array(n);
    const adjMaskOut = new Uint8Array(n);
    const bfsQueue = new Int32Array(n);

    const { componentCount } = computeConnectedComponentsAndAdjMask(
      bundle,
      profile,
      'prefer',
      edgeEval,
      cellAdm,
      componentIdOut,
      adjMaskOut,
      bfsQueue
    );

    const startIdx = 1 * width + 1;
    const isolatedGoalIdx = 0 * width + 2;

    expect(componentCount).toBe(2);
    expect(adjMaskOut[isolatedGoalIdx]).toBe(0);
    expect(areCellsInSameComponent(componentIdOut, startIdx, isolatedGoalIdx)).toBe(false);
    expect(areCellsInSameComponent(componentIdOut, -1, startIdx)).toBe(false);
  });
});
