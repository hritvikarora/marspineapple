/** Selects and loads the region bundle once on mount. OWNER: Role C. */
import { useEffect } from 'react';
import { BundleLoadError, loadAndValidateBundle } from '../data/loadBundle';
import { useAppState } from '../state/context';
import { selectBundle, type SelectOptions } from './bundleSelection';

export function useRegionLoader(opts?: SelectOptions) {
  const { dispatch } = useAppState();
  useEffect(() => {
    let alive = true;
    (async () => {
      const sel = await selectBundle(opts);
      if (!alive) return;
      dispatch({ type: 'region/loading', manifestUrl: sel.manifestUrl });
      const bundle = await loadAndValidateBundle(sel.manifestUrl);
      if (alive) dispatch({ type: 'region/loaded', bundle });
    })().catch((e: unknown) => {
      if (!alive) return;
      const err = e instanceof BundleLoadError ? e : new BundleLoadError('fetch-manifest', String(e), '');
      dispatch({ type: 'region/failed', error: { stage: err.stage, message: err.message, url: err.url, layer: err.layer } });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);
}
