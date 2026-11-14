import type {
  ConstraintProfile,
  QualityMode,
  RegionRoutingBundle,
} from '../contracts/routing.js';
import {
  DIR_DC,
  DIR_DR,
  DIR_IS_DIAG,
  type CellAdmissibilityPort,
} from './types.js';

export function isEdgeAdmissible(
  bundle: RegionRoutingBundle,
  uRow: number,
  uCol: number,
  dir: number,
  profile: ConstraintProfile,
  qualityMode: QualityMode,
  cellAdmissibility: CellAdmissibilityPort
): boolean {
  const vRow = uRow + DIR_DR[dir];
  const vCol = uCol + DIR_DC[dir];
  if (cellAdmissibility.getCellExclusionReason(bundle, uRow, uCol, profile, qualityMode) !== null) {
    return false;
  }
  if (cellAdmissibility.getCellExclusionReason(bundle, vRow, vCol, profile, qualityMode) !== null) {
    return false;
  }

  if (DIR_IS_DIAG[dir] === 1) {
    // Both orthogonal corner neighbors w1=(uRow, vCol) and w2=(vRow, uCol) must be admissible
    if (cellAdmissibility.getCellExclusionReason(bundle, uRow, vCol, profile, qualityMode) !== null) {
      return false;
    }
    if (cellAdmissibility.getCellExclusionReason(bundle, vRow, uCol, profile, qualityMode) !== null) {
      return false;
    }
  }

  const w = bundle.gridWidth;
  const uIdx = uRow * w + uCol;
  const vIdx = vRow * w + vCol;
  const dz = bundle.elevationM[vIdx] - bundle.elevationM[uIdx];
  const dx = bundle.cellSpacingEastM;
  const dy = bundle.cellSpacingNorthM;
  const d = DIR_IS_DIAG[dir] === 1 ? Math.hypot(dx, dy) : DIR_DR[dir] !== 0 ? dy : dx;

  const maxGradeDeg =
    dz > 0
      ? (profile.maxUphillGradeDeg ?? profile.maxRouteGradeDeg)
      : dz < 0
        ? (profile.maxDownhillGradeDeg ?? profile.maxRouteGradeDeg)
        : profile.maxRouteGradeDeg;

  const gradeDeg = Math.atan(Math.abs(dz) / d) * (180 / Math.PI);
  return gradeDeg <= maxGradeDeg + 1e-12;
}
