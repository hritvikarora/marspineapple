import { describe, expect, it } from 'vitest';
import type { ConstraintProfile, RegionRoutingBundle } from '../../src/contracts/routing.js';
import { computeDistanceAndTimeMetrics } from '../../src/routing/metricsDistance.js';

const EVA_PROFILE: ConstraintProfile = {
  profileId: 'educational-eva-v1',
  version: '1.0.0',
  maxTerrainSlopeDeg: 25,
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
  slopeDeg?: number[]
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
    roughnessNormalized: new Float32Array(n).fill(0),
    qualityCode: new Uint8Array(n).fill(0),
  };
}

describe('T20: computeDistanceAndTimeMetrics', () => {
  it('handles 0-edge same-cell path [12] cleanly', () => {
    const bundle = makeBundle(5, 5, new Array(25).fill(-2500));
    const res = computeDistanceAndTimeMetrics(bundle, [12], EVA_PROFILE, 120);

    expect(res.horizontalDistanceM).toBe(0);
    expect(res.surfaceDistanceM).toBe(0);
    expect(res.estimatedTimeS).toBe(120);
    expect(res.gradeAdjustedTimeS).toBe(120);
    expect(Array.from(res.cumulativeHorizM)).toEqual([0]);
    expect(Array.from(res.cumulativeSurfaceM)).toEqual([0]);
  });

  it('handles empty cellIndices cleanly', () => {
    const bundle = makeBundle(5, 5, new Array(25).fill(0));
    const res = computeDistanceAndTimeMetrics(bundle, [], EVA_PROFILE, 45);

    expect(res.horizontalDistanceM).toBe(0);
    expect(res.surfaceDistanceM).toBe(0);
    expect(res.estimatedTimeS).toBe(45);
    expect(res.gradeAdjustedTimeS).toBe(45);
  });

  it('satisfies the secant bound D_horiz <= D_surface <= D_horiz * sec(20 deg) on sloped paths', () => {
    // 4 cells east, rising at 19 degrees per 10m step: dz = 10 * tan(19 deg)
    const stepDz = 10 * Math.tan((19 * Math.PI) / 180);
    const bundle = makeBundle(
      4,
      1,
      [0, stepDz, 2 * stepDz, 3 * stepDz],
      [19, 19, 19, 19]
    );
    const res = computeDistanceAndTimeMetrics(bundle, [0, 1, 2, 3], EVA_PROFILE, 0);

    const sec20 = 1 / Math.cos((20 * Math.PI) / 180);
    expect(res.horizontalDistanceM).toBeCloseTo(30, 9);
    expect(res.surfaceDistanceM).toBeGreaterThanOrEqual(res.horizontalDistanceM);
    expect(res.surfaceDistanceM).toBeLessThanOrEqual(res.horizontalDistanceM * sec20 + 1e-9);
    expect(res.estimatedTimeS).toBeCloseTo(res.surfaceDistanceM / 0.5, 9);
    expect(res.gradeAdjustedTimeS).toBeGreaterThan(res.estimatedTimeS);
  });

  it('shows a flat detour around a 19 deg ridge can have larger estimatedTimeS yet smaller gradeAdjustedTimeS', () => {
    // 3x3 grid:
    // Direct path: (1,0)->(1,1)->(1,2) = cells [3, 4, 5] over a 19 deg ridge (slope=19)
    // Detour path: (1,0)->(0,1)->(1,2) = cells [3, 1, 5] (two diagonals, flat, slope=0)
    // Direct horiz = 20m, surface ~ 20 * sec(19) ~ 21.15m
    // Detour horiz = 20 * sqrt(2) ~ 28.28m, flat so surface = 28.28m
    const dz19 = 10 * Math.tan((19 * Math.PI) / 180);
    const elev = [
      0, 0, 0,
      0, dz19, 0,
      0, 0, 0,
    ];
    const slopes = [
      0, 0, 0,
      0, 19, 0,
      0, 0, 0,
    ];
    const bundle = makeBundle(3, 3, elev, slopes);

    const direct = computeDistanceAndTimeMetrics(bundle, [3, 4, 5], EVA_PROFILE, 0);
    const detour = computeDistanceAndTimeMetrics(bundle, [3, 1, 5], EVA_PROFILE, 0);

    // Direct is shorter in constant-speed nominal time
    expect(detour.estimatedTimeS).toBeGreaterThan(direct.estimatedTimeS);
    // Detour is faster in grade-adjusted display time because the 19 deg ridge slows v_eff
    expect(detour.gradeAdjustedTimeS).toBeLessThan(direct.gradeAdjustedTimeS);
  });
});
