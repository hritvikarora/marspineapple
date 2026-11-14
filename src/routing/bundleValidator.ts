import type { RegionRoutingBundle, RouteRequest, RouteResponse } from '../contracts/routing.js';

export type BundleValidationOutcome =
  | { ok: true; cellCount: number }
  | { ok: false; error: Extract<RouteResponse, { status: 'data_error' }> };

export function validateRegionBundle(
  bundle: RegionRoutingBundle | null | undefined,
  requestId = 'bundle-load'
): BundleValidationOutcome {
  if (!bundle) {
    return {
      ok: false,
      error: {
        status: 'data_error',
        requestId,
        reasonCode: 'BUNDLE_NOT_LOADED',
        message: 'No RegionRoutingBundle is currently loaded in the routing engine.',
      },
    };
  }
  const { gridWidth, gridHeight, cellSpacingEastM, cellSpacingNorthM, roughnessScaleM } = bundle;
  if (
    !Number.isInteger(gridWidth) ||
    gridWidth <= 0 ||
    !Number.isInteger(gridHeight) ||
    gridHeight <= 0 ||
    !Number.isFinite(cellSpacingEastM) ||
    cellSpacingEastM <= 0 ||
    !Number.isFinite(cellSpacingNorthM) ||
    cellSpacingNorthM <= 0 ||
    !Number.isFinite(roughnessScaleM) ||
    roughnessScaleM <= 0
  ) {
    return {
      ok: false,
      error: {
        status: 'data_error',
        requestId,
        reasonCode: 'INVALID_GRID_DIMENSIONS',
        message: `Invalid grid dimensions or spacing: width=${gridWidth}, height=${gridHeight}, dx=${cellSpacingEastM}, dy=${cellSpacingNorthM}, roughnessScaleM=${roughnessScaleM}.`,
      },
    };
  }
  const expectedCells = gridWidth * gridHeight;
  const requiredArrays: Array<[string, { length: number } | undefined]> = [
    ['elevationM', bundle.elevationM],
    ['terrainSlopeDeg', bundle.terrainSlopeDeg],
    ['roughnessNormalized', bundle.roughnessNormalized],
    ['qualityCode', bundle.qualityCode],
    ['derivativeSupportMask', bundle.derivativeSupportMask],
    ['explicitExclusionMask', bundle.explicitExclusionMask],
    ['sourceFomCode', bundle.sourceFomCode],
  ];
  for (const [name, arr] of requiredArrays) {
    if (arr !== undefined && arr.length !== expectedCells) {
      return {
        ok: false,
        error: {
          status: 'data_error',
          requestId,
          reasonCode: 'ARRAY_LENGTH_MISMATCH',
          message: `Bundle array '${name}' has length ${arr.length}, expected ${expectedCells} (${gridWidth}x${gridHeight}).`,
        },
      };
    }
  }
  return { ok: true, cellCount: expectedCells };
}

export function validateRequestAgainstBundle(
  request: RouteRequest,
  bundle: RegionRoutingBundle | null | undefined
): BundleValidationOutcome {
  const baseCheck = validateRegionBundle(bundle, request.requestId);
  if (!baseCheck.ok || !bundle) return baseCheck;
  if (request.regionId !== bundle.regionId) {
    return {
      ok: false,
      error: {
        status: 'data_error',
        requestId: request.requestId,
        reasonCode: 'REGION_MISMATCH',
        message: `Request regionId '${request.regionId}' does not match loaded bundle '${bundle.regionId}'.`,
      },
    };
  }
  if (request.datasetVersion !== bundle.datasetVersion) {
    return {
      ok: false,
      error: {
        status: 'data_error',
        requestId: request.requestId,
        reasonCode: 'DATASET_VERSION_MISMATCH',
        message: `Request datasetVersion '${request.datasetVersion}' does not match loaded bundle '${bundle.datasetVersion}'.`,
      },
    };
  }
  return baseCheck;
}
