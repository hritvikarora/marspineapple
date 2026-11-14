import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PROFILE_ID,
  CONSTRAINT_PROFILES,
  resolveConstraintProfile,
  isProfileDirectionallySymmetric,
} from '../../src/routing/profiles.js';

describe('T04: profiles', () => {
  it('resolves default profile to educational-eva-v1', () => {
    const profile = resolveConstraintProfile();
    expect(profile.profileId).toBe(DEFAULT_PROFILE_ID);
    expect(profile.maxTerrainSlopeDeg).toBe(20);
    expect(profile.maxRouteGradeDeg).toBe(20);
    expect(profile.nominalWalkingSpeedMps).toBe(0.5);
    expect(profile.gradePenaltyKappa).toBe(1.5);
    expect(profile.isSimulatedAssumption).toBe(true);
  });

  it('provides conservative-15deg and relaxed-25deg presets', () => {
    const conservative = resolveConstraintProfile('conservative-15deg');
    expect(conservative.maxTerrainSlopeDeg).toBe(15);
    expect(conservative.maxRouteGradeDeg).toBe(15);

    const relaxed = resolveConstraintProfile('relaxed-25deg');
    expect(relaxed.maxTerrainSlopeDeg).toBe(25);
    expect(relaxed.maxRouteGradeDeg).toBe(25);
  });

  it('rejects invalid custom profile parameters', () => {
    const base = CONSTRAINT_PROFILES[DEFAULT_PROFILE_ID];
    expect(() =>
      resolveConstraintProfile(undefined, { ...base, maxTerrainSlopeDeg: 0 })
    ).toThrow();
    expect(() =>
      resolveConstraintProfile(undefined, { ...base, maxRouteGradeDeg: 89 })
    ).toThrow();
    expect(() =>
      resolveConstraintProfile(undefined, { ...base, nominalWalkingSpeedMps: -1 })
    ).toThrow();
  });

  it('detects symmetric vs asymmetric uphill/downhill profiles', () => {
    const base = CONSTRAINT_PROFILES[DEFAULT_PROFILE_ID];
    expect(isProfileDirectionallySymmetric(base)).toBe(true);
    expect(
      isProfileDirectionallySymmetric({
        ...base,
        maxUphillGradeDeg: 20,
        maxDownhillGradeDeg: 20,
      })
    ).toBe(true);
    expect(
      isProfileDirectionallySymmetric({
        ...base,
        maxUphillGradeDeg: 15,
        maxDownhillGradeDeg: 20,
      })
    ).toBe(false);
  });
});
