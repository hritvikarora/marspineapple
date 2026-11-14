#!/usr/bin/env node
/**
 * Generates the SYNTHETIC development bundle public/bundles/synthetic-v0.
 * Deterministic: same script => byte-identical files and hashes. NOT Mars data.
 *
 * Layout (20 cols x 12 rows, 10 m cells, local frame: SW corner = (0,0)):
 *   - Base plane: elevation = -2600 + 1.0*col - 0.5*row  (negative heights are valid on Mars)
 *     => NW corner -2600.0, NE corner -2581.0, SW corner -2605.5, SE corner -2586.5
 *   - Ridge: column 10, +40 m, with two single-cell gaps: row 2 (north gap) and row 9 (south gap).
 *   - North gap corridor (rows 0-3, cols 8-13) has UNKNOWN quality.
 *   - Low-quality strip rows 10-11, cols 6-9.
 *   - Rough patch rows 6-9, cols 4-7: +/-1 m checkerboard (high roughness, ~zero slope).
 *   - Missing elevation (NaN) rows 0-1, cols 16-17 -> exclusion 1; neighbours -> exclusion 2.
 *   - Manual exclusion at (row 6, col 13) -> exclusion 4.
 *   - Sealed basin: walls row 8 cols 14-19 and col 14 rows 8-11 (+40 m); interior unreachable.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'bundles', 'synthetic-v0');
mkdirSync(outDir, { recursive: true });

const W = 20, H = 12, DE = 10, DN = 10;
const N = W * H;
const idx = (r, c) => r * W + c;

const elevation = new Float32Array(N);
const quality = new Uint8Array(N);
const exclusion = new Uint8Array(N);

for (let r = 0; r < H; r++) {
  for (let c = 0; c < W; c++) {
    let z = -2600 + 1.0 * c - 0.5 * r;
    if (c === 10 && r !== 2 && r !== 9) z += 40; // ridge with gaps
    if ((r === 8 && c >= 14) || (c === 14 && r >= 8)) z += 40; // sealed basin walls
    if (r >= 6 && r <= 9 && c >= 4 && c <= 7) z += (r + c) % 2 === 0 ? 1 : -1; // rough patch
    elevation[idx(r, c)] = z;
    quality[idx(r, c)] = 1; // GOOD
  }
}
for (let r = 0; r <= 3; r++) for (let c = 8; c <= 13; c++) quality[idx(r, c)] = 3; // UNKNOWN
for (let r = 10; r <= 11; r++) for (let c = 6; c <= 9; c++) quality[idx(r, c)] = 2; // LOW
for (let r = 0; r <= 1; r++) for (let c = 16; c <= 17; c++) {
  elevation[idx(r, c)] = Number.NaN;
  quality[idx(r, c)] = 0;
  exclusion[idx(r, c)] = 1;
}

const z = (r, c) => elevation[idx(r, c)];
const slope = new Float32Array(N);
const roughness = new Float32Array(N);
for (let r = 0; r < H; r++) {
  for (let c = 0; c < W; c++) {
    const i = idx(r, c);
    if (!Number.isFinite(z(r, c))) { slope[i] = NaN; roughness[i] = NaN; continue; }
    // Slope: central differences, one-sided at the outer edge. north axis: row decreases northwards.
    const cw = Math.max(0, c - 1), ce = Math.min(W - 1, c + 1);
    const rn = Math.max(0, r - 1), rs = Math.min(H - 1, r + 1);
    const dzde = (z(r, ce) - z(r, cw)) / ((ce - cw) * DE);
    const dzdn = (z(rn, c) - z(rs, c)) / ((rs - rn) * DN);
    slope[i] = Number.isFinite(dzde) && Number.isFinite(dzdn)
      ? (Math.atan(Math.hypot(dzde, dzdn)) * 180) / Math.PI
      : NaN;
    // Roughness: RMS residual after removing a least-squares plane over the available 3x3 window.
    const pts = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= H || cc >= W) continue;
      pts.push([dc * DE, -dr * DN, z(rr, cc)]);
    }
    if (pts.some((p) => !Number.isFinite(p[2]))) { roughness[i] = NaN; }
    else {
      const n = pts.length;
      const mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
      const mz = pts.reduce((s, p) => s + p[2], 0) / n;
      let sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0;
      for (const [x, y, zz] of pts) {
        const dx = x - mx, dy = y - my, dz = zz - mz;
        sxx += dx * dx; syy += dy * dy; sxy += dx * dy; sxz += dx * dz; syz += dy * dz;
      }
      const det = sxx * syy - sxy * sxy;
      const a = (sxz * syy - syz * sxy) / det, b = (syz * sxx - sxz * sxy) / det;
      let ss = 0;
      for (const [x, y, zz] of pts) { const res = zz - mz - a * (x - mx) - b * (y - my); ss += res * res; }
      roughness[i] = Math.sqrt(ss / n);
    }
    if (exclusion[i] === 0 && (!Number.isFinite(slope[i]) || !Number.isFinite(roughness[i]))) exclusion[i] = 2;
  }
}
exclusion[idx(6, 13)] = 4;

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const write = (name, arr) => {
  const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
  writeFileSync(join(outDir, name), buf);
  return { byteLength: buf.byteLength, sha256: sha(buf) };
};
const files = {
  elevation: write('elevation.f32', elevation),
  slope: write('slope.f32', slope),
  roughness: write('roughness.f32', roughness),
  quality: write('quality.u8', quality),
  exclusion: write('exclusion.u8', exclusion),
};

// Optional display texture (SVG, display-only; NOT analytical, so bundleVersion is unchanged).
const svgCells = [];
for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
  const v = Number.isFinite(elevation[idx(r, c)]) ? Math.round(80 + 6 * (elevation[idx(r, c)] + 2606) / 1.2) : 0;
  const g = Math.max(0, Math.min(255, v));
  svgCells.push(`<rect x="${c}" y="${r}" width="1" height="1" fill="rgb(${g},${Math.round(g * 0.7)},${Math.round(g * 0.5)})"/>`);
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * 8}" height="${H * 8}" shape-rendering="crispEdges">${svgCells.join('')}<text x="0.5" y="${H - 0.5}" font-size="1.2" fill="#fff">SYNTHETIC</text></svg>\n`;
const texture = Buffer.from(svg, 'utf8');
writeFileSync(join(outDir, 'texture.svg'), texture);

const center = (r, c) => ({ east_m: (c + 0.5) * DE, north_m: H * DN - (r + 0.5) * DN });
const poi = (id, name, kind, r, c, purpose) => ({
  id, name, kind, position: center(r, c), purpose,
  officialName: false, positionalUncertainty_m: null, sourceIds: ['synthetic-generator'], synthetic: true,
});

const manifest = {
  schema: 'mars-pathfinder/region-bundle',
  schemaVersion: '1.0',
  bundleId: 'synthetic-v0',
  bundleVersion: 'synthetic-v0.1.0',
  datasetVersion: 'synthetic-fixture-2026-11-14',
  synthetic: true,
  title: 'SYNTHETIC FIXTURE - not Mars data',
  description:
    'Hand-inspectable 20x12 synthetic grid for development and automated tests. Contains a ridge with two gaps, an unknown-quality corridor, a low-quality strip, a rough patch, a missing-elevation hole, a manual exclusion and a sealed basin.',
  createdDate: '2026-11-14',
  crs: {
    description: 'Synthetic local planar frame (no planetary CRS)',
    body: 'synthetic',
    sourceCrs: null,
    localOriginInSource: null,
    verticalReference: 'synthetic datum (values mimic Jezero-like negative heights)',
    horizontalUnits: 'm',
    verticalUnits: 'm',
  },
  grid: {
    width: W, height: H, cellSizeEast_m: DE, cellSizeNorth_m: DN,
    extent: { west_m: 0, east_m: W * DE, south_m: 0, north_m: H * DN },
    orientation: 'north-up', order: 'row-major', sampleConvention: 'cell-center',
  },
  layers: {
    elevation: { file: 'elevation.f32', dtype: 'float32', byteOrder: 'little-endian', units: 'm', nodata: 'NaN', definition: 'Synthetic analytic surface (see scripts/make-fixture.mjs).', ...files.elevation },
    slope: { file: 'slope.f32', dtype: 'float32', byteOrder: 'little-endian', units: 'deg', nodata: 'NaN', definition: 'atan(|grad z|), central differences over 2 cells (one-sided at outer edge).', ...files.slope },
    roughness: { file: 'roughness.f32', dtype: 'float32', byteOrder: 'little-endian', units: 'm', nodata: 'NaN', definition: 'RMS residual after least-squares plane removal over 3x3 cells (30 m x 30 m).', ...files.roughness },
    quality: { file: 'quality.u8', dtype: 'uint8', byteOrder: 'little-endian', units: 'class-code', nodata: 0, definition: '0 no elevation, 1 good, 2 low, 3 unknown (synthetic assignment).', ...files.quality },
    exclusion: { file: 'exclusion.u8', dtype: 'uint8', byteOrder: 'little-endian', units: 'class-code', nodata: null, definition: '0 none, 1 missing elevation, 2 unsupported derivative neighbourhood, 3 outside extent, 4 manual.', ...files.exclusion },
  },
  qualityClasses: [
    { code: 0, key: 'no-elevation', label: 'No elevation', sourceCategories: ['synthetic:nodata'] },
    { code: 1, key: 'good', label: 'Documented good quality', sourceCategories: ['synthetic:good'] },
    { code: 2, key: 'low', label: 'Documented low quality', sourceCategories: ['synthetic:low'] },
    { code: 3, key: 'unknown', label: 'Unknown quality', sourceCategories: ['synthetic:unknown'] },
  ],
  strictQualitySupported: true,
  pointsOfInterest: [
    poi('syn-outpost', 'Synthetic outpost', 'outpost', 5, 2, 'Start point for the synthetic fixture.'),
    poi('syn-east-bench', 'East bench (synthetic)', 'science-stop', 5, 17, 'Destination across the ridge; exposes the north-gap vs south-gap tradeoff.'),
    poi('syn-sealed-basin', 'Sealed basin (synthetic no-path test)', 'test', 10, 17, 'Enclosed by walls; every policy must return no-path.'),
    poi('syn-unknown-knoll', 'Unknown-quality knoll (synthetic)', 'test', 1, 12, 'Inside unknown-quality area; strict mode must reject this endpoint.'),
  ],
  displayAssets: [
    { id: 'synthetic-texture', file: 'texture.svg', kind: 'texture', optional: true, byteLength: texture.byteLength, sha256: sha(texture), extent: { west_m: 0, east_m: W * DE, south_m: 0, north_m: H * DN }, sourceIds: ['synthetic-generator'] },
  ],
  sources: [
    { id: 'synthetic-generator', mission: 'none', instrument: 'none', title: 'scripts/make-fixture.mjs', creator: 'MARS PATHFINDER team', url: '', version: '0.1.0', rights: 'Team-generated synthetic data', usedFor: 'Development and automated tests only' },
  ],
  limitations: [
    'SYNTHETIC: this grid is not derived from any NASA observation.',
    'Quality classes are artificially assigned to exercise uncertainty-aware routing.',
  ],
  processing: { script: 'scripts/make-fixture.mjs', parameters: { width: W, height: H, cellSize_m: DE, ridgeHeight_m: 40 } },
};

writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

// Human-readable dump for hand inspection.
const lines = [`SYNTHETIC FIXTURE ${manifest.bundleVersion} (${W}x${H}, row 0 = north)`, ''];
const dump = (title, fmt) => {
  lines.push(`== ${title} ==`);
  for (let r = 0; r < H; r++) {
    const row = [];
    for (let c = 0; c < W; c++) row.push(fmt(idx(r, c)));
    lines.push(`r${String(r).padStart(2, '0')} ${row.join(' ')}`);
  }
  lines.push('');
};
dump('elevation +2600 (m)', (i) => (Number.isFinite(elevation[i]) ? (elevation[i] + 2600).toFixed(1).padStart(6) : '   NaN'));
dump('slope (deg)', (i) => (Number.isFinite(slope[i]) ? slope[i].toFixed(0).padStart(3) : 'NaN'));
dump('roughness (m)', (i) => (Number.isFinite(roughness[i]) ? roughness[i].toFixed(2).padStart(4) : ' NaN'));
dump('quality (0 none,1 good,2 low,3 unknown)', (i) => String(quality[i]));
dump('exclusion (0 ok,1 noelev,2 deriv,4 manual)', (i) => String(exclusion[i]));
writeFileSync(join(outDir, 'INSPECT.txt'), lines.join('\n'));

console.log(`wrote ${outDir}`);
for (const [k, v] of Object.entries(files)) console.log(`  ${k}: ${v.byteLength} B sha256=${v.sha256.slice(0, 16)}…`);
