import type {
  ConstraintProfile,
  PolicyWeightVector,
  QualityMode,
  RegionRoutingBundle,
} from '../contracts/routing.js';
import {
  DIR_COUNT,
  DIR_DC,
  DIR_DR,
  type EdgeEvaluatorPort,
  type SinglePolicySolveResult,
  type SolverWorkspacePort,
} from './types.js';

export type SolveAStarParams = {
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
};

/**
 * Strict 4-tuple lexicographic heap priority comparator (no epsilon windows):
 * 1. Smaller fScore
 * 2. Larger gScore (closer to goal)
 * 3. Smaller crossScore (collinearity tie-breaker)
 * 4. Smaller canonical row-major cellIndex
 */
function hasHigherPriority(
  u: number,
  v: number,
  fScore: Float64Array,
  gScore: Float64Array,
  crossScore: Float64Array
): boolean {
  const fu = fScore[u];
  const fv = fScore[v];
  if (fu !== fv) return fu < fv;

  const gu = gScore[u];
  const gv = gScore[v];
  if (gu !== gv) return gu > gv;

  const cu = crossScore[u];
  const cv = crossScore[v];
  if (cu !== cv) return cu < cv;

  return u < v;
}

class IndexedBinaryMinHeap {
  private count = 0;

  constructor(
    private readonly heapNodes: Int32Array,
    private readonly heapPos: Int32Array,
    private readonly fScore: Float64Array,
    private readonly gScore: Float64Array,
    private readonly crossScore: Float64Array
  ) {}

  public get size(): number {
    return this.count;
  }

  public clear(): void {
    for (let i = 0; i < this.count; i++) {
      this.heapPos[this.heapNodes[i]] = -1;
    }
    this.count = 0;
  }

  public pushOrDecreaseKey(node: number): void {
    const existingPos = this.heapPos[node];
    if (existingPos >= 0) {
      this.siftUp(existingPos);
    } else {
      const idx = this.count++;
      this.heapNodes[idx] = node;
      this.heapPos[node] = idx;
      this.siftUp(idx);
    }
  }

  public popMin(): number {
    if (this.count === 0) return -1;
    const minNode = this.heapNodes[0];
    this.heapPos[minNode] = -1;
    this.count--;
    if (this.count > 0) {
      const lastNode = this.heapNodes[this.count];
      this.heapNodes[0] = lastNode;
      this.heapPos[lastNode] = 0;
      this.siftDown(0);
    }
    return minNode;
  }

  private siftUp(idx: number): void {
    const node = this.heapNodes[idx];
    while (idx > 0) {
      const parentIdx = (idx - 1) >> 1;
      const parentNode = this.heapNodes[parentIdx];
      if (!hasHigherPriority(node, parentNode, this.fScore, this.gScore, this.crossScore)) {
        break;
      }
      this.heapNodes[idx] = parentNode;
      this.heapPos[parentNode] = idx;
      idx = parentIdx;
    }
    this.heapNodes[idx] = node;
    this.heapPos[node] = idx;
  }

  private siftDown(idx: number): void {
    const node = this.heapNodes[idx];
    const half = this.count >> 1;
    while (idx < half) {
      let bestChildIdx = (idx << 1) + 1;
      let bestChildNode = this.heapNodes[bestChildIdx];
      const rightIdx = bestChildIdx + 1;
      if (
        rightIdx < this.count &&
        hasHigherPriority(this.heapNodes[rightIdx], bestChildNode, this.fScore, this.gScore, this.crossScore)
      ) {
        bestChildIdx = rightIdx;
        bestChildNode = this.heapNodes[rightIdx];
      }
      if (!hasHigherPriority(bestChildNode, node, this.fScore, this.gScore, this.crossScore)) {
        break;
      }
      this.heapNodes[idx] = bestChildNode;
      this.heapPos[bestChildNode] = idx;
      idx = bestChildIdx;
    }
    this.heapNodes[idx] = node;
    this.heapPos[node] = idx;
  }
}

/**
 * Deterministic 8-neighbor A* solver operating on a pre-allocated SolverWorkspacePort.
 * Guarantees optimality on the declared 8-neighbor graph under a consistent Euclidean heuristic.
 */
export function solveAStar(params: SolveAStarParams): SinglePolicySolveResult {
  const {
    bundle,
    workspace,
    startIndex,
    goalIndex,
    profile,
    qualityMode,
    weights,
    edgeEvaluator,
    adjMask,
    isCancelled,
    isTimedOut,
  } = params;

  if (startIndex === goalIndex) {
    return {
      status: 'success',
      cellIndices: [startIndex],
      totalCost: 0,
      exploredNodes: 0,
    };
  }

  if (isCancelled?.()) {
    return {
      status: 'cancelled',
      cellIndices: [],
      totalCost: Number.POSITIVE_INFINITY,
      exploredNodes: 0,
    };
  }

  if (isTimedOut?.()) {
    return {
      status: 'timeout',
      cellIndices: [],
      totalCost: Number.POSITIVE_INFINITY,
      exploredNodes: 0,
    };
  }

  const width = bundle.gridWidth;
  const height = bundle.gridHeight;
  const totalCells = width * height;

  if (workspace.capacity < totalCells) {
    throw new RangeError(
      `SolverWorkspace capacity (${workspace.capacity}) is smaller than grid cell count (${totalCells}).`
    );
  }

  if (
    startIndex < 0 ||
    startIndex >= totalCells ||
    goalIndex < 0 ||
    goalIndex >= totalCells
  ) {
    return {
      status: 'no_path',
      cellIndices: [],
      totalCost: Number.POSITIVE_INFINITY,
      exploredNodes: 0,
    };
  }

  const dx = bundle.cellSpacingEastM;
  const dy = bundle.cellSpacingNorthM;
  const startRow = Math.floor(startIndex / width);
  const startCol = startIndex - startRow * width;
  const goalRow = Math.floor(goalIndex / width);
  const goalCol = goalIndex - goalRow * width;

  // Delta from start to goal in local meters (North is positive as row decreases).
  const dGoalEast = (goalCol - startCol) * dx;
  const dGoalNorth = (startRow - goalRow) * dy;
  const startGoalEuclid = Math.sqrt(dGoalEast * dGoalEast + dGoalNorth * dGoalNorth);
  const crossScale = 1e-6 / Math.max(1, startGoalEuclid);

  const searchId = workspace.beginSearch();
  const {
    gScore,
    fScore,
    crossScore,
    parentIndex,
    seenStamp,
    closedStamp,
    heapNodes,
    heapPos,
  } = workspace;

  const heap = new IndexedBinaryMinHeap(heapNodes, heapPos, fScore, gScore, crossScore);

  seenStamp[startIndex] = searchId;
  gScore[startIndex] = 0;
  fScore[startIndex] = startGoalEuclid;
  crossScore[startIndex] = 0;
  parentIndex[startIndex] = -1;
  heapPos[startIndex] = -1;
  heap.pushOrDecreaseKey(startIndex);

  let exploredNodes = 0;
  let foundGoal = false;

  try {
    while (heap.size > 0) {
      if (isCancelled !== undefined && isCancelled()) {
        return {
          status: 'cancelled',
          cellIndices: [],
          totalCost: Number.POSITIVE_INFINITY,
          exploredNodes,
        };
      }
      if (isTimedOut !== undefined && isTimedOut()) {
        return {
          status: 'timeout',
          cellIndices: [],
          totalCost: Number.POSITIVE_INFINITY,
          exploredNodes,
        };
      }

      const u = heap.popMin();
      closedStamp[u] = searchId;
      exploredNodes++;

      if (u === goalIndex) {
        foundGoal = true;
        break;
      }

      const uRow = Math.floor(u / width);
      const uCol = u - uRow * width;
      const uMask = adjMask !== undefined ? adjMask[u] : 0xff;
      if (uMask === 0) {
        continue;
      }

      const gu = gScore[u];

      for (let dir = 0; dir < DIR_COUNT; dir++) {
        if (adjMask !== undefined && (uMask & (1 << dir)) === 0) {
          continue;
        }

        const vRow = uRow + DIR_DR[dir];
        const vCol = uCol + DIR_DC[dir];
        if (vRow < 0 || vRow >= height || vCol < 0 || vCol >= width) {
          continue;
        }

        const v = vRow * width + vCol;
        if (closedStamp[v] === searchId) {
          continue;
        }

        if (
          adjMask === undefined &&
          !edgeEvaluator.isEdgeAdmissible(bundle, u, v, dir, profile, qualityMode)
        ) {
          continue;
        }

        const stepCost = edgeEvaluator.computeEdgeCost(bundle, u, v, dir, profile, weights);
        const candidateG = gu + stepCost;

        if (seenStamp[v] !== searchId) {
          const deGoal = (vCol - goalCol) * dx;
          const dnGoal = (goalRow - vRow) * dy;
          const hv = Math.sqrt(deGoal * deGoal + dnGoal * dnGoal);

          const dvEast = (vCol - startCol) * dx;
          const dvNorth = (startRow - vRow) * dy;
          const crossV = Math.abs(dvEast * dGoalNorth - dGoalEast * dvNorth) * crossScale;

          seenStamp[v] = searchId;
          gScore[v] = candidateG;
          fScore[v] = candidateG + hv;
          crossScore[v] = crossV;
          parentIndex[v] = u;
          heapPos[v] = -1;
          heap.pushOrDecreaseKey(v);
        } else if (candidateG < gScore[v]) {
          // Reuse already-computed Euclidean heuristic h(v) = fScore[v] - gScore[v].
          const hv = fScore[v] - gScore[v];
          gScore[v] = candidateG;
          fScore[v] = candidateG + hv;
          parentIndex[v] = u;
          heap.pushOrDecreaseKey(v);
        } else if (candidateG === gScore[v]) {
          const prevParent = parentIndex[v];
          if (
            prevParent >= 0 &&
            (crossScore[u] < crossScore[prevParent] ||
              (crossScore[u] === crossScore[prevParent] && u < prevParent))
          ) {
            parentIndex[v] = u;
          }
        }
      }
    }
  } finally {
    // Always clear heapPos entries for nodes remaining in the open set.
    heap.clear();
  }

  if (!foundGoal) {
    return {
      status: 'no_path',
      cellIndices: [],
      totalCost: Number.POSITIVE_INFINITY,
      exploredNodes,
    };
  }

  const reversedPath: number[] = [];
  let curr = goalIndex;
  let steps = 0;

  while (curr !== -1) {
    if (curr < 0 || curr >= totalCells) {
      throw new Error(`BROKEN_PREDECESSOR_CHAIN: cell index ${curr} out of bounds [0, ${totalCells}).`);
    }
    reversedPath.push(curr);
    if (curr === startIndex) {
      break;
    }
    steps++;
    if (steps > totalCells) {
      throw new Error(`PREDECESSOR_CYCLE_DETECTED: exceeded ${totalCells} backtracking steps.`);
    }
    curr = parentIndex[curr];
  }

  if (curr !== startIndex) {
    throw new Error('BROKEN_PREDECESSOR_CHAIN: predecessor trace did not reach startIndex.');
  }

  reversedPath.reverse();

  return {
    status: 'success',
    cellIndices: reversedPath,
    totalCost: gScore[goalIndex],
    exploredNodes,
  };
}
