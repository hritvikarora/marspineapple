/**
 * Route request/response contract between the app (worker client) and the routing worker.
 * OWNER: Role C (shape) / Ayush (semantics + values). Every message echoes requestId,
 * bundleVersion and modelVersion.
 */
import type { CellRef, LocalPoint, LocalPoint3 } from './geometry';
import type { QualityCode } from './manifest';

export const ROUTE_POLICIES = ['shortest-feasible', 'terrain-aware', 'uncertainty-aware'] as const;
export type RoutePolicyId = (typeof ROUTE_POLICIES)[number];

/** Optional per-request weight overrides (dimensionless). Absent => model defaults. */
export interface PolicyWeights {
  slope: number;
  roughness: number;
  quality: number;
}

export interface RouteRequest {
  requestId: string;
  /** Must equal the bundle loaded in the worker, else `invalid-input` / `version-mismatch`. */
  bundleVersion: string;
  /** Route model (solver + EVA profile + weights) version the caller expects. */
  modelVersion: string;
  start: LocalPoint;
  destination: LocalPoint;
  /** Which policies to compute (deduplicated by identical cell paths in the response). */
  policies: RoutePolicyId[];
  /** Weight overrides keyed by policy; unspecified policies use defaults. */
  weightOverrides?: Partial<Record<RoutePolicyId, PolicyWeights>>;
  /** true = cells outside the documented acceptable quality set are EXCLUDED (not just penalised). */
  strictQuality: boolean;
  /** true = also compute a return leg destination -> start. */
  roundTrip: boolean;
  /** Worker-side soft budget; the client also enforces its own hard timeout. */
  timeoutMs?: number;
}

/** How a requested point was snapped to the grid. */
export interface EndpointResolution {
  requested: LocalPoint;
  cell: CellRef;
  /** Cell centre actually used by the solver. */
  accepted: LocalPoint;
}

export interface RouteMetrics {
  /** Sum of planar edge lengths. PRIMARY displayed distance unless Dhani/Ayush agree otherwise. */
  horizontalDistance_m: number;
  /** Includes elevation differences along edges. */
  surfaceDistance_m: number;
  ascent_m: number;
  descent_m: number;
  /** Max neighbourhood terrain slope of any path cell (deg). */
  maxTerrainSlope_deg: number;
  /** Max |rise/run| along any path edge, as an angle (deg). */
  maxAbsEdgeGrade_deg: number;
  lowQualityLength_m: number;
  /** Denominator: horizontalDistance_m. 0 for zero-length routes. */
  lowQualityPct: number;
  unknownQualityLength_m: number;
  /** Denominator: horizontalDistance_m. 0 for zero-length routes. */
  unknownQualityPct: number;
  cellCount: number;
}

export interface QualityInterval {
  fromDistance_m: number;
  toDistance_m: number;
  quality: QualityCode;
}

export interface ElevationProfile {
  /** Cumulative horizontal distance (m) at each sample. */
  distance_m: number[];
  elevation_m: number[];
  /** Index into RouteLeg.path for each sample (for map/3D hover sync). */
  pathIndex: number[];
}

export interface RouteLeg {
  /** Authoritative cell indices, start -> end. */
  cells: number[];
  /** Cell-centre polyline with elevations, same order as `cells`. */
  path: LocalPoint3[];
  metrics: RouteMetrics;
  qualityIntervals: QualityInterval[];
  profile: ElevationProfile;
  /** Weighted optimisation cost. NOT comparable across policies; not a distance or probability. */
  weightedCost: { value: number; units: 'weighted-cost' };
}

export interface RouteCandidate {
  /** Stable within a response, e.g. "c0". */
  candidateId: string;
  /** All policies that produced this identical cell path. */
  policies: RoutePolicyId[];
  outbound: RouteLeg;
  /** null when roundTrip=false OR when the return leg failed (see missionStatus). */
  returnLeg: RouteLeg | null;
  missionStatus: 'one-way' | 'round-trip-complete' | 'round-trip-incomplete';
  /** Template-generated statements from computed facts. */
  explanation: string[];
}

interface ResponseBase {
  requestId: string;
  bundleVersion: string;
  modelVersion: string;
}

export interface RouteProgress extends ResponseBase {
  status: 'progress';
  phase: 'validating' | 'searching' | 'metrics';
  exploredNodes: number;
}

export interface SearchTraceFrame {
  step: number;
  policy: RoutePolicyId;
  /** Row-major grid cell indices newly closed in this sampled batch (capped). */
  closedCells: number[];
  /** Sampled frontier cell indices currently in the open set (capped). */
  frontierCells: number[];
  /** Best path-so-far backtrace at this snapshot (sampled, preserving endpoints). */
  currentBestCells: number[];
  /** Current path cost gScore[u] at this snapshot. */
  currentBestCost: number;
  /** Number of closed expansions in this search at this snapshot. */
  exploredCount: number;
  /** Current open-set size at this snapshot. */
  openSize: number;
  /** Short deterministic caption describing this wavefront phase. */
  note: string;
}

export interface SearchTraceData {
  exploredTotal: number;
  frames: SearchTraceFrame[];
}

export interface RouteSuccess extends ResponseBase {
  status: 'success';
  start: EndpointResolution;
  destination: EndpointResolution;
  candidates: RouteCandidate[];
  computeMs: number;
  trace?: SearchTraceData;
}

export type NoPathReason = 'disconnected-under-limits' | 'strict-quality-disconnects' | 'unknown';

export interface RouteNoPath extends ResponseBase {
  status: 'no-path';
  reason: NoPathReason;
  message: string;
  start: EndpointResolution;
  destination: EndpointResolution;
  /** Policies that were attempted. */
  policies: RoutePolicyId[];
}

export type InvalidInputReason =
  | 'version-mismatch'
  | 'model-mismatch'
  | 'bundle-not-loaded'
  | 'endpoint-outside-region'
  | 'endpoint-excluded'
  | 'endpoint-quality-excluded'
  | 'no-policies'
  | 'strict-quality-unsupported'
  | 'malformed';

export interface RouteInvalidInput extends ResponseBase {
  status: 'invalid-input';
  reason: InvalidInputReason;
  /** Offending field, e.g. "destination", "bundleVersion". */
  field: string | null;
  message: string;
}

export interface RouteCancelled extends ResponseBase {
  status: 'cancelled';
}

export interface RouteTimeout extends ResponseBase {
  status: 'timeout';
  limitMs: number;
  /** A timeout is NOT proof that no path exists. */
  message: string;
}

export interface RouteDataError extends ResponseBase {
  status: 'data-error';
  stage: 'bundle' | 'reconstruction' | 'worker-crash' | 'internal';
  message: string;
}

export type RouteResponse =
  | RouteProgress
  | RouteSuccess
  | RouteNoPath
  | RouteInvalidInput
  | RouteCancelled
  | RouteTimeout
  | RouteDataError;

/** Every non-progress response ends a request. */
export type RouteFinalResponse = Exclude<RouteResponse, RouteProgress>;
export type RouteStatus = RouteResponse['status'];

export function isFinal(r: RouteResponse): r is RouteFinalResponse {
  return r.status !== 'progress';
}
