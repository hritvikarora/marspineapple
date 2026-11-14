import {
  QUALITY_CODE,
  type ConstraintProfile,
  type ExclusionReasonCode,
  type QualityMode,
  type RegionRoutingBundle,
} from '../contracts/routing.js';

export function getCellExclusionReason(
  bundle: RegionRoutingBundle,
  row: number,
  col: number,
  profile: ConstraintProfile,
  qualityMode: QualityMode
): ExclusionReasonCode | null {
  if (
    !Number.isInteger(row) ||
    !Number.isInteger(col) ||
    row < 0 ||
    row >= bundle.gridHeight ||
    col < 0 ||
    col >= bundle.gridWidth
  ) {
    return 'OUT_OF_BOUNDS';
  }
  const k = row * bundle.gridWidth + col;
  const z = bundle.elevationM[k];
  if (!Number.isFinite(z) || Math.abs(z - bundle.noDataSentinel) <= 1e-5) {
    return 'NO_DATA';
  }
  const q = bundle.qualityCode[k];
  if (q === QUALITY_CODE.INVALID || q < 0 || q > 2) {
    return 'INTERPOLATED_OR_UNRELIABLE';
  }
  if (bundle.explicitExclusionMask && bundle.explicitExclusionMask[k] === 1) {
    return 'EXPLICIT_HAZARD_MASK';
  }
  const s = bundle.terrainSlopeDeg[k];
  const rNorm = bundle.roughnessNormalized[k];
  if (
    (bundle.derivativeSupportMask && bundle.derivativeSupportMask[k] === 0) ||
    !Number.isFinite(s) ||
    !Number.isFinite(rNorm)
  ) {
    return 'UNSUPPORTED_DERIVATIVE';
  }
  if (s > profile.maxTerrainSlopeDeg) {
    return 'MAX_TERRAIN_SLOPE_EXCEEDED';
  }
  if (qualityMode === 'strict' && q !== QUALITY_CODE.ACCEPTABLE) {
    return 'STRICT_QUALITY_EXCLUDED';
  }
  return null;
}

export function isCellAdmissible(
  bundle: RegionRoutingBundle,
  row: number,
  col: number,
  profile: ConstraintProfile,
  qualityMode: QualityMode
): boolean {
  return getCellExclusionReason(bundle, row, col, profile, qualityMode) === null;
}
