import { describe, expect, it } from 'vitest';
import {
  QUALITY_CODE,
  type ConstraintProfile,
  type RegionRoutingBundle,
} from '../../src/contracts/routing.js';
import { getCellExclusionReason, isCellAdmissible } from '../../src/routing/cellAdmissibility.js';

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

function makeBundle(overrides?: Partial<RegionRoutingBundle>): RegionRoutingBundle {
  const n = 4;
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
    elevationM: new Float32Array([-2540, -2540, -2540, -2540]),
    terrainSlopeDeg: new Float32Array([5, 5, 5, 5]),
    roughnessNormalized: new Float32Array([0.1, 0.1, 0.1, 0.1]),
    qualityCode: new Uint8Array([
      QUALITY_CODE.ACCEPTABLE,
      QUALITY_CODE.ACCEPTABLE,
      QUALITY_CODE.ACCEPTABLE,
      QUALITY_CODE.ACCEPTABLE,
    ]),
    derivativeSupportMask: new Uint8Array([1, 1, 1, 1]),
    explicitExclusionMask: new Uint8Array([0, 0, 0, 0]),
    ...overrides,
  };
}

describe('T09: Canonical 7-Priority Cell Exclusion Predicate', () => {
  it('enforces exact 7-priority exclusion order when multiple violations exist', () => {
    // 1: OUT_OF_BOUNDS
    const b1 = makeBundle();
    expect(getCellExclusionReason(b1, -1, 0, BASE_PROFILE, 'strict')).toBe('OUT_OF_BOUNDS');
    expect(getCellExclusionReason(b1, 0, 2, BASE_PROFILE, 'strict')).toBe('OUT_OF_BOUNDS');
    expect(getCellExclusionReason(b1, 0.5, 0, BASE_PROFILE, 'strict')).toBe('OUT_OF_BOUNDS');

    // 2: NO_DATA beats INVALID quality and hazard mask
    const b2 = makeBundle({
      elevationM: new Float32Array([-32768, Number.NaN, 0, 0]),
      qualityCode: new Uint8Array([QUALITY_CODE.INVALID, QUALITY_CODE.INVALID, 0, 0]),
      explicitExclusionMask: new Uint8Array([1, 1, 0, 0]),
    });
    expect(getCellExclusionReason(b2, 0, 0, BASE_PROFILE, 'strict')).toBe('NO_DATA');
    expect(getCellExclusionReason(b2, 0, 1, BASE_PROFILE, 'strict')).toBe('NO_DATA');

    // 3: INTERPOLATED_OR_UNRELIABLE beats EXPLICIT_HAZARD_MASK, UNSUPPORTED_DERIVATIVE, MAX_TERRAIN_SLOPE_EXCEEDED
    const b3 = makeBundle({
      elevationM: new Float32Array([1000, 0, 0, 0]),
      qualityCode: new Uint8Array([QUALITY_CODE.INVALID, 0, 0, 0]),
      explicitExclusionMask: new Uint8Array([1, 0, 0, 0]),
      derivativeSupportMask: new Uint8Array([0, 1, 1, 1]),
      terrainSlopeDeg: new Float32Array([25, 0, 0, 0]),
    });
    expect(getCellExclusionReason(b3, 0, 0, BASE_PROFILE, 'prefer')).toBe('INTERPOLATED_OR_UNRELIABLE');

    // 4: EXPLICIT_HAZARD_MASK beats UNSUPPORTED_DERIVATIVE
    const b4 = makeBundle({
      explicitExclusionMask: new Uint8Array([1, 0, 0, 0]),
      derivativeSupportMask: new Uint8Array([0, 1, 1, 1]),
    });
    expect(getCellExclusionReason(b4, 0, 0, BASE_PROFILE, 'prefer')).toBe('EXPLICIT_HAZARD_MASK');

    // 5: UNSUPPORTED_DERIVATIVE beats MAX_TERRAIN_SLOPE_EXCEEDED
    const b5 = makeBundle({
      derivativeSupportMask: new Uint8Array([0, 1, 1, 1]),
      terrainSlopeDeg: new Float32Array([30, Number.NaN, 5, 5]),
      roughnessNormalized: new Float32Array([0.1, 0.1, Number.NaN, 0.1]),
    });
    expect(getCellExclusionReason(b5, 0, 0, BASE_PROFILE, 'prefer')).toBe('UNSUPPORTED_DERIVATIVE');
    expect(getCellExclusionReason(b5, 0, 1, BASE_PROFILE, 'prefer')).toBe('UNSUPPORTED_DERIVATIVE');
    expect(getCellExclusionReason(b5, 1, 0, BASE_PROFILE, 'prefer')).toBe('UNSUPPORTED_DERIVATIVE');

    // 6: MAX_TERRAIN_SLOPE_EXCEEDED beats STRICT_QUALITY_EXCLUDED
    const b6 = makeBundle({
      terrainSlopeDeg: new Float32Array([20.001, 5, 5, 5]),
      qualityCode: new Uint8Array([QUALITY_CODE.LOW, 0, 0, 0]),
    });
    expect(getCellExclusionReason(b6, 0, 0, BASE_PROFILE, 'strict')).toBe('MAX_TERRAIN_SLOPE_EXCEEDED');
  });

  it('allows LOW and UNKNOWN quality in prefer mode, excludes them in strict mode', () => {
    const bundle = makeBundle({
      qualityCode: new Uint8Array([
        QUALITY_CODE.ACCEPTABLE,
        QUALITY_CODE.UNKNOWN,
        QUALITY_CODE.LOW,
        QUALITY_CODE.ACCEPTABLE,
      ]),
    });

    expect(getCellExclusionReason(bundle, 0, 1, BASE_PROFILE, 'prefer')).toBeNull();
    expect(getCellExclusionReason(bundle, 1, 0, BASE_PROFILE, 'prefer')).toBeNull();
    expect(isCellAdmissible(bundle, 0, 1, BASE_PROFILE, 'prefer')).toBe(true);
    expect(isCellAdmissible(bundle, 1, 0, BASE_PROFILE, 'prefer')).toBe(true);

    expect(getCellExclusionReason(bundle, 0, 1, BASE_PROFILE, 'strict')).toBe('STRICT_QUALITY_EXCLUDED');
    expect(getCellExclusionReason(bundle, 1, 0, BASE_PROFILE, 'strict')).toBe('STRICT_QUALITY_EXCLUDED');
    expect(isCellAdmissible(bundle, 0, 1, BASE_PROFILE, 'strict')).toBe(false);
  });

  it('admits negative Martian elevation (-2540.0 m) with slope <= maxTerrainSlopeDeg', () => {
    const bundle = makeBundle({
      elevationM: new Float32Array([-2540.0, -2540.0, -2540.0, -2540.0]),
      terrainSlopeDeg: new Float32Array([19.999, 20.0, 5, 5]),
    });

    expect(getCellExclusionReason(bundle, 0, 0, BASE_PROFILE, 'strict')).toBeNull();
    expect(isCellAdmissible(bundle, 0, 0, BASE_PROFILE, 'strict')).toBe(true);
    expect(getCellExclusionReason(bundle, 0, 1, BASE_PROFILE, 'strict')).toBeNull();
  });
});
