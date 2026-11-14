/**
 * Solver-independent route invariants. OWNER: Role C. Any engine (placeholder or Ayush's real
 * solver) must satisfy these for every simulated request. Returns human-readable violations.
 */
import {
  QUALITY,
  cellCenter,
  pointToCell,
  type GridBundle,
  type RouteFinalResponse,
  type RouteLeg,
  type RouteRequest,
} from '../contracts';
import { dataValid } from './oracle';

const EPS = 1e-6;
const close = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

export function checkLeg(b: GridBundle, leg: RouteLeg, from: number, to: number, strict: boolean, label: string): string[] {
  const v: string[] = [];
  const g = b.manifest.grid, W = g.width;
  const { cells, path } = leg;
  if (!cells.length) return [`${label}: empty path`];
  if (cells[0] !== from) v.push(`${label}: starts at cell ${cells[0]}, expected ${from}`);
  if (cells[cells.length - 1] !== to) v.push(`${label}: ends at cell ${cells[cells.length - 1]}, expected ${to}`);
  if (path.length !== cells.length) v.push(`${label}: path has ${path.length} points for ${cells.length} cells`);
  if (new Set(cells).size !== cells.length) v.push(`${label}: path revisits a cell`);
  let hd = 0, asc = 0, desc = 0;
  for (let k = 0; k < cells.length; k++) {
    const i = cells[k]!;
    const r = Math.floor(i / W), c = i % W;
    if (!Number.isInteger(i) || i < 0 || i >= W * g.height) { v.push(`${label}: cell ${i} out of range`); continue; }
    if (!dataValid(b, i)) v.push(`${label}: step ${k} uses invalid cell (r${r},c${c}) exclusion=${b.exclusion[i]} quality=${b.quality[i]}`);
    if (strict && b.quality[i] === QUALITY.UNKNOWN) v.push(`${label}: strict route uses unknown-quality cell (r${r},c${c})`);
    const p = path[k];
    const cc = cellCenter(g, r, c);
    if (p && (!close(p.east_m, cc.east_m) || !close(p.north_m, cc.north_m))) v.push(`${label}: point ${k} is not the centre of cell ${i}`);
    if (p && !close(p.elevation_m, b.elevation[i]!)) v.push(`${label}: point ${k} elevation ${p.elevation_m} != raster ${b.elevation[i]}`);
    if (k > 0) {
      const j = cells[k - 1]!;
      const dr = r - Math.floor(j / W), dc = c - (j % W);
      if (Math.max(Math.abs(dr), Math.abs(dc)) !== 1) { v.push(`${label}: step ${k - 1}->${k} is not an 8-neighbour move (dr=${dr}, dc=${dc})`); continue; }
      if (dr && dc) {
        const pr = Math.floor(j / W), pc = j % W;
        if (!dataValid(b, pr * W + c) || !dataValid(b, r * W + pc)) v.push(`${label}: diagonal step ${k - 1}->${k} cuts the corner of an invalid cell`);
      }
      const len = Math.hypot(dr * g.cellSizeNorth_m, dc * g.cellSizeEast_m);
      hd += len;
      const dz = b.elevation[i]! - b.elevation[j]!;
      if (dz > 0) asc += dz; else desc -= dz;
    }
  }
  const m = leg.metrics;
  if (!close(m.horizontalDistance_m, hd)) v.push(`${label}: horizontalDistance_m ${m.horizontalDistance_m} != sum of steps ${hd}`);
  if (m.surfaceDistance_m < m.horizontalDistance_m - EPS) v.push(`${label}: surfaceDistance_m < horizontalDistance_m`);
  if (!close(m.ascent_m, asc, 1e-4) || !close(m.descent_m, desc, 1e-4)) v.push(`${label}: ascent/descent ${m.ascent_m}/${m.descent_m} != ${asc}/${desc}`);
  const net = b.elevation[to]! - b.elevation[from]!;
  if (!close(m.ascent_m - m.descent_m, net, 1e-4)) v.push(`${label}: ascent-descent ${m.ascent_m - m.descent_m} != net elevation change ${net}`);
  if (m.cellCount !== cells.length) v.push(`${label}: cellCount ${m.cellCount} != ${cells.length}`);
  for (const k of ['lowQualityLength_m', 'unknownQualityLength_m'] as const)
    if (m[k] < -EPS || m[k] > hd + EPS) v.push(`${label}: ${k} ${m[k]} outside [0, ${hd}]`);
  if (strict && m.unknownQualityLength_m > EPS) v.push(`${label}: strict route reports ${m.unknownQualityLength_m} m unknown quality`);
  const pct = (x: number) => (hd > 0 ? (100 * x) / hd : 0);
  if (!close(m.unknownQualityPct, pct(m.unknownQualityLength_m), 1e-6) || !close(m.lowQualityPct, pct(m.lowQualityLength_m), 1e-6))
    v.push(`${label}: exposure percentages inconsistent with lengths`);
  for (const [k, x] of Object.entries(m)) if (!Number.isFinite(x)) v.push(`${label}: metric ${k} is not finite`);
  // Quality intervals: contiguous cover of [0, hd], consistent with the unknown/low lengths.
  let at = 0, unk = 0, low = 0;
  for (const q of leg.qualityIntervals) {
    if (!close(q.fromDistance_m, at)) v.push(`${label}: quality intervals not contiguous at ${at}`);
    if (q.toDistance_m < q.fromDistance_m - EPS) v.push(`${label}: reversed quality interval`);
    if (q.quality === QUALITY.UNKNOWN) unk += q.toDistance_m - q.fromDistance_m;
    if (q.quality === QUALITY.LOW) low += q.toDistance_m - q.fromDistance_m;
    at = q.toDistance_m;
  }
  if (cells.length > 1 && !close(at, hd)) v.push(`${label}: quality intervals end at ${at}, route is ${hd} m`);
  if (!close(unk, m.unknownQualityLength_m, 1e-6) || !close(low, m.lowQualityLength_m, 1e-6)) v.push(`${label}: quality intervals disagree with exposure lengths`);
  // Profile: one sample per path point, monotone distance, index sync for map/3D hover.
  const pr = leg.profile;
  if (pr.distance_m.length !== path.length || pr.elevation_m.length !== path.length || pr.pathIndex.length !== path.length) v.push(`${label}: profile length mismatch`);
  for (let k = 1; k < pr.distance_m.length; k++) if (pr.distance_m[k]! < pr.distance_m[k - 1]! - EPS) v.push(`${label}: profile distance decreases at ${k}`);
  if (pr.distance_m.length && !close(pr.distance_m[pr.distance_m.length - 1]!, hd)) v.push(`${label}: profile ends at ${pr.distance_m.at(-1)}, route is ${hd}`);
  if (pr.pathIndex.some((x, k) => x !== k)) v.push(`${label}: profile.pathIndex is not 0..n-1`);
  // Weighted cost: finite, and never below the straight-line distance between the accepted centres.
  const a = path[0], z = path[path.length - 1];
  const straight = a && z ? Math.hypot(z.east_m - a.east_m, z.north_m - a.north_m) : 0;
  if (!Number.isFinite(leg.weightedCost.value)) v.push(`${label}: weightedCost not finite`);
  if (leg.weightedCost.value < straight - EPS) v.push(`${label}: weightedCost ${leg.weightedCost.value} < straight-line lower bound ${straight}`);
  if (hd < straight - EPS) v.push(`${label}: horizontal distance ${hd} < straight-line ${straight}`);
  return v;
}

/** Contract + geometric invariants for any final response to `req` on bundle `b`. */
export function checkResponse(b: GridBundle, req: RouteRequest, res: RouteFinalResponse, modelVersion: string): string[] {
  const v: string[] = [];
  if (res.requestId !== req.requestId) v.push(`requestId ${res.requestId} != ${req.requestId}`);
  if (res.bundleVersion !== req.bundleVersion) v.push(`bundleVersion not echoed`);
  if (res.modelVersion !== modelVersion) v.push(`modelVersion ${res.modelVersion} != engine ${modelVersion}`);
  if (res.status === 'success' || res.status === 'no-path') {
    const g = b.manifest.grid;
    for (const [k, ep, p] of [['start', res.start, req.start], ['destination', res.destination, req.destination]] as const) {
      const cell = pointToCell(g, p);
      if (!cell) { v.push(`${k}: solver accepted a point outside the grid`); continue; }
      if (ep.cell.index !== cell.index) v.push(`${k}: snapped to cell ${ep.cell.index}, containing cell is ${cell.index}`);
      const cc = cellCenter(g, cell.row, cell.col);
      if (!close(ep.accepted.east_m, cc.east_m) || !close(ep.accepted.north_m, cc.north_m)) v.push(`${k}: accepted point is not the cell centre`);
      if (ep.requested.east_m !== p.east_m || ep.requested.north_m !== p.north_m) v.push(`${k}: requested point not echoed`);
    }
  }
  if (res.status === 'success') {
    if (!res.candidates.length) v.push('success with zero candidates');
    const ids = new Set<string>(), keys = new Set<string>(), seenPolicies: string[] = [];
    for (const c of res.candidates) {
      if (ids.has(c.candidateId)) v.push(`duplicate candidateId ${c.candidateId}`);
      ids.add(c.candidateId);
      const key = `${c.outbound.cells.join(',')}|${c.returnLeg?.cells.join(',') ?? ''}`;
      if (keys.has(key)) v.push(`candidates ${c.candidateId} duplicates another candidate's cell path`);
      keys.add(key);
      if (!c.policies.length) v.push(`${c.candidateId}: no policies`);
      for (const p of c.policies) {
        if (!req.policies.includes(p)) v.push(`${c.candidateId}: policy ${p} was not requested`);
        seenPolicies.push(p);
      }
      v.push(...checkLeg(b, c.outbound, res.start.cell.index, res.destination.cell.index, req.strictQuality, `${c.candidateId}.outbound`));
      if (!req.roundTrip) {
        if (c.returnLeg !== null || c.missionStatus !== 'one-way') v.push(`${c.candidateId}: one-way request but returnLeg/missionStatus = ${c.missionStatus}`);
      } else if (c.missionStatus === 'round-trip-complete') {
        if (!c.returnLeg) v.push(`${c.candidateId}: round-trip-complete without returnLeg`);
        else v.push(...checkLeg(b, c.returnLeg, res.destination.cell.index, res.start.cell.index, req.strictQuality, `${c.candidateId}.return`));
      } else if (c.missionStatus !== 'round-trip-incomplete' || c.returnLeg !== null) v.push(`${c.candidateId}: bad round-trip status ${c.missionStatus}`);
    }
    if (new Set(seenPolicies).size !== seenPolicies.length) v.push('a policy appears in more than one candidate');
    if (!Number.isFinite(res.computeMs) || res.computeMs < 0) v.push('computeMs not a finite non-negative number');
  }
  if (res.status === 'no-path' && JSON.stringify([...res.policies].sort()) !== JSON.stringify([...req.policies].sort())) v.push('no-path does not echo requested policies');
  return v;
}

export function bundleCellOf(b: GridBundle, p: { east_m: number; north_m: number }): number | null {
  return pointToCell(b.manifest.grid, p)?.index ?? null;
}
