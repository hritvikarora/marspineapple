import {
  QUALITY_CODE,
  type ConstraintProfile,
  type EffectivePolicyWeights,
  type PolicyId,
  type QualityClass,
  type QualityCode,
  type QualityMode,
  type RegionRoutingBundle,
} from '../contracts/routing.js';
import {
  NOMINAL_POLICY_WEIGHTS,
  QUALITY_PENALTY_BY_CODE,
  type CellAdmissibilityPort,
} from './types.js';

export type EffectivePolicyWeightsResult = {
  effectiveWeights: Record<PolicyId, EffectivePolicyWeights>;
  isQualityUniform: boolean;
  uniformQualityClass: QualityClass | null;
};

function qualityCodeToClass(code: number): QualityClass | null {
  switch (code) {
    case QUALITY_CODE.ACCEPTABLE:
      return 'acceptable';
    case QUALITY_CODE.UNKNOWN:
      return 'unknown';
    case QUALITY_CODE.LOW:
      return 'low';
    case QUALITY_CODE.INVALID:
      return 'invalid';
    default:
      return null;
  }
}

export function resolveEffectivePolicyWeights(
  bundle: RegionRoutingBundle,
  profile: ConstraintProfile,
  qualityMode: QualityMode,
  cellAdmissibility: CellAdmissibilityPort
): EffectivePolicyWeightsResult {
  let admissibleCount = 0;
  let minAdmissibleU = Number.POSITIVE_INFINITY;
  let maxAdmissibleU = Number.NEGATIVE_INFINITY;
  let firstQualityCode: number | null = null;

  for (let row = 0; row < bundle.gridHeight; row++) {
    for (let col = 0; col < bundle.gridWidth; col++) {
      if (cellAdmissibility.getCellExclusionReason(bundle, row, col, profile, qualityMode) !== null) {
        continue;
      }
      const k = row * bundle.gridWidth + col;
      const q = bundle.qualityCode[k] as QualityCode;
      const u = QUALITY_PENALTY_BY_CODE[q];
      if (!Number.isFinite(u)) {
        continue;
      }
      if (admissibleCount === 0) {
        firstQualityCode = q;
      }
      admissibleCount++;
      if (u < minAdmissibleU) minAdmissibleU = u;
      if (u > maxAdmissibleU) maxAdmissibleU = u;
    }
  }

  if (admissibleCount === 0) {
    minAdmissibleU = 0;
    maxAdmissibleU = 0;
  }

  const isQualityUniform =
    admissibleCount === 0 || Math.abs(maxAdmissibleU - minAdmissibleU) <= 1e-9;

  const uniformQualityClass =
    isQualityUniform && admissibleCount > 0 && firstQualityCode !== null
      ? qualityCodeToClass(firstQualityCode)
      : null;

  const shortestNom = NOMINAL_POLICY_WEIGHTS.shortest;
  const terrainNom = NOMINAL_POLICY_WEIGHTS.terrain;
  const uncertaintyNom = NOMINAL_POLICY_WEIGHTS.uncertainty;

  const effectiveWeights: Record<PolicyId, EffectivePolicyWeights> = {
    shortest: {
      policyId: 'shortest',
      nominal: { ...shortestNom },
      effective: { ...shortestNom },
      uniformQualityOverride: false,
      minAdmissibleU,
      maxAdmissibleU,
    },
    terrain: {
      policyId: 'terrain',
      nominal: { ...terrainNom },
      effective: { ...terrainNom },
      uniformQualityOverride: false,
      minAdmissibleU,
      maxAdmissibleU,
    },
    uncertainty: {
      policyId: 'uncertainty',
      nominal: { ...uncertaintyNom },
      effective: isQualityUniform
        ? { alpha: uncertaintyNom.alpha, beta: uncertaintyNom.beta, gamma: 0 }
        : { ...uncertaintyNom },
      uniformQualityOverride: isQualityUniform,
      minAdmissibleU,
      maxAdmissibleU,
    },
  };

  return {
    effectiveWeights,
    isQualityUniform,
    uniformQualityClass,
  };
}
