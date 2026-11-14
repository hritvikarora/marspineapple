import type {
  ConstraintProfile,
  LocalMeterPoint,
  NormalizedGridPoint,
  RegionRoutingBundle,
  RouteRequest,
  RouteResponse,
} from '../contracts/routing.js';
import type { CellAdmissibilityPort } from './types.js';

type InvalidInputError = Extract<RouteResponse, { status: 'invalid_input' }>;

export type EndpointValidationResult =
  | {
      ok: true;
      start: NormalizedGridPoint;
      destination: NormalizedGridPoint;
      isSameCell: boolean;
    }
  | {
      ok: false;
      error: InvalidInputError;
    };

function normalizeLocalMeterPoint(
  point: LocalMeterPoint,
  width: number,
  height: number,
  dx: number,
  dy: number
): NormalizedGridPoint | null {
  const maxEastM = width * dx;
  const maxNorthM = height * dy;
  if (
    !Number.isFinite(point.eastM) ||
    !Number.isFinite(point.northM) ||
    point.eastM < 0 ||
    point.eastM > maxEastM ||
    point.northM < 0 ||
    point.northM > maxNorthM
  ) {
    return null;
  }
  const col = Math.min(width - 1, Math.max(0, Math.floor(point.eastM / dx)));
  const row = Math.min(height - 1, Math.max(0, Math.floor((maxNorthM - point.northM) / dy)));
  return {
    requestedEastM: point.eastM,
    requestedNorthM: point.northM,
    col,
    row,
    cellIndex: row * width + col,
    cellCenterEastM: (col + 0.5) * dx,
    cellCenterNorthM: (height - 1 - row + 0.5) * dy,
  };
}

export function normalizeAndValidateEndpoints(
  request: RouteRequest,
  bundle: RegionRoutingBundle,
  profile: ConstraintProfile,
  cellAdmissibility: CellAdmissibilityPort
): EndpointValidationResult {
  if (!request.policies || request.policies.length === 0) {
    return {
      ok: false,
      error: {
        status: 'invalid_input',
        requestId: request.requestId,
        endpoint: 'request',
        reasonCode: 'EMPTY_POLICIES',
        message: 'At least one routing policy must be specified.',
      },
    };
  }

  const { gridWidth, gridHeight, cellSpacingEastM, cellSpacingNorthM } = bundle;
  if (
    !Number.isInteger(gridWidth) ||
    !Number.isInteger(gridHeight) ||
    gridWidth <= 0 ||
    gridHeight <= 0 ||
    !Number.isFinite(cellSpacingEastM) ||
    !Number.isFinite(cellSpacingNorthM) ||
    cellSpacingEastM <= 0 ||
    cellSpacingNorthM <= 0
  ) {
    return {
      ok: false,
      error: {
        status: 'invalid_input',
        requestId: request.requestId,
        endpoint: 'request',
        reasonCode: 'INVALID_DIMENSIONS',
        message: 'Region routing bundle has invalid grid dimensions or spacing.',
      },
    };
  }

  const start = normalizeLocalMeterPoint(
    request.start,
    gridWidth,
    gridHeight,
    cellSpacingEastM,
    cellSpacingNorthM
  );
  if (!start) {
    return {
      ok: false,
      error: {
        status: 'invalid_input',
        requestId: request.requestId,
        endpoint: 'start',
        reasonCode: 'OUT_OF_BOUNDS',
        message: `Start point (${request.start.eastM}, ${request.start.northM}) lies outside [0, ${gridWidth * cellSpacingEastM}] x [0, ${gridHeight * cellSpacingNorthM}] m.`,
      },
    };
  }

  const destination = normalizeLocalMeterPoint(
    request.destination,
    gridWidth,
    gridHeight,
    cellSpacingEastM,
    cellSpacingNorthM
  );
  if (!destination) {
    return {
      ok: false,
      error: {
        status: 'invalid_input',
        requestId: request.requestId,
        endpoint: 'destination',
        reasonCode: 'OUT_OF_BOUNDS',
        message: `Destination point (${request.destination.eastM}, ${request.destination.northM}) lies outside [0, ${gridWidth * cellSpacingEastM}] x [0, ${gridHeight * cellSpacingNorthM}] m.`,
      },
    };
  }

  // Stage 5: Endpoint admissibility MUST run before Stage 6 same-cell shortcut
  const startExclusion = cellAdmissibility.getCellExclusionReason(
    bundle,
    start.row,
    start.col,
    profile,
    request.qualityMode
  );
  if (startExclusion !== null) {
    return {
      ok: false,
      error: {
        status: 'invalid_input',
        requestId: request.requestId,
        endpoint: 'start',
        reasonCode: startExclusion,
        message: `Start cell (${start.row}, ${start.col}) is excluded: ${startExclusion}.`,
      },
    };
  }

  const destExclusion = cellAdmissibility.getCellExclusionReason(
    bundle,
    destination.row,
    destination.col,
    profile,
    request.qualityMode
  );
  if (destExclusion !== null) {
    return {
      ok: false,
      error: {
        status: 'invalid_input',
        requestId: request.requestId,
        endpoint: 'destination',
        reasonCode: destExclusion,
        message: `Destination cell (${destination.row}, ${destination.col}) is excluded: ${destExclusion}.`,
      },
    };
  }

  // Stage 6: Same-cell check only after both endpoints pass Stage 5
  const isSameCell = start.cellIndex === destination.cellIndex;
  return {
    ok: true,
    start,
    destination,
    isSameCell,
  };
}
