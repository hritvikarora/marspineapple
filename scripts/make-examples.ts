/**
 * `npm run examples` — regenerates docs/examples/*.json from the synthetic fixture with the CURRENT
 * engine (src/routing). Run after any change to the solver or the contracts. OWNER: Role C.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RegionManifest, RouteRequest } from '../src/contracts';
import { stableStringify } from '../src/export/serialize';
import { MODEL_VERSION, solveRoute } from '../src/routing';

const root = join(import.meta.dirname, '..');
const dir = join(root, 'public', 'bundles', 'synthetic-v0');
const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as RegionManifest;
const f32 = (n: string) => new Float32Array(new Uint8Array(readFileSync(join(dir, n))).buffer);
const u8 = (n: string) => new Uint8Array(readFileSync(join(dir, n)));
const grid = {
  manifest, bundleVersion: manifest.bundleVersion,
  elevation: f32('elevation.f32'), slope: f32('slope.f32'), roughness: f32('roughness.f32'), quality: u8('quality.u8'), exclusion: u8('exclusion.u8'),
};
const poi = (id: string) => manifest.pointsOfInterest.find((p) => p.id === id)!.position;
const base = { bundleVersion: manifest.bundleVersion, modelVersion: MODEL_VERSION, policies: ['shortest-feasible', 'uncertainty-aware'], strictQuality: false, roundTrip: false } as const;
const req = (requestId: string, dest: string, over: Partial<RouteRequest> = {}): RouteRequest =>
  ({ ...base, policies: [...base.policies], requestId, start: poi('syn-outpost'), destination: poi(dest), ...over });

const out = join(root, 'docs', 'examples');
const write = (name: string, v: unknown) => writeFileSync(join(out, name), stableStringify(v));
const r1 = req('req-1-abc123', 'syn-east-bench');
write('route-request.json', r1);
write('route-response.success.json', solveRoute(grid, r1, { now: () => 0 }));
write('route-response.no-path.json', solveRoute(grid, req('req-2-def456', 'syn-sealed-basin')));
write('route-response.invalid-input.json', solveRoute(grid, req('req-3-ghi789', 'syn-unknown-knoll', { strictQuality: true })));
console.log(`wrote docs/examples with ${MODEL_VERSION}`);
