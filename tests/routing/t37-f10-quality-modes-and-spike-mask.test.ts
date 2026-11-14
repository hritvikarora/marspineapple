import { describe, expect, it } from 'vitest';
import { QUALITY_CODE } from '../../src/contracts/routing.js';
import { QUALITY_PENALTY_BY_CODE } from '../../src/routing/types.js';
import {
  F10_DEFAULT_PROFILE,
  createFixtureF10FomSplitBundle,
  createFixtureF10InterpolatedSpikeBundle,
  createFixtureF10LowBarrierBundle,
  getReferenceCellExclusionReason,
  solveReferenceRoute,
} from '../fixtures/f10.js';

describe('T37: Fixture F10 Quality Modes, FOM Split & +1000m Spike Support Mask', () => {
  it('Subtest A: prefer mode succeeds across LOW column; strict mode returns STRICT_QUALITY_BLOCKED', () => {
    const bundle = createFixtureF10LowBarrierBundle();
    const startPt = { eastM: 5, northM: 15 }; // (1, 0) -> k=5
    const goalPt = { eastM: 45, northM: 15 }; // (1, 4) -> k=9

    const preferRes = solveReferenceRoute(bundle, startPt, goalPt, 'shortest', 'prefer');
    expect(preferRes.status).toBe('success');
    if (preferRes.status === 'success') {
      expect(preferRes.cellIndices).toEqual([5, 6, 7, 8, 9]);
      expect(preferRes.totalCost).toBeCloseTo(40.0, 8);
    }

    const strictRes = solveReferenceRoute(bundle, startPt, goalPt, 'shortest', 'strict');
    expect(strictRes).toEqual({
      status: 'no_path',
      reasonCode: 'STRICT_QUALITY_BLOCKED',
    });
  });

  it('Subtest B: INTERPOLATED is hard-excluded in prefer mode while MANUALLY_EDITED remains admissible', () => {
    const bundle = createFixtureF10FomSplitBundle();

    // (1, 1) -> INTERPOLATED
    expect(
      getReferenceCellExclusionReason(bundle, 1, 1, F10_DEFAULT_PROFILE, 'prefer')
    ).toBe('INTERPOLATED_OR_UNRELIABLE');

    // (1, 3) -> MANUALLY_EDITED (UNKNOWN, U = 0.75)
    expect(
      getReferenceCellExclusionReason(bundle, 1, 3, F10_DEFAULT_PROFILE, 'prefer')
    ).toBeNull();
    expect(bundle.qualityCode[8]).toBe(QUALITY_CODE.UNKNOWN);
    expect(QUALITY_PENALTY_BY_CODE[QUALITY_CODE.UNKNOWN]).toBe(0.75);

    // Routing from (1,0) to (1,2) detours around INTERPOLATED (1,1)
    const aroundInterpolated = solveReferenceRoute(
      bundle,
      { eastM: 5, northM: 15 },
      { eastM: 25, northM: 15 },
      'shortest',
      'prefer'
    );
    expect(aroundInterpolated.status).toBe('success');
    if (aroundInterpolated.status === 'success') {
      expect(aroundInterpolated.cellIndices).not.toContain(6);
    }

    // Routing from (1,2) to (1,4) traverses MANUALLY_EDITED (1,3) directly
    const throughManuallyEdited = solveReferenceRoute(
      bundle,
      { eastM: 25, northM: 15 },
      { eastM: 45, northM: 15 },
      'shortest',
      'prefer'
    );
    expect(throughManuallyEdited.status).toBe('success');
    if (throughManuallyEdited.status === 'success') {
      expect(throughManuallyEdited.cellIndices).toEqual([7, 8, 9]);
    }
  });

  it('Subtest C (Finding 4): elevation-support mask isolates +1000m INTERPOLATED spike from all non-adjacent cells', () => {
    const flatRef = createFixtureF10InterpolatedSpikeBundle(-2540.0);
    const spikeBundle = createFixtureF10InterpolatedSpikeBundle(1000.0);

    // Center cell (3,3) is INTERPOLATED_OR_UNRELIABLE
    expect(
      getReferenceCellExclusionReason(spikeBundle, 3, 3, F10_DEFAULT_PROFILE, 'prefer')
    ).toBe('INTERPOLATED_OR_UNRELIABLE');

    let unsupportedNeighborCount = 0;
    let acceptedCellCount = 0;

    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        if (r === 3 && c === 3) continue;
        const idx = r * 7 + c;
        const isAdjacentToCenter = Math.abs(r - 3) <= 1 && Math.abs(c - 3) <= 1;
        const reason = getReferenceCellExclusionReason(
          spikeBundle,
          r,
          c,
          F10_DEFAULT_PROFILE,
          'prefer'
        );

        if (isAdjacentToCenter) {
          expect(reason).toBe('UNSUPPORTED_DERIVATIVE');
          unsupportedNeighborCount++;
        } else {
          expect(reason).toBeNull();
          expect(spikeBundle.elevationM[idx]).toBe(-2540.0);
          expect(spikeBundle.terrainSlopeDeg[idx]).toBe(0.0);
          expect(spikeBundle.roughnessNormalized[idx]).toBe(0.0);
          expect(spikeBundle.elevationM[idx]).toBe(flatRef.elevationM[idx]);
          expect(spikeBundle.terrainSlopeDeg[idx]).toBe(flatRef.terrainSlopeDeg[idx]);
          expect(spikeBundle.roughnessNormalized[idx]).toBe(flatRef.roughnessNormalized[idx]);
          acceptedCellCount++;
        }
      }
    }

    expect(unsupportedNeighborCount).toBe(8);
    expect(acceptedCellCount).toBe(40);
  });
});
