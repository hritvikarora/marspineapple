import { describe, it, expect } from 'vitest';
import {
  validateRegionBundle,
  validateRequestAgainstBundle,
} from '../../src/routing/bundleValidator.js';
import type { RegionRoutingBundle, RouteRequest } from '../../src/contracts/routing.js';

function makeValidBundle(width = 5, height = 5): RegionRoutingBundle {
  const n = width * height;
  return {
    regionId: 'jezero-north',
    datasetVersion: 'v1.0.0',
    gridWidth: width,
    gridHeight: height,
    cellSpacingEastM: 2,
    cellSpacingNorthM: 2,
    roughnessScaleM: 0.5,
    noDataSentinel: -9999,
    qualityMappingVersion: '1.0',
    elevationM: new Float32Array(n),
    terrainSlopeDeg: new Float32Array(n),
    roughnessNormalized: new Float32Array(n),
    qualityCode: new Uint8Array(n),
  };
}

function makeRequest(overrides: Partial<RouteRequest> = {}): RouteRequest {
  return {
    requestId: 'req-1',
    regionId: 'jezero-north',
    datasetVersion: 'v1.0.0',
    start: { eastM: 0, northM: 0 },
    destination: { eastM: 8, northM: 8 },
    profileId: 'educational-eva-v1',
    qualityMode: 'prefer',
    policies: ['shortest'],
    ...overrides,
  };
}

describe('T02: bundleValidator', () => {
  it('returns BUNDLE_NOT_LOADED for null or undefined bundle', () => {
    const resNull = validateRegionBundle(null, 'req-null');
    expect(resNull.ok).toBe(false);
    if (!resNull.ok) {
      expect(resNull.error.status).toBe('data_error');
      expect(resNull.error.reasonCode).toBe('BUNDLE_NOT_LOADED');
      expect(resNull.error.requestId).toBe('req-null');
    }

    const resUndef = validateRegionBundle(undefined);
    expect(resUndef.ok).toBe(false);
    if (!resUndef.ok) {
      expect(resUndef.error.reasonCode).toBe('BUNDLE_NOT_LOADED');
    }
  });

  it('returns INVALID_GRID_DIMENSIONS for non-positive width, height, or spacings', () => {
    for (const patch of [
      { gridWidth: 0 },
      { gridHeight: -1 },
      { cellSpacingEastM: 0 },
      { cellSpacingNorthM: -2 },
      { roughnessScaleM: 0 },
    ]) {
      const bundle = { ...makeValidBundle(), ...patch };
      const res = validateRegionBundle(bundle);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.reasonCode).toBe('INVALID_GRID_DIMENSIONS');
      }
    }
  });

  it('returns ARRAY_LENGTH_MISMATCH for truncated elevationM or optional masks', () => {
    const bundle = makeValidBundle(5, 5);
    bundle.elevationM = new Float32Array(24);
    const res = validateRegionBundle(bundle);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.reasonCode).toBe('ARRAY_LENGTH_MISMATCH');
    }

    const bundleOpt = makeValidBundle(5, 5);
    bundleOpt.explicitExclusionMask = new Uint8Array(24);
    const resOpt = validateRegionBundle(bundleOpt);
    expect(resOpt.ok).toBe(false);
    if (!resOpt.ok) {
      expect(resOpt.error.reasonCode).toBe('ARRAY_LENGTH_MISMATCH');
    }
  });

  it('returns REGION_MISMATCH and DATASET_VERSION_MISMATCH when request differs from bundle', () => {
    const bundle = makeValidBundle(5, 5);
    const resRegion = validateRequestAgainstBundle(
      makeRequest({ regionId: 'other-region' }),
      bundle
    );
    expect(resRegion.ok).toBe(false);
    if (!resRegion.ok) {
      expect(resRegion.error.reasonCode).toBe('REGION_MISMATCH');
    }

    const resVersion = validateRequestAgainstBundle(
      makeRequest({ datasetVersion: 'v9.9.9' }),
      bundle
    );
    expect(resVersion.ok).toBe(false);
    if (!resVersion.ok) {
      expect(resVersion.error.reasonCode).toBe('DATASET_VERSION_MISMATCH');
    }
  });

  it('passes valid 5x5 bundle with cellCount === 25', () => {
    const bundle = makeValidBundle(5, 5);
    const res = validateRegionBundle(bundle);
    expect(res).toEqual({ ok: true, cellCount: 25 });

    const reqRes = validateRequestAgainstBundle(makeRequest(), bundle);
    expect(reqRes).toEqual({ ok: true, cellCount: 25 });
  });
});
