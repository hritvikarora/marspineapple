import type {
  ConstraintProfile,
  QualityCode,
  RegionRoutingBundle,
} from '../contracts/routing.js';
import {
  DIR_DC,
  DIR_DR,
  DIR_IS_DIAG,
  QUALITY_PENALTY_BY_CODE,
} from './types.js';

export type EdgePenalties = {
  d: number;
  S: number;
  R: number;
  U: number;
};

export function computeEdgePenalties(
  bundle: RegionRoutingBundle,
  uRow: number,
  uCol: number,
  dir: number,
  profile: ConstraintProfile
): EdgePenalties {
  const w = bundle.gridWidth;
  const vRow = uRow + DIR_DR[dir];
  const vCol = uCol + DIR_DC[dir];
  const uIdx = uRow * w + uCol;
  const vIdx = vRow * w + vCol;

  const dx = bundle.cellSpacingEastM;
  const dy = bundle.cellSpacingNorthM;
  const d = DIR_IS_DIAG[dir] === 1 ? Math.hypot(dx, dy) : DIR_DR[dir] !== 0 ? dy : dx;

  const S = Math.max(bundle.terrainSlopeDeg[uIdx], bundle.terrainSlopeDeg[vIdx]) / profile.maxTerrainSlopeDeg;
  const R = Math.max(0, Math.min(1, Math.max(bundle.roughnessNormalized[uIdx], bundle.roughnessNormalized[vIdx])));

  const uQ = QUALITY_PENALTY_BY_CODE[bundle.qualityCode[uIdx] as QualityCode] ?? Number.POSITIVE_INFINITY;
  const vQ = QUALITY_PENALTY_BY_CODE[bundle.qualityCode[vIdx] as QualityCode] ?? Number.POSITIVE_INFINITY;
  let U = Math.max(uQ, vQ);

  if (DIR_IS_DIAG[dir] === 1) {
    const w1Q = QUALITY_PENALTY_BY_CODE[bundle.qualityCode[uRow * w + vCol] as QualityCode] ?? Number.POSITIVE_INFINITY;
    const w2Q = QUALITY_PENALTY_BY_CODE[bundle.qualityCode[vRow * w + uCol] as QualityCode] ?? Number.POSITIVE_INFINITY;
    U = Math.max(U, w1Q, w2Q);
  }

  return { d, S, R, U };
}

export function computeEdgeCost(
  bundle: RegionRoutingBundle,
  uRow: number,
  uCol: number,
  dir: number,
  profile: ConstraintProfile,
  weights: { alpha: number; beta: number; gamma: number }
): number {
  const { d, S, R, U } = computeEdgePenalties(bundle, uRow, uCol, dir, profile);
  return d * (1 + weights.alpha * S + weights.beta * R + weights.gamma * U);
}
