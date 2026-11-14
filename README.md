# MARS PATHFINDER

Static, offline-capable Mars route planner (NASA Space Apps 2026 hackathon prototype).
React + TypeScript + Vite. No backend, no API keys, no accounts. Routes are computed by a
deterministic solver in a Web Worker over a versioned, pre-processed terrain bundle.

> **Status:** integration foundation (Role C, Phases 1–2). Default data is the **SYNTHETIC** fixture
> `public/bundles/synthetic-v0`. The routing engine, map UI and 3D view are clearly-marked
> placeholders for their owners. Educational simulation, not a safety assessment.

## Setup

Requires **Node ≥ 20.19** (tested with Node 24.22, npm 11).

```bash
npm install
npm run dev          # (or npm start) dev server, http://localhost:5173
npm run typecheck    # tsc -b, strict
npm run lint         # eslint
npm test             # vitest (unit + jsdom app smoke)
npm run build        # -> dist/
npm run preview      # serve dist/ at http://localhost:4173
npm run smoke        # headless Chrome journey against a running preview (needs local Chrome)
npm run smoke:no-webgl  # same, with WebGL disabled (3D must degrade to 2D)
npm run audit        # after build: gzip budgets + console/secret/local-path scan of dist/
npm run audit:release   # same, but FAILS while production still serves the synthetic bundle
npm run fixture      # regenerate the synthetic bundle (deterministic)
npm run validate-bundle -- public/bundles/<bundle-dir>
```

**Offline / local demo:** `dist/` is fully static with relative paths (`base: './'`), so it works under
any sub-path. Don't open `index.html` via `file://` (module workers are blocked); serve it instead:
`npx vite preview` or `cd dist && python3 -m http.server 8080`.

## Architecture

```mermaid
flowchart LR
  subgraph Offline["Offline preprocessing (Role A)"]
    SRC[NASA products] --> PROC[scripts/data/* Python/GDAL] --> BUNDLE[public/bundles/&lt;version&gt;<br/>manifest.json + .f32/.u8 rasters]
  end
  BUNDLE -->|fetch| LOAD[loadAndValidateBundle<br/>src/data]
  LOAD -->|GridBundle immutable| STORE[(App state<br/>src/state)]
  STORE -->|RouteRequest| CLIENT[RouteWorkerClient<br/>src/worker/client.ts]
  CLIENT -->|copy of rasters + request| WORKER[[routing.worker<br/>src/routing solver]]
  WORKER -->|RouteResponse progress/success/no-path/...| CLIENT
  CLIENT -->|stale-guarded responses| STORE
  STORE --> MAP[2D map + controls<br/>src/ui]
  STORE --> T3D[3D terrain<br/>src/terrain3d]
  STORE --> EXPORT[Deterministic JSON export<br/>src/export]
```

* One source of truth: `src/state/store.ts` (pure reducer, tested) exposed via `useAppState()`.
  The same `GridBundle` and `RouteCandidate` objects feed map, 3D and export.
* Invalidation rules, worker lifecycle, buffer ownership, coordinate conventions and JSON examples:
  **[INTERFACE.md](INTERFACE.md)**. Folder owners: **[OWNERS.md](OWNERS.md)**.
* Release identifier `app · bundle · model` is shown in the header and embedded in exports.
* Config that changes data/model behaviour lives in `src/config.ts`. All `VITE_*` values are public
  (baked into the static build); the app uses no secrets.
* **Selection sync:** `selectedCandidateId` and the hovered profile sample (`display.hover`) live in
  the store. Map, elevation profile, 3D props, briefing and export all read the single
  `selectSelection(state)` view-model, so they cannot disagree (tested in `tests/selectionSync.test.tsx`
  and in the browser smoke).
* **3D isolation:** `src/app/TerrainSlot.tsx` probes WebGL, lazy-loads `src/terrain3d` behind
  `Suspense`, and wraps it in an error boundary. No WebGL, a chunk-load failure, a render throw or a
  reported context loss (`onError`) records `display.terrain3d` and falls back to the 2D map with an
  accurate message (+ Retry when WebGL exists). Profile and briefing are always visible.
* **Optional context imagery:** `src/app/tiles.ts` (NASA Trek WMTS, CORS-enabled) is **off by
  default** (`VITE_TILES=trek` to enable). Every fetch settles within 4 s (timeout/offline/http-error)
  and nothing in bundle loading or routing waits for it.

### Swapping in the real bundle (Role A)

1. Put the bundle in `public/bundles/<bundleId>/` (manifest + rasters, INTERFACE.md §2) and run
   `npm run validate-bundle -- public/bundles/<bundleId>`.
2. Edit `public/bundles/index.json`: set `"release": "<bundleId>"` and add an entry to `bundles`.
   Keep `"dev": "synthetic-v0"` so the dev server and tests stay on the fixture.
3. `npm run build && npm run audit:release` — passes only when production no longer serves a
   `synthetic: true` manifest. Until then every production build shows a red
   "serving the SYNTHETIC fixture" banner.
4. Ad-hoc overrides without editing files (public build-time env vars):
   `VITE_BUNDLE=<bundleId> npm run build` or `VITE_BUNDLE_MANIFEST=<url> npm run dev`
   (precedence: `VITE_BUNDLE_MANIFEST` > `VITE_BUNDLE` > `index.json`).

### Asset budget (gzip, enforced by `npm run audit`)

| Item | Budget | Current |
|---|---|---|
| Entry JS (initial load) | 150 KB | ~79 KB |
| All JS incl. lazy chunks + worker | 450 KB | ~84 KB |
| Routing worker | 50 KB | ~4 KB |
| CSS | 30 KB | ~0.5 KB |
| Each region bundle | 15 MB | synthetic 3.5 KB |
| Total `dist/` raw | 60 MB | ~0.3 MB |

three.js and Role B code must stay in the lazy `src/terrain3d` chunk; large textures/panoramas should be
`displayAssets` loaded on demand.

```
src/
  contracts/   canonical types + shared coordinate adapter      (Role C)
  data/        loadAndValidateBundle + BundleLoadError           (Role C)
  state/       store, context, useRouteRunner                    (Role C)
  worker/      client (typed wrapper), handler, worker entry     (Role C protocol)
  routing/     solver — placeholderEngine.ts is a STUB           (Ayush)
  app/         composition: bundle selection, 3D slot, tiles     (Role C)
  ui/          App shell, MapCanvas, ElevationProfile, Briefing — minimal STUBS (Dhani)
  terrain3d/   TerrainView — STUB with agreed props              (Role B)
  export/      deterministic serializer                          (Role C)
public/bundles/synthetic-v0/   synthetic fixture + INSPECT.txt   (generated)
scripts/       make-fixture, validate-bundle, smoke-preview
tests/         integration tests (loader, store, worker client, export, engine sanity, app smoke)
docs/examples/ request/response JSON examples
```

## The synthetic fixture

20×12 cells, 10 m, **not Mars data**. A ridge (col 10) with a north gap through an *unknown-quality*
corridor and a south gap through good terrain, a rough patch, a low-quality strip, a NaN hole, a manual
exclusion and a sealed basin (guaranteed no-path). Recognisable corners: NW −2600.0 m, NE −2581.0 m,
SW −2605.5 m. `INSPECT.txt` prints every layer as a table. Presets: outpost → east bench gives a
shortest route (≈175 m, ≈82 m unknown quality) vs an uncertainty-aware route (≈207 m, 0 m unknown).

## How to plug in your part

**Ayush (routing).** Replace `src/routing/placeholderEngine.ts`; keep the export
`solveRoute(grid: RoutingGrid, req: RouteRequest, hooks) => RouteFinalResponse` and `MODEL_VERSION` in
`src/routing/index.ts`. Echo `requestId`/`bundleVersion`/`modelVersion`; call `hooks.shouldStop()`
periodically (timeouts) and `hooks.onProgress(n)` sparingly. Use `cellCenter`/`pointToCell` from
`src/contracts/grid.ts`. Put your tests in `src/routing/*.test.ts` (vitest picks them up). Bump
`MODEL_VERSION` whenever weights/limits change. Don't edit state or UI files — ask Role C.

**Dhani (UI).** Own `src/ui/`. `ElevationProfile` and `Briefing` are minimal stubs; derive everything from
`selectSelection(state)` and write hover with the `view/hover` action. Read state with `useAppState()` and dispatch actions from
`src/state/store.ts`; run routes with `useRouteRunner()` (`requestRoute`, `cancelRoute`). Never touch
the worker. Use the `isStale` flag, `routeRun` state and `selectedCandidateId` (single selection for
map/profile/3D/briefing). Keep the `data-testid`s / accessible labels used by `tests/app.smoke.test.tsx`
and `scripts/smoke-preview.mjs` (or update them with Role C). Export JSON via `serializeRouteExport`.

**Role A (data).** Produce `public/bundles/<bundleId>/manifest.json` + raw little-endian rasters exactly
as in INTERFACE.md §2 (look at `scripts/make-fixture.mjs` for a reference writer and the synthetic manifest
as a template). Validate with `npm run validate-bundle -- public/bundles/<dir>`. Any change to analytical
bytes ⇒ new `bundleVersion`. Keep raw archives outside the repo (`/raw` is git-ignored). Then tell Role C
to point `BUNDLE_MANIFEST_URL` in `src/config.ts` at it.

**Role B (3D).** Own `src/terrain3d/`. Implement the default export with `TerrainViewProps`
(`src/terrain3d/TerrainView.tsx`). `TerrainSlot` already lazy-loads it, probes WebGL first and catches
render errors; keep three.js imports inside this folder so they stay out of the initial bundle. Use
`toSceneXYZ` (X=east, Y=elev, Z=−north). Never mutate bundle arrays. Highlight
`highlightPathIndex` (shared hover) and `selectedCandidateId`; call `onSelectCandidate`/`onCameraChange`
instead of keeping your own copies. On `webglcontextlost`, a missing texture or bad terrain call
`onError({ kind, message })` — the app degrades to 2D. Keep `data-testid="terrain-view"` with
`data-selected-candidate` / `data-hover-index` (used by tests and smoke).

**Role C (integration).** Remaining: point `release` at Role A's bundle, integrate Dhani's and Role B's
real components, full e2e journey incl. failure modes, release checklist, deploy, demo, submission.

## Limitations (current)

* Synthetic data only; no NASA products are integrated yet, so no source credits are claimed.
* Placeholder solver limits (max slope 25°, max edge grade 20°) and weights are unvalidated demo values.
* Tested in headless Chrome only.
