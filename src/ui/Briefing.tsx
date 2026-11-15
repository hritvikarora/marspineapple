/**
 * ⚠️ MINIMAL BRIEFING PREVIEW — OWNER: Dhani (replace freely). Reads ONLY the shared selection
 * view-model so the report can never name a different route than the map highlights.
 */
import { formatReleaseId, type RegionManifest, type ReleaseId } from '../contracts';
import type { MissionInputs, SelectionView } from '../state/store';

interface Props {
  selection: SelectionView;
  release: ReleaseId;
  manifest: RegionManifest;
  mission: MissionInputs;
}

const f = (n: number, d = 0) => n.toFixed(d);

export function Briefing({ selection, release, manifest, mission }: Props) {
  const c = selection.candidate;
  const poiName = (id: string | null | undefined) => manifest.pointsOfInterest.find((p) => p.id === id)?.name ?? 'custom point';
  return (
    <section className="briefing" aria-label="Mission briefing preview" data-testid="briefing" data-candidate-id={c?.candidateId ?? ''} data-hover-index={selection.hover?.pathIndex ?? ''}>
      <h2>Briefing preview</h2>
      <p className="briefing-release muted">{formatReleaseId(release)} · {manifest.synthetic ? 'SYNTHETIC data' : manifest.title}</p>
      {!c ? (
        <p>No route selected.</p>
      ) : (
        <>
          {selection.isStale && <p className="stale">Inputs changed since this route was calculated — recalculate before using this briefing.</p>}
          <p className="briefing-summary">
            <strong>Selected route {c.candidateId}</strong> ({c.policies.join(' + ')}) from {poiName(mission.start?.poiId)} to {poiName(mission.destination?.poiId)} · {c.missionStatus}
          </p>
          <ul className="briefing-metrics">
            <li>Horizontal distance: {f(c.outbound.metrics.horizontalDistance_m)} m (surface {f(c.outbound.metrics.surfaceDistance_m)} m)</li>
            <li>Ascent / descent: {f(c.outbound.metrics.ascent_m, 1)} m / {f(c.outbound.metrics.descent_m, 1)} m</li>
            <li>Max terrain slope: {f(c.outbound.metrics.maxTerrainSlope_deg, 1)}° · max edge grade: {f(c.outbound.metrics.maxAbsEdgeGrade_deg, 1)}°</li>
            <li>Unknown quality: {f(c.outbound.metrics.unknownQualityLength_m)} m ({f(c.outbound.metrics.unknownQualityPct)}% of horizontal distance) · low quality: {f(c.outbound.metrics.lowQualityLength_m)} m ({f(c.outbound.metrics.lowQualityPct)}%)</li>
          </ul>
          {selection.hover && (
            <p className="briefing-hover-box" data-testid="briefing-hover">
              Inspecting {f(selection.hover.distance_m)} m along route at east {f(selection.hover.point.east_m)} m, north {f(selection.hover.point.north_m)} m, elevation {f(selection.hover.point.elevation_m, 1)} m.
            </p>
          )}
          <p className="briefing-limitations muted">Limitations: {manifest.limitations.join(' ')} Educational simulation, not a safety assessment.</p>
        </>
      )}
    </section>
  );
}
