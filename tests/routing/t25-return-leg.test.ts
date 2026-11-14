import { describe, expect, it, vi } from 'vitest';
import type {
  ConstraintProfile,
  RegionRoutingBundle,
  RouteMetrics,
} from '../../src/contracts/routing.js';
import { buildReturnLeg } from '../../src/routing/returnLeg.js';
import type { EdgeEvaluatorPort } from '../../src/routing/types.js';

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

function makeBundle(width: number, height: number, elevation: number[]): RegionRoutingBundle {
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
    terrainSlopeDeg: new Float32Array(n).fill(0),
    roughnessNormalized: new Float32Array(n).fill(0),
    qualityCode: new Uint8Array(n).fill(0),
  };
}

function computeSimpleMetrics(bundle: RegionRoutingBundle, cellIndices: number[]): RouteMetrics {
  let ascent = 0;
  let descent = 0;
  for (let i = 1; i < cellIndices.length; i++) {
    const dz = bundle.elevationM[cellIndices[i]] - bundle.elevationM[cellIndices[i - 1]];
    if (dz > 0) ascent += dz;
    else if (dz < 0) descent += -dz;
  }
  const net =
    cellIndices.length > 0
      ? bundle.elevationM[cellIndices[cellIndices.length - 1]] - bundle.elevationM[cellIndices[0]]
      : 0;

  return {
    horizontalDistanceM: Math.max(0, cellIndices.length - 1) * 10,
    surfaceDistanceM: Math.max(0, cellIndices.length - 1) * 10,
    cumulativeAscentM: ascent,
    cumulativeDescentM: descent,
    netElevationChangeM: net,
    maxTerrainSlopeDeg: 0,
    maxTerrainSlopeAtDistanceM: 0,
    maxTerrainSlopeCellIndex: cellIndices[0] ?? -1,
    maxRouteGradeDeg: 0,
    maxUphillGradeDeg: 0,
    maxDownhillGradeDeg: 0,
    maxRouteGradeAtDistanceM: 0,
    lowQualityDistanceM: 0,
    lowQualityPct: 0,
    unknownQualityDistanceM: 0,
    unknownQualityPct: 0,
    acceptableQualityDistanceM: Math.max(0, cellIndices.length - 1) * 10,
    acceptableQualityPct: cellIndices.length > 1 ? 100 : 0,
    weightedUncertaintyExposureM: 0,
    integratedTerrainPenaltyCostM: 0,
    integratedRoughnessPenaltyCostM: 0,
    estimatedTimeS: 0,
    gradeAdjustedTimeS: 0,
    gridSpacingM: { dx: bundle.cellSpacingEastM, dy: bundle.cellSpacingNorthM },
    slopeBaselineM: { eastM: 20, northM: 20 },
    elevationProfile: [],
    qualityIntervals: [],
  };
}

const directionalEdgeEvaluator: Pick<EdgeEvaluatorPort, 'isEdgeAdmissible'> = {
  isEdgeAdmissible(bundle, uIndex, vIndex, _dir, profile) {
    const w = bundle.gridWidth;
    const ru = Math.floor(uIndex / w);
    const cu = uIndex - ru * w;
    const rv = Math.floor(vIndex / w);
    const cv = vIndex - rv * w;
    const d = Math.hypot((cv - cu) * bundle.cellSpacingEastM, (ru - rv) * bundle.cellSpacingNorthM);
    if (d === 0) return true;
    const dz = bundle.elevationM[vIndex] - bundle.elevationM[uIndex];
    const gradeDeg = (Math.atan(Math.abs(dz) / d) * 180) / Math.PI;
    if (dz >= 0) {
      return gradeDeg <= (profile.maxUphillGradeDeg ?? profile.maxRouteGradeDeg);
    }
    return gradeDeg <= (profile.maxDownhillGradeDeg ?? profile.maxRouteGradeDeg);
  },
};

describe('T25: buildReturnLeg', () => {
  it('reverses outbound path under symmetric educational-eva-v1 and swaps ascent/descent', () => {
    const bundle = makeBundle(4, 1, [-2540, -2537, -2539, -2536]);
    const outbound = [0, 1, 2, 3];
    const outboundMetrics = computeSimpleMetrics(bundle, outbound);

    const result = buildReturnLeg({
      bundle,
      outboundCellIndices: outbound,
      profile: EVA_PROFILE,
      qualityMode: 'prefer',
      edgeEvaluator: directionalEdgeEvaluator,
      computeMetrics: (cells) => computeSimpleMetrics(bundle, cells),
    });

    expect(result.status).toBe('complete');
    expect(result.cellIndices).toEqual([3, 2, 1, 0]);
    expect(result.polylineMeters).toEqual([
      { eastM: 35, northM: 5 },
      { eastM: 25, northM: 5 },
      { eastM: 15, northM: 5 },
      { eastM: 5, northM: 5 },
    ]);
    expect(result.metrics?.cumulativeAscentM).toBeCloseTo(outboundMetrics.cumulativeDescentM, 9);
    expect(result.metrics?.cumulativeDescentM).toBeCloseTo(outboundMetrics.cumulativeAscentM, 9);
  });

  it('triggers resolveReturnPathIfAsymmetric or returns incomplete_round_trip on asymmetric directional profile', () => {
    // 15 deg uphill climb outbound (dz = 10 * tan(15 deg))
    const dz15 = 10 * Math.tan((15 * Math.PI) / 180);
    const bundle = makeBundle(3, 1, [0, dz15, 2 * dz15]);
    const asymmetricProfile: ConstraintProfile = {
      ...EVA_PROFILE,
      profileId: 'asymmetric-test',
      maxUphillGradeDeg: 20,
      maxDownhillGradeDeg: 10,
    };

    // Without fallback resolver -> incomplete_round_trip
    const infeasible = buildReturnLeg({
      bundle,
      outboundCellIndices: [0, 1, 2],
      profile: asymmetricProfile,
      qualityMode: 'prefer',
      edgeEvaluator: directionalEdgeEvaluator,
      computeMetrics: (cells) => computeSimpleMetrics(bundle, cells),
    });

    expect(infeasible.status).toBe('incomplete_round_trip');
    expect(infeasible.cellIndices).toEqual([]);
    expect(infeasible.polylineMeters).toEqual([]);
    expect(infeasible.failureReason).toBe('RETURN_PATH_INFEASIBLE_UNDER_DIRECTIONAL_GRADE_LIMIT');

    // With fallback resolver returning no_path -> incomplete_round_trip
    const resolverNoPath = vi.fn(() => ({
      status: 'no_path' as const,
      cellIndices: [],
      totalCost: 0,
      exploredNodes: 3,
    }));
    const stillInfeasible = buildReturnLeg({
      bundle,
      outboundCellIndices: [0, 1, 2],
      profile: asymmetricProfile,
      qualityMode: 'prefer',
      edgeEvaluator: directionalEdgeEvaluator,
      computeMetrics: (cells) => computeSimpleMetrics(bundle, cells),
      resolveReturnPathIfAsymmetric: resolverNoPath,
    });

    expect(resolverNoPath).toHaveBeenCalledTimes(1);
    expect(stillInfeasible.status).toBe('incomplete_round_trip');

    // With fallback resolver returning a valid alternate path -> complete
    const resolverSuccess = vi.fn(() => ({
      status: 'success' as const,
      cellIndices: [2, 1, 0],
      totalCost: 20,
      exploredNodes: 3,
    }));
    const recovered = buildReturnLeg({
      bundle,
      outboundCellIndices: [0, 1, 2],
      profile: asymmetricProfile,
      qualityMode: 'prefer',
      edgeEvaluator: directionalEdgeEvaluator,
      computeMetrics: (cells) => computeSimpleMetrics(bundle, cells),
      resolveReturnPathIfAsymmetric: resolverSuccess,
    });

    expect(resolverSuccess).toHaveBeenCalledTimes(1);
    expect(recovered.status).toBe('complete');
    expect(recovered.cellIndices).toEqual([2, 1, 0]);
  });
});
