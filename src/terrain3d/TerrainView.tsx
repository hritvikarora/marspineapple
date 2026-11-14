/**
 * ⚠️ PLACEHOLDER — OWNER: Role B (3D terrain). Replace the body; keep (or negotiate) the props.
 *
 * Contract: receives the SAME GridBundle and RouteCandidate objects as the 2D map. Never copy
 * or mutate bundle arrays in place (they are shared). Use `toSceneXYZ` from contracts/grid.ts:
 * X = east_m, Y = elevation_m, Z = -north_m. Report failures via onError so the app can fall
 * back to 2D. Lazy-load three.js inside this folder so the initial bundle stays small.
 */
import type { GridBundle, RouteCandidate } from '../contracts';

export interface TerrainViewProps {
  bundle: GridBundle;
  candidates: RouteCandidate[];
  selectedCandidateId: string | null;
  /** Index into selected candidate's outbound.path to highlight (profile/map hover sync). */
  highlightPathIndex: number | null;
  verticalExaggeration: number;
  camera: unknown;
  onCameraChange?: (camera: unknown) => void;
  onSelectCandidate?: (candidateId: string) => void;
  onError?: (e: { kind: 'webgl-unavailable' | 'context-lost' | 'terrain-data' | 'texture'; message: string }) => void;
}

export default function TerrainView({ bundle, candidates, selectedCandidateId }: TerrainViewProps) {
  return (
    <div className="placeholder3d" role="region" aria-label="3D terrain view (placeholder)">
      <p>
        <strong>3D terrain placeholder</strong> (Role B). Bundle {bundle.bundleVersion}, {bundle.width}×{bundle.height} cells,{' '}
        {candidates.length} candidate(s), selected: {selectedCandidateId ?? 'none'}.
      </p>
    </div>
  );
}
