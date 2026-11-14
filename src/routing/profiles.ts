import type { ConstraintProfile, ConstraintProfileId } from '../contracts/routing.js';

export const DEFAULT_PROFILE_ID: ConstraintProfileId = 'educational-eva-v1';

export const CONSTRAINT_PROFILES: Readonly<Record<string, ConstraintProfile>> = {
  'educational-eva-v1': {
    profileId: 'educational-eva-v1',
    version: '1.0.0',
    maxTerrainSlopeDeg: 20.0,
    maxRouteGradeDeg: 20.0,
    roughnessScaleM: 0.5,
    nominalWalkingSpeedMps: 0.5,
    gradePenaltyKappa: 1.5,
    isSimulatedAssumption: true,
  },
  'conservative-15deg': {
    profileId: 'conservative-15deg',
    version: '1.0.0',
    maxTerrainSlopeDeg: 15.0,
    maxRouteGradeDeg: 15.0,
    roughnessScaleM: 0.5,
    nominalWalkingSpeedMps: 0.5,
    gradePenaltyKappa: 1.5,
    isSimulatedAssumption: true,
  },
  'relaxed-25deg': {
    profileId: 'relaxed-25deg',
    version: '1.0.0',
    maxTerrainSlopeDeg: 25.0,
    maxRouteGradeDeg: 25.0,
    roughnessScaleM: 0.5,
    nominalWalkingSpeedMps: 0.5,
    gradePenaltyKappa: 1.5,
    isSimulatedAssumption: true,
  },
};

export function resolveConstraintProfile(
  profileId?: ConstraintProfileId,
  customProfile?: ConstraintProfile
): ConstraintProfile {
  const candidate =
    customProfile ??
    CONSTRAINT_PROFILES[profileId ?? DEFAULT_PROFILE_ID] ??
    CONSTRAINT_PROFILES[DEFAULT_PROFILE_ID];
  if (
    !Number.isFinite(candidate.maxTerrainSlopeDeg) ||
    candidate.maxTerrainSlopeDeg <= 0 ||
    candidate.maxTerrainSlopeDeg >= 89 ||
    !Number.isFinite(candidate.maxRouteGradeDeg) ||
    candidate.maxRouteGradeDeg <= 0 ||
    candidate.maxRouteGradeDeg >= 89 ||
    !Number.isFinite(candidate.roughnessScaleM) ||
    candidate.roughnessScaleM <= 0 ||
    !Number.isFinite(candidate.nominalWalkingSpeedMps) ||
    candidate.nominalWalkingSpeedMps <= 0
  ) {
    throw new Error(`Invalid ConstraintProfile parameters for '${candidate.profileId}'.`);
  }
  return candidate;
}

export function isProfileDirectionallySymmetric(profile: ConstraintProfile): boolean {
  const up = profile.maxUphillGradeDeg ?? profile.maxRouteGradeDeg;
  const down = profile.maxDownhillGradeDeg ?? profile.maxRouteGradeDeg;
  return (
    Math.abs(up - profile.maxRouteGradeDeg) <= 1e-12 &&
    Math.abs(down - profile.maxRouteGradeDeg) <= 1e-12
  );
}
