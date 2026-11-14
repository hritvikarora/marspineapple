/**
 * Deterministic JSON export (reproducibility artifact). OWNER: Role C.
 * - Keys sorted recursively; arrays keep order; 2-space indent; trailing newline.
 * - Non-finite numbers become null (JSON has no NaN/Infinity).
 * - No timestamps or session ids (requestId) unless passed explicitly; no URLs or local file paths.
 *   Same app/bundle/model version + same inputs => byte-identical file.
 */
import type { RegionManifest, ReleaseId, RouteCandidate, RouteFinalResponse } from '../contracts';
import type { MissionInputs } from '../state/store';

export const EXPORT_FORMAT = 'mars-pathfinder/route-export@1';

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortDeep(value), null, 2) + '\n';
}

function sortDeep(v: unknown): unknown {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v === undefined) return null;
  if (Array.isArray(v)) return v.map(sortDeep);
  if (ArrayBuffer.isView(v)) return Array.from(v as unknown as ArrayLike<number>, (n) => sortDeep(n));
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) {
      const val = (v as Record<string, unknown>)[k];
      if (val === undefined || typeof val === 'function') continue;
      out[k] = sortDeep(val);
    }
    return out;
  }
  return v;
}

const LOCAL_PATH = /(^|[\s"'(])(file:\/\/|\/home\/|\/Users\/|\/tmp\/|[A-Za-z]:\\)/;

/** Throws if any string looks like a local filesystem path (defence in depth). */
export function assertNoLocalPaths(json: string): void {
  if (LOCAL_PATH.test(json)) throw new Error('Export contains a local filesystem path');
}

export interface ExportInput {
  release: ReleaseId;
  manifest: RegionManifest;
  mission: MissionInputs;
  response: Extract<RouteFinalResponse, { status: 'success' }>;
  selectedCandidateId: string | null;
  /** Optional ISO timestamp; omit for byte-identical output. */
  exportedAt?: string;
}

export function buildExportObject(i: ExportInput) {
  const r = i.response;
  const candidates = r.candidates.map((c: RouteCandidate) => ({
    candidateId: c.candidateId,
    policies: c.policies,
    missionStatus: c.missionStatus,
    explanation: c.explanation,
    outbound: { metrics: c.outbound.metrics, path: c.outbound.path, qualityIntervals: c.outbound.qualityIntervals, weightedCost: c.outbound.weightedCost },
    returnLeg: c.returnLeg
      ? { metrics: c.returnLeg.metrics, path: c.returnLeg.path, qualityIntervals: c.returnLeg.qualityIntervals, weightedCost: c.returnLeg.weightedCost }
      : null,
  }));
  return {
    format: EXPORT_FORMAT,
    release: { appVersion: i.release.appVersion, bundleVersion: i.release.bundleVersion, modelVersion: i.release.modelVersion },
    region: {
      bundleId: i.manifest.bundleId,
      bundleVersion: i.manifest.bundleVersion,
      datasetVersion: i.manifest.datasetVersion,
      synthetic: i.manifest.synthetic,
      title: i.manifest.title,
      crs: i.manifest.crs.description,
      verticalReference: i.manifest.crs.verticalReference,
      cellSize_m: { east: i.manifest.grid.cellSizeEast_m, north: i.manifest.grid.cellSizeNorth_m },
      sources: i.manifest.sources.map((s) => ({ id: s.id, mission: s.mission, instrument: s.instrument, title: s.title, version: s.version })),
    },
    request: {
      policies: i.mission.policies,
      weightOverrides: i.mission.weightOverrides,
      strictQuality: i.mission.strictQuality,
      roundTrip: i.mission.roundTrip,
      startPoiId: i.mission.start?.poiId ?? null,
      destinationPoiId: i.mission.destination?.poiId ?? null,
    },
    endpoints: { start: r.start, destination: r.destination },
    selectedCandidateId: i.selectedCandidateId,
    candidates,
    units: { distance: 'm', elevation: 'm', slope: 'deg', grade: 'deg', exposurePct: '% of horizontalDistance_m', weightedCost: 'dimensionless weighted cost (not comparable across policies)' },
    limitations: [...i.manifest.limitations, 'Educational simulation: not a validated EVA or rover safety assessment.'],
    ...(i.exportedAt ? { exportedAt: i.exportedAt } : {}),
  };
}

export function serializeRouteExport(i: ExportInput): string {
  const json = stableStringify(buildExportObject(i));
  assertNoLocalPaths(json);
  return json;
}

export function exportFileName(release: ReleaseId, candidateId: string | null): string {
  const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, '_');
  return `mars-pathfinder_${safe(release.bundleVersion)}_${safe(release.modelVersion)}_${safe(candidateId ?? 'none')}.json`;
}
