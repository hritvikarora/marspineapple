/**
 * Independent reference oracles for simulation tests. OWNER: Role C. Dev/test only.
 * Deliberately NOT sharing code with any solver: plain Dijkstra over 8-neighbour cell graphs.
 */
import { EXCLUSION, QUALITY, type GridBundle } from '../contracts';

export type StrictMode = 'off' | 'good-only' | 'not-unknown';

/** Data-level validity: not excluded, finite derived layers, has elevation, (strict) quality accepted. */
export function dataValid(b: GridBundle, i: number, strict: StrictMode = 'off'): boolean {
  if (b.exclusion[i] !== EXCLUSION.NONE) return false;
  if (!Number.isFinite(b.elevation[i]!) || !Number.isFinite(b.slope[i]!) || !Number.isFinite(b.roughness[i]!)) return false;
  const q = b.quality[i]!;
  if (q === QUALITY.NO_ELEVATION) return false;
  if (strict === 'good-only' && q !== QUALITY.GOOD) return false;
  if (strict === 'not-unknown' && q === QUALITY.UNKNOWN) return false;
  return true;
}

/** True when every valid cell has slope 0 and roughness 0 (pure geometry => exact oracles apply). */
export function isFlat(b: GridBundle): boolean {
  for (let i = 0; i < b.elevation.length; i++) {
    if (!dataValid(b, i)) continue;
    if (Math.abs(b.slope[i]!) > 1e-6 || Math.abs(b.roughness[i]!) > 1e-6) return false;
  }
  return true;
}

/**
 * Shortest planar length between two cells over `valid` cells with 8-neighbour steps.
 * cornerCut=false forbids a diagonal step when either orthogonal neighbour is invalid.
 * Returns Infinity when disconnected.
 */
export function referenceShortest(b: GridBundle, from: number, to: number, valid: (i: number) => boolean, cornerCut: boolean): number {
  const g = b.manifest.grid, W = g.width, H = g.height, N = W * H;
  if (!valid(from) || !valid(to)) return Infinity;
  const dist = new Float64Array(N).fill(Infinity);
  const done = new Uint8Array(N);
  // binary heap of [d, i]
  const hd: number[] = [], hi: number[] = [];
  const push = (d: number, i: number) => {
    hd.push(d); hi.push(i);
    let k = hd.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (hd[p]! <= hd[k]!) break;
      [hd[p], hd[k]] = [hd[k]!, hd[p]!]; [hi[p], hi[k]] = [hi[k]!, hi[p]!]; k = p;
    }
  };
  const pop = (): [number, number] => {
    const top: [number, number] = [hd[0]!, hi[0]!];
    const ld = hd.pop()!, li = hi.pop()!;
    if (hd.length) {
      hd[0] = ld; hi[0] = li;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1; let m = k;
        if (l < hd.length && hd[l]! < hd[m]!) m = l;
        if (r < hd.length && hd[r]! < hd[m]!) m = r;
        if (m === k) break;
        [hd[m], hd[k]] = [hd[k]!, hd[m]!]; [hi[m], hi[k]] = [hi[k]!, hi[m]!]; k = m;
      }
    }
    return top;
  };
  dist[from] = 0;
  push(0, from);
  while (hd.length) {
    const [d, u] = pop();
    if (done[u]) continue;
    done[u] = 1;
    if (u === to) return d;
    const ur = Math.floor(u / W), uc = u % W;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const vr = ur + dr, vc = uc + dc;
      if (vr < 0 || vc < 0 || vr >= H || vc >= W) continue;
      const v = vr * W + vc;
      if (done[v] || !valid(v)) continue;
      if (dr && dc && !cornerCut && (!valid(ur * W + vc) || !valid(vr * W + uc))) continue;
      const nd = d + Math.hypot(dr * g.cellSizeNorth_m, dc * g.cellSizeEast_m);
      if (nd < dist[v]!) { dist[v] = nd; push(nd, v); }
    }
  }
  return Infinity;
}

/** Octile distance between two cells on an unobstructed grid (exact shortest 8-neighbour length). */
export function octile(b: GridBundle, from: number, to: number): number {
  const g = b.manifest.grid;
  // Diagonal steps cover min(cols, rows); the rest are axis steps (anisotropic cells handled per axis).
  const nc = Math.abs((from % g.width) - (to % g.width)), nr = Math.abs(Math.floor(from / g.width) - Math.floor(to / g.width));
  const diag = Math.min(nc, nr);
  return diag * Math.hypot(g.cellSizeEast_m, g.cellSizeNorth_m) + (nc - diag) * g.cellSizeEast_m + (nr - diag) * g.cellSizeNorth_m;
}
