# TASK-011 handoff
Status: REVIEW
Foundation revision: 17fbf7191017058d82bc896084941f79719cb1d8
Branch/commit: task/TASK-011-map-routes / 0737dba
Changed paths:
- src/ui/features/map-routes/entry.tsx
- src/ui/features/map-routes/MapRoutes.tsx
- src/ui/features/map-routes/map-routes.css
- src/ui/features/map-routes/MapRoutes.test.tsx
- handoffs/TASK-011.md
Entry/slot: src/ui/features/map-routes/entry.tsx / map-routes
Behavior delivered:
- Candidate route overlay rendering on MapCanvas via customLayers registration.
- Multi-candidate rendering with distinct visual hierarchy:
  - Selected route drawn with distinct high-contrast polyline (outbound solid, return dashed).
  - Unselected candidates drawn with subdued/semi-transparent lines.
  - Hover sync indicator ring highlighting the active hovered profile waypoint on the map.
  - Layer visibility toggle support respecting `layers.route.visible`.
  - DOM summary status display reflecting candidate counts, selected candidate ID, and stale recalculation warnings.
- Independent lifecycle and layer cleanup upon unmount.
Scenarios checked:
- Module registration conforms to FeatureModule contract with slot 'map-routes'.
- Canvas custom layer registration on mount and unregistration on unmount.
- Drawing outbound and return paths with distinct stroke/dash styles.
- Hover ring rendering at exact local point coords when hover pathIndex is present.
- Suppression of canvas rendering when `routeLayerVisible` is false.
- DOM summary status and stale banner rendering.
Commands and results:
- npm run typecheck: PASS (0 errors)
- npm run lint: PASS (0 errors, 0 warnings)
- npm test -- src/ui/features/map-routes: PASS (6/6 tests passed)
- node src/ui/scripts/check-isolation.mjs --task=TASK-011: PASS
- npm run build: PASS (clean bundle output)
Review evidence:
- Tested responsive rendering in mobile and desktop layouts.
- Verified isolation diff contains only assigned paths.
External limitations:
- Route geometry provided by routing worker; relies on local meter coordinates in frozen coordinate frame.
Contract change requests:
- None.
