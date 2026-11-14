import { QUALITY_CODE, type ConstraintProfile, type QualityCode } from '../contracts/routing.js';
import { BinaryMinHeap } from './binaryHeap.js';
import { resolveConstraintProfile } from './profiles.js';
import {
  DIR_COUNT,
  DIR_DC,
  DIR_DR,
  DIR_IS_DIAG,
  NOMINAL_POLICY_WEIGHTS,
  QUALITY_PENALTY_BY_CODE,
} from './types.js';
import { SolverWorkspace } from './workspace.js';

export const MODEL_VERSION = 'eva-astar-1.0.0';

/**
 * Translates marspineapple's `quality.u8` codes
 * (`0=NO_ELEVATION, 1=GOOD, 2=LOW, 3=UNKNOWN`)
 * into internal `QUALITY_CODE` values
 * (`0=ACCEPTABLE, 1=UNKNOWN, 2=LOW, 3=INVALID`).
 */
export const MAP_MARSPINEAPPLE_QUALITY_TO_INTERNAL = new Uint8Array([3, 0, 2, 1]);

/**
 * Translates internal `QUALITY_CODE` values
 * (`0=ACCEPTABLE, 1=UNKNOWN, 2=LOW, 3=INVALID`)
 * back into marspineapple's `quality.u8` codes
 * (`0=NO_ELEVATION, 1=GOOD, 2=LOW, 3=UNKNOWN`).
 */
export const MAP_INTERNAL_QUALITY_TO_MARSPINEAPPLE = new Uint8Array([1, 3, 2, 0]);

export const ROUTE_POLICIES_ORDER = [
  'shortest-feasible',
  'terrain-aware',
  'uncertainty-aware',
] as const;

export type MarsRoutePolicyId = (typeof ROUTE_POLICIES_ORDER)[number];

export interface MarsLocalPoint {
  east_m: number;
  north_m: number;
}

export interface MarsLocalPoint3 extends MarsLocalPoint {
  elevation_m: number;
}

export interface MarsCellRef {
  row: number;
  col: number;
  index: number;
}

export interface MarsExtent {
  west_m: number;
  east_m: number;
  south_m: number;
  north_m: number;
}

export interface MarsGridSpec {
  width: number;
  height: number;
  cellSizeEast_m: number;
  cellSizeNorth_m: number;
  extent: MarsExtent;
  orientation: 'north-up';
  order: 'row-major';
  sampleConvention: 'cell-center';
}

export interface MarsPolicyWeights {
  slope: number;
  roughness: number;
  quality: number;
}

export interface MarsRouteRequest {
  requestId: string;
  bundleVersion: string;
  modelVersion: string;
  start: MarsLocalPoint;
  destination: MarsLocalPoint;
  policies: MarsRoutePolicyId[];
  weightOverrides?: Partial<Record<MarsRoutePolicyId, MarsPolicyWeights>>;
  strictQuality: boolean;
  roundTrip: boolean;
  timeoutMs?: number;
}

export interface MarsEndpointResolution {
  requested: MarsLocalPoint;
  cell: MarsCellRef;
  accepted: MarsLocalPoint;
}

export interface MarsRouteMetrics {
  horizontalDistance_m: number;
  surfaceDistance_m: number;
  ascent_m: number;
  descent_m: number;
  maxTerrainSlope_deg: number;
  maxAbsEdgeGrade_deg: number;
  lowQualityLength_m: number;
  lowQualityPct: number;
  unknownQualityLength_m: number;
  unknownQualityPct: number;
  cellCount: number;
}

export interface MarsQualityInterval {
  fromDistance_m: number;
  toDistance_m: number;
  quality: 0 | 1 | 2 | 3;
}

export interface MarsElevationProfile {
  distance_m: number[];
  elevation_m: number[];
  pathIndex: number[];
}

export interface MarsRouteLeg {
  cells: number[];
  path: MarsLocalPoint3[];
  metrics: MarsRouteMetrics;
  qualityIntervals: MarsQualityInterval[];
  profile: MarsElevationProfile;
  weightedCost: { value: number; units: 'weighted-cost' };
}

export interface MarsRouteCandidate {
  candidateId: string;
  policies: MarsRoutePolicyId[];
  outbound: MarsRouteLeg;
  returnLeg: MarsRouteLeg | null;
  missionStatus: 'one-way' | 'round-trip-complete' | 'round-trip-incomplete';
  explanation: string[];
}

export type MarsInvalidInputReason =
  | 'version-mismatch'
  | 'model-mismatch'
  | 'bundle-not-loaded'
  | 'endpoint-outside-region'
  | 'endpoint-excluded'
  | 'endpoint-quality-excluded'
  | 'no-policies'
  | 'strict-quality-unsupported'
  | 'malformed';

export type MarsNoPathReason =
  | 'disconnected-under-limits'
  | 'strict-quality-disconnects'
  | 'unknown';

export type MarsRouteFinalResponse =
  | {
      requestId: string;
      bundleVersion: string;
      modelVersion: string;
      status: 'success';
      start: MarsEndpointResolution;
      destination: MarsEndpointResolution;
      candidates: MarsRouteCandidate[];
      computeMs: number;
    }
  | {
      requestId: string;
      bundleVersion: string;
      modelVersion: string;
      status: 'no-path';
      reason: MarsNoPathReason;
      message: string;
      start: MarsEndpointResolution;
      destination: MarsEndpointResolution;
      policies: MarsRoutePolicyId[];
    }
  | {
      requestId: string;
      bundleVersion: string;
      modelVersion: string;
      status: 'invalid-input';
      reason: MarsInvalidInputReason;
      field: string | null;
      message: string;
    }
  | {
      requestId: string;
      bundleVersion: string;
      modelVersion: string;
      status: 'cancelled';
    }
  | {
      requestId: string;
      bundleVersion: string;
      modelVersion: string;
      status: 'timeout';
      limitMs: number;
      message: string;
    }
  | {
      requestId: string;
      bundleVersion: string;
      modelVersion: string;
      status: 'data-error';
      stage: 'bundle' | 'reconstruction' | 'worker-crash' | 'internal';
      message: string;
    };

export interface MarsRoutingGrid {
  manifest: {
    strictQualitySupported: boolean;
    grid: MarsGridSpec;
  };
  bundleVersion: string;
  elevation: Float32Array;
  slope: Float32Array;
  roughness: Float32Array;
  quality: Uint8Array;
  exclusion: Uint8Array;
}

export interface MarsSolveHooks {
  shouldStop?: () => 'cancelled' | 'timeout' | null;
  onProgress?: (exploredNodes: number) => void;
  now?: () => number;
}

class AbortSearchSignal {
  constructor(readonly kind: 'cancelled' | 'timeout') {}
}

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

let sharedWorkspace: SolverWorkspace | null = null;

function acquireWorkspace(capacity: number): SolverWorkspace {
  if (!sharedWorkspace || sharedWorkspace.capacity < capacity) {
    sharedWorkspace = new SolverWorkspace(capacity);
  }
  return sharedWorkspace;
}

function pointToMarsCell(grid: MarsGridSpec, point: MarsLocalPoint): MarsCellRef | null {
  if (!Number.isFinite(point.east_m) || !Number.isFinite(point.north_m)) {
    return null;
  }
  const col = Math.floor((point.east_m - grid.extent.west_m) / grid.cellSizeEast_m);
  const row = Math.floor((grid.extent.north_m - point.north_m) / grid.cellSizeNorth_m);
  if (col < 0 || row < 0 || col >= grid.width || row >= grid.height) {
    return null;
  }
  return { row, col, index: row * grid.width + col };
}

function marsCellCenter(grid: MarsGridSpec, row: number, col: number): MarsLocalPoint {
  return {
    east_m: grid.extent.west_m + (col + 0.5) * grid.cellSizeEast_m,
    north_m: grid.extent.north_m - (row + 0.5) * grid.cellSizeNorth_m,
  };
}

function resolveMarsEndpoint(grid: MarsGridSpec, point: MarsLocalPoint): MarsEndpointResolution | null {
  const cell = pointToMarsCell(grid, point);
  if (!cell) return null;
  return {
    requested: { east_m: point.east_m, north_m: point.north_m },
    cell,
    accepted: marsCellCenter(grid, cell.row, cell.col),
  };
}

function toInternalQuality(rawCode: number): QualityCode {
  if (rawCode >= 0 && rawCode < MAP_MARSPINEAPPLE_QUALITY_TO_INTERNAL.length) {
    return MAP_MARSPINEAPPLE_QUALITY_TO_INTERNAL[rawCode] as QualityCode;
  }
  return QUALITY_CODE.INVALID;
}

function qualityPenaltyFromRaw(rawCode: number): number {
  return QUALITY_PENALTY_BY_CODE[toInternalQuality(rawCode)];
}

function worseInternalQuality(a: QualityCode, b: QualityCode): QualityCode {
  const pa = QUALITY_PENALTY_BY_CODE[a];
  const pb = QUALITY_PENALTY_BY_CODE[b];
  return pa >= pb ? a : b;
}

function isBaseCellAdmissible(
  grid: MarsRoutingGrid,
  idx: number,
  maxSlopeDeg: number
): boolean {
  if (grid.exclusion[idx] !== 0) return false;
  const z = grid.elevation[idx];
  const s = grid.slope[idx];
  const r = grid.roughness[idx];
  if (!Number.isFinite(z) || !Number.isFinite(s) || !Number.isFinite(r)) return false;
  if (s > maxSlopeDeg) return false;
  return toInternalQuality(grid.quality[idx]) !== QUALITY_CODE.INVALID;
}

function getCornerAwareStepQuality(
  grid: MarsRoutingGrid,
  uIndex: number,
  vIndex: number
): { worstInternal: QualityCode; maxPenalty: number } {
  const width = grid.manifest.grid.width;
  const uRow = Math.floor(uIndex / width);
  const uCol = uIndex - uRow * width;
  const vRow = Math.floor(vIndex / width);
  const vCol = vIndex - vRow * width;

  let worst = worseInternalQuality(
    toInternalQuality(grid.quality[uIndex]),
    toInternalQuality(grid.quality[vIndex])
  );
  if (uRow !== vRow && uCol !== vCol) {
    worst = worseInternalQuality(worst, toInternalQuality(grid.quality[uRow * width + vCol]));
    worst = worseInternalQuality(worst, toInternalQuality(grid.quality[vRow * width + uCol]));
  }
  return {
    worstInternal: worst,
    maxPenalty: QUALITY_PENALTY_BY_CODE[worst],
  };
}

function pathHasZeroQualityPenalty(grid: MarsRoutingGrid, cells: number[]): boolean {
  if (cells.length === 0) return true;
  if (cells.length === 1) {
    return qualityPenaltyFromRaw(grid.quality[cells[0]!]) === 0;
  }
  for (let i = 1; i < cells.length; i++) {
    const { maxPenalty } = getCornerAwareStepQuality(grid, cells[i - 1]!, cells[i]!);
    if (maxPenalty > 0) return false;
  }
  return true;
}

interface InternalSearchResult {
  cells: number[];
  cost: number;
}

function runAStar(
  grid: MarsRoutingGrid,
  workspace: SolverWorkspace,
  admissible: Uint8Array,
  fromIndex: number,
  toIndex: number,
  profile: ConstraintProfile,
  weights: MarsPolicyWeights,
  hooks: MarsSolveHooks,
  explored: { n: number }
): InternalSearchResult | null {
  if (fromIndex === toIndex) {
    return { cells: [fromIndex], cost: 0 };
  }

  const width = grid.manifest.grid.width;
  const height = grid.manifest.grid.height;
  const totalCells = width * height;
  const dx = grid.manifest.grid.cellSizeEast_m;
  const dy = grid.manifest.grid.cellSizeNorth_m;
  const diagDist = Math.hypot(dx, dy);
  const maxGradeTan = Math.tan(profile.maxRouteGradeDeg * DEG_TO_RAD);

  const searchId = workspace.beginSearch();
  const heap = new BinaryMinHeap(
    workspace.heapNodes,
    workspace.heapPos,
    workspace.fScore,
    workspace.gScore,
    workspace.crossScore
  );

  const startRow = Math.floor(fromIndex / width);
  const startCol = fromIndex - startRow * width;
  const goalRow = Math.floor(toIndex / width);
  const goalCol = toIndex - goalRow * width;

  const startGoalDx = (goalCol - startCol) * dx;
  const startGoalDy = (startRow - goalRow) * dy;
  const startGoalNorm = Math.max(1, Math.hypot(startGoalDx, startGoalDy));

  const computeHeuristic = (row: number, col: number): number =>
    Math.hypot((col - goalCol) * dx, (goalRow - row) * dy);

  const computeCross = (row: number, col: number): number => {
    const vx = (col - startCol) * dx;
    const vy = (startRow - row) * dy;
    return (Math.abs(vx * startGoalDy - startGoalDx * vy) / startGoalNorm) * 1e-6;
  };

  workspace.seenStamp[fromIndex] = searchId;
  workspace.gScore[fromIndex] = 0;
  workspace.fScore[fromIndex] = computeHeuristic(startRow, startCol);
  workspace.crossScore[fromIndex] = 0;
  workspace.parentIndex[fromIndex] = -1;
  heap.pushOrDecreaseKey(fromIndex);

  try {
    while (heap.size > 0) {
      const u = heap.popMin();
      if (workspace.closedStamp[u] === searchId) continue;
      workspace.closedStamp[u] = searchId;
      explored.n++;

      if ((explored.n & 511) === 0) {
        const stop = hooks.shouldStop?.();
        if (stop) {
          throw new AbortSearchSignal(stop);
        }
        hooks.onProgress?.(explored.n);
      }

      if (u === toIndex) {
        const cells: number[] = [];
        let curr = toIndex;
        let steps = 0;
        while (curr !== -1) {
          cells.push(curr);
          if (curr === fromIndex) break;
          if (++steps > totalCells) {
            throw new Error('Predecessor cycle detected during path reconstruction.');
          }
          curr = workspace.parentIndex[curr];
        }
        if (cells[cells.length - 1] !== fromIndex) {
          throw new Error('Broken predecessor chain during path reconstruction.');
        }
        cells.reverse();
        return { cells, cost: workspace.gScore[toIndex] };
      }

      const ur = Math.floor(u / width);
      const uc = u - ur * width;
      const uG = workspace.gScore[u];
      const zu = grid.elevation[u];

      for (let dir = 0; dir < DIR_COUNT; dir++) {
        const dr = DIR_DR[dir];
        const dc = DIR_DC[dir];
        const vr = ur + dr;
        const vc = uc + dc;
        if (vr < 0 || vr >= height || vc < 0 || vc >= width) continue;

        const v = vr * width + vc;
        if (admissible[v] === 0 || workspace.closedStamp[v] === searchId) continue;

        const isDiag = DIR_IS_DIAG[dir] === 1;
        let stepQualityU = Math.max(
          qualityPenaltyFromRaw(grid.quality[u]),
          qualityPenaltyFromRaw(grid.quality[v])
        );
        if (isDiag) {
          const c1 = ur * width + vc;
          const c2 = vr * width + uc;
          if (admissible[c1] === 0 || admissible[c2] === 0) continue;
          stepQualityU = Math.max(
            stepQualityU,
            qualityPenaltyFromRaw(grid.quality[c1]),
            qualityPenaltyFromRaw(grid.quality[c2])
          );
        }

        const stepLen = isDiag ? diagDist : dr !== 0 ? dy : dx;
        const dz = Math.abs(grid.elevation[v] - zu);
        if (dz / stepLen > maxGradeTan) continue;

        const maxSlope = Math.max(grid.slope[u], grid.slope[v]);
        const sNorm = maxSlope / profile.maxTerrainSlopeDeg;
        const maxRough = Math.max(grid.roughness[u], grid.roughness[v]);
        const rNorm = Math.max(0, Math.min(1, maxRough / profile.roughnessScaleM));

        const edgeCost =
          stepLen * (1 + weights.slope * sNorm + weights.roughness * rNorm + weights.quality * stepQualityU);
        const candG = uG + edgeCost;

        if (workspace.seenStamp[v] !== searchId) {
          workspace.seenStamp[v] = searchId;
          workspace.gScore[v] = candG;
          workspace.fScore[v] = candG + computeHeuristic(vr, vc);
          workspace.crossScore[v] = computeCross(vr, vc);
          workspace.parentIndex[v] = u;
          heap.pushOrDecreaseKey(v);
        } else if (candG < workspace.gScore[v]) {
          const hv = workspace.fScore[v] - workspace.gScore[v];
          workspace.gScore[v] = candG;
          workspace.fScore[v] = candG + hv;
          workspace.parentIndex[v] = u;
          heap.pushOrDecreaseKey(v);
        }
      }
    }

    return null;
  } finally {
    heap.clear();
  }
}

function buildMarsLeg(
  grid: MarsRoutingGrid,
  cells: number[],
  totalCost: number
): MarsRouteLeg {
  const spec = grid.manifest.grid;
  const width = spec.width;
  const dx = spec.cellSizeEast_m;
  const dy = spec.cellSizeNorth_m;

  const path: MarsLocalPoint3[] = new Array(cells.length);
  const distanceM: number[] = new Array(cells.length);
  const elevationM: number[] = new Array(cells.length);
  const pathIndex: number[] = new Array(cells.length);
  const qualityIntervals: MarsQualityInterval[] = [];

  let horizontalDistance = 0;
  let surfaceDistance = 0;
  let ascent = 0;
  let descent = 0;
  let maxSlope = 0;
  let maxGradeDeg = 0;
  let lowLen = 0;
  let unkLen = 0;

  for (let k = 0; k < cells.length; k++) {
    const idx = cells[k]!;
    const row = Math.floor(idx / width);
    const col = idx - row * width;
    const center = marsCellCenter(spec, row, col);
    const z = grid.elevation[idx];
    path[k] = { east_m: center.east_m, north_m: center.north_m, elevation_m: z };
    elevationM[k] = z;
    pathIndex[k] = k;

    const s = grid.slope[idx];
    if (s > maxSlope) maxSlope = s;

    if (k === 0) {
      distanceM[0] = 0;
      continue;
    }

    const prevIdx = cells[k - 1]!;
    const prevRow = Math.floor(prevIdx / width);
    const prevCol = prevIdx - prevRow * width;
    const stepLen = Math.hypot((col - prevCol) * dx, (row - prevRow) * dy);
    const dz = z - grid.elevation[prevIdx];

    const fromDist = horizontalDistance;
    horizontalDistance += stepLen;
    surfaceDistance += Math.hypot(stepLen, dz);
    if (dz > 0) ascent += dz;
    else descent -= dz;

    const gradeDeg = Math.atan(Math.abs(dz) / stepLen) * RAD_TO_DEG;
    if (gradeDeg > maxGradeDeg) maxGradeDeg = gradeDeg;
    distanceM[k] = horizontalDistance;

    const { worstInternal } = getCornerAwareStepQuality(grid, prevIdx, idx);
    const marspineappleQuality = (
      MAP_INTERNAL_QUALITY_TO_MARSPINEAPPLE[worstInternal] ?? 3
    ) as 0 | 1 | 2 | 3;

    if (worstInternal === QUALITY_CODE.LOW) lowLen += stepLen;
    else if (worstInternal === QUALITY_CODE.UNKNOWN) unkLen += stepLen;

    const lastInterval = qualityIntervals[qualityIntervals.length - 1];
    if (lastInterval && lastInterval.quality === marspineappleQuality) {
      lastInterval.toDistance_m = horizontalDistance;
    } else {
      qualityIntervals.push({
        fromDistance_m: fromDist,
        toDistance_m: horizontalDistance,
        quality: marspineappleQuality,
      });
    }
  }

  return {
    cells,
    path,
    metrics: {
      horizontalDistance_m: horizontalDistance,
      surfaceDistance_m: surfaceDistance,
      ascent_m: ascent,
      descent_m: descent,
      maxTerrainSlope_deg: maxSlope,
      maxAbsEdgeGrade_deg: maxGradeDeg,
      lowQualityLength_m: lowLen,
      lowQualityPct: horizontalDistance > 0 ? (100 * lowLen) / horizontalDistance : 0,
      unknownQualityLength_m: unkLen,
      unknownQualityPct: horizontalDistance > 0 ? (100 * unkLen) / horizontalDistance : 0,
      cellCount: cells.length,
    },
    qualityIntervals,
    profile: {
      distance_m: distanceM,
      elevation_m: elevationM,
      pathIndex,
    },
    weightedCost: { value: totalCost, units: 'weighted-cost' },
  };
}

function buildExplanations(
  candidate: MarsRouteCandidate,
  allCandidates: MarsRouteCandidate[],
  uniformQualityOverride: boolean
): string[] {
  const out: string[] = [];
  const m = candidate.outbound.metrics;

  if (candidate.policies.length > 1) {
    out.push(`Identical path produced by: ${candidate.policies.join(', ')}.`);
  }
  if (m.cellCount === 1) {
    out.push('Start and destination lie in the same grid cell (zero-length route).');
  }
  if (uniformQualityOverride && candidate.policies.includes('uncertainty-aware')) {
    out.push(
      'Uniform quality across admissible terrain (no uncertainty differentiation; gamma_eff = 0).'
    );
  }

  for (const other of allCandidates) {
    if (other === candidate) continue;
    const om = other.outbound.metrics;
    const deltaDist = m.horizontalDistance_m - om.horizontalDistance_m;
    const deltaUnk = om.unknownQualityLength_m - m.unknownQualityLength_m;
    const deltaLow = om.lowQualityLength_m - m.lowQualityLength_m;

    if (Math.abs(deltaDist) <= 0.5) {
      if (deltaUnk + deltaLow > 0.5) {
        out.push(
          `Same horizontal length as ${other.candidateId} (~${m.horizontalDistance_m.toFixed(0)} m), avoiding ${(deltaUnk + deltaLow).toFixed(0)} m of degraded/unknown terrain.`
        );
      }
      continue;
    }

    if (deltaDist > 0 && deltaUnk > 0) {
      out.push(
        `+${deltaDist.toFixed(0)} m longer than ${other.candidateId} while reducing unknown-quality exposure by ${deltaUnk.toFixed(0)} m.`
      );
    } else if (deltaDist > 0 && om.maxTerrainSlope_deg - m.maxTerrainSlope_deg > 0.5) {
      out.push(
        `+${deltaDist.toFixed(0)} m longer than ${other.candidateId} to lower peak terrain slope from ${om.maxTerrainSlope_deg.toFixed(1)} deg to ${m.maxTerrainSlope_deg.toFixed(1)} deg.`
      );
    }
  }

  if (out.length === 0) {
    out.push(
      `EVA A* (${MODEL_VERSION}): ${m.horizontalDistance_m.toFixed(0)} m horizontal, max slope ${m.maxTerrainSlope_deg.toFixed(1)} deg.`
    );
  }

  return out;
}

function defaultPolicyWeights(policy: MarsRoutePolicyId, gammaEff: number): MarsPolicyWeights {
  if (policy === 'shortest-feasible') {
    const w = NOMINAL_POLICY_WEIGHTS.shortest;
    return { slope: w.alpha, roughness: w.beta, quality: w.gamma };
  }
  if (policy === 'terrain-aware') {
    const w = NOMINAL_POLICY_WEIGHTS.terrain;
    return { slope: w.alpha, roughness: w.beta, quality: w.gamma };
  }
  const w = NOMINAL_POLICY_WEIGHTS.uncertainty;
  return { slope: w.alpha, roughness: w.beta, quality: gammaEff };
}

function weightsMatch(a: MarsPolicyWeights, b: MarsPolicyWeights): boolean {
  return (
    Math.abs(a.slope - b.slope) <= 1e-12 &&
    Math.abs(a.roughness - b.roughness) <= 1e-12 &&
    Math.abs(a.quality - b.quality) <= 1e-12
  );
}

/**
 * Drop-in adapter implementing marspineapple's `solveRoute(grid, req, hooks)` contract
 * backed by the EVA A* solver, SolverWorkspace, BinaryMinHeap, anisotropic geometry,
 * uniform-quality gamma override (gamma_eff = 0), and subset policy deduplication.
 */
export function solveRoute(
  grid: MarsRoutingGrid | null,
  req: MarsRouteRequest,
  hooks: MarsSolveHooks = {}
): MarsRouteFinalResponse {
  const now = hooks.now ?? (() => Date.now());
  const t0 = now();
  const base = {
    requestId: req.requestId,
    bundleVersion: req.bundleVersion,
    modelVersion: MODEL_VERSION,
  };

  const invalid = (
    reason: MarsInvalidInputReason,
    field: string | null,
    message: string
  ): MarsRouteFinalResponse => ({
    ...base,
    status: 'invalid-input',
    reason,
    field,
    message,
  });

  if (!grid) {
    return invalid('bundle-not-loaded', null, 'No region bundle is loaded in the worker.');
  }
  if (req.bundleVersion !== grid.bundleVersion) {
    return invalid(
      'version-mismatch',
      'bundleVersion',
      `Request names bundle ${req.bundleVersion} but worker has ${grid.bundleVersion}.`
    );
  }
  if (req.modelVersion !== MODEL_VERSION) {
    return invalid(
      'model-mismatch',
      'modelVersion',
      `Request expects model ${req.modelVersion}; worker runs ${MODEL_VERSION}.`
    );
  }
  if (!Array.isArray(req.policies) || req.policies.length === 0) {
    return invalid('no-policies', 'policies', 'At least one route policy is required.');
  }
  if (req.strictQuality && !grid.manifest.strictQualitySupported) {
    return invalid(
      'strict-quality-unsupported',
      'strictQuality',
      'This bundle has no documented quality classes; strict quality mode is unavailable.'
    );
  }

  const gridSpec = grid.manifest.grid;
  const totalCells = gridSpec.width * gridSpec.height;
  if (
    totalCells <= 0 ||
    grid.elevation.length !== totalCells ||
    grid.slope.length !== totalCells ||
    grid.roughness.length !== totalCells ||
    grid.quality.length !== totalCells ||
    grid.exclusion.length !== totalCells
  ) {
    return invalid('malformed', null, 'Region bundle raster lengths do not match grid dimensions.');
  }

  const profile = resolveConstraintProfile('educational-eva-v1');
  const start = resolveMarsEndpoint(gridSpec, req.start);
  if (!start) {
    return invalid('endpoint-outside-region', 'start', 'Start point is outside the loaded region.');
  }
  const destination = resolveMarsEndpoint(gridSpec, req.destination);
  if (!destination) {
    return invalid(
      'endpoint-outside-region',
      'destination',
      'Destination point is outside the loaded region.'
    );
  }

  for (const [field, ep] of [
    ['start', start],
    ['destination', destination],
  ] as const) {
    const idx = ep.cell.index;
    if (!isBaseCellAdmissible(grid, idx, profile.maxTerrainSlopeDeg)) {
      return invalid(
        'endpoint-excluded',
        field,
        `${field} cell (row ${ep.cell.row}, col ${ep.cell.col}) is excluded (code ${grid.exclusion[idx]}, slope ${grid.slope[idx].toFixed(1)} deg).`
      );
    }
    if (req.strictQuality && grid.quality[idx] !== 1) {
      return invalid(
        'endpoint-quality-excluded',
        field,
        `${field} cell is outside the acceptable quality set in strict mode.`
      );
    }
  }

  const normalizedPolicies: MarsRoutePolicyId[] = [];
  for (const p of ROUTE_POLICIES_ORDER) {
    if (req.policies.includes(p)) {
      normalizedPolicies.push(p);
    }
  }
  if (normalizedPolicies.length === 0) {
    return invalid('no-policies', 'policies', 'No supported route policies specified.');
  }

  if (start.cell.index === destination.cell.index) {
    const cellIdx = start.cell.index;
    const zeroLeg = buildMarsLeg(grid, [cellIdx], 0);
    const returnZeroLeg = req.roundTrip ? buildMarsLeg(grid, [cellIdx], 0) : null;
    const sameCellCandidate: MarsRouteCandidate = {
      candidateId: 'c0',
      policies: [...normalizedPolicies],
      outbound: zeroLeg,
      returnLeg: returnZeroLeg,
      missionStatus: req.roundTrip ? 'round-trip-complete' : 'one-way',
      explanation: [],
    };
    sameCellCandidate.explanation = buildExplanations(sameCellCandidate, [sameCellCandidate], false);
    return {
      ...base,
      status: 'success',
      start,
      destination,
      candidates: [sameCellCandidate],
      computeMs: Math.max(0, now() - t0),
    };
  }

  const admissible = new Uint8Array(totalCells);
  let minPenalty = Number.POSITIVE_INFINITY;
  let maxPenalty = Number.NEGATIVE_INFINITY;
  let admissibleCount = 0;

  for (let i = 0; i < totalCells; i++) {
    if (!isBaseCellAdmissible(grid, i, profile.maxTerrainSlopeDeg)) continue;
    if (req.strictQuality && grid.quality[i] !== 1) continue;
    admissible[i] = 1;
    admissibleCount++;
    const pen = qualityPenaltyFromRaw(grid.quality[i]);
    if (pen < minPenalty) minPenalty = pen;
    if (pen > maxPenalty) maxPenalty = pen;
  }

  const uniformQualityOverride = admissibleCount > 0 && minPenalty === maxPenalty;
  const gammaNominal = uniformQualityOverride ? 0 : NOMINAL_POLICY_WEIGHTS.uncertainty.gamma;

  const evalOrder: MarsRoutePolicyId[] = [];
  for (const p of ['terrain-aware', 'uncertainty-aware', 'shortest-feasible'] as const) {
    if (normalizedPolicies.includes(p)) evalOrder.push(p);
  }

  const workspace = acquireWorkspace(totalCells);
  const explored = { n: 0 };

  interface PolicyRunRecord {
    policy: MarsRoutePolicyId;
    weights: MarsPolicyWeights;
    out: InternalSearchResult | null;
    back: InternalSearchResult | null;
  }

  const solvedByPolicy = new Map<MarsRoutePolicyId, PolicyRunRecord>();

  try {
    for (const policy of evalOrder) {
      const override = req.weightOverrides?.[policy];
      const baseWeights = defaultPolicyWeights(policy, gammaNominal);
      const weights: MarsPolicyWeights = override
        ? {
            slope: override.slope,
            roughness: override.roughness,
            quality:
              policy === 'uncertainty-aware' && uniformQualityOverride ? 0 : override.quality,
          }
        : baseWeights;

      // Uniform-quality or zero-quality-exposure reuse from terrain-aware
      const terrainRecord = solvedByPolicy.get('terrain-aware');
      if (
        policy === 'uncertainty-aware' &&
        terrainRecord &&
        terrainRecord.out &&
        weights.slope === terrainRecord.weights.slope &&
        weights.roughness === terrainRecord.weights.roughness &&
        (weights.quality === 0 ||
          (pathHasZeroQualityPenalty(grid, terrainRecord.out.cells) &&
            (!req.roundTrip ||
              !terrainRecord.back ||
              pathHasZeroQualityPenalty(grid, terrainRecord.back.cells))))
      ) {
        solvedByPolicy.set(policy, {
          policy,
          weights,
          out: { cells: terrainRecord.out.cells, cost: terrainRecord.out.cost },
          back: terrainRecord.back
            ? { cells: terrainRecord.back.cells, cost: terrainRecord.back.cost }
            : null,
        });
        continue;
      }

      // Reuse already solved identical weight vector (e.g., identical custom overrides)
      let matchedExisting: PolicyRunRecord | null = null;
      for (const prev of solvedByPolicy.values()) {
        if (weightsMatch(prev.weights, weights)) {
          matchedExisting = prev;
          break;
        }
      }
      if (matchedExisting) {
        solvedByPolicy.set(policy, {
          policy,
          weights,
          out: matchedExisting.out
            ? { cells: matchedExisting.out.cells, cost: matchedExisting.out.cost }
            : null,
          back: matchedExisting.back
            ? { cells: matchedExisting.back.cells, cost: matchedExisting.back.cost }
            : null,
        });
        continue;
      }

      const out = runAStar(
        grid,
        workspace,
        admissible,
        start.cell.index,
        destination.cell.index,
        profile,
        weights,
        hooks,
        explored
      );
      const back =
        out && req.roundTrip
          ? runAStar(
              grid,
              workspace,
              admissible,
              destination.cell.index,
              start.cell.index,
              profile,
              weights,
              hooks,
              explored
            )
          : null;

      solvedByPolicy.set(policy, { policy, weights, out, back });
    }

    const successfulRecords = normalizedPolicies
      .map((p) => solvedByPolicy.get(p)!)
      .filter((r) => r.out !== null);

    if (successfulRecords.length === 0) {
      let reason: MarsNoPathReason = 'disconnected-under-limits';
      if (req.strictQuality) {
        const relaxedAdmissible = new Uint8Array(totalCells);
        for (let i = 0; i < totalCells; i++) {
          if (isBaseCellAdmissible(grid, i, profile.maxTerrainSlopeDeg)) {
            relaxedAdmissible[i] = 1;
          }
        }
        const relaxedPath = runAStar(
          grid,
          workspace,
          relaxedAdmissible,
          start.cell.index,
          destination.cell.index,
          profile,
          defaultPolicyWeights('shortest-feasible', 0),
          hooks,
          explored
        );
        if (relaxedPath !== null) {
          reason = 'strict-quality-disconnects';
        }
      }

      return {
        ...base,
        status: 'no-path',
        reason,
        message:
          reason === 'strict-quality-disconnects'
            ? 'No route stays within documented acceptable quality; a route exists if lower/unknown quality is allowed.'
            : 'Destination is not connected to the start under the current terrain limits.',
        start,
        destination,
        policies: [...normalizedPolicies],
      };
    }

    const candidatesByKey = new Map<string, MarsRouteCandidate>();
    for (const record of successfulRecords) {
      const outRes = record.out!;
      const key = `${outRes.cells.join(',')}|${record.back?.cells.join(',') ?? ''}`;
      const existing = candidatesByKey.get(key);
      if (existing) {
        existing.policies.push(record.policy);
        continue;
      }

      const candidateId = `c${candidatesByKey.size}`;
      candidatesByKey.set(key, {
        candidateId,
        policies: [record.policy],
        outbound: buildMarsLeg(grid, outRes.cells, outRes.cost),
        returnLeg: record.back ? buildMarsLeg(grid, record.back.cells, record.back.cost) : null,
        missionStatus: !req.roundTrip
          ? 'one-way'
          : record.back
            ? 'round-trip-complete'
            : 'round-trip-incomplete',
        explanation: [],
      });
    }

    const candidates = [...candidatesByKey.values()];
    for (const cand of candidates) {
      cand.explanation = buildExplanations(cand, candidates, uniformQualityOverride);
    }

    return {
      ...base,
      status: 'success',
      start,
      destination,
      candidates,
      computeMs: Math.max(0, now() - t0),
    };
  } catch (err) {
    if (err instanceof AbortSearchSignal) {
      if (err.kind === 'cancelled') {
        return { ...base, status: 'cancelled' };
      }
      return {
        ...base,
        status: 'timeout',
        limitMs: req.timeoutMs ?? 0,
        message: 'Search exceeded its time budget. This is not proof that no path exists.',
      };
    }
    return {
      ...base,
      status: 'data-error',
      stage: 'reconstruction',
      message: (err as Error).message,
    };
  }
}
