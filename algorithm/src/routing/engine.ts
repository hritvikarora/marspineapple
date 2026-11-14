import {
  QUALITY_CODE,
  type ConstraintProfile,
  type ConstraintProfileId,
  type Draped3DPoint,
  type EffectivePolicyWeights,
  type ElevationProfilePoint,
  type EquivalenceTopology,
  type LocalMeterPoint,
  type NormalizedGridPoint,
  type PolicyId,
  type PolicyWeightVector,
  type QualityClass,
  type QualityExposureInterval,
  type QualityMode,
  type RegionRoutingBundle,
  type ReturnLegResult,
  type RouteCandidate,
  type RouteExplanation,
  type RouteMetrics,
  type RouteRequest,
  type RouteResponse,
} from '../contracts/routing.js';
import type {
  CellAdmissibilityPort,
  EdgeEvaluatorPort,
  SinglePolicySolveResult,
  SolverWorkspacePort,
} from './types.js';

export type EngineBundleValidationResult =
  | { ok: true; cellCount: number }
  | { ok: false; error: Extract<RouteResponse, { status: 'data_error' }> };

export type EngineEndpointValidationResult =
  | { ok: true; start: NormalizedGridPoint; destination: NormalizedGridPoint; isSameCell: boolean }
  | { ok: false; error: Extract<RouteResponse, { status: 'invalid_input' }> };

export type EngineEffectiveWeightsResult = {
  effectiveWeights: Record<PolicyId, EffectivePolicyWeights>;
  isQualityUniform: boolean;
  uniformQualityClass: QualityClass | null;
};

export type EngineDistanceTimeMetrics = {
  horizontalDistanceM: number;
  surfaceDistanceM: number;
  estimatedTimeS: number;
  gradeAdjustedTimeS: number;
};

export type EngineElevationSlopeMetrics = {
  cumulativeAscentM: number;
  cumulativeDescentM: number;
  netElevationChangeM: number;
  maxTerrainSlopeDeg: number;
  maxTerrainSlopeAtDistanceM: number;
  maxTerrainSlopeCellIndex: number;
  maxRouteGradeDeg: number;
  maxUphillGradeDeg: number;
  maxDownhillGradeDeg: number;
  maxRouteGradeAtDistanceM: number;
  integratedTerrainPenaltyCostM: number;
  integratedRoughnessPenaltyCostM: number;
  gridSpacingM: { dx: number; dy: number };
  slopeBaselineM: { eastM: number; northM: number };
  elevationProfile: ElevationProfilePoint[];
};

export type EngineQualityExposureMetrics = {
  lowQualityDistanceM: number;
  lowQualityPct: number;
  unknownQualityDistanceM: number;
  unknownQualityPct: number;
  acceptableQualityDistanceM: number;
  acceptableQualityPct: number;
  weightedUncertaintyExposureM: number;
  qualityIntervals: QualityExposureInterval[];
};

export type EngineDeduplicatedGroup = {
  candidateId: string;
  matchedPolicies: PolicyId[];
  primaryPolicy: PolicyId;
  solveResult: SinglePolicySolveResult;
};

export interface EngineDependenciesPort {
  validateRegionBundle(
    bundle: RegionRoutingBundle | null | undefined,
    requestId?: string
  ): EngineBundleValidationResult;
  validateRequestAgainstBundle(
    request: RouteRequest,
    bundle: RegionRoutingBundle | null | undefined
  ): EngineBundleValidationResult;
  resolveConstraintProfile(
    profileId?: ConstraintProfileId,
    customProfile?: ConstraintProfile
  ): ConstraintProfile;
  cellAdmissibility: CellAdmissibilityPort;
  edgeEvaluator: EdgeEvaluatorPort;
  normalizeAndValidateEndpoints(
    request: RouteRequest,
    bundle: RegionRoutingBundle,
    profile: ConstraintProfile,
    cellAdmissibility: CellAdmissibilityPort
  ): EngineEndpointValidationResult;
  resolveEffectivePolicyWeights(
    bundle: RegionRoutingBundle,
    profile: ConstraintProfile,
    qualityMode: QualityMode,
    cellAdmissibility: CellAdmissibilityPort
  ): EngineEffectiveWeightsResult;
  createWorkspace(capacity: number): SolverWorkspacePort;
  computeConnectedComponentsAndAdjMask(
    bundle: RegionRoutingBundle,
    profile: ConstraintProfile,
    qualityMode: QualityMode,
    edgeEvaluator: Pick<EdgeEvaluatorPort, 'isEdgeAdmissible'>,
    cellAdmissibility: CellAdmissibilityPort,
    componentIdOut: Int32Array,
    adjMaskOut: Uint8Array,
    bfsQueue: Int32Array
  ): { componentCount: number };
  solveAStar(params: {
    bundle: RegionRoutingBundle;
    workspace: SolverWorkspacePort;
    startIndex: number;
    goalIndex: number;
    profile: ConstraintProfile;
    qualityMode: QualityMode;
    weights: PolicyWeightVector;
    edgeEvaluator: EdgeEvaluatorPort;
    adjMask?: Uint8Array;
    isCancelled?: () => boolean;
    isTimedOut?: () => boolean;
  }): SinglePolicySolveResult;
  computeDistanceAndTimeMetrics(
    bundle: RegionRoutingBundle,
    cellIndices: number[],
    profile: ConstraintProfile,
    scienceStopDurationS?: number
  ): EngineDistanceTimeMetrics;
  computeElevationAndSlopeMetrics(
    bundle: RegionRoutingBundle,
    cellIndices: number[],
    profile: ConstraintProfile
  ): EngineElevationSlopeMetrics;
  computeQualityExposureMetrics(
    bundle: RegionRoutingBundle,
    cellIndices: number[]
  ): EngineQualityExposureMetrics;
  buildDraped3DRoutePolyline?: (
    bundle: RegionRoutingBundle,
    cellIndices: number[],
    options?: {
      verticalExaggeration?: number;
      hoverOffsetM?: number;
      refElevationM?: number;
    }
  ) => Draped3DPoint[];
  deduplicatePolicyPaths(
    requestedPolicies: PolicyId[],
    solvedByPolicy: Partial<Record<PolicyId, SinglePolicySolveResult>>
  ): {
    groups: EngineDeduplicatedGroup[];
    equivalenceTopology: EquivalenceTopology;
  };
  buildReturnLeg(params: {
    bundle: RegionRoutingBundle;
    outboundCellIndices: number[];
    profile: ConstraintProfile;
    qualityMode: QualityMode;
    edgeEvaluator: Pick<EdgeEvaluatorPort, 'isEdgeAdmissible'>;
    computeMetrics: (cellIndices: number[]) => RouteMetrics;
    resolveReturnPathIfAsymmetric?: () => SinglePolicySolveResult;
  }): ReturnLegResult;
  buildCandidateExplanations(params: {
    candidates: Array<{ matchedPolicies: PolicyId[]; metrics: RouteMetrics }>;
    equivalenceTopology: EquivalenceTopology;
    profile: ConstraintProfile;
    qualityMode: QualityMode;
    effectiveWeights: Record<PolicyId, EffectivePolicyWeights>;
    uniformQualityClass: QualityClass | null;
  }): RouteExplanation[];
  cellCenterToLocalMeters?: (
    row: number,
    col: number,
    height: number,
    dx: number,
    dy: number
  ) => LocalMeterPoint;
}

export type PlanRoutesOptions = {
  isCancelled?: () => boolean;
  isTimedOut?: () => boolean;
};

type CachedComponentMap = {
  componentId: Int32Array;
  adjMask: Uint8Array;
};

const POLICY_EXECUTION_ORDER: readonly PolicyId[] = ['terrain', 'uncertainty', 'shortest'];
const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Stateful multi-policy routing coordinator.
 * Manages bundle lifecycle, lazy component caching, uniform-quality effective weights,
 * clean-path reuse, policy execution ordering, and deterministic candidate assembly.
 */
export class RoutingEngine {
  private loadedBundle: RegionRoutingBundle | null = null;
  private workspace: SolverWorkspacePort | null = null;
  private readonly componentCache = new Map<string, CachedComponentMap>();

  constructor(private readonly deps: EngineDependenciesPort) {}

  public getLoadedBundle(): RegionRoutingBundle | null {
    return this.loadedBundle;
  }

  public getWorkspace(): SolverWorkspacePort | null {
    return this.workspace;
  }

  public loadBundle(
    bundle: RegionRoutingBundle | null | undefined,
    requestId = 'bundle-load'
  ): { ok: true } | { ok: false; error: Extract<RouteResponse, { status: 'data_error' }> } {
    const validation = this.deps.validateRegionBundle(bundle, requestId);
    if (!validation.ok) {
      return { ok: false, error: validation.error };
    }
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

    this.loadedBundle = bundle;
    this.workspace = this.deps.createWorkspace(validation.cellCount);
    this.componentCache.clear();
    return { ok: true };
  }

  public planRoutes(request: RouteRequest, options?: PlanRoutesOptions): RouteResponse {
    const requestStartMs = performance.now();
    const rawTimeoutMs = request.timeoutMs;
    const effectiveTimeoutMs =
      rawTimeoutMs !== undefined && Number.isFinite(rawTimeoutMs)
        ? rawTimeoutMs
        : DEFAULT_TIMEOUT_MS;
    const deadlineMs = requestStartMs + Math.max(0, effectiveTimeoutMs);

    const isCancelled = (): boolean => options?.isCancelled?.() === true;
    const isTimedOut = (): boolean =>
      options?.isTimedOut?.() === true ||
      effectiveTimeoutMs <= 0 ||
      performance.now() > deadlineMs;

    if (isCancelled()) {
      return {
        status: 'cancelled',
        requestId: request.requestId,
        message: 'Route calculation was cancelled before execution.',
      };
    }

    const bundleCheck = this.deps.validateRequestAgainstBundle(request, this.loadedBundle);
    if (!bundleCheck.ok) {
      return bundleCheck.error;
    }
    if (!this.loadedBundle) {
      return {
        status: 'data_error',
        requestId: request.requestId,
        reasonCode: 'BUNDLE_NOT_LOADED',
        message: 'No RegionRoutingBundle is currently loaded in the routing engine.',
      };
    }
    const bundle = this.loadedBundle;

    if (!this.workspace || this.workspace.capacity < bundleCheck.cellCount) {
      this.workspace = this.deps.createWorkspace(bundleCheck.cellCount);
      this.componentCache.clear();
    }
    const workspace = this.workspace;

    let profile: ConstraintProfile;
    try {
      profile = this.deps.resolveConstraintProfile(request.profileId, request.customProfile);
    } catch (err) {
      return {
        status: 'invalid_input',
        requestId: request.requestId,
        endpoint: 'request',
        reasonCode: 'INVALID_DIMENSIONS',
        message: err instanceof Error ? err.message : 'Invalid constraint profile parameters.',
      };
    }

    const endpointCheck = this.deps.normalizeAndValidateEndpoints(
      request,
      bundle,
      profile,
      this.deps.cellAdmissibility
    );
    if (!endpointCheck.ok) {
      return endpointCheck.error;
    }

    const orderedPolicies = POLICY_EXECUTION_ORDER.filter((p) => request.policies.includes(p));
    if (orderedPolicies.length === 0) {
      return {
        status: 'invalid_input',
        requestId: request.requestId,
        endpoint: 'request',
        reasonCode: 'EMPTY_POLICIES',
        message: 'RouteRequest.policies must include at least one valid routing policy.',
      };
    }

    if (isCancelled()) {
      return {
        status: 'cancelled',
        requestId: request.requestId,
        message: 'Route calculation was cancelled.',
      };
    }

    if (isTimedOut()) {
      return {
        status: 'timeout',
        requestId: request.requestId,
        timeoutMs: effectiveTimeoutMs,
        completedPolicies: [],
        message: `Route calculation exceeded the ${effectiveTimeoutMs} ms budget before search started.`,
      };
    }

    const weightResolution = this.deps.resolveEffectivePolicyWeights(
      bundle,
      profile,
      request.qualityMode,
      this.deps.cellAdmissibility
    );

    const startIndex = endpointCheck.start.cellIndex;
    const goalIndex = endpointCheck.destination.cellIndex;

    const solvedByPolicy: Partial<Record<PolicyId, SinglePolicySolveResult>> = {};
    const policyStatuses: Partial<Record<PolicyId, 'success' | 'no_path' | 'timeout' | 'cancelled'>> = {};
    const completedPolicies: PolicyId[] = [];
    const reasonCodes: string[] = [];
    const seenReasonCodes = new Set<string>();
    const addReasonCode = (code: string): void => {
      if (!seenReasonCodes.has(code)) {
        seenReasonCodes.add(code);
        reasonCodes.push(code);
      }
    };

    let componentEntry: CachedComponentMap | undefined;

    if (endpointCheck.isSameCell) {
      for (const policy of orderedPolicies) {
        solvedByPolicy[policy] = {
          status: 'success',
          cellIndices: [startIndex],
          totalCost: 0,
          exploredNodes: 0,
        };
        policyStatuses[policy] = 'success';
        completedPolicies.push(policy);
      }
      if (
        orderedPolicies.includes('uncertainty') &&
        weightResolution.effectiveWeights.uncertainty.uniformQualityOverride
      ) {
        addReasonCode('UNIFORM_QUALITY_NO_DIFFERENTIATION');
      }
    } else {
      const cacheKey = this.buildComponentCacheKey(profile, request.qualityMode);
      componentEntry = this.componentCache.get(cacheKey);
      if (!componentEntry) {
        if (isCancelled()) {
          return {
            status: 'cancelled',
            requestId: request.requestId,
            message: 'Route calculation was cancelled during component setup.',
          };
        }
        if (isTimedOut()) {
          return {
            status: 'timeout',
            requestId: request.requestId,
            timeoutMs: effectiveTimeoutMs,
            completedPolicies: [],
            message: `Route calculation exceeded the ${effectiveTimeoutMs} ms budget during component labeling.`,
          };
        }

        const cellCount = bundle.gridWidth * bundle.gridHeight;
        const componentId = new Int32Array(cellCount);
        const adjMask = new Uint8Array(cellCount);
        this.deps.computeConnectedComponentsAndAdjMask(
          bundle,
          profile,
          request.qualityMode,
          this.deps.edgeEvaluator,
          this.deps.cellAdmissibility,
          componentId,
          adjMask,
          workspace.bfsQueue
        );
        componentEntry = { componentId, adjMask };
        this.componentCache.set(cacheKey, componentEntry);
        workspace.componentId.set(componentId);
        workspace.adjMask.set(adjMask);
      }

      if (isCancelled()) {
        return {
          status: 'cancelled',
          requestId: request.requestId,
          message: 'Route calculation was cancelled after component labeling.',
        };
      }
      if (isTimedOut()) {
        return {
          status: 'timeout',
          requestId: request.requestId,
          timeoutMs: effectiveTimeoutMs,
          completedPolicies: [],
          message: `Route calculation exceeded the ${effectiveTimeoutMs} ms budget after component labeling.`,
        };
      }

      const startComp = componentEntry.componentId[startIndex];
      const goalComp = componentEntry.componentId[goalIndex];
      if (startComp < 0 || startComp !== goalComp) {
        return {
          status: 'no_path',
          requestId: request.requestId,
          regionId: bundle.regionId,
          datasetVersion: bundle.datasetVersion,
          normalizedStart: endpointCheck.start,
          normalizedDestination: endpointCheck.destination,
          reasonCode:
            request.qualityMode === 'strict'
              ? 'STRICT_QUALITY_BLOCKED'
              : 'DISCONNECTED_COMPONENTS',
          message:
            request.qualityMode === 'strict'
              ? 'Destination is unreachable under strict observation-quality admissibility.'
              : 'Start and destination lie in disconnected traversable terrain components.',
          solveTimeMs: Math.max(0, performance.now() - requestStartMs),
        };
      }

      for (let i = 0; i < orderedPolicies.length; i++) {
        const policy = orderedPolicies[i];

        if (isCancelled()) {
          return {
            status: 'cancelled',
            requestId: request.requestId,
            message: `Route calculation was cancelled before evaluating '${policy}'.`,
          };
        }

        if (isTimedOut()) {
          for (let j = i; j < orderedPolicies.length; j++) {
            policyStatuses[orderedPolicies[j]] = 'timeout';
          }
          addReasonCode('PARTIAL_POLICY_TIMEOUT');
          break;
        }

        if (policy === 'uncertainty') {
          const uncEffective = weightResolution.effectiveWeights.uncertainty;
          const terrainResult = solvedByPolicy.terrain;

          if (terrainResult && terrainResult.status === 'success') {
            // Case A: 'terrain' already solved in this request.
            if (uncEffective.uniformQualityOverride) {
              solvedByPolicy.uncertainty = {
                status: 'success',
                cellIndices: [...terrainResult.cellIndices],
                totalCost: terrainResult.totalCost,
                exploredNodes: 0,
              };
              policyStatuses.uncertainty = 'success';
              completedPolicies.push('uncertainty');
              addReasonCode('UNIFORM_QUALITY_NO_DIFFERENTIATION');
              continue;
            }

            if (this.isPathCleanQuality(bundle, terrainResult.cellIndices)) {
              solvedByPolicy.uncertainty = {
                status: 'success',
                cellIndices: [...terrainResult.cellIndices],
                totalCost: terrainResult.totalCost,
                exploredNodes: 0,
              };
              policyStatuses.uncertainty = 'success';
              completedPolicies.push('uncertainty');
              addReasonCode('TERRAIN_ALREADY_OPTIMAL_FOR_UNCERTAINTY');
              continue;
            }
          } else if (uncEffective.uniformQualityOverride) {
            // Case B: standalone 'uncertainty' (without 'terrain') on uniform quality bundle.
            addReasonCode('UNIFORM_QUALITY_NO_DIFFERENTIATION');
          }
        }

        const solveResult = this.deps.solveAStar({
          bundle,
          workspace,
          startIndex,
          goalIndex,
          profile,
          qualityMode: request.qualityMode,
          weights: weightResolution.effectiveWeights[policy].effective,
          edgeEvaluator: this.deps.edgeEvaluator,
          adjMask: componentEntry.adjMask,
          isCancelled,
          isTimedOut,
        });

        if (solveResult.status === 'cancelled') {
          return {
            status: 'cancelled',
            requestId: request.requestId,
            message: `Route calculation was cancelled while solving '${policy}'.`,
          };
        }

        if (solveResult.status === 'timeout') {
          for (let j = i; j < orderedPolicies.length; j++) {
            policyStatuses[orderedPolicies[j]] = 'timeout';
          }
          addReasonCode('PARTIAL_POLICY_TIMEOUT');
          break;
        }

        policyStatuses[policy] = solveResult.status;
        if (solveResult.status === 'success') {
          solvedByPolicy[policy] = solveResult;
          completedPolicies.push(policy);
        }
      }
    }

    if (isCancelled()) {
      return {
        status: 'cancelled',
        requestId: request.requestId,
        message: 'Route calculation was cancelled prior to candidate assembly.',
      };
    }

    if (completedPolicies.length === 0) {
      const anyTimedOut = orderedPolicies.some((p) => policyStatuses[p] === 'timeout');
      if (anyTimedOut) {
        return {
          status: 'timeout',
          requestId: request.requestId,
          timeoutMs: effectiveTimeoutMs,
          completedPolicies: [],
          message: `Route calculation timed out after ${effectiveTimeoutMs} ms before any policy finished.`,
        };
      }
      return {
        status: 'no_path',
        requestId: request.requestId,
        regionId: bundle.regionId,
        datasetVersion: bundle.datasetVersion,
        normalizedStart: endpointCheck.start,
        normalizedDestination: endpointCheck.destination,
        reasonCode:
          request.qualityMode === 'strict' ? 'STRICT_QUALITY_BLOCKED' : 'SEARCH_EXHAUSTED',
        message: 'No admissible route could be found for any requested policy.',
        solveTimeMs: Math.max(0, performance.now() - requestStartMs),
      };
    }

    const dedup = this.deps.deduplicatePolicyPaths(request.policies, solvedByPolicy);

    const computeFullMetrics = (
      cellIndices: number[],
      scienceStopDurationS: number
    ): RouteMetrics => {
      const distTime = this.deps.computeDistanceAndTimeMetrics(
        bundle,
        cellIndices,
        profile,
        scienceStopDurationS
      );
      const elevSlope = this.deps.computeElevationAndSlopeMetrics(bundle, cellIndices, profile);
      const quality = this.deps.computeQualityExposureMetrics(bundle, cellIndices);
      return {
        horizontalDistanceM: distTime.horizontalDistanceM,
        surfaceDistanceM: distTime.surfaceDistanceM,
        cumulativeAscentM: elevSlope.cumulativeAscentM,
        cumulativeDescentM: elevSlope.cumulativeDescentM,
        netElevationChangeM: elevSlope.netElevationChangeM,
        maxTerrainSlopeDeg: elevSlope.maxTerrainSlopeDeg,
        maxTerrainSlopeAtDistanceM: elevSlope.maxTerrainSlopeAtDistanceM,
        maxTerrainSlopeCellIndex: elevSlope.maxTerrainSlopeCellIndex,
        maxRouteGradeDeg: elevSlope.maxRouteGradeDeg,
        maxUphillGradeDeg: elevSlope.maxUphillGradeDeg,
        maxDownhillGradeDeg: elevSlope.maxDownhillGradeDeg,
        maxRouteGradeAtDistanceM: elevSlope.maxRouteGradeAtDistanceM,
        lowQualityDistanceM: quality.lowQualityDistanceM,
        lowQualityPct: quality.lowQualityPct,
        unknownQualityDistanceM: quality.unknownQualityDistanceM,
        unknownQualityPct: quality.unknownQualityPct,
        acceptableQualityDistanceM: quality.acceptableQualityDistanceM,
        acceptableQualityPct: quality.acceptableQualityPct,
        weightedUncertaintyExposureM: quality.weightedUncertaintyExposureM,
        integratedTerrainPenaltyCostM: elevSlope.integratedTerrainPenaltyCostM,
        integratedRoughnessPenaltyCostM: elevSlope.integratedRoughnessPenaltyCostM,
        estimatedTimeS: distTime.estimatedTimeS,
        gradeAdjustedTimeS: distTime.gradeAdjustedTimeS,
        gridSpacingM: elevSlope.gridSpacingM,
        slopeBaselineM: elevSlope.slopeBaselineM,
        elevationProfile: elevSlope.elevationProfile,
        qualityIntervals: quality.qualityIntervals,
      };
    };

    const scienceStopS = request.scienceStopDurationS ?? 0;
    const candidateDrafts = dedup.groups.map((group) => ({
      group,
      metrics: computeFullMetrics(group.solveResult.cellIndices, scienceStopS),
    }));

    const explanations = this.deps.buildCandidateExplanations({
      candidates: candidateDrafts.map((draft) => ({
        matchedPolicies: draft.group.matchedPolicies,
        metrics: draft.metrics,
      })),
      equivalenceTopology: dedup.equivalenceTopology,
      profile,
      qualityMode: request.qualityMode,
      effectiveWeights: weightResolution.effectiveWeights,
      uniformQualityClass: weightResolution.uniformQualityClass,
    });

    for (const exp of explanations) {
      for (const code of exp.reasonCodes) {
        addReasonCode(code);
      }
    }

    const candidates: RouteCandidate[] = candidateDrafts.map((draft, idx) => {
      const { group, metrics } = draft;
      const polylineMeters = this.cellIndicesToLocalMeters(bundle, group.solveResult.cellIndices);
      const draped3DPolyline = this.deps.buildDraped3DRoutePolyline
        ? this.deps.buildDraped3DRoutePolyline(bundle, group.solveResult.cellIndices)
        : undefined;

      const returnLeg = request.returnToStart
        ? this.deps.buildReturnLeg({
            bundle,
            outboundCellIndices: group.solveResult.cellIndices,
            profile,
            qualityMode: request.qualityMode,
            edgeEvaluator: this.deps.edgeEvaluator,
            computeMetrics: (cells) => computeFullMetrics(cells, 0),
            resolveReturnPathIfAsymmetric: () =>
              this.deps.solveAStar({
                bundle,
                workspace,
                startIndex: goalIndex,
                goalIndex: startIndex,
                profile,
                qualityMode: request.qualityMode,
                weights: weightResolution.effectiveWeights[group.primaryPolicy].effective,
                edgeEvaluator: this.deps.edgeEvaluator,
                adjMask: componentEntry?.adjMask,
                isCancelled,
                isTimedOut,
              }),
          })
        : undefined;

      const candidate: RouteCandidate = {
        candidateId: group.candidateId,
        matchedPolicies: group.matchedPolicies,
        cellIndices: group.solveResult.cellIndices,
        polylineMeters,
        totalCost: group.solveResult.totalCost,
        exploredNodes: group.solveResult.exploredNodes,
        metrics,
        explanation: explanations[idx],
      };

      if (draped3DPolyline !== undefined) {
        candidate.draped3DPolyline = draped3DPolyline;
      }
      if (returnLeg !== undefined) {
        candidate.returnLeg = returnLeg;
      }

      return candidate;
    });

    return {
      status: 'success',
      requestId: request.requestId,
      regionId: bundle.regionId,
      datasetVersion: bundle.datasetVersion,
      profileId: profile.profileId,
      qualityMode: request.qualityMode,
      normalizedStart: endpointCheck.start,
      normalizedDestination: endpointCheck.destination,
      effectiveWeights: weightResolution.effectiveWeights,
      policyStatuses,
      equivalenceTopology: dedup.equivalenceTopology,
      candidates,
      reasonCodes,
      solveTimeMs: Math.max(0, performance.now() - requestStartMs),
    };
  }

  private buildComponentCacheKey(profile: ConstraintProfile, qualityMode: QualityMode): string {
    return `${profile.profileId}|${qualityMode}|${profile.maxTerrainSlopeDeg}|${profile.maxRouteGradeDeg}|${profile.maxUphillGradeDeg ?? ''}|${profile.maxDownhillGradeDeg ?? ''}`;
  }

  /**
   * Checks whether every edge along cellIndices has corner-aware quality penalty U(e) === 0.
   * For diagonal steps, both orthogonal corner cells w1, w2 must also be ACCEPTABLE.
   */
  private isPathCleanQuality(bundle: RegionRoutingBundle, cellIndices: number[]): boolean {
    if (cellIndices.length === 0) return true;
    const width = bundle.gridWidth;
    const q = bundle.qualityCode;

    for (let i = 0; i < cellIndices.length; i++) {
      if (q[cellIndices[i]] !== QUALITY_CODE.ACCEPTABLE) {
        return false;
      }
      if (i > 0) {
        const prev = cellIndices[i - 1];
        const curr = cellIndices[i];
        const prevRow = Math.floor(prev / width);
        const prevCol = prev - prevRow * width;
        const currRow = Math.floor(curr / width);
        const currCol = curr - currRow * width;
        if (Math.abs(currRow - prevRow) === 1 && Math.abs(currCol - prevCol) === 1) {
          const w1 = prevRow * width + currCol;
          const w2 = currRow * width + prevCol;
          if (q[w1] !== QUALITY_CODE.ACCEPTABLE || q[w2] !== QUALITY_CODE.ACCEPTABLE) {
            return false;
          }
        }
      }
    }
    return true;
  }

  private cellIndicesToLocalMeters(
    bundle: RegionRoutingBundle,
    cellIndices: number[]
  ): LocalMeterPoint[] {
    const w = bundle.gridWidth;
    const h = bundle.gridHeight;
    const dx = bundle.cellSpacingEastM;
    const dy = bundle.cellSpacingNorthM;
    const convert = this.deps.cellCenterToLocalMeters;
    const points: LocalMeterPoint[] = new Array(cellIndices.length);

    for (let i = 0; i < cellIndices.length; i++) {
      const k = cellIndices[i];
      const row = Math.floor(k / w);
      const col = k - row * w;
      points[i] = convert
        ? convert(row, col, h, dx, dy)
        : {
            eastM: (col + 0.5) * dx,
            northM: (h - 1 - row + 0.5) * dy,
          };
    }

    return points;
  }
}
