#!/usr/bin/env node
/**
 * Offline bundle validator for Role A (no GIS tools needed):
 *   node scripts/validate-bundle.mjs public/bundles/<bundle-dir>
 * Checks schema id/major, required layers, dtype, byte lengths vs grid, SHA-256, finite/NaN summary.
 * Mirrors the runtime checks in src/data/loadBundle.ts (the runtime loader is authoritative).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? 'public/bundles/synthetic-v0';
const errors = [];
const fail = (m) => errors.push(m);
let manifest;
try {
  manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
} catch (e) {
  console.error(`FAIL [fetch/parse-manifest] ${e.message}`);
  process.exit(1);
}
if (manifest.schema !== 'mars-pathfinder/region-bundle') fail(`[version] schema ${manifest.schema}`);
if (String(manifest.schemaVersion).split('.')[0] !== '1') fail(`[version] schemaVersion ${manifest.schemaVersion} (need 1.x)`);
const g = manifest.grid ?? {};
for (const [k, v] of Object.entries({ orientation: 'north-up', order: 'row-major', sampleConvention: 'cell-center' }))
  if (g[k] !== v) fail(`[schema] grid.${k} must be ${v}`);
const cells = g.width * g.height;
if (!Number.isInteger(cells) || cells <= 0) fail('[schema] grid.width/height invalid');
const expect = { elevation: 'float32', slope: 'float32', roughness: 'float32', quality: 'uint8', exclusion: 'uint8' };
for (const [id, dtype] of Object.entries(expect)) {
  const l = manifest.layers?.[id];
  if (!l) { fail(`[schema] layers.${id} missing`); continue; }
  if (l.dtype !== dtype) fail(`[schema] layers.${id}.dtype ${l.dtype} != ${dtype}`);
  const p = join(dir, l.file);
  if (!existsSync(p)) { fail(`[fetch-raster] ${id}: ${l.file} missing`); continue; }
  const buf = readFileSync(p);
  if (buf.byteLength !== l.byteLength) fail(`[byte-length] ${id}: ${buf.byteLength} != manifest ${l.byteLength}`);
  const bpe = dtype === 'float32' ? 4 : 1;
  if (buf.byteLength !== cells * bpe) fail(`[dimensions] ${id}: ${buf.byteLength} != ${g.width}x${g.height}x${bpe}`);
  const h = createHash('sha256').update(buf).digest('hex');
  if (h !== l.sha256) fail(`[hash] ${id}: ${h.slice(0, 12)}… != ${String(l.sha256).slice(0, 12)}…`);
  if (dtype === 'float32' && buf.byteLength === cells * 4) {
    const a = new Float32Array(buf.buffer, buf.byteOffset, cells);
    let nan = 0, lo = Infinity, hi = -Infinity;
    for (const v of a) { if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } else nan++; }
    console.log(`  ${id.padEnd(10)} ${l.units.padEnd(4)} min ${lo.toFixed(2)} max ${hi.toFixed(2)} non-finite ${nan}/${cells}`);
  } else if (buf.byteLength === cells) {
    const counts = {};
    for (const v of buf) counts[v] = (counts[v] ?? 0) + 1;
    console.log(`  ${id.padEnd(10)} codes ${JSON.stringify(counts)}`);
  }
}
for (const p of manifest.pointsOfInterest ?? []) {
  const { east_m: e, north_m: n } = p.position ?? {};
  const x = g.extent ?? {};
  if (!(e >= x.west_m && e < x.east_m && n > x.south_m && n <= x.north_m)) fail(`[schema] POI ${p.id} outside extent`);
}
console.log(`${manifest.bundleVersion} (${manifest.synthetic ? 'SYNTHETIC' : 'real'}) ${g.width}x${g.height} @ ${g.cellSizeEast_m}x${g.cellSizeNorth_m} m`);
if (errors.length) {
  for (const e of errors) console.error(`FAIL ${e}`);
  process.exit(1);
}
console.log('VALID');
