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

export const F10_DEFAULT_PROFILE: ConstraintProfile = {
  profileId: 'educational-eva-v1',
  version: '1.0.0',
  maxTerrainSlopeDeg: 20,
  maxRouteGradeDeg: 20,
  roughnessScaleM: 0.5,
  nominalWalkingSpeedMps: 1.0,
  gradePenaltyKappa: 1.0,
  isSimulatedAssumption: true,
};

export function createFixtureF10LowBarrierBundle(): RegionRoutingBundle {
  const width = 5;
  const height = 3;
  const n = width * height;
  const elevationM = new Float32Array(n).fill(-2540.0);
  const terrainSlopeDeg = new Float32Array(n).fill(0.0);
  const roughnessNormalized = new Float32Array(n).fill(0.0);
  const qualityCode = new Uint8Array(n).fill(QUALITY_CODE.ACCEPTABLE);
  const sourceFomCode = new Uint8Array(n).fill(SOURCE_FOM_CODE.ACCEPTABLE);

  // Column c = 2 has LOW quality across all rows r in {0, 1, 2}
  for (let row = 0; row < height; row++) {
    const k = row * width + 2;
    qualityCode[k] = QUALITY_CODE.LOW;
    sourceFomCode[k] = SOURCE_FOM_CODE.LOW_CORRELATION;
  }

  return {
    regionId: 'fixture-f10a-low-barrier',
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

export function createFixtureF10FomSplitBundle(): RegionRoutingBundle {
  const width = 5;
  const height = 3;
  const n = width * height;
  const elevationM = new Float32Array(n).fill(-2540.0);
  const terrainSlopeDeg = new Float32Array(n).fill(0.0);
  const roughnessNormalized = new Float32Array(n).fill(0.0);
  const qualityCode = new Uint8Array(n).fill(QUALITY_CODE.ACCEPTABLE);
  const sourceFomCode = new Uint8Array(n).fill(SOURCE_FOM_CODE.ACCEPTABLE);

  // (1, 1) -> k = 6: INTERPOLATED -> INVALID (hard-excluded)
  qualityCode[6] = QUALITY_CODE.INVALID;
  sourceFomCode[6] = SOURCE_FOM_CODE.INTERPOLATED;

  // (1, 3) -> k = 8: MANUALLY_EDITED -> UNKNOWN (admissible in prefer mode, U = 0.75)
  qualityCode[8] = QUALITY_CODE.UNKNOWN;
  sourceFomCode[8] = SOURCE_FOM_CODE.MANUALLY_EDITED;

  return {
    regionId: 'fixture-f10b-fom-split',
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

export function createFixtureF10InterpolatedSpikeBundle(
  spikeHeightM = 1000.0
): RegionRoutingBundle {
  const width = 7;
  const height = 7;
  const n = width * height;
  const elevationM = new Float32Array(n).fill(-2540.0);
  const terrainSlopeDeg = new Float32Array(n).fill(0.0);
  const roughnessNormalized = new Float32Array(n).fill(0.0);
  const qualityCode = new Uint8Array(n).fill(QUALITY_CODE.ACCEPTABLE);
  const sourceFomCode = new Uint8Array(n).fill(SOURCE_FOM_CODE.ACCEPTABLE);
  const derivativeSupportMask = new Uint8Array(n).fill(1);

  // Center cell (3, 3) -> k = 24 is INTERPOLATED with synthetic spike elevation
  const centerIdx = 3 * width + 3;
  elevationM[centerIdx] = spikeHeightM;
  qualityCode[centerIdx] = QUALITY_CODE.INVALID;
  sourceFomCode[centerIdx] = SOURCE_FOM_CODE.INTERPOLATED;

  const bundle: RegionRoutingBundle = {
    regionId: 'fixture-f10c-interpolated-spike',
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
    derivativeSupportMask,
  };

  applyElevationSupportMaskAndDerivatives(bundle);
  return bundle;
}

/**
 * Step 0: Apply elevation-support mask BEFORE computing 3x3 Horn slope and plane-fit RMS roughness.
 * Any cell whose 3x3 window touches an unsupported cell (non-finite, noData, or INVALID/INTERPOLATED)
 * is marked derivativeSupportMask[idx] = 0 and never reads the unsupported spike elevation.
 */
export function applyElevationSupportMaskAndDerivatives(bundle: RegionRoutingBundle): void {
  const w = bundle.gridWidth;
  const h = bundle.gridHeight;
  const n = w * h;
  const supported = new Uint8Array(n);

  for (let i = 0; i < n; i++) {
    const z = bundle.elevationM[i];
    const q = bundle.qualityCode[i];
    const fom = bundle.sourceFomCode?.[i];
    supported[i] =
      Number.isFinite(z) &&
      z !== bundle.noDataSentinel &&
      q !== QUALITY_CODE.INVALID &&
      fom !== SOURCE_FOM_CODE.INTERPOLATED
        ? 1
        : 0;
  }

  if (!bundle.derivativeSupportMask) {
    bundle.derivativeSupportMask = new Uint8Array(n);
  }

  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const idx = r * w + c;
      let windowSupported = true;
      const winZ = new Float64Array(9);
      let k = 0;

      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = Math.min(h - 1, Math.max(0, r + dr));
          const nc = Math.min(w - 1, Math.max(0, c + dc));
          const nIdx = nr * w + nc;
          if (supported[nIdx] === 0) {
            windowSupported = false;
          } else {
            winZ[k] = bundle.elevationM[nIdx];
          }
          k++;
        }
      }

      if (!windowSupported) {
        bundle.derivativeSupportMask[idx] = 0;
        bundle.terrainSlopeDeg[idx] = 0;
        bundle.roughnessNormalized[idx] = 0;
        continue;
      }

      bundle.derivativeSupportMask[idx] = 1;
      // 3x3 Horn slope
      const dzdx =
        (winZ[2] + 2 * winZ[5] + winZ[8] - (winZ[0] + 2 * winZ[3] + winZ[6])) /
        (8 * bundle.cellSpacingEastM);
      const dzdy =
        (winZ[6] + 2 * winZ[7] + winZ[8] - (winZ[0] + 2 * winZ[1] + winZ[2])) /
        (8 * bundle.cellSpacingNorthM);
      bundle.terrainSlopeDeg[idx] = (Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI;

      // 3x3 plane-fit RMS roughness residual normalized by roughnessScaleM
      let meanZ = 0;
      for (let m = 0; m < 9; m++) meanZ += winZ[m];
      meanZ /= 9;

      let sx = 0;
      let sy = 0;
      let mIdx = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const x = dc * bundle.cellSpacingEastM;
          const y = dr * bundle.cellSpacingNorthM;
          sx += x * (winZ[mIdx] - meanZ);
          sy += y * (winZ[mIdx] - meanZ);
          mIdx++;
        }
      }
      const a = sx / (6 * bundle.cellSpacingEastM * bundle.cellSpacingEastM);
      const b = sy / (6 * bundle.cellSpacingNorthM * bundle.cellSpacingNorthM);

      let ssRes = 0;
      mIdx = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const x = dc * bundle.cellSpacingEastM;
          const y = dr * bundle.cellSpacingNorthM;
          const pred = meanZ + a * x + b * y;
          const res = winZ[mIdx] - pred;
          ssRes += res * res;
          mIdx++;
        }
      }
      const rms = Math.sqrt(ssRes / 9);
      bundle.roughnessNormalized[idx] = rms / bundle.roughnessScaleM;
    }
  }
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

export function solveReferenceRoute(
  bundle: RegionRoutingBundle,
  startPt: LocalMeterPoint,
  destPt: LocalMeterPoint,
  policy: PolicyId,
  qualityMode: QualityMode = 'prefer',
  profile: ConstraintProfile = F10_DEFAULT_PROFILE
):
  | { status: 'success'; cellIndices: number[]; totalCost: number }
  | { status: 'no_path'; reasonCode: 'SEARCH_EXHAUSTED' | 'STRICT_QUALITY_BLOCKED' }
  | { status: 'invalid_input'; endpoint: 'start' | 'destination'; reasonCode: ExclusionReasonCode } {
  const normStart = normalizePointToGrid(bundle, startPt);
  if (!normStart) return { status: 'invalid_input', endpoint: 'start', reasonCode: 'OUT_OF_BOUNDS' };
  const normDest = normalizePointToGrid(bundle, destPt);
  if (!normDest)
    return { status: 'invalid_input', endpoint: 'destination', reasonCode: 'OUT_OF_BOUNDS' };

  const startExcl = getReferenceCellExclusionReason(
    bundle,
    normStart.row,
    normStart.col,
    profile,
    qualityMode
  );
  if (startExcl) return { status: 'invalid_input', endpoint: 'start', reasonCode: startExcl };
  const destExcl = getReferenceCellExclusionReason(
    bundle,
    normDest.row,
    normDest.col,
    profile,
    qualityMode
  );
  if (destExcl) return { status: 'invalid_input', endpoint: 'destination', reasonCode: destExcl };

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
      const dHoriz = Math.hypot(
        DIR_DC[dir] * bundle.cellSpacingEastM,
        DIR_DR[dir] * bundle.cellSpacingNorthM
      );
      const sEdge = Math.min(
        1,
        Math.max(0, Math.max(bundle.terrainSlopeDeg[u], bundle.terrainSlopeDeg[v]) / profile.maxTerrainSlopeDeg)
      );
      const rEdge = Math.min(
        1,
        Math.max(0, Math.max(bundle.roughnessNormalized[u], bundle.roughnessNormalized[v]))
      );
      let uEdge = Math.max(
        QUALITY_PENALTY_BY_CODE[bundle.qualityCode[u] as QualityCode],
        QUALITY_PENALTY_BY_CODE[bundle.qualityCode[v] as QualityCode]
      );
      if (DIR_IS_DIAG[dir]) {
        const c1 = ur * bundle.gridWidth + vc;
        const c2 = vr * bundle.gridWidth + uc;
        uEdge = Math.max(
          uEdge,
          QUALITY_PENALTY_BY_CODE[bundle.qualityCode[c1] as QualityCode],
          QUALITY_PENALTY_BY_CODE[bundle.qualityCode[c2] as QualityCode]
        );
      }
      const edgeCost =
        dHoriz * (1 + weights.alpha * sEdge + weights.beta * rEdge + weights.gamma * uEdge);
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
  return { status: 'success', cellIndices, totalCost: dist[normDest.cellIndex] };
}
