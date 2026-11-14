# Debate Log — `ui-start-menu` (`src/ui/StartMenuModal.tsx`)

Date: 2026-11-14  
Branch: `merge/integration`  
Pass 1 critique: `docs/debate-parts/pass1-ui-start-menu.md`  
Authority: `docs/MERGE_PLAN.md` §3.7, §3.11, and §5 item 4, plus the ui-start-menu file assignment.

---

## Proposed decision

`docs/MERGE_PLAN.md` §3.7 specified `StartMenuModal` with:

- `StartMenuLaunchPayload` (`launchMode: 'animate-then-3d' | 'planner-only'`)
- `StartMenuModalProps` (`displayMode`, `activeRegionId`, `bundle`, `bundleLoading`, `pois`, `currentStart`, `currentDestination`, `soundEnabled`, and the endpoint / launch / sound / region callbacks)
- A value use of `getUnifiedPoisForBundle` from `src/terrain3d/coordBridge.ts` (that module imports no `three`)

§3.11 then described a second, centered dialog (`start-menu-modal`) over a docked strip (`start-menu-strip`), opened from `open-start-menu`, with a fixed backdrop absent only in the docked default.

§5 item 4 keeps the existing shell test ids (`start-preset`, `destination-preset`, `calculate`, `map-canvas`, `route-status`, and the rest) and forbids a new `src/ui/features/*/entry.tsx` for this wave. Preset `<select>` options stay on manifest POIs.

---

## Pass 1 critique that is accepted

1. **No second blocking layer.** Smoke and end-to-end tests click `start-preset`, `destination-preset`, `calculate`, and `map-canvas` on load. A `position: fixed` backdrop, `aria-modal`, a focus trap, or `inert` on the page fails those tests. `.drawer-overlay` is the same bug.
2. **The card is a labelled `<section>`, not a dialog.** Visible heading, `aria-labelledby`, associated "Point A" / "Point B" labels, visible focus, 44 px targets, wrapping actions. No focus move on mount.
3. **Catalog honesty.** Option text uses `shortLabel`. Default Point A is the first `base` or `outpost`, otherwise the first place. Default Point B is the next place in a different cell whose kind is `science` or `sample-depot`, otherwise any remaining place in a different cell. That is base to a science stop on HiRISE, and `syn-outpost` to `syn-east-bench` on the synthetic fixture, not index 0 / index 1 and not a `test` place.
4. **Same place is not coordinate luck.** Compare ids, then exact local metres, then a shared `pointToCell` cell. A one-millimetre fallback may match a point only when exactly one catalog place is that close and in that cell. Two places in one cell are one endpoint to the worker. `poi-p5` and `threeforks` stay distinct.
5. **Do not write defaults from an effect that depends on a fresh POI array.** `getUnifiedPoisForBundle` returns new objects every call. Memoize it on `bundle`. Keep the user's in-progress pair in state keyed by bundle version, catalog ids, and the incoming points. Incoming `LocalPoint`s match the catalog; they are not silently moved.
6. **Fictional outpost vs real places vs the fixture flag.** The outpost sentence is on every bundle. A place is called a fictional scenario base only when its unified kind is `base` or `outpost`. Yori, Rocky Top, Skinner Ridge, and both Three Forks stops are not called outposts. `manifest.synthetic === true` is the fixture flag, not a NASA credit and not a reason to badge every science stop as a base. On `synthetic-v0`, science stops are also `synthetic: true` on the manifest record; the bundle badge covers that.
7. **Credits follow `manifest.sources`.** When `synthetic` is false, show the elevation source `creator` and `instrument` (the source whose `usedFor` begins with "Elevation", otherwise any source whose `usedFor` names elevation). Every other source is behind `<details>`. No canned "NASA/JPL/University of Arizona/USGS" line. CTX must not receive a HiRISE credit. When `synthetic` is true, the visible label is exactly `[Synthetic Fixture]` and those credits are not rendered.
8. **Quality and hashes.** One documented quality limitation can sit behind `<details>`. Quality is not a probability. `hashesVerified === false` is reported as "Terrain files were not hash-checked." The word "verified" is not used. No oxygen gauge. No Quest or headset control. The 3D action is labelled "Open 3D view".
9. **Launch must not force `strictQuality: true`.** HiRISE limitations say strict quality is unsupported. The payload sends `strictQuality: false` and `roundTrip: false`. The card says both stay off. Policies are the canonical `ROUTE_POLICIES` list because this component is not given the sidebar's policy state. The shell should keep the sidebar toggles if the live mission already has them; this payload does not turn strict quality on.
10. **Layout box.** `width: 100%`, `max-width: 100%`, `min-width: 0`. Fields use `minmax(min(100%, 16rem), 1fr)`. Actions wrap. Below 900 px each button takes the full row. Print keeps a light card. Global print CSS already hides `button`; the disclaimer and the fixture badge remain.

---

## Pass 1 proposals that the frozen contract rejects

Pass 1 replaced the props with `open`, `MissionEndpoint`, `canEnter3d`, `muted`, `onChangeEndpoint`, `onPlanRoute`, and `onDismiss`, and it asked for root test id `start-menu-strip`.

The assignment keeps §3.7. The exported props are the §3.7 props. `launchMode` gains `'enter-3d'` beside `'animate-then-3d' | 'planner-only'`. The root test id is `start-menu` for both `displayMode` values. `displayMode: 'expanded'` opens the place summaries in the same in-flow card. It does not mount a centered modal.

Consequences, recorded so the shell does not invent a second store inside this file:

- Endpoints on the props are `LocalPoint | null`, not `{ point, poiId }`. This file cannot recover a `poiId` the parent threw away. Matching uses id only after a coordinate or cell match against the `pois` prop. A bare point that matches two places, or none, stays an unmatched custom point and launch stays disabled.
- There is no `canEnter3d` flag. `start-menu-enter-3d` uses the same pair gate as the other launch buttons and calls `onLaunchMission` with `launchMode: 'enter-3d'`. The shell must ignore that action when the successful route is for a different bundle version or a different pair. A failed, timed-out, or stale run is not a 3D path.
- `onSelectEndpoints` runs when the user changes a listed pair and again at launch. It does not run on mount, so a cleared map pick is not overwritten by the suggested default. The suggestion is still what launch sends when both incoming points are null.
- `RegionId` is not exported from `src/contracts`. This file exports `type RegionId = string` (a bundle id). Shared contracts were not edited.
- Sound is a controlled `soundEnabled` flag. The mute button calls `onToggleSound`, keeps the accessible name "Mute sound", and sets `aria-pressed` when sound is off. Visible text is "Sound on" or "Muted". This file does not import `soundEffects.ts` and does not play a cue from an effect. Mute itself does not play a cue.
- Hide calls `onCollapse` and then moves focus to `[data-testid="calculate"]` when that control exists, because unmounting the section would otherwise drop focus on `document.body`. Nothing is focused on mount.

---

## Final decision

`StartMenuModal` is a docked card in normal flow.

- Root: `<section data-testid="start-menu">`. No `role="dialog"`, no `aria-modal`, no backdrop, no `position: fixed`.
- Point A and Point B list the `pois` prop (`shortLabel`). `getUnifiedPoisForBundle(bundle)` supplies matching names, kinds, and summaries. Launch positions are the prop positions, copied, so a bundle lookup cannot relocate a point.
- `pois.length < 2` disables launch and says "At least two places are required."
- The same id, the same local point, or the same grid cell disables launch and says "The two points must differ."
- `data-testid="start-menu-launch"` sends `launchMode: 'animate-then-3d'`.
- `data-testid="start-menu-plan"` sends `launchMode: 'planner-only'`.
- `data-testid="start-menu-enter-3d"` sends `launchMode: 'enter-3d'`.
- `data-testid="start-menu-mute"` calls `onToggleSound` and reflects `soundEnabled`.
- `data-testid="start-menu-dismiss"` calls `onCollapse`.
- The sentences "Educational simulation" and "The outpost is fictional" are always visible.
- `[Synthetic Fixture]` is shown only when `bundle.manifest.synthetic` is true.

§5 item 4 is respected by not touching `App.tsx`, preset selects, `src/ui/features/**`, or `package.json`, and by not importing `three`, `evaEngine.ts`, or `searchTrace.ts`. The shell can lazy-load this module later without a feature `entry.tsx`.

---

## Examiner verdict (GPT-6 Luna, high)

Command: `codex exec -C` the repo `-m gpt-6-luna -c model_reasoning_effort=high -s read-only`, with the full source of `src/ui/StartMenuModal.tsx` and `src/ui/StartMenuModal.module.css` pasted into the prompt. Read-only sandbox. `codex apply` was not run. The examiner did not edit the repository.

### First exam — SCORE: 82 — FAIL

Specific defect: the place selectors used `start-menu-point-a` and `start-menu-point-b` and the source had no `start-preset` or `destination-preset` test ids.

Other objections: the accessible name stayed “Mute sound” when sound was already muted, and “Open full briefing” had no `aria-expanded`. Layout was accepted: `position: static`, no overlay, and the card cannot cover `map-canvas`, `start-preset`, `destination-preset`, or `calculate`.

Revision after that fail, still inside these files:

- Point A’s select is `data-testid="start-preset"`. Point B’s select is `data-testid="destination-preset"`. The `start-menu-point-a` and `start-menu-point-b` ids stay on the associated labels.
- The mute control’s name is “Mute sound” when sound is on and “Unmute sound” when sound is off, with `aria-pressed` set while muted.
- The briefing button stays mounted and sets `aria-expanded` from `displayMode`.

### Second exam — SCORE: 91 — PASS

Specific remaining objection: the briefing toggle sets `aria-expanded` but does not point at the controlled region with `aria-controls`. While open, its label “Full briefing open” describes the current state rather than the action. The examiner treated that as minor.

The card still cannot cover `map-canvas`, `start-preset`, `destination-preset`, or `calculate`. Those preset ids are now on the in-flow Point A and Point B selects in this file. The shell must not mount a second pair with the same test ids. Expanded content can push later controls down the page. It does not overlay them.

Gate is 85. Score 91 passes. No further code change was made after this exam.
