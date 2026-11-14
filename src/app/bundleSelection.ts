/**
 * Decides WHICH region bundle the app loads. OWNER: Role C.
 * Role A swaps the real bundle in by editing public/bundles/index.json `release` (no code change).
 */
import { BUNDLE_INDEX_URL, BUNDLE_OVERRIDE, IS_PRODUCTION_BUILD } from '../config';
import { BundleLoadError } from '../data/loadBundle';

export interface BundleIndex {
  /** Bundle id served by production builds. */
  release: string;
  /** Bundle id served by the dev server and tests. */
  dev: string;
  bundles: { id: string; synthetic: boolean; description: string }[];
}

export interface BundleSelection {
  manifestUrl: string;
  bundleId: string | null;
  source: 'env-manifest' | 'env-bundle' | 'index-release' | 'index-dev';
}

const ID = /^[A-Za-z0-9._-]+$/;
export const manifestUrlFor = (id: string) => `bundles/${id}/manifest.json`;

export interface SelectOptions {
  production?: boolean;
  override?: { manifestUrl?: string; bundleId?: string };
  fetchImpl?: typeof fetch;
  indexUrl?: string;
}

export async function selectBundle(opts: SelectOptions = {}): Promise<BundleSelection> {
  const production = opts.production ?? IS_PRODUCTION_BUILD;
  const override = opts.override ?? BUNDLE_OVERRIDE;
  if (override.manifestUrl) return { manifestUrl: override.manifestUrl, bundleId: null, source: 'env-manifest' };
  if (override.bundleId) {
    if (!ID.test(override.bundleId)) throw new BundleLoadError('schema', `VITE_BUNDLE "${override.bundleId}" is not a valid bundle id`, '');
    return { manifestUrl: manifestUrlFor(override.bundleId), bundleId: override.bundleId, source: 'env-bundle' };
  }
  const indexUrl = opts.indexUrl ?? BUNDLE_INDEX_URL;
  const f = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const abs = new URL(indexUrl, typeof document !== 'undefined' ? document.baseURI : 'http://localhost/').toString();
  let res: Response;
  try {
    res = await f(abs);
  } catch (e) {
    throw new BundleLoadError('fetch-manifest', `bundle index unreachable: ${(e as Error).message}`, abs);
  }
  if (!res.ok) throw new BundleLoadError('fetch-manifest', `bundle index HTTP ${res.status}`, abs);
  let idx: Partial<BundleIndex>;
  try {
    idx = (await res.json()) as Partial<BundleIndex>;
  } catch (e) {
    throw new BundleLoadError('parse-manifest', `bundle index is not JSON: ${(e as Error).message}`, abs);
  }
  const id = production ? idx.release : idx.dev;
  if (typeof id !== 'string' || !ID.test(id))
    throw new BundleLoadError('schema', `bundle index has no valid "${production ? 'release' : 'dev'}" id`, abs);
  return { manifestUrl: manifestUrlFor(id), bundleId: id, source: production ? 'index-release' : 'index-dev' };
}
