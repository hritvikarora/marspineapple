/**
 * Integration wrapper around Role B's lazy 3D component. OWNER: Role C.
 * WebGL probe -> lazy chunk (Suspense) -> ErrorBoundary. Any failure (no WebGL, chunk load error,
 * render throw, context loss reported via onError) records `display.terrain3d` in the store and
 * degrades to the 2D fallback (map + profile; briefing stays visible) with an accurate message.
 */
import { Suspense, useEffect, useState, type ReactNode } from 'react';
import type { TerrainViewProps } from '../terrain3d/TerrainView';
import type { Terrain3dStatus } from '../state/store';
import { ErrorBoundary } from './ErrorBoundary';
import { defaultTerrainLoader, lazyTerrain, type TerrainLoader } from './terrainLoader';
import { detectWebGL as defaultDetect, type WebGLSupport } from './webgl';

const KIND_TEXT: Record<Extract<Terrain3dStatus, { status: 'unavailable' }>['kind'], string> = {
  'webgl-unavailable': 'WebGL is not available in this browser',
  'context-lost': 'the graphics (WebGL) context was lost',
  'render-error': 'the 3D view crashed',
  'load-error': 'the 3D module could not be loaded',
  'terrain-data': 'the terrain data could not be rendered',
  texture: 'the terrain texture could not be loaded',
};

interface Props {
  viewProps: Omit<TerrainViewProps, 'onError'>;
  status: Terrain3dStatus;
  onStatus: (s: Terrain3dStatus) => void;
  /** 2D alternative shown when 3D is unavailable. */
  fallback: ReactNode;
  detectWebGL?: () => WebGLSupport;
  load?: TerrainLoader;
}

export function TerrainSlot({ viewProps, status, onStatus, fallback, detectWebGL = defaultDetect, load = defaultTerrainLoader }: Props) {
  const [support] = useState(detectWebGL);
  const [attempt, setAttempt] = useState(0);
  const Lazy = lazyTerrain(load, attempt);

  useEffect(() => {
    if (!support.ok) onStatus({ status: 'unavailable', kind: 'webgl-unavailable', message: support.reason });
    else if (status.status === 'unknown') onStatus({ status: 'ok' });
  }, [support, status.status, onStatus]);

  if (!support.ok || status.status === 'unavailable') {
    const kind = status.status === 'unavailable' ? status.kind : 'webgl-unavailable';
    const detail = status.status === 'unavailable' ? status.message : support.ok ? '' : support.reason;
    return (
      <div data-testid="terrain-fallback" data-kind={kind}>
        <div role="alert" className="notice">
          3D view unavailable: {KIND_TEXT[kind]}{detail ? ` (${detail})` : ''}. The 2D map, elevation profile and briefing show the
          same selected route.
          {support.ok && (
            <>
              {' '}
              <button
                type="button"
                onClick={() => {
                  setAttempt((a) => a + 1);
                  onStatus({ status: 'ok' });
                }}
              >
                Retry 3D
              </button>
            </>
          )}
        </div>
        {fallback}
      </div>
    );
  }

  return (
    <ErrorBoundary
      key={attempt}
      fallback={null}
      onError={(e) =>
        onStatus({
          status: 'unavailable',
          kind: /dynamically imported module|Failed to fetch|Loading chunk/i.test(e.message) ? 'load-error' : 'render-error',
          message: e.message,
        })
      }
    >
      <Suspense fallback={<p role="status">Loading 3D view…</p>}>
        {/* eslint-disable-next-line react-hooks/static-components -- lazyTerrain() is memoised per (loader, attempt); identity is stable across renders */}
        <Lazy {...viewProps} onError={(e) => onStatus({ status: 'unavailable', kind: e.kind, message: e.message })} />
      </Suspense>
    </ErrorBoundary>
  );
}
