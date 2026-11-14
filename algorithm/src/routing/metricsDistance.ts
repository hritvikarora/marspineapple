import type { ConstraintProfile, RegionRoutingBundle } from '../contracts/routing.js';

export type DistanceAndTimeMetrics = {
  horizontalDistanceM: number;
  surfaceDistanceM: number;
  estimatedTimeS: number;
  gradeAdjustedTimeS: number;
  cumulativeHorizM: Float64Array;
  cumulativeSurfaceM: Float64Array;
};

const RAD_TO_DEG = 180 / Math.PI;

/**
 * Computes planar horizontal distance, 3D sampled surface distance, nominal
 * constant-speed travel time, and post-solve grade-adjusted display time.
 */
export function computeDistanceAndTimeMetrics(
  bundle: RegionRoutingBundle,
  cellIndices: number[],
  profile: ConstraintProfile,
  scienceStopDurationS = 0
): DistanceAndTimeMetrics {
  const m = Math.max(0, cellIndices.length - 1);
  const cumulativeHorizM = new Float64Array(m + 1);
  const cumulativeSurfaceM = new Float64Array(m + 1);

  const w = bundle.gridWidth;
  const dx = bundle.cellSpacingEastM;
  const dy = bundle.cellSpacingNorthM;
  const z = bundle.elevationM;
  const slope = bundle.terrainSlopeDeg;

  const vSim = profile.nominalWalkingSpeedMps;
  const kappa = profile.gradePenaltyKappa;
  const maxSlopeDeg = profile.maxTerrainSlopeDeg;

  let sumGradeTimeS = 0;

  for (let j = 1; j <= m; j++) {
    const u = cellIndices[j - 1];
    const v = cellIndices[j];

    const ru = Math.floor(u / w);
    const cu = u - ru * w;
    const rv = Math.floor(v / w);
    const cv = v - rv * w;

    const dHoriz = Math.hypot((cv - cu) * dx, (ru - rv) * dy);
    const dz = z[v] - z[u];
    const dSurface = Math.hypot(dHoriz, dz);

    cumulativeHorizM[j] = cumulativeHorizM[j - 1] + dHoriz;
    cumulativeSurfaceM[j] = cumulativeSurfaceM[j - 1] + dSurface;

    if (dSurface > 0) {
      const gradeDeg = dHoriz > 0 ? Math.atan(Math.abs(dz) / dHoriz) * RAD_TO_DEG : 90;
      const neighborSlopeDeg = Math.max(slope[u], slope[v]);
      const governingDeg = Math.max(gradeDeg, neighborSlopeDeg);
      const ratio = maxSlopeDeg > 0 ? governingDeg / maxSlopeDeg : 0;
      const vEff = vSim / (1 + kappa * ratio * ratio);
      sumGradeTimeS += dSurface / vEff;
    }
  }

  const horizontalDistanceM = cumulativeHorizM[m];
  const surfaceDistanceM = cumulativeSurfaceM[m];
  const estimatedTimeS = surfaceDistanceM / vSim + scienceStopDurationS;
  const gradeAdjustedTimeS = sumGradeTimeS + scienceStopDurationS;

  return {
    horizontalDistanceM,
    surfaceDistanceM,
    estimatedTimeS,
    gradeAdjustedTimeS,
    cumulativeHorizM,
    cumulativeSurfaceM,
  };
}
