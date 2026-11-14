/**
 * Background check of OPTIONAL display assets (textures, panoramas). OWNER: Role C.
 * Never blocks routing; a missing optional asset is reported, not treated as missing terrain.
 */
import type { DisplayAssetDescriptor, GridBundle } from '../contracts';

export type AssetStatus =
  | { id: string; kind: DisplayAssetDescriptor['kind']; status: 'ok'; url: string }
  | { id: string; kind: DisplayAssetDescriptor['kind']; status: 'missing' | 'corrupt' | 'timeout'; url: string; message: string };

export async function checkDisplayAssets(bundle: GridBundle, fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis), timeoutMs = 8000): Promise<AssetStatus[]> {
  return Promise.all(
    bundle.manifest.displayAssets.map(async (a): Promise<AssetStatus> => {
      const url = new URL(a.file, bundle.manifestUrl).toString();
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const r = await fetchImpl(url, { signal: ctrl.signal });
        if (!r.ok) return { id: a.id, kind: a.kind, status: 'missing', url, message: `HTTP ${r.status}` };
        const buf = await r.arrayBuffer();
        if (buf.byteLength !== a.byteLength)
          return { id: a.id, kind: a.kind, status: 'corrupt', url, message: `${buf.byteLength} B, manifest says ${a.byteLength} B` };
        return { id: a.id, kind: a.kind, status: 'ok', url };
      } catch (e) {
        return ctrl.signal.aborted
          ? { id: a.id, kind: a.kind, status: 'timeout', url, message: `no response within ${timeoutMs} ms` }
          : { id: a.id, kind: a.kind, status: 'missing', url, message: (e as Error).message };
      } finally {
        clearTimeout(t);
      }
    }),
  );
}
