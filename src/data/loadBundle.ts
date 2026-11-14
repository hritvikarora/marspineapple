/**
 * loadAndValidateBundle: the ONLY way the app reads a region bundle. OWNER: Role C.
 * Fails loudly with a stage-specific BundleLoadError instead of producing an empty map.
 */
import {
  REQUIRED_LAYERS,
  SUPPORTED_SCHEMA,
  SUPPORTED_SCHEMA_MAJOR,
  bytesPerElement,
  type GridBundle,
  type RasterLayerDescriptor,
  type RasterLayerId,
  type RegionManifest,
} from '../contracts';

export type BundleLoadStage =
  | 'fetch-manifest'
  | 'parse-manifest'
  | 'schema'
  | 'version'
  | 'fetch-raster'
  | 'byte-length'
  | 'dimensions'
  | 'hash';

export class BundleLoadError extends Error {
  readonly stage: BundleLoadStage;
  readonly layer: RasterLayerId | null;
  readonly url: string;
  constructor(stage: BundleLoadStage, message: string, url: string, layer: RasterLayerId | null = null) {
    super(`[${stage}${layer ? `:${layer}` : ''}] ${message}`);
    this.name = 'BundleLoadError';
    this.stage = stage;
    this.layer = layer;
    this.url = url;
  }
}

export interface LoadOptions {
  fetchImpl?: typeof fetch;
  /** Default true. Skipped (hashesVerified=false) when SubtleCrypto is unavailable. */
  verifyHashes?: boolean;
  /** Abort after this many ms per request. Default 15000. */
  timeoutMs?: number;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Structural validation; returns a list of problems (empty = valid). */
export function validateManifestShape(m: unknown): string[] {
  const errs: string[] = [];
  if (!isObj(m)) return ['manifest is not an object'];
  const str = (o: Obj, k: string, p: string) => {
    if (typeof o[k] !== 'string' || (o[k] as string).length === 0) errs.push(`${p}${k} must be a non-empty string`);
  };
  const num = (o: Obj, k: string, p: string, positive = false) => {
    const v = o[k];
    if (typeof v !== 'number' || !Number.isFinite(v) || (positive && v <= 0)) errs.push(`${p}${k} must be a ${positive ? 'positive ' : ''}finite number`);
  };
  for (const k of ['schema', 'schemaVersion', 'bundleId', 'bundleVersion', 'datasetVersion', 'title', 'createdDate']) str(m, k, '');
  if (typeof m.synthetic !== 'boolean') errs.push('synthetic must be boolean');
  if (typeof m.strictQualitySupported !== 'boolean') errs.push('strictQualitySupported must be boolean');

  const g = m.grid;
  if (!isObj(g)) errs.push('grid missing');
  else {
    for (const k of ['width', 'height']) {
      const v = g[k];
      if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) errs.push(`grid.${k} must be a positive integer`);
    }
    num(g, 'cellSizeEast_m', 'grid.', true);
    num(g, 'cellSizeNorth_m', 'grid.', true);
    if (g.orientation !== 'north-up') errs.push('grid.orientation must be "north-up"');
    if (g.order !== 'row-major') errs.push('grid.order must be "row-major"');
    if (g.sampleConvention !== 'cell-center') errs.push('grid.sampleConvention must be "cell-center"');
    const e = g.extent;
    if (!isObj(e)) errs.push('grid.extent missing');
    else {
      for (const k of ['west_m', 'east_m', 'south_m', 'north_m']) num(e, k, 'grid.extent.');
      if (errs.length === 0 && typeof g.width === 'number' && typeof g.cellSizeEast_m === 'number') {
        const w = (e.east_m as number) - (e.west_m as number);
        const h = (e.north_m as number) - (e.south_m as number);
        if (Math.abs(w - g.width * g.cellSizeEast_m) > 1e-6 * Math.max(1, Math.abs(w)))
          errs.push('grid.extent width != width * cellSizeEast_m');
        if (Math.abs(h - (g.height as number) * (g.cellSizeNorth_m as number)) > 1e-6 * Math.max(1, Math.abs(h)))
          errs.push('grid.extent height != height * cellSizeNorth_m');
      }
    }
  }

  const crs = m.crs;
  if (!isObj(crs)) errs.push('crs missing');
  else {
    if (crs.horizontalUnits !== 'm') errs.push('crs.horizontalUnits must be "m"');
    if (crs.verticalUnits !== 'm') errs.push('crs.verticalUnits must be "m"');
    str(crs, 'verticalReference', 'crs.');
  }

  const layers = m.layers;
  if (!isObj(layers)) errs.push('layers missing');
  else {
    for (const id of REQUIRED_LAYERS) {
      const l = layers[id];
      if (!isObj(l)) { errs.push(`layers.${id} missing`); continue; }
      str(l, 'file', `layers.${id}.`);
      str(l, 'units', `layers.${id}.`);
      str(l, 'sha256', `layers.${id}.`);
      if (l.dtype !== 'float32' && l.dtype !== 'uint8') errs.push(`layers.${id}.dtype must be float32|uint8`);
      if (l.byteOrder !== 'little-endian') errs.push(`layers.${id}.byteOrder must be little-endian`);
      if (typeof l.byteLength !== 'number' || !Number.isInteger(l.byteLength) || l.byteLength < 0)
        errs.push(`layers.${id}.byteLength must be a non-negative integer`);
      if (typeof l.file === 'string' && (/^[a-z]+:/i.test(l.file) || l.file.startsWith('/') || l.file.includes('..')))
        errs.push(`layers.${id}.file must be a plain relative file name`);
    }
    const expectDtype: Record<RasterLayerId, string> = { elevation: 'float32', slope: 'float32', roughness: 'float32', quality: 'uint8', exclusion: 'uint8' };
    for (const id of REQUIRED_LAYERS) {
      const l = layers[id];
      if (isObj(l) && l.dtype !== expectDtype[id]) errs.push(`layers.${id}.dtype must be ${expectDtype[id]}`);
    }
  }

  for (const k of ['qualityClasses', 'pointsOfInterest', 'displayAssets', 'sources', 'limitations']) {
    if (!Array.isArray(m[k])) errs.push(`${k} must be an array`);
  }
  if (Array.isArray(m.pointsOfInterest)) {
    m.pointsOfInterest.forEach((p: unknown, i: number) => {
      if (!isObj(p)) { errs.push(`pointsOfInterest[${i}] not an object`); return; }
      str(p, 'id', `pointsOfInterest[${i}].`);
      str(p, 'name', `pointsOfInterest[${i}].`);
      if (!isObj(p.position)) errs.push(`pointsOfInterest[${i}].position missing`);
      else { num(p.position, 'east_m', `pointsOfInterest[${i}].position.`); num(p.position, 'north_m', `pointsOfInterest[${i}].position.`); }
    });
  }
  return errs;
}

export function checkSchemaVersion(m: Pick<RegionManifest, 'schema' | 'schemaVersion'>): string | null {
  if (m.schema !== SUPPORTED_SCHEMA) return `schema "${m.schema}" is not "${SUPPORTED_SCHEMA}"`;
  const major = Number.parseInt(String(m.schemaVersion).split('.')[0] ?? '', 10);
  if (major !== SUPPORTED_SCHEMA_MAJOR) return `schemaVersion ${m.schemaVersion} unsupported (app supports ${SUPPORTED_SCHEMA_MAJOR}.x)`;
  return null;
}

export async function sha256Hex(buf: ArrayBuffer): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const digest = await subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function fetchWithTimeout(f: typeof fetch, url: string, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await f(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function resolveUrl(rel: string, base: string): string {
  const docBase = typeof document !== 'undefined' ? document.baseURI : 'http://localhost/';
  return new URL(rel, new URL(base, docBase)).toString();
}

export async function loadAndValidateBundle(manifestUrl: string, opts: LoadOptions = {}): Promise<GridBundle> {
  const f = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = opts.timeoutMs ?? 15000;
  const manifestAbs = resolveUrl(manifestUrl, typeof document !== 'undefined' ? document.baseURI : 'http://localhost/');

  let res: Response;
  try {
    res = await fetchWithTimeout(f, manifestAbs, timeoutMs);
  } catch (e) {
    throw new BundleLoadError('fetch-manifest', `network error: ${(e as Error).message}`, manifestAbs);
  }
  if (!res.ok) throw new BundleLoadError('fetch-manifest', `HTTP ${res.status}`, manifestAbs);

  let raw: unknown;
  try {
    raw = await res.json();
  } catch (e) {
    throw new BundleLoadError('parse-manifest', `invalid JSON: ${(e as Error).message}`, manifestAbs);
  }
  if (isObj(raw) && typeof raw.schema === 'string' && typeof raw.schemaVersion === 'string') {
    const v = checkSchemaVersion(raw as unknown as RegionManifest);
    if (v) throw new BundleLoadError('version', v, manifestAbs);
  }
  const problems = validateManifestShape(raw);
  if (problems.length) throw new BundleLoadError('schema', problems.join('; '), manifestAbs);
  const manifest = raw as RegionManifest;
  const { width, height } = manifest.grid;
  const cells = width * height;

  const doHash = opts.verifyHashes !== false && !!globalThis.crypto?.subtle;
  const buffers = {} as Record<RasterLayerId, ArrayBuffer>;

  await Promise.all(
    REQUIRED_LAYERS.map(async (id) => {
      const d: RasterLayerDescriptor = manifest.layers[id];
      const url = resolveUrl(d.file, manifestAbs);
      let r: Response;
      try {
        r = await fetchWithTimeout(f, url, timeoutMs);
      } catch (e) {
        throw new BundleLoadError('fetch-raster', `network error: ${(e as Error).message}`, url, id);
      }
      if (!r.ok) throw new BundleLoadError('fetch-raster', `HTTP ${r.status}`, url, id);
      const buf = await r.arrayBuffer();
      if (buf.byteLength !== d.byteLength)
        throw new BundleLoadError('byte-length', `got ${buf.byteLength} B, manifest says ${d.byteLength} B`, url, id);
      const expected = cells * bytesPerElement(d.dtype);
      if (buf.byteLength !== expected)
        throw new BundleLoadError('dimensions', `${buf.byteLength} B != ${width}x${height}x${bytesPerElement(d.dtype)} B`, url, id);
      if (doHash) {
        const h = await sha256Hex(buf);
        if (h !== null && h !== d.sha256.toLowerCase())
          throw new BundleLoadError('hash', `sha256 ${h.slice(0, 12)}… != manifest ${d.sha256.slice(0, 12)}…`, url, id);
      }
      buffers[id] = buf;
    }),
  );

  return {
    manifest,
    bundleVersion: manifest.bundleVersion,
    manifestUrl: manifestAbs,
    width,
    height,
    // Float32Array over a fetched buffer uses platform endianness; all target browsers are little-endian.
    elevation: new Float32Array(buffers.elevation),
    slope: new Float32Array(buffers.slope),
    roughness: new Float32Array(buffers.roughness),
    quality: new Uint8Array(buffers.quality),
    exclusion: new Uint8Array(buffers.exclusion),
    hashesVerified: doHash,
  };
}
