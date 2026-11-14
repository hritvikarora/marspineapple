import {
  QUALITY_CODE,
  type ConstraintProfile,
  type ElevationProfilePoint,
  type QualityClass,
  type RegionRoutingBundle,
} from '../contracts/routing.js';

export type ElevationAndSlopeMetrics = {
  cumulativeAscentM: number;
  cumulativeDescentM: number;
  netElevationChangeM: number;
  maxTerrainSlopeDeg: number;
  maxTerrainSlopeAtDistanceM: number;
  maxTerrainSlopeCellIndex: number;
  maxRouteGradeDeg: number;
  maxUphillGradeDeg: number;
  maxDownhillGradeDeg: number;
  maxRouteGradeAtDistanceM: number;
  integratedTerrainPenaltyCostM: number;
  integratedRoughnessPenaltyCostM: number;
  gridSpacingM: { dx: number; dy: number };
  slopeBaselineM: { eastM: number; northM: number };
  elevationProfile: ElevationProfilePoint[];
};

const RAD_TO_DEG = 180 / Math.PI;

function clamp01(val: number): number {
  if (val <= 0) return 0;
  if (val >= 1) return 1;
  return val;
}

function qualityCodeToClass(code: number): QualityClass {
  switch (code) {
    case QUALITY_CODE.ACCEPTABLE:
      return 'acceptable';
    case QUALITY_CODE.UNKNOWN:
      return 'unknown';
    case QUALITY_CODE.LOW:
      return 'low';
    default:
      return 'invalid';
  }
}

/**
 * Computes cumulative ascent/descent, telescoping net elevation change,
 * terrain slope and along-route grade extremes, integrated terrain/roughness
 * penalty costs, and the cumulative-distance elevation profile.
 */
export function computeElevationAndSlopeMetrics(
  bundle: RegionRoutingBundle,
  cellIndices: number[],
  profile: ConstraintProfile
): ElevationAndSlopeMetrics {
  const w = bundle.gridWidth;
  const h = bundle.gridHeight;
  const dx = bundle.cellSpacingEastM;
  const dy = bundle.cellSpacingNorthM;
  const z = bundle.elevationM;
  const slope = bundle.terrainSlopeDeg;
  const rNorm = bundle.roughnessNormalized;
  const qCode = bundle.qualityCode;
  const maxSlopeScale = profile.maxTerrainSlopeDeg;

  const gridSpacingM = { dx, dy };
  const slopeBaselineM = { eastM: 2 * dx, northM: 2 * dy };

  if (cellIndices.length === 0) {
    return {
      cumulativeAscentM: 0,
      cumulativeDescentM: 0,
      netElevationChangeM: 0,
      maxTerrainSlopeDeg: 0,
      maxTerrainSlopeAtDistanceM: 0,
      maxTerrainSlopeCellIndex: -1,
      maxRouteGradeDeg: 0,
      maxUphillGradeDeg: 0,
      maxDownhillGradeDeg: 0,
      maxRouteGradeAtDistanceM: 0,
      integratedTerrainPenaltyCostM: 0,
      integratedRoughnessPenaltyCostM: 0,
      gridSpacingM,
      slopeBaselineM,
      elevationProfile: [],
    };
  }

  let cumulativeAscentM = 0;
  let cumulativeDescentM = 0;
  let cumulativeHorizM = 0;
  let cumulativeSurfaceM = 0;

  let maxTerrainSlopeDeg = -Infinity;
  let maxTerrainSlopeAtDistanceM = 0;
  let maxTerrainSlopeCellIndex = cellIndices[0];

  let maxRouteGradeDeg = 0;
  let maxUphillGradeDeg = 0;
  let maxDownhillGradeDeg = 0;
  let maxRouteGradeAtDistanceM = 0;

  let integratedTerrainPenaltyCostM = 0;
  let integratedRoughnessPenaltyCostM = 0;

  const elevationProfile: ElevationProfilePoint[] = new Array(cellIndices.length);

  for (let i = 0; i < cellIndices.length; i++) {
    const k = cellIndices[i];
    const row = Math.floor(k / w);
    const col = k - row * w;
    const eastM = (col + 0.5) * dx;
    const northM = (h - 1 - row + 0.5) * dy;
    const elev = z[k];
    const cellSlope = slope[k];

    let incomingGradeDeg = 0;

    if (i > 0) {
      const prevK = cellIndices[i - 1];
      const prevRow = Math.floor(prevK / w);
      const prevCol = prevK - prevRow * w;

      const dHoriz = Math.hypot((col - prevCol) * dx, (prevRow - row) * dy);
      const dz = elev - z[prevK];
      const dSurface = Math.hypot(dHoriz, dz);

      cumulativeHorizM += dHoriz;
      cumulativeSurfaceM += dSurface;

      if (dz > 0) {
        cumulativeAscentM += dz;
      } else if (dz < 0) {
        cumulativeDescentM += -dz;
      }

      if (dHoriz > 0) {
        incomingGradeDeg = Math.atan(dz / dHoriz) * RAD_TO_DEG;
        const absGradeDeg = Math.abs(incomingGradeDeg);

        if (incomingGradeDeg > maxUphillGradeDeg) {
          maxUphillGradeDeg = incomingGradeDeg;
        }
        if (-incomingGradeDeg > maxDownhillGradeDeg) {
          maxDownhillGradeDeg = -incomingGradeDeg;
        }
        if (absGradeDeg > maxRouteGradeDeg) {
          maxRouteGradeDeg = absGradeDeg;
          maxRouteGradeAtDistanceM = cumulativeHorizM;
        }
      }

      const sEdge =
        maxSlopeScale > 0 ? clamp01(Math.max(slope[prevK], cellSlope) / maxSlopeScale) : 0;
      const rEdge = clamp01(Math.max(rNorm[prevK], rNorm[k]));
      integratedRoughnessPenaltyCostM += dHoriz * rEdge;
      integratedTerrainPenaltyCostM += dHoriz * (2 * sEdge + rEdge);
    }

    if (cellSlope > maxTerrainSlopeDeg) {
      maxTerrainSlopeDeg = cellSlope;
      maxTerrainSlopeAtDistanceM = cumulativeHorizM;
      maxTerrainSlopeCellIndex = k;
    }

    elevationProfile[i] = {
      sampleIndex: i,
      cellIndex: k,
      row,
      col,
      eastM,
      northM,
      distanceM: cumulativeHorizM,
      surfaceDistanceM: cumulativeSurfaceM,
      elevationM: elev,
      terrainSlopeDeg: cellSlope,
      incomingGradeDeg,
      qualityClass: qualityCodeToClass(qCode[k]),
    };
  }

  const netElevationChangeM = z[cellIndices[cellIndices.length - 1]] - z[cellIndices[0]];

  return {
    cumulativeAscentM,
    cumulativeDescentM,
    netElevationChangeM,
    maxTerrainSlopeDeg,
    maxTerrainSlopeAtDistanceM,
    maxTerrainSlopeCellIndex,
    maxRouteGradeDeg,
    maxUphillGradeDeg,
    maxDownhillGradeDeg,
    maxRouteGradeAtDistanceM,
    integratedTerrainPenaltyCostM,
    integratedRoughnessPenaltyCostM,
    gridSpacingM,
    slopeBaselineM,
    elevationProfile,
  };
}
