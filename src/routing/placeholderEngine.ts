/**
 * ⚠️ PLACEHOLDER ROUTING ENGINE — OWNER: Ayush. Replace freely.
 *
 * Written by Role C only so the end-to-end pipe (bundle -> worker -> state -> map -> export)
 * works before the real solver lands. It follows the master-plan rules loosely (8-neighbour A*,
 * no corner cutting, admissibility before cost, deterministic tie-breaking, dedup of identical
 * paths, length-based quality exposure) but its profile limits and weights are UNVALIDATED
 * DEMO NUMBERS, not the plan's EVA profile.
 *
 * Contract it must keep: `solveRoute(grid, request, hooks) => RouteFinalResponse`
 * (see src/contracts/route.ts and INTERFACE.md).
 */
import {
  EXCLUSION,
  QUALITY,
  cellCenter,
  cellRef,
  pointToCell,
  type EndpointResolution,
  type GridSpec,
  type PolicyWeights,
  type QualityCode,
  type QualityInterval,
  type RegionManifest,
  type RouteCandidate,
  type RouteFinalResponse,
  type RouteLeg,
  type RouteMetrics,
  type RoutePolicyId,
  type RouteRequest,
} from '../contracts';

export const PLACEHOLDER_MODEL_VERSION = 'placeholder-astar-0.1.0';

export const PLACEHOLDER_PROFILE = {
  id: 'placeholder-demo-profile',
  maxTerrainSlope_deg: 25,
  maxAbsEdgeGrade_deg: 20,
  slopeNorm_deg: 25,
  roughnessNorm_m: 1,
  maxNormalizedPenalty: 4,
  qualityPenalty: { [QUALITY.GOOD]: 0, [QUALITY.LOW]: 0.5, [QUALITY.UNKNOWN]: 1 } as Record<number, number>,
  strictAcceptable: [QUALITY.GOOD] as number[],
} as const;

export const DEFAULT_WEIGHTS: Record<RoutePolicyId, PolicyWeights> = {
  'shortest-feasible': { slope: 0, roughness: 0, quality: 0 },
  'terrain-aware': { slope: 1, roughness: 1, quality: 0 },
  'uncertainty-aware': { slope: 0.5, roughness: 0.5, quality: 2 },
};

/** Minimal immutable grid the engine needs (built from GridBundle or its transfer form). */
export interface RoutingGrid {
  manifest: RegionManifest;
  bundleVersion: string;
  elevation: Float32Array;
  slope: Float32Array;
  roughness: Float32Array;
  quality: Uint8Array;
  exclusion: Uint8Array;
}

export interface SolveHooks {
  /** Return non-null to abort. Checked every 512 expansions. */
  shouldStop?: () => 'cancelled' | 'timeout' | null;
  onProgress?: (exploredNodes: number) => void;
  now?: () => number;
}

class StopSignal {
  constructor(readonly kind: 'cancelled' | 'timeout') {}
}

const DEG = 180 / Math.PI;

function cellAdmissible(g: RoutingGrid, i: number, strict: boolean): boolean {
  if (g.exclusion[i] !== EXCLUSION.NONE) return false;
  const z = g.elevation[i]!, s = g.slope[i]!, r = g.roughness[i]!;
  if (!Number.isFinite(z) || !Number.isFinite(s) || !Number.isFinite(r)) return false;
  if (s > PLACEHOLDER_PROFILE.maxTerrainSlope_deg) return false;
  const q = g.quality[i]!;
  if (q === QUALITY.NO_ELEVATION) return false;
  if (strict && !PLACEHOLDER_PROFILE.strictAcceptable.includes(q)) return false;
  return true;
}

function cellPenalty(g: RoutingGrid, i: number, w: PolicyWeights): number {
  const cap = PLACEHOLDER_PROFILE.maxNormalizedPenalty;
  const s = Math.min(cap, g.slope[i]! / PLACEHOLDER_PROFILE.slopeNorm_deg);
  const r = Math.min(cap, g.roughness[i]! / PLACEHOLDER_PROFILE.roughnessNorm_m);
  const q = PLACEHOLDER_PROFILE.qualityPenalty[g.quality[i]!] ?? 1;
  return w.slope * s + w.roughness * r + w.quality * q;
}

/** Deterministic neighbour order: N, NE, E, SE, S, SW, W, NW. */
const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0], [-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1],
];

class MinHeap {
  private f: number[] = [];
  private v: number[] = [];
  get size() { return this.v.length; }
  private less(a: number, b: number) {
    return this.f[a]! < this.f[b]! || (this.f[a] === this.f[b] && this.v[a]! < this.v[b]!);
  }
  private swap(a: number, b: number) {
    [this.f[a], this.f[b]] = [this.f[b]!, this.f[a]!];
    [this.v[a], this.v[b]] = [this.v[b]!, this.v[a]!];
  }
  push(f: number, v: number) {
    this.f.push(f); this.v.push(v);
    let i = this.v.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (!this.less(i, p)) break; this.swap(i, p); i = p; }
  }
  pop(): [number, number] {
    const top: [number, number] = [this.f[0]!, this.v[0]!];
    const lf = this.f.pop()!, lv = this.v.pop()!;
    if (this.v.length) {
      this.f[0] = lf; this.v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < this.v.length && this.less(l, m)) m = l;
        if (r < this.v.length && this.less(r, m)) m = r;
        if (m === i) break;
        this.swap(i, m); i = m;
      }
    }
    return top;
  }
}

interface SearchResult { cells: number[]; cost: number }

function search(g: RoutingGrid, from: number, to: number, w: PolicyWeights, strict: boolean, hooks: SolveHooks, explored: { n: number }): SearchResult | null {
  const grid = g.manifest.grid;
  const W = grid.width, H = grid.height, N = W * H;
  const de = grid.cellSizeEast_m, dn = grid.cellSizeNorth_m;
  const gScore = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const admissible = new Uint8Array(N);
  for (let i = 0; i < N; i++) admissible[i] = cellAdmissible(g, i, strict) ? 1 : 0;
  const tr = Math.floor(to / W), tc = to % W;
  const h = (i: number) => Math.hypot((Math.floor(i / W) - tr) * dn, ((i % W) - tc) * de);
  const maxGradeTan = Math.tan(PLACEHOLDER_PROFILE.maxAbsEdgeGrade_deg / DEG);
  const heap = new MinHeap();
  gScore[from] = 0;
  heap.push(h(from), from);
  while (heap.size) {
    const [, u] = heap.pop();
    if (closed[u]) continue; // stale heap entry
    closed[u] = 1;
    explored.n++;
    if ((explored.n & 511) === 0) {
      const stop = hooks.shouldStop?.();
      if (stop) throw new StopSignal(stop);
      hooks.onProgress?.(explored.n);
    }
    if (u === to) break; // goal popped => optimal (consistent heuristic)
    const ur = Math.floor(u / W), uc = u % W;
    for (const [dr, dc] of NEIGHBOURS) {
      const vr = ur + dr, vc = uc + dc;
      if (vr < 0 || vc < 0 || vr >= H || vc >= W) continue;
      const v = vr * W + vc;
      if (!admissible[v] || closed[v]) continue;
      if (dr !== 0 && dc !== 0 && (!admissible[ur * W + vc] || !admissible[vr * W + uc])) continue; // no corner cutting
      const len = Math.hypot(dr * dn, dc * de);
      const dz = Math.abs(g.elevation[v]! - g.elevation[u]!);
      if (dz / len > maxGradeTan) continue;
      const cost = len * (1 + 0.5 * (cellPenalty(g, u, w) + cellPenalty(g, v, w)));
      const cand = gScore[u]! + cost;
      if (cand < gScore[v]! - 1e-9) {
        gScore[v] = cand;
        prev[v] = u;
        heap.push(cand + h(v), v);
      }
    }
  }
  if (!Number.isFinite(gScore[to]!)) return null;
  const cells: number[] = [];
  for (let c = to, guard = 0; c !== -1; c = c === from ? -1 : prev[c]!) {
    cells.push(c);
    if (++guard > N) throw new Error('predecessor cycle detected');
    if (c !== from && prev[c] === -1) throw new Error('broken predecessor chain');
  }
  cells.reverse();
  return { cells, cost: gScore[to]! };
}

const QUALITY_RANK: Record<number, number> = { [QUALITY.GOOD]: 0, [QUALITY.LOW]: 1, [QUALITY.UNKNOWN]: 2, [QUALITY.NO_ELEVATION]: 3 };

export function buildLeg(g: RoutingGrid, cells: number[], cost: number): RouteLeg {
  const grid = g.manifest.grid;
  const path = cells.map((i) => {
    const { row, col } = cellRef(grid, i);
    return { ...cellCenter(grid, row, col), elevation_m: g.elevation[i]! };
  });
  let hd = 0, sd = 0, asc = 0, desc = 0, maxSlope = 0, maxGrade = 0, lowLen = 0, unkLen = 0;
  const dist: number[] = [0];
  const intervals: QualityInterval[] = [];
  for (const i of cells) maxSlope = Math.max(maxSlope, g.slope[i]!);
  for (let k = 1; k < path.length; k++) {
    const a = path[k - 1]!, b = path[k]!;
    const len = Math.hypot(b.east_m - a.east_m, b.north_m - a.north_m);
    const dz = b.elevation_m - a.elevation_m;
    const from = hd;
    hd += len;
    sd += Math.hypot(len, dz);
    if (dz > 0) asc += dz; else desc -= dz;
    maxGrade = Math.max(maxGrade, Math.atan(Math.abs(dz) / len) * DEG);
    dist.push(hd);
    // Conservative edge class: the worse of the two endpoint cells.
    const qa = g.quality[cells[k - 1]!]!, qb = g.quality[cells[k]!]!;
    const q = (QUALITY_RANK[qa]! >= QUALITY_RANK[qb]! ? qa : qb) as QualityCode;
    if (q === QUALITY.LOW) lowLen += len;
    if (q === QUALITY.UNKNOWN) unkLen += len;
    const last = intervals[intervals.length - 1];
    if (last && last.quality === q) last.toDistance_m = hd;
    else intervals.push({ fromDistance_m: from, toDistance_m: hd, quality: q });
  }
  const metrics: RouteMetrics = {
    horizontalDistance_m: hd,
    surfaceDistance_m: sd,
    ascent_m: asc,
    descent_m: desc,
    maxTerrainSlope_deg: maxSlope,
    maxAbsEdgeGrade_deg: maxGrade,
    lowQualityLength_m: lowLen,
    lowQualityPct: hd > 0 ? (100 * lowLen) / hd : 0,
    unknownQualityLength_m: unkLen,
    unknownQualityPct: hd > 0 ? (100 * unkLen) / hd : 0,
    cellCount: cells.length,
  };
  return {
    cells,
    path,
    metrics,
    qualityIntervals: intervals,
    profile: { distance_m: dist, elevation_m: path.map((p) => p.elevation_m), pathIndex: path.map((_, k) => k) },
    weightedCost: { value: cost, units: 'weighted-cost' },
  };
}

function resolveEndpoint(grid: GridSpec, p: { east_m: number; north_m: number }): EndpointResolution | null {
  const cell = pointToCell(grid, p);
  if (!cell) return null;
  return { requested: { east_m: p.east_m, north_m: p.north_m }, cell, accepted: cellCenter(grid, cell.row, cell.col) };
}

function fmt(n: number): string {
  return n.toFixed(0);
}

function explain(c: RouteCandidate, all: RouteCandidate[]): string[] {
  const out: string[] = [];
  const m = c.outbound.metrics;
  if (c.policies.length > 1) out.push(`Same cell path produced by: ${c.policies.join(', ')}.`);
  if (m.cellCount === 1) out.push('Start and destination are in the same grid cell (zero-length route).');
  for (const o of all) {
    if (o === c) continue;
    const om = o.outbound.metrics;
    const dLen = m.horizontalDistance_m - om.horizontalDistance_m;
    const dUnk = om.unknownQualityLength_m - m.unknownQualityLength_m;
    if (dLen > 0 && dUnk > 0)
      out.push(`${fmt(dLen)} m longer than ${o.candidateId} but crosses ${fmt(dUnk)} m less unknown-quality terrain.`);
  }
  out.push('Placeholder solver: limits and weights are unvalidated demo values.');
  return out;
}

export function solveRoute(g: RoutingGrid | null, req: RouteRequest, hooks: SolveHooks = {}): RouteFinalResponse {
  const now = hooks.now ?? (() => Date.now());
  const t0 = now();
  const base = { requestId: req.requestId, bundleVersion: req.bundleVersion, modelVersion: PLACEHOLDER_MODEL_VERSION };
  const invalid = (reason: Extract<RouteFinalResponse, { status: 'invalid-input' }>['reason'], field: string | null, message: string): RouteFinalResponse =>
    ({ ...base, status: 'invalid-input', reason, field, message });

  if (!g) return invalid('bundle-not-loaded', null, 'No region bundle is loaded in the worker.');
  if (req.bundleVersion !== g.bundleVersion)
    return invalid('version-mismatch', 'bundleVersion', `Request names bundle ${req.bundleVersion} but worker has ${g.bundleVersion}.`);
  if (req.modelVersion !== PLACEHOLDER_MODEL_VERSION)
    return invalid('model-mismatch', 'modelVersion', `Request expects model ${req.modelVersion}; worker runs ${PLACEHOLDER_MODEL_VERSION}.`);
  if (!req.policies.length) return invalid('no-policies', 'policies', 'At least one route policy is required.');
  if (req.strictQuality && !g.manifest.strictQualitySupported)
    return invalid('strict-quality-unsupported', 'strictQuality', 'This bundle has no documented quality classes; strict quality mode is unavailable.');

  const grid = g.manifest.grid;
  const start = resolveEndpoint(grid, req.start);
  if (!start) return invalid('endpoint-outside-region', 'start', 'Start point is outside the loaded region.');
  const destination = resolveEndpoint(grid, req.destination);
  if (!destination) return invalid('endpoint-outside-region', 'destination', 'Destination is outside the loaded region.');
  for (const [field, ep] of [['start', start], ['destination', destination]] as const) {
    if (!cellAdmissible(g, ep.cell.index, false))
      return invalid('endpoint-excluded', field, `${field} cell (row ${ep.cell.row}, col ${ep.cell.col}) is excluded (exclusion code ${g.exclusion[ep.cell.index]}, slope ${g.slope[ep.cell.index]?.toFixed(1)} deg).`);
    if (req.strictQuality && !cellAdmissible(g, ep.cell.index, true))
      return invalid('endpoint-quality-excluded', field, `${field} cell is outside the acceptable quality set in strict mode.`);
  }

  const explored = { n: 0 };
  try {
    const raw: { policy: RoutePolicyId; out: SearchResult | null; back: SearchResult | null }[] = [];
    for (const policy of req.policies) {
      const w = req.weightOverrides?.[policy] ?? DEFAULT_WEIGHTS[policy];
      const out = search(g, start.cell.index, destination.cell.index, w, req.strictQuality, hooks, explored);
      const back = out && req.roundTrip ? search(g, destination.cell.index, start.cell.index, w, req.strictQuality, hooks, explored) : null;
      raw.push({ policy, out, back });
    }
    const found = raw.filter((r) => r.out);
    if (!found.length) {
      let reason: 'disconnected-under-limits' | 'strict-quality-disconnects' = 'disconnected-under-limits';
      if (req.strictQuality && search(g, start.cell.index, destination.cell.index, DEFAULT_WEIGHTS['shortest-feasible'], false, hooks, explored))
        reason = 'strict-quality-disconnects';
      return {
        ...base, status: 'no-path', reason, start, destination, policies: [...req.policies],
        message: reason === 'strict-quality-disconnects'
          ? 'No route stays within documented acceptable quality; a route exists if lower/unknown quality is allowed.'
          : 'Destination is not connected to the start under the current terrain limits.',
      };
    }
    const byKey = new Map<string, RouteCandidate>();
    for (const r of found) {
      const key = `${r.out!.cells.join(',')}|${r.back?.cells.join(',') ?? ''}`;
      const existing = byKey.get(key);
      if (existing) { existing.policies.push(r.policy); continue; }
      byKey.set(key, {
        candidateId: `c${byKey.size}`,
        policies: [r.policy],
        outbound: buildLeg(g, r.out!.cells, r.out!.cost),
        returnLeg: r.back ? buildLeg(g, r.back.cells, r.back.cost) : null,
        missionStatus: !req.roundTrip ? 'one-way' : r.back ? 'round-trip-complete' : 'round-trip-incomplete',
        explanation: [],
      });
    }
    const candidates = [...byKey.values()];
    for (const c of candidates) c.explanation = explain(c, candidates);
    return { ...base, status: 'success', start, destination, candidates, computeMs: Math.max(0, now() - t0) };
  } catch (e) {
    if (e instanceof StopSignal) {
      return e.kind === 'cancelled'
        ? { ...base, status: 'cancelled' }
        : { ...base, status: 'timeout', limitMs: req.timeoutMs ?? 0, message: 'Search exceeded its time budget. This is not proof that no path exists.' };
    }
    return { ...base, status: 'data-error', stage: 'reconstruction', message: (e as Error).message };
  }
}
