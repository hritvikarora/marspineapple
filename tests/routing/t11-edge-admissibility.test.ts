import { describe, expect, it } from 'vitest';
import {
  QUALITY_CODE,
  type ConstraintProfile,
  type RegionRoutingBundle,
} from '../../src/contracts/routing.js';
import type { CellAdmissibilityPort } from '../../src/routing/types.js';
import { isEdgeAdmissible } from '../../src/routing/edgeAdmissibility.js';

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

function makeBundle(
  width: number,
  height: number,
  spacingM = 5,
  overrides?: Partial<RegionRoutingBundle>
): RegionRoutingBundle {
  const n = width * height;
  return {
    regionId: 'jezero-test',
    datasetVersion: '1',
    gridWidth: width,
    gridHeight: height,
    cellSpacingEastM: spacingM,
    cellSpacingNorthM: spacingM,
    noDataSentinel: -32768,
    roughnessScaleM: 0.5,
    qualityMappingVersion: '1',
    elevationM: new Float32Array(n).fill(-2540),
    terrainSlopeDeg: new Float32Array(n).fill(5),
    roughnessNormalized: new Float32Array(n).fill(0.1),
    qualityCode: new Uint8Array(n).fill(QUALITY_CODE.ACCEPTABLE),
    ...overrides,
  };
}

const stubCellAdmissibility: CellAdmissibilityPort = {
  getCellExclusionReason(bundle, row, col, profile, qualityMode) {
    if (row < 0 || row >= bundle.gridHeight || col < 0 || col >= bundle.gridWidth) {
      return 'OUT_OF_BOUNDS';
    }
    const k = row * bundle.gridWidth + col;
    if (!Number.isFinite(bundle.elevationM[k]) || bundle.elevationM[k] === bundle.noDataSentinel) {
      return 'NO_DATA';
    }
    const q = bundle.qualityCode[k];
    if (q === QUALITY_CODE.INVALID) {
      return 'INTERPOLATED_OR_UNRELIABLE';
    }
    if (bundle.terrainSlopeDeg[k] > profile.maxTerrainSlopeDeg) {
      return 'MAX_TERRAIN_SLOPE_EXCEEDED';
    }
    if (qualityMode === 'strict' && q !== QUALITY_CODE.ACCEPTABLE) {
      return 'STRICT_QUALITY_EXCLUDED';
    }
    return null;
  },
};

describe('T11: 8-Neighbor Edge Admissibility, No-Corner-Cutting & Grade Guard', () => {
  it('rejects diagonal move (1,1) -> (0,2) [dir=1 NE] if either orthogonal corner (0,1) or (1,2) is excluded', () => {
    // Both corners admissible -> allowed
    const clean = makeBundle(3, 3);
    expect(isEdgeAdmissible(clean, 1, 1, 1, BASE_PROFILE, 'prefer', stubCellAdmissibility)).toBe(true);

    // Block w1 = (1, 2) via slope > 20
    const slope1 = new Float32Array(9).fill(5);
    slope1[1 * 3 + 2] = 25;
    expect(
      isEdgeAdmissible(
        makeBundle(3, 3, 5, { terrainSlopeDeg: slope1 }),
        1,
        1,
        1,
        BASE_PROFILE,
        'prefer',
        stubCellAdmissibility
      )
    ).toBe(false);

    // Block w2 = (0, 1) via INVALID quality
    const q2 = new Uint8Array(9).fill(QUALITY_CODE.ACCEPTABLE);
    q2[0 * 3 + 1] = QUALITY_CODE.INVALID;
    expect(
      isEdgeAdmissible(
        makeBundle(3, 3, 5, { qualityCode: q2 }),
        1,
        1,
        1,
        BASE_PROFILE,
        'prefer',
        stubCellAdmissibility
      )
    ).toBe(false);

    // Block w2 = (0, 1) via STRICT_QUALITY_EXCLUDED in strict mode (but allowed in prefer mode)
    const q3 = new Uint8Array(9).fill(QUALITY_CODE.ACCEPTABLE);
    q3[0 * 3 + 1] = QUALITY_CODE.LOW;
    const strictBundle = makeBundle(3, 3, 5, { qualityCode: q3 });
    expect(isEdgeAdmissible(strictBundle, 1, 1, 1, BASE_PROFILE, 'prefer', stubCellAdmissibility)).toBe(true);
    expect(isEdgeAdmissible(strictBundle, 1, 1, 1, BASE_PROFILE, 'strict', stubCellAdmissibility)).toBe(false);
  });

  it('enforces along-edge grade limit on 10 m step (~3.639702 m at 20 deg) and asymmetric uphill/downhill limits', () => {
    const elevOk = new Float32Array([0, 3.639702, 0, 0]);
    const bOk = makeBundle(2, 2, 10, { elevationM: elevOk });
    expect(isEdgeAdmissible(bOk, 0, 0, 2, BASE_PROFILE, 'prefer', stubCellAdmissibility)).toBe(true); // E: (0,0)->(0,1)

    const elevTooSteep = new Float32Array([0, 3.65, 0, 0]);
    const bSteep = makeBundle(2, 2, 10, { elevationM: elevTooSteep });
    expect(isEdgeAdmissible(bSteep, 0, 0, 2, BASE_PROFILE, 'prefer', stubCellAdmissibility)).toBe(false);

    // Asymmetric uphill vs downhill limits
    const asymProfile: ConstraintProfile = {
      ...BASE_PROFILE,
      maxUphillGradeDeg: 10,
      maxDownhillGradeDeg: 25,
    };
    const dz15 = 10 * Math.tan((15 * Math.PI) / 180);
    const bAsym = makeBundle(2, 2, 10, { elevationM: new Float32Array([0, dz15, 0, 0]) });
    expect(isEdgeAdmissible(bAsym, 0, 0, 2, asymProfile, 'prefer', stubCellAdmissibility)).toBe(false); // 15 deg uphill > 10
    expect(isEdgeAdmissible(bAsym, 0, 1, 6, asymProfile, 'prefer', stubCellAdmissibility)).toBe(true); // 15 deg downhill <= 25
  });
});
