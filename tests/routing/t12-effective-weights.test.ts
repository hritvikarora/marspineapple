import { describe, expect, it } from 'vitest';
import {
  QUALITY_CODE,
  type ConstraintProfile,
  type RegionRoutingBundle,
} from '../../src/contracts/routing.js';
import type { CellAdmissibilityPort } from '../../src/routing/types.js';
import { resolveEffectivePolicyWeights } from '../../src/routing/effectiveWeights.js';

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

function makeBundle(qualityCode: Uint8Array): RegionRoutingBundle {
  const n = qualityCode.length;
  return {
    regionId: 'jezero-test',
    datasetVersion: '1',
    gridWidth: 2,
    gridHeight: 2,
    cellSpacingEastM: 5,
    cellSpacingNorthM: 5,
    noDataSentinel: -32768,
    roughnessScaleM: 0.5,
    qualityMappingVersion: '1',
    elevationM: new Float32Array(n).fill(-2540),
    terrainSlopeDeg: new Float32Array(n).fill(5),
    roughnessNormalized: new Float32Array(n).fill(0.1),
    qualityCode,
  };
}

const stubCellAdmissibility: CellAdmissibilityPort = {
  getCellExclusionReason(bundle, row, col, _profile, qualityMode) {
    const k = row * bundle.gridWidth + col;
    const q = bundle.qualityCode[k];
    if (q === QUALITY_CODE.INVALID) return 'INTERPOLATED_OR_UNRELIABLE';
    if (qualityMode === 'strict' && q !== QUALITY_CODE.ACCEPTABLE) return 'STRICT_QUALITY_EXCLUDED';
    return null;
  },
};

describe('T12: Uniform-Quality Detector & Effective Policy Weight Resolver', () => {
  it('overrides uncertainty gamma to 0 when all admissible cells are UNKNOWN (U = 0.75)', () => {
    const bundle = makeBundle(
      new Uint8Array([
        QUALITY_CODE.UNKNOWN,
        QUALITY_CODE.UNKNOWN,
        QUALITY_CODE.UNKNOWN,
        QUALITY_CODE.INVALID, // excluded, should not break uniformity
      ])
    );

    const res = resolveEffectivePolicyWeights(bundle, BASE_PROFILE, 'prefer', stubCellAdmissibility);
    expect(res.isQualityUniform).toBe(true);
    expect(res.uniformQualityClass).toBe('unknown');
    expect(res.effectiveWeights.uncertainty.uniformQualityOverride).toBe(true);
    expect(res.effectiveWeights.uncertainty.nominal).toEqual({ alpha: 2, beta: 1, gamma: 2 });
    expect(res.effectiveWeights.uncertainty.effective).toEqual({ alpha: 2, beta: 1, gamma: 0 });
    expect(res.effectiveWeights.uncertainty.minAdmissibleU).toBe(0.75);
    expect(res.effectiveWeights.uncertainty.maxAdmissibleU).toBe(0.75);
    expect(res.effectiveWeights.shortest.uniformQualityOverride).toBe(false);
    expect(res.effectiveWeights.terrain.uniformQualityOverride).toBe(false);
  });

  it('keeps unshifted min/max U and gamma = 2 when admissible cells mix UNKNOWN (0.75) and LOW (1.0)', () => {
    const bundle = makeBundle(
      new Uint8Array([
        QUALITY_CODE.UNKNOWN,
        QUALITY_CODE.LOW,
        QUALITY_CODE.UNKNOWN,
        QUALITY_CODE.LOW,
      ])
    );

    const res = resolveEffectivePolicyWeights(bundle, BASE_PROFILE, 'prefer', stubCellAdmissibility);
    expect(res.isQualityUniform).toBe(false);
    expect(res.uniformQualityClass).toBeNull();
    expect(res.effectiveWeights.uncertainty.uniformQualityOverride).toBe(false);
    expect(res.effectiveWeights.uncertainty.effective).toEqual({ alpha: 2, beta: 1, gamma: 2 });
    expect(res.effectiveWeights.uncertainty.minAdmissibleU).toBe(0.75);
    expect(res.effectiveWeights.uncertainty.maxAdmissibleU).toBe(1.0);
  });

  it('handles zero admissible cells cleanly (e.g., strict mode on all-LOW grid)', () => {
    const bundle = makeBundle(new Uint8Array(4).fill(QUALITY_CODE.LOW));
    const res = resolveEffectivePolicyWeights(bundle, BASE_PROFILE, 'strict', stubCellAdmissibility);
    expect(res.isQualityUniform).toBe(true);
    expect(res.uniformQualityClass).toBeNull();
    expect(res.effectiveWeights.uncertainty.uniformQualityOverride).toBe(true);
    expect(res.effectiveWeights.uncertainty.effective.gamma).toBe(0);
    expect(res.effectiveWeights.uncertainty.minAdmissibleU).toBe(0);
    expect(res.effectiveWeights.uncertainty.maxAdmissibleU).toBe(0);
  });
});
