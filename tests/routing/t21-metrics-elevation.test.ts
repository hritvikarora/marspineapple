import { describe, expect, it } from 'vitest';
import type { ConstraintProfile, RegionRoutingBundle } from '../../src/contracts/routing.js';
import { computeElevationAndSlopeMetrics } from '../../src/routing/metricsElevation.js';

const EVA_PROFILE: ConstraintProfile = {
  profileId: 'educational-eva-v1',
  version: '1.0.0',
  maxTerrainSlopeDeg: 20,
  maxRouteGradeDeg: 20,
  roughnessScaleM: 0.5,
  nominalWalkingSpeedMps: 0.5,
  gradePenaltyKappa: 1.5,
  isSimulatedAssumption: true,
};

function makeBundle(
  width: number,
  height: number,
  elevation: number[],
  slopeDeg?: number[],
  roughnessNorm?: number[]
): RegionRoutingBundle {
  const n = width * height;
  return {
    regionId: 'test-region',
    datasetVersion: 'v1',
    gridWidth: width,
    gridHeight: height,
    cellSpacingEastM: 10,
    cellSpacingNorthM: 10,
    noDataSentinel: -9999,
    roughnessScaleM: 0.5,
    qualityMappingVersion: '1.0',
    elevationM: new Float32Array(elevation),
    terrainSlopeDeg: new Float32Array(slopeDeg ?? new Array(n).fill(0)),
    roughnessNormalized: new Float32Array(roughnessNorm ?? new Array(n).fill(0)),
    qualityCode: new Uint8Array(n).fill(0),
  };
}

describe('T21: computeElevationAndSlopeMetrics', () => {
  it('enforces the exact telescoping identity on oscillating Martian elevation profiles', () => {
    const z = [-2540, -2535, -2538, -2532];
    const bundle = makeBundle(4, 1, z, [5, 12, 8, 15], [0.1, 0.2, 0.0, 0.4]);
    const res = computeElevationAndSlopeMetrics(bundle, [0, 1, 2, 3], EVA_PROFILE);

    // +5, -3, +6 => ascent = 11, descent = 3, net = +8
    expect(res.cumulativeAscentM).toBeCloseTo(11, 6);
    expect(res.cumulativeDescentM).toBeCloseTo(3, 6);
    expect(res.netElevationChangeM).toBeCloseTo(8, 6);
    expect(
      Math.abs((res.cumulativeAscentM - res.cumulativeDescentM) - res.netElevationChangeM)
    ).toBeLessThanOrEqual(1e-6);

    expect(res.elevationProfile.length).toBe(4);
    expect(res.elevationProfile[0].incomingGradeDeg).toBe(0);
    expect(res.elevationProfile[0].distanceM).toBe(0);
    expect(res.elevationProfile[3].distanceM).toBeCloseTo(30, 6);

    expect(res.maxTerrainSlopeDeg).toBe(15);
    expect(res.maxTerrainSlopeCellIndex).toBe(3);
    expect(res.maxTerrainSlopeAtDistanceM).toBeCloseTo(30, 6);

    // Max uphill: +6m over 10m = atan(0.6) deg ~ 30.96 deg; max downhill: -3m over 10m = atan(0.3) deg ~ 16.70 deg
    expect(res.maxUphillGradeDeg).toBeCloseTo((Math.atan(0.6) * 180) / Math.PI, 6);
    expect(res.maxDownhillGradeDeg).toBeCloseTo((Math.atan(0.3) * 180) / Math.PI, 6);
    expect(res.maxRouteGradeDeg).toBeCloseTo(res.maxUphillGradeDeg, 6);
    expect(res.maxRouteGradeAtDistanceM).toBeCloseTo(30, 6);

    expect(res.gridSpacingM).toEqual({ dx: 10, dy: 10 });
    expect(res.slopeBaselineM).toEqual({ eastM: 20, northM: 20 });
  });

  it('handles 0-edge same-cell path cleanly', () => {
    const bundle = makeBundle(5, 5, new Array(25).fill(-2500), new Array(25).fill(7));
    const res = computeElevationAndSlopeMetrics(bundle, [12], EVA_PROFILE);

    expect(res.cumulativeAscentM).toBe(0);
    expect(res.cumulativeDescentM).toBe(0);
    expect(res.netElevationChangeM).toBe(0);
    expect(res.maxTerrainSlopeDeg).toBe(7);
    expect(res.maxTerrainSlopeCellIndex).toBe(12);
    expect(res.maxTerrainSlopeAtDistanceM).toBe(0);
    expect(res.maxRouteGradeDeg).toBe(0);
    expect(res.maxUphillGradeDeg).toBe(0);
    expect(res.maxDownhillGradeDeg).toBe(0);
    expect(res.maxRouteGradeAtDistanceM).toBe(0);
    expect(res.integratedTerrainPenaltyCostM).toBe(0);
    expect(res.integratedRoughnessPenaltyCostM).toBe(0);
    expect(res.elevationProfile.length).toBe(1);
    expect(res.elevationProfile[0].incomingGradeDeg).toBe(0);
    expect(res.elevationProfile[0].row).toBe(2);
    expect(res.elevationProfile[0].col).toBe(2);
  });

  it('computes integrated terrain and roughness penalty costs accurately', () => {
    // 2 cells: u=0 (slope=10, r=0.2), v=1 (slope=5, r=0.4), dx=10m
    // S = 10/20 = 0.5, R = 0.4 => d*(2*S + R) = 10*(1.0 + 0.4) = 14, d*R = 4
    const bundle = makeBundle(2, 1, [0, 0], [10, 5], [0.2, 0.4]);
    const res = computeElevationAndSlopeMetrics(bundle, [0, 1], EVA_PROFILE);

    expect(res.integratedTerrainPenaltyCostM).toBeCloseTo(14, 5);
    expect(res.integratedRoughnessPenaltyCostM).toBeCloseTo(4, 5);
  });
});
