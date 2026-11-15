/**
 * App Shell — OWNER: Dhani (UI Role).
 * Provides the modular 20-slot architecture, responsive layout, and default baseline fallbacks.
 * Connects to Role C's state store (useAppState), worker runner (useRouteRunner), and 3D slot.
 */
import { useCallback, useEffect, useState } from 'react';
import { ContextImageryStatus } from '../app/ContextImageryStatus';
import { OptionalAssetsStatus } from '../app/OptionalAssetsStatus';
import type { SelectOptions } from '../app/bundleSelection';
import { TerrainSlot } from '../app/TerrainSlot';
import type { TerrainLoader } from '../app/terrainLoader';
import { useRegionLoader } from '../app/useRegionLoader';
import type { WebGLSupport } from '../app/webgl';
import { APP_VERSION, EXPECTED_MODEL_VERSION, IS_PRODUCTION_BUILD, TILE_CONFIG, type TileConfig } from '../config';
import { ROUTE_POLICIES, formatReleaseId, type LocalPoint, type RoutePolicyId } from '../contracts';
import { exportFileName, serializeRouteExport } from '../export/serialize';
import { getUnifiedPoisForBundle } from '../terrain3d/coordBridge';
import { useAppState } from '../state/context';
import { buildRouteRequest, selectCanRequestRoute, selectSelection, type LayerKey, type Terrain3dStatus } from '../state/store';
import { useRouteRunner } from '../state/useRouteRunner';
import type { RouteWorkerClientOptions } from '../worker/client';
import { Briefing } from './Briefing';
import { ElevationProfile } from './ElevationProfile';
import { MapCanvas, type RejectedPathOverlay } from './MapCanvas';
import { StartMenuModal } from './StartMenuModal';
import { MarswalkLaunch } from './MarswalkLaunch';
import { Landing } from './Landing';
import type { SearchTraceFrame } from '../contracts';
import { Slot } from './shared/Slot';
import type { CustomCanvasLayer, FeatureRegistryMap } from './shared/types';
import './shared/tokens.css';

/** Injection points for tests/integration; production uses the defaults. */
export interface AppDeps {
  workerOptions?: RouteWorkerClientOptions;
  bundleSelection?: SelectOptions;
  detectWebGL?: () => WebGLSupport;
  loadTerrainView?: TerrainLoader;
  tileConfig?: TileConfig;
  tileFetch?: typeof fetch;
  production?: boolean;
  features?: FeatureRegistryMap;
  skipRegionLoader?: boolean;
}

function RegionLoaderBridge({ opts }: { opts?: SelectOptions }) {
  useRegionLoader(opts);
  return null;
}

const fmt = (n: number, d = 0) => n.toFixed(d);

export function App({ deps = {} }: { deps?: AppDeps } = {}) {
  const { state, dispatch } = useAppState();
  const { requestRoute, cancelRoute } = useRouteRunner(deps.workerOptions);
  const [pickMode, setPickMode] = useState<'start' | 'destination'>('destination');
  const [menuMode, setMenuMode] = useState<'docked' | 'expanded'>('docked');
  const [soundEnabled, setSoundEnabled] = useState(true);
  // Landing choice on the published site only (not in tests, not for automated browsers such as the e2e suite).
  const [showLanding, setShowLanding] = useState(
    () =>
      (typeof location !== 'undefined' && /[?&]landing(=|&|$)/.test(location.search)) ||
      ((deps.production ?? IS_PRODUCTION_BUILD) &&
      typeof navigator !== 'undefined' &&
      !navigator.webdriver &&
      typeof location !== 'undefined' &&
      !/[?&]plan(=|&|$)/.test(location.search)),
  );
  const [traceFrame, setTraceFrame] = useState<SearchTraceFrame | null>(null);
  const [rejectedPaths, setRejectedPaths] = useState<readonly RejectedPathOverlay[]>([]);
  const selection = selectSelection(state);

  const [customLayers, setCustomLayers] = useState<{
    rasters?: CustomCanvasLayer;
    routes?: CustomCanvasLayer;
    markers?: CustomCanvasLayer;
    chrome?: CustomCanvasLayer;
  }>({});

  const registerCanvasLayer = useCallback(
    (type: 'rasters' | 'routes' | 'markers' | 'chrome', draw: CustomCanvasLayer) => {
      setCustomLayers((prev) => ({ ...prev, [type]: draw }));
      return () => {
        setCustomLayers((prev) => {
          const next = { ...prev };
          delete next[type];
          return next;
        });
      };
    },
    [],
  );

  const registerRasters = useCallback(
    (draw: CustomCanvasLayer) => registerCanvasLayer('rasters', draw),
    [registerCanvasLayer],
  );
  const registerRoutes = useCallback(
    (draw: CustomCanvasLayer) => registerCanvasLayer('routes', draw),
    [registerCanvasLayer],
  );
  const registerMarkers = useCallback(
    (draw: CustomCanvasLayer) => registerCanvasLayer('markers', draw),
    [registerCanvasLayer],
  );
  const registerChrome = useCallback(
    (draw: CustomCanvasLayer) => registerCanvasLayer('chrome', draw),
    [registerCanvasLayer],
  );

  const onHover = useCallback(
    (pathIndex: number | null) =>
      dispatch({
        type: 'view/hover',
        sample: pathIndex === null || !selection.candidateId ? null : { candidateId: selection.candidateId, pathIndex },
      }),
    [dispatch, selection.candidateId],
  );

  const on3dStatus = useCallback(
    (status: Terrain3dStatus) => dispatch({ type: 'view/set3dStatus', status }),
    [dispatch],
  );

  const production = deps.production ?? IS_PRODUCTION_BUILD;
  const region = state.loadedRegion;
  const bundle = region.status === 'ready' ? region.bundle : null;
  const release = {
    appVersion: APP_VERSION,
    bundleVersion: bundle?.bundleVersion ?? '—',
    modelVersion: EXPECTED_MODEL_VERSION,
  };
  const m = state.currentMission;
  const can = selectCanRequestRoute(state);
  const run = state.routeRun;
  const pois = bundle?.manifest.pointsOfInterest ?? [];

  const setEndpoint = (which: 'start' | 'destination', point: LocalPoint | null, poiId: string | null) =>
    dispatch({
      type: which === 'start' ? 'mission/setStart' : 'mission/setDestination',
      endpoint: point ? { point, poiId } : null,
    });

  const onExport = () => {
    if (!bundle || run.kind !== 'finished' || run.response.status !== 'success') return;
    const json = serializeRouteExport({
      release,
      manifest: bundle.manifest,
      mission: m,
      response: run.response,
      selectedCandidateId: selection.candidateId,
    });
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFileName(release, selection.candidateId);
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (!bundle || run.kind !== 'finished' || run.response.status !== 'success') {
      const timer = window.setTimeout(() => {
        setTraceFrame(null);
        setRejectedPaths([]);
      }, 0);
      return () => window.clearTimeout(timer);
    }
    const response = run.response;
    const candidateId = selection.candidateId ?? response.candidates[0]?.candidateId ?? '';
    const snapshot = state;
    let cancel = false;
    void import('../routing/searchTrace')
      .then(({ computeSearchTraceAndCompare }) => {
        if (cancel) return;
        const request = buildRouteRequest(snapshot, response.requestId);
        if (!request) return;
        const traced = computeSearchTraceAndCompare(
          {
            manifest: {
              strictQualitySupported: bundle.manifest.strictQualitySupported,
              grid: bundle.manifest.grid,
            },
            bundleVersion: bundle.bundleVersion,
            elevation: bundle.elevation,
            slope: bundle.slope,
            roughness: bundle.roughness,
            quality: bundle.quality,
            exclusion: bundle.exclusion,
          },
          request,
          response.candidates,
          candidateId,
        );
        if (cancel) return;
        setTraceFrame(traced.frames[0] ?? null);
        setRejectedPaths(traced.rejectedPaths);
      })
      .catch(() => {
        if (!cancel) {
          setTraceFrame(null);
          setRejectedPaths([]);
        }
      });
    return () => {
      cancel = true;
    };
  }, [bundle, run, selection.candidateId, state]);

  const mapEl = bundle ? (
    <div className="map-canvas-container" style={{ position: 'relative' }}>
      <MapCanvas
        bundle={bundle}
        candidates={state.routeCandidates}
        selectedCandidateId={selection.candidateId}
        start={m.start?.point ?? null}
        destination={m.destination?.point ?? null}
        layers={state.display.layers}
        stale={state.isStale}
        hover={selection.hover}
        onPick={(p) => setEndpoint(pickMode, p, null)}
        customLayers={customLayers}
        traceFrame={traceFrame}
        rejectedPaths={rejectedPaths}
      />
      <div className="map-slots" style={{ display: 'none' }} aria-hidden="true">
        <Slot
          name="map-rasters"
          features={deps.features}
          props={{
            bundle,
            layers: state.display.layers,
            registerLayer: registerRasters,
          }}
        />
        <Slot
          name="map-routes"
          features={deps.features}
          props={{
            candidates: state.routeCandidates,
            selectedCandidateId: selection.candidateId,
            stale: state.isStale,
            hover: selection.hover,
            routeLayerVisible: state.display.layers.route.visible,
            registerLayer: registerRoutes,
          }}
        />
        <Slot
          name="map-markers"
          features={deps.features}
          props={{
            pois,
            start: m.start?.point ?? null,
            destination: m.destination?.point ?? null,
            poiLayerVisible: state.display.layers.poi.visible,
            onPick: (p) => setEndpoint(pickMode, p, null),
            registerLayer: registerMarkers,
          }}
        />
        <Slot
          name="map-chrome"
          features={deps.features}
          props={{
            grid: bundle.manifest.grid,
            crs: bundle.manifest.crs,
            registerLayer: registerChrome,
          }}
        />
      </div>
    </div>
  ) : null;

  return (
    <div className="app">
      {!deps.skipRegionLoader && <RegionLoaderBridge opts={deps.bundleSelection} />}
      {showLanding && <Landing onPlan={() => setShowLanding(false)} />}
      <header>
        <h1>MARS PATHFINDER</h1>
        {bundle?.manifest.synthetic && (
          <span className="badge synthetic" data-testid="synthetic-badge">
            SYNTHETIC DATA
          </span>
        )}
        <a className="header-link" href="marswalk-vr/index.html" target="_blank" rel="noopener">
          Marswalk VR
        </a>
        <span className="release" data-testid="release-id">
          {formatReleaseId(release)}
        </span>
      </header>

      {production && bundle?.manifest.synthetic && (
        <div role="alert" className="error banner" data-testid="synthetic-production-warning">
          ⚠ This production build is serving the SYNTHETIC fixture bundle ({bundle.bundleVersion}), not Mars data. Set the release bundle in
          bundles/index.json before publishing.
        </div>
      )}

      {region.status === 'loading' && <p role="status">Loading region bundle…</p>}
      {region.status === 'error' && (
        <div role="alert" className="error" data-testid="bundle-error">
          Region data failed at stage <code>{region.error.stage}</code>: {region.error.message}
        </div>
      )}

      {bundle && (
        <main>
          <StartMenuModal
            displayMode={menuMode}
            activeRegionId={bundle.manifest.bundleId}
            bundle={bundle}
            bundleLoading={false}
            pois={getUnifiedPoisForBundle(bundle)}
            currentStart={m.start?.point ?? null}
            currentDestination={m.destination?.point ?? null}
            soundEnabled={soundEnabled}
            onExpand={() => setMenuMode('expanded')}
            onCollapse={() => setMenuMode('docked')}
            onSwitchRegion={() => undefined}
            onSelectEndpoints={(start, destination) => {
              setEndpoint('start', start, null);
              setEndpoint('destination', destination, null);
            }}
            onLaunchMission={(payload) => {
              setEndpoint('start', payload.startPoint, null);
              setEndpoint('destination', payload.destinationPoint, null);
              dispatch({ type: 'mission/setPolicies', policies: [...payload.policies] });
              dispatch({ type: 'mission/setStrictQuality', value: payload.strictQuality });
              dispatch({ type: 'mission/setRoundTrip', value: payload.roundTrip });
              setMenuMode('docked');
              window.setTimeout(() => {
                requestRoute();
                if (payload.launchMode === 'enter-3d') dispatch({ type: 'view/setMode', mode: '3d' });
              }, 0);
            }}
            onToggleSound={() => setSoundEnabled((on) => !on)}
          />
          <section className="controls" aria-label="Mission settings">
            {/* Slot: mission-context */}
            <Slot
              name="mission-context"
              features={deps.features}
              props={{ manifest: bundle.manifest, release, production }}
              fallback={
                <p className="muted">
                  {bundle.manifest.title}. Educational simulation, not a safety assessment.
                </p>
              }
            />

            {/* Slot: destinations */}
            <Slot
              name="destinations"
              features={deps.features}
              props={{ pois, mission: m, setEndpoint }}
              fallback={
                <>
                  {(['start', 'destination'] as const).map((which) => (
                    <label key={which}>
                      {which === 'start' ? 'Start' : 'Destination'}{' '}
                      <select
                        aria-label={`${which} preset`}
                        value={m[which]?.poiId ?? ''}
                        onChange={(e) => {
                          const p = pois.find((x) => x.id === e.target.value);
                          setEndpoint(which, p ? p.position : null, p?.id ?? null);
                        }}
                      >
                        <option value="">{m[which] && !m[which]?.poiId ? 'custom point' : '— choose —'}</option>
                        {pois.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </>
              }
            />

            {/* Slot: endpoints */}
            <Slot
              name="endpoints"
              features={deps.features}
              props={{
                pickMode,
                setPickMode,
                start: m.start,
                destination: m.destination,
                grid: bundle.manifest.grid,
                setEndpoint,
              }}
              fallback={
                <fieldset>
                  <legend>Map click sets</legend>
                  {(['start', 'destination'] as const).map((w) => (
                    <label key={w}>
                      <input
                        type="radio"
                        name="pick"
                        checked={pickMode === w}
                        onChange={() => setPickMode(w)}
                      />{' '}
                      {w}
                    </label>
                  ))}
                </fieldset>
              }
            />

            {/* Slot: assumptions */}
            <Slot
              name="assumptions"
              features={deps.features}
              props={{
                mission: m,
                strictQualitySupported: bundle.manifest.strictQualitySupported,
                dispatch,
              }}
              fallback={
                <>
                  <fieldset>
                    <legend>Policies (changing triggers recalculation)</legend>
                    {ROUTE_POLICIES.map((p) => (
                      <label key={p}>
                        <input
                          type="checkbox"
                          checked={m.policies.includes(p)}
                          onChange={(e) => {
                            const next: RoutePolicyId[] = e.target.checked
                              ? ROUTE_POLICIES.filter((x) => x === p || m.policies.includes(x))
                              : m.policies.filter((x) => x !== p);
                            dispatch({ type: 'mission/setPolicies', policies: next });
                          }}
                        />{' '}
                        {p}
                      </label>
                    ))}
                  </fieldset>
                  <label>
                    <input
                      type="checkbox"
                      disabled={!bundle.manifest.strictQualitySupported}
                      checked={m.strictQuality}
                      onChange={(e) =>
                        dispatch({ type: 'mission/setStrictQuality', value: e.target.checked })
                      }
                    />{' '}
                    Strict quality (exclude low/unknown quality cells)
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={m.roundTrip}
                      onChange={(e) => dispatch({ type: 'mission/setRoundTrip', value: e.target.checked })}
                    />{' '}
                    Round trip
                  </label>
                </>
              }
            />

            {/* Slot: request-controls */}
            <Slot
              name="request-controls"
              features={deps.features}
              props={{
                requestRoute,
                cancelRoute,
                canRequest: can.ok,
                canReason: can.ok ? undefined : can.reason,
                isRunning: run.kind === 'running',
                candidateCount: state.routeCandidates.length,
              }}
              fallback={
                <div className="actions">
                  <button
                    type="button"
                    onClick={requestRoute}
                    disabled={!can.ok || run.kind === 'running'}
                    data-testid="calculate"
                  >
                    {state.routeCandidates.length ? 'Recalculate routes' : 'Calculate routes'}
                  </button>
                  {run.kind === 'running' && (
                    <button type="button" onClick={cancelRoute}>
                      Cancel
                    </button>
                  )}
                  {!can.ok && <span className="muted"> {can.reason}</span>}
                </div>
              }
            />

            {/* Slot: layer-controls */}
            <Slot
              name="layer-controls"
              features={deps.features}
              props={{ layers: state.display.layers, dispatch }}
              fallback={
                <fieldset>
                  <legend>Layers (display only)</legend>
                  {(Object.keys(state.display.layers) as LayerKey[]).map((k) => (
                    <label key={k}>
                      <input
                        type="checkbox"
                        checked={state.display.layers[k].visible}
                        onChange={(e) =>
                          dispatch({ type: 'view/setLayer', layer: k, visible: e.target.checked })
                        }
                      />{' '}
                      {k}
                    </label>
                  ))}
                </fieldset>
              }
            />

            <div role="radiogroup" aria-label="View mode">
              {(['2d', '3d'] as const).map((v) => (
                <label key={v}>
                  <input
                    type="radio"
                    name="view"
                    data-testid={`view-${v}`}
                    checked={state.viewMode === v}
                    onChange={() => dispatch({ type: 'view/setMode', mode: v })}
                  />{' '}
                  {v.toUpperCase()}
                </label>
              ))}
            </div>

            {/* Slot: sources */}
            <Slot
              name="sources"
              features={deps.features}
              props={{ sources: bundle.manifest.sources, limitations: bundle.manifest.limitations }}
            />
            {/* Slot: point-inspector */}
            <Slot
              name="point-inspector"
              features={deps.features}
              props={{ bundle, layers: state.display.layers }}
            />
          </section>

          <section className="view">
            {/* Slot: terrain-host */}
            <Slot
              name="terrain-host"
              features={deps.features}
              props={{
                viewMode: state.viewMode,
                bundle,
                candidates: state.routeCandidates,
                selection,
                camera: state.display.camera,
                terrain3dStatus: state.display.terrain3d,
                onCameraChange: (camera) => dispatch({ type: 'view/setCamera', camera }),
                onSelectCandidate: (candidateId) => dispatch({ type: 'route/select', candidateId }),
                onStatusChange: on3dStatus,
                fallback: mapEl,
              }}
              fallback={
                state.viewMode === '2d' ? (
                  mapEl
                ) : (
                  <TerrainSlot
                    viewProps={{
                      bundle,
                      candidates: state.routeCandidates,
                      selectedCandidateId: selection.candidateId,
                      highlightPathIndex: selection.hover?.pathIndex ?? null,
                      verticalExaggeration: 1,
                      camera: state.display.camera,
                      onCameraChange: (camera) => dispatch({ type: 'view/setCamera', camera }),
                      onSelectCandidate: (candidateId) => dispatch({ type: 'route/select', candidateId }),
                    }}
                    status={state.display.terrain3d}
                    onStatus={on3dStatus}
                    fallback={mapEl}
                    detectWebGL={deps.detectWebGL}
                    load={deps.loadTerrainView}
                  />
                )
              }
            />

            {/* Slot: profile */}
            <Slot
              name="profile"
              features={deps.features}
              fallback={<ElevationProfile selection={selection} onHover={onHover} />}
              props={{ selection, onHover }}
            />

            {/* Slot: media */}
            <Slot
              name="media"
              features={deps.features}
              props={{ displayAssets: bundle.manifest.displayAssets }}
            />

            <ContextImageryStatus config={deps.tileConfig ?? TILE_CONFIG} fetchImpl={deps.tileFetch} />
            <OptionalAssetsStatus bundle={bundle} />
          </section>

          <section className="results" aria-live="polite">
            <h2>Result</h2>

            {/* Slot: result-state */}
            <Slot
              name="result-state"
              features={deps.features}
              fallback={
                <>
                  <p
                    data-testid="route-status"
                    data-status={run.kind === 'finished' ? run.response.status : run.kind}
                  >
                    {run.kind === 'idle' && 'No route calculated yet.'}
                    {run.kind === 'running' && `Calculating… (${run.exploredNodes} cells explored)`}
                    {run.kind === 'finished' && (
                      <span data-status={run.response.status}>Status: {run.response.status}</span>
                    )}
                    {state.isStale && (
                      <strong className="stale" data-testid="stale">
                        {' '}
                        STALE — inputs changed, recalculate.
                      </strong>
                    )}
                  </p>
                  {run.kind === 'finished' &&
                    run.response.status !== 'success' &&
                    'message' in run.response && (
                      <p className="error" data-testid="route-message">
                        {run.response.message}
                      </p>
                    )}
                </>
              }
              props={{ run, isStale: state.isStale }}
            />

            {/* Slot: comparison */}
            <Slot
              name="comparison"
              features={deps.features}
              fallback={
                <ol>
                  {state.routeCandidates.map((c) => {
                    const x = c.outbound.metrics;
                    return (
                      <li key={c.candidateId}>
                        <label>
                          <input
                            type="radio"
                            name="candidate"
                            data-testid={`candidate-${c.candidateId}`}
                            checked={selection.candidateId === c.candidateId}
                            onChange={() => dispatch({ type: 'route/select', candidateId: c.candidateId })}
                          />{' '}
                          <strong>{c.policies.join(' + ')}</strong>: {fmt(x.horizontalDistance_m)} m horizontal, ascent {fmt(x.ascent_m, 1)} m, max slope {fmt(x.maxTerrainSlope_deg, 1)}°, max grade {fmt(x.maxAbsEdgeGrade_deg, 1)}°, unknown quality {fmt(x.unknownQualityLength_m)} m ({fmt(x.unknownQualityPct)}% of distance), low quality {fmt(x.lowQualityLength_m)} m · {c.missionStatus}
                        </label>
                        <ul className="muted">
                          {c.explanation.map((e, i) => (
                            <li key={i}>{e}</li>
                          ))}
                        </ul>
                      </li>
                    );
                  })}
                </ol>
              }
              props={{
                candidates: state.routeCandidates,
                selectedCandidateId: selection.candidateId,
                dispatch,
              }}
            />

            <MarswalkLaunch
              bundle={bundle}
              candidate={selection.candidate}
              mission={m}
              modelVersion={EXPECTED_MODEL_VERSION}
              isStale={state.isStale}
            />

            {/* Slot: mission-evidence */}
            <Slot
              name="mission-evidence"
              features={deps.features}
              props={{ selection, manifest: bundle.manifest }}
            />

            {/* Slot: json-export */}
            <Slot
              name="json-export"
              features={deps.features}
              fallback={
                <button
                  type="button"
                  onClick={onExport}
                  data-testid="export-json"
                  disabled={!(run.kind === 'finished' && run.response.status === 'success')}
                >
                  Export JSON
                </button>
              }
              props={{
                onExport,
                canExport: run.kind === 'finished' && run.response.status === 'success',
              }}
            />

            {/* Slot: briefing */}
            <Slot
              name="briefing"
              features={deps.features}
              fallback={<Briefing selection={selection} release={release} manifest={bundle.manifest} mission={m} />}
              props={{ selection, release, manifest: bundle.manifest, mission: m }}
            />
          </section>
        </main>
      )}
    </div>
  );
}
