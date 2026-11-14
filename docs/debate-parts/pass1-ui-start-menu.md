The proposed props invent a second mission state that the store cannot represent, and the default Point A/B rule picks the wrong HiRISE sites. A quick-start strip can stay non-blocking, but only if it is a controlled view of `MissionEndpoint` and stays a compact in-flow strip.

## Verdict

`open`, bare `LocalPoint`s, and `hasRouteResult` cannot stay in sync with the bundle, the preset selects, or a calculated route. `getUnifiedPoisForBundle` is the right catalog, and banning `three`, `evaEngine.ts`, `searchTrace.ts`, a fixed backdrop, and a focus trap is the right call for smoke and end-to-end tests. The component still has to be a controlled editor of store endpoints, placed between the header and `main`, and it has to tell the truth about the fictional base and about which bundle is loaded.

## 1. Props and state sync

The store endpoint is already `{ point, poiId }`.

```30:34:src/state/store.ts
export interface MissionEndpoint {
  point: LocalPoint;
  /** POI id if chosen from a preset, else null (free pick). */
  poiId: string | null;
}
```

`onSelectEndpointsAndPlan(start: LocalPoint, destination: LocalPoint)` throws `poiId` away. After launch, `start-preset` and `destination-preset` fall back to "— choose —" even when the point is `poi-p3`, `poi-p4`, or `poi-p5`. Those selects are allowed to list only manifest POIs. The HiRISE fictional base (`id: 'base'`, `manifestPoiId: null`) must never be inserted into them. Pass `MissionEndpoint` through so a manifest id can round-trip, and so `base` stays `poiId: 'base'` without becoming a preset option.

Coordinate matching cannot replace `poiId`. `1e-6` m is about a thousandth of a millimeter. It misses a point the solver has snapped to a cell center (`EndpointResolution.accepted` is up to half a cell away: about 0.5 m on HiRISE, 5 m on `synthetic-v0`, 10 m on CTX). It also treats two different ids that land in one cell as a legal pair, which the worker then sees as one endpoint. `poi-p5` and `threeforks` are safe relative to each other: they are 41.5 m apart and must remain two choices. Compare ids first. Use coordinates only as a fallback when exactly one POI matches within a millimeter and `pointToCell` returns a unique cell. If two POIs tie, show an unmatched custom point and leave the launch button disabled.

`getUnifiedPoisForBundle` builds a new array and new position objects on every call. An effect whose dependency is that array resets the selects on every render, so a choice cannot stick. Memoize on `bundle` (the reference changes when the loaded region changes).

Defaulting "base/outpost, or index 0" and "Yori / Three Forks / index 1" is three different algorithms. On a verified HiRISE bundle the catalog order is fixed: `poi-p3`, `poi-p4`, `poi-p5`, `threeforks`, `base`, `yori`, `rockytop`. Index 0 is Skinner Ridge / Wildcat, a science stop. Index 1 is Enchanted Lake, not Yori and not either Three Forks. The fictional start is `kind: 'base'` at index 4. Yori is index 5. `poi-p5` is `sample-depot`; `threeforks` is a different `science` stop. "Three Forks" is not one destination.

Kind names also change with the bundle. HiRISE uses `base` and `sample-depot`. Every other bundle is mapped from manifest kinds: `outpost` stays `outpost`, `science-stop` and `context` become `science`, `test` stays `test`. There is no `base` on `synthetic-v0` or CTX. The dev bundle's outpost is `syn-outpost`. A base-only lookup falls through to index 0 on CTX, which is Skinner Ridge, and the copy must not call that a base.

Use this default, and recompute it when `bundle.bundleVersion` changes:

- Point A: first `base` or `outpost`. Otherwise the first POI.
- Point B: first remaining POI whose id differs, whose cell differs, and whose kind is `science` or `sample-depot`. Otherwise any remaining POI in a different cell.
- That yields base to a science stop on HiRISE, and `syn-outpost` to `syn-east-bench` on the synthetic fixture. It does not default to `syn-sealed-basin` or `syn-unknown-knoll` (`kind: 'test'`), which are built to return no path or to fail strict quality.

`pois.length < 2` is only one empty state. Also disable launch, with a specific notice, when the bundle is null, when every pair shares a cell, or when either selected id is no longer in the catalog. Under `noUncheckedIndexedAccess`, `pois[0]` is `UnifiedPoi | undefined`. Guard it. Do not use a non-null assertion.

Ignore incoming `start` and `destination` unless the parent guarantees they were set for this `bundle.bundleVersion`. A synthetic point at `(25, 65)` will not hit a HiRISE POI, but small test grids overlap. The parent should clear both endpoints in the same update as the bundle swap. This file cannot see which bundle a bare `LocalPoint` came from.

`hasRouteResult` stays true after the user picks a new pair, and it stays true for no-path, timeout, and invalid input if the parent sets it on any finished run. Enter 3D then walks the previous path while the strip shows the new points. Enable that button only when the parent has a successful route for this bundle version and these two endpoints. A stale or failed run keeps it disabled, with the reason in text.

Split the write path. Choosing a select updates the store endpoint and does not calculate. Plan Route only runs the existing calculate action on the current endpoints and asks the shell to open the pathfinding view. The button label "Plan Route & Watch Pathfinder" currently promises playback that `onSelectEndpointsAndPlan` never mentions. Keep the sidebar's policies, strict quality, and round trip. HiRISE does not support strict quality (`limitations` say every valid cell is quality UNKNOWN). A launch payload that forces `strictQuality: true` fails the request before any path exists.

Keep the draft in the store so unmounting does not matter. `open === false` returning `null` throws away local `useState` and, on the next open, snaps back to the default pair and overwrites a map pick the user never launched. There is a second wipe if a `useEffect` depends on the fresh POI array.

`playSfxOnce('click', muted)` is safe to call from the click handler only. The shared one-shot controller is created unmuted and never sees `setMuted`; the `muted` argument is the only suppressor. Do not play from an effect. Mute itself should not play a cue. The early return already covers a muted launch.

## 2. Layout at 1440×900 and 390×844

`main` is a two-column grid (`controls` and `view` / `results`) and becomes one column below 900 px. A `<section>` with no `grid-area`, placed inside `main`, is an extra auto-placed grid item and will sit in the controls column or add a row that changes the map's place. The shell has to render this section as a child of `.app`, after `header` and before `main`. This file should still set `width: 100%`, `max-width: 100%`, and `min-width: 0` so a wrong parent cannot spill it sideways.

The non-blocking rule is real. Smoke and end-to-end tests click `start-preset`, `destination-preset`, `calculate`, and `map-canvas` on load without dismissing anything. A `position: fixed` backdrop, `position: sticky` strip, `inert` on the rest of the page, or a focus-trapped dialog breaks that. Returning `null` while closed is fine. Reusing `.drawer-overlay` is the same bug: that class is `position: fixed; inset: 0; z-index: 1000`.

What you listed is a briefing panel, not a strip: disclaimer, badge, attribution, two long selects, four buttons. On a 390×844 phone that panel plus the controls column pushes the map below the fold. Clicks can still scroll it into view. "Unobstructed" is met if nothing is taken out of flow. "Compact" is not.

Existing `app.css` already forces the touch size and the overflow:

- `button` is `inline-flex` with `min-height` and `min-width` of 44 px and `padding: 8px 16px`. It does not wrap as a group.
- `select` is `width: 100%` and `min-height: 44px`.
- `label` is a column.

"Plan Route & Watch Pathfinder" is about 280 px of label plus 32 px of padding. One row of four buttons is wider than the 390 px content box (about 366 px after padding). Without `flex-wrap: wrap` and `max-width: 100%` on each button, the row grows the page horizontally and the map moves with it. Let labels wrap (`white-space: normal`, `height: auto`, keep `min-height: 44px`). Do not set a smaller inline height. That would undo the 44 px target on the mute control, which has no visible text width to save it.

HiRISE option text such as "Delta front – Skinner Ridge / Wildcat Ridge (Hawksbill Gap ascent)" will not fit a closed select. Put `shortLabel` in the option. Put `name` and one line of `summary` in a wrapping paragraph under the pair. Stack the two fields at 390 px. At 1440 px, a wrapping row of two `minmax(16rem, 1fr)` fields is enough. Keep the action row on its own line.

Reuse `.badge.synthetic`, `.notice`, `.notice-warning`, `.notice-info`, `.btn`, `.btn-primary`, and `.btn-secondary`. Those classes already exist, so this file does not need an `app.css` edit. Give the strip its own test id. The header already uses `data-testid="synthetic-badge"`.

§3.11 of the merge plan still describes a second, expanded, centered dialog (`start-menu-modal`) opened from `open-start-menu`, plus `poi-card-*` and a "Launch Animated Search -> 3D EVA" action. That dialog is safe only if it is unmounted until the user asks for it. The default mount has to be the in-flow strip (`start-menu-strip`). One always-open briefing that uses the modal's test id will be both too tall and invisible to tests written against the plan.

## 3. Accessibility

Use a labelled section, not `role="dialog"` and not `aria-modal`.

```tsx
<section aria-labelledby={headingId} data-testid="start-menu-strip">
  <h2 id={headingId}>Mission quick start</h2>
```

`aria-label` on the section replaces the heading in the section's accessible name. A visible `<h2>` with `aria-labelledby` keeps one name.

Wrap each select in `<label htmlFor=...>` with the text "Point A" and "Point B". Both selects list every POI. When the ids match or the cells match, set `aria-invalid="true"` and `aria-describedby` to the inline notice, and disable launch. Removing the other point's option from the list makes the controlled `value` point at a missing `<option>`, and the closed select then shows a different POI than state. A disabled launch with the notice is the predictable keyboard behavior.

Disabled opacity `0.5` is not the status. The notice has to say why: bundle still loading, fewer than two places, same place chosen, or route not ready for 3D.

Mute: stable name "Mute sound", `aria-pressed={muted}`. Changing the visible label between Mute and Unmute and also changing `aria-label` makes the screen reader announce a double negative. The pressed state is the mute state.

Focus order: heading, simulation note, bundle status, Point A, Point B, the error notice, Plan, Enter 3D, Hide, Mute. Hide must move focus itself. Unmounting the section drops focus to `document.body`. `onDismiss` does not do that. Call `onDismiss` and move focus to the mission-settings heading or to `calculate`. There is no trap to restore.

Plan and Hide play the click cue from the click handler, after the user gesture, so autoplay policy is satisfied. Do not play it when `muted` is true.

Print CSS hides every `button` and does not hide this section. The disclaimer and the synthetic badge still print. That is the right residue. Do not add a control that exists only as color. The synthetic badge can use the existing black-on-`#f4c76b` chip. The warning body stays on `.notice-warning` (light text on `#332615`).

## 4. Synthetic badge, Jezero credit, and the fictional base

`bundle.manifest.synthetic` is the bundle flag. It is not the fictional-base flag, and it is not "this is the HiRISE Jezero product."

| Bundle | `synthetic` | What the strip must say |
|---|---|---|
| `synthetic-v0` | `true` | Synthetic fixture. Educational simulation. `syn-outpost` is fictional. No NASA credit. |
| `jezero-west-hirise-v0.1.0` | `false` | Real USGS/HiRISE terrain. Educational simulation. `base` is still a fictional scenario base. |
| `jezero-west-ctx20m-v0.1.0` | `false` | Real CTX terrain. No HiRISE/University of Arizona credit. No fictional base in the catalog. |

A canned line "NASA/JPL/University of Arizona/USGS" whenever `synthetic` is false is false for CTX. CTX sources are USGS Astrogeology, CTX via NASA/JPL-Caltech/MSSS, NASA/JPL-Caltech waypoints, and Mastcam-Z via NASA/JPL-Caltech/ASU/MSSS. University of Arizona appears on the HiRISE ortho credit and does not appear in the CTX source list. The HiRISE rights text also asks for the USGS author citation, not an agency list with the authors removed.

Read `bundle.manifest.sources` and render `creator`, `instrument`, and `usedFor` for the loaded bundle. Keep it to the elevation source plus the waypoint source. Put the rest behind a `<details>` disclosure so the strip stays short. When `synthetic` is true, show the fixture badge and do not render those credits, even if a limitation string mentions NASA.

The fictional-outpost sentence is required on every bundle, including real HiRISE. `getUnifiedPoisForBundle` drops `PointOfInterest.synthetic` and `officialName`, but the component has the manifest. Label Point A as a fictional scenario base when the unified kind is `base` or `outpost`, or when the matching manifest POI has `synthetic: true`. On HiRISE that is `base` ("Jezero EVA Outpost (Fictional Scenario Base)"), whose own summary already says it is not a NASA facility. Yori, Rocky Top, and both Three Forks stops are real places on a real raster. Do not call them fictional because `manifestPoiId` is null. Yori and Rocky Top are Marswalk-only and still real. Do not call Skinner Ridge an outpost on CTX, where every POI is a science stop.

Also keep these claims out of the strip:

- The product is an educational simulation on every bundle, synthetic or not. It is not a safety assessment and not an operational rover tool. HiRISE limitations say science-stop names are informal team names, not IAU names, and that valid cells are quality UNKNOWN. Quality is not a probability. One line of that limitation belongs next to the credit.
- `hashesVerified === false` means the files were not hash-checked. Do not say "verified."
- Rover photos and reconstructed views are different objects. This strip does not need images. If a summary is shown, use the `coordBridge` text as written. The Wildcat summary already says the organic-molecule signals are not evidence of life.
- No oxygen or survival gauge, and no Quest or headset claim. "Enter 3D Mars Walk" promises a walk the WebGL fallback cannot keep. The enabled label should be "Open 3D view," and only when the parent says this exact route can be shown.
- `bundle === null` gets an inline loading notice and disabled selects. It does not get a synthetic badge or a Jezero credit.

## Props that survive the edge cases

```ts
export interface StartMenuModalProps {
  open: boolean;
  bundle: GridBundle | null;
  /** Null, or set for this bundle.bundleVersion. Parent clears both when the bundle changes. */
  start: MissionEndpoint | null;
  destination: MissionEndpoint | null;
  /** Successful route for this bundle version and these two endpoints. */
  canEnter3d: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onChangeEndpoint: (which: 'start' | 'destination', endpoint: MissionEndpoint) => void;
  /** Calculate with the sidebar's current policies. Open pathfinding playback in the shell. */
  onPlanRoute: () => void;
  onEnter3d?: () => void;
  onDismiss: () => void;
}
```

The shell owns `mission/setStart`, `mission/setDestination`, calculate, and the visualizer. This file owns the catalog lookup, the distinct-cell check, the notices, and the cues. That split is what keeps a preset click, a map pick, a bundle swap, and Plan Route on one set of endpoints.
