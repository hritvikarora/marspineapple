/**
 * Optional external tile adapter (NASA Trek WMTS). OWNER: Role C.
 * Contract: never throws, always settles within `timeoutMs`, never blocks routing or bundle
 * loading. A failed tile is "context imagery unavailable", NOT "no terrain data".
 */
import type { TileConfig } from '../config';

export type TileResult =
  | { status: 'ok'; url: string; blob: Blob; ms: number }
  | { status: 'disabled' }
  | { status: 'offline' | 'timeout' | 'http-error' | 'bad-content'; url: string; message: string; ms: number };

export function tileUrl(template: string, z: number, x: number, y: number): string {
  return template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
}

export async function fetchTile(
  cfg: Pick<TileConfig, 'enabled' | 'urlTemplate' | 'timeoutMs'>,
  z: number,
  x: number,
  y: number,
  fetchImpl: typeof fetch = globalThis.fetch?.bind(globalThis),
  now: () => number = () => Date.now(),
): Promise<TileResult> {
  if (!cfg.enabled) return { status: 'disabled' };
  const url = tileUrl(cfg.urlTemplate, z, x, y);
  const t0 = now();
  const ms = () => now() - t0;
  if (typeof navigator !== 'undefined' && navigator.onLine === false)
    return { status: 'offline', url, message: 'Browser reports offline.', ms: 0 };
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => {
      ctrl.abort();
      resolve('timeout');
    }, cfg.timeoutMs);
  });
  try {
    const res = await Promise.race([fetchImpl(url, { signal: ctrl.signal, mode: 'cors' }), timeout]);
    if (res === 'timeout') return { status: 'timeout', url, message: `No response within ${cfg.timeoutMs} ms.`, ms: ms() };
    if (!res.ok) return { status: 'http-error', url, message: `HTTP ${res.status}`, ms: ms() };
    const blob = await Promise.race([res.blob(), timeout]);
    if (blob === 'timeout') return { status: 'timeout', url, message: `Body not received within ${cfg.timeoutMs} ms.`, ms: ms() };
    if (blob.type && !blob.type.startsWith('image/'))
      return { status: 'bad-content', url, message: `Unexpected content type ${blob.type}`, ms: ms() };
    return { status: 'ok', url, blob, ms: ms() };
  } catch (e) {
    if (ctrl.signal.aborted) return { status: 'timeout', url, message: `No response within ${cfg.timeoutMs} ms.`, ms: ms() };
    return { status: 'offline', url, message: `Network error: ${(e as Error).message}`, ms: ms() };
  } finally {
    clearTimeout(timer);
  }
}

export function describeTileResult(r: TileResult | null): string {
  if (!r) return 'Context imagery: checking…';
  switch (r.status) {
    case 'disabled':
      return 'Context imagery: off (optional; routing uses only the bundled terrain data).';
    case 'ok':
      return `Context imagery: available (${r.ms} ms).`;
    default:
      return `Context imagery unavailable (${r.status}: ${r.message}). Routing and terrain data are unaffected.`;
  }
}
