import { useEffect, useRef, useState } from 'react';
import type { GridBundle, RouteCandidate } from '../contracts';
import { mountMarswalkHud, type HudSnapshot } from './marswalkHud';
import type { MarswalkSession } from './marswalkSession';

export interface TerrainViewProps {
  bundle: GridBundle;
  candidates: RouteCandidate[];
  selectedCandidateId: string | null;
  highlightPathIndex: number | null;
  verticalExaggeration: number;
  camera: unknown;
  onCameraChange?: (camera: unknown) => void;
  onSelectCandidate?: (candidateId: string) => void;
  onError?: (e: { kind: 'webgl-unavailable' | 'context-lost' | 'terrain-data' | 'texture'; message: string }) => void;
}

const CLEAR_HUD: HudSnapshot = {
  offPathBlocked: false,
  offPathMessage: '',
  rejectedCallout: null,
  arrivalVisible: false,
  arrivalText: '',
  creditsOpen: false,
  layerLabel: 'Colour',
  mapPeekOpen: false,
  traceNote: null,
  wristOn: false,
};

function probeWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export default function TerrainView({
  bundle,
  candidates,
  selectedCandidateId,
  highlightPathIndex,
  verticalExaggeration,
  onError,
}: TerrainViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<MarswalkSession | null>(null);
  const hudUpdate = useRef<((snapshot: HudSnapshot | null) => void) | null>(null);
  const [webgl] = useState(probeWebGL);
  const [note, setNote] = useState(() =>
    probeWebGL()
      ? 'Walk the selected route with WASD. R respawns to the path.'
      : 'This browser has no WebGL. The mission HUD is still available.',
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const hud = mountMarswalkHud(host, {
      onRespawn: () => sessionRef.current?.player.respawnToSafePoint(),
      onToggleSources: () => undefined,
      onReturnToMenu: () => undefined,
      onToggleWrist: () => undefined,
      onToggleLayer: () => undefined,
      onToggleMap: () => undefined,
      onToggleTrace: () => undefined,
    });
    hudUpdate.current = hud.update;
    hud.update(CLEAR_HUD);
    return () => {
      hudUpdate.current = null;
      hud.dispose();
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !webgl) return;
    const bag: { disposed: boolean; session: MarswalkSession | null } = { disposed: false, session: null };
    void import('./marswalkSession')
      .then(({ startMarswalkSession }) => {
        if (bag.disposed) return;
        bag.session = startMarswalkSession({
          bundle,
          container: host,
          candidates,
          selectedCandidateId,
          verticalExaggeration: verticalExaggeration || 1,
          onBlocked: (message) => {
            hudUpdate.current?.({
              ...CLEAR_HUD,
              offPathBlocked: true,
              offPathMessage: message,
            });
          },
          onCleared: () => hudUpdate.current?.(CLEAR_HUD),
        });
        sessionRef.current = bag.session;
        const canvas = host.querySelector('canvas');
        canvas?.addEventListener('webglcontextlost', (event) => {
          event.preventDefault();
          onError?.({ kind: 'context-lost', message: 'webglcontextlost' });
        });
      })
      .catch((err: unknown) => {
        if (!bag.disposed) {
          const message = err instanceof Error ? err.message : '3D terrain failed to start';
          setNote(message);
        }
      });
    return () => {
      bag.disposed = true;
      bag.session?.dispose();
      if (sessionRef.current === bag.session) sessionRef.current = null;
    };
  }, [webgl, bundle, candidates, selectedCandidateId, verticalExaggeration, onError]);

  return (
    <div
      ref={hostRef}
      className="terrain-live"
      role="region"
      aria-label="3D terrain view"
      data-testid="terrain-view"
      data-selected-candidate={selectedCandidateId ?? ''}
      data-hover-index={highlightPathIndex ?? ''}
      style={{ position: 'relative', minHeight: 360, background: '#1a120c' }}
    >
      <p style={{ margin: 8 }}>{note}</p>
      <button type="button" data-testid="sim-step-along-route" onClick={() => sessionRef.current?.player.moveAlongRouteForDemo()}>
        Step along route
      </button>
      <button type="button" data-testid="sim-step-off-path" onClick={() => sessionRef.current?.player.stepOffPathForDemo()}>
        Step off path
      </button>
    </div>
  );
}
