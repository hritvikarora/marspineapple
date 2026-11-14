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
  type EdgeEvaluatorPort,
  type SinglePolicySolveResult,
} from './types.js';

function hasHigherDijkstraPriority(u: number, v: number, gScore: Float64Array): boolean {
  const gu = gScore[u];
  const gv = gScore[v];
  if (gu !== gv) return gu < gv;
  return u < v;
}

class LocalDijkstraHeap {
  private count = 0;

  constructor(
    private readonly heapNodes: Int32Array,
    private readonly heapPos: Int32Array,
    private readonly gScore: Float64Array
  ) {}

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
      if (!hasHigherDijkstraPriority(node, parentNode, this.gScore)) {
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
        hasHigherDijkstraPriority(this.heapNodes[rightIdx], bestChildNode, this.gScore)
      ) {
        bestChildIdx = rightIdx;
        bestChildNode = this.heapNodes[rightIdx];
      }
      if (!hasHigherDijkstraPriority(bestChildNode, node, this.gScore)) {
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
 * Standalone reference Dijkstra solver (h(u) === 0) using isolated local buffers.
 * Used as an independent optimal-cost oracle against the A* search engine.
 */
export function solveDijkstra(params: {
  bundle: RegionRoutingBundle;
  startIndex: number;
  goalIndex: number;
  profile: ConstraintProfile;
  qualityMode: QualityMode;
  weights: EffectivePolicyWeights['effective'];
  edgeEvaluator: EdgeEvaluatorPort;
}): SinglePolicySolveResult {
  const { bundle, startIndex, goalIndex, profile, qualityMode, weights, edgeEvaluator } = params;
  const width = bundle.gridWidth;
  const height = bundle.gridHeight;
  const totalCells = width * height;

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

  if (startIndex === goalIndex) {
    return {
      status: 'success',
      cellIndices: [startIndex],
      totalCost: 0,
      exploredNodes: 0,
    };
  }

  const gScore = new Float64Array(totalCells);
  gScore.fill(Number.POSITIVE_INFINITY);
  const parentIndex = new Int32Array(totalCells);
  parentIndex.fill(-1);
  const closed = new Uint8Array(totalCells);
  const heapNodes = new Int32Array(totalCells);
  const heapPos = new Int32Array(totalCells);
  heapPos.fill(-1);

  const heap = new LocalDijkstraHeap(heapNodes, heapPos, gScore);
  gScore[startIndex] = 0;
  heap.pushOrDecreaseKey(startIndex);

  let exploredNodes = 0;
  while (true) {
    const u = heap.popMin();
    if (u === -1) break;
    if (closed[u] !== 0) continue;

    closed[u] = 1;
    exploredNodes++;

    if (u === goalIndex) {
      const reversed: number[] = [];
      let curr = goalIndex;
      let steps = 0;
      while (curr !== -1 && steps <= totalCells) {
        reversed.push(curr);
        if (curr === startIndex) break;
        curr = parentIndex[curr];
        steps++;
      }
      if (reversed[reversed.length - 1] !== startIndex) {
        return {
          status: 'no_path',
          cellIndices: [],
          totalCost: Number.POSITIVE_INFINITY,
          exploredNodes,
        };
      }
      reversed.reverse();
      return {
        status: 'success',
        cellIndices: reversed,
        totalCost: gScore[goalIndex],
        exploredNodes,
      };
    }

    const uRow = (u / width) | 0;
    const uCol = u - uRow * width;

    for (let d = 0; d < DIR_COUNT; d++) {
      const nr = uRow + DIR_DR[d];
      const nc = uCol + DIR_DC[d];
      if (nr < 0 || nr >= height || nc < 0 || nc >= width) continue;

      const v = nr * width + nc;
      if (closed[v] !== 0) continue;
      if (!edgeEvaluator.isEdgeAdmissible(bundle, u, v, d, profile, qualityMode)) continue;

      const stepCost = edgeEvaluator.computeEdgeCost(bundle, u, v, d, profile, weights);
      const candidateG = gScore[u] + stepCost;
      if (candidateG < gScore[v]) {
        gScore[v] = candidateG;
        parentIndex[v] = u;
        heap.pushOrDecreaseKey(v);
      } else if (candidateG === gScore[v] && u < parentIndex[v]) {
        parentIndex[v] = u;
      }
    }
  }

  return {
    status: 'no_path',
    cellIndices: [],
    totalCost: Number.POSITIVE_INFINITY,
    exploredNodes,
  };
}
