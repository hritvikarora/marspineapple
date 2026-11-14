export * from '../contracts/routing.js';
import type {
  ConstraintProfile,
  EffectivePolicyWeights,
  ExclusionReasonCode,
  PolicyId,
  QualityCode,
  QualityMode,
  RegionRoutingBundle,
} from '../contracts/routing.js';

// 8-Neighbor Direction Tables: 0:N, 1:NE, 2:E, 3:SE, 4:S, 5:SW, 6:W, 7:NW
export const DIR_COUNT = 8;
export const DIR_DR = new Int8Array([-1, -1, 0, 1, 1, 1, 0, -1]);
export const DIR_DC = new Int8Array([0, 1, 1, 1, 0, -1, -1, -1]);
export const DIR_IS_DIAG = new Uint8Array([0, 1, 0, 1, 0, 1, 0, 1]);

export const NOMINAL_POLICY_WEIGHTS: Record<PolicyId, { alpha: number; beta: number; gamma: number }> = {
  shortest: { alpha: 0, beta: 0, gamma: 0 },
  terrain: { alpha: 2, beta: 1, gamma: 0 },
  uncertainty: { alpha: 2, beta: 1, gamma: 2 },
};

export const QUALITY_PENALTY_BY_CODE: Record<QualityCode, number> = {
  0: 0.0,   // ACCEPTABLE
  1: 0.75,  // UNKNOWN
  2: 1.0,   // LOW
  3: Number.POSITIVE_INFINITY, // INVALID
};

export interface SolverWorkspacePort {
  readonly capacity: number;
  currentSearchId: number;
  readonly gScore: Float64Array;
  readonly fScore: Float64Array;
  readonly crossScore: Float64Array;
  readonly parentIndex: Int32Array;
  readonly seenStamp: Uint32Array;
  readonly closedStamp: Uint32Array;
  readonly heapNodes: Int32Array;
  readonly heapPos: Int32Array;
  readonly componentId: Int32Array;
  readonly adjMask: Uint8Array;
  readonly bfsQueue: Int32Array;
  beginSearch(): number;
}

export interface CellAdmissibilityPort {
  getCellExclusionReason(
    bundle: RegionRoutingBundle,
    row: number,
    col: number,
    profile: ConstraintProfile,
    qualityMode: QualityMode
  ): ExclusionReasonCode | null;
}

export interface EdgeEvaluatorPort {
  isEdgeAdmissible(
    bundle: RegionRoutingBundle,
    uIndex: number,
    vIndex: number,
    dir: number,
    profile: ConstraintProfile,
    qualityMode: QualityMode
  ): boolean;
  computeEdgeCost(
    bundle: RegionRoutingBundle,
    uIndex: number,
    vIndex: number,
    dir: number,
    profile: ConstraintProfile,
    weights: EffectivePolicyWeights['effective']
  ): number;
}

export type SinglePolicySolveResult = {
  status: 'success' | 'no_path' | 'timeout' | 'cancelled';
  cellIndices: number[];
  totalCost: number;
  exploredNodes: number;
};
