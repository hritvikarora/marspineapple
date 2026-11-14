import {
  EXCLUSION,
  QUALITY,
  ROUTE_POLICIES,
  cellCenter,
  pointToCell,
  type EndpointResolution,
  type GridSpec,
  type LocalPoint,
  type LocalPoint3,
  type PolicyWeights,
  type QualityCode,
  type QualityInterval,
  type RouteCandidate,
  type RouteFinalResponse,
  type RouteLeg,
  type RouteMetrics,
  type RoutePolicyId,
  type RouteRequest,
  type SearchTraceData,
  type SearchTraceFrame,
} from '../contracts';

export type { PolicyWeights };

export const MODEL_VERSION = 'eva-astar-1.0.0';

export const EVA_LIMITS = {
  maxTerrainSlope_deg: 20,
  maxAbsEdgeGrade_deg: 20,
  roughnessScale_m: 0.5,
} as const;

export const EVA_POLICY_WEIGHTS: Record<RoutePolicyId, PolicyWeights> = {
  'shortest-feasible': { slope: 0, roughness: 0, quality: 0 },
  'terrain-aware': { slope: 2, roughness: 1, quality: 0 },
  'uncertainty-aware': { slope: 2, roughness: 1, quality: 3 },
};

/** Minimal immutable grid the engine needs (built from GridBundle or its transfer form). */
export interface RoutingGrid {
  manifest: {
    strictQualitySupported: boolean;
    grid: GridSpec;
  };
  bundleVersion: string;
  elevation: Float32Array;
  slope: Float32Array;
  roughness: Float32Array;
  quality: Uint8Array;
  exclusion: Uint8Array;
}

export interface SolveHooks {
  /** Return non-null to abort. Polled every 512 explored nodes. */
  shouldStop?: () => 'cancelled' | 'timeout' | null;
  onProgress?: (exploredNodes: number) => void;
  now?: () => number;
}

class AbortSearchSignal {
  constructor(readonly kind: 'cancelled' | 'timeout') {}
}

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const MAX_TRACE_FRAMES = 48;
const MAX_CLOSED_PER_FRAME = 256;
const MAX_FRONTIER_PER_FRAME = 256;
const MAX_BEST_PATH_PER_FRAME = 128;

/** Deterministic 8-neighbor order: N, NE, E, SE, S, SW, W, NW. */
const DIRECTIONS: ReadonlyArray<readonly [dr: number, dc: number, isDiag: boolean]> = [
  [-1, 0, false],
  [-1, 1, true],
  [0, 1, false],
  [1, 1, true],
  [1, 0, false],
  [1, -1, true],
  [0, -1, false],
  [-1, -1, true],
];

const EVAL_ORDER: readonly RoutePolicyId[] = [
  'terrain-aware',
  'uncertainty-aware',
  'shortest-feasible',
];

function normalizeQualityCode(q: number): QualityCode {
  switch (q) {
    case QUALITY.GOOD:
    case QUALITY.LOW:
    case QUALITY.UNKNOWN:
    case QUALITY.NO_ELEVATION:
      return q;
    default:
      return QUALITY.NO_ELEVATION;
  }
}

/**
 * Quality penalty in contract `QualityCode` domain, preserving exact hazard ordering:
 * `NO_ELEVATION (Infinity) > UNKNOWN (1.0) > LOW (0.5) > GOOD (0.0)`.
 */
export function qualityPenalty(q: QualityCode): number {
  switch (q) {
    case QUALITY.GOOD:
      return 0.0;
    case QUALITY.LOW:
      return 0.5;
    case QUALITY.UNKNOWN:
      return 1.0;
    case QUALITY.NO_ELEVATION:
    default:
      return Number.POSITIVE_INFINITY;
  }
}

/** Conservative 2-endpoint quality: the worse of two contract `QualityCode` values. */
export function worseQuality(a: QualityCode, b: QualityCode): QualityCode {
  const qa = normalizeQualityCode(a);
  const qb = normalizeQualityCode(b);
  return qualityPenalty(qa) >= qualityPenalty(qb) ? qa : qb;
}

/** True when a cell is valid, finite, non-excluded, within max terrain slope, and quality-admissible. */
export function isCellAdmissible(
  grid: RoutingGrid,
  index: number,
  strictQuality = false,
): boolean {
  if (!Number.isInteger(index) || index < 0) {
    return false;
  }
  if (
    index >= grid.elevation.length ||
    index >= grid.slope.length ||
    index >= grid.roughness.length ||
    index >= grid.quality.length ||
    index >= grid.exclusion.length
  ) {
    return false;
  }
  if (grid.exclusion[index] !== EXCLUSION.NONE) {
    return false;
  }
  const z = grid.elevation[index];
  const s = grid.slope[index];
  const r = grid.roughness[index];
  if (
    z === undefined ||
    s === undefined ||
    r === undefined ||
    !Number.isFinite(z) ||
    !Number.isFinite(s) ||
    !Number.isFinite(r)
  ) {
    return false;
  }
  if (s > EVA_LIMITS.maxTerrainSlope_deg) {
    return false;
  }
  const q = grid.quality[index];
  if (q === undefined) {
    return false;
  }
  if (strictQuality) {
    return q === QUALITY.GOOD;
  }
  return q === QUALITY.GOOD || q === QUALITY.LOW || q === QUALITY.UNKNOWN;
}

function computeEdgeCostFromStepLen(
  grid: RoutingGrid,
  uIndex: number,
  vIndex: number,
  stepLen_m: number,
  weights: PolicyWeights,
): number {
  const su = grid.slope[uIndex];
  const sv = grid.slope[vIndex];
  const ru = grid.roughness[uIndex];
  const rv = grid.roughness[vIndex];
  const qu = grid.quality[uIndex];
  const qv = grid.quality[vIndex];
  if (
    su === undefined ||
    sv === undefined ||
    ru === undefined ||
    rv === undefined ||
    qu === undefined ||
    qv === undefined ||
    !Number.isFinite(su) ||
    !Number.isFinite(sv) ||
    !Number.isFinite(ru) ||
    !Number.isFinite(rv)
  ) {
    return Number.POSITIVE_INFINITY;
  }
  const sNorm = Math.max(0, Math.max(su, sv)) / EVA_LIMITS.maxTerrainSlope_deg;
  const rNorm = Math.max(0, Math.min(1, Math.max(ru, rv) / EVA_LIMITS.roughnessScale_m));
  const qPen = qualityPenalty(worseQuality(qu as QualityCode, qv as QualityCode));
  const sTerm = weights.slope === 0 ? 0 : weights.slope * sNorm;
  const rTerm = weights.roughness === 0 ? 0 : weights.roughness * rNorm;
  const qTerm = weights.quality === 0 ? 0 : weights.quality * qPen;
  return stepLen_m * (1 + sTerm + rTerm + qTerm);
}

/**
 * Pure EVA step cost between two grid cells using 2-endpoint conservative `worseQuality`,
 * max-endpoint slope/roughness normalization, and cell-geometry step length.
 */
export function computeEdgeCost(
  grid: RoutingGrid,
  uIndex: number,
  vIndex: number,
  weights: PolicyWeights,
): number {
  const spec = grid.manifest.grid;
  const width = spec.width;
  const totalCells = width * spec.height;
  if (
    !Number.isInteger(uIndex) ||
    !Number.isInteger(vIndex) ||
    uIndex < 0 ||
    vIndex < 0 ||
    uIndex >= totalCells ||
    vIndex >= totalCells ||
    !Number.isFinite(spec.cellSizeEast_m) ||
    !Number.isFinite(spec.cellSizeNorth_m) ||
    spec.cellSizeEast_m <= 0 ||
    spec.cellSizeNorth_m <= 0
  ) {
    return Number.POSITIVE_INFINITY;
  }
  if (uIndex === vIndex) {
    return 0;
  }
  const ur = Math.floor(uIndex / width);
  const uc = uIndex - ur * width;
  const vr = Math.floor(vIndex / width);
  const vc = vIndex - vr * width;
  const dr = Math.abs(vr - ur);
  const dc = Math.abs(vc - uc);
  const stepLen_m =
    dr === 1 && dc === 1
      ? Math.hypot(spec.cellSizeEast_m, spec.cellSizeNorth_m)
      : dr === 1 && dc === 0
        ? spec.cellSizeNorth_m
        : dr === 0 && dc === 1
          ? spec.cellSizeEast_m
          : Math.hypot(dc * spec.cellSizeEast_m, dr * spec.cellSizeNorth_m);
  return computeEdgeCostFromStepLen(grid, uIndex, vIndex, stepLen_m, weights);
}

/**
 * Open-set order from §2.3.6: lower f, then smaller cross-product tie-break, then smaller cell index.
 * Equal g does not reorder the heap and does not rewrite an existing parent.
 */
function hasHigherPriority(
  u: number,
  v: number,
  fScore: Float64Array,
  crossScore: Float64Array,
): boolean {
  const fu = fScore[u]!;
  const fv = fScore[v]!;
  if (fu !== fv) return fu < fv;

  const cu = crossScore[u]!;
  const cv = crossScore[v]!;
  if (cu !== cv) return cu < cv;

  return u < v;
}

class BinaryMinHeap {
  private count = 0;

  constructor(
    private readonly heapNodes: Int32Array,
    private readonly heapPos: Int32Array,
    private readonly fScore: Float64Array,
    private readonly crossScore: Float64Array,
  ) {}

  public get size(): number {
    return this.count;
  }

  public clear(): void {
    for (let i = 0; i < this.count; i++) {
      this.heapPos[this.heapNodes[i]!] = -1;
    }
    this.count = 0;
  }

  public pushOrDecreaseKey(node: number): void {
    const existingPos = this.heapPos[node]!;
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
    const minNode = this.heapNodes[0]!;
    this.heapPos[minNode] = -1;
    this.count--;
    if (this.count > 0) {
      const lastNode = this.heapNodes[this.count]!;
      this.heapNodes[0] = lastNode;
      this.heapPos[lastNode] = 0;
      this.siftDown(0);
    }
    return minNode;
  }

  private siftUp(idx: number): void {
    const node = this.heapNodes[idx]!;
    while (idx > 0) {
      const parentIdx = (idx - 1) >> 1;
      const parentNode = this.heapNodes[parentIdx]!;
      if (!hasHigherPriority(node, parentNode, this.fScore, this.crossScore)) {
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
    const node = this.heapNodes[idx]!;
    const half = this.count >> 1;
    while (idx < half) {
      let bestChildIdx = (idx << 1) + 1;
      let bestChildNode = this.heapNodes[bestChildIdx]!;
      const rightIdx = bestChildIdx + 1;
      if (
        rightIdx < this.count &&
        hasHigherPriority(this.heapNodes[rightIdx]!, bestChildNode, this.fScore, this.crossScore)
      ) {
        bestChildIdx = rightIdx;
        bestChildNode = this.heapNodes[rightIdx]!;
      }
      if (!hasHigherPriority(bestChildNode, node, this.fScore, this.crossScore)) {
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

class SolverWorkspace {
  public readonly capacity: number;
  public currentSearchId = 0;
  public readonly gScore: Float64Array;
  public readonly fScore: Float64Array;
  public readonly crossScore: Float64Array;
  public readonly parentIndex: Int32Array;
  public readonly seenStamp: Uint32Array;
  public readonly closedStamp: Uint32Array;
  public readonly heapNodes: Int32Array;
  public readonly heapPos: Int32Array;
  public readonly admissible: Uint8Array;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.gScore = new Float64Array(capacity);
    this.fScore = new Float64Array(capacity);
    this.crossScore = new Float64Array(capacity);
    this.parentIndex = new Int32Array(capacity);
    this.seenStamp = new Uint32Array(capacity);
    this.closedStamp = new Uint32Array(capacity);
    this.heapNodes = new Int32Array(capacity);
    this.heapPos = new Int32Array(capacity).fill(-1);
    this.admissible = new Uint8Array(capacity);
  }

  public beginSearch(): number {
    this.currentSearchId = (this.currentSearchId + 1) >>> 0;
    if (this.currentSearchId === 0) {
      this.seenStamp.fill(0);
      this.closedStamp.fill(0);
      this.currentSearchId = 1;
    }
    return this.currentSearchId;
  }
}

let sharedWorkspace: SolverWorkspace | null = null;

function acquireWorkspace(capacity: number): SolverWorkspace {
  if (!sharedWorkspace || sharedWorkspace.capacity < capacity) {
    sharedWorkspace = new SolverWorkspace(capacity);
  }
  return sharedWorkspace;
}

function downsampleUniform(src: readonly number[], maxLen: number): number[] {
  if (src.length <= maxLen) {
    return src.slice();
  }
  if (maxLen <= 1) {
    const first = src[0];
    return first !== undefined ? [first] : [];
  }
  const out: number[] = new Array<number>(maxLen);
  const lastSrc = src.length - 1;
  const lastOut = maxLen - 1;
  for (let i = 0; i < maxLen; i++) {
    const idx = Math.floor((i * lastSrc) / lastOut);
    out[i] = src[idx] ?? 0;
  }
  return out;
}

function sampleHeapNodes(heapNodes: Int32Array, heapSize: number, maxLen: number): number[] {
  if (heapSize <= 0) return [];
  if (heapSize <= maxLen) {
    const out: number[] = new Array<number>(heapSize);
    for (let i = 0; i < heapSize; i++) {
      out[i] = heapNodes[i]!;
    }
    return out;
  }
  const out: number[] = new Array<number>(maxLen);
  const lastSrc = heapSize - 1;
  const lastOut = maxLen - 1;
  for (let i = 0; i < maxLen; i++) {
    out[i] = heapNodes[Math.floor((i * lastSrc) / lastOut)]!;
  }
  return out;
}

function traceBackToNode(
  parentIndex: Int32Array,
  fromIndex: number,
  nodeIndex: number,
  maxSteps: number,
): number[] {
  const rev: number[] = [];
  let curr = nodeIndex;
  let steps = 0;
  while (curr !== -1) {
    rev.push(curr);
    if (curr === fromIndex) break;
    if (++steps > maxSteps) break;
    curr = parentIndex[curr]!;
  }
  rev.reverse();
  return rev;
}

function compactTraceFrames(frames: SearchTraceFrame[]): void {
  const half = Math.floor(frames.length / 2);
  for (let k = 0; k < half; k++) {
    const even = frames[k * 2];
    const odd = frames[k * 2 + 1];
    if (!even || !odd) continue;
    const mergedClosed: number[] = [];
    for (let i = 0; i < even.closedCells.length; i += 2) {
      const c = even.closedCells[i];
      if (c !== undefined) mergedClosed.push(c);
    }
    for (let i = 0; i < odd.closedCells.length; i += 2) {
      const c = odd.closedCells[i];
      if (c !== undefined) mergedClosed.push(c);
    }
    frames[k] = {
      step: k,
      policy: odd.policy,
      closedCells: downsampleUniform(mergedClosed, MAX_CLOSED_PER_FRAME),
      frontierCells: odd.frontierCells,
      currentBestCells: odd.currentBestCells,
      currentBestCost: odd.currentBestCost,
      exploredCount: odd.exploredCount,
      openSize: odd.openSize,
      note: odd.note,
    };
  }
  frames.length = half;
}

interface InternalSearchResult {
  cells: number[];
  cost: number;
  frames: SearchTraceFrame[];
}

function runAStar(
  grid: RoutingGrid,
  workspace: SolverWorkspace,
  fromIndex: number,
  toIndex: number,
  weights: PolicyWeights,
  policy: RoutePolicyId,
  hooks: SolveHooks,
  explored: { n: number },
  maxFrames: number,
): InternalSearchResult | null {
  if (fromIndex === toIndex) {
    const frames: SearchTraceFrame[] =
      maxFrames > 0
        ? [
            {
              step: 0,
              policy,
              closedCells: [fromIndex],
              frontierCells: [],
              currentBestCells: [fromIndex],
              currentBestCost: 0,
              exploredCount: 0,
              openSize: 0,
              note: `${policy}: start and destination share cell ${fromIndex}.`,
            },
          ]
        : [];
    return { cells: [fromIndex], cost: 0, frames };
  }

  const spec = grid.manifest.grid;
  const width = spec.width;
  const height = spec.height;
  const totalCells = width * height;
  const dx = spec.cellSizeEast_m;
  const dy = spec.cellSizeNorth_m;
  const diagDist = Math.hypot(dx, dy);
  const maxGradeTan = Math.tan(EVA_LIMITS.maxAbsEdgeGrade_deg * DEG_TO_RAD);

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
    admissible,
  } = workspace;

  const heap = new BinaryMinHeap(heapNodes, heapPos, fScore, crossScore);

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

  seenStamp[fromIndex] = searchId;
  gScore[fromIndex] = 0;
  fScore[fromIndex] = computeHeuristic(startRow, startCol);
  crossScore[fromIndex] = 0;
  parentIndex[fromIndex] = -1;
  heapPos[fromIndex] = -1;
  heap.pushOrDecreaseKey(fromIndex);

  const frames: SearchTraceFrame[] = [];
  const batchClosed: number[] = [];
  let batchStride = 1;
  let batchSeen = 0;
  let sampleEvery = 1;
  let localExplored = 0;

  try {
    while (heap.size > 0) {
      const u = heap.popMin();
      if (closedStamp[u] === searchId) continue;
      closedStamp[u] = searchId;
      localExplored++;
      explored.n++;

      if ((explored.n & 511) === 0) {
        const stop = hooks.shouldStop?.();
        if (stop) {
          throw new AbortSearchSignal(stop);
        }
        hooks.onProgress?.(explored.n);
      }

      if (maxFrames > 0) {
        batchSeen++;
        if (batchSeen % batchStride === 0) {
          batchClosed.push(u);
          if (batchClosed.length > MAX_CLOSED_PER_FRAME * 4) {
            let write = 0;
            for (let r = 0; r < batchClosed.length; r += 2) {
              const val = batchClosed[r];
              if (val !== undefined) {
                batchClosed[write++] = val;
              }
            }
            batchClosed.length = write;
            batchStride *= 2;
          }
        }
      }

      if (u !== toIndex) {
      const ur = Math.floor(u / width);
      const uc = u - ur * width;
      const uG = gScore[u]!;
      const zu = grid.elevation[u]!;

      for (let dir = 0; dir < DIRECTIONS.length; dir++) {
        const stepDir = DIRECTIONS[dir];
        if (!stepDir) continue;
        const [dr, dc, isDiag] = stepDir;
        const vr = ur + dr;
        const vc = uc + dc;
        if (vr < 0 || vr >= height || vc < 0 || vc >= width) continue;

        const v = vr * width + vc;
        if (admissible[v] === 0 || closedStamp[v] === searchId) continue;

        if (isDiag) {
          const c1 = ur * width + vc;
          const c2 = vr * width + uc;
          if (admissible[c1] === 0 || admissible[c2] === 0) continue;
        }

        const stepLen = isDiag ? diagDist : dr !== 0 ? dy : dx;
        const dz = Math.abs(grid.elevation[v]! - zu);
        if (dz / stepLen > maxGradeTan) continue;

        const edgeCost = computeEdgeCostFromStepLen(grid, u, v, stepLen, weights);
        const candG = uG + edgeCost;

        if (seenStamp[v] !== searchId) {
          seenStamp[v] = searchId;
          gScore[v] = candG;
          fScore[v] = candG + computeHeuristic(vr, vc);
          crossScore[v] = computeCross(vr, vc);
          parentIndex[v] = u;
          heapPos[v] = -1;
          heap.pushOrDecreaseKey(v);
        } else if (candG < gScore[v]!) {
          gScore[v] = candG;
          fScore[v] = candG + computeHeuristic(vr, vc);
          crossScore[v] = computeCross(vr, vc);
          parentIndex[v] = u;
          heap.pushOrDecreaseKey(v);
        }
      }
      }

      if (maxFrames > 0) {
        const isGoalFrame = u === toIndex;
        if (isGoalFrame || localExplored === 1 || localExplored % sampleEvery === 0) {
          if (frames.length >= maxFrames && maxFrames >= 2) {
            compactTraceFrames(frames);
            sampleEvery *= 2;
          }
          if (frames.length < maxFrames) {
            const pathSoFar = traceBackToNode(parentIndex, fromIndex, u, totalCells);
            const openCount = heap.size;
            frames.push({
              step: frames.length,
              policy,
              closedCells: downsampleUniform(batchClosed, MAX_CLOSED_PER_FRAME),
              frontierCells: sampleHeapNodes(heapNodes, openCount, MAX_FRONTIER_PER_FRAME),
              currentBestCells: downsampleUniform(pathSoFar, MAX_BEST_PATH_PER_FRAME),
              currentBestCost: gScore[u]!,
              exploredCount: localExplored,
              openSize: openCount,
              note: isGoalFrame
                ? `${policy}: reached destination (${localExplored} nodes explored, open ${openCount}).`
                : localExplored === 1
                  ? `${policy}: initialized search from start cell (open ${openCount}).`
                  : `${policy}: expanded ${localExplored} nodes (heap-sampled frontier: ${openCount}).`,
            });
            batchClosed.length = 0;
            batchSeen = 0;
            batchStride = 1;
          }
        }
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
          curr = parentIndex[curr]!;
        }
        if (cells[cells.length - 1] !== fromIndex) {
          throw new Error('Broken predecessor chain during path reconstruction.');
        }
        cells.reverse();
        return { cells, cost: gScore[toIndex]!, frames };
      }
    }

    return null;
  } finally {
    heap.clear();
  }
}

function pathHasZeroQualityPenalty(grid: RoutingGrid, cells: readonly number[]): boolean {
  if (cells.length === 0) return true;
  if (cells.length === 1) {
    const idx = cells[0];
    if (idx === undefined) return true;
    return qualityPenalty(normalizeQualityCode(grid.quality[idx] ?? QUALITY.NO_ELEVATION)) === 0;
  }
  for (let i = 1; i < cells.length; i++) {
    const prevIdx = cells[i - 1];
    const currIdx = cells[i];
    if (prevIdx === undefined || currIdx === undefined) return false;
    const qa = normalizeQualityCode(grid.quality[prevIdx] ?? QUALITY.NO_ELEVATION);
    const qb = normalizeQualityCode(grid.quality[currIdx] ?? QUALITY.NO_ELEVATION);
    if (qualityPenalty(worseQuality(qa, qb)) > 0) {
      return false;
    }
  }
  return true;
}

function buildMarsLeg(grid: RoutingGrid, cells: number[], totalCost: number): RouteLeg {
  const spec = grid.manifest.grid;
  const width = spec.width;
  const dx = spec.cellSizeEast_m;
  const dy = spec.cellSizeNorth_m;

  const path: LocalPoint3[] = new Array<LocalPoint3>(cells.length);
  const distanceM: number[] = new Array<number>(cells.length);
  const elevationM: number[] = new Array<number>(cells.length);
  const pathIndex: number[] = new Array<number>(cells.length);
  const qualityIntervals: QualityInterval[] = [];

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
    const center = cellCenter(spec, row, col);
    const z = grid.elevation[idx]!;
    path[k] = { east_m: center.east_m, north_m: center.north_m, elevation_m: z };
    elevationM[k] = z;
    pathIndex[k] = k;

    const s = grid.slope[idx]!;
    if (s > maxSlope) maxSlope = s;

    if (k === 0) {
      distanceM[0] = 0;
      continue;
    }

    const prevIdx = cells[k - 1]!;
    const prevRow = Math.floor(prevIdx / width);
    const prevCol = prevIdx - prevRow * width;
    const dr = Math.abs(row - prevRow);
    const dc = Math.abs(col - prevCol);
    const stepLen =
      dr === 1 && dc === 1
        ? Math.hypot(dx, dy)
        : dr === 1 && dc === 0
          ? dy
          : dr === 0 && dc === 1
            ? dx
            : Math.hypot(dc * dx, dr * dy);
    const dz = z - grid.elevation[prevIdx]!;

    const fromDist = horizontalDistance;
    horizontalDistance += stepLen;
    surfaceDistance += Math.hypot(stepLen, dz);
    if (dz > 0) ascent += dz;
    else descent -= dz;

    const gradeDeg = Math.atan(Math.abs(dz) / stepLen) * RAD_TO_DEG;
    if (gradeDeg > maxGradeDeg) maxGradeDeg = gradeDeg;
    distanceM[k] = horizontalDistance;

    const qa = normalizeQualityCode(grid.quality[prevIdx] ?? QUALITY.NO_ELEVATION);
    const qb = normalizeQualityCode(grid.quality[idx] ?? QUALITY.NO_ELEVATION);
    const stepQuality = worseQuality(qa, qb);

    if (stepQuality === QUALITY.LOW) lowLen += stepLen;
    else if (stepQuality === QUALITY.UNKNOWN) unkLen += stepLen;

    const lastInterval = qualityIntervals[qualityIntervals.length - 1];
    if (lastInterval && lastInterval.quality === stepQuality) {
      lastInterval.toDistance_m = horizontalDistance;
    } else {
      qualityIntervals.push({
        fromDistance_m: fromDist,
        toDistance_m: horizontalDistance,
        quality: stepQuality,
      });
    }
  }

  const metrics: RouteMetrics = {
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
  };

  return {
    cells,
    path,
    metrics,
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
  candidate: RouteCandidate,
  allCandidates: readonly RouteCandidate[],
  uniformQualityZeroGamma: boolean,
): string[] {
  const out: string[] = [];
  const m = candidate.outbound.metrics;

  if (candidate.policies.length > 1) {
    out.push(`Identical path produced by: ${candidate.policies.join(', ')}.`);
  }
  if (m.cellCount === 1) {
    out.push('Start and destination lie in the same grid cell (zero-length route).');
  }
  if (uniformQualityZeroGamma && candidate.policies.includes('uncertainty-aware')) {
    out.push(
      'Uniform quality across admissible terrain (no uncertainty differentiation; gamma_eff = 0).',
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
          `Same horizontal length as ${other.candidateId} (~${m.horizontalDistance_m.toFixed(0)} m), avoiding ${(deltaUnk + deltaLow).toFixed(0)} m of degraded/unknown terrain.`,
        );
      }
      continue;
    }

    if (deltaDist > 0 && deltaUnk > 0) {
      out.push(
        `+${deltaDist.toFixed(0)} m longer than ${other.candidateId} while reducing unknown-quality exposure by ${deltaUnk.toFixed(0)} m.`,
      );
    } else if (deltaDist > 0 && deltaLow > 0) {
      out.push(
        `+${deltaDist.toFixed(0)} m longer than ${other.candidateId} while reducing low-quality exposure by ${deltaLow.toFixed(0)} m.`,
      );
    } else if (deltaDist > 0 && om.maxTerrainSlope_deg - m.maxTerrainSlope_deg > 0.5) {
      out.push(
        `+${deltaDist.toFixed(0)} m longer than ${other.candidateId} to lower peak terrain slope from ${om.maxTerrainSlope_deg.toFixed(1)} deg to ${m.maxTerrainSlope_deg.toFixed(1)} deg.`,
      );
    }
  }

  if (out.length === 0) {
    out.push(
      `EVA A* (${MODEL_VERSION}): ${m.horizontalDistance_m.toFixed(0)} m horizontal, max slope ${m.maxTerrainSlope_deg.toFixed(1)} deg.`,
    );
  }

  return out;
}

function resolveEndpoint(grid: GridSpec, point: LocalPoint): EndpointResolution | null {
  const cell = pointToCell(grid, point);
  if (!cell) return null;
  return {
    requested: { east_m: point.east_m, north_m: point.north_m },
    cell,
    accepted: cellCenter(grid, cell.row, cell.col),
  };
}

function defaultPolicyWeights(policy: RoutePolicyId, gammaEff: number): PolicyWeights {
  if (policy === 'shortest-feasible') {
    return { ...EVA_POLICY_WEIGHTS['shortest-feasible'] };
  }
  if (policy === 'terrain-aware') {
    return { ...EVA_POLICY_WEIGHTS['terrain-aware'] };
  }
  return {
    slope: EVA_POLICY_WEIGHTS['uncertainty-aware'].slope,
    roughness: EVA_POLICY_WEIGHTS['uncertainty-aware'].roughness,
    quality: gammaEff,
  };
}

function weightsMatch(a: PolicyWeights, b: PolicyWeights): boolean {
  return (
    Math.abs(a.slope - b.slope) <= 1e-12 &&
    Math.abs(a.roughness - b.roughness) <= 1e-12 &&
    Math.abs(a.quality - b.quality) <= 1e-12
  );
}

function isValidGridSpec(spec: GridSpec | undefined): spec is GridSpec {
  if (!spec || typeof spec !== 'object') return false;
  if (
    !Number.isInteger(spec.width) ||
    !Number.isInteger(spec.height) ||
    spec.width <= 0 ||
    spec.height <= 0
  ) {
    return false;
  }
  if (
    !Number.isFinite(spec.cellSizeEast_m) ||
    !Number.isFinite(spec.cellSizeNorth_m) ||
    spec.cellSizeEast_m <= 0 ||
    spec.cellSizeNorth_m <= 0
  ) {
    return false;
  }
  const e = spec.extent;
  if (
    !e ||
    !Number.isFinite(e.west_m) ||
    !Number.isFinite(e.east_m) ||
    !Number.isFinite(e.south_m) ||
    !Number.isFinite(e.north_m) ||
    e.east_m <= e.west_m ||
    e.north_m <= e.south_m
  ) {
    return false;
  }
  return true;
}

function isValidWeights(w: PolicyWeights | undefined): w is PolicyWeights {
  return (
    !!w &&
    typeof w === 'object' &&
    Number.isFinite(w.slope) &&
    w.slope >= 0 &&
    Number.isFinite(w.roughness) &&
    w.roughness >= 0 &&
    Number.isFinite(w.quality) &&
    w.quality >= 0
  );
}

function remapFramesForReuse(
  frames: readonly SearchTraceFrame[],
  policy: RoutePolicyId,
  sourcePolicy: RoutePolicyId,
): SearchTraceFrame[] {
  return frames.map((frame) => ({
    ...frame,
    policy,
    closedCells: frame.closedCells.slice(),
    frontierCells: frame.frontierCells.slice(),
    currentBestCells: frame.currentBestCells.slice(),
    note: `${policy} (reused ${sourcePolicy}): ${frame.note}`,
  }));
}

export function solveRoute(
  grid: RoutingGrid | null,
  req: RouteRequest,
  hooks: SolveHooks = {},
): RouteFinalResponse {
  const now = hooks.now ?? (() => Date.now());
  const t0 = now();
  const base = {
    requestId: req.requestId,
    bundleVersion: req.bundleVersion,
    modelVersion: MODEL_VERSION,
  };

  type InvalidReason = Extract<RouteFinalResponse, { status: 'invalid-input' }>['reason'];
  const invalid = (
    reason: InvalidReason,
    field: string | null,
    message: string,
  ): RouteFinalResponse => ({
    ...base,
    status: 'invalid-input',
    reason,
    field,
    message,
  });

  if (!grid) {
    return invalid('bundle-not-loaded', null, 'No region bundle is loaded in the worker.');
  }
  if (!req || typeof req !== 'object') {
    return invalid('malformed', null, 'Route request is missing or malformed.');
  }
  if (req.bundleVersion !== grid.bundleVersion) {
    return invalid(
      'version-mismatch',
      'bundleVersion',
      `Request names bundle ${req.bundleVersion} but worker has ${grid.bundleVersion}.`,
    );
  }
  if (req.modelVersion !== MODEL_VERSION) {
    return invalid(
      'model-mismatch',
      'modelVersion',
      `Request expects model ${req.modelVersion}; worker runs ${MODEL_VERSION}.`,
    );
  }
  if (!Array.isArray(req.policies) || req.policies.length === 0) {
    return invalid('no-policies', 'policies', 'At least one route policy is required.');
  }

  const normalizedPolicies: RoutePolicyId[] = [];
  for (const p of ROUTE_POLICIES) {
    if (req.policies.includes(p)) {
      normalizedPolicies.push(p);
    }
  }
  if (normalizedPolicies.length === 0) {
    return invalid('no-policies', 'policies', 'No supported route policies specified.');
  }

  if (req.strictQuality && !grid.manifest.strictQualitySupported) {
    return invalid(
      'strict-quality-unsupported',
      'strictQuality',
      'This bundle has no documented quality classes; strict quality mode is unavailable.',
    );
  }

  const gridSpec = grid.manifest?.grid;
  if (!isValidGridSpec(gridSpec)) {
    return invalid('malformed', null, 'Region bundle grid specification is malformed.');
  }
  const totalCells = gridSpec.width * gridSpec.height;
  if (
    !Number.isSafeInteger(totalCells) ||
    totalCells <= 0 ||
    grid.elevation.length !== totalCells ||
    grid.slope.length !== totalCells ||
    grid.roughness.length !== totalCells ||
    grid.quality.length !== totalCells ||
    grid.exclusion.length !== totalCells
  ) {
    return invalid('malformed', null, 'Region bundle raster lengths do not match grid dimensions.');
  }

  if (req.weightOverrides !== undefined) {
    for (const p of normalizedPolicies) {
      const ov = req.weightOverrides[p];
      if (ov !== undefined && !isValidWeights(ov)) {
        return invalid(
          'malformed',
          'weightOverrides',
          `Weight override for policy ${p} must contain finite non-negative numbers.`,
        );
      }
    }
  }

  if (!req.start || typeof req.start !== 'object') {
    return invalid('malformed', 'start', 'Start endpoint is malformed.');
  }
  if (!req.destination || typeof req.destination !== 'object') {
    return invalid('malformed', 'destination', 'Destination endpoint is malformed.');
  }

  const start = resolveEndpoint(gridSpec, req.start);
  if (!start) {
    return invalid('endpoint-outside-region', 'start', 'Start point is outside the loaded region.');
  }
  const destination = resolveEndpoint(gridSpec, req.destination);
  if (!destination) {
    return invalid(
      'endpoint-outside-region',
      'destination',
      'Destination point is outside the loaded region.',
    );
  }

  for (const [field, ep] of [
    ['start', start],
    ['destination', destination],
  ] as const) {
    const idx = ep.cell.index;
    if (!isCellAdmissible(grid, idx, false)) {
      const slopeVal = grid.slope[idx];
      const slopeStr = slopeVal !== undefined && Number.isFinite(slopeVal) ? slopeVal.toFixed(1) : 'NaN';
      return invalid(
        'endpoint-excluded',
        field,
        `${field} cell (row ${ep.cell.row}, col ${ep.cell.col}) is excluded (code ${grid.exclusion[idx]}, slope ${slopeStr} deg).`,
      );
    }
    if (req.strictQuality && !isCellAdmissible(grid, idx, true)) {
      return invalid(
        'endpoint-quality-excluded',
        field,
        `${field} cell is outside the acceptable quality set in strict mode.`,
      );
    }
  }

  if (start.cell.index === destination.cell.index) {
    const cellIdx = start.cell.index;
    const zeroLeg = buildMarsLeg(grid, [cellIdx], 0);
    const returnZeroLeg = req.roundTrip ? buildMarsLeg(grid, [cellIdx], 0) : null;
    const sameCellCandidate: RouteCandidate = {
      candidateId: 'c0',
      policies: [...normalizedPolicies],
      outbound: zeroLeg,
      returnLeg: returnZeroLeg,
      missionStatus: req.roundTrip ? 'round-trip-complete' : 'one-way',
      explanation: [],
    };
    sameCellCandidate.explanation = buildExplanations(sameCellCandidate, [sameCellCandidate], false);
    const perPolicyFrames: SearchTraceFrame[] = normalizedPolicies.map((policy, step) => ({
      step,
      policy,
      closedCells: [cellIdx],
      frontierCells: [],
      currentBestCells: [cellIdx],
      currentBestCost: 0,
      exploredCount: 0,
      openSize: 0,
      note: `${policy}: start and destination share cell ${cellIdx} (zero-length route).`,
    }));
    const trace: SearchTraceData = {
      exploredTotal: 0,
      frames: perPolicyFrames.slice(0, MAX_TRACE_FRAMES),
    };
    return {
      ...base,
      status: 'success',
      start,
      destination,
      candidates: [sameCellCandidate],
      computeMs: Math.max(0, now() - t0),
      trace,
    };
  }

  const workspace = acquireWorkspace(totalCells);
  const admissible = workspace.admissible;
  let minPenalty = Number.POSITIVE_INFINITY;
  let maxPenalty = Number.NEGATIVE_INFINITY;
  let admissibleCount = 0;

  for (let i = 0; i < totalCells; i++) {
    if (!isCellAdmissible(grid, i, req.strictQuality)) {
      admissible[i] = 0;
      continue;
    }
    admissible[i] = 1;
    admissibleCount++;
    const pen = qualityPenalty(normalizeQualityCode(grid.quality[i] ?? QUALITY.NO_ELEVATION));
    if (pen < minPenalty) minPenalty = pen;
    if (pen > maxPenalty) maxPenalty = pen;
  }

  const uniformQualityOverride = admissibleCount > 0 && minPenalty === maxPenalty;
  const gammaNominal = uniformQualityOverride ? 0 : EVA_POLICY_WEIGHTS['uncertainty-aware'].quality;
  const explicitUncOverride = req.weightOverrides?.['uncertainty-aware'] !== undefined;
  const uniformQualityZeroGamma = uniformQualityOverride && !explicitUncOverride;

  const evalOrder: RoutePolicyId[] = [];
  for (const p of EVAL_ORDER) {
    if (normalizedPolicies.includes(p)) {
      evalOrder.push(p);
    }
  }

  const perPolicyFrameBudget = Math.max(1, Math.floor(MAX_TRACE_FRAMES / normalizedPolicies.length));
  const explored = { n: 0 };

  interface PolicyRunRecord {
    policy: RoutePolicyId;
    weights: PolicyWeights;
    out: InternalSearchResult | null;
    back: InternalSearchResult | null;
    traceFrames: SearchTraceFrame[];
  }

  const solvedByPolicy = new Map<RoutePolicyId, PolicyRunRecord>();

  try {
    for (const policy of evalOrder) {
      const override = req.weightOverrides?.[policy];
      const weights: PolicyWeights = override
        ? { slope: override.slope, roughness: override.roughness, quality: override.quality }
        : defaultPolicyWeights(policy, gammaNominal);

      const terrainRecord = solvedByPolicy.get('terrain-aware');
      if (
        policy === 'uncertainty-aware' &&
        terrainRecord &&
        terrainRecord.out &&
        terrainRecord.weights.quality === 0 &&
        Math.abs(weights.slope - terrainRecord.weights.slope) <= 1e-12 &&
        Math.abs(weights.roughness - terrainRecord.weights.roughness) <= 1e-12 &&
        (weights.quality === 0 ||
          (pathHasZeroQualityPenalty(grid, terrainRecord.out.cells) &&
            (!req.roundTrip ||
              !terrainRecord.back ||
              pathHasZeroQualityPenalty(grid, terrainRecord.back.cells))))
      ) {
        solvedByPolicy.set(policy, {
          policy,
          weights,
          out: { cells: terrainRecord.out.cells, cost: terrainRecord.out.cost, frames: [] },
          back: terrainRecord.back
            ? { cells: terrainRecord.back.cells, cost: terrainRecord.back.cost, frames: [] }
            : null,
          traceFrames: remapFramesForReuse(terrainRecord.traceFrames, policy, 'terrain-aware'),
        });
        continue;
      }

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
            ? { cells: matchedExisting.out.cells, cost: matchedExisting.out.cost, frames: [] }
            : null,
          back: matchedExisting.back
            ? { cells: matchedExisting.back.cells, cost: matchedExisting.back.cost, frames: [] }
            : null,
          traceFrames: remapFramesForReuse(
            matchedExisting.traceFrames,
            policy,
            matchedExisting.policy,
          ),
        });
        continue;
      }

      const out = runAStar(
        grid,
        workspace,
        start.cell.index,
        destination.cell.index,
        weights,
        policy,
        hooks,
        explored,
        perPolicyFrameBudget,
      );
      const back =
        out && req.roundTrip
          ? runAStar(
              grid,
              workspace,
              destination.cell.index,
              start.cell.index,
              weights,
              policy,
              hooks,
              explored,
              0,
            )
          : null;

      solvedByPolicy.set(policy, {
        policy,
        weights,
        out,
        back,
        traceFrames: out ? out.frames : [],
      });
    }

    const successfulRecords: PolicyRunRecord[] = [];
    for (const p of normalizedPolicies) {
      const rec = solvedByPolicy.get(p);
      if (rec && rec.out !== null) {
        successfulRecords.push(rec);
      }
    }

    if (successfulRecords.length === 0) {
      let reason: 'disconnected-under-limits' | 'strict-quality-disconnects' =
        'disconnected-under-limits';
      if (req.strictQuality) {
        for (let i = 0; i < totalCells; i++) {
          admissible[i] = isCellAdmissible(grid, i, false) ? 1 : 0;
        }
        const relaxedPath = runAStar(
          grid,
          workspace,
          start.cell.index,
          destination.cell.index,
          EVA_POLICY_WEIGHTS['shortest-feasible'],
          'shortest-feasible',
          hooks,
          explored,
          0,
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

    const candidatesByKey = new Map<string, RouteCandidate>();
    for (const record of successfulRecords) {
      const outRes = record.out;
      if (!outRes) continue;
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
      cand.explanation = buildExplanations(cand, candidates, uniformQualityZeroGamma);
    }

    const allFrames: SearchTraceFrame[] = [];
    for (const record of successfulRecords) {
      for (const frame of record.traceFrames) {
        if (allFrames.length >= MAX_TRACE_FRAMES) break;
        allFrames.push({
          ...frame,
          step: allFrames.length,
        });
      }
    }

    const trace: SearchTraceData = {
      exploredTotal: explored.n,
      frames: allFrames,
    };

    return {
      ...base,
      status: 'success',
      start,
      destination,
      candidates,
      computeMs: Math.max(0, now() - t0),
      trace,
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
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
