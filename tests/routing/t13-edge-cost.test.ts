import { describe, expect, it } from 'vitest';
import {
  QUALITY_CODE,
  type ConstraintProfile,
  type RegionRoutingBundle,
} from '../../src/contracts/routing.js';
import { NOMINAL_POLICY_WEIGHTS } from '../../src/routing/types.js';
import { computeEdgeCost, computeEdgePenalties } from '../../src/routing/edgeCost.js';

const BASE_PROFILE: ConstraintProfile = {
  profileId: 'educational-eva-v1',
  version: '1.0.0',
  maxTerrainSlopeDeg: 20,
  maxRouteGradeDeg: 20,
  roughnessScaleM: 0.5,
  nominalWalkingSpeedMps: 1.0,
  gradePenaltyKappa: 2.0,
  isSimulatedAssumption: true,
};

function makeF06Bundle(): RegionRoutingBundle {
  // 3x5 grid, 10 m spacing, flat terrain, only (1, 2) has LOW quality (U=1.0)
  const w = 5;
  const h = 3;
  const n = w * h;
  const qualityCode = new Uint8Array(n).fill(QUALITY_CODE.ACCEPTABLE);
  qualityCode[1 * w + 2] = QUALITY_CODE.LOW;

  return {
    regionId: 'f06-test',
    datasetVersion: '1',
    gridWidth: w,
    gridHeight: h,
    cellSpacingEastM: 10,
    cellSpacingNorthM: 10,
    noDataSentinel: -32768,
    roughnessScaleM: 0.5,
    qualityMappingVersion: '1',
    elevationM: new Float32Array(n).fill(-2540),
    terrainSlopeDeg: new Float32Array(n).fill(0),
    roughnessNormalized: new Float32Array(n).fill(0),
    qualityCode,
  };
}

describe('T13: Corner-Aware Conservative Edge Cost Evaluator', () => {
  it('F06: penalizes diagonal (1,1) -> (0,2) [dir=1 NE] via corner (1,2) LOW quality, while (1,0) -> (0,1) stays 10*sqrt(2)', () => {
    const bundle = makeF06Bundle();
    const weights = NOMINAL_POLICY_WEIGHTS.uncertainty; // alpha=2, beta=1, gamma=2

    // Diagonal (1,1) -> (0,2) has corners (0,1) and (1,2) -> U_diag = 1.0
    const penCornerLow = computeEdgePenalties(bundle, 1, 1, 1, BASE_PROFILE);
    expect(penCornerLow.d).toBeCloseTo(10 * Math.SQRT2, 10);
    expect(penCornerLow.S).toBe(0);
    expect(penCornerLow.R).toBe(0);
    expect(penCornerLow.U).toBe(1.0);

    const costCornerLow = computeEdgeCost(bundle, 1, 1, 1, BASE_PROFILE, weights);
    expect(costCornerLow).toBeCloseTo(30 * Math.SQRT2, 6);

    // Corner-clear diagonal (1,0) -> (0,1) has corners (0,0) and (1,1) -> U_diag = 0.0
    const penClear = computeEdgePenalties(bundle, 1, 0, 1, BASE_PROFILE);
    expect(penClear.U).toBe(0);

    const costClear = computeEdgeCost(bundle, 1, 0, 1, BASE_PROFILE, weights);
    expect(costClear).toBeCloseTo(10 * Math.SQRT2, 6);
  });

  it('computes max slope ratio S, clamped roughness R, and cardinal U correctly', () => {
    const bundle = makeF06Bundle();
    bundle.terrainSlopeDeg[0] = 5;
    bundle.terrainSlopeDeg[1] = 10; // S = 10 / 20 = 0.5
    bundle.roughnessNormalized[0] = 0.2;
    bundle.roughnessNormalized[1] = 1.4; // clamped to 1.0
    bundle.qualityCode[1] = QUALITY_CODE.UNKNOWN; // U = 0.75

    // Cardinal East from (0,0) -> (0,1) [dir=2]
    const pen = computeEdgePenalties(bundle, 0, 0, 2, BASE_PROFILE);
    expect(pen.d).toBe(10);
    expect(pen.S).toBeCloseTo(0.5, 10);
    expect(pen.R).toBe(1);
    expect(pen.U).toBe(0.75);

    // terrain: alpha=2, beta=1, gamma=0 -> 10 * (1 + 2*0.5 + 1*1 + 0*0.75) = 30
    expect(computeEdgeCost(bundle, 0, 0, 2, BASE_PROFILE, NOMINAL_POLICY_WEIGHTS.terrain)).toBeCloseTo(30, 10);
    // uncertainty: alpha=2, beta=1, gamma=2 -> 10 * (1 + 2*0.5 + 1*1 + 2*0.75) = 45
    expect(computeEdgeCost(bundle, 0, 0, 2, BASE_PROFILE, NOMINAL_POLICY_WEIGHTS.uncertainty)).toBeCloseTo(45, 10);
  });
});
