import {
  QUALITY_CODE,
  SOURCE_FOM_CODE,
  type ConstraintProfile,
  type ExclusionReasonCode,
  type LocalMeterPoint,
  type PolicyId,
  type QualityCode,
  type QualityMode,
  type RegionRoutingBundle,
} from '../../src/contracts/routing.js';
import {
  DIR_COUNT,
  DIR_DC,
  DIR_DR,
  DIR_IS_DIAG,
  NOMINAL_POLICY_WEIGHTS,
  QUALITY_PENALTY_BY_CODE,
} from '../../src/routing/types.js';

export const F05_DEFAULT_PROFILE: ConstraintProfile = {
  profileId: 'educational-eva-v1',
  version: '1.0.0',
  maxTerrainSlopeDeg: 20,
  maxRouteGradeDeg: 20,
  roughnessScaleM: 0.5,
  nominalWalkingSpeedMps: 1.0,
  gradePenaltyKappa: 1.0,
  isSimulatedAssumption: true,
};

export const F05_START_POINT: LocalMeterPoint = { eastM: 11.1, northM: 14.2 };
export const F05_DEST_POINT: LocalMeterPoint = { eastM: 13.9, northM: 10.4 };
export const F05_EXPECTED_CELL_INDEX = 12;

export const F06_CROSSOVER_GAMMA = Math.SQRT2 - 1;
export const F06_DIRECT_PATH = [5, 6, 7, 8, 9] as const;
export const F06_CORNER_CLIPPING_PATH = [5, 6, 2, 8, 9] as const;
export const F06_CORNER_CLEAR_DETOUR = [5, 1, 2, 3, 9] as const;
export const F06_DIRECT_LENGTH_M = 40.0;
export const F06_DIRECT_LOW_QUALITY_M = 20.0;
export const F06_DETOUR_LENGTH_M = 20 + 20 * Math.SQRT2;
export const F06_CORNER_CLIPPING_COST_GAMMA2 = 20 + 60 * Math.SQRT2;

function createUniformBundle(
  regionId: string,
  width: number,
  height: number,
  dx: number,
  dy: number
): RegionRoutingBundle {
  const n = width * height;
  const elevationM = new Float32Array(n).fill(-2540.0);
  const terrainSlopeDeg = new Float32Array(n).fill(0.0);
  const roughnessNormalized = new Float32Array(n).fill(0.0);
  const qualityCode = new Uint8Array(n).fill(QUALITY_CODE.ACCEPTABLE);
  const sourceFomCode = new Uint8Array(n).fill(SOURCE_FOM_CODE.ACCEPTABLE);

  return {
    regionId,
    datasetVersion: '1.0.0',
    gridWidth: width,
    gridHeight: height,
    cellSpacingEastM: dx,
    cellSpacingNorthM: dy,
    noDataSentinel: -9999,
    roughnessScaleM: 0.5,
    qualityMappingVersion: 'v1',
    elevationM,
    terrainSlopeDeg,
    roughnessNormalized,
    qualityCode,
    sourceFomCode,
  };
}

export function createFixtureF05AdmissibleBundle(): RegionRoutingBundle {
  return createUniformBundle('fixture-f05-admissible', 5, 5, 5, 5);
}

export function createFixtureF05InterpolatedCenterBundle(): RegionRoutingBundle {
  const bundle = createUniformBundle('fixture-f05-interpolated-center', 5, 5, 5, 5);
  bundle.qualityCode[12] = QUALITY_CODE.INVALID;
  if (bundle.sourceFomCode) {
    bundle.sourceFomCode[12] = SOURCE_FOM_CODE.INTERPOLATED;
  }
  return bundle;
}

export function createFixtureF06Bundle(): RegionRoutingBundle {
  const bundle = createUniformBundle('fixture-f06-corner-clear', 5, 3, 10, 10);
  // Center cell (row=1, col=2, k=7) has LOW quality (U = 1.0)
  bundle.qualityCode[7] = QUALITY_CODE.LOW;
  if (bundle.sourceFomCode) {
    bundle.sourceFomCode[7] = SOURCE_FOM_CODE.LOW_CORRELATION;
  }
  return bundle;
}

export type ReferenceEvalResult =
  | {
      status: 'success';
      cellIndices: number[];
      totalCost: number;
      horizontalDistanceM: number;
      surfaceDistanceM: number;
      cumulativeAscentM: number;
      cumulativeDescentM: number;
      maxRouteGradeDeg: number;
      lowQualityDistanceM: number;
      lowQualityPct: number;
      unknownQualityPct: number;
      acceptableQualityPct: number;
    }
  | {
      status: 'invalid_input';
      endpoint: 'start' | 'destination';
      reasonCode: ExclusionReasonCode;
    }
  | {
      status: 'no_path';
      reasonCode: 'SEARCH_EXHAUSTED' | 'STRICT_QUALITY_BLOCKED';
    };

export function normalizePointToGrid(
  bundle: RegionRoutingBundle,
  pt: LocalMeterPoint
): { row: number; col: number; cellIndex: number } | null {
  const maxE = bundle.gridWidth * bundle.cellSpacingEastM;
  const maxN = bundle.gridHeight * bundle.cellSpacingNorthM;
  if (pt.eastM < 0 || pt.eastM > maxE || pt.northM < 0 || pt.northM > maxN) {
    return null;
  }
  const col = Math.min(
    bundle.gridWidth - 1,
    Math.max(0, Math.floor(pt.eastM / bundle.cellSpacingEastM))
  );
  const rawRowFromSouth = Math.min(
    bundle.gridHeight - 1,
    Math.max(0, Math.floor(pt.northM / bundle.cellSpacingNorthM))
  );
  const row = bundle.gridHeight - 1 - rawRowFromSouth;
  return { row, col, cellIndex: row * bundle.gridWidth + col };
}

export function getReferenceCellExclusionReason(
  bundle: RegionRoutingBundle,
  row: number,
  col: number,
  profile: ConstraintProfile,
  qualityMode: QualityMode
): ExclusionReasonCode | null {
  if (row < 0 || row >= bundle.gridHeight || col < 0 || col >= bundle.gridWidth) {
    return 'OUT_OF_BOUNDS';
  }
  const idx = row * bundle.gridWidth + col;
  const z = bundle.elevationM[idx];
  const slope = bundle.terrainSlopeDeg[idx];
  if (!Number.isFinite(z) || z === bundle.noDataSentinel || !Number.isFinite(slope)) {
    return 'NO_DATA';
  }
  const q = bundle.qualityCode[idx] as QualityCode;
  const fom = bundle.sourceFomCode?.[idx];
  if (q === QUALITY_CODE.INVALID || fom === SOURCE_FOM_CODE.INTERPOLATED) {
    return 'INTERPOLATED_OR_UNRELIABLE';
  }
  if (bundle.explicitExclusionMask && bundle.explicitExclusionMask[idx] !== 0) {
    return 'EXPLICIT_HAZARD_MASK';
  }
  if (bundle.derivativeSupportMask && bundle.derivativeSupportMask[idx] === 0) {
    return 'UNSUPPORTED_DERIVATIVE';
  }
  if (slope > profile.maxTerrainSlopeDeg) {
    return 'MAX_TERRAIN_SLOPE_EXCEEDED';
  }
  if (qualityMode === 'strict' && q !== QUALITY_CODE.ACCEPTABLE) {
    return 'STRICT_QUALITY_EXCLUDED';
  }
  return null;
}

export function evaluatePathCost(
  bundle: RegionRoutingBundle,
  cellIndices: readonly number[],
  weights: { alpha: number; beta: number; gamma: number },
  profile: ConstraintProfile = F05_DEFAULT_PROFILE
): { totalCost: number; horizontalDistanceM: number; lowQualityDistanceM: number } {
  let totalCost = 0;
  let horizontalDistanceM = 0;
  let lowQualityDistanceM = 0;

  for (let i = 0; i + 1 < cellIndices.length; i++) {
    const u = cellIndices[i];
    const v = cellIndices[i + 1];
    const ur = Math.floor(u / bundle.gridWidth);
    const uc = u % bundle.gridWidth;
    const vr = Math.floor(v / bundle.gridWidth);
    const vc = v % bundle.gridWidth;
    const dr = vr - ur;
    const dc = vc - uc;

    const dHoriz = Math.hypot(
      dc * bundle.cellSpacingEastM,
      dr * bundle.cellSpacingNorthM
    );
    const sEdge =
      0.5 *
      (bundle.terrainSlopeDeg[u] + bundle.terrainSlopeDeg[v]) /
      profile.maxTerrainSlopeDeg;
    const rEdge =
      0.5 * (bundle.roughnessNormalized[u] + bundle.roughnessNormalized[v]);

    const qU = QUALITY_PENALTY_BY_CODE[bundle.qualityCode[u] as QualityCode];
    const qV = QUALITY_PENALTY_BY_CODE[bundle.qualityCode[v] as QualityCode];
    let uEdge = Math.max(qU, qV);

    if (dr !== 0 && dc !== 0) {
      const c1 = ur * bundle.gridWidth + vc;
      const c2 = vr * bundle.gridWidth + uc;
      const qC1 = QUALITY_PENALTY_BY_CODE[bundle.qualityCode[c1] as QualityCode];
      const qC2 = QUALITY_PENALTY_BY_CODE[bundle.qualityCode[c2] as QualityCode];
      uEdge = Math.max(uEdge, qC1, qC2);
    }

    horizontalDistanceM += dHoriz;
    totalCost +=
      dHoriz *
      (1 + weights.alpha * sEdge + weights.beta * rEdge + weights.gamma * uEdge);

    if (
      bundle.qualityCode[u] === QUALITY_CODE.LOW ||
      bundle.qualityCode[v] === QUALITY_CODE.LOW
    ) {
      lowQualityDistanceM += dHoriz;
    }
  }

  return { totalCost, horizontalDistanceM, lowQualityDistanceM };
}

export function solveReferenceRoute(
  bundle: RegionRoutingBundle,
  startPt: LocalMeterPoint,
  destPt: LocalMeterPoint,
  policy: PolicyId,
  qualityMode: QualityMode = 'prefer',
  profile: ConstraintProfile = F05_DEFAULT_PROFILE
): ReferenceEvalResult {
  const normStart = normalizePointToGrid(bundle, startPt);
  if (!normStart) {
    return { status: 'invalid_input', endpoint: 'start', reasonCode: 'OUT_OF_BOUNDS' };
  }
  const normDest = normalizePointToGrid(bundle, destPt);
  if (!normDest) {
    return { status: 'invalid_input', endpoint: 'destination', reasonCode: 'OUT_OF_BOUNDS' };
  }

  // Stage 5: endpoint admissibility BEFORE Stage 6 same-cell shortcut
  const startExcl = getReferenceCellExclusionReason(
    bundle,
    normStart.row,
    normStart.col,
    profile,
    qualityMode
  );
  if (startExcl) {
    return { status: 'invalid_input', endpoint: 'start', reasonCode: startExcl };
  }
  const destExcl = getReferenceCellExclusionReason(
    bundle,
    normDest.row,
    normDest.col,
    profile,
    qualityMode
  );
  if (destExcl) {
    return { status: 'invalid_input', endpoint: 'destination', reasonCode: destExcl };
  }

  // Stage 6: Same-cell shortcut
  if (normStart.cellIndex === normDest.cellIndex) {
    return {
      status: 'success',
      cellIndices: [normStart.cellIndex],
      totalCost: 0,
      horizontalDistanceM: 0,
      surfaceDistanceM: 0,
      cumulativeAscentM: 0,
      cumulativeDescentM: 0,
      maxRouteGradeDeg: 0,
      lowQualityDistanceM: 0,
      lowQualityPct: 0,
      unknownQualityPct: 0,
      acceptableQualityPct: 0,
    };
  }

  const weights = NOMINAL_POLICY_WEIGHTS[policy];
  const n = bundle.gridWidth * bundle.gridHeight;
  const dist = new Float64Array(n).fill(Number.POSITIVE_INFINITY);
  const prev = new Int32Array(n).fill(-1);
  const visited = new Uint8Array(n);

  dist[normStart.cellIndex] = 0;

  while (true) {
    let u = -1;
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < n; i++) {
      if (!visited[i] && dist[i] < best) {
        best = dist[i];
        u = i;
      }
    }
    if (u === -1 || u === normDest.cellIndex) {
      break;
    }
    visited[u] = 1;

    const ur = Math.floor(u / bundle.gridWidth);
    const uc = u % bundle.gridWidth;

    for (let dir = 0; dir < DIR_COUNT; dir++) {
      const vr = ur + DIR_DR[dir];
      const vc = uc + DIR_DC[dir];
      if (getReferenceCellExclusionReason(bundle, vr, vc, profile, qualityMode) !== null) {
        continue;
      }
      if (DIR_IS_DIAG[dir]) {
        if (
          getReferenceCellExclusionReason(bundle, ur, vc, profile, qualityMode) !== null ||
          getReferenceCellExclusionReason(bundle, vr, uc, profile, qualityMode) !== null
        ) {
          continue;
        }
      }
      const v = vr * bundle.gridWidth + vc;
      const dHoriz = Math.hypot(
        DIR_DC[dir] * bundle.cellSpacingEastM,
        DIR_DR[dir] * bundle.cellSpacingNorthM
      );
      const dz = bundle.elevationM[v] - bundle.elevationM[u];
      const gradeDeg = (Math.atan2(Math.abs(dz), dHoriz) * 180) / Math.PI;
      if (gradeDeg > profile.maxRouteGradeDeg) {
        continue;
      }

      const { totalCost: edgeCost } = evaluatePathCost(bundle, [u, v], weights, profile);
      const alt = dist[u] + edgeCost;
      if (alt < dist[v]) {
        dist[v] = alt;
        prev[v] = u;
      }
    }
  }

  if (!Number.isFinite(dist[normDest.cellIndex])) {
    return {
      status: 'no_path',
      reasonCode: qualityMode === 'strict' ? 'STRICT_QUALITY_BLOCKED' : 'SEARCH_EXHAUSTED',
    };
  }

  const cellIndices: number[] = [];
  for (let cur = normDest.cellIndex; cur !== -1; cur = prev[cur]) {
    cellIndices.push(cur);
  }
  cellIndices.reverse();

  const { totalCost, horizontalDistanceM, lowQualityDistanceM } = evaluatePathCost(
    bundle,
    cellIndices,
    weights,
    profile
  );

  let surfaceDistanceM = 0;
  let cumulativeAscentM = 0;
  let cumulativeDescentM = 0;
  let maxRouteGradeDeg = 0;
  let unknownDist = 0;
  let acceptableDist = 0;

  for (let i = 0; i + 1 < cellIndices.length; i++) {
    const u = cellIndices[i];
    const v = cellIndices[i + 1];
    const ur = Math.floor(u / bundle.gridWidth);
    const uc = u % bundle.gridWidth;
    const vr = Math.floor(v / bundle.gridWidth);
    const vc = v % bundle.gridWidth;
    const dHoriz = Math.hypot(
      (vc - uc) * bundle.cellSpacingEastM,
      (vr - ur) * bundle.cellSpacingNorthM
    );
    const dz = bundle.elevationM[v] - bundle.elevationM[u];
    surfaceDistanceM += Math.hypot(dHoriz, dz);
    if (dz > 0) cumulativeAscentM += dz;
    if (dz < 0) cumulativeDescentM += -dz;
    const gradeDeg = (Math.atan2(Math.abs(dz), dHoriz) * 180) / Math.PI;
    if (gradeDeg > maxRouteGradeDeg) maxRouteGradeDeg = gradeDeg;

    const qMax = Math.max(bundle.qualityCode[u], bundle.qualityCode[v]);
    if (qMax === QUALITY_CODE.UNKNOWN) unknownDist += dHoriz;
    else if (qMax === QUALITY_CODE.ACCEPTABLE) acceptableDist += dHoriz;
  }

  const denom = horizontalDistanceM > 0 ? horizontalDistanceM : 1;
  return {
    status: 'success',
    cellIndices,
    totalCost,
    horizontalDistanceM,
    surfaceDistanceM,
    cumulativeAscentM,
    cumulativeDescentM,
    maxRouteGradeDeg,
    lowQualityDistanceM,
    lowQualityPct: horizontalDistanceM === 0 ? 0 : (lowQualityDistanceM / denom) * 100,
    unknownQualityPct: horizontalDistanceM === 0 ? 0 : (unknownDist / denom) * 100,
    acceptableQualityPct: horizontalDistanceM === 0 ? 0 : (acceptableDist / denom) * 100,
  };
}
