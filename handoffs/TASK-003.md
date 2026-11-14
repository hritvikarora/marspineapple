# TASK-003 handoff
Status: REVIEW
Foundation revision: 17fbf7191017058d82bc896084941f79719cb1d8 (tag: ui-foundation-v1)
Branch/commit: task/TASK-003-destinations (implementation commit 507c90f)
Changed paths:
  - src/ui/features/destinations/entry.tsx
  - src/ui/features/destinations/Destinations.tsx
  - src/ui/features/destinations/destinations.css
  - src/ui/features/destinations/Destinations.test.tsx
  - handoffs/TASK-003.md
Entry/slot: `src/ui/features/destinations/entry.tsx` targeting slot `'destinations'`.

Behavior delivered:
1. Science Destination Preset Filtering:
   - Filters `bundle.manifest.pointsOfInterest` strictly to items with `kind === 'science-stop'`, excluding outposts and general context landmarks.
   - If no science stops exist in the loaded region, renders a helpful informative fallback without breaking.
2. Accessible Selector & Quick-Pick Chips:
   - Provides an accessible `<select>` dropdown with 44px minimum touch target, clear label, and option list displaying name and planar meter coordinates (`east_m`, `north_m`).
   - Quick-select chip buttons allow immediate single-click destination selection with keyboard focus and active pressed state.
3. State Preservation:
   - Dispatches `setEndpoint('destination', point, poiId)`.
   - Never clears or mutates the mission start point (`state.currentMission.start`).
   - When clearing selection, dispatches null destination while leaving start intact.
4. Scientific Honesty & Destination Details:
   - Shows selected destination details card with exact planar meter coordinates (`east_m`, `north_m`), positional uncertainty (±meters), and clear purpose description.
   - Accurately tags official IAU nomenclature vs mission target, and surfaces synthetic target warnings when `poi.synthetic` is true.

Scenarios checked:
- Valid FeatureModule contract and entry discovery.
- Filters POIs to only `science-stop` entries.
- Fallback message when zero science stops exist.
- Dropdown selection dispatches destination coordinates and poiId without touching start point.
- Quick-pick buttons update destination.
- Clearing selection dispatches null destination without modifying start.
- Displays planar coordinates, uncertainty, and purpose.
- Synthetic target badge displayed for synthetic POIs.
- Isolation and ownership diff checks pass against `ui-foundation-v1`.

Commands and results:
- `npm run typecheck`: PASS (0 errors, strict TypeScript mode)
- `npm run lint`: PASS (0 errors, 0 warnings)
- `npm test -- src/ui/features/destinations`: PASS (8 tests passed)
- `node src/ui/scripts/check-isolation.mjs --task=TASK-003`: PASS (`[PASS] destinations is strictly isolated`)
- `node src/ui/scripts/check-isolation.mjs --task=TASK-003 --diff --base=ui-foundation-v1`: PASS (`✓ Ownership diff verified for TASK-003: touched files strictly allowed`)
- `npm run build`: PASS (Production build succeeded in 311ms)

Review evidence:
- Unit & integration test suite: `src/ui/features/destinations/Destinations.test.tsx` covers all selector interactions and edge cases.

External limitations:
- Available science stops depend on Role A's `RegionManifest.pointsOfInterest`.

Contract change requests:
- None.
