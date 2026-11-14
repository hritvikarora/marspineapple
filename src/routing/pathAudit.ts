import type {
  ConstraintProfile,
  EffectivePolicyWeights,
  QualityMode,
  RegionRoutingBundle,
} from '../contracts/routing.js';
import {
  DIR_COUNT,
  DIR_DC,
  DIR_DR,
  type CellAdmissibilityPort,
  type EdgeEvaluatorPort,
  type SinglePolicySolveResult,
} from './types.js';

function resolveDirectionIndex(dr: number, dc: number): number {
  for (let d = 0; d < DIR_COUNT; d++) {
    if (DIR_DR[d] === dr && DIR_DC[d] === dc) {
      return d;
    }
  }
  return -1;
}

/**
 * Independent post-solve path auditor that validates endpoints, cell admissibility
 * (including 0-edge same-cell paths), 8-neighbor connectivity, edge admissibility
 * (no corner cutting, route grade bounds), and recomputes total path cost from scratch.
 */
export function verifyPathAdmissibility(params: {
  bundle: RegionRoutingBundle;
  cellIndices: number[];
  expectedStartIndex: number;
  expectedGoalIndex: number;
  profile: ConstraintProfile;
  qualityMode: QualityMode;
  weights: EffectivePolicyWeights['effective'];
  cellAdmissibility: CellAdmissibilityPort;
  edgeEvaluator: EdgeEvaluatorPort;
}): { valid: boolean; recomputedCost: number; failureReason?: string } {
  const {
    bundle,
    cellIndices,
    expectedStartIndex,
    expectedGoalIndex,
    profile,
    qualityMode,
    weights,
    cellAdmissibility,
    edgeEvaluator,
  } = params;

  const width = bundle.gridWidth;
  const height = bundle.gridHeight;
  const totalCells = width * height;

  if (cellIndices.length < 1) {
    return {
      valid: false,
      recomputedCost: 0,
      failureReason: 'Path must contain at least one cell index',
    };
  }

  if (cellIndices[0] !== expectedStartIndex) {
    return {
      valid: false,
      recomputedCost: 0,
      failureReason: `Start cell mismatch: expected ${expectedStartIndex}, got ${cellIndices[0]}`,
    };
  }

  if (cellIndices[cellIndices.length - 1] !== expectedGoalIndex) {
    return {
      valid: false,
      recomputedCost: 0,
      failureReason: `Goal cell mismatch: expected ${expectedGoalIndex}, got ${cellIndices[cellIndices.length - 1]}`,
    };
  }

  for (let i = 0; i < cellIndices.length; i++) {
    const idx = cellIndices[i];
    if (!Number.isInteger(idx) || idx < 0 || idx >= totalCells) {
      return {
        valid: false,
        recomputedCost: 0,
        failureReason: `Cell index ${idx} at position ${i} is out of bounds [0, ${totalCells})`,
      };
    }
    const row = (idx / width) | 0;
    const col = idx - row * width;
    const reason = cellAdmissibility.getCellExclusionReason(bundle, row, col, profile, qualityMode);
    if (reason !== null) {
      return {
        valid: false,
        recomputedCost: 0,
        failureReason: `Cell ${idx} (${row},${col}) at position ${i} failed admissibility: ${reason}`,
      };
    }
  }

  let recomputedCost = 0;
  for (let j = 1; j < cellIndices.length; j++) {
    const u = cellIndices[j - 1];
    const v = cellIndices[j];
    const uRow = (u / width) | 0;
    const uCol = u - uRow * width;
    const vRow = (v / width) | 0;
    const vCol = v - vRow * width;

    const dr = vRow - uRow;
    const dc = vCol - uCol;
    if (Math.abs(dr) > 1 || Math.abs(dc) > 1 || (dr === 0 && dc === 0)) {
      return {
        valid: false,
        recomputedCost: 0,
        failureReason: `Step ${u} -> ${v} at segment ${j} is not a valid 8-neighbor transition`,
      };
    }

    const dir = resolveDirectionIndex(dr, dc);
    if (dir < 0 || !edgeEvaluator.isEdgeAdmissible(bundle, u, v, dir, profile, qualityMode)) {
      return {
        valid: false,
        recomputedCost: 0,
        failureReason: `Edge ${u} -> ${v} (dir=${dir}) at segment ${j} is inadmissible`,
      };
    }

    recomputedCost += edgeEvaluator.computeEdgeCost(bundle, u, v, dir, profile, weights);
  }

  return { valid: true, recomputedCost };
}

/**
 * Assert the five automated equivalence and efficiency invariants comparing A*
 * against the standalone reference Dijkstra oracle and the independent path auditor.
 */
export function assertAStarMatchesDijkstra(
  aStarResult: SinglePolicySolveResult,
  dijkstraResult: SinglePolicySolveResult,
  auditResult: { valid: boolean; recomputedCost: number; failureReason?: string }
): void {
  if (aStarResult.status !== dijkstraResult.status) {
    throw new Error(
      `Status mismatch: A* returned '${aStarResult.status}' while Dijkstra returned '${dijkstraResult.status}'`
    );
  }

  if (aStarResult.status === 'success') {
    if (!auditResult.valid) {
      throw new Error(
        `Independent path audit failed: ${auditResult.failureReason ?? 'unknown reason'}`
      );
    }

    const oracleDiff = Math.abs(aStarResult.totalCost - dijkstraResult.totalCost);
    if (!(oracleDiff <= 1e-7)) {
      throw new Error(
        `Optimal cost mismatch vs Dijkstra: A*=${aStarResult.totalCost}, Dijkstra=${dijkstraResult.totalCost}, diff=${oracleDiff}`
      );
    }

    const auditDiff = Math.abs(auditResult.recomputedCost - aStarResult.totalCost);
    if (!(auditDiff <= 1e-7)) {
      throw new Error(
        `Recomputed audit cost mismatch: audit=${auditResult.recomputedCost}, A*=${aStarResult.totalCost}, diff=${auditDiff}`
      );
    }
  }

  if (aStarResult.exploredNodes > dijkstraResult.exploredNodes) {
    throw new Error(
      `Heuristic efficiency bound violated: A* explored ${aStarResult.exploredNodes} > Dijkstra ${dijkstraResult.exploredNodes}`
    );
  }
}
