// Public collision-free barrel exports for Tasks T01-T30 and default engine assembly (T40).

// T01: Contracts & shared routing types/constants
export {
  QUALITY_CODE,
  SOURCE_FOM_CODE,
  type ConstraintProfile,
  type ConstraintProfileId,
  type Draped3DPoint,
  type EffectivePolicyWeights,
  type ElevationProfilePoint,
  type EquivalenceTopology,
  type ExclusionReasonCode,
  type LocalMeterPoint,
  type NormalizedGridPoint,
  type PolicyId,
  type PolicyWeightVector,
  type QualityClass,
  type QualityCode,
  type QualityExposureInterval,
  type QualityMode,
  type RegionRoutingBundle,
  type ReturnLegResult,
  type RouteCandidate,
  type RouteExplanation,
  type RouteMetrics,
  type RouteRequest,
  type RouteResponse,
  type SourceFomCode,
} from '../contracts/routing.js';

export {
  DIR_COUNT,
  DIR_DC,
  DIR_DR,
  DIR_IS_DIAG,
  NOMINAL_POLICY_WEIGHTS,
  QUALITY_PENALTY_BY_CODE,
  type CellAdmissibilityPort,
  type EdgeEvaluatorPort,
  type SinglePolicySolveResult,
  type SolverWorkspacePort,
} from './types.js';

// T02: Bundle validator
export {
  validateRegionBundle,
  validateRequestAgainstBundle,
  type BundleValidationOutcome,
} from './bundleValidator.js';

// T03: Grid coordinate transforms
export {
  cellCenterToLocalMeters,
  indexToRowCol,
  localMetersToGridPoint,
  rowColToIndex,
  stepPlanarDistanceM,
} from '../coordinates/grid.js';

// T04: Constraint profiles
export {
  CONSTRAINT_PROFILES,
  DEFAULT_PROFILE_ID,
  isProfileDirectionallySymmetric,
  resolveConstraintProfile,
} from './profiles.js';

// T05: Quality mapping
export {
  decodeFomGridToQualityCode,
  mapSourceFomToQualityCode,
  QUALITY_MAPPING_VERSION,
  qualityCodeToClass,
  qualityCodeToPenaltyU,
} from './qualityMapping.js';

// T06: Elevation support mask & masked resampling
export {
  bilinearResampleSupportedOnly,
  buildElevationSupportMask,
  createMaskedElevationGrid,
  isValidElevationSample,
} from './elevationSupport.js';

// T07: Horn (1981) terrain slope
export { computeHornSlopeGrid, cropHaloDerivativeGrid } from './hornSlope.js';

// T08: Plane-fit roughness
export { computePlaneFitRoughnessGrid } from './roughness.js';

// T09: Cell admissibility
export { getCellExclusionReason, isCellAdmissible } from './cellAdmissibility.js';

// T10: Endpoint normalization & validation
export {
  normalizeAndValidateEndpoints,
  type EndpointValidationResult,
} from './endpoints.js';

// T11: Edge admissibility
export { isEdgeAdmissible } from './edgeAdmissibility.js';

// T12: Effective policy weights
export {
  resolveEffectivePolicyWeights,
  type EffectivePolicyWeightsResult,
} from './effectiveWeights.js';

// T13: Edge cost & penalties
export {
  computeEdgeCost,
  computeEdgePenalties,
  type EdgePenalties,
} from './edgeCost.js';

// T14: Pre-allocated TypedArray solver workspace
export { SolverWorkspace } from './workspace.js';

// T15: Indexed binary min-heap & strict weak ordering comparator
export { BinaryMinHeap, hasHigherPriority } from './binaryHeap.js';

// T16: Connected-component labeling & 8-bit neighbor masks
export {
  areCellsInSameComponent,
  computeConnectedComponentsAndAdjMask,
} from './components.js';

// T17: A* solver
export { solveAStar, type SolveAStarParams } from './astar.js';

// T18: Standalone reference Dijkstra oracle
export { solveDijkstra } from './dijkstra.js';

// T19: Independent path admissibility auditor & oracle equivalence assertions
export { assertAStarMatchesDijkstra, verifyPathAdmissibility } from './pathAudit.js';

// T20: Distance & travel-time metrics
export {
  computeDistanceAndTimeMetrics,
  type DistanceAndTimeMetrics,
} from './metricsDistance.js';

// T21: Elevation, slope & terrain-penalty metrics
export {
  computeElevationAndSlopeMetrics,
  type ElevationAndSlopeMetrics,
} from './metricsElevation.js';

// T22: Observation quality exposure metrics & RLE intervals
export {
  computeQualityExposureMetrics,
  type QualityExposureMetrics,
} from './metricsQuality.js';

// T23: 3D saddle-quad draped polyline builder
export {
  buildDraped3DRoutePolyline,
  type Draped3DRouteOptions,
  type MeshQuadDiagonalSplit,
} from './draping3d.js';

// T24: Policy path deduplication
export {
  areCellPathsIdentical,
  deduplicatePolicyPaths,
  type DeduplicatedPolicyGroup,
  type DeduplicationResult,
} from './deduplicate.js';

// T25: Return-leg builder
export { buildReturnLeg, type BuildReturnLegParams } from './returnLeg.js';

// T26: Deterministic signed-delta explanation engine
export {
  buildCandidateExplanations,
  formatDistanceDelta,
  formatQualityDelta,
  formatTerrainDelta,
  type BuildCandidateExplanationsParams,
} from './explanations.js';

// T27: Async single-owner workspace mutex, yield channel & unified deadline
export {
  AsyncWorkspaceMutex,
  createUnifiedDeadline,
  createYieldChannel,
  type MutexTaskContext,
  type UnifiedDeadline,
} from './mutex.js';

// T28: Multi-policy routing engine
export {
  RoutingEngine,
  type EngineBundleValidationResult,
  type EngineDeduplicatedGroup,
  type EngineDependenciesPort,
  type EngineDistanceTimeMetrics,
  type EngineEffectiveWeightsResult,
  type EngineElevationSlopeMetrics,
  type EngineEndpointValidationResult,
  type EngineQualityExposureMetrics,
  type PlanRoutesOptions,
} from './engine.js';

// T29: Web Worker / serialized message handler
export {
  createWorkerMessageHandler,
  type WorkerEnginePort,
  type WorkerInboundMessage,
  type WorkerOutboundMessage,
} from './route.worker.js';

// T30: Promise-based route planner client
export {
  RoutePlannerClient,
  type ClientEnginePort,
  type ClientWorkerInboundMessage,
  type ClientWorkerOutboundMessage,
  type RoutePlannerClientOptions,
  type WorkerLike,
} from './routeClient.js';

// Default assembly wiring T02-T30 modules cleanly
import { cellCenterToLocalMeters } from '../coordinates/grid.js';
import { solveAStar } from './astar.js';
import { validateRegionBundle, validateRequestAgainstBundle } from './bundleValidator.js';
import { getCellExclusionReason } from './cellAdmissibility.js';
import { computeConnectedComponentsAndAdjMask } from './components.js';
import { deduplicatePolicyPaths } from './deduplicate.js';
import { buildDraped3DRoutePolyline } from './draping3d.js';
import { isEdgeAdmissible } from './edgeAdmissibility.js';
import { computeEdgeCost } from './edgeCost.js';
import { resolveEffectivePolicyWeights } from './effectiveWeights.js';
import { normalizeAndValidateEndpoints } from './endpoints.js';
import { RoutingEngine, type EngineDependenciesPort } from './engine.js';
import { buildCandidateExplanations } from './explanations.js';
import { computeDistanceAndTimeMetrics } from './metricsDistance.js';
import { computeElevationAndSlopeMetrics } from './metricsElevation.js';
import { computeQualityExposureMetrics } from './metricsQuality.js';
import { resolveConstraintProfile } from './profiles.js';
import { buildReturnLeg } from './returnLeg.js';
import {
  createWorkerMessageHandler,
  type WorkerEnginePort,
  type WorkerInboundMessage,
  type WorkerOutboundMessage,
} from './route.worker.js';
import { RoutePlannerClient, type RoutePlannerClientOptions } from './routeClient.js';
import type { CellAdmissibilityPort, EdgeEvaluatorPort } from './types.js';
import { SolverWorkspace } from './workspace.js';

export function createDefaultCellAdmissibility(): CellAdmissibilityPort {
  return {
    getCellExclusionReason,
  };
}

/**
 * Adapts the row/col-based edge admissibility and edge cost functions (T11, T13)
 * to the index-based EdgeEvaluatorPort expected by components, A*, Dijkstra, and pathAudit.
 */
export function createDefaultEdgeEvaluator(
  cellAdmissibility: CellAdmissibilityPort = createDefaultCellAdmissibility()
): EdgeEvaluatorPort {
  return {
    isEdgeAdmissible(bundle, uIndex, _vIndex, dir, profile, qualityMode) {
      const width = bundle.gridWidth;
      const uRow = Math.floor(uIndex / width);
      const uCol = uIndex - uRow * width;
      return isEdgeAdmissible(
        bundle,
        uRow,
        uCol,
        dir,
        profile,
        qualityMode,
        cellAdmissibility
      );
    },
    computeEdgeCost(bundle, uIndex, _vIndex, dir, profile, weights) {
      const width = bundle.gridWidth;
      const uRow = Math.floor(uIndex / width);
      const uCol = uIndex - uRow * width;
      return computeEdgeCost(bundle, uRow, uCol, dir, profile, weights);
    },
  };
}

export function createDefaultEngineDependencies(): EngineDependenciesPort {
  const cellAdmissibility = createDefaultCellAdmissibility();
  const edgeEvaluator = createDefaultEdgeEvaluator(cellAdmissibility);

  return {
    validateRegionBundle,
    validateRequestAgainstBundle,
    resolveConstraintProfile,
    cellAdmissibility,
    edgeEvaluator,
    normalizeAndValidateEndpoints,
    resolveEffectivePolicyWeights,
    createWorkspace: (capacity) => new SolverWorkspace(capacity),
    computeConnectedComponentsAndAdjMask,
    solveAStar,
    computeDistanceAndTimeMetrics,
    computeElevationAndSlopeMetrics,
    computeQualityExposureMetrics,
    buildDraped3DRoutePolyline,
    deduplicatePolicyPaths,
    buildReturnLeg,
    buildCandidateExplanations,
    cellCenterToLocalMeters,
  };
}

/**
 * Creates a fully wired RoutingEngine backed by all production T02-T28 modules.
 */
export function createDefaultRoutingEngine(): RoutingEngine {
  return new RoutingEngine(createDefaultEngineDependencies());
}

/**
 * Creates a serialized Web Worker message handler backed by a default RoutingEngine.
 */
export function createDefaultWorkerMessageHandler(
  postMessageFn: (msg: WorkerOutboundMessage) => void,
  engine: WorkerEnginePort = createDefaultRoutingEngine()
): (msg: WorkerInboundMessage) => Promise<void> {
  return createWorkerMessageHandler(engine, postMessageFn);
}

/**
 * Creates a RoutePlannerClient defaulting to an in-process default RoutingEngine
 * when neither workerFactory nor a custom engine is supplied.
 */
export function createDefaultRoutePlannerClient(
  options: RoutePlannerClientOptions = {}
): RoutePlannerClient {
  if (options.workerFactory || options.engine) {
    return new RoutePlannerClient(options);
  }
  return new RoutePlannerClient({ engine: createDefaultRoutingEngine() });
}
