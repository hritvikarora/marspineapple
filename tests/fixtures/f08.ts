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

export const F08_DEFAULT_PROFILE: ConstraintProfile = {
  profileId: 'educational-eva-v1',
  version: '1.0.0',
  maxTerrainSlopeDeg: 20,
  maxRouteGradeDeg: 20,
  roughnessScaleM: 0.5,
  nominalWalkingSpeedMps: 1.0,
  gradePenaltyKappa: 1.0,
  isSimulatedAssumption: true,
};

export const F08_START_POINT: LocalMeterPoint = { eastM: 5, northM: 25 }; // (r=2, c=0) -> k=10
export const F08_DEST_POINT: LocalMeterPoint = { eastM: 45, northM: 25 }; // (r=2, c=4) -> k=14

export const F08_MIDDLE_PATH = [10, 11, 12, 13, 14] as const;
export const F08_NORTH_PATH = [10, 6, 7, 8, 14] as const;
export const F08_SOUTH_PATH = [10, 16, 17, 18, 14] as const;

export const F08_MIDDLE_LENGTH_M = 40.0;
export const F08_CORRIDOR_LENGTH_M = 20 + 20 * Math.SQRT2;
export const F08_MIDDLE_TERRAIN_COST = 120.0;
export const F08_NORTH_TERRAIN_COST = 20 + 20 * Math.SQRT2;
export const F08_NORTH_UNCERTAINTY_COST = 60 + 20 * Math.SQRT2;
export const F08_SOUTH_TERRAIN_COST = 30 + 20 * Math.SQRT2;
export const F08_SOUTH_UNCERTAINTY_COST = 30 + 20 * Math.SQRT2;

export function createFixtureF08Bundle(): RegionRoutingBundle {
  const width = 5;
  const height = 5;
  const n = width * height;

  const elevationM = new Float32Array(n).fill(-2540.0);
  const terrainSlopeDeg = new Float32Array(n).fill(0.0);
  const roughnessNormalized = new Float32Array(n).fill(0.0);
  const qualityCode = new Uint8Array(n).fill(QUALITY_CODE.ACCEPTABLE);
  const sourceFomCode = new Uint8Array(n).fill(SOURCE_FOM_CODE.ACCEPTABLE);

  // Middle corridor (row=2, cols 1..3): s = 15 deg (S = 0.75), r_norm = 0.5, ACCEPTABLE
  for (const col of [1, 2, 3]) {
    const k = 2 * width + col;
    terrainSlopeDeg[k] = 15.0;
    roughnessNormalized[k] = 0.5;
  }

  // North corridor (rows 0..1, col 2): LOW quality (U = 1.0)
  for (const row of [0, 1]) {
    const k = row * width + 2;
    qualityCode[k] = QUALITY_CODE.LOW;
    sourceFomCode[k] = SOURCE_FOM_CODE.LOW_CORRELATION;
  }

  // South corridor (rows 3..4, col 2): s = 5 deg (S = 0.25), ACCEPTABLE
  for (const row of [3, 4]) {
    const k = row * width + 2;
    terrainSlopeDeg[k] = 5.0;
  }

  return {
    regionId: 'fixture-f08-three-way-split',
    datasetVersion: '1.0.0',
    gridWidth: width,
    gridHeight: height,
    cellSpacingEastM: 10,
    cellSpacingNorthM: 10,
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
  profile: ConstraintProfile = F08_DEFAULT_PROFILE
): {
  totalCost: number;
  horizontalDistanceM: number;
  maxTerrainSlopeDeg: number;
  lowQualityDistanceM: number;
} {
  let totalCost = 0;
  let horizontalDistanceM = 0;
  let maxTerrainSlopeDeg = 0;
  let lowQualityDistanceM = 0;

  for (const k of cellIndices) {
    if (bundle.terrainSlopeDeg[k] > maxTerrainSlopeDeg) {
      maxTerrainSlopeDeg = bundle.terrainSlopeDeg[k];
    }
  }

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

    const sEdge = Math.min(
      1,
      Math.max(0, Math.max(bundle.terrainSlopeDeg[u], bundle.terrainSlopeDeg[v]) / profile.maxTerrainSlopeDeg)
    );
    const rEdge = Math.min(
      1,
      Math.max(0, Math.max(bundle.roughnessNormalized[u], bundle.roughnessNormalized[v]))
    );

    const qU = QUALITY_PENALTY_BY_CODE[bundle.qualityCode[u] as QualityCode];
    const qV = QUALITY_PENALTY_BY_CODE[bundle.qualityCode[v] as QualityCode];
    let uEdge = Math.max(qU, qV);
    let edgeLow =
      bundle.qualityCode[u] === QUALITY_CODE.LOW ||
      bundle.qualityCode[v] === QUALITY_CODE.LOW;

    if (dr !== 0 && dc !== 0) {
      const c1 = ur * bundle.gridWidth + vc;
      const c2 = vr * bundle.gridWidth + uc;
      const qC1 = QUALITY_PENALTY_BY_CODE[bundle.qualityCode[c1] as QualityCode];
      const qC2 = QUALITY_PENALTY_BY_CODE[bundle.qualityCode[c2] as QualityCode];
      uEdge = Math.max(uEdge, qC1, qC2);
      if (
        bundle.qualityCode[c1] === QUALITY_CODE.LOW ||
        bundle.qualityCode[c2] === QUALITY_CODE.LOW
      ) {
        edgeLow = true;
      }
    }

    horizontalDistanceM += dHoriz;
    totalCost +=
      dHoriz *
      (1 + weights.alpha * sEdge + weights.beta * rEdge + weights.gamma * uEdge);
    if (edgeLow) {
      lowQualityDistanceM += dHoriz;
    }
  }

  return { totalCost, horizontalDistanceM, maxTerrainSlopeDeg, lowQualityDistanceM };
}

export function formatDistanceDeltaClause(distBM: number, distAM: number): string {
  const delta = distBM - distAM;
  const eps = 1e-4;
  if (delta > eps) {
    const pct = distAM > 0 ? ((delta / distAM) * 100).toFixed(1) : '0.0';
    return `adds ${delta.toFixed(1)} m (+${pct}%)`;
  }
  if (delta < -eps) {
    const absDelta = Math.abs(delta);
    const pct = distAM > 0 ? ((absDelta / distAM) * 100).toFixed(1) : '0.0';
    return `takes a ${absDelta.toFixed(1)} m (-${pct}%) shorter corridor`;
  }
  return `follows an equal-length ${distBM.toFixed(1)} m alternative corridor`;
}

export function solveReferenceRoute(
  bundle: RegionRoutingBundle,
  startPt: LocalMeterPoint,
  destPt: LocalMeterPoint,
  policy: PolicyId,
  qualityMode: QualityMode = 'prefer',
  profile: ConstraintProfile = F08_DEFAULT_PROFILE
): {
  status: 'success';
  cellIndices: number[];
  totalCost: number;
  horizontalDistanceM: number;
  maxTerrainSlopeDeg: number;
  lowQualityDistanceM: number;
} {
  const normStart = normalizePointToGrid(bundle, startPt);
  const normDest = normalizePointToGrid(bundle, destPt);
  if (!normStart || !normDest) {
    throw new Error('Out of bounds endpoint in F08');
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
    if (u === -1 || u === normDest.cellIndex) break;
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
      const { totalCost: edgeCost } = evaluatePathCost(bundle, [u, v], weights, profile);
      const alt = dist[u] + edgeCost;
      if (alt < dist[v]) {
        dist[v] = alt;
        prev[v] = u;
      }
    }
  }

  const cellIndices: number[] = [];
  for (let cur = normDest.cellIndex; cur !== -1; cur = prev[cur]) {
    cellIndices.push(cur);
  }
  cellIndices.reverse();

  const metrics = evaluatePathCost(bundle, cellIndices, weights, profile);
  return { status: 'success', cellIndices, ...metrics };
}
