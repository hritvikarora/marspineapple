# TASK-007 handoff
Status: REVIEW
Foundation revision: 17fbf7191017058d82bc896084941f79719cb1d8 (tag: ui-foundation-v1)
Branch/commit: task/TASK-007-map-chrome (implementation commit baaaedc)
Changed paths:
  - src/ui/features/map-chrome/entry.tsx
  - src/ui/features/map-chrome/MapChrome.tsx
  - src/ui/features/map-chrome/scale.ts
  - src/ui/features/map-chrome/map-chrome.css
  - src/ui/features/map-chrome/MapChrome.test.tsx
  - handoffs/TASK-007.md
Entry/slot: `src/ui/features/map-chrome/entry.tsx` targeting slot `'map-chrome'`.

Behavior delivered:
1. Canvas Boundary & Grid Extent:
   - Registers custom canvas drawing layer via `registerLayer` replacing baseline chrome.
   - Draws outer perimeter border with high-contrast corner accent brackets marking the frozen raster extent.
2. Grid North Orientation:
   - Draws a circular compass rose in the top-right corner with a two-tone needle pointing directly to Grid North (+North, row 0).
3. Dynamic Meter Scale Bar:
   - Uses `calculateScaleBar` to compute human-readable round intervals (e.g. 50m, 100m, 200m, 500m, 1km) based on `scaleX`.
   - Renders segmented scale bar in the bottom-left with high-contrast dark backdrop for readability across all raster layers.
4. Extent and CRS Information Panel:
   - Displays Coordinate Reference System name/description, planar bounding box (W, E, S, N in meters), and cell resolution in DOM.

Scenarios checked:
- Valid FeatureModule contract and entry discovery.
- Canvas layer registration and unmount cleanup.
- Drawing boundary outline, North arrow, and scale bar on canvas context.
- Scale bar round-number calculations and width scaling.
- DOM metadata rendering for CRS, extent, and cell resolution.
- Strict isolation check and diff check against `ui-foundation-v1`.

Commands and results:
- `npm run typecheck`: PASS (0 errors, strict TypeScript mode)
- `npm run lint`: PASS (0 errors, 0 warnings)
- `npm test -- src/ui/features/map-chrome`: PASS (5 tests passed)
- `node src/ui/scripts/check-isolation.mjs --task=TASK-007`: PASS (`[PASS] map-chrome is strictly isolated`)
- `node src/ui/scripts/check-isolation.mjs --task=TASK-007 --diff --base=ui-foundation-v1`: PASS (`✓ Ownership diff verified for TASK-007: touched files strictly allowed`)
- `npm run build`: PASS (Production build succeeded in 204ms)

Review evidence:
- Unit & integration tests in `src/ui/features/map-chrome/MapChrome.test.tsx`.

External limitations:
- Projection units are strictly local planar meters as defined by `manifest.crs`.

Contract change requests:
- None.
