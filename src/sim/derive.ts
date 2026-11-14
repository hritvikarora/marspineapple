/**
 * Derived analytical layers for simulated terrain. OWNER: Role C. Dev/test only.
 * Same definitions as scripts/make-fixture.mjs (and the manifest `definition` strings):
 *  - slope: atan(|grad z|) in degrees, central differences over 2 cells, one-sided at the outer edge.
 *    A grid only 1 cell tall/wide has no gradient along that axis (treated as 0, not NaN).
 *  - roughness: RMS residual after least-squares plane removal over the available 3x3 window
 *    (degenerates to a line fit for 1-cell-wide grids, and 0 for a single cell).
 *  - Cells whose derivative neighbourhood touches missing elevation get NaN + exclusion 2.
 */
import { EXCLUSION } from '../contracts';

export interface DerivedLayers {
  slope: Float32Array;
  roughness: Float32Array;
}

export function deriveSlopeRoughness(
  elevation: Float32Array, width: number, height: number, de: number, dn: number, exclusion: Uint8Array,
): DerivedLayers {
  const N = width * height;
  const slope = new Float32Array(N), roughness = new Float32Array(N);
  const z = (r: number, c: number) => elevation[r * width + c]!;
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const i = r * width + c;
      if (!Number.isFinite(z(r, c))) { slope[i] = NaN; roughness[i] = NaN; continue; }
      const cw = Math.max(0, c - 1), ce = Math.min(width - 1, c + 1);
      const rn = Math.max(0, r - 1), rs = Math.min(height - 1, r + 1);
      const dzde = ce > cw ? (z(r, ce) - z(r, cw)) / ((ce - cw) * de) : 0;
      const dzdn = rs > rn ? (z(rn, c) - z(rs, c)) / ((rs - rn) * dn) : 0;
      slope[i] = Number.isFinite(dzde) && Number.isFinite(dzdn) ? (Math.atan(Math.hypot(dzde, dzdn)) * 180) / Math.PI : NaN;

      const pts: [number, number, number][] = [];
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= height || cc >= width) continue;
        pts.push([dc * de, -dr * dn, z(rr, cc)]);
      }
      if (pts.some((p) => !Number.isFinite(p[2]))) roughness[i] = NaN;
      else {
        const n = pts.length;
        let mx = 0, my = 0, mz = 0;
        for (const p of pts) { mx += p[0]; my += p[1]; mz += p[2]; }
        mx /= n; my /= n; mz /= n;
        let sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0;
        for (const [x, y, zz] of pts) {
          const dx = x - mx, dy = y - my, dz = zz - mz;
          sxx += dx * dx; syy += dy * dy; sxy += dx * dy; sxz += dx * dz; syz += dy * dz;
        }
        let a = 0, b = 0;
        const det = sxx * syy - sxy * sxy;
        if (det > 1e-12) { a = (sxz * syy - syz * sxy) / det; b = (syz * sxx - sxz * sxy) / det; }
        else if (sxx > 1e-12) a = sxz / sxx; // single row: line fit along east
        else if (syy > 1e-12) b = syz / syy; // single column: line fit along north
        let ss = 0;
        for (const [x, y, zz] of pts) { const res = zz - mz - a * (x - mx) - b * (y - my); ss += res * res; }
        roughness[i] = Math.sqrt(ss / n);
      }
      if (exclusion[i] === EXCLUSION.NONE && (!Number.isFinite(slope[i]!) || !Number.isFinite(roughness[i]!)))
        exclusion[i] = EXCLUSION.UNSUPPORTED_DERIVATIVE;
    }
  }
  return { slope, roughness };
}
