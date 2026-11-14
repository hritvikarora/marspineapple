import { describe, expect, it } from 'vitest';
import {
  QUALITY_CODE,
  type ConstraintProfile,
  type ConstraintProfileId,
  type EffectivePolicyWeights,
  type ElevationProfilePoint,
  type EquivalenceTopology,
  type ExclusionReasonCode,
  type PolicyId,
  type PolicyWeightVector,
  type QualityClass,
  type QualityMode,
  type RegionRoutingBundle,
  type ReturnLegResult,
  type RouteExplanation,
  type RouteMetrics,
  type RouteRequest,
} from '../../src/contracts/routing.js';
import {
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
} from '../../src/routing/types.js';
import { RoutingEngine, type EngineDependenciesPort } from '../../src/routing/engine.js';

const PROFILES: Record<string, ConstraintProfile> = {
  'educational-eva-v1': {
    profileId: 'educational-eva-v1',
    version: '1.0.0',
    maxTerrainSlopeDeg: 20,
    maxRouteGradeDeg: 20,
    roughnessScaleM: 0.5,
    nominalWalkingSpeedMps: 0.5,
    gradePenaltyKappa: 1.5,
    isSimulatedAssumption: true,
  },
  'conservative-15deg': {
    profileId: 'conservative-15deg',
    version: '1.0.0',
    maxTerrainSlopeDeg: 15,
    maxRouteGradeDeg: 15,
    roughnessScaleM: 0.5,
    nominalWalkingSpeedMps: 0.5,
    gradePenaltyKappa: 1.5,
    isSimulatedAssumption: true,
  },
};

function createTestBundle(
  width: number,
  height: number,
  dx = 10,
  dy = 10,
  regionId = 'jezero-test',
  datasetVersion = '1.0.0'
): RegionRoutingBundle {
  const n = width * height;
  return {
    regionId,
    datasetVersion,
    gridWidth: width,
    gridHeight: height,
    cellSpacingEastM: dx,
    cellSpacingNorthM: dy,
    noDataSentinel: -32768,
    roughnessScaleM: 0.5,
    qualityMappingVersion: 'fom-mapping-v1',
    elevationM: new Float32Array(n).fill(-2540.0),
    terrainSlopeDeg: new Float32Array(n).fill(0),
    roughnessNormalized: new Float32Array(n).fill(0),
    qualityCode: new Uint8Array(n).fill(QUALITY_CODE.ACCEPTABLE),
  };
}

function createBaseRequest(overrides: Partial<RouteRequest> = {}): RouteRequest {
  return {
    requestId: 'req-1',
    regionId: 'jezero-test',
    datasetVersion: '1.0.0',
    start: { eastM: 5, northM: 15 },
    destination: { eastM: 45, northM: 15 },
    policies: ['shortest', 'terrain', 'uncertainty'],
    qualityMode: 'prefer',
    profileId: 'educational-eva-v1',
    ...overrides,
  };
}

function createInlineCellAdmissibility(): CellAdmissibilityPort {
  return {
    getCellExclusionReason(bundle, row, col, profile, qualityMode): ExclusionReasonCode | null {
      if (
        !Number.isInteger(row) ||
        !Number.isInteger(col) ||
        row < 0 ||
        row >= bundle.gridHeight ||
        col < 0 ||
        col >= bundle.gridWidth
      ) {
        return 'OUT_OF_BOUNDS';
      }
      const k = row * bundle.gridWidth + col;
      const z = bundle.elevationM[k];
      if (!Number.isFinite(z) || Math.abs(z - bundle.noDataSentinel) <= 1e-5) {
        return 'NO_DATA';
      }
      const q = bundle.qualityCode[k];
      if (q === QUALITY_CODE.INVALID || q < 0 || q > 2) {
        return 'INTERPOLATED_OR_UNRELIABLE';
      }
      if (bundle.explicitExclusionMask && bundle.explicitExclusionMask[k] === 1) {
        return 'EXPLICIT_HAZARD_MASK';
      }
      const s = bundle.terrainSlopeDeg[k];
      const r = bundle.roughnessNormalized[k];
      if (
        (bundle.derivativeSupportMask && bundle.derivativeSupportMask[k] === 0) ||
        !Number.isFinite(s) ||
        !Number.isFinite(r)
      ) {
        return 'UNSUPPORTED_DERIVATIVE';
      }
      if (s > profile.maxTerrainSlopeDeg) {
        return 'MAX_TERRAIN_SLOPE_EXCEEDED';
      }
      if (qualityMode === 'strict' && q !== QUALITY_CODE.ACCEPTABLE) {
        return 'STRICT_QUALITY_EXCLUDED';
      }
      return null;
    },
  };
}

function createInlineEdgeEvaluator(cellAdmissibility: CellAdmissibilityPort): EdgeEvaluatorPort {
  return {
    isEdgeAdmissible(bundle, uIndex, vIndex, dir, profile, qualityMode): boolean {
      const w = bundle.gridWidth;
      const ur = Math.floor(uIndex / w);
      const uc = uIndex - ur * w;
      const vr = Math.floor(vIndex / w);
      const vc = vIndex - vr * w;
      if (cellAdmissibility.getCellExclusionReason(bundle, ur, uc, profile, qualityMode) !== null) return false;
      if (cellAdmissibility.getCellExclusionReason(bundle, vr, vc, profile, qualityMode) !== null) return false;
      if (DIR_IS_DIAG[dir] === 1) {
        if (cellAdmissibility.getCellExclusionReason(bundle, ur, vc, profile, qualityMode) !== null) return false;
        if (cellAdmissibility.getCellExclusionReason(bundle, vr, uc, profile, qualityMode) !== null) return false;
      }
      const dx = bundle.cellSpacingEastM;
      const dy = bundle.cellSpacingNorthM;
      const d = DIR_IS_DIAG[dir] === 1 ? Math.hypot(dx, dy) : DIR_DR[dir] !== 0 ? dy : dx;
      const dz = bundle.elevationM[vIndex] - bundle.elevationM[uIndex];
      const maxG =
        dz > 0
          ? (profile.maxUphillGradeDeg ?? profile.maxRouteGradeDeg)
          : dz < 0
            ? (profile.maxDownhillGradeDeg ?? profile.maxRouteGradeDeg)
            : profile.maxRouteGradeDeg;
      return Math.atan(Math.abs(dz) / d) * (180 / Math.PI) <= maxG + 1e-12;
    },

    computeEdgeCost(bundle, uIndex, vIndex, dir, profile, weights): number {
      const w = bundle.gridWidth;
      const ur = Math.floor(uIndex / w);
      const uc = uIndex - ur * w;
      const vr = Math.floor(vIndex / w);
      const vc = vIndex - vr * w;
      const dx = bundle.cellSpacingEastM;
      const dy = bundle.cellSpacingNorthM;
      const d = DIR_IS_DIAG[dir] === 1 ? Math.hypot(dx, dy) : DIR_DR[dir] !== 0 ? dy : dx;
      const S = Math.max(bundle.terrainSlopeDeg[uIndex], bundle.terrainSlopeDeg[vIndex]) / profile.maxTerrainSlopeDeg;
      const R = Math.max(0, Math.min(1, Math.max(bundle.roughnessNormalized[uIndex], bundle.roughnessNormalized[vIndex])));
      const uQ = QUALITY_PENALTY_BY_CODE[bundle.qualityCode[uIndex] as 0 | 1 | 2] ?? Number.POSITIVE_INFINITY;
      const vQ = QUALITY_PENALTY_BY_CODE[bundle.qualityCode[vIndex] as 0 | 1 | 2] ?? Number.POSITIVE_INFINITY;
      let U = Math.max(uQ, vQ);
      if (DIR_IS_DIAG[dir] === 1) {
        const w1Q = QUALITY_PENALTY_BY_CODE[bundle.qualityCode[ur * w + vc] as 0 | 1 | 2] ?? Number.POSITIVE_INFINITY;
        const w2Q = QUALITY_PENALTY_BY_CODE[bundle.qualityCode[vr * w + uc] as 0 | 1 | 2] ?? Number.POSITIVE_INFINITY;
        U = Math.max(U, w1Q, w2Q);
      }
      return d * (1 + weights.alpha * S + weights.beta * R + weights.gamma * U);
    },
  };
}

function createInlineDeps(hooks?: {
  onSolveAStar?: (weights: PolicyWeightVector, params: { startIndex: number; goalIndex: number }) => void;
  onComponents?: () => void;
}): EngineDependenciesPort {
  const cellAdmissibility = createInlineCellAdmissibility();
  const edgeEvaluator = createInlineEdgeEvaluator(cellAdmissibility);

  return {
    validateRegionBundle(bundle, requestId = 'bundle-load') {
      if (!bundle) {
        return {
          ok: false,
          error: {
            status: 'data_error',
            requestId,
            reasonCode: 'BUNDLE_NOT_LOADED',
            message: 'No bundle loaded.',
          },
        };
      }
      const { gridWidth, gridHeight, cellSpacingEastM, cellSpacingNorthM } = bundle;
      if (
        !Number.isInteger(gridWidth) ||
        gridWidth <= 0 ||
        !Number.isInteger(gridHeight) ||
        gridHeight <= 0 ||
        cellSpacingEastM <= 0 ||
        cellSpacingNorthM <= 0
      ) {
        return {
          ok: false,
          error: {
            status: 'data_error',
            requestId,
            reasonCode: 'INVALID_GRID_DIMENSIONS',
            message: 'Invalid dimensions.',
          },
        };
      }
      const n = gridWidth * gridHeight;
      if (
        bundle.elevationM.length !== n ||
        bundle.terrainSlopeDeg.length !== n ||
        bundle.roughnessNormalized.length !== n ||
        bundle.qualityCode.length !== n
      ) {
        return {
          ok: false,
          error: {
            status: 'data_error',
            requestId,
            reasonCode: 'ARRAY_LENGTH_MISMATCH',
            message: 'Array length mismatch.',
          },
        };
      }
      return { ok: true, cellCount: n };
    },

    validateRequestAgainstBundle(request, bundle) {
      const base = this.validateRegionBundle(bundle, request.requestId);
      if (!base.ok || !bundle) return base;
      if (request.regionId !== bundle.regionId) {
        return {
          ok: false,
          error: {
            status: 'data_error',
            requestId: request.requestId,
            reasonCode: 'REGION_MISMATCH',
            message: 'Region mismatch.',
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
            message: 'Dataset version mismatch.',
          },
        };
      }
      return base;
    },

    resolveConstraintProfile(profileId?: ConstraintProfileId, customProfile?: ConstraintProfile): ConstraintProfile {
      return customProfile ?? PROFILES[profileId ?? 'educational-eva-v1'] ?? PROFILES['educational-eva-v1'];
    },

    cellAdmissibility,
    edgeEvaluator,

    normalizeAndValidateEndpoints(request, bundle, profile, cellAdm) {
      if (!request.policies || request.policies.length === 0) {
        return {
          ok: false,
          error: {
            status: 'invalid_input',
            requestId: request.requestId,
            endpoint: 'request',
            reasonCode: 'EMPTY_POLICIES',
            message: 'Empty policies.',
          },
        };
      }
      const w = bundle.gridWidth;
      const h = bundle.gridHeight;
      const dx = bundle.cellSpacingEastM;
      const dy = bundle.cellSpacingNorthM;
      const maxE = w * dx;
      const maxN = h * dy;

      const normalize = (pt: { eastM: number; northM: number }, endpoint: 'start' | 'destination') => {
        if (
          !Number.isFinite(pt.eastM) ||
          !Number.isFinite(pt.northM) ||
          pt.eastM < 0 ||
          pt.eastM > maxE ||
          pt.northM < 0 ||
          pt.northM > maxN
        ) {
          return {
            ok: false as const,
            error: {
              status: 'invalid_input' as const,
              requestId: request.requestId,
              endpoint,
              reasonCode: 'OUT_OF_BOUNDS' as const,
              message: `${endpoint} out of bounds`,
            },
          };
        }
        const col = Math.min(w - 1, Math.max(0, Math.floor(pt.eastM / dx)));
        const row = Math.min(h - 1, Math.max(0, Math.floor((maxN - pt.northM) / dy)));
        const excl = cellAdm.getCellExclusionReason(bundle, row, col, profile, request.qualityMode);
        if (excl !== null) {
          return {
            ok: false as const,
            error: {
              status: 'invalid_input' as const,
              requestId: request.requestId,
              endpoint,
              reasonCode: excl,
              message: `${endpoint} excluded: ${excl}`,
            },
          };
        }
        return {
          ok: true as const,
          value: {
            requestedEastM: pt.eastM,
            requestedNorthM: pt.northM,
            col,
            row,
            cellIndex: row * w + col,
            cellCenterEastM: (col + 0.5) * dx,
            cellCenterNorthM: (h - 1 - row + 0.5) * dy,
          },
        };
      };

      const sRes = normalize(request.start, 'start');
      if (!sRes.ok) return sRes;
      const dRes = normalize(request.destination, 'destination');
      if (!dRes.ok) return dRes;
      return {
        ok: true,
        start: sRes.value,
        destination: dRes.value,
        isSameCell: sRes.value.cellIndex === dRes.value.cellIndex,
      };
    },

    resolveEffectivePolicyWeights(bundle, profile, qualityMode, cellAdm) {
      let minU = Number.POSITIVE_INFINITY;
      let maxU = Number.NEGATIVE_INFINITY;
      let count = 0;
      let seenCode = -1;
      let allSameCode = true;

      for (let r = 0; r < bundle.gridHeight; r++) {
        for (let c = 0; c < bundle.gridWidth; c++) {
          if (cellAdm.getCellExclusionReason(bundle, r, c, profile, qualityMode) === null) {
            const q = bundle.qualityCode[r * bundle.gridWidth + c];
            const u = QUALITY_PENALTY_BY_CODE[q as 0 | 1 | 2];
            if (u < minU) minU = u;
            if (u > maxU) maxU = u;
            if (seenCode === -1) seenCode = q;
            else if (seenCode !== q) allSameCode = false;
            count++;
          }
        }
      }
      if (count === 0) {
        minU = 0;
        maxU = 0;
      }
      const isQualityUniform = count === 0 || Math.abs(maxU - minU) <= 1e-9;
      const uniformQualityClass: QualityClass | null =
        isQualityUniform && count > 0 && allSameCode
          ? seenCode === 0
            ? 'acceptable'
            : seenCode === 1
              ? 'unknown'
              : 'low'
          : null;

      const effectiveWeights: Record<PolicyId, EffectivePolicyWeights> = {
        shortest: {
          policyId: 'shortest',
          nominal: { ...NOMINAL_POLICY_WEIGHTS.shortest },
          effective: { ...NOMINAL_POLICY_WEIGHTS.shortest },
          uniformQualityOverride: false,
          minAdmissibleU: minU,
          maxAdmissibleU: maxU,
        },
        terrain: {
          policyId: 'terrain',
          nominal: { ...NOMINAL_POLICY_WEIGHTS.terrain },
          effective: { ...NOMINAL_POLICY_WEIGHTS.terrain },
          uniformQualityOverride: false,
          minAdmissibleU: minU,
          maxAdmissibleU: maxU,
        },
        uncertainty: {
          policyId: 'uncertainty',
          nominal: { ...NOMINAL_POLICY_WEIGHTS.uncertainty },
          effective: isQualityUniform
            ? { alpha: 2, beta: 1, gamma: 0 }
            : { ...NOMINAL_POLICY_WEIGHTS.uncertainty },
          uniformQualityOverride: isQualityUniform,
          minAdmissibleU: minU,
          maxAdmissibleU: maxU,
        },
      };

      return { effectiveWeights, isQualityUniform, uniformQualityClass };
    },

    createWorkspace(capacity): SolverWorkspacePort {
      const heapPos = new Int32Array(capacity).fill(-1);
      const componentId = new Int32Array(capacity).fill(-1);
      return {
        capacity,
        currentSearchId: 0,
        gScore: new Float64Array(capacity),
        fScore: new Float64Array(capacity),
        crossScore: new Float64Array(capacity),
        parentIndex: new Int32Array(capacity),
        seenStamp: new Uint32Array(capacity),
        closedStamp: new Uint32Array(capacity),
        heapNodes: new Int32Array(capacity),
        heapPos,
        componentId,
        adjMask: new Uint8Array(capacity),
        bfsQueue: new Int32Array(capacity),
        beginSearch() {
          this.currentSearchId = (this.currentSearchId + 1) >>> 0;
          if (this.currentSearchId === 0) {
            this.seenStamp.fill(0);
            this.closedStamp.fill(0);
            this.currentSearchId = 1;
          }
          return this.currentSearchId;
        },
      };
    },

    computeConnectedComponentsAndAdjMask(
      bundle,
      profile,
      qualityMode,
      edgeEval,
      cellAdm,
      componentIdOut,
      adjMaskOut,
      bfsQueue
    ) {
      hooks?.onComponents?.();
      const w = bundle.gridWidth;
      const h = bundle.gridHeight;
      const n = w * h;
      componentIdOut.fill(-1);
      for (let u = 0; u < n; u++) {
        const ur = Math.floor(u / w);
        const uc = u - ur * w;
        let bits = 0;
        for (let dir = 0; dir < DIR_COUNT; dir++) {
          const vr = ur + DIR_DR[dir];
          const vc = uc + DIR_DC[dir];
          if (vr < 0 || vr >= h || vc < 0 || vc >= w) continue;
          const v = vr * w + vc;
          if (edgeEval.isEdgeAdmissible(bundle, u, v, dir, profile, qualityMode)) {
            bits |= 1 << dir;
          }
        }
        adjMaskOut[u] = bits;
      }

      let compId = 0;
      for (let u = 0; u < n; u++) {
        const ur = Math.floor(u / w);
        const uc = u - ur * w;
        if (componentIdOut[u] !== -1) continue;
        if (cellAdm.getCellExclusionReason(bundle, ur, uc, profile, qualityMode) !== null) continue;
        let head = 0;
        let tail = 0;
        componentIdOut[u] = compId;
        bfsQueue[tail++] = u;
        while (head < tail) {
          const cur = bfsQueue[head++];
          const cr = Math.floor(cur / w);
          const cc = cur - cr * w;
          const mask = adjMaskOut[cur];
          for (let dir = 0; dir < DIR_COUNT; dir++) {
            if ((mask & (1 << dir)) === 0) continue;
            const nxt = (cr + DIR_DR[dir]) * w + (cc + DIR_DC[dir]);
            if (componentIdOut[nxt] === -1) {
              componentIdOut[nxt] = compId;
              bfsQueue[tail++] = nxt;
            }
          }
        }
        compId++;
      }
      return { componentCount: compId };
    },

    solveAStar({
      bundle,
      workspace,
      startIndex,
      goalIndex,
      profile,
      qualityMode,
      weights,
      edgeEvaluator: edgeEval,
      adjMask,
      isCancelled,
      isTimedOut,
    }): SinglePolicySolveResult {
      hooks?.onSolveAStar?.(weights, { startIndex, goalIndex });
      if (startIndex === goalIndex) {
        return { status: 'success', cellIndices: [startIndex], totalCost: 0, exploredNodes: 0 };
      }
      if (isCancelled?.()) {
        return { status: 'cancelled', cellIndices: [], totalCost: Number.POSITIVE_INFINITY, exploredNodes: 0 };
      }
      if (isTimedOut?.()) {
        return { status: 'timeout', cellIndices: [], totalCost: Number.POSITIVE_INFINITY, exploredNodes: 0 };
      }

      const w = bundle.gridWidth;
      const h = bundle.gridHeight;
      const n = w * h;
      const searchId = workspace.beginSearch();
      const { gScore, fScore, parentIndex, seenStamp, closedStamp } = workspace;
      const open: number[] = [startIndex];
      seenStamp[startIndex] = searchId;
      gScore[startIndex] = 0;
      const gr = Math.floor(goalIndex / w);
      const gc = goalIndex - gr * w;
      const sr = Math.floor(startIndex / w);
      const sc = startIndex - sr * w;
      fScore[startIndex] = Math.hypot((sc - gc) * bundle.cellSpacingEastM, (gr - sr) * bundle.cellSpacingNorthM);
      parentIndex[startIndex] = -1;
      let explored = 0;

      while (open.length > 0) {
        if (isCancelled?.()) {
          return { status: 'cancelled', cellIndices: [], totalCost: Number.POSITIVE_INFINITY, exploredNodes: explored };
        }
        if (isTimedOut?.()) {
          return { status: 'timeout', cellIndices: [], totalCost: Number.POSITIVE_INFINITY, exploredNodes: explored };
        }
        open.sort((a, b) => fScore[a] - fScore[b] || gScore[b] - gScore[a] || a - b);
        const u = open.shift()!;
        closedStamp[u] = searchId;
        explored++;
        if (u === goalIndex) {
          const path: number[] = [];
          let curr = goalIndex;
          while (curr !== -1 && path.length <= n) {
            path.push(curr);
            if (curr === startIndex) break;
            curr = parentIndex[curr];
          }
          path.reverse();
          return { status: 'success', cellIndices: path, totalCost: gScore[goalIndex], exploredNodes: explored };
        }
        const ur = Math.floor(u / w);
        const uc = u - ur * w;
        const mask = adjMask ? adjMask[u] : 0xff;
        for (let dir = 0; dir < DIR_COUNT; dir++) {
          if (adjMask && (mask & (1 << dir)) === 0) continue;
          const vr = ur + DIR_DR[dir];
          const vc = uc + DIR_DC[dir];
          if (vr < 0 || vr >= h || vc < 0 || vc >= w) continue;
          const v = vr * w + vc;
          if (closedStamp[v] === searchId) continue;
          if (!adjMask && !edgeEval.isEdgeAdmissible(bundle, u, v, dir, profile, qualityMode)) continue;
          const candG = gScore[u] + edgeEval.computeEdgeCost(bundle, u, v, dir, profile, weights);
          if (seenStamp[v] !== searchId) {
            seenStamp[v] = searchId;
            gScore[v] = candG;
            fScore[v] = candG + Math.hypot((vc - gc) * bundle.cellSpacingEastM, (gr - vr) * bundle.cellSpacingNorthM);
            parentIndex[v] = u;
            open.push(v);
          } else if (candG < gScore[v]) {
            const hv = fScore[v] - gScore[v];
            gScore[v] = candG;
            fScore[v] = candG + hv;
            parentIndex[v] = u;
          }
        }
      }
      return { status: 'no_path', cellIndices: [], totalCost: Number.POSITIVE_INFINITY, exploredNodes: explored };
    },

    computeDistanceAndTimeMetrics(bundle, cellIndices, profile, scienceStopDurationS = 0) {
      const w = bundle.gridWidth;
      let horiz = 0;
      let surf = 0;
      let gradeTime = 0;
      for (let i = 1; i < cellIndices.length; i++) {
        const u = cellIndices[i - 1];
        const v = cellIndices[i];
        const ur = Math.floor(u / w);
        const uc = u - ur * w;
        const vr = Math.floor(v / w);
        const vc = v - vr * w;
        const d = Math.hypot((vc - uc) * bundle.cellSpacingEastM, (ur - vr) * bundle.cellSpacingNorthM);
        const dz = bundle.elevationM[v] - bundle.elevationM[u];
        const d3 = Math.hypot(d, dz);
        const gDeg = d > 0 ? Math.atan(Math.abs(dz) / d) * (180 / Math.PI) : 0;
        const sMax = Math.max(bundle.terrainSlopeDeg[u], bundle.terrainSlopeDeg[v]);
        const ratio = Math.max(gDeg, sMax) / profile.maxTerrainSlopeDeg;
        const vEff = profile.nominalWalkingSpeedMps / (1 + profile.gradePenaltyKappa * ratio * ratio);
        horiz += d;
        surf += d3;
        gradeTime += d3 / vEff;
      }
      return {
        horizontalDistanceM: horiz,
        surfaceDistanceM: surf,
        estimatedTimeS: surf / profile.nominalWalkingSpeedMps + scienceStopDurationS,
        gradeAdjustedTimeS: gradeTime + scienceStopDurationS,
      };
    },

    computeElevationAndSlopeMetrics(bundle, cellIndices, profile) {
      const w = bundle.gridWidth;
      const h = bundle.gridHeight;
      let asc = 0;
      let desc = 0;
      let maxSlope = -1;
      let maxSlopeDist = 0;
      let maxSlopeIdx = cellIndices[0] ?? 0;
      let maxGrade = 0;
      let maxUp = 0;
      let maxDown = 0;
      let maxGradeDist = 0;
      let srCost = 0;
      let rCost = 0;
      let horiz = 0;
      let surf = 0;
      const elevationProfile: ElevationProfilePoint[] = [];

      for (let i = 0; i < cellIndices.length; i++) {
        const k = cellIndices[i];
        const r = Math.floor(k / w);
        const c = k - r * w;
        let incomingGrade = 0;
        if (i > 0) {
          const prev = cellIndices[i - 1];
          const pr = Math.floor(prev / w);
          const pc = prev - pr * w;
          const d = Math.hypot((c - pc) * bundle.cellSpacingEastM, (pr - r) * bundle.cellSpacingNorthM);
          const dz = bundle.elevationM[k] - bundle.elevationM[prev];
          horiz += d;
          surf += Math.hypot(d, dz);
          if (dz > 0) asc += dz;
          else desc += -dz;
          const gAbs = Math.atan(Math.abs(dz) / d) * (180 / Math.PI);
          incomingGrade = Math.atan(dz / d) * (180 / Math.PI);
          if (gAbs > maxGrade) {
            maxGrade = gAbs;
            maxGradeDist = horiz;
          }
          if (dz > 0 && gAbs > maxUp) maxUp = gAbs;
          if (dz < 0 && gAbs > maxDown) maxDown = gAbs;
          const S = Math.max(bundle.terrainSlopeDeg[prev], bundle.terrainSlopeDeg[k]) / profile.maxTerrainSlopeDeg;
          const R = Math.max(bundle.roughnessNormalized[prev], bundle.roughnessNormalized[k]);
          srCost += d * (2 * S + R);
          rCost += d * R;
        }
        const s = bundle.terrainSlopeDeg[k];
        if (s > maxSlope) {
          maxSlope = s;
          maxSlopeDist = horiz;
          maxSlopeIdx = k;
        }
        const q = bundle.qualityCode[k];
        elevationProfile.push({
          sampleIndex: i,
          cellIndex: k,
          row: r,
          col: c,
          eastM: (c + 0.5) * bundle.cellSpacingEastM,
          northM: (h - 1 - r + 0.5) * bundle.cellSpacingNorthM,
          distanceM: horiz,
          surfaceDistanceM: surf,
          elevationM: bundle.elevationM[k],
          terrainSlopeDeg: s,
          incomingGradeDeg: incomingGrade,
          qualityClass: q === 0 ? 'acceptable' : q === 1 ? 'unknown' : q === 2 ? 'low' : 'invalid',
        });
      }
      return {
        cumulativeAscentM: asc,
        cumulativeDescentM: desc,
        netElevationChangeM: cellIndices.length > 0 ? bundle.elevationM[cellIndices[cellIndices.length - 1]] - bundle.elevationM[cellIndices[0]] : 0,
        maxTerrainSlopeDeg: Math.max(0, maxSlope),
        maxTerrainSlopeAtDistanceM: maxSlopeDist,
        maxTerrainSlopeCellIndex: maxSlopeIdx,
        maxRouteGradeDeg: maxGrade,
        maxUphillGradeDeg: maxUp,
        maxDownhillGradeDeg: maxDown,
        maxRouteGradeAtDistanceM: maxGradeDist,
        integratedTerrainPenaltyCostM: srCost,
        integratedRoughnessPenaltyCostM: rCost,
        gridSpacingM: { dx: bundle.cellSpacingEastM, dy: bundle.cellSpacingNorthM },
        slopeBaselineM: { eastM: 2 * bundle.cellSpacingEastM, northM: 2 * bundle.cellSpacingNorthM },
        elevationProfile,
      };
    },

    computeQualityExposureMetrics(bundle, cellIndices) {
      const w = bundle.gridWidth;
      let lowD = 0;
      let unkD = 0;
      let accD = 0;
      let totalD = 0;
      for (let i = 1; i < cellIndices.length; i++) {
        const u = cellIndices[i - 1];
        const v = cellIndices[i];
        const ur = Math.floor(u / w);
        const uc = u - ur * w;
        const vr = Math.floor(v / w);
        const vc = v - vr * w;
        const d = Math.hypot((vc - uc) * bundle.cellSpacingEastM, (ur - vr) * bundle.cellSpacingNorthM);
        totalD += d;
        const qs = [bundle.qualityCode[u], bundle.qualityCode[v]];
        if (Math.abs(vr - ur) === 1 && Math.abs(vc - uc) === 1) {
          qs.push(bundle.qualityCode[ur * w + vc], bundle.qualityCode[vr * w + uc]);
        }
        if (qs.includes(QUALITY_CODE.LOW)) lowD += d;
        else if (qs.includes(QUALITY_CODE.UNKNOWN)) unkD += d;
        else accD += d;
      }
      return {
        lowQualityDistanceM: lowD,
        lowQualityPct: totalD > 0 ? (100 * lowD) / totalD : 0,
        unknownQualityDistanceM: unkD,
        unknownQualityPct: totalD > 0 ? (100 * unkD) / totalD : 0,
        acceptableQualityDistanceM: accD,
        acceptableQualityPct: totalD > 0 ? (100 * accD) / totalD : 0,
        weightedUncertaintyExposureM: lowD + 0.75 * unkD,
        qualityIntervals: [],
      };
    },

    buildDraped3DRoutePolyline(bundle, cellIndices) {
      const w = bundle.gridWidth;
      const h = bundle.gridHeight;
      return cellIndices.map((k) => {
        const r = Math.floor(k / w);
        const c = k - r * w;
        const z = bundle.elevationM[k];
        return {
          eastM: (c + 0.5) * bundle.cellSpacingEastM,
          northM: (h - 1 - r + 0.5) * bundle.cellSpacingNorthM,
          baseElevationM: z,
          worldY: z + 0.35,
          isSubdividedMidpoint: false,
        };
      });
    },

    deduplicatePolicyPaths(requestedPolicies, solvedByPolicy) {
      const canonical: PolicyId[] = ['shortest', 'terrain', 'uncertainty'];
      const active = canonical.filter((p) => requestedPolicies.includes(p) && solvedByPolicy[p]?.status === 'success');
      const groups: Array<{
        candidateId: string;
        matchedPolicies: PolicyId[];
        primaryPolicy: PolicyId;
        solveResult: SinglePolicySolveResult;
      }> = [];

      for (const policy of active) {
        const res = solvedByPolicy[policy]!;
        const match = groups.find(
          (g) =>
            g.solveResult.cellIndices.length === res.cellIndices.length &&
            g.solveResult.cellIndices.every((v, idx) => v === res.cellIndices[idx])
        );
        if (match) {
          match.matchedPolicies.push(policy);
        } else {
          groups.push({
            candidateId: `candidate-${groups.length + 1}`,
            matchedPolicies: [policy],
            primaryPolicy: policy,
            solveResult: res,
          });
        }
      }

      let equivalenceTopology: EquivalenceTopology = 'subset_request';
      if (active.length === 3) {
        if (groups.length === 1) equivalenceTopology = 'case_1_all_three_merged';
        else if (groups.length === 3) equivalenceTopology = 'case_5_all_three_distinct';
        else if (groups.some((g) => g.matchedPolicies.includes('terrain') && g.matchedPolicies.includes('uncertainty'))) {
          equivalenceTopology = 'case_2_terrain_uncertainty_merged';
        } else if (groups.some((g) => g.matchedPolicies.includes('shortest') && g.matchedPolicies.includes('terrain'))) {
          equivalenceTopology = 'case_3_shortest_terrain_merged';
        } else {
          equivalenceTopology = 'case_4_shortest_uncertainty_merged';
        }
      }
      return { groups, equivalenceTopology };
    },

    buildReturnLeg({ bundle, outboundCellIndices, profile, qualityMode, edgeEvaluator: edgeEval, computeMetrics, resolveReturnPathIfAsymmetric }): ReturnLegResult {
      const reversed = [...outboundCellIndices].reverse();
      const w = bundle.gridWidth;
      let allValid = true;
      for (let i = 1; i < reversed.length; i++) {
        const u = reversed[i - 1];
        const v = reversed[i];
        const dr = Math.floor(v / w) - Math.floor(u / w);
        const dc = (v % w) - (u % w);
        let dir = -1;
        for (let d = 0; d < DIR_COUNT; d++) {
          if (DIR_DR[d] === dr && DIR_DC[d] === dc) {
            dir = d;
            break;
          }
        }
        if (dir < 0 || !edgeEval.isEdgeAdmissible(bundle, u, v, dir, profile, qualityMode)) {
          allValid = false;
          break;
        }
      }
      if (!allValid && resolveReturnPathIfAsymmetric) {
        const alt = resolveReturnPathIfAsymmetric();
        if (alt.status === 'success') {
          return {
            status: 'complete',
            cellIndices: alt.cellIndices,
            polylineMeters: alt.cellIndices.map((k) => ({
              eastM: ((k % w) + 0.5) * bundle.cellSpacingEastM,
              northM: (bundle.gridHeight - 1 - Math.floor(k / w) + 0.5) * bundle.cellSpacingNorthM,
            })),
            metrics: computeMetrics(alt.cellIndices),
          };
        }
        return {
          status: 'incomplete_round_trip',
          cellIndices: [],
          polylineMeters: [],
          failureReason: 'RETURN_PATH_INFEASIBLE_UNDER_DIRECTIONAL_GRADE_LIMIT',
        };
      }
      return {
        status: 'complete',
        cellIndices: reversed,
        polylineMeters: reversed.map((k) => ({
          eastM: ((k % w) + 0.5) * bundle.cellSpacingEastM,
          northM: (bundle.gridHeight - 1 - Math.floor(k / w) + 0.5) * bundle.cellSpacingNorthM,
        })),
        metrics: computeMetrics(reversed),
      };
    },

    buildCandidateExplanations({ candidates, effectiveWeights }): RouteExplanation[] {
      return candidates.map((c) => ({
        summary: `Policies ${c.matchedPolicies.join(', ')}: ${c.metrics.horizontalDistanceM.toFixed(1)} m.`,
        bullets: [],
        reasonCodes:
          c.matchedPolicies.includes('uncertainty') && effectiveWeights.uncertainty.uniformQualityOverride
            ? ['UNIFORM_QUALITY_NO_DIFFERENTIATION']
            : [],
      }));
    },
  };
}

describe('T28 Stateful Multi-Policy Routing Engine & Clean-Path Coordinator', () => {
  it('executes requested policies in terrain -> uncertainty -> shortest order', () => {
    const executionOrder: string[] = [];
    const deps = createInlineDeps({
      onSolveAStar(weights) {
        if (weights.alpha === 0 && weights.beta === 0 && weights.gamma === 0) executionOrder.push('shortest');
        else if (weights.alpha === 2 && weights.beta === 1 && weights.gamma === 0) executionOrder.push('terrain');
        else if (weights.alpha === 2 && weights.beta === 1 && weights.gamma === 2) executionOrder.push('uncertainty');
      },
    });
    const engine = new RoutingEngine(deps);

    // Build F08 5x5 grid so all 3 policies take distinct corridors and uncertainty does NOT reuse terrain
    const bundle = createTestBundle(5, 5, 10, 10);
    for (const c of [1, 2, 3]) {
      bundle.terrainSlopeDeg[2 * 5 + c] = 15;
      bundle.roughnessNormalized[2 * 5 + c] = 0.5;
    }
    bundle.qualityCode[0 * 5 + 2] = QUALITY_CODE.LOW;
    bundle.qualityCode[1 * 5 + 2] = QUALITY_CODE.LOW;
    bundle.terrainSlopeDeg[3 * 5 + 2] = 5;
    bundle.terrainSlopeDeg[4 * 5 + 2] = 5;

    expect(engine.loadBundle(bundle).ok).toBe(true);

    // Request in reverse order to confirm engine enforces terrain -> uncertainty -> shortest
    const response = engine.planRoutes(
      createBaseRequest({
        start: { eastM: 5, northM: 25 },       // (2,0)
        destination: { eastM: 45, northM: 25 }, // (2,4)
        policies: ['shortest', 'uncertainty', 'terrain'],
      })
    );

    expect(response.status).toBe('success');
    if (response.status !== 'success') return;
    expect(executionOrder).toEqual(['terrain', 'uncertainty', 'shortest']);
    expect(response.equivalenceTopology).toBe('case_5_all_three_distinct');
    expect(response.candidates).toHaveLength(3);
  });

  it('reuses terrain path under uniform quality (gamma_eff = 0) without a second A* search', () => {
    const solvedWeights: PolicyWeightVector[] = [];
    const deps = createInlineDeps({
      onSolveAStar(weights) {
        solvedWeights.push(weights);
      },
    });
    const engine = new RoutingEngine(deps);

    // F09A: 3x5 uniform UNKNOWN quality, center (1,2) slope=10deg
    const bundle = createTestBundle(5, 3, 10, 10);
    bundle.qualityCode.fill(QUALITY_CODE.UNKNOWN);
    bundle.terrainSlopeDeg[1 * 5 + 2] = 10;

    engine.loadBundle(bundle);
    const res = engine.planRoutes(
      createBaseRequest({
        start: { eastM: 5, northM: 15 },
        destination: { eastM: 45, northM: 15 },
        policies: ['shortest', 'terrain', 'uncertainty'],
      })
    );

    expect(res.status).toBe('success');
    if (res.status !== 'success') return;
    // A* ran ONLY twice: once for terrain, once for shortest (uncertainty reused terrain!)
    expect(solvedWeights).toHaveLength(2);
    expect(solvedWeights[0]).toEqual({ alpha: 2, beta: 1, gamma: 0 });
    expect(solvedWeights[1]).toEqual({ alpha: 0, beta: 0, gamma: 0 });
    expect(res.effectiveWeights.uncertainty.effective.gamma).toBe(0);
    expect(res.effectiveWeights.uncertainty.uniformQualityOverride).toBe(true);
    expect(res.reasonCodes).toContain('UNIFORM_QUALITY_NO_DIFFERENTIATION');
    expect(res.equivalenceTopology).toBe('case_2_terrain_uncertainty_merged');
    const uncCandidate = res.candidates.find((c) => c.matchedPolicies.includes('uncertainty'));
    expect(uncCandidate?.totalCost).toBeCloseTo(20 + 20 * Math.SQRT2, 9);
    expect(uncCandidate?.cellIndices).toEqual([5, 6, 2, 8, 9]);
  });

  it('reuses clean terrain path (corner-aware U(e) = 0) on mixed-quality bundle without a second search', () => {
    const solvedPolicies: string[] = [];
    const deps = createInlineDeps({
      onSolveAStar(weights) {
        solvedPolicies.push(`${weights.alpha}-${weights.beta}-${weights.gamma}`);
      },
    });
    const engine = new RoutingEngine(deps);

    // 3x5 mixed quality: middle row (1,1),(1,2),(1,3) has slope 15 deg and (1,2) is LOW,
    // so terrain takes north detour [5,1,2,3,9] where every edge & orthogonal corner is ACCEPTABLE (U(e) = 0).
    const bundle = createTestBundle(5, 3, 10, 10);
    bundle.terrainSlopeDeg[1 * 5 + 1] = 15;
    bundle.terrainSlopeDeg[1 * 5 + 2] = 15;
    bundle.terrainSlopeDeg[1 * 5 + 3] = 15;
    bundle.qualityCode[1 * 5 + 2] = QUALITY_CODE.LOW;

    engine.loadBundle(bundle);
    const res = engine.planRoutes(
      createBaseRequest({
        start: { eastM: 5, northM: 15 },
        destination: { eastM: 45, northM: 15 },
        policies: ['shortest', 'terrain', 'uncertainty'],
      })
    );

    expect(res.status).toBe('success');
    if (res.status !== 'success') return;
    expect(solvedPolicies).toEqual(['2-1-0', '0-0-0']);
    expect(res.effectiveWeights.uncertainty.uniformQualityOverride).toBe(false);
    expect(res.reasonCodes).toContain('TERRAIN_ALREADY_OPTIMAL_FOR_UNCERTAINTY');
    expect(res.reasonCodes).not.toContain('UNIFORM_QUALITY_NO_DIFFERENTIATION');
    expect(res.equivalenceTopology).toBe('case_2_terrain_uncertainty_merged');
  });

  it('does NOT trigger clean-path reuse when terrain diagonal clips a LOW orthogonal corner', () => {
    const solvedPolicies: string[] = [];
    const deps = createInlineDeps({
      onSolveAStar(weights) {
        solvedPolicies.push(`${weights.alpha}-${weights.beta}-${weights.gamma}`);
      },
    });
    const engine = new RoutingEngine(deps);

    // 3x5 grid: terrain goes [5, 6, 2, 8, 9]? Force terrain through diagonal (1,1)->(0,2) whose orthogonal corner (1,2) is LOW:
    // Put slope 15 deg on (1,2), (0,1), (0,3) so terrain picks [(1,0),(1,1),(0,2),(1,3),(1,4)] = [5,6,2,8,9]
    // Note [5,6,2,8,9] touches ZERO LOW vertices directly, ONLY corners (1,2)!
    const bundle = createTestBundle(5, 3, 10, 10);
    bundle.terrainSlopeDeg[1 * 5 + 2] = 15;
    bundle.terrainSlopeDeg[0 * 5 + 1] = 15;
    bundle.terrainSlopeDeg[0 * 5 + 3] = 15;
    bundle.qualityCode[1 * 5 + 2] = QUALITY_CODE.LOW;

    engine.loadBundle(bundle);
    const res = engine.planRoutes(
      createBaseRequest({
        start: { eastM: 5, northM: 15 },
        destination: { eastM: 45, northM: 15 },
        policies: ['terrain', 'uncertainty'],
      })
    );

    expect(res.status).toBe('success');
    if (res.status !== 'success') return;
    // Clean-path reuse must NOT trigger because diagonal steps (1,1)->(0,2) and (0,2)->(1,3) clip LOW corner (1,2)!
    expect(solvedPolicies).toEqual(['2-1-0', '2-1-2']);
    expect(res.reasonCodes).not.toContain('TERRAIN_ALREADY_OPTIMAL_FOR_UNCERTAINTY');
  });

  it('supports standalone ["uncertainty"] requests without requiring or injecting "terrain" (Finding 7)', () => {
    const solvedPolicies: PolicyWeightVector[] = [];
    const deps = createInlineDeps({
      onSolveAStar(weights) {
        solvedPolicies.push(weights);
      },
    });
    const engine = new RoutingEngine(deps);

    // F09B: uniform UNKNOWN quality with standalone ['uncertainty']
    const uniformBundle = createTestBundle(5, 3, 10, 10);
    uniformBundle.qualityCode.fill(QUALITY_CODE.UNKNOWN);
    uniformBundle.terrainSlopeDeg[1 * 5 + 2] = 10;

    engine.loadBundle(uniformBundle);
    const uniformRes = engine.planRoutes(
      createBaseRequest({
        start: { eastM: 5, northM: 15 },
        destination: { eastM: 45, northM: 15 },
        policies: ['uncertainty'],
      })
    );

    expect(uniformRes.status).toBe('success');
    if (uniformRes.status !== 'success') return;
    expect(solvedPolicies).toEqual([{ alpha: 2, beta: 1, gamma: 0 }]);
    expect(uniformRes.equivalenceTopology).toBe('subset_request');
    expect(uniformRes.candidates).toHaveLength(1);
    expect(uniformRes.candidates[0].matchedPolicies).toEqual(['uncertainty']);
    expect(uniformRes.candidates[0].totalCost).toBeCloseTo(20 + 20 * Math.SQRT2, 9);
    expect(uniformRes.candidates[0].cellIndices).toEqual([5, 6, 2, 8, 9]);
    expect(uniformRes.policyStatuses).toEqual({ uncertainty: 'success' });
    expect(uniformRes.reasonCodes).toContain('UNIFORM_QUALITY_NO_DIFFERENTIATION');

    // Mixed quality standalone ['uncertainty'] (F06)
    solvedPolicies.length = 0;
    const f06 = createTestBundle(5, 3, 10, 10);
    f06.qualityCode[1 * 5 + 2] = QUALITY_CODE.LOW;
    engine.loadBundle(f06);
    const mixedRes = engine.planRoutes(
      createBaseRequest({
        start: { eastM: 5, northM: 15 },
        destination: { eastM: 45, northM: 15 },
        policies: ['uncertainty'],
      })
    );
    expect(mixedRes.status).toBe('success');
    if (mixedRes.status !== 'success') return;
    expect(solvedPolicies).toEqual([{ alpha: 2, beta: 1, gamma: 2 }]);
    expect(mixedRes.candidates[0].matchedPolicies).toEqual(['uncertainty']);
    expect(mixedRes.candidates[0].cellIndices).toEqual([5, 1, 2, 3, 9]);
  });

  it('returns partial-policy success when timeout occurs before shortest, and full timeout when 0 policies finish', () => {
    const bundle = createTestBundle(5, 5, 10, 10);
    for (const c of [1, 2, 3]) bundle.terrainSlopeDeg[2 * 5 + c] = 15;
    bundle.qualityCode[1 * 5 + 2] = QUALITY_CODE.LOW;

    let astarInvocations = 0;
    const deps = createInlineDeps({
      onSolveAStar() {
        astarInvocations++;
      },
    });
    const engine = new RoutingEngine(deps);
    engine.loadBundle(bundle);

    // Timeout kicks in when the 3rd policy (shortest) starts (3rd A* call)
    const partialRes = engine.planRoutes(
      createBaseRequest({
        start: { eastM: 5, northM: 25 },
        destination: { eastM: 45, northM: 25 },
        policies: ['shortest', 'terrain', 'uncertainty'],
      }),
      { isTimedOut: () => astarInvocations >= 3 }
    );

    expect(partialRes.status).toBe('success');
    if (partialRes.status !== 'success') return;
    expect(partialRes.policyStatuses).toEqual({
      terrain: 'success',
      uncertainty: 'success',
      shortest: 'timeout',
    });
    expect(partialRes.reasonCodes).toContain('PARTIAL_POLICY_TIMEOUT');
    expect(partialRes.equivalenceTopology).toBe('subset_request');

    // Immediate timeout -> top-level timeout
    const fullTimeout = engine.planRoutes(
      createBaseRequest({
        start: { eastM: 5, northM: 25 },
        destination: { eastM: 45, northM: 25 },
      }),
      { isTimedOut: () => true }
    );
    expect(fullTimeout.status).toBe('timeout');
    if (fullTimeout.status === 'timeout') {
      expect(fullTimeout.completedPolicies).toEqual([]);
    }
  });

  it('returns top-level cancelled if cancelled immediately or mid-request', () => {
    const bundle = createTestBundle(5, 5, 10, 10);
    bundle.qualityCode[1 * 5 + 2] = QUALITY_CODE.LOW;
    let astarInvocations = 0;
    const deps = createInlineDeps({
      onSolveAStar() {
        astarInvocations++;
      },
    });
    const engine = new RoutingEngine(deps);
    engine.loadBundle(bundle);

    const immediateCancel = engine.planRoutes(
      createBaseRequest({ start: { eastM: 5, northM: 25 }, destination: { eastM: 45, northM: 25 } }),
      { isCancelled: () => true }
    );
    expect(immediateCancel.status).toBe('cancelled');
    expect(astarInvocations).toBe(0);

    const midCancel = engine.planRoutes(
      createBaseRequest({ start: { eastM: 5, northM: 25 }, destination: { eastM: 45, northM: 25 } }),
      { isCancelled: () => astarInvocations >= 1 }
    );
    expect(midCancel.status).toBe('cancelled');
  });

  it('caches component maps per (profile, qualityMode) and detects disconnected basins without running A*', () => {
    let componentBuilds = 0;
    let astarRuns = 0;
    const deps = createInlineDeps({
      onComponents: () => {
        componentBuilds++;
      },
      onSolveAStar: () => {
        astarRuns++;
      },
    });
    const engine = new RoutingEngine(deps);

    // 5x5 with LOW column at c=2: connected in 'prefer', disconnected in 'strict'
    const bundle = createTestBundle(5, 5, 10, 10);
    for (let r = 0; r < 5; r++) {
      bundle.qualityCode[r * 5 + 2] = QUALITY_CODE.LOW;
    }
    engine.loadBundle(bundle);

    const req = createBaseRequest({ start: { eastM: 5, northM: 25 }, destination: { eastM: 45, northM: 25 } });
    const res1 = engine.planRoutes(req);
    expect(res1.status).toBe('success');
    expect(componentBuilds).toBe(1);

    // Second query with same profile & qualityMode hits cache!
    const res2 = engine.planRoutes(req);
    expect(res2.status).toBe('success');
    expect(componentBuilds).toBe(1);

    // Switching to 'strict' builds a new component map and returns STRICT_QUALITY_BLOCKED without A*
    const astarBeforeStrict = astarRuns;
    const strictRes = engine.planRoutes({ ...req, qualityMode: 'strict' });
    expect(componentBuilds).toBe(2);
    expect(astarRuns).toBe(astarBeforeStrict);
    expect(strictRes.status).toBe('no_path');
    if (strictRes.status === 'no_path') {
      expect(strictRes.reasonCode).toBe('STRICT_QUALITY_BLOCKED');
    }

    // Reloading bundle invalidates component cache
    engine.loadBundle(bundle);
    engine.planRoutes(req);
    expect(componentBuilds).toBe(3);
  });

  it('handles validation errors, Stage 5 before Stage 6 same-cell, and round-trip return legs', () => {
    const deps = createInlineDeps();
    const engine = new RoutingEngine(deps);

    // Unloaded bundle -> BUNDLE_NOT_LOADED
    const unloaded = engine.planRoutes(createBaseRequest());
    expect(unloaded.status).toBe('data_error');
    if (unloaded.status === 'data_error') {
      expect(unloaded.reasonCode).toBe('BUNDLE_NOT_LOADED');
    }

    const bundle = createTestBundle(5, 5, 5, 5);
    engine.loadBundle(bundle);

    // Region / datasetVersion mismatches
    const wrongRegion = engine.planRoutes(createBaseRequest({ regionId: 'other' }));
    expect(wrongRegion.status).toBe('data_error');
    if (wrongRegion.status === 'data_error') expect(wrongRegion.reasonCode).toBe('REGION_MISMATCH');

    const wrongVer = engine.planRoutes(createBaseRequest({ datasetVersion: '9.9.9' }));
    expect(wrongVer.status).toBe('data_error');
    if (wrongVer.status === 'data_error') expect(wrongVer.reasonCode).toBe('DATASET_VERSION_MISMATCH');

    // Same-cell admissible with returnToStart and scienceStopDurationS
    const sameValid = engine.planRoutes(
      createBaseRequest({
        start: { eastM: 11.1, northM: 14.2 },
        destination: { eastM: 13.9, northM: 10.4 },
        returnToStart: true,
        scienceStopDurationS: 120,
      })
    );
    expect(sameValid.status).toBe('success');
    if (sameValid.status === 'success') {
      expect(sameValid.candidates[0].cellIndices).toEqual([12]);
      expect(sameValid.candidates[0].metrics.estimatedTimeS).toBe(120);
      expect(sameValid.candidates[0].returnLeg?.status).toBe('complete');
      expect(sameValid.candidates[0].returnLeg?.cellIndices).toEqual([12]);
    }

    // F05B: same-cell inside INTERPOLATED cell rejected by Stage 5 BEFORE Stage 6 shortcut
    bundle.qualityCode[12] = QUALITY_CODE.INVALID;
    const sameInvalid = engine.planRoutes(
      createBaseRequest({
        start: { eastM: 11.1, northM: 14.2 },
        destination: { eastM: 13.9, northM: 10.4 },
        qualityMode: 'prefer',
      })
    );
    expect(sameInvalid.status).toBe('invalid_input');
    if (sameInvalid.status === 'invalid_input') {
      expect(sameInvalid.reasonCode).toBe('INTERPOLATED_OR_UNRELIABLE');
    }
  });

  it('supports optional draped3DPolyline and asymmetric directional return-leg fallback', () => {
    // 1x3 grid with uphill step 0 -> 1 -> 2 climbing +2.68m per 10m step (~15 deg grade)
    const bundle = createTestBundle(3, 1, 10, 10);
    bundle.elevationM[0] = -2540.0;
    bundle.elevationM[1] = -2537.32;
    bundle.elevationM[2] = -2534.64;

    const depsWithDraping = createInlineDeps();
    const engineWithDraping = new RoutingEngine(depsWithDraping);
    engineWithDraping.loadBundle(bundle);

    const asymProfile: ConstraintProfile = {
      profileId: 'asym-test',
      version: '1.0.0',
      maxTerrainSlopeDeg: 20,
      maxRouteGradeDeg: 20,
      maxUphillGradeDeg: 20,
      maxDownhillGradeDeg: 10, // Downhill > 10 deg blocked on return!
      roughnessScaleM: 0.5,
      nominalWalkingSpeedMps: 0.5,
      gradePenaltyKappa: 1.5,
      isSimulatedAssumption: true,
    };

    const asymRes = engineWithDraping.planRoutes(
      createBaseRequest({
        start: { eastM: 5, northM: 5 },
        destination: { eastM: 25, northM: 5 },
        policies: ['shortest'],
        customProfile: asymProfile,
        returnToStart: true,
      })
    );
    expect(asymRes.status).toBe('success');
    if (asymRes.status === 'success') {
      expect(asymRes.candidates[0].draped3DPolyline).toBeDefined();
      expect(asymRes.candidates[0].returnLeg?.status).toBe('incomplete_round_trip');
      expect(asymRes.candidates[0].returnLeg?.failureReason).toBe(
        'RETURN_PATH_INFEASIBLE_UNDER_DIRECTIONAL_GRADE_LIMIT'
      );
    }

    // Without optional buildDraped3DRoutePolyline, draped3DPolyline is omitted cleanly
    const depsNoDraping = createInlineDeps();
    delete depsNoDraping.buildDraped3DRoutePolyline;
    const engineNoDraping = new RoutingEngine(depsNoDraping);
    engineNoDraping.loadBundle(bundle);
    const plainRes = engineNoDraping.planRoutes(
      createBaseRequest({
        start: { eastM: 5, northM: 5 },
        destination: { eastM: 25, northM: 5 },
        policies: ['shortest'],
      })
    );
    expect(plainRes.status).toBe('success');
    if (plainRes.status === 'success') {
      expect(plainRes.candidates[0].draped3DPolyline).toBeUndefined();
    }
  });
});
