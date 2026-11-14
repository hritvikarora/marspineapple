# TASK-001 handoff
Status: DONE (Accepted for Local Demo Development)
Foundation base revision: 5c2725ade58cea52073aad30d4676e849d22c1cf
Branch/commit: task/TASK-001-foundation (implementation commit f74b45a4934a067d989068c7a10587e7e586794b; acceptance tag ui-foundation-v1)
Acceptance note: Formally accepted by user on 2026-11-14 as the foundation baseline for local demo development, with known verification limitations (automated disposable-tree isolation runner and physical screen-reader/hardware testing deferred). Explicit Git diff and import review is required during leaf verification.
Changed paths:
  - src/ui/App.tsx
  - src/ui/MapCanvas.tsx
  - src/ui/app.css
  - src/ui/shared/types.ts
  - src/ui/shared/tokens.css
  - src/ui/shared/registry.ts
  - src/ui/shared/Slot.tsx
  - src/ui/shared/FeatureHarness.tsx
  - src/ui/shared/index.ts
  - src/ui/shared/primitives/Button.tsx
  - src/ui/shared/primitives/Panel.tsx
  - src/ui/shared/primitives/Field.tsx
  - src/ui/shared/primitives/InlineNotice.tsx
  - src/ui/shared/primitives/ModalDrawer.tsx
  - src/ui/shared/primitives/VisuallyHidden.tsx
  - src/ui/shared/primitives/MeasurementFormat.tsx
  - src/ui/shared/primitives/formatters.ts
  - src/ui/shared/primitives/index.ts
  - src/ui/shared/foundation.test.tsx
  - src/ui/scripts/check-isolation.mjs
  - src/ui/scripts/capture-viewports.mjs
  - handoffs/TASK-001.md
  - handoffs/task-001-desktop-1440x900.png
  - handoffs/task-001-mobile-390x844.png
  - TASK_STATUS.md
Entry/slot: Shell in `src/ui/App.tsx`; public foundation exports in `src/ui/shared/index.ts`.

Behavior delivered:
1. Connected all 20 feature slots to the application:
   - All 20 slots (`mission-context`, `destinations`, `endpoints`, `assumptions`, `request-controls`, `map-chrome`, `map-rasters`, `layer-controls`, `map-markers`, `map-routes`, `comparison`, `profile`, `mission-evidence`, `result-state`, `terrain-host`, `media`, `sources`, `briefing`, `json-export`, `point-inspector`) are mounted in `src/ui/App.tsx`.
   - Wired the 4 canvas slots (`map-chrome`, `map-rasters`, `map-markers`, `map-routes`) to `MapCanvas.customLayers` via typed registration hooks (`registerCanvasLayer`).
   - Implemented dynamic layer replacement in `MapCanvas.tsx`: when a custom layer hook (`rasters`, `routes`, `markers`, or `chrome`) is registered, it replaces baseline rendering for that section; when absent or unmounted, MapCanvas cleanly falls back to its baseline drawing routines.
2. Strongly typed slot props contract:
   - Defined `SlotPropsMap` in `src/ui/shared/types.ts` mapping every slot to an explicit, typed interface rather than a generic `Record<string, unknown>`.
   - Bound `FeatureModule<S>` and `Slot<S>` to `SlotPropsMap[S]` without using `any`.
   - Exported `ALL_FEATURE_SLOTS`, `AnyFeatureModule`, and `FeatureRegistryMap`.
3. Responsive shell at 390×844 and 1440×900:
   - Completely resolved mobile squeezing in `src/ui/app.css`: below 900px, the layout switches to a single column stack with `width: 100%`, preventing sidebar squishing and eliminating horizontal canvas overflow.
   - Preserved desktop two-column layout at 1440×900.
4. Shared primitives, accessible touch targets, and modal drawer:
   - Ensured minimum 44px touch targets across buttons, form controls, and clickable labels.
   - Added visible focus indicators (`:focus-visible` with 2px `#73d0c1` outline and offset).
   - `ModalDrawer` implements full accessible dialog mechanics: focus containment (Tab/Shift+Tab wrapping), Escape key dismissal, background interaction blocking via modal overlay, and focus restoration to the trigger element upon closing.
5. Complete INTEGRATION.md §5 validation script:
   - `src/ui/scripts/check-isolation.mjs` validates the 21-task dependency structure (star topology), checks git ownership diffs, verifies import restrictions (rejects sibling imports and unapproved dependencies such as `leaflet`), validates slug-to-slot registry mappings, and enforces duplicate slot rejection (throwing errors if multiple modules target the same slot).
6. Real application lifecycle test harness:
   - Extended `FeatureHarness` with `mountInApp` option, allowing a single feature to be tested through the real `App` shell, state reducer, and canvas lifecycle.
   - Added meaningful tests in `src/ui/shared/foundation.test.tsx` proving that registered canvas layers replace baseline rendering and cleanly deregister upon unmount without side effects.

Scenarios checked:
- End-to-end mission planning journey with zero leaves (`tests/app.smoke.test.tsx`, `scripts/smoke-preview.mjs`).
- Graceful 3D degradation to 2D canvas with WebGL disabled (`scripts/smoke-preview.mjs --no-webgl`, `tests/terrain3d.test.tsx`).
- Selection and hover synchronization across Canvas map, elevation profile, 3D slot, and briefing (`tests/selectionSync.test.tsx`).
- State invalidation rules: mission input changes mark routes stale; display/view toggles do not (`tests/store.test.ts`).
- Slot fallback rendering when features are absent (`src/ui/shared/foundation.test.tsx`).
- Duplicate slot registration rejection (`src/ui/shared/foundation.test.tsx`).
- Slot error boundary catches feature crashes without crashing the app (`src/ui/shared/foundation.test.tsx`).
- UI primitives keyboard accessibility, visible focus, and ARIA linkage (`src/ui/shared/foundation.test.tsx`).
- ModalDrawer focus containment, background blocking, Escape closing, and focus return (`src/ui/shared/foundation.test.tsx`).
- Real App harness integration: custom canvas layer registration, replacement, and unmount cleanup (`src/ui/shared/foundation.test.tsx`).
- Canvas layer extensibility for rasters, routes, markers, and chrome (`src/ui/shared/foundation.test.tsx`).
- Feature isolation checking with zero and valid features (`node src/ui/scripts/check-isolation.mjs`).
- Responsive layout verified at 1440×900 and 390×844 (`src/ui/scripts/capture-viewports.mjs`).

Commands and results:
- `npm run typecheck`: PASS (0 errors, strict TypeScript mode)
- `npm run lint`: PASS (0 errors, 0 warnings across entire repository)
- `npm test`: PASS (12 test files, 94 passed)
- `npm run build`: PASS (production bundle built in 298ms; initial entry JS gzip 83.2 KB within 150 KB budget)
- `npm run audit`: PASS (gzip budgets satisfied; expected synthetic fixture warning)
- `npm run smoke`: PASS (headless Chrome journey against running vite preview on port 4173)
- `npm run smoke:no-webgl`: PASS (headless Chrome with WebGL disabled degrades cleanly to 2D canvas)
- `node src/ui/scripts/check-isolation.mjs`: PASS
- Unrun checks: Physical mobile hardware and manual screen reader testing (simulated with Playwright and jsdom accessibility checks).

Review evidence:
- Desktop (1440×900): `handoffs/task-001-desktop-1440x900.png`
- Mobile (390×844): `handoffs/task-001-mobile-390x844.png`

External limitations:
- Region data is currently synthetic (`synthetic-v0`). Production release remains blocked on Role A real bundle delivery.
- Route engine is Ayush's placeholder engine in `src/routing/`.
- 3D terrain component is Role B's stub in `src/terrain3d/`.
- `RegionManifest.displayAssets` and `SourceRecord` schemas currently lack rover telemetry and detailed source processing arrays (blocking advanced panorama and provenance features in TASK-017 and TASK-018).

Contract change requests:
- None. All implementation work strictly reuses existing contracts and boundaries within `src/ui/**`.
