/** Small status line for the optional tile service. Fire-and-forget; never gates anything. */
import { useEffect, useState } from 'react';
import { TILE_CONFIG, type TileConfig } from '../config';
import { describeTileResult, fetchTile, type TileResult } from './tiles';

export function ContextImageryStatus({ config = TILE_CONFIG, fetchImpl }: { config?: TileConfig; fetchImpl?: typeof fetch }) {
  const [result, setResult] = useState<TileResult | null>(config.enabled ? null : { status: 'disabled' });
  useEffect(() => {
    if (!config.enabled) return;
    let alive = true;
    void fetchTile(config, 0, 0, 0, fetchImpl).then((r) => alive && setResult(r));
    return () => {
      alive = false;
    };
  }, [config, fetchImpl]);
  return (
    <p className="muted" data-testid="imagery-status" data-status={result?.status ?? 'pending'}>
      {describeTileResult(result)}
      {result?.status === 'ok' && ` ${config.attribution}.`}
    </p>
  );
}
