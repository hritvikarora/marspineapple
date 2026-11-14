The DOM split is the right shape, and refusing oxygen is the right science. The plan still will not integrate cleanly: it does not give the wrist a canvas API, it can double-own the test ids `TerrainView` must render, and it treats CRISM and THEMIS as if they were in the licence register.

The four modules are not in the tree yet. `marswalkArm.ts` is not either. `TerrainView.tsx` is still the placeholder that only preserves `data-testid="terrain-view"` and the candidate/hover dataset attributes. `coordBridge.ts` already defines the POI and corridor types you will be fed.

## Blocking gaps

**1. `marswalkInfo.ts` is not a wrist texture, so the arm has nothing to call.** Section 3.4C says `MarswalkArmDisplay` shows a live `CanvasTexture` painted from the wrist view in `marswalkInfo.ts`. A pure string helper cannot do that. The arm file is a parallel Batch B module, so it cannot wait on a private DOM card inside `marswalkHud.ts`.

Export a painter the arm can call without importing the HUD:

- `paintWristCanvas(ctx, snapshot)` draws into a canvas the arm already owns.
- `debriefLines(summary)` and `legendEntries()` return plain English strings.
- `marswalkInfo.ts` stays free of `three` and free of DOM.

The arm owns the mesh, the geometry, and `dispose()`. The painter never creates a `CanvasTexture`. That avoids two owners releasing the same GPU resource.

**2. Do not import `marswalkMission.ts`.** Section 4.3 puts `vr-hud-panels` and `vr-player-mission` in the same parallel batch. That mission module is not in the tree, and section 3.4C loads it with oxygen, radiation, metabolic mass, and an LMST clock. Importing it makes this leaf fail typecheck until the sibling lands, and it pulls the survival model into the HUD module you are trying to keep honest.

Take a snapshot interface as an argument. `marswalkTypes.ts` and `coordBridge.ts` are already in the tree and are enough. Suggested fields: `east_m`, `north_m`, `elevation_m`, `slopeDeg` (un-exaggerated), `candidateId`, `progressFraction`, `layer`, `offPath`, `dottedHit`, `nearbyPoi`, `arrival`.

**3. One owner for the DOM test ids.** Section 3.5 tells `TerrainView` to render `dotted-path-tooltip`, `off-path-overlay`, and the respawn control, on both the WebGL view and the jsdom fallback. Your HUD also creates those nodes. Two nodes with the same `data-testid` make `getByTestId` throw.

HUD owns the nodes. `TerrainView` only calls `hud.update(snapshot)` and runs the callbacks. The HUD must mount inside the existing `terrain-view` element even when `getContext('webgl')` is null, because the fallback simulator is required to expose the same buttons. Helmet and `makePanel` no-op in that path. Do not wrap or replace the root, or you drop `data-selected-candidate` and `data-hover-index`.

**4. `ArrivalSummary` still requires fake oxygen.** Section 3.5 defines `oxygenRemainingPct` on the arrival callback. Your arrival card correctly omits it. Do not satisfy that field with `100` or with a tank model. That is a contract change for the `vr-view` owner: drop `oxygenRemainingPct` from `ArrivalSummary`. The HUD card and the callback need one shared summary type (elapsed sim time, traverse length, ascent, descent, min/max physical slope, POI ids visited). Two structs will drift.

## XSS and URLs

`createElement` plus `textContent` is the right DOM rule. It does not cover the sinks that still parse URLs.

`UnifiedPoi.photoUrl` is an unsanitized `string | null`. The bridge’s own values are relative (`./sites/jezero-delta/photos/wildcat.jpg`). A bundle or a future caller can pass `https://…`, `//evil.example`, or `javascript:…`. `javascript:` on `img.src` is mostly inert. `javascript:` on an `<a href>` is not. Absolute URLs also break the offline release rule in section 4.2 (runtime fetches stay relative `./`).

Allowlist before any `img.src` assignment:

- null or empty: no image
- must match `^\./sites/jezero-delta/photos/[a-z0-9._-]+$`
- reject scheme, `//`, backslashes, and `..`

`marswalkPois.ts` already assigns `img.src = entry.poi.photoUrl` for the in-world card. A second HUD `Image` doubles the load and doubles the dispose race. Prefer text in the DOM card, and leave the photo on the world card. If the DOM card does show the image, clear `img.src` and drop `onload` / `onerror` inside `dispose()` before the node is removed. `SitePoiRaw.photo` is `unknown` and the Italian `title` / `text` / `label` fields are banned by the comment in `marswalkTypes.ts`. Never pass them into `src` or into visible copy.

Licence URLs in `licences.json` are `https://` today. Render them as text, or as `<a>` only after a `https:` check, with `rel="noopener noreferrer"`. Do not fetch them. Do not build the sources overlay with `innerHTML`, CSS `content:`, or a `<style>` string that interpolates a POI name, a rejected-path `reason`, or a bundle version.

The scoped stylesheet has to be a static string under a root class such as `.marswalk-hud`. A bare `button { }` rule will restyle the planner.

## jsdom and canvas size

Null-guarding `getContext('2d')` is necessary and not sufficient. Section 5’s HiRISE bug is the same failure mode: an oversized backing store returns null in Chromium, not only in jsdom.

`makePanel(widthM, heightM, pxPerM)` needs a hard cap before the context call. Clamp both pixel axes to a finite range, at most 1024, and reject non-finite or non-positive metres. A 2.6 m card at a few thousand pixels per metre is the blank-canvas bug again. Check null, then skip every draw. Still return a disposable handle. Do not throw.

Same guard on the helmet compass. In the fallback view there is no camera and no WebGL renderer. `update` and `setVisible` must be no-ops until a real camera exists.

`marswalkHud.ts` must not import `three`. Otherwise every jsdom test that mounts the HUD loads Three, and the fallback path cannot be tested without a renderer.

Reuse one canvas and one texture for the life of a panel. Rebuilding a `CanvasTexture` per telemetry frame leaks GPU memory. Live numbers (`east_m`, slope, progress) belong in DOM `textContent`. Canvas panels are for the wrist and other low-rate surfaces.

## Dispose, double-mount, and keys

`dispose()` has to be idempotent: a second call is a no-op. React strict mode mounts, unmounts, and mounts again.

Style-tag refcount needs a module-level count and one `<style>` element:

- each successful mount increments
- `dispose()` decrements once (a disposed flag stops a double decrement)
- remove the tag only at zero

If the first instance removes the tag while the second is alive, the second HUD goes unstyled. If `dispose()` never decrements because the flag was set on mount, the tag lives for the rest of the test run.

Remove listeners by the same function reference, on `window` and on the root. Dropping the DOM node does not drop a `window` `keydown`. Section 5 binds `[R]` on `window`. The player will also want WASD, `L`, `M`, `I`, `T`, `C`, and `Esc`. One listener, owned by `TerrainView`, or you get double respawn and a listener leak when the 2D view is showing and the 3D view was only hidden.

`R` means respawn only while the off-path overlay is open. The original Marswalk binding used `R` to restart the walk. With the overlay closed, `R` must not teleport and must not reset the mission.

Pointer-events: the HUD root is `none`, buttons and the open sources/arrival cards are `auto`. A full-screen off-path layer that captures the pointer eats orbit drag and route picking. On block, exit pointer lock (section 5) and focus the respawn `<button>`.

Helmet `dispose()` removes the rim from the camera it was attached to, disposes geometry, material, and texture, and ignores later `update` calls. `setVisible(false)` keeps the resources. If `makePanel` returns a mesh the arm also holds, only the creator disposes it.

## Accessibility

`role="alert"` on a node whose deviation text changes every frame will re-speak the warning continuously. Set the alert when the reason transitions to blocked. Keep the deviation readout in a polite region, or update it without re-firing the alert.

The dotted-path card is proximity, not an emergency. Use a polite status. An alert there talks over the off-path warning.

Canvas text is invisible to assistive tech and to Testing Library. The off-path copy, the dotted-path reason, the arrival actions, and the sources list have to be DOM text. The legend is not a control. `Respawn`, `Sources`, `Return to Start Menu`, `Walk Return Leg`, and `Continue Exploring` are real `<button>` elements with visible focus.

Escape closes the topmost transient card (sources, then arrival) and must not `preventDefault` while pointer lock is active. Do not install a focus trap. On `dispose()`, drop focus back to the terrain region. Tab order is the buttons inside the open card.

Scrim the telemetry bar with an opaque dark background and light text so contrast does not depend on HiRISE sand or THEMIS black. The off-path state is the words `OFF-PATH BLOCKED` plus the reason, not a red `✕` alone.

`prefers-reduced-motion: reduce` disables flashing and visor motion. The compass still updates, without a sweep animation. Section 3.5’s “flashes” has to honor that media query.

The layer badge should be the short English name (`Ortho`, `Slope`, `Minerals`, `Thermal`). `OVERLAY_LAYER_LABELS_EN` is a full credit sentence (`HiRISE Ortho Mosaic (NASA/JPL-Caltech/UArizona)`). As a live badge it overflows 390 px width. The long credit belongs in the sources card.

## Provenance

These strings match the register and should be copied, not reworded into a cleaner citation:

| Product | DOI or identifier | Licence as registered |
|---|---|---|
| HiRISE DTM mosaic | `10.5066/P9REJ9JN` | CC0 1.0. Credit `USGS Astrogeology Science Center; HiRISE: NASA/JPL/University of Arizona` |
| HiRISE orthomosaic | `10.5066/P9QJDP48` | CC0 1.0. Credit `NASA/JPL/University of Arizona` (no “Caltech”) |
| CTX DTM | `10.5066/P906QQT8` | CC0 1.0. Credit `CTX: NASA/JPL-Caltech/MSSS` |
| CTX orthomosaic | `10.5066/P9GV1ND3` | CC0 1.0. Same CTX credit |
| Mastcam-Z panoramas | LPSC abstract #1719 | No CC licence. “Without explicit permission,” plus the abstract reference |
| MEDA | `10.17189/1522849` | CC0 1.0 |
| Rover waypoints | none | `verified: "partial"`. NASA media guidelines, credit `NASA/JPL-Caltech` |

Do not stamp CC0 on Mastcam-Z or on the waypoints. Do not list the HRSC/MOLA blend (CC BY-SA 3.0 IGO). `licences.json` says it is a sanity check and is not shipped. Showing it implies the share-alike layer is on screen.

CRISM `FRT00005C5E` and THEMIS are not in `licences.json`, `sources.json`, or `ui_captions.json`. The caption pack’s `sources.en` list is only HiRISE, CTX, waypoints, Mastcam-Z, and MEDA. The observation id and `shiftM [-180, 204]` are site-pipeline facts (section 5 and the `shiftM` comment on `MarswalkSiteData`). Put them in a separate credit line: registration offset already baked into `minerals.png`, about 272 m, never applied to coordinates, UVs, or POI positions. Do not invent a CRISM or THEMIS DOI. The layer badge can keep `OVERLAY_LAYER_LABELS_EN.minerals` and `.thermal`. The ortho badge’s “JPL-Caltech” disagrees with the HiRISE credit line above. The sources card uses the register, not the badge.

Importing all of `ui_captions.json` ships every `it` block in the client chunk, and a single `.it` fallback puts Italian on screen. `SitePoiRaw` already forbids that prose. Expose only `.en`, `credits_line_en`, and `limitations_short.en`. There is no public `lang` argument.

The six English limitation lines belong on the sources card. They are the honesty constraint: 1 m grid, no per-pixel quality, rover stance is not the rock, temperatures are one sol, weather/radiation/dust/comms are not modelled, routes are a demonstration. “Educational simulation” and “fictional outpost” are product rules from the agent instructions. They are not sentences in the caption pack. Show them as product disclaimers. Do not attribute them to USGS or NASA. Mark `kind: 'outpost'` as fictional. Do not mark P3, P4, or P5 as fictional. For `in_area: false` (P1, P2, P6–P9), show `Context only — outside the mapped area` and do not offer a walk.

MEDA copy stays historical: sol id, min/max from that sol, and “on that sol only.” Keep the published tenth of a degree (`-71.8 °C`), not a rounded live thermometer. Elevation is areoid metres. Negative values are normal. Slope is the physical degree value the corridor gate used (`cellSlope_deg`), never the exaggerated mesh. Progress is `NearestPathSample.progressFraction` along the active leg, labeled as route progress. On a round trip, reset that label when the return leg becomes the active leg.

Off-path copy, plain language, only for the three `CorridorOffPathReason` values:

- `steep-slope`: slope above the 20° gate, plus the measured degrees
- `excluded-cell`: exclusion legend from `ui_captions.json` (`1` missing elevation, `2` derivative unavailable, `3` outside extent, `4` manual)
- `corridor-deviation`: horizontal metres from the route

No other reason string. No oxygen, dose, suit reserve, or LMST-as-telemetry. Elapsed time at arrival is simulated time under an explicit speed assumption.

If the POI card shows `interpretation`, keep the pack’s caveat on P3: the organic-molecule signal is not evidence of life. Panorama names stay the caption strings (`Mastcam-Z 360 #19`). Do not promote them to PDS product ids.

## Per-file shape

`marswalkUi.ts` exports `makePanel` plus the English draw helpers. It clamps canvas size, survives a null 2D context, and its `dispose()` is single-owner and idempotent. `formatDistance` switches at 1000 m (`207 m`, `1.24 km`) with a decimal point. `formatDuration` is hours and minutes in English. Neither helper reads `site.json`.

`marswalkInfo.ts` is pure TypeScript. English legend, limitations, POI caption, and sol-specific MEDA note. Wrist and debrief painters take a `CanvasRenderingContext2D | null` and return. No `three`, no DOM, no mission import, no Italian key.

`marswalkHud.ts` is DOM only. `mountMarswalkHud(container, callbacks)` returns `{ update, dispose }`. Callbacks are `onRespawn`, `onToggleSources`, `onReturnToMenu`, `onWalkReturn`, `onContinue`, `onToggleWrist`. The HUD does not teleport, does not cycle layers, and does not attach the wrist mesh. `update(null)` clears candidate, tooltip, POI, and arrival.

`marswalkHelmet.ts` attaches the rim only when a camera exists. Compass canvas is null-guarded and size-capped. `prefers-reduced-motion` skips the sweep. `dispose()` detaches from that camera.

## What to change in the plan before writing code

Write down four decisions so `vr-view` and `vr-player-mission` do not invent a second HUD:

1. HUD owns the test-id nodes. `TerrainView` feeds a snapshot and still mounts the HUD when WebGL is missing.
2. Wrist paint lives in `marswalkInfo.ts` / `marswalkUi.ts`. The arm owns the mesh.
3. No import of `marswalkMission.ts`. No `oxygenRemainingPct` in the summary this leaf emits.
4. `photoUrl` is either absent from the DOM card or passed through the relative photo allowlist. CRISM and THEMIS are credited without DOIs. `shiftM` stays in the credit sentence.
