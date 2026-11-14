/**
 * Single source of truth for app state. OWNER: Role C.
 * Pure reducer (unit-tested) + React context in ./AppStateProvider.tsx.
 *
 * INVALIDATION RULES (plan 2.1):
 *  Invalidates route  -> endpoint change, policy/weight change, strict quality toggle,
 *                        round-trip toggle, model profile change, region (bundle) version change.
 *  Does NOT invalidate -> layer visibility/opacity, camera orbit/zoom, panel expansion, 2D/3D toggle,
 *                        candidate selection.
 * "Invalidate" = mark existing candidates stale AND detach the in-flight request
 * (activeRequestId=null) so its late response is ignored. Region change additionally clears candidates.
 */
import type { BundleLoadError } from '../data/loadBundle';
import type {
  GridBundle,
  LocalPoint,
  PolicyWeights,
  RouteCandidate,
  RouteFinalResponse,
  RoutePolicyId,
  RouteRequest,
  RouteResponse,
} from '../contracts';
import { ROUTE_POLICIES } from '../contracts';

export type ViewMode = '2d' | '3d';
export type LayerKey = 'elevation' | 'slope' | 'roughness' | 'quality' | 'exclusion' | 'route' | 'poi';

export interface MissionEndpoint {
  point: LocalPoint;
  /** POI id if chosen from a preset, else null (free pick). */
  poiId: string | null;
}

export interface MissionInputs {
  start: MissionEndpoint | null;
  destination: MissionEndpoint | null;
  policies: RoutePolicyId[];
  weightOverrides: Partial<Record<RoutePolicyId, PolicyWeights>>;
  strictQuality: boolean;
  roundTrip: boolean;
  modelVersion: string;
}

export type RegionState =
  | { status: 'idle' }
  | { status: 'loading'; manifestUrl: string }
  | { status: 'ready'; bundle: GridBundle }
  | { status: 'error'; error: Pick<BundleLoadError, 'stage' | 'message' | 'url' | 'layer'> };

export type RouteRunState =
  | { kind: 'idle' }
  | { kind: 'running'; requestId: string; exploredNodes: number }
  | { kind: 'finished'; response: RouteFinalResponse };

export interface DisplayState {
  layers: Record<LayerKey, { visible: boolean; opacity: number }>;
  panels: Record<string, boolean>;
  /** Opaque camera state owned by the 3D component. */
  camera: unknown;
}

export interface AppState {
  loadedRegion: RegionState;
  currentMission: MissionInputs;
  activeRequestId: string | null;
  routeRun: RouteRunState;
  routeCandidates: RouteCandidate[];
  selectedCandidateId: string | null;
  viewMode: ViewMode;
  /** true when routeCandidates no longer match currentMission / loaded region. */
  isStale: boolean;
  display: DisplayState;
}

export type Action =
  | { type: 'region/loading'; manifestUrl: string }
  | { type: 'region/loaded'; bundle: GridBundle }
  | { type: 'region/failed'; error: Pick<BundleLoadError, 'stage' | 'message' | 'url' | 'layer'> }
  // --- invalidating mission inputs
  | { type: 'mission/setStart'; endpoint: MissionEndpoint | null }
  | { type: 'mission/setDestination'; endpoint: MissionEndpoint | null }
  | { type: 'mission/setPolicies'; policies: RoutePolicyId[] }
  | { type: 'mission/setWeights'; policy: RoutePolicyId; weights: PolicyWeights | null }
  | { type: 'mission/setStrictQuality'; value: boolean }
  | { type: 'mission/setRoundTrip'; value: boolean }
  | { type: 'mission/setModelVersion'; modelVersion: string }
  // --- route lifecycle
  | { type: 'route/requested'; requestId: string }
  | { type: 'route/update'; response: RouteResponse }
  | { type: 'route/select'; candidateId: string | null }
  // --- non-invalidating display state
  | { type: 'view/setMode'; mode: ViewMode }
  | { type: 'view/setLayer'; layer: LayerKey; visible?: boolean; opacity?: number }
  | { type: 'view/setPanel'; panel: string; expanded: boolean }
  | { type: 'view/setCamera'; camera: unknown };

export const INVALIDATING_ACTIONS: ReadonlySet<Action['type']> = new Set([
  'mission/setStart',
  'mission/setDestination',
  'mission/setPolicies',
  'mission/setWeights',
  'mission/setStrictQuality',
  'mission/setRoundTrip',
  'mission/setModelVersion',
  'region/loaded',
  'region/loading',
]);

export function createInitialState(modelVersion: string): AppState {
  const layer = (visible: boolean, opacity = 1) => ({ visible, opacity });
  return {
    loadedRegion: { status: 'idle' },
    currentMission: {
      start: null,
      destination: null,
      policies: [...ROUTE_POLICIES],
      weightOverrides: {},
      strictQuality: false,
      roundTrip: false,
      modelVersion,
    },
    activeRequestId: null,
    routeRun: { kind: 'idle' },
    routeCandidates: [],
    selectedCandidateId: null,
    viewMode: '2d',
    isStale: false,
    display: {
      layers: {
        elevation: layer(true),
        slope: layer(false, 0.6),
        roughness: layer(false, 0.6),
        quality: layer(false, 0.5),
        exclusion: layer(true, 0.7),
        route: layer(true),
        poi: layer(true),
      },
      panels: {},
      camera: null,
    },
  };
}

/** Mark results stale + detach in-flight request. */
function invalidate(s: AppState): AppState {
  return {
    ...s,
    activeRequestId: null,
    routeRun: s.routeRun.kind === 'running' ? { kind: 'idle' } : s.routeRun,
    isStale: s.routeCandidates.length > 0 || s.routeRun.kind === 'finished',
  };
}

function mission(s: AppState, patch: Partial<MissionInputs>): AppState {
  return invalidate({ ...s, currentMission: { ...s.currentMission, ...patch } });
}

export function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'region/loading':
      return { ...clearRoutes(s), loadedRegion: { status: 'loading', manifestUrl: a.manifestUrl } };
    case 'region/loaded': {
      const prev = s.loadedRegion.status === 'ready' ? s.loadedRegion.bundle.bundleVersion : null;
      const next = { ...s, loadedRegion: { status: 'ready', bundle: a.bundle } as const };
      // Region version change: old routes are meaningless on a different grid; endpoints too.
      if (prev !== a.bundle.bundleVersion) {
        return { ...clearRoutes(next), currentMission: { ...next.currentMission, start: null, destination: null } };
      }
      return next;
    }
    case 'region/failed':
      return { ...clearRoutes(s), loadedRegion: { status: 'error', error: a.error } };

    case 'mission/setStart':
      return mission(s, { start: a.endpoint });
    case 'mission/setDestination':
      return mission(s, { destination: a.endpoint });
    case 'mission/setPolicies':
      return mission(s, { policies: [...a.policies] });
    case 'mission/setWeights': {
      const w = { ...s.currentMission.weightOverrides };
      if (a.weights) w[a.policy] = a.weights;
      else delete w[a.policy];
      return mission(s, { weightOverrides: w });
    }
    case 'mission/setStrictQuality':
      return s.currentMission.strictQuality === a.value ? s : mission(s, { strictQuality: a.value });
    case 'mission/setRoundTrip':
      return s.currentMission.roundTrip === a.value ? s : mission(s, { roundTrip: a.value });
    case 'mission/setModelVersion':
      return mission(s, { modelVersion: a.modelVersion });

    case 'route/requested':
      return { ...s, activeRequestId: a.requestId, routeRun: { kind: 'running', requestId: a.requestId, exploredNodes: 0 } };
    case 'route/update': {
      const r = a.response;
      // Stale guard #2 (client.ts is #1): only the active request may change state.
      if (r.requestId !== s.activeRequestId) return s;
      if (s.loadedRegion.status !== 'ready' || r.bundleVersion !== s.loadedRegion.bundle.bundleVersion) return s;
      if (r.status === 'progress') {
        return { ...s, routeRun: { kind: 'running', requestId: r.requestId, exploredNodes: r.exploredNodes } };
      }
      const candidates = r.status === 'success' ? r.candidates : [];
      return {
        ...s,
        activeRequestId: null,
        routeRun: { kind: 'finished', response: r },
        routeCandidates: candidates,
        selectedCandidateId: candidates[0]?.candidateId ?? null,
        isStale: false,
      };
    }
    case 'route/select':
      if (a.candidateId !== null && !s.routeCandidates.some((c) => c.candidateId === a.candidateId)) return s;
      return { ...s, selectedCandidateId: a.candidateId };

    case 'view/setMode':
      return { ...s, viewMode: a.mode };
    case 'view/setLayer': {
      const cur = s.display.layers[a.layer];
      return {
        ...s,
        display: {
          ...s.display,
          layers: { ...s.display.layers, [a.layer]: { visible: a.visible ?? cur.visible, opacity: a.opacity ?? cur.opacity } },
        },
      };
    }
    case 'view/setPanel':
      return { ...s, display: { ...s.display, panels: { ...s.display.panels, [a.panel]: a.expanded } } };
    case 'view/setCamera':
      return { ...s, display: { ...s.display, camera: a.camera } };
  }
}

function clearRoutes(s: AppState): AppState {
  return { ...s, activeRequestId: null, routeRun: { kind: 'idle' }, routeCandidates: [], selectedCandidateId: null, isStale: false };
}

// ---- selectors -------------------------------------------------------------

export function selectSelectedCandidate(s: AppState): RouteCandidate | null {
  return s.routeCandidates.find((c) => c.candidateId === s.selectedCandidateId) ?? null;
}

export function selectCanRequestRoute(s: AppState): { ok: true } | { ok: false; reason: string } {
  if (s.loadedRegion.status !== 'ready') return { ok: false, reason: 'Region data is not loaded.' };
  if (!s.currentMission.start) return { ok: false, reason: 'Choose a start point.' };
  if (!s.currentMission.destination) return { ok: false, reason: 'Choose a destination.' };
  if (!s.currentMission.policies.length) return { ok: false, reason: 'Choose at least one route policy.' };
  return { ok: true };
}

/** Builds the worker request from current state (caller supplies a fresh requestId). */
export function buildRouteRequest(s: AppState, requestId: string, timeoutMs?: number): RouteRequest | null {
  if (selectCanRequestRoute(s).ok !== true || s.loadedRegion.status !== 'ready') return null;
  const m = s.currentMission;
  return {
    requestId,
    bundleVersion: s.loadedRegion.bundle.bundleVersion,
    modelVersion: m.modelVersion,
    start: { ...m.start!.point },
    destination: { ...m.destination!.point },
    policies: [...m.policies],
    ...(Object.keys(m.weightOverrides).length ? { weightOverrides: { ...m.weightOverrides } } : {}),
    strictQuality: m.strictQuality,
    roundTrip: m.roundTrip,
    ...(timeoutMs ? { timeoutMs } : {}),
  };
}
