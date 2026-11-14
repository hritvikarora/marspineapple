import { useEffect, useState } from 'react';
import type { GridBundle } from '../contracts';
import { checkDisplayAssets, type AssetStatus } from './optionalAssets';

/** One-line status for optional display assets; failures never affect routing. */
export function OptionalAssetsStatus({ bundle }: { bundle: GridBundle }) {
  const [result, setResult] = useState<{ version: string; statuses: AssetStatus[] } | null>(null);
  useEffect(() => {
    let alive = true;
    void checkDisplayAssets(bundle).then((statuses) => alive && setResult({ version: bundle.bundleVersion, statuses }));
    return () => {
      alive = false;
    };
  }, [bundle]);
  const total = bundle.manifest.displayAssets.length;
  if (total === 0) return null;
  const statuses = result?.version === bundle.bundleVersion ? result.statuses : null;
  const bad = statuses?.filter((s) => s.status !== 'ok') ?? [];
  return (
    <p className="muted" data-testid="optional-assets-status" data-status={!statuses ? 'pending' : bad.length ? 'degraded' : 'ok'}>
      {!statuses
        ? 'Optional display assets: checking…'
        : bad.length
          ? bad.map((b) => `Optional ${b.kind} "${b.id}" unavailable (${b.status}: ${b.message}).`).join(' ') +
            ' Terrain data and routing are unaffected.'
          : `Optional display assets: ${total}/${total} available.`}
    </p>
  );
}
