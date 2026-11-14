import { describe, expect, it } from 'vitest';
import {
  QUALITY_CODE,
  type ConstraintProfile,
  type RegionRoutingBundle,
  type RouteRequest,
} from '../../src/contracts/routing.js';
import type { CellAdmissibilityPort } from '../../src/routing/types.js';
import { normalizeAndValidateEndpoints } from '../../src/routing/endpoints.js';

const BASE_PROFILE: ConstraintProfile = {
  profileId: 'educational-eva-v1',
  version: '1.0.0',
  maxTerrainSlopeDeg: 20,
  maxRouteGradeDeg: 20,
  roughnessScaleM: 0.5,
  nominalWalkingSpeedMps: 1.0,
  gradePenaltyKappa: 2.0,
  isSimulatedAssumption: true,
};

function make5x5Bundle(overrides?: Partial<RegionRoutingBundle>): RegionRoutingBundle {
  const n = 25;
  return {
    regionId: 'jezero-test',
    datasetVersion: '1',
    gridWidth: 5,
    gridHeight: 5,
    cellSpacingEastM: 5,
    cellSpacingNorthM: 5,
    noDataSentinel: -32768,
    roughnessScaleM: 0.5,
    qualityMappingVersion: '1',
    elevationM: new Float32Array(n).fill(-2540),
    terrainSlopeDeg: new Float32Array(n).fill(0),
    roughnessNormalized: new Float32Array(n).fill(0),
    qualityCode: new Uint8Array(n).fill(QUALITY_CODE.ACCEPTABLE),
    ...overrides,
  };
}

function makeRequest(overrides?: Partial<RouteRequest>): RouteRequest {
  return {
    requestId: 'req-1',
    regionId: 'jezero-test',
    datasetVersion: '1',
    start: { eastM: 11.1, northM: 14.2 },
    destination: { eastM: 13.9, northM: 10.4 },
    policies: ['shortest'],
    qualityMode: 'prefer',
    ...overrides,
  };
}

const stubCellAdmissibility: CellAdmissibilityPort = {
  getCellExclusionReason(bundle, row, col, profile, qualityMode) {
    if (row < 0 || row >= bundle.gridHeight || col < 0 || col >= bundle.gridWidth) {
      return 'OUT_OF_BOUNDS';
    }
    const k = row * bundle.gridWidth + col;
    if (!Number.isFinite(bundle.elevationM[k]) || bundle.elevationM[k] === bundle.noDataSentinel) {
      return 'NO_DATA';
    }
    const q = bundle.qualityCode[k];
    if (q === QUALITY_CODE.INVALID) {
      return 'INTERPOLATED_OR_UNRELIABLE';
    }
    if (bundle.terrainSlopeDeg[k] > profile.maxTerrainSlopeDeg) {
      return 'MAX_TERRAIN_SLOPE_EXCEEDED';
    }
    if (qualityMode === 'strict' && q !== QUALITY_CODE.ACCEPTABLE) {
      return 'STRICT_QUALITY_EXCLUDED';
    }
    return null;
  },
};

describe('T10: Endpoint Normalization & Pre-Shortcut Validation Stage', () => {
  it('Fixture F05 Subtest A: normalizes same-cell endpoints (11.1, 14.2) & (13.9, 10.4) to (2, 2, k=12) with isSameCell=true', () => {
    const bundle = make5x5Bundle();
    const req = makeRequest();
    const res = normalizeAndValidateEndpoints(req, bundle, BASE_PROFILE, stubCellAdmissibility);

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.isSameCell).toBe(true);
      expect(res.start.row).toBe(2);
      expect(res.start.col).toBe(2);
      expect(res.start.cellIndex).toBe(12);
      expect(res.destination.row).toBe(2);
      expect(res.destination.col).toBe(2);
      expect(res.destination.cellIndex).toBe(12);
    }
  });

  it('Fixture F05 Subtest B (Finding 3): rejects same-cell request when k=12 has INVALID quality even in prefer mode', () => {
    const qualityCode = new Uint8Array(25).fill(QUALITY_CODE.ACCEPTABLE);
    qualityCode[12] = QUALITY_CODE.INVALID;
    const bundle = make5x5Bundle({ qualityCode });
    const req = makeRequest({ qualityMode: 'prefer' });

    const res = normalizeAndValidateEndpoints(req, bundle, BASE_PROFILE, stubCellAdmissibility);
    expect(res).toEqual({
      ok: false,
      error: {
        status: 'invalid_input',
        requestId: 'req-1',
        endpoint: 'start',
        reasonCode: 'INTERPOLATED_OR_UNRELIABLE',
        message: expect.any(String),
      },
    });
  });

  it('rejects empty policies, out-of-bounds endpoints, and excluded destination', () => {
    const bundle = make5x5Bundle();

    const emptyPol = normalizeAndValidateEndpoints(
      makeRequest({ policies: [] }),
      bundle,
      BASE_PROFILE,
      stubCellAdmissibility
    );
    expect(emptyPol.ok).toBe(false);
    if (!emptyPol.ok) {
      expect(emptyPol.error.endpoint).toBe('request');
      expect(emptyPol.error.reasonCode).toBe('EMPTY_POLICIES');
    }

    const oobDest = normalizeAndValidateEndpoints(
      makeRequest({ destination: { eastM: 25.1, northM: 10 } }),
      bundle,
      BASE_PROFILE,
      stubCellAdmissibility
    );
    expect(oobDest.ok).toBe(false);
    if (!oobDest.ok) {
      expect(oobDest.error.endpoint).toBe('destination');
      expect(oobDest.error.reasonCode).toBe('OUT_OF_BOUNDS');
    }

    const slope = new Float32Array(25).fill(0);
    slope[4] = 25; // NE corner (row=0, col=4)
    const steepDest = normalizeAndValidateEndpoints(
      makeRequest({ destination: { eastM: 25.0, northM: 25.0 } }),
      make5x5Bundle({ terrainSlopeDeg: slope }),
      BASE_PROFILE,
      stubCellAdmissibility
    );
    expect(steepDest.ok).toBe(false);
    if (!steepDest.ok) {
      expect(steepDest.error.endpoint).toBe('destination');
      expect(steepDest.error.reasonCode).toBe('MAX_TERRAIN_SLOPE_EXCEEDED');
    }
  });
});
