/**
 * Strict weak lexicographic priority comparator for the A* open-set heap.
 *
 * Uses exact IEEE-754 Float64 comparisons (never epsilon tie windows) to guarantee
 * irreflexivity, asymmetry, and strict transitivity:
 *   1. Smaller fScore wins
 *   2. Larger gScore wins (closer to goal)
 *   3. Smaller crossScore wins (collinearity tie-breaker)
 *   4. Smaller row-major cell index wins
 */
export function hasHigherPriority(
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

/**
 * Indexed binary min-heap backed by caller-owned TypedArrays for zero-allocation
 * in-place decrease-key operations during search.
 */
export class BinaryMinHeap {
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
