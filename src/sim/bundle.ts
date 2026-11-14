/**
 * Builds a valid, in-memory region bundle (manifest + raw little-endian layer bytes with real
 * SHA-256) from a terrain spec. OWNER: Role C. Dev/test only — never imported by the app.
 */
import {
  EXCLUSION,
  QUALITY,
  SUPPORTED_SCHEMA,
  type GridBundle,
  type LocalPoint,
  type RegionManifest,
} from '../contracts';
import { deriveSlopeRoughness } from './derive';

/** Marker embedded in every simulated manifest; the release audit asserts it never ships in dist/. */
export const SIM_MARKER = 'mars-pathfinder/sim@1';
export const SIM_ORIGIN = 'http://sim.local';

export interface TerrainSpec {
  id: string;
  title: string;
  description: string;
  seed: number;
  width: number;
  height: number;
  cellSizeEast_m: number;
  cellSizeNorth_m: number;
  /** NaN = missing elevation (auto: quality 0, exclusion 1, neighbours exclusion 2). */
  elevation: Float32Array;
  /** Default: GOOD where elevation is finite. */
  quality?: Uint8Array;
  /** Pre-set exclusions (e.g. EXCLUSION.MANUAL). Missing/derivative exclusions are added automatically. */
  exclusion?: Uint8Array;
  strictQualitySupported?: boolean;
  parameters?: Record<string, string | number | boolean>;
  pointsOfInterest?: { id: string; name: string; position: LocalPoint }[];
}

export interface SimBundle {
  bundle: GridBundle;
  /** Served files keyed by file name (manifest.json + layers), for fetch-level pipeline tests. */
  files: Record<string, Uint8Array>;
  manifestUrl: string;
}

const enc = new TextEncoder();

async function sha256(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

const asBytes = (a: Float32Array | Uint8Array) => new Uint8Array(a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength));

export async function buildSimBundle(spec: TerrainSpec): Promise<SimBundle> {
  const { width: W, height: H } = spec;
  const N = W * H;
  if (spec.elevation.length !== N) throw new Error(`${spec.id}: elevation has ${spec.elevation.length} cells, expected ${N}`);
  const elevation = spec.elevation;
  const exclusion = spec.exclusion ? spec.exclusion.slice() : new Uint8Array(N);
  const quality = spec.quality ? spec.quality.slice() : new Uint8Array(N).fill(QUALITY.GOOD);
  for (let i = 0; i < N; i++) {
    if (!Number.isFinite(elevation[i]!)) {
      quality[i] = QUALITY.NO_ELEVATION;
      exclusion[i] = EXCLUSION.MISSING_ELEVATION;
    }
  }
  const { slope, roughness } = deriveSlopeRoughness(elevation, W, H, spec.cellSizeEast_m, spec.cellSizeNorth_m, exclusion);

  const layers = { elevation, slope, roughness, quality, exclusion };
  const files: Record<string, Uint8Array> = {
    'elevation.f32': asBytes(elevation),
    'slope.f32': asBytes(slope),
    'roughness.f32': asBytes(roughness),
    'quality.u8': asBytes(quality),
    'exclusion.u8': asBytes(exclusion),
  };
  const desc = async (file: string, dtype: 'float32' | 'uint8', units: string, nodata: 'NaN' | number | null, definition: string) => ({
    file, dtype, byteOrder: 'little-endian' as const, units, nodata, definition,
    byteLength: files[file]!.byteLength, sha256: await sha256(files[file]!),
  });
  const bundleId = `sim-${spec.id}`;
  const bundleVersion = `sim-${spec.id}-s${spec.seed}`;
  const manifest: RegionManifest = {
    schema: SUPPORTED_SCHEMA,
    schemaVersion: '1.0',
    bundleId,
    bundleVersion,
    datasetVersion: `${SIM_MARKER}:${spec.id}:${spec.seed}`,
    synthetic: true,
    title: `SIMULATION ${spec.title} - not Mars data`,
    description: spec.description,
    createdDate: '2026-11-14',
    crs: {
      description: 'Synthetic local planar frame (simulation)', body: 'synthetic', sourceCrs: null, localOriginInSource: null,
      verticalReference: 'synthetic datum', horizontalUnits: 'm', verticalUnits: 'm',
    },
    grid: {
      width: W, height: H, cellSizeEast_m: spec.cellSizeEast_m, cellSizeNorth_m: spec.cellSizeNorth_m,
      extent: { west_m: 0, east_m: W * spec.cellSizeEast_m, south_m: 0, north_m: H * spec.cellSizeNorth_m },
      orientation: 'north-up', order: 'row-major', sampleConvention: 'cell-center',
    },
    layers: {
      elevation: await desc('elevation.f32', 'float32', 'm', 'NaN', 'Simulated surface (src/sim/scenarios.ts).'),
      slope: await desc('slope.f32', 'float32', 'deg', 'NaN', 'atan(|grad z|), central differences over 2 cells (one-sided at outer edge).'),
      roughness: await desc('roughness.f32', 'float32', 'm', 'NaN', 'RMS residual after least-squares plane removal over 3x3 cells.'),
      quality: await desc('quality.u8', 'uint8', 'class-code', 0, '0 no elevation, 1 good, 2 low, 3 unknown (simulated).'),
      exclusion: await desc('exclusion.u8', 'uint8', 'class-code', null, '0 none, 1 missing elevation, 2 unsupported derivative, 3 outside extent, 4 manual.'),
    },
    qualityClasses: spec.strictQualitySupported === false ? [] : [
      { code: 0, key: 'no-elevation', label: 'No elevation', sourceCategories: ['sim:nodata'] },
      { code: 1, key: 'good', label: 'Documented good quality', sourceCategories: ['sim:good'] },
      { code: 2, key: 'low', label: 'Documented low quality', sourceCategories: ['sim:low'] },
      { code: 3, key: 'unknown', label: 'Unknown quality', sourceCategories: ['sim:unknown'] },
    ],
    strictQualitySupported: spec.strictQualitySupported !== false,
    pointsOfInterest: (spec.pointsOfInterest ?? []).map((p) => ({
      id: p.id, name: p.name, kind: 'test' as const, position: p.position, purpose: 'Simulation endpoint',
      officialName: false, positionalUncertainty_m: null, sourceIds: ['sim-generator'], synthetic: true,
    })),
    displayAssets: [],
    sources: [{ id: 'sim-generator', mission: 'none', instrument: 'none', title: 'src/sim', creator: 'MARS PATHFINDER team', url: '', version: '1', rights: 'Team-generated synthetic data', usedFor: 'Automated simulation tests only' }],
    limitations: ['SIMULATION: generated terrain, not derived from any NASA observation.'],
    processing: { script: SIM_MARKER, parameters: { seed: spec.seed, width: W, height: H, ...(spec.parameters ?? {}) } },
  };
  files['manifest.json'] = enc.encode(JSON.stringify(manifest, null, 2) + '\n');
  const manifestUrl = `${SIM_ORIGIN}/bundles/${bundleId}/manifest.json`;
  return {
    manifestUrl,
    files,
    bundle: { manifest, bundleVersion, width: W, height: H, manifestUrl, hashesVerified: true, ...layers },
  };
}

/** A fetch() serving one or more simulated bundles (plus optional per-URL overrides for fault injection). */
export function simFetch(bundles: SimBundle[], override?: (url: string, body: Uint8Array | undefined) => Response | undefined): typeof fetch {
  const table = new Map<string, Uint8Array>();
  for (const b of bundles) {
    const dir = b.manifestUrl.slice(0, b.manifestUrl.lastIndexOf('/') + 1);
    for (const [name, bytes] of Object.entries(b.files)) table.set(dir + name, bytes);
  }
  return (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    const body = table.get(url);
    const o = override?.(url, body);
    if (o) return o;
    return body ? new Response(body.slice(), { status: 200 }) : new Response('not found', { status: 404 });
  }) as typeof fetch;
}
