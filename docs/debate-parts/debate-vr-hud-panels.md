# Architectural Debate — `vr-hud-panels`

Files owned:

- `src/terrain3d/marswalkUi.ts`
- `src/terrain3d/marswalkHud.ts`
- `src/terrain3d/marswalkHelmet.ts`
- `src/terrain3d/marswalkInfo.ts`

Branch: `merge/integration`  
Pass 1 source: `docs/debate-parts/pass1-vr-hud-panels.md`  
Section 5 of `docs/MERGE_PLAN.md` overrides the oxygen, Quest, and Italian-copy details in sections 3.4–3.5.

## Pass 1 corrections adopted before writing

1. **Wrist paint is a canvas API, not a private DOM card.** `marswalkInfo.ts` exports `paintWristCanvas(ctx, snapshot)`, `paintDebriefCanvas`, `paintLegendCanvas`, `debriefLines`, and `legendEntries`. Painters accept `CanvasRenderingContext2D | null` and return. They never create a `CanvasTexture`. The arm, which is a parallel module and is not in this leaf, owns the mesh and the texture dispose.
2. **No `marswalkMission.ts` and no `marswalkPlayer.ts`.** Telemetry is a plain `WristSnapshot` (`east_m`, `north_m`, `elevation_m`, `slopeDeg`, `candidateId`, `progressFraction`, `layer`, `leg`, `offPath`, `dottedHit`, `nearbyPoi`, `arrival`). `WalkDebriefSummary` is elapsed sim time, traverse length, ascent, descent, min/max physical slope, visited POI ids, and an explicit speed assumption. There is no `oxygenRemainingPct`.
3. **One owner for the DOM nodes.** `mountMarswalkHud(container, callbacks)` appends into the supplied parent. It does not create a second `terrain-view` element and does not wrap or replace the root, so `data-selected-candidate` and `data-hover-index` stay on the existing node. `TerrainView` should call `update` even when `getContext('webgl')` is null. Helmet and `makePanel` no-op on that path.
4. **Photo URLs are allowlisted.** `isAllowedPhotoUrl` accepts only `^\./sites/jezero-delta/photos/[a-z0-9._-]+$` and rejects schemes, `//`, backslashes, and `..`. The HUD card does not create an `img`. Licence URLs are text, not fetched links.
5. **Canvas size is capped at 1024 px before `getContext('2d')`.** Non-finite or non-positive metres return a disposable handle and do not throw. A null context skips drawing. The helmet compass uses the same cap. `dispose()` on every handle is idempotent.
6. **Style tag refcount.** One `<style id="marswalk-hud-style">` whose rules all sit under `.marswalk-hud`. Mount increments, dispose decrements once, and the tag is removed only at zero.
7. **No window key listener.** `R`, `L`, `M`, `T`, `I`, `C`, and WASD stay with `TerrainView` / the player so a hidden 3D view cannot double-fire respawn. The HUD shows those letters as visible English hints. The buttons work by click. Escape is listened on the HUD root only, and it does not `preventDefault` while pointer lock is active.
8. **Alert versus polite status.** `off-path-alert` keeps a stable sentence, set when the blocked flag changes: `✕ OFF-PATH BLOCKED. This step was refused.` The changing reason is a sibling `role="status"`. The rejected-path card is also polite. On the transition into blocked, the HUD exits pointer lock and focuses Respawn. It does not teleport.
9. **Reduced motion.** The off-path emphasis animation is one shot and is disabled under `prefers-reduced-motion: reduce`. The helmet compass snaps to heading instead of sweeping.
10. **Provenance copied from the register.** English credits, DOIs, and licences for HiRISE DTM `10.5066/P9REJ9JN`, HiRISE ortho `10.5066/P9QJDP48` (credit `NASA/JPL/University of Arizona`, no Caltech), CTX DTM `10.5066/P906QQT8`, CTX ortho `10.5066/P9GV1ND3`, MEDA `10.17189/1522849`. Waypoints stay `verified: partial` with credit `NASA/JPL-Caltech` and no CC0 stamp. Mastcam-Z stays LPSC abstract #1719, no CC licence. The HRSC/MOLA blend is not listed. CRISM `FRT00005C5E` and THEMIS have no DOI in the register; the credit says so. `shiftM [-180, 204]` is described as already applied in `minerals.png` (about 272 m) and not applied again to coordinates, UVs, or POI positions.
11. **English only.** Caption strings are the `.en` block copied into source. The JSON file is not imported, so the `it` block is not shipped. `kind: 'outpost'` and the Jezero `kind: 'base'` outpost are fictional. P3, P4, and P5 are not. `in_area: false` shows `Context only — outside the mapped area` and `walkOffered: false`. The P3 organic-molecule line keeps `This is not evidence of life.` MEDA copy is sol-specific and keeps the published tenth of a degree.

## Decisions for `vr-view` and `vr-player-mission`

1. **HUD owns these test ids.** `off-path-alert`, `respawn-safe-button`, `rejected-path-callout`, `arrival-summary`, `return-to-start-menu`, `layer-toggle`, `map-peek-toggle`, `trace-toggle`, `wrist-toggle`, plus `credits-dialog` and `sources-toggle`. Do not also render `off-path-overlay`, `respawn-button`, or `dotted-path-tooltip`, or `getByTestId` will throw.
2. **Wrist paint lives in `marswalkInfo.ts` / `marswalkUi.ts`.** `makePanel` returns a canvas handle, not a mesh. The arm creates and disposes the one `CanvasTexture`.
3. **No mission import and no oxygen field.** Drop `oxygenRemainingPct` from `ArrivalSummary`. Build arrival text with `debriefLines`. Elapsed time is simulated time under the supplied speed.
4. **`photoUrl` stays off the DOM card unless it passes `safePhotoUrl`.** CRISM and THEMIS are credited without invented DOIs. `shiftM` stays in the credit sentence.

`HudSnapshot` / `MarswalkHudSnapshot` is the controlled view state: `offPathBlocked`, `offPathMessage`, `rejectedCallout`, `arrivalVisible`, `arrivalText`, `creditsOpen`, `layerLabel`, `mapPeekOpen`, `traceNote`, `wristOn`, and optional `headingDeg`. `update(null)` clears the alert, callout, arrival, and credits. Buttons call `onRespawn`, `onToggleSources`, `onReturnToMenu`, `onToggleWrist`, `onToggleLayer`, `onToggleMap`, and `onToggleTrace`. They do not cycle layers, attach the wrist mesh, or move the camera. Layer badges are short names (`Ortho`, `Slope`, `Minerals`, `Thermal`); the long register credit stays in the sources dialog.

`formatDistance` switches at 1000 m (`207 m`, `1.24 km`) with a decimal point. Coordinates and areoid elevation stay in metres, including negative Jezero elevations. `formatDuration` is hours and minutes.

`attachMarswalkHelmet(null)` returns a no-op. A camera gets one rim group. `setVisible(false)` keeps the geometry. `dispose()` detaches that camera, disposes geometry, material, and texture, and ignores later `update` calls.

## What this leaf deliberately does not do

- No oxygen, survival gauge, dose readout, or Quest control. The caption-pack limitation line that says weather, radiation, dust, and communications are not modelled is shown as a limitation, not as a gauge.
- Educational simulation and the fictional outpost are product notes, separate from the NASA/JPL/USGS credit block.
- No `innerHTML`, no CSS `content` built from POI names or rejection reasons, and no `console.*`.
- `three` is imported only by `marswalkHelmet.ts`.

## Examiner verdict — GPT-6 Luna (`gpt-6-luna`, high, read-only)

Reviewed the full source of `marswalkUi.ts`, `marswalkHud.ts`, `marswalkHelmet.ts`, and `marswalkInfo.ts`. Did not edit the repository.

| Category | Score | Finding |
|---|---:|---|
| English copy | 91 | Clear overall. “Elapsed sim time” is awkward jargon, and `poiCaption` can use an entire science-stop description as the fallback title. |
| XSS safety | 98 | Dynamic HUD text uses `textContent`, and photo paths are restricted to a relative-path pattern. No executable injection path in these files. |
| jsdom | 90 | Canvas context failure is handled, and browser APIs are mostly guarded. Canvas drawing is skipped when no 2D context exists. |
| Disposal | 82 | `acquireHudStyle()` reuses an existing `marswalk-hud-style` element without tracking ownership, but `releaseHudStyle()` removes it when the final HUD is disposed. That can delete a style element this module did not create. |
| Oxygen / Quest ban | 100 | No oxygen gauges or Quest controls appear in the supplied source. |

**Overall: 90/100 — pass.** The disposal ownership bug is the named defect. It does not bring the overall score below 85, so the leaf was not revised after this review.

SCORE: 90

## Residual risks

- `TerrainView.tsx` is still the placeholder. Until `vr-view` mounts this HUD inside the existing `terrain-view` and stops creating the section 3.5 test ids, the buttons are not on the live page.
- Credits, map peek, wrist, and layer label are controlled by the snapshot. A click only invokes the callback. If the owner updates every frame and leaves `creditsOpen` false, the dialog stays closed. Escape closes sources by calling `onToggleSources`, then arrival locally, and only when pointer lock is off.
- The arm module does not exist yet. Calling `paintWristCanvas` is safe; nothing in this leaf creates the GPU texture.
- Importing `marswalkHelmet.ts` loads `three`. jsdom tests of the HUD should import `marswalkHud.ts` only. `attachMarswalkHelmet(null)` does not build a mesh. A null 2D context skips the compass and still attaches the rim when a camera exists.
- `kind: 'base'` is treated as the fictional outpost because that is how `coordBridge` types the Jezero staging base. Science ids P3, P4, and P5 stay non-fictional even if a caller passes another kind.
- The window key for Respawn is not bound here. The Respawn button always calls `onRespawn`. The owner must ignore that callback when the walker is not blocked.
- Full `npm test` was not run for this leaf. `npx eslint` on the four TypeScript files exited 0. `tsc -p tsconfig.app.json` reports no errors in these files. A jsdom smoke script mounted the HUD, clicked every button, opened the blocked and credits states, disposed twice, and attached a helmet to a null camera and to a `PerspectiveCamera` without throwing. jsdom itself prints `Not implemented: HTMLCanvasElement's getContext()`; the modules null-guard that call and continue.

## GPT-6 Luna verdict

Score: **94** (pass; under 85 is a fail). Read-only `codex exec -m gpt-6-luna`, full source of the four modules in the prompt. No `codex apply`.

Objection, not a fail: the HUD removes any existing element with id `marswalk-hud-style` on the last unmount, even if that style element existed before the HUD mounted. XSS safety, jsdom handling, English copy, and the oxygen/Quest control ban otherwise passed. The score is at least 85, so the TypeScript was left unchanged.
