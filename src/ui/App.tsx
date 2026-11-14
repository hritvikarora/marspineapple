/**
 * ⚠️ MINIMAL APP SHELL — layout/UX OWNER: Dhani. Composition (data loading, state, worker
 * wiring) is Role C. Replace the markup freely; keep using `useAppState` + `useRouteRunner`.
 */
import { useCallback, useState } from 'react';
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
import { useAppState } from '../state/context';
import { selectCanRequestRoute, selectSelection, type LayerKey, type Terrain3dStatus } from '../state/store';
import { useRouteRunner } from '../state/useRouteRunner';
import type { RouteWorkerClientOptions } from '../worker/client';
import { Briefing } from './Briefing';
import { ElevationProfile } from './ElevationProfile';
import { MapCanvas } from './MapCanvas';

/** Injection points for tests/integration; production uses the defaults. */
export interface AppDeps {
  workerOptions?: RouteWorkerClientOptions;
  bundleSelection?: SelectOptions;
  detectWebGL?: () => WebGLSupport;
  loadTerrainView?: TerrainLoader;
  tileConfig?: TileConfig;
  tileFetch?: typeof fetch;
  production?: boolean;
}

const fmt = (n: number, d = 0) => n.toFixed(d);

export function App({ deps = {} }: { deps?: AppDeps } = {}) {
  const { state, dispatch } = useAppState();
  const { requestRoute, cancelRoute } = useRouteRunner(deps.workerOptions);
  useRegionLoader(deps.bundleSelection);
  const [pickMode, setPickMode] = useState<'start' | 'destination'>('destination');
  const selection = selectSelection(state);
  const onHover = useCallback(
    (pathIndex: number | null) =>
      dispatch({ type: 'view/hover', sample: pathIndex === null || !selection.candidateId ? null : { candidateId: selection.candidateId, pathIndex } }),
    [dispatch, selection.candidateId],
  );
  const on3dStatus = useCallback((status: Terrain3dStatus) => dispatch({ type: 'view/set3dStatus', status }), [dispatch]);
  const production = deps.production ?? IS_PRODUCTION_BUILD;

  const region = state.loadedRegion;
  const bundle = region.status === 'ready' ? region.bundle : null;
  const release = { appVersion: APP_VERSION, bundleVersion: bundle?.bundleVersion ?? '—', modelVersion: EXPECTED_MODEL_VERSION };
  const m = state.currentMission;
  const can = selectCanRequestRoute(state);
  const run = state.routeRun;
  const pois = bundle?.manifest.pointsOfInterest ?? [];

  const setEndpoint = (which: 'start' | 'destination', point: LocalPoint | null, poiId: string | null) =>
    dispatch({ type: which === 'start' ? 'mission/setStart' : 'mission/setDestination', endpoint: point ? { point, poiId } : null });

  const onExport = () => {
    if (!bundle || run.kind !== 'finished' || run.response.status !== 'success') return;
    const json = serializeRouteExport({ release, manifest: bundle.manifest, mission: m, response: run.response, selectedCandidateId: selection.candidateId });
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFileName(release, selection.candidateId);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000); // revoking synchronously can cancel the download
  };

  const mapEl = bundle ? (
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
    />
  ) : null;

  return (
    <div className="app">
      <header>
        <h1>MARS PATHFINDER</h1>
        {bundle?.manifest.synthetic && <span className="badge synthetic" data-testid="synthetic-badge">SYNTHETIC DATA</span>}
        <span className="release" data-testid="release-id">{formatReleaseId(release)}</span>
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
          <section className="controls" aria-label="Mission settings">
            <p className="muted">{bundle.manifest.title}. Educational simulation, not a safety assessment.</p>
            {(['start', 'destination'] as const).map((which) => (
              <label key={which}>
                {which === 'start' ? 'Start' : 'Destination'}{' '}
                <select
                  aria-label={`${which} preset`}
                  data-testid={`${which}-preset`}
                  value={m[which]?.poiId ?? ''}
                  onChange={(e) => {
                    const p = pois.find((x) => x.id === e.target.value);
                    setEndpoint(which, p ? p.position : null, p?.id ?? null);
                  }}
                >
                  <option value="">{m[which] && !m[which]?.poiId ? 'custom point' : '— choose —'}</option>
                  {pois.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </label>
            ))}
            <fieldset>
              <legend>Map click sets</legend>
              {(['start', 'destination'] as const).map((w) => (
                <label key={w}>
                  <input type="radio" name="pick" checked={pickMode === w} onChange={() => setPickMode(w)} /> {w}
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend>Policies (changing triggers recalculation)</legend>
              {ROUTE_POLICIES.map((p) => (
                <label key={p}>
                  <input
                    type="checkbox"
                    checked={m.policies.includes(p)}
                    onChange={(e) => {
                      const next: RoutePolicyId[] = e.target.checked ? ROUTE_POLICIES.filter((x) => x === p || m.policies.includes(x)) : m.policies.filter((x) => x !== p);
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
                onChange={(e) => dispatch({ type: 'mission/setStrictQuality', value: e.target.checked })}
              />{' '}
              Strict quality (exclude low/unknown quality cells)
            </label>
            <label>
              <input type="checkbox" checked={m.roundTrip} onChange={(e) => dispatch({ type: 'mission/setRoundTrip', value: e.target.checked })} /> Round trip
            </label>
            <div className="actions">
              <button type="button" onClick={requestRoute} disabled={!can.ok || run.kind === 'running'} data-testid="calculate">
                {state.routeCandidates.length ? 'Recalculate routes' : 'Calculate routes'}
              </button>
              {run.kind === 'running' && <button type="button" onClick={cancelRoute} data-testid="cancel-route">Cancel</button>}
              {!can.ok && <span className="muted"> {can.reason}</span>}
            </div>
            <fieldset>
              <legend>Layers (display only)</legend>
              {(Object.keys(state.display.layers) as LayerKey[]).map((k) => (
                <label key={k}>
                  <input type="checkbox" checked={state.display.layers[k].visible} onChange={(e) => dispatch({ type: 'view/setLayer', layer: k, visible: e.target.checked })} /> {k}
                </label>
              ))}
            </fieldset>
            <div role="radiogroup" aria-label="View mode">
              {(['2d', '3d'] as const).map((v) => (
                <label key={v}>
                  <input type="radio" name="view" data-testid={`view-${v}`} checked={state.viewMode === v} onChange={() => dispatch({ type: 'view/setMode', mode: v })} /> {v.toUpperCase()}
                </label>
              ))}
            </div>
          </section>

          <section className="view">
            {state.viewMode === '2d' ? (
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
            )}
            <ElevationProfile selection={selection} onHover={onHover} />
            <OptionalAssetsStatus bundle={bundle} />
            <ContextImageryStatus config={deps.tileConfig ?? TILE_CONFIG} fetchImpl={deps.tileFetch} />
          </section>

          <section className="results" aria-live="polite">
            <h2>Result</h2>
            <p data-testid="route-status" data-status={run.kind === 'finished' ? run.response.status : run.kind}>
              {run.kind === 'idle' && 'No route calculated yet.'}
              {run.kind === 'running' && `Calculating… (${run.exploredNodes} cells explored)`}
              {run.kind === 'finished' && <span data-status={run.response.status}>Status: {run.response.status}</span>}
              {state.isStale && <strong className="stale" data-testid="stale"> STALE — inputs changed, recalculate.</strong>}
            </p>
            {run.kind === 'finished' && run.response.status !== 'success' && 'message' in run.response && <p className="error" data-testid="route-message">{run.response.message}</p>}
            <ol>
              {state.routeCandidates.map((c) => {
                const x = c.outbound.metrics;
                return (
                  <li key={c.candidateId}>
                    <label>
                      <input type="radio" name="candidate" data-testid={`candidate-${c.candidateId}`} checked={selection.candidateId === c.candidateId} onChange={() => dispatch({ type: 'route/select', candidateId: c.candidateId })} />{' '}
                      <strong>{c.policies.join(' + ')}</strong>: {fmt(x.horizontalDistance_m)} m horizontal, ascent {fmt(x.ascent_m, 1)} m, max slope {fmt(x.maxTerrainSlope_deg, 1)}°, max grade {fmt(x.maxAbsEdgeGrade_deg, 1)}°, unknown quality {fmt(x.unknownQualityLength_m)} m ({fmt(x.unknownQualityPct)}% of distance), low quality {fmt(x.lowQualityLength_m)} m · {c.missionStatus}
                    </label>
                    <ul className="muted">{c.explanation.map((e, i) => <li key={i}>{e}</li>)}</ul>
                  </li>
                );
              })}
            </ol>
            <button type="button" onClick={onExport} data-testid="export-json" disabled={!(run.kind === 'finished' && run.response.status === 'success')}>
              Export JSON
            </button>
            <Briefing selection={selection} release={release} manifest={bundle.manifest} mission={m} />
          </section>
        </main>
      )}
    </div>
  );
}
