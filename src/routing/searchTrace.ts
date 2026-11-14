/**
 * On-demand A*, Dijkstra, and greedy best-first comparison for the route visualizer.
 * Never calls solveRoute, and is not registered from src/routing/index.ts.
 *
 * computeEdgeCost does not enforce exclusion, slope, strict quality, or grade.
 * Those gates run before every computeEdgeCost call. Each search owns a fresh
 * typed-array workspace; nothing is borrowed from the solver's shared heap.
 */
import type {
  LocalPoint,
  LocalPoint3,
  QualityCode,
  RouteCandidate,
  RoutePolicyId,
  RouteRequest,
  SearchTraceFrame,
} from '../contracts';
import { EXCLUSION, QUALITY, cellCenter, pointToCell } from '../contracts';
import type { PolicyWeights, RoutingGrid } from './evaEngine';
import {
  EVA_LIMITS,
  EVA_POLICY_WEIGHTS,
  computeEdgeCost,
  isCellAdmissible,
  qualityPenalty,
  worseQuality,
} from './evaEngine';

export type { SearchTraceFrame } from '../contracts';

export interface AlgorithmRunStats {
  algorithm: 'astar' | 'dijkstra' | 'greedy-best-first';
  exploredNodes: number;
  pathCellCount: number;
  weightedCost: number | null;
  horizontalDistance_m: number | null;
  computeMs: number;
  skipped: boolean;
  notice: string | null;
}

export interface AlgorithmComparison {
  policy: RoutePolicyId;
  astar: AlgorithmRunStats;
  dijkstra: AlgorithmRunStats;
  greedyBestFirst: AlgorithmRunStats;
  /** Dijkstra expansions / A* expansions, or null when either run did not finish or A* expanded nothing. */
  nodeReductionFactor: number | null;
  /** A* versus Dijkstra only. Greedy best-first is inadmissible and never sets this flag. */
  optimalCostMatch: boolean | null;
}

export type RejectionCategory =
  | 'excess-slope'
  | 'high-uncertainty'
  | 'rough-terrain'
  | 'suboptimal-detour'
  | 'alternative-policy';

export interface RejectedPathOption {
  id: string;
  label: string;
  category: RejectionCategory;
  reason: string;
  metricsDelta: {
    distanceDelta_m: number;
    maxSlope_deg: number;
    unknownLengthDelta_m: number;
    costRatio: number;
  };
  path: LocalPoint3[];
  colorHex: string;
}

export interface ThinkingStep {
  index: number;
  phase: 'endpoints' | 'admissibility' | 'policy-eval' | 'frontier-pruning' | 'comparison' | 'selection';
  title: string;
  formula?: string;
  detail: string;
  policy?: RoutePolicyId;
}

export interface SearchTraceResult {
  policy: RoutePolicyId;
  selectedCandidateId: string;
  frames: SearchTraceFrame[];
  comparison: AlgorithmComparison;
  rejectedPaths: RejectedPathOption[];
  thinkingSteps: ThinkingStep[];
  sampledNotice: string | null;
}

export interface SearchTraceOptions {
  maxFrames?: number;
  /** Expansion cap for both Dijkstra and greedy best-first. Default 250000. The name is historical; it is not Dijkstra-only. */
  maxDijkstraNodes?: number;
  policy?: RoutePolicyId;
  weightsOverride?: PolicyWeights;
}

type SearchMode = AlgorithmRunStats['algorithm'];

interface GridGeom {
  width: number;
  height: number;
  total: number;
  cellEast: number;
  cellNorth: number;
  diag: number;
}

interface TraceWorkspace {
  gScore: Float64Array;
  priority: Float64Array;
  crossScore: Float64Array;
  parentIndex: Int32Array;
  seen: Uint8Array;
  closed: Uint8Array;
  heapNodes: Int32Array;
  heapPos: Int32Array;
  admissible: Uint8Array;
}

interface SearchRun {
  stats: AlgorithmRunStats;
  frames: SearchTraceFrame[];
}

interface WeightChoice {
  weights: PolicyWeights;
  fromOverride: boolean;
  fromRequest: boolean;
  ignoredOverride: boolean;
}

interface Baseline {
  found: boolean;
  distance: number;
  unknown: number;
  cost: number;
  slope: number;
  cells: readonly number[];
  policies: readonly RoutePolicyId[];
}

interface CorridorMeasure {
  path: LocalPoint3[];
  distance_m: number;
  maxSlope_deg: number;
  unknown_m: number;
  weightedCost: number | null;
  steep: boolean;
  blocked: boolean;
  rough: boolean;
  uncertain: boolean;
}

const HARD_MAX_FRAMES = 48;
const MAX_CELLS_PER_FRAME = 256;
const LARGE_GRID_CELLS = 100_000;
const DEFAULT_NODE_CAP = 250_000;
const COST_MATCH_ABS = 1e-4;
const MAX_GRADE_TAN = Math.tan((EVA_LIMITS.maxAbsEdgeGrade_deg * Math.PI) / 180);
const REJECTED_COLORS = ['#f59e0b', '#ef4444', '#a855f7'] as const;

/** Deterministic 8-neighbor order: N, NE, E, SE, S, SW, W, NW. */
const DIRECTIONS: readonly (readonly [number, number, boolean])[] = [
  [-1, 0, false],
  [-1, 1, true],
  [0, 1, false],
  [1, 1, true],
  [1, 0, false],
  [1, -1, true],
  [0, -1, false],
  [-1, -1, true],
];

function nowMs(): number {
  const perf = globalThis.performance;
  if (perf && typeof perf.now === 'function') return perf.now();
  return Date.now();
}

function elapsedMs(started: number): number {
  const dt = nowMs() - started;
  return Number.isFinite(dt) && dt > 0 ? dt : 0;
}

function finiteOrNull(value: number | undefined): number | null {
  return value !== undefined && Number.isFinite(value) ? value : null;
}

function clampFrames(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return HARD_MAX_FRAMES;
  const floored = Math.floor(value);
  if (floored < 0) return 0;
  if (floored > HARD_MAX_FRAMES) return HARD_MAX_FRAMES;
  return floored;
}

function clampNodeCap(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_NODE_CAP;
  const floored = Math.floor(value);
  return floored < 0 ? 0 : floored;
}

function readGeom(grid: RoutingGrid): GridGeom | null {
  const spec = grid.manifest?.grid;
  if (!spec) return null;
  const width = spec.width;
  const height = spec.height;
  const cellEast = spec.cellSizeEast_m;
  const cellNorth = spec.cellSizeNorth_m;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return null;
  if (!Number.isFinite(cellEast) || !Number.isFinite(cellNorth) || cellEast <= 0 || cellNorth <= 0) {
    return null;
  }
  const total = width * height;
  if (!Number.isSafeInteger(total) || total <= 0) return null;
  return { width, height, total, cellEast, cellNorth, diag: Math.hypot(cellEast, cellNorth) };
}

function extentOk(grid: RoutingGrid): boolean {
  const extent = grid.manifest?.grid?.extent;
  if (!extent) return false;
  return (
    Number.isFinite(extent.west_m) &&
    Number.isFinite(extent.east_m) &&
    Number.isFinite(extent.south_m) &&
    Number.isFinite(extent.north_m) &&
    extent.east_m > extent.west_m &&
    extent.north_m > extent.south_m
  );
}

function rastersReady(grid: RoutingGrid): boolean {
  return Boolean(grid.elevation && grid.slope && grid.roughness && grid.quality && grid.exclusion);
}

function makeStats(
  algorithm: SearchMode,
  exploredNodes: number,
  pathCellCount: number,
  weightedCost: number | null,
  horizontalDistance_m: number | null,
  computeMs: number,
  skipped: boolean,
  notice: string | null,
): AlgorithmRunStats {
  return {
    algorithm,
    exploredNodes,
    pathCellCount,
    weightedCost,
    horizontalDistance_m,
    computeMs,
    skipped,
    notice,
  };
}

function findCandidate(candidates: readonly RouteCandidate[], id: string): RouteCandidate | null {
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (candidate && candidate.candidateId === id) return candidate;
  }
  return null;
}

function isPolicy(value: string | undefined): value is RoutePolicyId {
  return value === 'shortest-feasible' || value === 'terrain-aware' || value === 'uncertainty-aware';
}

function resolvePolicy(
  options: SearchTraceOptions | undefined,
  candidates: readonly RouteCandidate[],
  selectedCandidateId: string,
): RoutePolicyId {
  if (options?.policy && isPolicy(options.policy)) return options.policy;
  const selected = findCandidate(candidates, selectedCandidateId);
  const first = selected?.policies[0];
  if (isPolicy(first)) return first;
  return 'terrain-aware';
}

function usableWeights(weights: PolicyWeights | undefined): PolicyWeights | null {
  if (!weights) return null;
  if (
    Number.isFinite(weights.slope) &&
    weights.slope >= 0 &&
    Number.isFinite(weights.roughness) &&
    weights.roughness >= 0 &&
    Number.isFinite(weights.quality) &&
    weights.quality >= 0
  ) {
    return { slope: weights.slope, roughness: weights.roughness, quality: weights.quality };
  }
  return null;
}

function resolveWeights(
  policy: RoutePolicyId,
  override: PolicyWeights | undefined,
  request: RouteRequest | null | undefined,
): WeightChoice {
  const defaults = EVA_POLICY_WEIGHTS[policy];
  const table: PolicyWeights = {
    slope: defaults.slope,
    roughness: defaults.roughness,
    quality: defaults.quality,
  };
  const chosen = usableWeights(override);
  if (chosen) return { weights: chosen, fromOverride: true, fromRequest: false, ignoredOverride: false };
  const fromRequest = usableWeights(request?.weightOverrides?.[policy]);
  if (fromRequest) {
    return { weights: fromRequest, fromOverride: false, fromRequest: true, ignoredOverride: override !== undefined };
  }
  return { weights: table, fromOverride: false, fromRequest: false, ignoredOverride: override !== undefined };
}

function cellIndexFor(grid: RoutingGrid, point: LocalPoint | null | undefined): number | null {
  if (!point || !Number.isFinite(point.east_m) || !Number.isFinite(point.north_m)) return null;
  const spec = grid.manifest?.grid;
  if (!spec) return null;
  const cell = pointToCell(spec, point);
  return cell ? cell.index : null;
}

function assembleComparison(
  policy: RoutePolicyId,
  astar: AlgorithmRunStats,
  dijkstra: AlgorithmRunStats,
  greedyBestFirst: AlgorithmRunStats,
): AlgorithmComparison {
  const bothFinished = !astar.skipped && !dijkstra.skipped;
  const nodeReductionFactor =
    bothFinished && astar.exploredNodes > 0 ? dijkstra.exploredNodes / astar.exploredNodes : null;
  let optimalCostMatch: boolean | null = null;
  if (bothFinished && astar.weightedCost !== null && dijkstra.weightedCost !== null) {
    optimalCostMatch = Math.abs(astar.weightedCost - dijkstra.weightedCost) <= COST_MATCH_ABS;
  }
  return { policy, astar, dijkstra, greedyBestFirst, nodeReductionFactor, optimalCostMatch };
}

function hiriseNotice(name: string, totalCells: number): string {
  return `${name} was skipped because this grid has ${totalCells} cells, which is above the 100,000-cell cutoff. The 1000 by 1000 HiRISE map has 1,000,000 cells and uses this same skip. A grid just over 100,000 cells is not that map. A full-grid comparison is not run.`;
}

function skippedRun(algorithm: SearchMode, notice: string, computeMs = 0): AlgorithmRunStats {
  return makeStats(algorithm, 0, 0, null, null, computeMs, true, notice);
}

function createWorkspace(capacity: number): TraceWorkspace {
  const parentIndex = new Int32Array(capacity);
  parentIndex.fill(-1);
  const heapPos = new Int32Array(capacity);
  heapPos.fill(-1);
  return {
    gScore: new Float64Array(capacity),
    priority: new Float64Array(capacity),
    crossScore: new Float64Array(capacity),
    parentIndex,
    seen: new Uint8Array(capacity),
    closed: new Uint8Array(capacity),
    heapNodes: new Int32Array(capacity),
    heapPos,
    admissible: new Uint8Array(capacity),
  };
}

function fillAdmissible(grid: RoutingGrid, mask: Uint8Array, total: number, strictQuality: boolean): void {
  const count = Math.min(total, mask.length);
  for (let i = 0; i < count; i++) {
    mask[i] = isCellAdmissible(grid, i, strictQuality) ? 1 : 0;
  }
}

/** Lower priority, then the solver's cross-product tie-break, then the smaller cell index. */
class TraceHeap {
  private count = 0;

  constructor(
    private readonly nodes: Int32Array,
    private readonly pos: Int32Array,
    private readonly priority: Float64Array,
    private readonly cross: Float64Array,
  ) {}

  get size(): number {
    return this.count;
  }

  pushOrDecrease(node: number): void {
    if (node < 0 || node >= this.pos.length) return;
    const existing = this.pos[node];
    if (existing !== undefined && existing >= 0) {
      this.siftUp(existing);
      return;
    }
    if (this.count >= this.nodes.length) return;
    const index = this.count;
    this.count = index + 1;
    this.nodes[index] = node;
    this.pos[node] = index;
    this.siftUp(index);
  }

  pop(): number {
    if (this.count <= 0) return -1;
    const minNode = this.nodes[0];
    if (minNode === undefined) return -1;
    this.pos[minNode] = -1;
    this.count -= 1;
    if (this.count > 0) {
      const last = this.nodes[this.count];
      if (last === undefined) return minNode;
      this.nodes[0] = last;
      this.pos[last] = 0;
      this.siftDown(0);
    }
    return minNode;
  }

  private better(a: number, b: number): boolean {
    const left = this.priority[a];
    const right = this.priority[b];
    if (left === undefined || right === undefined) return a < b;
    if (left !== right) return left < right;
    const crossA = this.cross[a];
    const crossB = this.cross[b];
    if (crossA === undefined || crossB === undefined) return a < b;
    if (crossA !== crossB) return crossA < crossB;
    return a < b;
  }

  private siftUp(index: number): void {
    const node = this.nodes[index];
    if (node === undefined) return;
    let idx = index;
    while (idx > 0) {
      const parentIdx = (idx - 1) >> 1;
      const parentNode = this.nodes[parentIdx];
      if (parentNode === undefined || !this.better(node, parentNode)) break;
      this.nodes[idx] = parentNode;
      this.pos[parentNode] = idx;
      idx = parentIdx;
    }
    this.nodes[idx] = node;
    this.pos[node] = idx;
  }

  private siftDown(index: number): void {
    const node = this.nodes[index];
    if (node === undefined) return;
    let idx = index;
    const half = this.count >> 1;
    while (idx < half) {
      const childIdx = (idx << 1) + 1;
      const left = this.nodes[childIdx];
      if (left === undefined) break;
      const rightIdx = childIdx + 1;
      let bestIdx = childIdx;
      let bestNode = left;
      if (rightIdx < this.count) {
        const right = this.nodes[rightIdx];
        if (right !== undefined && this.better(right, left)) {
          bestIdx = rightIdx;
          bestNode = right;
        }
      }
      if (!this.better(bestNode, node)) break;
      this.nodes[idx] = bestNode;
      this.pos[bestNode] = idx;
      idx = bestIdx;
    }
    this.nodes[idx] = node;
    this.pos[node] = idx;
  }
}

function priorityFor(mode: SearchMode, g: number, h: number): number {
  if (mode === 'dijkstra') return g;
  if (mode === 'greedy-best-first') return h;
  return g + h;
}

function euclideanMetres(
  row: number,
  col: number,
  goalRow: number,
  goalCol: number,
  cellEast: number,
  cellNorth: number,
): number {
  return Math.hypot((col - goalCol) * cellEast, (goalRow - row) * cellNorth);
}

function crossTie(
  row: number,
  col: number,
  startRow: number,
  startCol: number,
  goalRow: number,
  goalCol: number,
  cellEast: number,
  cellNorth: number,
): number {
  const startGoalEast = (goalCol - startCol) * cellEast;
  const startGoalNorth = (startRow - goalRow) * cellNorth;
  const norm = Math.max(1, Math.hypot(startGoalEast, startGoalNorth));
  const east = (col - startCol) * cellEast;
  const north = (startRow - row) * cellNorth;
  return (Math.abs(east * startGoalNorth - startGoalEast * north) / norm) * 1e-6;
}

function spanLength(
  u: number,
  v: number,
  width: number,
  cellEast: number,
  cellNorth: number,
): number {
  const ur = Math.floor(u / width);
  const uc = u - ur * width;
  const vr = Math.floor(v / width);
  const vc = v - vr * width;
  const dr = Math.abs(vr - ur);
  const dc = Math.abs(vc - uc);
  if (dr === 1 && dc === 1) return Math.hypot(cellEast, cellNorth);
  if (dr === 1 && dc === 0) return cellNorth;
  if (dr === 0 && dc === 1) return cellEast;
  return Math.hypot(dc * cellEast, dr * cellNorth);
}

function horizontalDistance(
  cells: readonly number[],
  width: number,
  cellEast: number,
  cellNorth: number,
): number {
  let total = 0;
  for (let i = 1; i < cells.length; i++) {
    const prev = cells[i - 1];
    const curr = cells[i];
    if (prev === undefined || curr === undefined) continue;
    total += spanLength(prev, curr, width, cellEast, cellNorth);
  }
  return total;
}

/**
 * True when both cells are admissible, diagonal corners are admissible, elevations
 * are finite, and the grade is at most 20°. Equality with tan(20°) stays allowed.
 * Caller must not call computeEdgeCost when this returns false.
 */
function unitStepAllowed(
  grid: RoutingGrid,
  admissible: Uint8Array,
  u: number,
  v: number,
  ur: number,
  uc: number,
  vr: number,
  vc: number,
  isDiag: boolean,
  width: number,
  stepLen: number,
): boolean {
  if (admissible[u] !== 1 || admissible[v] !== 1) return false;
  if (isDiag) {
    const cornerA = ur * width + vc;
    const cornerB = vr * width + uc;
    if (admissible[cornerA] !== 1 || admissible[cornerB] !== 1) return false;
  }
  const zu = grid.elevation[u];
  const zv = grid.elevation[v];
  if (zu === undefined || zv === undefined || !Number.isFinite(zu) || !Number.isFinite(zv)) return false;
  if (!(stepLen > 0) || !Number.isFinite(stepLen)) return false;
  return Math.abs(zv - zu) / stepLen <= MAX_GRADE_TAN;
}

function reconstructPath(
  parent: Int32Array,
  startIndex: number,
  goalIndex: number,
  guard: number,
): number[] | null {
  const reversed: number[] = [];
  let current = goalIndex;
  for (let steps = 0; steps <= guard; steps++) {
    reversed.push(current);
    if (current === startIndex) {
      reversed.reverse();
      return reversed;
    }
    const previous = parent[current];
    if (previous === undefined || previous < 0) return null;
    current = previous;
  }
  return null;
}

function capCellList(values: readonly number[], maxLen: number): number[] {
  if (maxLen <= 0 || values.length === 0) return [];
  if (values.length <= maxLen) {
    const copy: number[] = [];
    for (let i = 0; i < values.length; i++) {
      const value = values[i];
      if (value !== undefined) copy.push(value);
    }
    return copy;
  }
  const out: number[] = [];
  const lastSrc = values.length - 1;
  const lastOut = maxLen - 1;
  for (let i = 0; i < maxLen; i++) {
    const value = values[Math.floor((i * lastSrc) / lastOut)];
    if (value !== undefined) out.push(value);
  }
  const first = values[0];
  const last = values[lastSrc];
  if (first !== undefined && out[0] !== first) out.unshift(first);
  if (last !== undefined && out[out.length - 1] !== last) out.push(last);
  if (out.length > maxLen) {
    out.length = maxLen;
    if (last !== undefined) out[maxLen - 1] = last;
  }
  return out;
}

function sampleOpen(nodes: Int32Array, count: number, maxLen: number): number[] {
  if (count <= 0 || maxLen <= 0) return [];
  if (count <= maxLen) {
    const out: number[] = [];
    for (let i = 0; i < count; i++) {
      const value = nodes[i];
      if (value !== undefined) out.push(value);
    }
    return out;
  }
  const out: number[] = [];
  const lastSrc = count - 1;
  const lastOut = maxLen - 1;
  for (let i = 0; i < maxLen; i++) {
    const value = nodes[Math.floor((i * lastSrc) / lastOut)];
    if (value !== undefined) out.push(value);
  }
  return out;
}

function compactFrames(frames: SearchTraceFrame[]): void {
  if (frames.length < 2) return;
  const kept: SearchTraceFrame[] = [];
  const first = frames[0];
  if (first) kept.push(first);
  for (let i = 1; i < frames.length; i += 2) {
    const frame = frames[i];
    if (frame) kept.push(frame);
  }
  const last = frames[frames.length - 1];
  const tail = kept[kept.length - 1];
  if (last && tail !== last) kept.push(last);
  const next: SearchTraceFrame[] = [];
  for (let i = 0; i < kept.length; i++) {
    const frame = kept[i];
    if (!frame) continue;
    next.push({
      step: next.length,
      policy: frame.policy,
      closedCells: frame.closedCells.slice(),
      frontierCells: frame.frontierCells.slice(),
      currentBestCells: frame.currentBestCells.slice(),
      currentBestCost: frame.currentBestCost,
      exploredCount: frame.exploredCount,
      openSize: frame.openSize,
      note: frame.note,
    });
  }
  frames.length = 0;
  for (let i = 0; i < next.length; i++) {
    const frame = next[i];
    if (frame) frames.push(frame);
  }
}

function frameNote(policy: RoutePolicyId, explored: number, openSize: number, isGoal: boolean, isFirst: boolean): string {
  if (isGoal) {
    return `${policy}: reached the destination after ${explored} expansions, with ${openSize} cells still open.`;
  }
  if (isFirst) {
    return `${policy}: expanded the start cell and pushed its legal neighbors (${openSize} open).`;
  }
  return `${policy}: expanded ${explored} cells, with ${openSize} cells on the frontier.`;
}

function algorithmLabel(mode: SearchMode): string {
  if (mode === 'astar') return 'A*';
  if (mode === 'dijkstra') return 'Dijkstra';
  return 'Greedy best-first';
}

/**
 * A shared cell is a zero-length route only when that cell is admissible.
 * Blocked, missing, or strict-quality cells are not reported as a successful route.
 */
function sameCellRun(
  grid: RoutingGrid,
  sharedCell: number,
  policy: RoutePolicyId,
  mode: SearchMode,
  strictQuality: boolean,
  maxFrames: number,
  started: number,
): SearchRun {
  const computeMs = elapsedMs(started);
  if (!isCellAdmissible(grid, sharedCell, strictQuality)) {
    return {
      stats: makeStats(
        mode,
        0,
        0,
        null,
        null,
        computeMs,
        false,
        'Start and destination share one cell, and that cell is not admissible, so no route is reported.',
      ),
      frames: [],
    };
  }
  const frames: SearchTraceFrame[] =
    mode === 'astar' && maxFrames > 0
      ? [
          {
            step: 0,
            policy,
            closedCells: [sharedCell],
            frontierCells: [],
            currentBestCells: [sharedCell],
            currentBestCost: 0,
            exploredCount: 0,
            openSize: 0,
            note: `${policy}: start and destination share one admissible cell, so the route length is zero.`,
          },
        ]
      : [];
  return {
    stats: makeStats(mode, 0, 1, 0, 0, computeMs, false, null),
    frames,
  };
}

function runSearch(
  grid: RoutingGrid,
  ws: TraceWorkspace,
  geom: GridGeom,
  startIndex: number,
  goalIndex: number,
  weights: PolicyWeights,
  policy: RoutePolicyId,
  mode: SearchMode,
  nodeLimit: number | null,
  maxFrames: number,
  strictQuality: boolean,
): SearchRun {
  const started = nowMs();
  const recordFrames = mode === 'astar' && maxFrames > 0;

  if (startIndex === goalIndex) {
    return sameCellRun(grid, startIndex, policy, mode, strictQuality, maxFrames, started);
  }

  if (nodeLimit !== null && nodeLimit <= 0) {
    return {
      stats: makeStats(
        mode,
        0,
        0,
        null,
        null,
        elapsedMs(started),
        true,
        `${algorithmLabel(mode)} was skipped because the expansion cap is 0.`,
      ),
      frames: [],
    };
  }

  fillAdmissible(grid, ws.admissible, geom.total, strictQuality);
  if (ws.admissible[startIndex] !== 1) {
    return {
      stats: makeStats(
        mode,
        0,
        0,
        null,
        null,
        elapsedMs(started),
        false,
        'The start cell is not admissible, so no search was run and no wavefront frame was recorded.',
      ),
      frames: [],
    };
  }
  const heap = new TraceHeap(ws.heapNodes, ws.heapPos, ws.priority, ws.crossScore);
  const startRow = Math.floor(startIndex / geom.width);
  const startCol = startIndex - startRow * geom.width;
  const goalRow = Math.floor(goalIndex / geom.width);
  const goalCol = goalIndex - goalRow * geom.width;
  const h0 = euclideanMetres(startRow, startCol, goalRow, goalCol, geom.cellEast, geom.cellNorth);
  ws.seen[startIndex] = 1;
  ws.gScore[startIndex] = 0;
  ws.priority[startIndex] = priorityFor(mode, 0, h0);
  ws.crossScore[startIndex] = 0;
  ws.parentIndex[startIndex] = -1;
  heap.pushOrDecrease(startIndex);

  const frames: SearchTraceFrame[] = [];
  const batch: number[] = [];
  let sampleEvery = 1;
  let exploredNodes = 0;

  const pushFrame = (u: number, isGoal: boolean): void => {
    if (!recordFrames) return;
    const isFirst = exploredNodes === 1;
    const due = isFirst || exploredNodes % sampleEvery === 0 || isGoal;
    if (!due) return;
    if (frames.length >= maxFrames && maxFrames >= 2) {
      compactFrames(frames);
      sampleEvery *= 2;
    }
    const pathSoFar = reconstructPath(ws.parentIndex, startIndex, u, geom.total) ?? [u];
    const g = ws.gScore[u];
    const frame: SearchTraceFrame = {
      step: frames.length,
      policy,
      closedCells: capCellList(batch, MAX_CELLS_PER_FRAME),
      frontierCells: sampleOpen(ws.heapNodes, heap.size, MAX_CELLS_PER_FRAME),
      currentBestCells: capCellList(pathSoFar, MAX_CELLS_PER_FRAME),
      currentBestCost: g !== undefined && Number.isFinite(g) ? g : 0,
      exploredCount: exploredNodes,
      openSize: heap.size,
      note: frameNote(policy, exploredNodes, heap.size, isGoal, isFirst),
    };
    if (maxFrames <= 1) {
      frame.step = 0;
      if (frames.length === 0) frames.push(frame);
      else if (isGoal) frames[0] = frame;
      batch.length = 0;
      return;
    }
    if (frames.length >= maxFrames) {
      if (isGoal && frames.length >= 2) {
        frame.step = frames.length - 1;
        frames[frames.length - 1] = frame;
      }
      return;
    }
    frames.push(frame);
    batch.length = 0;
  };

  while (heap.size > 0) {
    if (nodeLimit !== null && exploredNodes >= nodeLimit) {
      return {
        stats: makeStats(
          mode,
          exploredNodes,
          0,
          null,
          null,
          elapsedMs(started),
          true,
          `${algorithmLabel(mode)} stopped after ${exploredNodes} expansions because maxDijkstraNodes is ${nodeLimit}. That cap applies to Dijkstra and to greedy best-first. The unfinished search is skipped and is not used to judge optimality.`,
        ),
        frames: [],
      };
    }
    const u = heap.pop();
    if (u < 0) break;
    if (ws.closed[u] === 1) continue;
    ws.closed[u] = 1;
    exploredNodes += 1;
    if (recordFrames) batch.push(u);

    if (u !== goalIndex && ws.admissible[u] === 1) {
      const ur = Math.floor(u / geom.width);
      const uc = u - ur * geom.width;
      const uG = ws.gScore[u];
      if (uG !== undefined) {
        for (let d = 0; d < DIRECTIONS.length; d++) {
          const step = DIRECTIONS[d];
          if (!step) continue;
          const dr = step[0];
          const dc = step[1];
          const isDiag = step[2];
          const vr = ur + dr;
          const vc = uc + dc;
          if (vr < 0 || vc < 0 || vr >= geom.height || vc >= geom.width) continue;
          const v = vr * geom.width + vc;
          if (ws.closed[v] === 1) continue;
          const stepLen = isDiag ? geom.diag : dr !== 0 ? geom.cellNorth : geom.cellEast;
          if (!unitStepAllowed(grid, ws.admissible, u, v, ur, uc, vr, vc, isDiag, geom.width, stepLen)) {
            continue;
          }
          const edge = computeEdgeCost(grid, u, v, weights);
          if (!Number.isFinite(edge)) continue;
          const nextG = uG + edge;
          const h = euclideanMetres(vr, vc, goalRow, goalCol, geom.cellEast, geom.cellNorth);
          if (ws.seen[v] !== 1) {
            ws.seen[v] = 1;
            ws.gScore[v] = nextG;
            ws.priority[v] = priorityFor(mode, nextG, h);
            ws.crossScore[v] = crossTie(
              vr,
              vc,
              startRow,
              startCol,
              goalRow,
              goalCol,
              geom.cellEast,
              geom.cellNorth,
            );
            ws.parentIndex[v] = u;
            heap.pushOrDecrease(v);
          } else {
            const oldG = ws.gScore[v];
            if (oldG !== undefined && nextG < oldG) {
              ws.gScore[v] = nextG;
              ws.priority[v] = priorityFor(mode, nextG, h);
              ws.parentIndex[v] = u;
              if (mode !== 'greedy-best-first') heap.pushOrDecrease(v);
            }
          }
        }
      }
    }

    const isGoal = u === goalIndex;
    pushFrame(u, isGoal);
    if (!isGoal) continue;

    const cells = reconstructPath(ws.parentIndex, startIndex, goalIndex, geom.total);
    const g = ws.gScore[goalIndex];
    if (!cells || g === undefined || !Number.isFinite(g)) {
      return {
        stats: makeStats(
          mode,
          exploredNodes,
          0,
          null,
          null,
          elapsedMs(started),
          false,
          'The search reached the destination, but the path back to the start was broken.',
        ),
        frames: recordFrames ? frames : [],
      };
    }
    return {
      stats: makeStats(
        mode,
        exploredNodes,
        cells.length,
        g,
        horizontalDistance(cells, geom.width, geom.cellEast, geom.cellNorth),
        elapsedMs(started),
        false,
        null,
      ),
      frames: recordFrames ? frames : [],
    };
  }

  return {
    stats: makeStats(
      mode,
      exploredNodes,
      0,
      null,
      null,
      elapsedMs(started),
      false,
      'No admissible path reaches the destination under the 20 degree slope and grade limits.',
    ),
    frames: recordFrames ? frames : [],
  };
}

function sampleIndexed(values: readonly number[], start: number, end: number, maxLen: number): number[] {
  const count = end - start;
  if (count <= 0 || maxLen <= 0) return [];
  if (count <= maxLen) {
    const out: number[] = [];
    for (let i = start; i < end; i++) {
      const value = values[i];
      if (value !== undefined) out.push(value);
    }
    return out;
  }
  const out: number[] = [];
  const lastSrc = count - 1;
  const lastOut = maxLen - 1;
  for (let i = 0; i < maxLen; i++) {
    const value = values[start + Math.floor((i * lastSrc) / lastOut)];
    if (value !== undefined) out.push(value);
  }
  const first = values[start];
  const last = values[end - 1];
  if (first !== undefined && out[0] !== first) out.unshift(first);
  if (last !== undefined && out[out.length - 1] !== last) {
    if (out.length < maxLen) out.push(last);
    else out[out.length - 1] = last;
  }
  if (out.length > maxLen) {
    out.length = maxLen;
    if (last !== undefined) out[maxLen - 1] = last;
  }
  return out;
}

function frameEnds(cellCount: number, frameCount: number): number[] {
  const ends: number[] = [];
  let previous = 0;
  for (let step = 0; step < frameCount && previous < cellCount; step++) {
    const remainingFrames = frameCount - step;
    const remainingCells = cellCount - previous;
    let end = previous + Math.max(1, Math.round(remainingCells / remainingFrames));
    if (step === frameCount - 1 || end > cellCount) end = cellCount;
    if (end <= previous) break;
    ends.push(end);
    previous = end;
  }
  return ends;
}

/**
 * One forward pass over the stored path. Frame costs are summed from gated steps.
 * Prefixes are index-sampled, not rebuilt, and the final stored cost is not spread by fraction.
 */
function framesFromSolvedPath(
  grid: RoutingGrid,
  geom: GridGeom,
  cells: readonly number[],
  policy: RoutePolicyId,
  weights: PolicyWeights,
  strictQuality: boolean,
  maxFrames: number,
): SearchTraceFrame[] {
  if (maxFrames <= 0 || cells.length === 0) return [];
  const pricedCellCap = 4096;
  if (cells.length > pricedCellCap) {
    const sampledEnds = frameEnds(cells.length, Math.min(maxFrames, cells.length));
    const unpriced: SearchTraceFrame[] = [];
    for (let step = 0; step < sampledEnds.length; step++) {
      const end = sampledEnds[step];
      if (end === undefined) continue;
      unpriced.push({
        step,
        policy,
        closedCells: [],
        frontierCells: [],
        currentBestCells: sampleIndexed(cells, 0, end, MAX_CELLS_PER_FRAME),
        currentBestCost: 0,
        exploredCount: 0,
        openSize: 0,
        note: `${policy}: currentBestCells holds candidate cells 1 through ${end} of ${cells.length}. closedCells is empty and exploredCount is 0 because this grid was not searched. The path is longer than ${pricedCellCap} cells, so Step costs were not summed on this large grid. The zero cost is not a measured route cost.`,
      });
    }
    return unpriced;
  }
  const ends = frameEnds(cells.length, Math.min(maxFrames, cells.length));
  const frames: SearchTraceFrame[] = [];
  let cost = 0;
  let priced = true;
  const origin = cells[0];
  if (origin === undefined || !isCellAdmissible(grid, origin, strictQuality)) priced = false;
  let frameIdx = 0;
  for (let i = 0; i < cells.length && frameIdx < ends.length; i++) {
    if (i > 0 && priced) {
      const u = cells[i - 1];
      const v = cells[i];
      if (u === undefined || v === undefined || !spanAllowed(grid, u, v, geom, strictQuality)) {
        priced = false;
      } else {
        const edge = computeEdgeCost(grid, u, v, weights);
        if (!Number.isFinite(edge)) priced = false;
        else cost += edge;
      }
    }
    const end = ends[frameIdx];
    if (end === undefined || i + 1 !== end) continue;
    const note = priced
      ? `${policy}: currentBestCells holds candidate cells 1 through ${end} of ${cells.length}. closedCells is empty, exploredCount is 0, and openSize is 0 because this grid was not searched. The cost is the sum of gated steps up to this cell, not a fraction of the stored total.`
      : `${policy}: currentBestCells holds candidate cells 1 through ${end} of ${cells.length}. closedCells is empty, exploredCount is 0, and openSize is 0 because this grid was not searched. Step pricing stopped where a gate failed, so this cost is only the priced prefix.`;
    frames.push({
      step: frames.length,
      policy,
      closedCells: [],
      frontierCells: [],
      currentBestCells: sampleIndexed(cells, 0, end, MAX_CELLS_PER_FRAME),
      currentBestCost: cost,
      exploredCount: 0,
      openSize: 0,
      note,
    });
    frameIdx += 1;
  }
  return frames;
}

function candidateHasPolicy(candidate: RouteCandidate, policy: RoutePolicyId): boolean {
  for (let i = 0; i < candidate.policies.length; i++) {
    if (candidate.policies[i] === policy) return true;
  }
  return false;
}

/**
 * The skipped A* row on a large grid uses the same cost as the sampled frames.
 * A stored candidate cost is used only when no frames were priced, the
 * candidate includes the trace policy, and neither a trace override nor a
 * route-request weight override is active.
 */
function largeGridAstarStats(
  candidate: RouteCandidate | null,
  policy: RoutePolicyId,
  totalCells: number,
  computeMs: number,
  frames: readonly SearchTraceFrame[],
  weightsOverridden: boolean,
  weightsFromRequest: boolean,
): AlgorithmRunStats {
  if (!candidate) {
    return makeStats(
      'astar',
      0,
      0,
      null,
      null,
      computeMs,
      true,
      `A* was not run again because this grid has ${totalCells} cells, which is above the 100,000-cell cutoff. The 1000 by 1000 HiRISE map has 1,000,000 cells and uses this same skip. A grid just over 100,000 cells is not that map, and no selected candidate was available to sample.`,
    );
  }
  const distance = finiteOrNull(candidate.outbound.metrics?.horizontalDistance_m);
  const pathCells = cellsOf(candidate).length;
  const last = frames[frames.length - 1];
  const pricingStopped = frames.some((frame) => frame.note.includes('Step pricing stopped'));
  const unpriced = frames.some((frame) => frame.note.includes('Step costs were not summed'));
  const samePolicy = candidateHasPolicy(candidate, policy);
  const limit = `A* was not run again because this grid has ${totalCells} cells, which is above the 100,000-cell cutoff. The 1000 by 1000 HiRISE map has 1,000,000 cells and uses this same skip. A grid just over 100,000 cells is not that map.`;
  if (unpriced) {
    return makeStats(
      'astar',
      0,
      pathCells,
      null,
      distance,
      computeMs,
      true,
      `${limit} The path is longer than 4096 cells, so its steps were not priced. No cost is shown on this skipped row. A frame cost of 0 is not a measured route cost.`,
    );
  }
  if (last) {
    const policyNote = samePolicy
      ? `The selected candidate includes ${policy}.`
      : `The selected candidate does not include ${policy}.`;
    const priceNote = pricingStopped
      ? 'Pricing stopped where a gate failed. The last frame holds only a priced prefix, not a route total.'
      : unpriced
        ? 'The path was too long to price. A frame cost of 0 is not a measured route cost.'
        : 'Any frame cost is a gated sum along the stored cells.';
    return makeStats(
      'astar',
      0,
      pathCells,
      null,
      distance,
      computeMs,
      true,
      `${limit} ${policyNote} This skipped row has no weighted cost, because A* did not run. ${priceNote} That sum is not an A* result. Explored nodes were not measured again.`,
    );
  }
  if (samePolicy && !weightsOverridden && !weightsFromRequest) {
    return makeStats(
      'astar',
      0,
      pathCells,
      null,
      distance,
      computeMs,
      true,
      `${limit} No frames were sampled. This skipped row has no weighted cost, because A* did not run. The stored candidate cost is not copied into the A* column.`,
    );
  }
  if (samePolicy && (weightsOverridden || weightsFromRequest)) {
    return makeStats(
      'astar',
      0,
      pathCells,
      null,
      distance,
      computeMs,
      true,
      `${limit} No frames were sampled, and a trace override or a route-request weight override is active, so the stored candidate cost is not shown. It may have been computed with different weights.`,
    );
  }
  return makeStats(
    'astar',
    0,
    pathCells,
    null,
    distance,
    computeMs,
    true,
    `${limit} The selected candidate does not include ${policy}, and no frames were priced, so no cost is shown.`,
  );
}

function formatMetres(value: number): string {
  if (!Number.isFinite(value)) return 'an unknown distance';
  return `${Math.round(value)} m`;
}

function formatDegrees(value: number): string {
  if (!Number.isFinite(value)) return 'an unknown angle';
  return `${value.toFixed(1)} degrees`;
}

function policyTitle(policy: RoutePolicyId): string {
  if (policy === 'shortest-feasible') return 'Shortest feasible';
  if (policy === 'terrain-aware') return 'Terrain-aware';
  return 'Uncertainty-aware';
}

function policyTitleList(policies: readonly RoutePolicyId[]): string {
  if (policies.length === 0) return 'This candidate';
  const names: string[] = [];
  for (let i = 0; i < policies.length; i++) {
    const policy = policies[i];
    if (policy) names.push(policyTitle(policy));
  }
  return names.length > 0 ? names.join(' and ') : 'This candidate';
}

function describeEndpoint(
  label: string,
  point: LocalPoint | null | undefined,
  index: number | null,
  grid: RoutingGrid,
  geom: GridGeom | null,
  strictQuality: boolean,
): string {
  if (!point || !Number.isFinite(point.east_m) || !Number.isFinite(point.north_m)) {
    return `${label} has no finite east/north position, so it has no cell.`;
  }
  const coords = `${label} is ${point.east_m.toFixed(1)} m east and ${point.north_m.toFixed(1)} m north.`;
  if (!geom || index === null) return `${coords} That point is outside the grid, so it has no cell.`;
  const row = Math.floor(index / geom.width);
  const col = index - row * geom.width;
  const open = isCellAdmissible(grid, index, strictQuality);
  const verdict = open
    ? 'That cell is admissible.'
    : 'That cell is not admissible under the current limits.';
  return `${coords} It falls in row ${row}, column ${col} (index ${index}). ${verdict}`;
}

function matchText(value: boolean | null): string {
  if (value === null) return 'The optimality check was not made';
  return value
    ? 'A* and Dijkstra finished with costs that match within 0.0001'
    : 'A* and Dijkstra finished with costs that differ by more than 0.0001';
}

function factorText(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'The node-reduction factor is unavailable';
  return `Dijkstra expanded ${value.toFixed(2)} times as many nodes as A*`;
}

interface ThinkInput {
  policy: RoutePolicyId;
  weights: WeightChoice;
  strictQuality: boolean;
  request: RouteRequest;
  grid: RoutingGrid;
  geom: GridGeom | null;
  startIndex: number | null;
  goalIndex: number | null;
  largeGrid: boolean;
  totalCells: number;
  comparison: AlgorithmComparison;
  rejectedCount: number;
  selectedCandidateId: string;
  frameCount: number;
}

function buildThinkingSteps(input: ThinkInput): ThinkingStep[] {
  const { policy, weights, comparison } = input;
  const weightSource = weights.fromOverride
    ? 'Weights come from the trace override passed with this request.'
    : weights.fromRequest
      ? 'Weights come from this route request override for the active policy.'
      : weights.ignoredOverride
        ? 'The supplied trace override had a negative or non-finite weight, so the default EVA weights for this policy were used.'
        : 'Weights come from the default EVA table for this policy. The route request did not override this policy.';
  const endpointDetail = `${describeEndpoint('The start', input.request.start, input.startIndex, input.grid, input.geom, input.strictQuality)} ${describeEndpoint('The destination', input.request.destination, input.goalIndex, input.grid, input.geom, input.strictQuality)}`;
  const admissibilityDetail = input.strictQuality
    ? 'Strict quality is on, so only good-quality cells may be entered. Every cell also needs exclusion none, finite elevation, slope, and roughness, and a terrain slope of 20 degrees or less. A diagonal step needs both corner cells as well. A step is dropped when its grade is steeper than 20 degrees. A grade equal to 20 degrees stays. Quality penalties are not an admissibility test: unknown is 1.0, low is 0.5, and good is 0.0.'
    : 'Strict quality is off, so good, low, and unknown cells may be entered when the rest of the cell is legal. Every cell needs exclusion none, finite elevation, slope, and roughness, and a terrain slope of 20 degrees or less. A diagonal step needs both corner cells as well. A step is dropped when its grade is steeper than 20 degrees. A grade equal to 20 degrees stays. Quality penalties are not an admissibility test: unknown is 1.0, low is 0.5, and good is 0.0.';
  const policyDetail = `${policyTitle(policy)} uses slope weight ${weights.weights.slope}, roughness weight ${weights.weights.roughness}, and quality weight ${weights.weights.quality}. ${weightSource} The quality term uses the contract penalties: unknown 1.0, low 0.5, and good 0.0.`;
  const frontierDetail = input.largeGrid
    ? `This grid has ${input.totalCells} cells, so no second A* search was run. ${input.frameCount} frame${input.frameCount === 1 ? '' : 's'} put the selected candidate in currentBestCells only. closedCells stays empty and exploredCount stays 0, because those fields are search expansions and no search ran. Each frame cost is the sum of gated steps up to that cell, except a path longer than 4096 cells, which is sampled and not priced. Cell lists are capped at 256 indices.`
    : `Snapshots are taken after successors are pushed, so frame 0's open set includes the start cell's legal neighbors. At most ${input.frameCount} A* frames are kept, and each cell list is capped at 256 indices. Dijkstra and greedy best-first do not record frames.`;
  const comparisonDetail = input.largeGrid
    ? `${hiriseNotice('Dijkstra', input.totalCells)} ${hiriseNotice('Greedy best-first', input.totalCells)} Greedy best-first orders by remaining distance only, which is not an admissible estimate, so it never sets the optimality flag. The node-reduction factor and the optimality flag are both unavailable.`
    : `${algorithmLabel('astar')} expanded ${comparison.astar.exploredNodes} nodes, Dijkstra expanded ${comparison.dijkstra.exploredNodes}, and greedy best-first expanded ${comparison.greedyBestFirst.exploredNodes}. ${factorText(comparison.nodeReductionFactor)}. ${matchText(comparison.optimalCostMatch)}. Greedy best-first orders by remaining distance only and never sets that flag.`;
  const selectionDetail = `Selected candidate ${input.selectedCandidateId || '(none)'} is shown for ${policyTitle(policy)}. ${input.rejectedCount} rejected corridor${input.rejectedCount === 1 ? '' : 's'} ${input.rejectedCount === 1 ? 'is' : 'are'} drawn beside it. The comparison covers the outbound trip only. Changing a display layer does not run this search again.`;

  return [
    {
      index: 0,
      phase: 'endpoints',
      title: 'Place the two endpoints on the grid',
      formula: 'index = row * width + col',
      detail: endpointDetail,
      policy,
    },
    {
      index: 1,
      phase: 'admissibility',
      title: 'Reject cells and steps the rover cannot cross',
      formula: '|z[v] - z[u]| / stepLen <= tan(20°)',
      detail: admissibilityDetail,
      policy,
    },
    {
      index: 2,
      phase: 'policy-eval',
      title: 'Price each legal step with the active weights',
      formula: 'stepLen * (1 + slopeWeight * sNorm + roughnessWeight * rNorm + qualityWeight * qPen)',
      detail: policyDetail,
      policy,
    },
    {
      index: 3,
      phase: 'frontier-pruning',
      title: 'Expand the open set after each push',
      formula: 'A* priority f = g + h, with h the Euclidean distance in metres',
      detail: frontierDetail,
      policy,
    },
    {
      index: 4,
      phase: 'comparison',
      title: 'Compare Dijkstra and greedy best-first with A*',
      formula: 'Dijkstra priority = g; greedy best-first priority = h',
      detail: comparisonDetail,
      policy,
    },
    {
      index: 5,
      phase: 'selection',
      title: 'Keep the selected route and the rejected lines',
      detail: selectionDetail,
      policy,
    },
  ];
}

type CellListMatch = 'same' | 'different' | 'uncompared';

function sameCells(a: readonly number[], b: readonly number[]): CellListMatch {
  if (a.length !== b.length) return 'different';
  if (a.length === 0) return 'same';
  if (a.length > 4096) return 'uncompared';
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return 'different';
  }
  return 'same';
}

function cellsOf(candidate: RouteCandidate): readonly number[] {
  const cells = candidate.outbound?.cells;
  return Array.isArray(cells) ? cells : [];
}

function allCandidatesShareCells(candidates: readonly RouteCandidate[]): boolean {
  const first = candidates[0];
  if (!first) return true;
  const base = cellsOf(first);
  for (let i = 1; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (!candidate || sameCells(cellsOf(candidate), base) !== 'same') return false;
  }
  return true;
}

function bresenham(
  width: number,
  height: number,
  row0: number,
  col0: number,
  row1: number,
  col1: number,
): number[] {
  const cells: number[] = [];
  let row = row0;
  let col = col0;
  const rowDelta = Math.abs(row1 - row0);
  const colDelta = Math.abs(col1 - col0);
  const rowStep = row0 < row1 ? 1 : -1;
  const colStep = col0 < col1 ? 1 : -1;
  let error = colDelta - rowDelta;
  const limit = rowDelta + colDelta + 2;
  for (let n = 0; n <= limit; n++) {
    if (row >= 0 && col >= 0 && row < height && col < width) cells.push(row * width + col);
    if (row === row1 && col === col1) break;
    const doubled = 2 * error;
    if (doubled > -rowDelta) {
      error -= rowDelta;
      col += colStep;
    }
    if (doubled < colDelta) {
      error += colDelta;
      row += rowStep;
    }
  }
  return cells;
}

function straightCells(grid: RoutingGrid, start: LocalPoint, destination: LocalPoint, geom: GridGeom): number[] {
  const spec = grid.manifest?.grid;
  if (!spec) return [];
  const a = pointToCell(spec, start);
  const b = pointToCell(spec, destination);
  if (!a || !b) return [];
  return bresenham(geom.width, geom.height, a.row, a.col, b.row, b.col);
}

function drapeCells(grid: RoutingGrid, cells: readonly number[]): LocalPoint3[] {
  const spec = grid.manifest?.grid;
  const elevation = grid.elevation;
  if (!spec || !elevation || !Number.isInteger(spec.width) || spec.width <= 0) return [];
  const width = spec.width;
  const out: LocalPoint3[] = [];
  for (let i = 0; i < cells.length; i++) {
    const idx = cells[i];
    if (idx === undefined || !Number.isInteger(idx) || idx < 0) break;
    const z = elevation[idx];
    if (z === undefined || !Number.isFinite(z)) break;
    const row = Math.floor(idx / width);
    const col = idx - row * width;
    if (col < 0 || col >= width || row < 0 || row >= spec.height) break;
    const center = cellCenter(spec, row, col);
    if (!Number.isFinite(center.east_m) || !Number.isFinite(center.north_m)) break;
    out.push({ east_m: center.east_m, north_m: center.north_m, elevation_m: z });
  }
  return out;
}

function asQuality(value: number | undefined): QualityCode {
  if (
    value === QUALITY.NO_ELEVATION ||
    value === QUALITY.GOOD ||
    value === QUALITY.LOW ||
    value === QUALITY.UNKNOWN
  ) {
    return value;
  }
  return QUALITY.NO_ELEVATION;
}

function emptyMeasure(): CorridorMeasure {
  return {
    path: [],
    distance_m: 0,
    maxSlope_deg: 0,
    unknown_m: 0,
    weightedCost: null,
    steep: false,
    blocked: false,
    rough: false,
    uncertain: false,
  };
}

function isUnitStep(u: number, v: number, width: number): boolean {
  const ur = Math.floor(u / width);
  const uc = u - ur * width;
  const vr = Math.floor(v / width);
  const vc = v - vr * width;
  const dr = Math.abs(vr - ur);
  const dc = Math.abs(vc - uc);
  return dr <= 1 && dc <= 1 && dr + dc > 0;
}

function spanAllowed(
  grid: RoutingGrid,
  u: number,
  v: number,
  geom: GridGeom,
  strictQuality: boolean,
): boolean {
  if (!isUnitStep(u, v, geom.width)) return false;
  if (!isCellAdmissible(grid, u, strictQuality) || !isCellAdmissible(grid, v, strictQuality)) return false;
  const ur = Math.floor(u / geom.width);
  const uc = u - ur * geom.width;
  const vr = Math.floor(v / geom.width);
  const vc = v - vr * geom.width;
  const dr = Math.abs(vr - ur);
  const dc = Math.abs(vc - uc);
  if (dr === 1 && dc === 1) {
    const cornerA = ur * geom.width + vc;
    const cornerB = vr * geom.width + uc;
    if (!isCellAdmissible(grid, cornerA, strictQuality) || !isCellAdmissible(grid, cornerB, strictQuality)) {
      return false;
    }
  }
  const zu = grid.elevation[u];
  const zv = grid.elevation[v];
  if (zu === undefined || zv === undefined || !Number.isFinite(zu) || !Number.isFinite(zv)) return false;
  const stepLen = spanLength(u, v, geom.width, geom.cellEast, geom.cellNorth);
  if (!(stepLen > 0) || !Number.isFinite(stepLen)) return false;
  return Math.abs(zv - zu) / stepLen <= MAX_GRADE_TAN;
}

/** True only for a chain of legal king-move steps. A gap is not a corridor. */
function linkedCorridor(
  grid: RoutingGrid,
  cells: readonly number[],
  geom: GridGeom,
  strictQuality: boolean,
): boolean {
  if (cells.length < 2) return false;
  for (let i = 1; i < cells.length; i++) {
    const prev = cells[i - 1];
    const curr = cells[i];
    if (prev === undefined || curr === undefined) return false;
    if (!spanAllowed(grid, prev, curr, geom, strictQuality)) return false;
  }
  return true;
}

function measureCells(
  grid: RoutingGrid,
  cells: readonly number[],
  geom: GridGeom,
  weights: PolicyWeights,
  strictQuality: boolean,
): CorridorMeasure {
  if (!rastersReady(grid)) return emptyMeasure();
  const measure = emptyMeasure();
  if (cells.length === 0) return measure;
  const spec = grid.manifest.grid;
  const unknownPenalty = qualityPenalty(QUALITY.UNKNOWN);
  const path: LocalPoint3[] = [];
  let priced = true;
  let cost = 0;
  for (let i = 0; i < cells.length; i++) {
    const idx = cells[i];
    if (idx === undefined || idx < 0 || idx >= grid.exclusion.length) {
      measure.blocked = true;
      priced = false;
      break;
    }
    const exclusion = grid.exclusion[idx];
    const slope = grid.slope[idx];
    const roughness = grid.roughness[idx];
    const quality = asQuality(grid.quality[idx]);
    const elevation = grid.elevation[idx];
    if (exclusion === undefined || exclusion !== EXCLUSION.NONE) measure.blocked = true;
    if (elevation === undefined || !Number.isFinite(elevation)) measure.blocked = true;
    if (slope === undefined || !Number.isFinite(slope)) measure.blocked = true;
    else {
      if (slope > measure.maxSlope_deg) measure.maxSlope_deg = slope;
      if (slope > EVA_LIMITS.maxTerrainSlope_deg) measure.steep = true;
    }
    if (roughness === undefined || !Number.isFinite(roughness)) measure.blocked = true;
    else if (roughness > EVA_LIMITS.roughnessScale_m) measure.rough = true;
    if (quality === QUALITY.LOW || quality === QUALITY.UNKNOWN) measure.uncertain = true;
    if (i > 0) {
      const prev = cells[i - 1];
      const prevZ = prev === undefined ? undefined : grid.elevation[prev];
      const stepLen =
        prev === undefined ? 0 : spanLength(prev, idx, geom.width, geom.cellEast, geom.cellNorth);
      if (
        prevZ !== undefined &&
        elevation !== undefined &&
        Number.isFinite(prevZ) &&
        Number.isFinite(elevation) &&
        stepLen > 0 &&
        Math.abs(elevation - prevZ) / stepLen > MAX_GRADE_TAN
      ) {
        measure.steep = true;
      }
      if (prev === undefined || !spanAllowed(grid, prev, idx, geom, strictQuality)) {
        measure.blocked = true;
        priced = false;
        break;
      }
      measure.distance_m += stepLen;
      if (
        qualityPenalty(worseQuality(asQuality(grid.quality[prev]), quality)) === unknownPenalty &&
        stepLen > 0
      ) {
        measure.unknown_m += stepLen;
      }
      const edge = computeEdgeCost(grid, prev, idx, weights);
      if (!Number.isFinite(edge)) priced = false;
      else cost += edge;
    }
    if (elevation === undefined || !Number.isFinite(elevation)) break;
    const row = Math.floor(idx / geom.width);
    const col = idx - row * geom.width;
    if (row < 0 || col < 0 || row >= geom.height || col >= geom.width) break;
    const center = cellCenter(spec, row, col);
    if (!Number.isFinite(center.east_m) || !Number.isFinite(center.north_m)) break;
    path.push({ east_m: center.east_m, north_m: center.north_m, elevation_m: elevation });
  }
  measure.path = path;
  const onlyCell = cells.length === 1 ? cells[0] : undefined;
  const singleAdmissible =
    onlyCell !== undefined && isCellAdmissible(grid, onlyCell, strictQuality);
  if (priced && path.length === cells.length && cells.length === 1 && singleAdmissible && !measure.blocked) {
    measure.weightedCost = 0;
  } else if (priced && path.length === cells.length && cells.length > 1) {
    measure.weightedCost = cost;
  }
  return measure;
}

function categoryFromMeasure(measure: CorridorMeasure, outside: boolean): RejectionCategory {
  if (outside) return 'suboptimal-detour';
  if (measure.steep) return 'excess-slope';
  if (measure.uncertain) return 'high-uncertainty';
  if (measure.rough) return 'rough-terrain';
  return 'suboptimal-detour';
}

function straightReason(measure: CorridorMeasure, outside: boolean): string {
  const length = measure.blocked
    ? `Distance is counted only up to the first illegal step, about ${formatMetres(measure.distance_m)}. That figure is not the length of the whole straight line.`
    : `The line is about ${formatMetres(measure.distance_m)} long.`;
  if (outside) return 'The straight corridor was not drawn because the start or destination lies outside the grid.';
  if (measure.path.length === 0) return `The straight corridor has no finite elevation to drape on. ${length}`;
  if (measure.steep) {
    return `The straight line climbs terrain steeper than 20 degrees, so the rover cannot drive it. ${length}`;
  }
  if (measure.blocked) {
    return `The straight line crosses blocked or missing ground, so it is not a driveable corridor. The category is not excess slope unless the terrain or the grade is actually steeper than 20 degrees. The slope figure is this corridor's own peak, not a difference from the selected route. ${length}`;
  }
  if (measure.rough) {
    return `The straight line crosses roughness above 0.5 m, which counts as rough ground. ${length}`;
  }
  if (measure.uncertain) {
    return `The straight line cuts across unknown or low-quality cells instead of walking around them. ${length}`;
  }
  return `The straight line ignores slope and roughness, so it is not the corridor the selected policy chose. ${length}`;
}

function distanceClause(delta: number): string {
  if (!Number.isFinite(delta)) return 'a horizontal length that could not be compared';
  if (Math.abs(delta) < 0.5) return 'about the same horizontal length as the selected route';
  const word = delta > 0 ? 'longer' : 'shorter';
  return `about ${formatMetres(Math.abs(delta))} ${word} than the selected route`;
}

function peakRoughness(grid: RoutingGrid, cells: readonly number[]): number | null {
  if (cells.length > 4096) return null;
  let peak: number | null = null;
  for (let i = 0; i < cells.length; i++) {
    const idx = cells[i];
    if (idx === undefined || idx < 0 || idx >= grid.roughness.length) continue;
    const value = grid.roughness[idx];
    if (value === undefined || !Number.isFinite(value)) continue;
    if (peak === null || value > peak) peak = value;
  }
  return peak;
}

function policiesOverlap(candidate: RouteCandidate, baseline: Baseline): boolean {
  for (let i = 0; i < candidate.policies.length; i++) {
    const policy = candidate.policies[i];
    if (policy && baseline.policies.includes(policy)) return true;
  }
  return false;
}

function sameSinglePolicy(candidate: RouteCandidate, baseline: Baseline): boolean {
  const candidatePolicy = candidate.policies[0];
  const baselinePolicy = baseline.policies[0];
  return (
    candidate.policies.length === 1 &&
    baseline.policies.length === 1 &&
    candidatePolicy !== undefined &&
    candidatePolicy === baselinePolicy
  );
}

function reasonForCandidate(
  category: RejectionCategory,
  candidate: RouteCandidate,
  baseline: Baseline,
  roughness_m: number | null,
): string {
  const id = candidate.candidateId;
  const names = policyTitleList(candidate.policies);
  if (!baseline.found) {
    return `Candidate ${id} follows ${names}. No selected route matches the requested id, so this note does not compare distance, slope, or cost with a selected route.`;
  }
  if (!baselineMetricsReady(baseline)) {
    return `Candidate ${id} follows ${names}. The selected route is missing a distance, slope, or unknown-quality length, so no delta is reported.`;
  }
  const distanceDelta = measuredDelta(candidate.outbound.metrics?.horizontalDistance_m, baseline.distance);
  const unknownDelta = measuredDelta(candidate.outbound.metrics?.unknownQualityLength_m, baseline.unknown);
  const slope = measuredNumber(candidate.outbound.metrics?.maxTerrainSlope_deg);
  if (category === 'alternative-policy') {
    return `Candidate ${id} follows ${names} and uses a different corridor from the selected route. It is ${distanceClause(distanceDelta)}. Weighted costs use different policy weights, so the cost ratio is the horizontal-distance ratio and is not a ranking of those weights.`;
  }
  if (category === 'high-uncertainty') {
    return `Candidate ${id} crosses about ${formatMetres(unknownDelta)} more unknown-quality ground than the selected route, so it was set aside.`;
  }
  if (category === 'excess-slope') {
    const steeper = Number.isFinite(slope) && Number.isFinite(baseline.slope) && slope > baseline.slope + 0.5;
    return steeper
      ? `Candidate ${id} reaches about ${formatDegrees(slope)} of terrain slope, which is steeper than the selected route.`
      : `Candidate ${id} reaches about ${formatDegrees(slope)} of terrain slope, above the 20 degree driving limit.`;
  }
  if (category === 'rough-terrain') {
    const amount = roughness_m === null ? 'an unreadable roughness sample' : `${roughness_m.toFixed(2)} m`;
    return `Candidate ${id} reaches roughness of ${amount} on the roughness raster, above the ${EVA_LIMITS.roughnessScale_m} m scale. Terrain slope is not used as a stand-in for roughness.`;
  }
  return `Candidate ${id} is a detour. It is ${distanceClause(distanceDelta)}, so it is not the selected corridor.`;
}

function categoryForCandidate(
  grid: RoutingGrid,
  candidate: RouteCandidate,
  baseline: Baseline,
): RejectionCategory {
  const unknownDelta = measuredDelta(candidate.outbound.metrics?.unknownQualityLength_m, baseline.unknown);
  const distanceDelta = measuredDelta(candidate.outbound.metrics?.horizontalDistance_m, baseline.distance);
  const slope = measuredNumber(candidate.outbound.metrics?.maxTerrainSlope_deg);
  if (!baseline.found) return 'suboptimal-detour';
  if (!policiesOverlap(candidate, baseline)) return 'alternative-policy';
  if (Number.isFinite(unknownDelta) && unknownDelta > 0.5) return 'high-uncertainty';
  if (Number.isFinite(slope) && slope > EVA_LIMITS.maxTerrainSlope_deg) return 'excess-slope';
  const rough = peakRoughness(grid, cellsOf(candidate));
  const baseRough = peakRoughness(grid, baseline.cells);
  if (rough !== null && rough > EVA_LIMITS.roughnessScale_m && (baseRough === null || rough > baseRough)) {
    return 'rough-terrain';
  }
  if (Number.isFinite(distanceDelta) && Math.abs(distanceDelta) > 0.5) return 'suboptimal-detour';
  return 'suboptimal-detour';
}

function ratioOf(
  optionCost: number | null,
  selectedCost: number,
  optionDistance: number,
  selectedDistance: number,
): number {
  if (
    optionCost !== null &&
    Number.isFinite(optionCost) &&
    Number.isFinite(selectedCost) &&
    selectedCost > 0
  ) {
    return optionCost / selectedCost;
  }
  if (Number.isFinite(optionDistance) && Number.isFinite(selectedDistance) && selectedDistance > 0) {
    return optionDistance / selectedDistance;
  }
  if (Number.isFinite(optionDistance) && optionDistance === 0 && selectedDistance === 0) return 1;
  return Number.POSITIVE_INFINITY;
}

function baselineMetricsReady(baseline: Baseline): boolean {
  return (
    baseline.found &&
    Number.isFinite(baseline.distance) &&
    Number.isFinite(baseline.unknown) &&
    Number.isFinite(baseline.slope)
  );
}

function missingBaselineNote(baseline: Baseline): string {
  if (!baseline.found) return 'No selected route matches the requested id, so this is not a delta against one. ';
  if (!baselineMetricsReady(baseline)) {
    return 'The selected route is missing a distance, slope, or unknown-quality length, so no delta is reported. ';
  }
  return '';
}

function measuredNumber(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) ? value : Number.NaN;
}

function measuredDelta(option: number | undefined, baseline: number): number {
  const left = measuredNumber(option);
  if (!Number.isFinite(left) || !Number.isFinite(baseline)) return Number.NaN;
  return left - baseline;
}

function baselineOf(candidates: readonly RouteCandidate[], selectedId: string): Baseline {
  const selected = findCandidate(candidates, selectedId);
  if (!selected) {
    return { found: false, distance: Number.NaN, unknown: Number.NaN, cost: Number.NaN, slope: Number.NaN, cells: [], policies: [] };
  }
  return {
    found: true,
    distance: measuredNumber(selected.outbound.metrics?.horizontalDistance_m),
    unknown: measuredNumber(selected.outbound.metrics?.unknownQualityLength_m),
    cost: measuredNumber(selected.outbound.weightedCost?.value),
    slope: measuredNumber(selected.outbound.metrics?.maxTerrainSlope_deg),
    cells: cellsOf(selected),
    policies: selected.policies,
  };
}

function pathFromCandidate(grid: RoutingGrid, candidate: RouteCandidate): LocalPoint3[] {
  const cells = cellsOf(candidate);
  if (cells.length > 4096) return [];
  const stored = candidate.outbound?.path;
  if (stored && stored.length > 0 && stored.length === cells.length) {
    const copied: LocalPoint3[] = [];
    for (let i = 0; i < stored.length; i++) {
      const point = stored[i];
      if (
        !point ||
        !Number.isFinite(point.east_m) ||
        !Number.isFinite(point.north_m) ||
        !Number.isFinite(point.elevation_m)
      ) {
        copied.length = 0;
        break;
      }
      copied.push({ east_m: point.east_m, north_m: point.north_m, elevation_m: point.elevation_m });
    }
    if (copied.length === cells.length) return copied;
  }
  const draped = drapeCells(grid, cells);
  return draped.length === cells.length ? draped : [];
}

function shiftCandidates(start: number, end: number, width: number): Array<[number, number]> {
  const sr = Math.floor(start / width);
  const sc = start - sr * width;
  const er = Math.floor(end / width);
  const ec = end - er * width;
  const dr = er - sr;
  const dc = ec - sc;
  const mag = Math.hypot(dr, dc);
  const shifts: Array<[number, number]> = [];
  const push = (r: number, c: number): void => {
    if (r === 0 && c === 0) return;
    for (let i = 0; i < shifts.length; i++) {
      const existing = shifts[i];
      if (existing && existing[0] === r && existing[1] === c) return;
    }
    shifts.push([r, c]);
  };
  if (mag >= 1) {
    const pr = -dc / mag;
    const pc = dr / mag;
    for (const dist of [2, 3, 4, 5]) {
      const or = Math.round(pr * dist);
      const oc = Math.round(pc * dist);
      push(or, oc);
      push(-or, -oc);
    }
  }
  push(0, 2);
  push(0, -2);
  push(2, 0);
  push(-2, 0);
  push(2, 2);
  push(-2, 2);
  push(2, -2);
  push(-2, -2);
  push(0, 3);
  push(3, 0);
  push(0, -3);
  push(-3, 0);
  return shifts;
}

function joinCells(left: readonly number[], right: readonly number[]): number[] {
  if (left.length === 0) return right.slice();
  if (right.length === 0) return left.slice();
  const out = left.slice();
  const last = out[out.length - 1];
  let from = 0;
  if (last !== undefined && right[0] === last) from = 1;
  for (let i = from; i < right.length; i++) {
    const cell = right[i];
    if (cell !== undefined) out.push(cell);
  }
  return out;
}

/**
 * A Bresenham sidestep from the mission start cell to the mission destination
 * through one shifted midpoint. Every step must be a legal king move.
 * A dangling neighbor spur is not a corridor and is not returned.
 */
function buildOffsetCells(
  grid: RoutingGrid,
  base: readonly number[],
  geom: GridGeom,
  avoid: readonly number[],
  strictQuality: boolean,
  missionStart: number | null,
  missionGoal: number | null,
): number[] {
  if (geom.width <= 0 || geom.height <= 0) return [];
  const start = missionStart;
  const end = missionGoal;
  if (start === null || end === null || start === end) return [];
  if (!isCellAdmissible(grid, start, strictQuality) || !isCellAdmissible(grid, end, strictQuality)) {
    return [];
  }
  const sr = Math.floor(start / geom.width);
  const sc = start - sr * geom.width;
  const er = Math.floor(end / geom.width);
  const ec = end - er * geom.width;
  const shifts = shiftCandidates(start, end, geom.width);
  const limit = Math.min(shifts.length, 8);
  for (let i = 0; i < limit; i++) {
    const shift = shifts[i];
    if (!shift) continue;
    const midRow = Math.round((sr + er) / 2 + shift[0]);
    const midCol = Math.round((sc + ec) / 2 + shift[1]);
    if (midRow < 0 || midCol < 0 || midRow >= geom.height || midCol >= geom.width) continue;
    const cells = joinCells(
      bresenham(geom.width, geom.height, sr, sc, midRow, midCol),
      bresenham(geom.width, geom.height, midRow, midCol, er, ec),
    );
    const first = cells[0];
    const last = cells[cells.length - 1];
    if (first !== start || last !== end) continue;
    if (!linkedCorridor(grid, cells, geom, strictQuality)) continue;
    if (sameCells(cells, base) === 'different' && sameCells(cells, avoid) === 'different') return cells;
  }
  return [];
}

function offsetReason(measure: CorridorMeasure, sharedCells: boolean): string {
  if (measure.path.length === 0) {
    if (!sharedCells) {
      return 'No offset corridor from the mission start to the destination was drawn. Candidate paths longer than 4,096 cells were not compared cell by cell, so this does not mean every solved candidate uses the same cells.';
    }
    return 'Every solved candidate uses the same cells. Eight perpendicular Bresenham offsets were checked, and none joined the mission start to the destination by legal steps. Offsets outside that set were not checked, so this is not proof that no other corridor exists.';
  }
  const base = sharedCells
    ? 'Every solved candidate uses the same cells. This corridor leaves that shared line and still joins the mission start to the destination by legal steps.'
    : 'This corridor joins the mission start to the destination by legal steps. It is not a claim that every solved candidate uses the same cells.';
  if (measure.steep) return `${base} Part of the sidestep is steeper than 20 degrees.`;
  if (measure.blocked) return `${base} Part of the sidestep crosses blocked ground and is not a full route.`;
  if (measure.uncertain) return `${base} The sidestep also crosses unknown or low-quality cells.`;
  if (measure.rough) return `${base} The sidestep crosses roughness above 0.5 m.`;
  return base;
}

function uniqueId(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  const id = `${base}-${n}`;
  used.add(id);
  return id;
}

function colorize(options: RejectedPathOption[]): RejectedPathOption[] {
  const colored: RejectedPathOption[] = [];
  const limit = Math.min(3, options.length);
  for (let i = 0; i < limit; i++) {
    const option = options[i];
    const color = REJECTED_COLORS[i] ?? REJECTED_COLORS[0];
    if (!option || !color) continue;
    colored.push({ ...option, colorHex: color });
  }
  return colored;
}

/** Not a measured comparison. Callers must not treat these fields as zeros or a ratio of 1. */
function unmeasuredMetrics(): RejectedPathOption['metricsDelta'] {
  return {
    distanceDelta_m: Number.NaN,
    maxSlope_deg: Number.NaN,
    unknownLengthDelta_m: Number.NaN,
    costRatio: Number.NaN,
  };
}

function fallbackPair(reason: string): RejectedPathOption[] {
  const metricsDelta = unmeasuredMetrics();
  const text = `No corridor was measured. ${reason} The metric fields are not comparison results.`;
  return colorize([
    {
      id: 'rejected-straight',
      label: 'No straight corridor',
      category: 'suboptimal-detour',
      reason: text,
      metricsDelta,
      path: [],
      colorHex: REJECTED_COLORS[0],
    },
    {
      id: 'rejected-offset',
      label: 'No offset corridor',
      category: 'suboptimal-detour',
      reason: text,
      metricsDelta,
      path: [],
      colorHex: REJECTED_COLORS[1],
    },
  ]);
}

export function buildRejectedPathOptions(
  grid: RoutingGrid,
  start: LocalPoint,
  destination: LocalPoint,
  candidates: RouteCandidate[],
  selectedCandidateId: string,
  strictQuality = false,
): RejectedPathOption[] {
  const list = Array.isArray(candidates) ? candidates : [];
  const geom = grid ? readGeom(grid) : null;
  if (!grid || !geom || !rastersReady(grid)) {
    return fallbackPair('The grid size is not usable, so a straight corridor and an offset corridor were not drawn.');
  }
  const baseline = baselineOf(list, selectedCandidateId);
  const weights = EVA_POLICY_WEIGHTS['terrain-aware'];
  const terrainPriced = baseline.policies.length === 1 && baseline.policies[0] === 'terrain-aware';
  const distanceRatioNote = terrainPriced
    ? ''
    : ' The cost ratio is a horizontal-distance ratio. This corridor is priced with terrain-aware weights, so its weighted cost is not compared with a different policy.';
  const built: RejectedPathOption[] = [];
  const usedIds = new Set<string>();
  let included = 0;
  for (let i = 0; i < list.length && included < 2; i++) {
    const candidate = list[i];
    if (!candidate || candidate.candidateId === selectedCandidateId) continue;
    if (sameCells(cellsOf(candidate), baseline.cells) !== 'different') continue;
    let duplicate = false;
    for (let j = 0; j < i; j++) {
      const prior = list[j];
      if (prior && prior.candidateId !== selectedCandidateId && sameCells(cellsOf(prior), cellsOf(candidate)) === 'same') {
        duplicate = true;
      }
    }
    if (duplicate) continue;
    const category = categoryForCandidate(grid, candidate, baseline);
    const distance = measuredNumber(candidate.outbound.metrics?.horizontalDistance_m);
    const cost = finiteOrNull(candidate.outbound.weightedCost?.value);
    const samePolicyCost = sameSinglePolicy(candidate, baseline);
    const roughness = peakRoughness(grid, cellsOf(candidate));
    const drawn = pathFromCandidate(grid, candidate);
    const candidateCells = cellsOf(candidate);
    const tooLongToDraw = candidateCells.length > 4096;
    const geometryComplete = !tooLongToDraw && (candidateCells.length === 0 || drawn.length === candidateCells.length);
    const baseReason = reasonForCandidate(category, candidate, baseline, roughness);
    built.push({
      id: uniqueId(`rejected-${candidate.candidateId}`, usedIds),
      label: `${policyTitleList(candidate.policies)} corridor`,
      category,
      reason: tooLongToDraw
        ? `This corridor has ${candidateCells.length} cells, so it is not copied or scanned on the main thread. ${baseReason}`
        : geometryComplete
          ? baseReason
          : `The corridor is not drawn because its geometry is incomplete. ${baseReason} Those figures describe the full solved route, not a shortened line.`,
      metricsDelta: baselineMetricsReady(baseline)
        ? {
            distanceDelta_m: measuredDelta(candidate.outbound.metrics?.horizontalDistance_m, baseline.distance),
            maxSlope_deg: measuredNumber(candidate.outbound.metrics?.maxTerrainSlope_deg),
            unknownLengthDelta_m: measuredDelta(candidate.outbound.metrics?.unknownQualityLength_m, baseline.unknown),
            costRatio: samePolicyCost
              ? ratioOf(cost, baseline.cost, distance, baseline.distance)
              : ratioOf(null, baseline.cost, distance, baseline.distance),
          }
        : unmeasuredMetrics(),
      path: drawn,
      colorHex: REJECTED_COLORS[0],
    });
    included += 1;
  }

  const outside =
    cellIndexFor(grid, start) === null || cellIndexFor(grid, destination) === null;
  const lineCells = outside ? [] : straightCells(grid, start, destination, geom);
  const line = measureCells(grid, lineCells, geom, weights, strictQuality);
  built.push({
    id: uniqueId('rejected-straight', usedIds),
    label: 'Straight-line corridor',
    category: categoryFromMeasure(line, outside || lineCells.length === 0),
    reason: `${missingBaselineNote(baseline)}${straightReason(line, outside)}${distanceRatioNote}`,
    metricsDelta: baselineMetricsReady(baseline)
      ? {
          distanceDelta_m: line.distance_m - baseline.distance,
          maxSlope_deg: line.maxSlope_deg,
          unknownLengthDelta_m: line.unknown_m - baseline.unknown,
          costRatio: ratioOf(
            terrainPriced ? line.weightedCost : null,
            baseline.cost,
            line.distance_m,
            baseline.distance,
          ),
        }
      : unmeasuredMetrics(),
    path: line.path,
    colorHex: REJECTED_COLORS[0],
  });

  const share = allCandidatesShareCells(list);
  if ((share || built.length < 2) && geom.total > LARGE_GRID_CELLS) {
    built.push({
      id: uniqueId('rejected-offset', usedIds),
      label: 'No offset corridor',
      category: 'suboptimal-detour',
      reason:
        'Offset corridors were not searched on this grid because it is above 100,000 cells. The 1000 by 1000 HiRISE map has 1,000,000 cells and uses the same skip. This avoids extra corridor walks on the main thread.',
      metricsDelta: unmeasuredMetrics(),
      path: [],
      colorHex: REJECTED_COLORS[1],
    });
  } else if (share || built.length < 2) {
    const baseCells = baseline.cells.length > 0 ? baseline.cells : lineCells;
    const missionStart = cellIndexFor(grid, start);
    const missionGoal = cellIndexFor(grid, destination);
    const offsetCells = buildOffsetCells(
      grid,
      baseCells,
      geom,
      lineCells,
      strictQuality,
      missionStart,
      missionGoal,
    );
    const offsetJoinsMission =
      missionStart !== null &&
      missionGoal !== null &&
      offsetCells.length >= 2 &&
      offsetCells[0] === missionStart &&
      offsetCells[offsetCells.length - 1] === missionGoal &&
      linkedCorridor(grid, offsetCells, geom, strictQuality);
    const offset = measureCells(grid, offsetJoinsMission ? offsetCells : [], geom, weights, strictQuality);
    built.push({
      id: uniqueId('rejected-offset', usedIds),
      label: offsetJoinsMission ? 'Offset admissible corridor' : 'No offset corridor',
      category: offset.path.length === 0 ? 'suboptimal-detour' : categoryFromMeasure(offset, false),
      reason: `${missingBaselineNote(baseline)}${offsetReason(offset, share)}${distanceRatioNote}`,
      metricsDelta: offsetJoinsMission && baselineMetricsReady(baseline)
        ? {
            distanceDelta_m: offset.distance_m - baseline.distance,
            maxSlope_deg: offset.maxSlope_deg,
            unknownLengthDelta_m: offset.unknown_m - baseline.unknown,
            costRatio: ratioOf(
              terrainPriced ? offset.weightedCost : null,
              baseline.cost,
              offset.distance_m,
              baseline.distance,
            ),
          }
        : unmeasuredMetrics(),
      path: offset.path,
      colorHex: REJECTED_COLORS[1],
    });
  }

  if (built.length < 2) {
    built.push({
      id: uniqueId('rejected-offset', usedIds),
      label: 'No offset corridor',
      category: 'suboptimal-detour',
      reason: 'Eight perpendicular offsets were checked, and none was a legal corridor from the mission start to the destination. That check is not a proof that no other corridor exists. The metric fields were not measured.',
      metricsDelta: unmeasuredMetrics(),
      path: [],
      colorHex: REJECTED_COLORS[1],
    });
  }
  return colorize(built);
}

function capBanner(dijkstra: AlgorithmRunStats, greedy: AlgorithmRunStats): string | null {
  if (!dijkstra.skipped && !greedy.skipped) return null;
  const names: string[] = [];
  if (dijkstra.skipped) names.push('Dijkstra');
  if (greedy.skipped) names.push('greedy best-first');
  return `${names.join(' and ')} hit the expansion cap before finishing, so the optimality comparison is incomplete.`;
}

export function computeSearchTraceAndCompare(
  grid: RoutingGrid,
  request: RouteRequest,
  candidates: RouteCandidate[],
  selectedCandidateId: string,
  options?: SearchTraceOptions,
): SearchTraceResult {
  const list = Array.isArray(candidates) ? candidates : [];
  const policy = resolvePolicy(options, list, selectedCandidateId);
  const weights = resolveWeights(policy, options?.weightsOverride, request);
  const maxFrames = clampFrames(options?.maxFrames);
  const maxDijkstraNodes = clampNodeCap(options?.maxDijkstraNodes);
  const geom = grid ? readGeom(grid) : null;
  const strictQuality = request?.strictQuality === true;
  const selected = findCandidate(list, selectedCandidateId);

  let comparison: AlgorithmComparison;
  let frames: SearchTraceFrame[] = [];
  let sampledNotice: string | null;
  let largeGrid = false;
  let totalCells = geom?.total ?? 0;
  let startIndex: number | null = null;
  let goalIndex: number | null = null;

  if (!grid || !geom || !rastersReady(grid)) {
    const notice = 'The grid width, height, or cell size is not usable, so no search was run.';
    comparison = assembleComparison(
      policy,
      skippedRun('astar', notice),
      skippedRun('dijkstra', notice),
      skippedRun('greedy-best-first', notice),
    );
    sampledNotice = notice;
  } else if (geom.total > LARGE_GRID_CELLS) {
    largeGrid = true;
    totalCells = geom.total;
    const started = nowMs();
    const cells = selected ? cellsOf(selected) : [];
    frames = framesFromSolvedPath(grid, geom, cells, policy, weights.weights, strictQuality, maxFrames);
    comparison = assembleComparison(
      policy,
      largeGridAstarStats(
        selected,
        policy,
        geom.total,
        elapsedMs(started),
        frames,
        weights.fromOverride,
        weights.fromRequest,
      ),
      skippedRun('dijkstra', hiriseNotice('Dijkstra', geom.total)),
      skippedRun('greedy-best-first', hiriseNotice('Greedy best-first', geom.total)),
    );
    const framesUnpriced = frames.some((frame) => frame.note.includes('Step costs were not summed'));
    const pricingStopped = frames.some((frame) => frame.note.includes('Step pricing stopped'));
    const costSentence = framesUnpriced
      ? 'The stored path is longer than 4096 cells, so those steps were not priced. Frame costs are 0 and the skipped A* row shows no cost. Neither value is a measured route cost.'
      : pricingStopped
        ? 'Pricing stopped before the end of the stored path. The skipped A* row shows no cost. The last frame cost is only the priced prefix, not the route total.'
        : 'When frames exist, their step sums are gated costs along the stored cells. The skipped A* row has no weighted cost, and those frame sums are not an A* result.';
    sampledNotice = `This grid has ${geom.total} cells, which is above the 100,000-cell cutoff. The 1000 by 1000 HiRISE map has 1,000,000 cells and uses this same skip. A grid just over 100,000 cells is not that map. Dijkstra and greedy best-first were skipped, and A* was not run again. ${costSentence}`;
    startIndex = extentOk(grid) ? cellIndexFor(grid, request?.start) : null;
    goalIndex = extentOk(grid) ? cellIndexFor(grid, request?.destination) : null;
  } else if (!extentOk(grid)) {
    const notice = 'The grid extent is not usable, so no search was run.';
    comparison = assembleComparison(
      policy,
      skippedRun('astar', notice),
      skippedRun('dijkstra', notice),
      skippedRun('greedy-best-first', notice),
    );
    sampledNotice = notice;
  } else {
    startIndex = cellIndexFor(grid, request?.start);
    goalIndex = cellIndexFor(grid, request?.destination);
    if (startIndex === null || goalIndex === null || startIndex >= geom.total || goalIndex >= geom.total) {
      const notice = 'The start or destination is outside the grid extent, so no search was run.';
      comparison = assembleComparison(
        policy,
        skippedRun('astar', notice),
        skippedRun('dijkstra', notice),
        skippedRun('greedy-best-first', notice),
      );
      sampledNotice = notice;
    } else if (startIndex === goalIndex) {
      const sharedCell = startIndex;
      const astar = sameCellRun(grid, sharedCell, policy, 'astar', strictQuality, maxFrames, nowMs());
      const dijkstra = sameCellRun(grid, sharedCell, policy, 'dijkstra', strictQuality, 0, nowMs());
      const greedy = sameCellRun(
        grid,
        sharedCell,
        policy,
        'greedy-best-first',
        strictQuality,
        0,
        nowMs(),
      );
      comparison = assembleComparison(policy, astar.stats, dijkstra.stats, greedy.stats);
      frames = astar.frames;
      sampledNotice = astar.stats.notice;
    } else {
      const astarWs = createWorkspace(geom.total);
      const dijkstraWs = createWorkspace(geom.total);
      const greedyWs = createWorkspace(geom.total);
      const astar = runSearch(
        grid,
        astarWs,
        geom,
        startIndex,
        goalIndex,
        weights.weights,
        policy,
        'astar',
        null,
        maxFrames,
        strictQuality,
      );
      const dijkstra = runSearch(
        grid,
        dijkstraWs,
        geom,
        startIndex,
        goalIndex,
        weights.weights,
        policy,
        'dijkstra',
        maxDijkstraNodes,
        0,
        strictQuality,
      );
      const greedy = runSearch(
        grid,
        greedyWs,
        geom,
        startIndex,
        goalIndex,
        weights.weights,
        policy,
        'greedy-best-first',
        maxDijkstraNodes,
        0,
        strictQuality,
      );
      comparison = assembleComparison(policy, astar.stats, dijkstra.stats, greedy.stats);
      frames = astar.frames;
      sampledNotice = capBanner(dijkstra.stats, greedy.stats);
    }
  }

  const rejectedPaths = buildRejectedPathOptions(
    grid,
    request?.start ?? { east_m: Number.NaN, north_m: Number.NaN },
    request?.destination ?? { east_m: Number.NaN, north_m: Number.NaN },
    list,
    selectedCandidateId,
    strictQuality,
  );
  const thinkingSteps = buildThinkingSteps({
    policy,
    weights,
    strictQuality,
    request,
    grid,
    geom,
    startIndex,
    goalIndex,
    largeGrid,
    totalCells,
    comparison,
    rejectedCount: rejectedPaths.length,
    selectedCandidateId,
    frameCount: frames.length,
  });

  return {
    policy,
    selectedCandidateId,
    frames,
    comparison,
    rejectedPaths,
    thinkingSteps,
    sampledNotice,
  };
}
