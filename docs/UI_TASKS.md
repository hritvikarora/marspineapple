# UI tasks

Branch: `ui/slide-system`, based on merged `main` (`296a310`, pull request #3). Read `docs/UI_DIRECTION.md` before editing. Each task edits only its files. Do not git commit. Do not install packages. Preserve existing `data-testid` values. English only. Educational simulation. Fictional outpost. No oxygen, battery, radiation, or Quest control.

Batches are ten tasks. A later batch starts only after the previous ten are reviewed against the slides: one 1440×900 workspace, map visible, thin paper-and-ink controls, honest metrics, motion under 300ms, and a stacked 390×844 sheet.

## Batch 1 — foundation

### UI-001 — Paper tokens and legacy aliases

Owns: `src/ui/shared/tokens.css` only.

1. Replace the dark slate palette. The live shell must be able to read as white paper and black ink.
2. Define `--color-paper: #FFFFFF`, `--color-paper-subtle: #FAFAFA`, `--color-ink: #000000`, `--color-ink-secondary: #686666`, `--color-hairline: #E5E5E5`, `--color-status: #9E2A2B`.
3. Keep every old variable name. `app.css` uses them with dark hex fallbacks, so a missing name leaves the app dark.
4. Point `--color-surface`, `--color-panel`, and `--color-panel-header` at paper or paper-subtle. No blue panels.
5. Point `--color-text` at ink and `--color-muted` at secondary ink. Muted text must stay at least 4.5:1 on paper.
6. Point `--color-border` at the hairline and `--color-focus` at ink. Focus is a 2px ink ring, not teal.
7. Point `--color-accent` and `--color-accent-hover` at ink. The primary action is black on white, not a teal pill.
8. Point `--color-error`, `--color-error-bg`, and `--color-warning` at the status color on paper. Do not use a second brand hue.
9. Keep `--spacing-1` through `--spacing-6` (4, 8, 12, 16, 24, 32) and add `--space-1` through `--space-5` for 4, 8, 12, 16, 24.
10. Set `--radius`, `--radius-sm`, `--radius-md`, and `--radius-lg` to 12px so old controls pick up continuous corners.
11. Keep `--min-touch-target: 44px`, the system sans stack, and the system mono stack. Do not import a webfont.
12. Set `font-variant-numeric: tabular-nums` on `code`, `kbd`, `pre`, `samp`, `.mono`, `.measurement`, and `.tabular-nums`.
13. Add `--duration-fast: 160ms`, `--duration-medium: 200ms`, `--duration-slow: 280ms`, and `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`.
14. Inside `prefers-reduced-motion: reduce`, set those three durations to `0ms` and keep the existing animation clamp.
15. Do not add a dark theme, a gradient, or a glass token. This is a paper surface.
16. Do not edit `app.css` here. The aliases are what turn the current shell light.
17. Comment at the top that old names are compatibility aliases for the paper system.
18. Do not commit and do not format any other file.
19. There is no TypeScript in this task. Do not run the full test suite.
20. Done when the file is valid CSS and every old variable name used by `app.css` still exists.

### UI-002 — One screen at 1440, a sheet at 390

Owns: `src/ui/app.css` only.

1. Read the current selectors and keep their names: `.app`, `header`, `h1`, `.release`, `.badge.synthetic`, `.banner`, `main`, `.controls`, `.view`, `.results`, `button`, `.btn`, `.btn-primary`.
2. Make `html` and `body` paper background and ink text, with no margin. Use the token variables, not raw hex, except inside a fallback that is also paper.
3. At widths of 900px and above, `.app` is a column of height `100dvh`, `overflow: hidden`, padding 12px 16px, box-sizing border-box.
4. `header` stays one row, at least 44px, hairline bottom border, no wrap that pushes the map down. The title is 20px, weight 560, tracking no tighter than -0.02em.
5. `main` becomes three columns: `300px minmax(0, 1fr) 320px`, areas `controls view results`, gap 12px, `min-height: 0`, `flex: 1`.
6. The map lives in `.view` and must stay on screen. `.controls` and `.results` scroll inside themselves. The document does not scroll.
7. `.view` is a column. The map container grows. The elevation profile, if present, is at most 140px tall and does not push the map away.
8. `.controls` and `.results` use 14px type, secondary ink for hints, and a hairline rather than a heavy top rule.
9. Buttons stay at least 44px tall, ink or paper fill, 12px radius, press `transform: scale(0.97)` in 160ms ease-out. Disabled is 0.45 opacity, not a new color.
10. `.btn-primary` is ink background and paper text. Hover darkens only with opacity or a 1px shift, not a teal wash.
11. Focus-visible is a 2px ink outline with 2px offset. Do not remove it.
12. `.badge.synthetic` is a quiet hairline chip, ink text, not a gold banner. `.banner` is a status-color border on paper, not a dark red slab.
13. Below 900px, `.app` returns to document flow, height auto, overflow visible, with padding for `safe-area-inset-top` and `safe-area-inset-bottom`.
14. At 390px, `main` stacks as controls, then the map, then results. The canvas is about 42vh and never wider than the viewport. No horizontal scroll.
15. Print: white background, `overflow: visible`, no fixed bars, no clipped controls, briefing can grow with the page.
16. Do not hide Calculate, the map, or the result. Do not add a hero, a sidebar logo, or a new class that App.tsx does not already render.
17. Do not edit TSX. If a rule needs a class that does not exist, style the existing element instead.
18. Respect reduced motion: no transition when the duration tokens are 0ms.
19. Do not run the full test suite. This file has no eslint target.
20. Done when a 1440×900 viewport can show header, controls, map, and results without the window itself scrolling.

### UI-003 — Thin button

Owns: `src/ui/shared/primitives/Button.tsx` and `src/ui/shared/primitives/Button.module.css`.

1. Keep `ButtonProps`: `variant` of primary, secondary, danger, ghost; `size` of sm, md, lg; native button attributes; required `children`.
2. Keep `type="button"` as the default. Keep `disabled` and `aria-disabled` behavior.
3. Add a CSS module. The button must still accept `className` from callers such as RequestControls.
4. Minimum size 44×44. Horizontal padding 12px. The visible label is 14px, weight 500. Do not use emoji.
5. Primary is ink fill and paper text. Secondary and ghost are paper with a hairline and ink text. Danger uses the status color for text and border, paper fill.
6. `:active` scales to 0.97 in 160ms with `cubic-bezier(0.23, 1, 0.32, 1)`. Transition only `transform` and `background-color`, never `all`.
7. `:focus-visible` shows a 2px ink outline. Do not rely on color alone for the pressed state.
8. Disabled buttons do not scale and do not look clickable. Cursor is not-allowed.
9. `size="sm"` may reduce padding but must not go under 44px hit area. Grow the padding box, not the font below 14px.
10. Do not animate keyboard-driven clicks with a long delay. 160ms is the ceiling for the press.
11. Under `prefers-reduced-motion: reduce`, drop the transform transition.
12. Do not change the component's export name. `primitives/index.ts` already exports it. Do not edit the index.
13. Do not add a loading spinner prop. Callers own that copy.
14. No `any`. No console. No new dependency.
15. Run `npx eslint src/ui/shared/primitives/Button.tsx` only.
16. Do not edit `app.css`. Global `.btn` rules may still apply; do not fight them with `!important` except for the focus outline if the global rule already uses it.
17. The close glyph "✕" is not this component's job.
18. Do not commit.
19. A button with only an icon is invalid here. Children must include text, or the caller passes an aria-label and visible text.
20. Done when existing `<Button>` call sites still typecheck against the same props.

### UI-004 — Field with the error on the control

Owns: `src/ui/shared/primitives/Field.tsx` and `src/ui/shared/primitives/Field.module.css`.

1. Keep the render-prop API: `label`, optional `description`, optional `error`, optional `required`, `children` given `id`, `aria-describedby`, `aria-invalid`, `aria-required`.
2. The label is a real `<label htmlFor>`. Do not use a placeholder as the label.
3. Stack label, control, description, and error in one column with 4px between label and control and 4px between control and error.
4. The control slot must be able to reach 44px. Do not force a child input's height if you cannot see it; give the slot a min-height of 44px.
5. Error text uses the status color, sits under the control, and is `role="alert"` when `error` is non-empty.
6. `aria-invalid` stays true when an error is present. Described-by still joins description and error ids.
7. Label color is ink. Description is secondary ink. Do not add a second heading.
8. Focus styling belongs to the child. Do not draw a second ring around the whole field group.
9. Required fields add `aria-required`. Do not add a red asterisk that is the only signal. If you mark required, include the word "required" in the description or visually next to the label as text.
10. Module classes only. Keep `className` on the root.
11. 12px radius is not applied to the wrapper. The inner control owns the radius.
12. No `any`. No console. Do not edit `primitives/index.ts`.
13. Run eslint only on `Field.tsx`.
14. Do not change the `useId` wiring. Tests and callers depend on stable associations within one render.
15. Empty error string is treated as no error.
16. Do not commit.
17. Do not add a tooltip library.
18. Long labels wrap. They do not overflow the 300px rail.
19. Reduced motion does not apply unless you add a transition. Prefer no transition here.
20. Done when a caller can still write `children={({ id, ...aria }) => <input id={id} {...aria} />}`.

### UI-005 — Hairline panel

Owns: `src/ui/shared/primitives/Panel.tsx` and `src/ui/shared/primitives/Panel.module.css`.

1. Keep props: optional `title`, optional `headerAction`, `children`, `as` of section, div, or aside, plus native HTML attributes.
2. Default element remains `section`. The root class must still include `panel` so existing CSS hooks keep matching, plus the module class.
3. Background paper. Border 1px solid hairline. Radius 12px. Padding 12px. No drop shadow and no left color bar.
4. If `title` is set, render it as an `h3` at 14px, weight 560, ink, with 8px below it and more space above the title than below it.
5. `headerAction` stays on the same row as the title, aligned to the end, and must not shrink the title below one line of wrapping.
6. Body text is 14px. Do not add a kicker or an eyebrow above the title.
7. Panels in a column separate themselves by margin 0. The parent owns the gap. Do not add a 24px outer margin that blows the rail apart.
8. Do not nest a card look inside the panel. One border is enough.
9. Focus: if the panel is not interactive, do not give it a tabindex.
10. No `any`. No console. Do not edit the primitives index.
11. Run eslint only on `Panel.tsx`.
12. Long titles wrap with `text-wrap: balance` where the property is supported, and a normal wrap otherwise.
13. Do not change the DOM order of title then body. Assumptions and other features render their own headings inside children; that is their problem, not a second title from you unless `title` is passed.
14. Do not commit.
15. Print color of the panel is white with a 1px border. No dark fill.
16. The panel does not animate on mount. It is always on screen in the rail.
17. Header action buttons are not restyled here. They use Button.
18. Do not import tokens as a JS object. Use CSS variables.
19. Overflow of the body is visible. The rail scrolls, not a nested panel scroll, unless the content is a long list the feature already scrolls.
20. Done when `<Panel title="Routing">` still renders an h3 with that string.

### UI-006 — One-line notice

Owns: `src/ui/shared/primitives/InlineNotice.tsx` and `src/ui/shared/primitives/InlineNotice.module.css`.

1. Keep props: `variant` of info, warning, error, success; optional `title`; `children`; native div attributes.
2. `role` stays `alert` for error and `status` otherwise.
3. One line when the copy is short. Allow wrap on a 300px rail. Do not become a multi-paragraph banner.
4. Paper background, 1px hairline, 12px radius, padding 8px 12px. Error and warning use the status color for border and text. Info and success stay ink on paper.
5. Do not use a gold or green fill. Success is not a celebration block.
6. If `title` is set, it is a bold prefix on the same line as the children, not a second heading level that stacks a card.
7. No emoji and no "✕" glyph. If you need a mark, use a 1.5px inline SVG and `aria-hidden`.
8. Do not animate the notice in. It is state, and it can appear on every keystroke of a bad coordinate.
9. Keep `className` merging. Existing class names `notice` and `notice-${variant}` must remain on the root so old CSS does not lose the hook.
10. No `any`. No console. Do not edit the index.
11. Run eslint only on `InlineNotice.tsx`.
12. The notice must not be position fixed. Callers place it.
13. Contrast of status text on paper must stay readable. Use `#9E2A2B` on white, not white on a pale pink that fails.
14. Do not commit.
15. Children can be a string or a node. Do not force a single string type.
16. Do not add a close button. Dismissal belongs to the toast task.
17. `title` optional means no empty bold element when it is absent.
18. Padding stays inside the 44px world. This is not a button.
19. Reduced motion: nothing to disable if you add no animation. Do not add one.
20. Done when `<InlineNotice variant="error">Excluded cell</InlineNotice>` still exposes `role="alert"`.

### UI-007 — Drawer that keeps the focus trap

Owns: `src/ui/shared/primitives/ModalDrawer.tsx` only. Add styles in `src/ui/app.css` only if you cannot avoid it. Prefer a module `ModalDrawer.module.css` next to the component if you need new rules, and you may create that file.

1. Keep props: `isOpen`, `onClose`, `title`, `children`, `position` of left or right, `className`.
2. Keep the focus move to the first focusable control, the Tab wrap, Escape calling `onClose`, and restore of the previously focused element on close.
3. When `isOpen` is false, return null. Do not leave an invisible dialog in the tab order.
4. Replace the "✕" close control with a button whose visible text is "Close" or an inline SVG plus `aria-label="Close dialog"`.
5. The overlay is a light scrim, `rgba(0,0,0,0.18)`, not a dark slab. Clicking the scrim still calls `onClose`.
6. The panel is paper, ink text, hairline border, full viewport height, width min(400px, 100vw). It must not cover the map more than that width.
7. Open motion is `transform` from `translateX(12px)` plus opacity, 220ms, ease-out. Do not slide from off-screen if that feels slow; 12px is enough. Left position mirrors the axis.
8. Use a CSS transition, not a keyframe, so a second open can reverse. `@starting-style` is welcome when you also keep a fallback that shows the drawer if the browser ignores it.
9. Under reduced motion, appear in place with no translation.
10. `role="dialog"`, `aria-modal="true"`, and the title wired with `aria-labelledby` to the heading. You may keep `aria-label` as well if the heading id is set.
11. The close control is at least 44px.
12. Do not lock body scroll in a way that breaks the 1440 workspace permanently after close. If you set `overflow` on body, restore it in the effect cleanup.
13. No `any`. No console. Run eslint only on this tsx.
14. Do not import a focus-trap library. The existing loop stays.
15. Do not commit. Do not edit App.tsx.
16. Children scroll inside the drawer if they overflow. The header stays put.
17. Title is 16px, weight 560, `text-wrap: balance`.
18. Escape still prevents default so it does not also clear a focused input outside.
19. Do not add a second dialog implementation.
20. Done when opening, tabbing past the last control, and Escape still restore focus.

### UI-008 — Tabular measurements

Owns: `src/ui/shared/primitives/formatters.ts` and `src/ui/shared/primitives/MeasurementFormat.tsx`.

1. Keep `formatMeters`, `formatDegrees`, and `formatPercent` signatures. Null, undefined, and non-finite become the em dash "—".
2. `formatMeters` returns `${value.toFixed(decimals)} m`. Default decimals stay 0. Do not switch to scientific notation for values under 1e6.
3. `formatDegrees` returns a trailing degree sign. Default decimals stay 1.
4. `formatPercent` keeps a trailing percent sign.
5. Add nothing that formats latitude or longitude.
6. `Measurement` keeps `value`, `unit` of `m`, `deg`, `%`, or `s`, and optional `decimals`.
7. Seconds use the same finite check and render `${value.toFixed(dec)} s`.
8. The span keeps classes `measurement` and `measurement-${unit}` and adds `tabular-nums` so columns line up.
9. The unit stays visible in the same node as the number. Do not split the unit into a place the screen reader drops.
10. Negative metres are allowed. Do not clamp elevation.
11. No `any`. No console. Do not edit the index.
12. Run eslint on both files.
13. Do not commit.
14. Do not round with a custom banker function. `toFixed` is the existing contract.
15. A value of 0 is `0 m`, not the dash. The dash is only for non-finite.
16. Do not add thousands separators. Tests and JSON-adjacent UI should stay simple. A narrow no-break thin space is forbidden here because it changes the string.
17. The component must not read the store. It is presentational.
18. Do not format a duration as minutes unless the caller already passed seconds and decimals. Do not invent a clock.
19. Class `measurement` must remain so tokens.css tabular rules apply.
20. Done when `formatMeters(48.3, 1)` is `48.3 m` and `formatMeters(Number.NaN)` is `—`.

### UI-009 — Command menu

Owns: `src/ui/shell/CommandMenu.tsx` and `src/ui/shell/CommandMenu.module.css` only. Create `src/ui/shell/` if needed.

1. Do not import this from App.tsx. Export a component and a props type.
2. Props: `open` is not internal-only. The component may own `open` state. It needs callbacks: `onCalculate`, `onCancel`, `onSetMode(mode: '2d' | '3d')`, `onExport`, `onToggleStrict`, and booleans `canCalculate`, `canCancel`, `canExport`, `strictQuality`, `strictSupported`.
3. A button labelled "Commands" with a `<kbd>Ctrl K</kbd>` hint opens it. On macOS the hint may read "⌘K" but the listener accepts both meta and ctrl.
4. Listen for Ctrl+K and Meta+K on window while mounted. Prevent default. Ignore the shortcut while the user is in a text field only if you would steal a find-in-page; this app wants the shortcut, so preventDefault even inside inputs, except when a dialog other than this menu is open. If that is too risky, preventDefault only when the event target is not a textarea. Document the choice in a one-line comment.
5. The menu is a `role="menu"` in a paper panel, hairline, 12px radius, origin at the button (`transform-origin: top right`). Scale from 0.98 and fade, 160ms ease-out. Not from 0.
6. Rows: Calculate, Cancel, 2D, 3D, Export JSON, Strict quality. Each row shows the action and a shortcut hint: Enter is not required. Show C, Esc, 2, 3, E, S as hints. They are hints, not a second hidden behavior, except Calculate on C, Cancel on Esc while open, modes, export, and strict when the menu is open.
7. Disabled rows stay visible: Cancel when `canCancel` is false, Export when `canExport` is false, Strict when `canStrict` is false. Use `aria-disabled` and do not call the handler.
8. Escape closes and returns focus to the button that opened the menu.
9. Arrow Up and Down move the active row. Home and End move to the ends. Enter activates.
10. Clicking a row activates and closes.
11. Do not animate when `prefers-reduced-motion` matches. Read `matchMedia` safely; if it is missing, treat motion as allowed.
12. No store import. No `any`. No console. The parent will wire the callbacks later.
13. Hit area of each row is at least 44px. The panel is at least 280px wide and must fit a 390px screen with 16px side inset.
14. Run eslint on the tsx.
15. Do not commit. Do not edit App.tsx.
16. Labels are exactly those six actions. Do not add a search field in this task. A command menu without search is acceptable because there are six honest actions, not fifty.
17. The button that opens the menu is at least 44px and has `aria-haspopup="menu"` and `aria-expanded`.
18. Unmount the window listener on cleanup.
19. Do not trap focus in a second copy of ModalDrawer. This menu is a popover, not a modal. Tab should still close it on blur of the panel.
20. Done when the file exports `CommandMenu` and eslint is clean.

### UI-010 — Undo toast

Owns: `src/ui/shell/UndoToast.tsx` and `src/ui/shell/UndoToast.module.css` only.

1. Do not wire it into App.tsx.
2. Props: `message: string | null`, `onUndo: () => void`, `onDismiss: () => void`. When `message` is null, render nothing.
3. Render a `role="status"` toast, not an `alert` that steals the screen reader on every map click. The message is the text the parent supplies, for example "Destination set to Layered Fan".
4. Include a button labelled "Undo" that calls `onUndo`. The button is at least 44px.
5. Include a dismiss control labelled "Dismiss" that calls `onDismiss`.
6. Position is the caller's job if you export a class. Default the toast to `position: fixed; left: 16px; bottom: 16px` with `padding-bottom: env(safe-area-inset-bottom)` added to the offset so a phone home bar does not cover it.
7. Enter with a transform from `translateY(8px)` and opacity 0 to rest, 200ms ease-out. Use a transition or `@starting-style`, not a keyframe that restarts badly.
8. Reduced motion: appear with no travel.
9. Paper background, ink text, hairline, 12px radius, shadow only if it is a soft 0 8px 24px rgba(0,0,0,0.08). No hard offset shadow.
10. The toast must not cover the Calculate button at 1440. Bottom-left of the viewport is the right default. Width max 360px.
11. No timer is required. If you auto-dismiss, use 5000ms and clear the timer on unmount and when `message` changes. Do not dismiss before the user can reach Undo.
12. No `any`. No console. No store import.
13. Run eslint on the tsx.
14. Do not commit.
15. Do not say "success" or show a checkmark animation. The sentence and the Undo button are the whole component.
16. `message` changes replace the text. Do not stack multiple toasts in this task.
17. The Undo button uses type="button".
18. z-index above the map and below a modal dialog. Use 20.
19. Do not import framer-motion. It is not a dependency.
20. Done when a null message renders null and a string message exposes a button named Undo.

## Batch 2 — controls that already mount

### UI-011 — Destination presets as a short combobox

Owns: `src/ui/features/destinations/Destinations.tsx`, `destinations.css`, and `Destinations.test.tsx`.

1. Read the test file first. Keep every `data-testid` it queries, including `destinations-feature`, `start-preset-dropdown`, `destination-preset` if present, `destinations-dropdown`, `no-science-stops`, chip ids, and `selected-destination-details`.
2. Also keep a control the start menu and smoke tests can find: if the file currently renders `start-preset` or `destination-preset`, do not remove them.
3. Science stops stay filtered the way they are now (`science-stop` and `test`). Do not drop a POI the manifest marks as a stop.
4. The destination control is a `<select>` or an input-plus-list that filters as you type. If you add a text filter, the underlying value must still be the POI id, not the display name.
5. Names wrap. A long science-stop name must not widen the 300px rail or overflow with nowrap.
6. Chunk the list: the select's visible label is the place name. Do not repeat the description under every option. Put the description in `selected-destination-details` only after a choice.
7. Choosing a stop calls `setEndpoint('destination', position, id)` with the manifest position. Do not snap or invent a different coordinate in this file.
8. A start preset, if this component owns one, calls `setEndpoint('start', ...)`. Do not remove the start path if tests click it.
9. Empty list still renders `no-science-stops` with a sentence that says no science stops are in this bundle. Not an illustration.
10. Paper, hairline, 44px control, ink text. Use existing Button and Panel if that keeps the tests stable. You may restyle `destinations.css` to the paper tokens.
11. Remove paragraph-length hints. One line under the label is enough: "Science stop".
12. Do not call the stop fictional. The outpost line lives in mission context, not here.
13. No `any`. No console. No new test id unless you also query it in the test you add.
14. Add one test that a long place name is present in the document and the option value remains the manifest id.
15. Run `npx vitest run src/ui/features/destinations/Destinations.test.tsx` and eslint on the tsx and test.
16. Do not edit the store or App.tsx.
17. Do not commit.
18. Keyboard: the native select is enough. Do not replace it with a div that has no arrow-key behavior unless the test still passes and arrow keys change the active option.
19. Do not geocode. Ids come from the POI list.
20. Done when the existing destination tests pass.

### UI-012 — Start, destination, and the cell that was accepted

Owns: `src/ui/features/endpoints/**` only. Do not edit `src/ui/shared/types.ts` or App.tsx. Inspect mode is a later task.

1. Read `endpoints.test.tsx` and keep every test id it uses: `pick-mode-toggle`, `endpoint-card-start`, `endpoint-card-destination`, east and north inputs, apply, snap, clear, feedback, requested position, cell centre, cell indices, error, empty, `swap-endpoints`, `grid-info-card`.
2. Restyle the pick mode control as a two-segment pill: Start and Destination. 44px tall. The selected segment is ink on paper. The other is paper with a hairline. Selection is not color alone: `aria-checked` or the existing radio stays, and the selected segment has weight 600.
3. Keep the radios in the accessibility tree. You may hide the native input visually if the label remains the hit target and the input stays focusable.
4. The east and north fields accept messy text. Parsing stays in the existing validation module. Do not rewrite the numeric rules. On reject, keep the prior endpoint and show the existing error test id.
5. When a point exists, the feedback row shows the requested east and north and the accepted cell centre from the values the component already computes. Do not call a new snap function that moves the stored point.
6. Cell indices stay `row, col` from the existing helpers. No latitude.
7. Swap stays a button labelled Swap. It exchanges start and destination through the existing handler.
8. Clear sets that endpoint to null through the existing handler and does not clear the other one.
9. Apply still commits the typed pair. Do not auto-apply on every keystroke if the tests expect a button.
10. CSS module or the existing `endpoints.module.css` only. Paper, hairline, 12px radius, 14px type. Errors use the status color.
11. The grid info card is one line: width, height, cell size in metres. Not a paragraph.
12. No `any`. No console. Run the endpoints vitest file and eslint on the tsx files you change.
13. Do not commit.
14. Do not add an Inspect segment in this task. The prop type is still `'start' | 'destination'`.
15. 44px hit on Apply, Swap, Clear, and both pill segments.
16. Reduced motion: no shake required. If you keep a reject shake, it must be under 220ms and disabled under reduced motion. The error text is the real signal.
17. Do not import Leaflet or a map library.
18. Long error strings wrap inside the card.
19. Tabular numbers on the coordinate readouts via the measurement class or `font-variant-numeric`.
20. Done when `endpoints.test.tsx` passes without changing expected test ids.

### UI-013 — Three policies, equation behind a disclosure

Owns: `src/ui/features/assumptions/**` only.

1. Read `Assumptions.test.tsx` first. Keep `assumptions-feature`, `policy-toggle-shortest-feasible`, `policy-toggle-terrain-aware`, `policy-toggle-uncertainty-aware`, `no-policies-warning`, `strict-quality-toggle`, `round-trip-toggle`.
2. The three policies stay visible. Do not hide them behind an advanced drawer. Hick's law applies to weights, not to the three real choices.
3. Each row is one line: checkbox and the short name (Shortest feasible, Terrain-aware, Uncertainty-aware). Move the long description into a `<details>` that is closed by default.
4. The cost equation from the slides is the disclosure body, as text, not a solver: shortest distance, plus a slope and roughness penalty, plus a quality penalty. Label it "Weights". Do not compute a route.
5. Strict quality is a switch or the existing checkbox, but the copy must not say OUTSIDE_EXTENT or MANUAL. Say that strict mode hard-excludes low and unknown quality cells when this bundle allows it, and that prefer mode keeps them with a cost penalty.
6. When `strictQualitySupported` is false, the control is disabled and a single line says this bundle has no strict quality classes. Do not invent support.
7. Round trip stays a second switch. Copy: "Plan a return leg." Do not promise the return exists.
8. Zero policies still shows `no-policies-warning`.
9. Dispatch the same actions: `mission/setPolicies`, `mission/setStrictQuality`, `mission/setRoundTrip`. Do not dispatch on disclosure toggle.
10. Paper rows, 44px hit, hairline between rows. The checkbox itself can be 16px if the label's hit box is 44px tall.
11. No `any`. No console. Run the assumptions vitest file and eslint.
12. Do not commit. Do not edit the store.
13. Do not add a fourth policy.
14. Do not show oxygen, battery, or a speed field here.
15. The disclosure uses a real `<details>` and `<summary>` so it works without a mouse. Summary text is "Weights".
16. Opening weights does not change `mission` and must not make `isStale` true. You achieve that by not dispatching.
17. Titles stay in sentence case or the existing title case the tests look for. If a test matches "Shortest Feasible", keep that string.
18. Disabled strict control is not hidden.
19. Reduced motion: the native disclosure does not need a custom animation.
20. Done when the equation is absent from the document until the summary is clicked, and the strict wording no longer contains OUTSIDE_EXTENT.

### UI-014 — Calculate, and Cancel only while running

Owns: `src/ui/features/request-controls/**` only.

1. Read the test file. Keep `request-controls-feature`, `calculate`, `cancel-request`, `solving-progress`, `cannot-request-reason`.
2. The Calculate button is the primary ink button. Label "Calculate" when there are no candidates and "Recalculate" when `candidateCount > 0`. You may keep the word "route" if a test searches for "Calculate".
3. Disable Calculate when `canRequest` is false or `isRunning` is true. Do not fire `requestRoute` in those states.
4. Cancel is not in the document unless `isRunning` is true. It calls `cancelRoute`.
5. While running, `solving-progress` is a status line. Do not fake a percent. The parent does not pass explored cell count today. Say "Calculating" and nothing numeric unless the prop list already includes a count. Do not invent a prop the slot type does not have. Checked type: `RequestControlsSlotProps` has no explored count. Copy is "Calculating". The worker pill task will show the count later.
6. When `canRequest` is false and a reason exists, show `cannot-request-reason` with that string. Do not replace the engine's reason with a friendlier lie.
7. Press scale comes from Button. Do not add a 400ms delay before `requestRoute`. The click handler stays synchronous.
8. `aria-busy` on Calculate while running.
9. No `any`. No console. Run the request-controls vitest file and eslint.
10. Do not commit.
11. Do not add a progress bar element that implies a known fraction.
12. The reason wraps inside the rail.
13. Cancel is a secondary or danger button, at least 44px, labelled Cancel.
14. Do not hide the feature container.
15. Do not call `requestRoute` twice on a double click beyond what the disabled state already stops. Disabled during `isRunning` is the idempotency.
16. Do not edit the runner or the worker.
17. Paper and ink only.
18. If the test looks for the text "Calculating", keep a word it can find. Read the test before changing strings.
19. The progress node is `aria-live="polite"` as it is now.
20. Done when Cancel is absent in the idle render the test mounts, and present when `isRunning` is true.

### UI-015 — Layers that do not recalculate

Owns: `src/ui/features/layer-controls/**` only.

1. Read the test. Keep `layer-controls-feature`, `layer-card-${key}`, `layer-toggle-${key}`, and `layer-opacity-${key}` for every key the component maps.
2. Keys are elevation, slope, roughness, quality, exclusion, route, and poi. Do not drop one.
3. A layer row is one line: name, visibility toggle, and the existing opacity control if tests require it. Opacity can be a native range. Dragging a row must not be required and must not be implemented.
4. Toggles dispatch `view/setLayer` only. Never dispatch a mission or route action. Display changes must not stale a route. The reducer already ignores layer actions for staleness; do not add a local recalculate call.
5. Short names: Elevation, Slope, Roughness, Quality, Exclusion, Route, Places. You may keep the longer accessible name in `aria-label` if the test looks for the old label. Read the test.
6. Remove the legend swatches from this rail if they make the column taller than the viewport. The legend task owns swatches. If a test expects legend text, keep one word per row and do not delete the assertion target.
7. 44px row hit. Paper. Hairline dividers. No card-in-card.
8. Opacity input has a label that includes the layer name, not a bare range.
9. No `any`. No console. Run the layer-controls vitest file and eslint.
10. Do not commit.
11. Do not import the canvas. This feature only dispatches.
12. Quality is not described as a probability.
13. The route layer toggle does not delete the route.
14. Keyboard: the checkbox and range are native.
15. Do not add a "select all" if it is a seventh decision with no existing action.
16. Long descriptions move into `title` tooltips or go away. The row stays one line.
17. Disabled is unused. All seven layers are always available as display, even when the bundle is missing a raster. The map feature owns the empty raster.
18. Group label "Layers" as a legend or h3, one line.
19. Reduced motion: no row animation.
20. Done when toggling in the test still dispatches `view/setLayer` and does not dispatch `mission/setPolicies`.

### UI-016 — Scale bar in local metres

Owns: `src/ui/features/map-chrome/**` only.

1. Read `MapChrome.test.tsx` and `scale.ts`. Keep `map-chrome-info` and any test id the test queries.
2. The chrome is a north mark "N" with an up arrow, and a scale label in metres computed by the existing `scale.ts`. Do not invent a new projection.
3. Draw through the existing canvas layer registration. Do not add a second canvas.
4. The scale bar sits at the bottom edge, inset 12px, and must leave the corner free for a later inspector. Do not cover more than 36px of height.
5. Type is 12px mono, tabular, ink or white with a 1px ink halo so it survives pale and dark terrain. Double encoding: text plus the bar, not color alone.
6. No latitude, longitude, or degree ticks.
7. No `any`. No console. Run the map-chrome vitest file and eslint.
8. Do not commit.
9. Do not change the grid math. If `scale.ts` returns a distance, render that distance.
10. The north mark does not rotate. The frame is north-up.
11. Clean up the draw callback if the component already returns an unregister function. Do not leak a second registration on rerender.
12. Hit testing is not required on the scale bar. It is not a button.
13. Paper chip behind the label is allowed if the halo is not enough, at 80% paper opacity. Keep it smaller than 120×28.
14. Do not draw a minimap.
15. Do not read the route result. Chrome is the grid and the CRS label only if the test already shows the CRS name. If you show CRS, one short name, no WKT dump.
16. Reduced motion: the scale does not animate.
17. Do not edit MapCanvas.tsx.
18. Font: the canvas `font` string should request a monospace face and the label should not use a proportional digit string you measure incorrectly. Keep the existing measurement approach if tests snapshot pixels; do not break a pixel test. Read the test before changing draw coordinates.
19. If the test is a logic test of `scale.ts`, do not change `scale.ts` unless a bug makes the label lie. Prefer not to change it.
20. Done when the chrome test passes and the label contains "m".

### UI-017 — Start and destination marks

Owns: `src/ui/features/map-markers/**` only.

1. Read the test. Keep `map-markers-info` and any id it queries.
2. Start and destination marks must read on pale and dark terrain. Use an ink stroke and a paper fill, or the inverse, with the letters S and D. Not color alone.
3. POI marks, when the poi layer is visible, stay smaller and labelled with the existing symbol or a short dot plus the name only if the current code already draws names. Do not add a name for every cell.
4. Marks sit on the cell centre the current code already uses. Do not add a pixel nudge that changes the cell.
5. Keep the unregister path so a rerender does not stack draw functions.
6. No `any`. No console. Run the map-markers vitest file and eslint.
7. Do not commit.
8. Do not import three.
9. Selection of a marker still goes through the existing `onPick` if the feature owns clicks. Do not add a second pick path that skips `onPick`.
10. The start mark and destination mark are distinguishable with the letter, not only with hue.
11. Line width at least 1.5 device pixels. Account for `devicePixelRatio` only if the current canvas code already does. Do not double-scale if MapCanvas already did.
12. Do not draw the route. That is map-routes.
13. Hidden poi layer means those marks are not drawn. Start and destination still draw. Match the current rule if the test says otherwise.
14. No animation on the pin. Pins are state.
15. Do not edit contracts or grid.ts.
16. If a test looks for a specific fill style string, keep a compatible string or update the test in this folder only when the assertion was cosmetic. Prefer keeping the assertion true.
17. No emoji markers.
18. The info node can stay visually hidden if the test only checks text. Do not remove the text the test expects.
19. Reduced motion: nothing to add.
20. Done when the markers test passes.

### UI-018 — Raster legend words

Owns: `src/ui/features/map-rasters/**` only.

1. Read the test and `colorScale.ts`. Keep `map-rasters-info`. Keep the small-grid `fillRect` path. Do not switch the basemap to an image overlay or Leaflet.
2. Legend words, if this feature draws them: Good, Low, Unknown, No elevation. Match quality codes 1, 2, 3, and 0. Do not call quality a probability.
3. Exclusion patterns stay distinct from quality: missing elevation, unsupported derivative, outside extent, manual. If the current legend is shorter, do not invent a second legend that covers the map. One line in the info node is enough.
4. Layer visibility still comes from props. A hidden layer is not drawn. Do not dispatch.
5. No `any`. No console. Run the map-rasters vitest file and eslint.
6. Do not commit.
7. Do not change the color scale enough to break a test that expects a specific RGB. Read `colorScale.ts` and the test before editing colors.
8. If you change a swatch, keep a word with it.
9. Cleanup of the canvas registration stays.
10. No data URL of a remote tile. This feature paints the bundle arrays it is given.
11. Do not read route candidates.
12. HiRISE pixel caps live in MapCanvas. Do not raise a cap here.
13. Crosshatch for missing data is welcome only if it does not replace the tested fill on the small grid. If the test counts fillRect calls, keep that path.
14. The info string stays honest when a layer is off: say which layer is hidden, if the test expects that. Read the test.
15. No animation of raster opacity beyond what the layer opacity prop already does.
16. Do not edit the bundle files.
17. Paper and ink apply to the HTML status line, not to the terrain pixels.
18. Do not clamp elevations.
19. Reduced motion: no raster fade required.
20. Done when the rasters test passes and the small-grid path still uses fillRect.

### UI-019 — Solid selected route, dashed stale route

Owns: `src/ui/features/map-routes/**` only.

1. Read the test. Keep `map-routes-info` and `map-routes-stale-indicator`.
2. The selected candidate is a solid ink or paper-contrasting stroke. Equivalent policies that share a path are one line. Do not offset duplicates to pretend they are different corridors.
3. When `stale` is true, that same line is dashed and the stale indicator text remains. Do not delete the geometry while stale.
4. Rejected or non-selected paths, if the feature already draws them, are dashed and lighter. Do not drop a candidate the test expects to see.
5. Hover index, if drawn, is a small mark on the existing sample. Do not invent a new index.
6. No `any`. No console. Run the map-routes vitest file and eslint.
7. Do not commit.
8. Do not recompute length. The polyline comes from the candidate path.
9. Cleanup of the draw registration stays.
10. Do not label a route "safest".
11. Round-trip return geometry, if the candidate has a return leg and the current code draws it, stays visually distinct by dash pattern, not by a second hue family. If the current code does not draw the return leg, do not add a new geometry pass that could disagree with the metrics.
12. Line width stays readable, about 2px, with a light halo if the current code has one.
13. Hidden route layer means no route strokes. Keep that.
14. No animation along the path. The line is state. A marching-ants loop is forbidden.
15. Do not edit the solver.
16. The info node can name the selected candidate id if it already does.
17. Stale copy in the indicator is the word Stale, not a paragraph.
18. Do not draw arrows that look like a compass. Direction chevrons are optional and off unless already present.
19. Reduced motion: no dash animation.
20. Done when the routes test passes and the stale indicator still renders when `stale` is true.

### UI-020 — One line of mission context

Owns: `src/ui/features/mission-context/**` only.

1. Read the test and `nextAction.ts`. Keep `mission-context-panel`, `mission-context-synthetic-badge`, `mission-context-production-warning`, `mission-context-simulation-disclaimer`, `mission-context-synthetic-warning`, `mission-context-fictional-outpost`, `mission-context-next-step`.
2. The visible block is three short lines at most, not a stack of paragraphs.
3. Line one: the bundle title. Line two: "Educational simulation" and the fictional-outpost sentence the test expects. Keep the fictional-outpost test id on that sentence.
4. Synthetic badge stays the text the test expects, including `[Synthetic Fixture]` or `SYNTHETIC` if that is the assertion. Read the test and keep the exact phrase.
5. Production warning stays when `production` is true and the manifest is synthetic. Do not soften it into a tooltip. It can be one sentence. The test id stays. It must remain an alert.
6. Next step is one line from `nextAction.ts`. Do not write a new planner. If the helper returns a long string, leave the helper unless the test allows a shorter string. You may shorten the helper only inside this folder when the test checks behavior rather than a paragraph.
7. Do not remove the disclaimer test id. If you must shorten, keep the words "educational" and "not a safety assessment" if the test looks for them.
8. Paper, 14px, secondary ink for the second line. No hero.
9. No `any`. No console. Run the mission-context vitest file and eslint.
10. Do not commit.
11. Do not mention oxygen, life support, or a headset.
12. Release id rendering belongs to the header. Do not duplicate a second release paragraph if the test does not require it.
13. The panel does not use a modal.
14. Long titles wrap with balance.
15. Do not import the router or the exporter.
16. Badge is a quiet chip, still impossible to miss: ink text, hairline, the test's words.
17. Do not dispatch.
18. Reduced motion: none.
19. Keep `nextAction.ts` pure if you touch it. No DOM.
20. Done when the mission-context tests pass and the panel is not a page of paragraphs.

## Batch 3 — shell composition

### UI-021 — Header, menu, toast, and the live grid

Owns: `src/ui/App.tsx` only.

1. Do not remove a test id that App currently renders: `synthetic-badge`, `release-id`, `synthetic-production-warning`, `bundle-error`, `route-status`, `stale`, `calculate` via the request-controls slot or the fallback button.
2. Import `CommandMenu` and `UndoToast` if those files exist. If the import fails because batch 1 is missing, stop and leave App.tsx unchanged rather than inlining a second menu.
3. Mount the command menu in the header. Wire Calculate to `requestRoute`, Cancel to `cancelRoute`, 2D and 3D to `view/setMode`, Export to the existing `onExport`, and strict to `mission/setStrictQuality` flipped from `m.strictQuality`. Pass `strictQualitySupported` from the manifest. If the bundle is null, do not mount the menu.
4. The header also shows the product name "Mars Pathfinder", the release node, and the synthetic badge. One row. Do not add a second marketing line.
5. Add a 2D/3D control only if you can keep the existing radios or replace them with buttons that still expose `name="view"` inputs with values 2d and 3d. Tests may look for those radios. If you replace them, keep two inputs with `name="view"`.
6. Undo toast state is local: `{ message: string | null, undo: () => void }`. When `setEndpoint` changes start or destination, store the previous endpoint and a message "Start updated" or "Destination updated". Undo writes the previous endpoint back. Do not undo policy changes in this task.
7. Do not move Calculate off the first screen. The request-controls slot stays.
8. Keep every Slot and its props. Do not delete media, sources, point-inspector, comparison, briefing, or profile slots.
9. Loading and bundle error copy stay. `bundle-error` remains a role=alert.
10. No `any`. No console. Run `npx eslint src/ui/App.tsx` only. Do not run the full suite.
11. Do not commit.
12. Do not edit CSS. UI-002 owns the grid. Your markup keeps the classes `app`, `controls`, `view`, `results`.
13. The command menu callbacks must not run when the matching can* flag is false.
14. Export still no-ops when the run is not a successful finish. `onExport` already returns early.
15. Do not import `three`, `evaEngine`, or `searchTrace` from App. The existing dynamic import of searchTrace may stay. Do not add a static import of it.
16. Pick mode state stays `'start' | 'destination'` in this task.
17. Keyboard shortcut ownership is inside CommandMenu. Do not add a second window listener for Ctrl+K in App.
18. The toast message clears when Dismiss or Undo runs. Undo performs the restore and then clears.
19. Do not remove StartMenuModal. A later task restyles it.
20. Done when eslint passes and the test ids listed in line 1 are still in the file.

### UI-022 — Point inspector on the map

Owns: `src/ui/MapCanvas.tsx` only.

1. Keep `data-testid="map-canvas"` and the HiRISE pixel cap. Do not raise the cap and do not remove the guard.
2. Show a small card for the hovered cell, or the last picked cell if there is no hover. Fields: east metres, north metres, elevation, slope, roughness, quality word, exclusion word.
3. Quality words: No elevation, Good, Low, Unknown for codes 0, 1, 2, 3. Exclusion words: None, Missing elevation, Unsupported derivative, Outside extent, Manual for codes 0 through 4. Unknown codes render as the number, not a guess.
4. The card uses east_m and north_m labels. No lat or lng.
5. Place the card so it does not cover the scale bar corner. Top-right inside the map container, max width 240px, paper background, ink text, 12px radius.
6. The card is HTML over the canvas, not a second canvas, so text stays sharp. It must be `pointer-events: none` so it does not steal map clicks, except if you add no buttons. No buttons in the card.
7. If the sample has no finite elevation, say "No elevation" and do not invent 0.
8. Do not dispatch a route action from hover. The existing hover callback stays as it is.
9. No `any` added. No console. Run eslint on MapCanvas.tsx only.
10. Do not commit.
11. Do not change pick behavior. A click still sets the endpoint through `onPick`.
12. Tabular numbers in the card.
13. The card updates when the pointer moves and hides its numeric body when the pointer leaves only if you also keep the last picked cell visible. Last pick wins after leave.
14. Do not read a remote tile.
15. Reduced motion: no card animation required. A 160ms opacity fade is allowed and must collapse under reduced motion.
16. Do not import the shell PointInspector in this task if that creates a cycle. You may duplicate the small presentational markup. A later task can swap it.
17. Keep the component's existing props. Do not require a new prop that App does not pass.
18. Slope and roughness come from the bundle arrays the file already has. If a value is missing, show the dash.
19. The card is one column of seven rows, 12px type. It must not grow taller than 220px.
20. Done when eslint passes and `map-canvas` is unchanged as a test id.

### UI-023 — Briefing that can print

Owns: `src/ui/Briefing.tsx` only. You may add `src/ui/Briefing.module.css` if you need rules the global sheet should not own.

1. Keep `data-testid="briefing"` and `data-testid="briefing-hover"`. Keep `data-candidate-id` and `data-hover-index`.
2. The heading is "Mission briefing". One line under it is the release and, when synthetic, the words the current code uses so tests that look for synthetic still pass. Read any briefing test before changing the phrase. If there is no test, "Synthetic data" is acceptable when `manifest.synthetic` is true.
3. No candidate: one line, "No route yet."
4. With a candidate: start name, destination name, horizontal metres, surface metres, ascent, descent, max slope. Use the existing metric fields. Tabular numbers.
5. If `mission.roundTrip` is true and `candidate.missionStatus` is not `round-trip-complete`, say the return leg is missing. Do not add the outbound distance twice and call it a round trip.
6. If the return leg exists, you may show its horizontal distance on its own line labelled "Return". Do not add it into the outbound figure.
7. Stale: one line that the inputs changed and the briefing should be recalculated. Keep that meaning.
8. Hover line stays on `briefing-hover` with east, north, and elevation. Keep the words the current test looks for if any. Search the repo for `briefing-hover` before editing the sentence. If only App or smoke tests check the id, keep the id and the numbers.
9. Optional time: only if you label it as distance divided by 0.50 m/s and call it an assumption. Do not show a time with no speed. Skipping time is also correct.
10. Paper, 14px, no dark panel. The section flows. No `max-height` that clips print.
11. No `any` added. No console. Run eslint on Briefing.tsx.
12. Do not commit.
13. Do not recompute metrics from the path. Read `candidate.outbound.metrics` and `returnLeg?.metrics`.
14. POI names still resolve through the manifest. Unknown ids stay "custom point".
15. Do not render explanation essays. Those stay in comparison.
16. `text-wrap: pretty` or balance on the heading only.
17. The list is a definition list or a short table with units in the cells.
18. Do not import the exporter.
19. Reduced motion: none.
20. Done when both test ids remain and a missing return leg is not labelled complete.

### UI-024 — A short elevation profile

Owns: `src/ui/ElevationProfile.tsx` only.

1. Keep `data-testid="profile"`, `data-candidate-id`, and `data-hover-index`.
2. Empty state stays a single line: the profile appears after a route is calculated. The test id is still `profile`.
3. The SVG height stays at or under 140px so the map keeps the screen. Width should be `100%` of the parent, not a fixed 560 that overflows 390px. Use a viewBox and `preserveAspectRatio` so the existing geometry still maps.
4. The range input or the existing hover control keeps an accessible name "Position along route". If there is no range input, the current mouse handler can stay, and you add a visually present range input that seeks by index so the profile works without a precise pointer.
5. The range uses the sample count. It calls `onHover` with the path index already stored on the profile, not a newly invented index.
6. Axes are labelled in metres. No chart library.
7. Ink stroke on paper. The hover sample is a small dot. Not a rainbow series.
8. No `any` added. No console. Run eslint on this file.
9. Do not commit.
10. Do not read the bundle. The profile is on the selection.
11. Stale routes still show the old profile. Do not blank it. A one-word "Stale" next to the figure is enough if `selection.isStale` exists. Read the `SelectionView` type before adding that. If `isStale` is not on the selection, do not add it.
12. The figure has an accessible name that includes the candidate id.
13. Keyboard: the range input is tabbable.
14. Do not animate the path draw-in. The profile is consulted often.
15. Units on the end labels use tabular numbers.
16. Empty arrays do not throw. If `elevation_m` is empty, render the empty line.
17. Do not change `onHover(null)` behavior on leave if something else depends on it. A range input should not clear hover on blur.
18. Margin stays 0 so the grid does not gain a surprise gap.
19. Reduced motion: no transition on the dot.
20. Done when the profile test id remains and the SVG cannot force a 560px wide page.

### UI-025 — Start menu that does not cover the map

Owns: `src/ui/StartMenuModal.tsx` and `src/ui/StartMenuModal.module.css`.

1. Keep every test id: `start-menu`, `start-menu-synthetic`, `start-menu-region`, `start-menu-point-a`, `start-preset`, `start-menu-point-b`, `destination-preset`, `start-menu-notice`, `start-menu-launch`, `start-menu-plan`, `start-menu-enter-3d`, `start-menu-dismiss`, `start-menu-mute`, `start-menu-expand`.
2. In docked mode the menu is in normal flow inside the controls column, not `position: fixed` over `map-canvas`. It must not cover Calculate, the presets, or the canvas.
3. Expanded mode can be a wider block in the same column or a drawer that still leaves the map's test id hit-testable. Do not use a full-screen opaque layer.
4. Paper, hairline, 12px radius, 44px controls. Ink primary button for the main launch action.
5. Preset selects keep their test ids and still report the POI ids they report now.
6. The notice test id stays a status, not a modal alert, unless it is already an alert. Read the JSX before changing the role.
7. Sound toggle keeps `start-menu-mute` and does not claim to be a radio. Label it Mute or Sound with a pressed state.
8. Dismiss and expand keep their handlers. Do not remove docked versus expanded.
9. No `any` added. No console. Run eslint on the tsx.
10. Do not commit.
11. Do not add a second set of policies that dispatch differently from `onLaunchMission`. The launch payload shape stays.
12. Copy stays short. One line for the fictional outpost if this file says it. Do not add a tutorial carousel.
13. 390px: the menu stacks, no control overflows the viewport.
14. Focus: the first field is labelled. Do not trap focus in docked mode. Docked mode is not a modal.
15. If expanded mode is modal, Escape must call the existing collapse handler. Do not write a second focus trap if you can avoid expanded-as-modal entirely.
16. No emoji.
17. Reduced motion: no open animation longer than 200ms, and none under reduced motion.
18. Do not import the command menu here.
19. The synthetic badge text stays findable.
20. Done when eslint passes and a fixed overlay is not the docked layout.

### UI-026 — Honest 3D status without editing the renderer

Owns: `src/ui/shell/TerrainNotice.tsx` and `src/ui/shell/TerrainNotice.module.css` only. Do not edit `src/terrain3d/**`.

1. Presentational component. Props: `terrainStatus` shaped like `{ status: 'unknown' | 'ok' } | { status: 'unavailable'; kind: string; message: string }`, plus optional `routeStatus` of `'idle' | 'running' | 'success' | 'no-path' | 'timeout' | 'invalid-input' | 'cancelled' | 'data-error'`, plus optional `noPathReason` string, plus `onPrefer: () => void` optional.
2. When terrain status is ok or unknown and route status is success or idle or running, render nothing.
3. WebGL unavailable or context lost: one card, "3D view unavailable". The message from the status is shown. Say the map, policies, and briefing still work. Do not say the mission failed.
4. No-path with reason `disconnected-under-limits`: "No path. A ridge or gap separates these points." Do not say the search was incomplete.
5. No-path with reason `strict-quality-disconnects`: "Strict mode blocked this pair." If `onPrefer` is provided, a button "Use prefer mode" calls it. That button does not calculate by itself.
6. Timeout: "The search stopped at the time limit. That is not proof that no path exists." Never the words "no path" in the timeout card.
7. Invalid input and data error: show the message string you were given. Do not invent a cause.
8. Cancelled: render nothing.
9. Paper card, status border only for timeout and no-path, 14px, role status. Timeout and no-path can be `role="status"`.
10. No `any`. Use a narrow props type. No console. No store import. Run eslint.
11. Do not commit.
12. Do not import three or the TerrainView component.
13. No auto retry button that calls the solver. A later composition task can pass `onPrefer`.
14. 44px on the prefer button.
15. The card does not use position fixed.
16. Copy never mentions oxygen or a headset.
17. Unknown `kind` falls through to the message string.
18. Reduced motion: none.
19. Export the component as `TerrainNotice`.
20. Done when a timeout prop cannot produce the sentence "no path".

### UI-027 — Skeletons that reserve the box

Owns: `src/ui/shell/Skeleton.tsx` and `src/ui/shell/Skeleton.module.css`.

1. Export `Skeleton` with props `width`, `height`, and optional `className`. Width and height are CSS lengths, default `100%` and `44px`.
2. The node is `aria-hidden="true"`. It is not a live region. Callers put the real status text elsewhere.
3. Background `#E5E5E5` on paper. Radius 12px. No gradient animation that implies progress percent.
4. A slow opacity pulse between 0.55 and 1 is allowed at 1200ms, and it must stop under reduced motion.
5. The element is `display: block` so it occupies height and does not let the next row jump up.
6. Do not render text inside the skeleton. Text would be a lie about content.
7. No `any`. No console. Run eslint.
8. Do not commit. Do not mount it in App. The composition task can use it later.
9. Do not use a library.
10. The pulse is a CSS animation on opacity only, not on height.
11. Provide a named export only.
12. className merges after the module class.
13. Do not set a minimum width that forces horizontal scroll. `max-width: 100%`.
14. Height is required to be in the style attribute so the reserved slot is exact.
15. No shadow.
16. The component does not fetch.
17. It does not read the store.
18. Reduced-motion media query sets animation to none.
19. Do not use the word "loading" inside an aria-hidden node as the only loading signal. Callers own the sentence.
20. Done when a 120px height skeleton renders an element of that height.

### UI-028 — Worker pill with the real cell count

Owns: `src/ui/shell/WorkerPill.tsx` and `src/ui/shell/WorkerPill.module.css`.

1. Props: `active: boolean`, `exploredCells: number`. When `active` is false, render nothing.
2. Text is "Working" and the integer `exploredCells` followed by "cells". Example: "Working · 1,840 cells". You may insert a thousands separator for this display only. Do not show a percent.
3. Do not animate a progress bar. A 1.2s opacity pulse on a 6px dot is allowed, and it stops under reduced motion.
4. The number uses tabular nums.
5. Paper chip, hairline, 12px radius, height at least 44px so it can sit in the header without becoming a tiny unreadable pill. The dot can be 6px inside that chip.
6. `role="status"` and `aria-live="polite"`.
7. No store import. The parent passes the count from `routeRun` when `kind === 'running'`.
8. No `any`. No console. Run eslint.
9. Do not commit. Do not edit App in this task.
10. If `exploredCells` is not finite, show "Working" without a number.
11. Do not say "almost done".
12. The chip does not position itself fixed. The parent places it.
13. Ink text, 13px.
14. No emoji.
15. Export `WorkerPill`.
16. A zero count while active is "Working · 0 cells", which is honest at the start of a search.
17. Do not read the worker. You only format the prop.
18. Reduced motion removes the pulse and leaves the text.
19. The live region must not include a changing sentence other than the count, so the screen reader is not shouted at by adjectives.
20. Done when `active={false}` renders null.

### UI-029 — 2D / 3D pill

Owns: `src/ui/shell/ModeSwitch.tsx` and `src/ui/shell/ModeSwitch.module.css`.

1. Props: `mode: '2d' | '3d'`, `onChange: (mode: '2d' | '3d') => void`.
2. Render a radiogroup labelled "View". Two radios or two buttons with `aria-pressed`. Prefer radios named `view` so existing queries that look for `name="view"` still work if this replaces the header control later.
3. Test ids `view-2d` and `view-3d` on the two options.
4. Selected option is ink on paper. The other is paper with hairline. Weight 600 on the selected label as well as the pressed state.
5. Each option is at least 44px. The pair sits on one row.
6. Keyboard: arrow keys move between the two options because they are a radiogroup.
7. 180ms background transition, ease-out, none under reduced motion. The indicator may slide if it is a transform and can reverse. Do not use a keyframe.
8. No store import. No `any`. No console. Run eslint.
9. Do not commit. Do not edit App.
10. Labels are "2D" and "3D".
11. Do not disable 3D when WebGL is missing. The terrain notice explains the failure. The user can still ask for 3D.
12. The group has `role="radiogroup"` if you do not use native radios. If you use native radios, the fieldset legend is "View".
13. Hit slop is the whole segment, not the letters.
14. Export `ModeSwitch`.
15. Do not animate on every render. Only the selection change.
16. 12px radius on the outer pill, not on each letter.
17. Focus-visible ring on the focused segment.
18. Do not import TerrainView.
19. The onChange fires only when the mode actually changes.
20. Done when both test ids are in the file and both modes are keyboard reachable.

### UI-030 — Mobile sheet

Owns: `src/ui/shell/MobileSheet.tsx` and `src/ui/shell/MobileSheet.module.css`.

1. Props: `open: boolean`, `onClose: () => void`, `title: string`, `children`.
2. At widths the parent will only mount this under 900px. You still write it so it works at 390.
3. The sheet is a panel anchored to the bottom, paper, top radius 12px, max height `min(70vh, 100% - 24px)`, with padding for `safe-area-inset-bottom`.
4. A 44px hit handle row. Dragging down more than 80px, or a flick faster than about 0.11 px per ms, calls `onClose`. If you cannot measure velocity safely, the 80px threshold is enough.
5. Pointer events: pointerdown, pointermove, pointerup, and pointercancel. Release the capture on up and cancel.
6. Escape calls `onClose`.
7. Focus moves to the sheet when opened and returns to the previously focused element when closed. Use the same pattern as ModalDrawer, simplified. Do not import a library.
8. A button labelled Close calls `onClose`.
9. The map must remain visible above the sheet. That is why the sheet is not full screen.
10. Motion 280ms ease-out on transform. Reduced motion: no travel, open and close in place.
11. Scrim is the same light `rgba(0,0,0,0.18)`. Click on the scrim closes.
12. No `any`. No console. Run eslint.
13. Do not commit. Do not mount it in App.
14. `role="dialog"` and `aria-modal="true"` and a labelled title.
15. Body of the sheet scrolls. The handle does not scroll away.
16. Do not use vaul or radix. They are not dependencies.
17. Export `MobileSheet`.
18. When `open` is false, render nothing and remove the listeners.
19. The drag transform uses the finger delta and never moves the sheet upward past its rest position.
20. Done when Escape and the Close button both call `onClose`.

## Batch 4 — evidence

### UI-031 — Sources in the existing drawer

Owns: `src/ui/shell/SourceDrawer.tsx` and `src/ui/shell/SourceDrawer.module.css`.

1. Props: `open`, `onClose`, `sources` as a readonly array of objects that may have `title`, `creator`, `distributor`, `url`, `credit` fields (read the manifest source type and use the real fields, all optional-safe), and `limitations: readonly string[]`.
2. Use `ModalDrawer` from the primitives. Do not write a second focus trap.
3. Title "Sources".
4. Each source is one block: the title, then creator and distributor on the next line if present. The URL is a real link with `rel="noreferrer"` when it is http or https. Do not invent a URL.
5. A fixed sentence in the drawer: "A reconstructed view is not a rover photograph."
6. Limitations render as a list under the heading "Limitations". If the array is empty, say "None supplied."
7. Do not claim a DOI or a licence that is not on the object. If the type has those fields, print them.
8. Paper, 14px, links underlined, ink.
9. No `any` except a narrow type you define from the fields you actually read. Prefer importing the source type from contracts if it is already exported. You may import a type. You may not edit contracts.
10. No console. Run eslint.
11. Do not commit. Do not edit App.
12. Do not fetch the URL.
13. Empty sources: "No source records in this bundle."
14. The reconstructed-view sentence is always there, even when a photograph credit exists, so the two are not confused.
15. Export `SourceDrawer`.
16. 44px close comes from the drawer.
17. Long credits wrap. Overflow wraps, no nowrap.
18. Do not mention oxygen.
19. Reduced motion comes from the drawer.
20. Done when the photograph sentence is in the file and ModalDrawer is the only dialog.

### UI-032 — Presentational cell card

Owns: `src/ui/shell/PointInspector.tsx` and `src/ui/shell/PointInspector.module.css`.

1. Props are data, not a bundle: `east_m`, `north_m`, `elevation_m`, `slope_deg`, `roughness_m`, `quality`, `exclusion`, each `number | null`.
2. Render the seven rows named East, North, Elevation, Slope, Roughness, Quality, Exclusion.
3. Quality and exclusion use the same words as UI-022. Null numbers render "—".
4. Units: m, m, m, °, m. Quality and exclusion have no unit.
5. Use `Measurement` for the numbers where the unit matches. Quality and exclusion are words.
6. Paper card, 12px type, tabular numbers, max width 240px.
7. `aria-label="Cell"`. No buttons.
8. No store. No canvas. No `any`. No console. Run eslint.
9. Do not commit.
10. Do not compute slope from elevation. Display the props.
11. Export `PointInspector`.
12. A null quality is the dash, not "Good".
13. The card does not position itself. No fixed, no absolute.
14. Heading inside the card is optional and must not say "Inspector" in a way that adds a second noisy title. The aria-label is enough. If you add a visible heading, it is "Cell".
15. Row layout is a definition list.
16. Status color is not used for Good. Good is ink. Low and Unknown and exclusion other than None use the status color plus the word.
17. Do not import MapCanvas.
18. Reduced motion: none.
19. Zero is a real measurement and must not become the dash.
20. Done when all seven labels are present.

### UI-033 — Print sheet

Owns: `src/ui/shell/print.css` only.

1. This file is a print stylesheet. It does not import a screen framework.
2. Under `@media print`, background is white, text is black, and buttons, the command menu, the toast, and the start menu's buttons are `display: none` if you can target them with existing classes. Do not hide `.briefing` or `main`.
3. `.app` and `main` become block layout, height auto, overflow visible.
4. No element keeps `position: fixed` in print. Override fixed to static for `.app` descendants you know about: the toast class if it uses a module, you cannot see the hash. Target `[role="status"]` only if that would hide the route status. Do not hide `[data-testid="route-status"]`.
5. The briefing section prints in full. `page-break-inside: avoid` on a single metric row is fine. Do not avoid-break the whole briefing if that clips it.
6. Links print their href only for http links, in a smaller size, not as a wall of text.
7. Do not set a dark background.
8. A4 and letter both work because you do not set a fixed page size that clips. You may set `size: auto`.
9. Hide the map canvas if printing it would be a blank bitmap, but do not hide the briefing numbers. Prefer leaving the canvas. If you hide it, a one-line note is unnecessary.
10. Hairline borders may print. Remove large shadows.
11. Do not edit app.css in this task. This file is additive. A later composition task can import it. Add a comment at the top: import this from app.css when the shell is wired.
12. Because an unimported CSS file does nothing, also add one `@import "./shell/print.css" print;` at the bottom of `src/ui/app.css` if that import is the only edit you make there. That single import is allowed.
13. Do not commit.
14. No screen rules outside the print media query, except the import.
15. Font sizes at least 12pt for body in print.
16. The synthetic warning, if present, remains visible in print. It is a safety fact about the data.
17. Do not add a header image.
18. Page margin 16mm.
19. Tables or definition lists in the briefing should not overflow the page width. `max-width: 100%`.
20. Done when print rules exist and screen layout is unchanged except for the import.

### UI-034 — Empty route

Owns: `src/ui/shell/EmptyRoute.tsx` and `src/ui/shell/EmptyRoute.module.css`.

1. Props: `hasStart: boolean`, `hasDestination: boolean`.
2. If both are true, render nothing. The parent shows this only before a result, but the component itself stays quiet when both ends exist so it does not talk over a result.
3. If either end is missing, one sentence: "Choose a start and a destination, then calculate."
4. No illustration, no SVG scene, no mascot.
5. Secondary ink, 14px, `text-wrap: balance`.
6. No button. Calculate is elsewhere, and a second button would duplicate it.
7. No `any`. No console. Run eslint.
8. Do not commit. Do not edit App.
9. Export `EmptyRoute`.
10. Do not say "Let's go" or "Welcome".
11. The sentence is the whole component.
12. role is omitted or `status` only when an end is missing. It must not be an alert.
13. No animation.
14. No store.
15. Paper, no card border. A border would stack with the rail.
16. Max width 36ch so the line measure stays short.
17. Do not mention 3D.
18. Do not mention oxygen.
19. Both false and one false use the same sentence. Do not branch into three lectures.
20. Done when both true renders null.

### UI-035 — Failure cards

Owns: `src/ui/shell/FailureCard.tsx` and `src/ui/shell/FailureCard.module.css`.

1. This is the presentational twin of TerrainNotice for route failures. Props: `status: 'no-path' | 'timeout' | 'invalid-input' | 'data-error'`, `message: string`, `reason?: string`, `onPrefer?: () => void`.
2. Timeout copy is fixed and does not use the word "no path": "The search stopped at the time limit. That is not proof that no path exists." You may append `message` if it does not contradict that.
3. No-path with reason `strict-quality-disconnects` says strict mode blocked the pair and offers "Use prefer mode" when `onPrefer` is set.
4. No-path otherwise says no path was found under the current limits, and shows `message`.
5. Invalid input shows `message` and does not blame the user with "invalid!" as the only word.
6. Data error shows `message`.
7. Never mention oxygen, battery, radiation, or a suit.
8. Paper, status-colored text, 14px, role status.
9. The prefer button is 44px and type button.
10. No `any`. No console. No store. Run eslint.
11. Do not commit.
12. Export `FailureCard`.
13. Do not import the worker.
14. Do not auto-call `onPrefer`.
15. One card, not four mounted at once. The parent picks the status.
16. No icon required. If you add one, it is an inline SVG, aria-hidden.
17. The timeout card's text content must fail a unit test that searches for /no path/i. You will add that test in a later task. Write the copy so that test can pass.
18. Reduced motion: none.
19. Width 100% of the rail, no fixed position.
20. Done when the timeout branch's JSX text does not contain "no path".

### UI-036 — Stale mark

Owns: `src/ui/shell/StaleMark.tsx` and `src/ui/shell/StaleMark.module.css`.

1. Props: `stale: boolean`. When false, render nothing.
2. When true, render a node with `data-testid="stale"` and the word "Stale".
3. Next to the word, a 24px dashed line sample, aria-hidden, so the map's dash pattern has a legend.
4. Do not remove the route. This is a label.
5. Ink text, 13px, weight 600. Not a full-width alarm banner.
6. `title` attribute may say "Inputs changed. Calculate again." The visible word stays Stale so the existing test id's text is stable.
7. No `any`. No console. Run eslint.
8. Do not commit. Do not edit App. App already has a stale node. This component is for a later swap. Do not delete App's node here.
9. Export `StaleMark`.
10. The dashed sample uses a 1px border-bottom, dashed, 24px wide.
11. No animation of the dashes.
12. role is omitted. The parent live region owns announcements.
13. Do not say "error".
14. Paper chip optional, hairline, height at least 24px. It does not need to be 44px because it is not a control. If you make it a button, it must be 44px and it must not be a button. It is not a button.
15. No store.
16. False renders null, not an empty test id. The test id exists only when stale. Callers that always need the id should not use this for the smoke test until they always mount it. Document that in a one-line comment: smoke tests that expect the id only while stale match this.
17. No console.
18. Reduced motion: none.
19. Do not dispatch.
20. Done when `stale` true includes the test id and the word Stale.

### UI-037 — Release line

Owns: `src/ui/shell/ReleaseLine.tsx` and `src/ui/shell/ReleaseLine.module.css`.

1. Props: `releaseId: string`. Render a `<span data-testid="release-id">` with that string.
2. Mono, 12px, secondary ink, tabular numbers, nowrap. If the string is long, allow it to shrink with ellipsis only above 390px. At 390, wrap.
3. Do not format a new release id. The parent passes `formatReleaseId` output.
4. No `any`. No console. Run eslint.
5. Do not commit. Do not edit App. App already has the test id. This is a later extraction. Do not create a second release node by editing App.
6. Export `ReleaseLine`.
7. The span is not a heading.
8. Empty string renders the test id with empty text, not a crash.
9. No link.
10. No "v" prefix added. The string is already formatted.
11. User select is text, so the id can be copied.
12. No animation.
13. No store.
14. Do not import contracts. The prop is a string so this file stays presentational.
15. Line height 1.3.
16. The test id is exactly `release-id`.
17. Do not include the synthetic badge here.
18. Paper, transparent background.
19. Reduced motion: none.
20. Done when the test id is on the element that shows the prop.

### UI-038 — Synthetic mark

Owns: `src/ui/shell/SyntheticMark.tsx` and `src/ui/shell/SyntheticMark.module.css`.

1. Props: `synthetic: boolean`, `production: boolean`, `bundleVersion: string`.
2. When `synthetic` is false, render nothing.
3. When synthetic, render `data-testid="synthetic-badge"` with the text `[Synthetic Fixture]`.
4. When `production` and synthetic, also render `data-testid="synthetic-production-warning"` as `role="alert"` with a sentence that this production build is serving the synthetic bundle, including the version, and that it is not Mars data.
5. Quiet chip for the badge: hairline, ink, 12px. The warning is a one-line status border, not a dark red slab.
6. No `any`. No console. Run eslint.
7. Do not commit. Do not edit App, or you will duplicate the ids. This file is the extraction. App keeps its nodes until a later task swaps them. Do not swap them here.
8. Export `SyntheticMark`.
9. The warning must include the bundle version via the prop, not a hardcoded string.
10. Do not say the data is real.
11. 14px warning text, 12px badge.
12. No emoji. The current App warning uses a warning sign. You may omit it.
13. No animation.
14. The alert is only the production case.
15. No store.
16. False synthetic ignores the production flag.
17. Text is selectable.
18. Do not link to a docs site.
19. Reduced motion: none.
20. Done when the badge text is exactly `[Synthetic Fixture]`.

### UI-039 — Policy summary

Owns: `src/ui/shell/PolicySummary.tsx` and `src/ui/shell/PolicySummary.module.css`.

1. Props: `policies: readonly string[]` the selected policy ids, and `candidates: readonly { id: string, policies: readonly string[], selected: boolean }[]`.
2. Show the three known names even if a candidate is missing: Shortest feasible, Terrain-aware, Uncertainty-aware. A name is marked selected when its id is on the selected candidate's policy list.
3. Do not sort by cost. Do not show weighted cost. Do not say safest.
4. Equivalent policies that share a candidate id are one row, named with both labels joined by "and", not two strokes.
5. If `candidates` is empty, show the three names in secondary ink and the line "No route yet."
6. No `any`. No console. No store. Run eslint.
7. Do not commit. Do not edit App.
8. Export `PolicySummary`.
9. A button is optional. If a row is a button, it is 44px and calls an optional `onSelect(id)`. If you add `onSelect`, it is optional and missing means the row is not a button.
10. Selected row uses weight 600 and an ink outline, not color alone.
11. Do not compute a distance.
12. Ids you do not know render as their raw id, not a made-up name.
13. Paper, hairline between rows.
14. No animation.
15. The component does not dispatch.
16. Do not import the solver.
17. `text-wrap: balance` on names that wrap.
18. Keyboard: native buttons if selectable.
19. Reduced motion: none.
20. Done when an empty candidate list does not throw and does not show a cost.

### UI-040 — Legend words

Owns: `src/ui/shell/Legend.tsx` and `src/ui/shell/Legend.module.css`.

1. A static legend. No props required. Optional `className`.
2. Rows for quality: Good, Low, Unknown, No elevation. Rows for exclusion: None, Missing elevation, Unsupported derivative, Outside extent, Manual.
3. Each row has a 12px swatch and the word. The swatch is not the only encoding.
4. Good is a paper square with an ink border. Low and Unknown and No elevation use distinct patterns you draw in CSS: solid status color, dots via radial-gradient, and diagonal stripes. None is an empty square. The other exclusions can share the status color plus their words. Do not use five unrelated hues.
5. 12px type, secondary ink for a group label "Legend", ink for the words.
6. The group label is a heading of the legend, not an eyebrow above a page title. It is allowed because it names the swatches.
7. No `any`. No console. Run eslint if there is a tsx. This may be tsx with no logic.
8. Do not commit. Do not edit the map.
9. Export `Legend`.
10. The legend does not dispatch and does not toggle layers. Toggles live in layer controls.
11. Width 100% of the rail. Two groups, stacked, not a wrap that becomes a messy cloud.
12. No animation.
13. Swatches are `aria-hidden`. The word is the accessible name.
14. Do not say probability.
15. Do not import colorScale. Keep this legend qualitative so it cannot drift the raster math.
16. Paper background.
17. Print: the patterns should be visible in black. Prefer borders and stripes over a pale tint.
18. No store.
19. Reduced motion: none.
20. Done when all nine words are in the component.

## Batch 5 — motion and input helpers

### UI-041 — Reduced motion hook

Owns: `src/ui/shell/useReducedMotion.ts` only.

1. Export `useReducedMotion(): boolean`.
2. If `window.matchMedia` is missing, return false and do not throw. This is the jsdom case.
3. If it exists, listen to `(prefers-reduced-motion: reduce)` and return whether it matches.
4. Subscribe to the change event and unsubscribe on cleanup. Support both `addEventListener` and the older `addListener` if you can do it without `any`. If the older API is awkward, `addEventListener` only is acceptable when you guard it.
5. The first render must match the current media query, not always false then true, or the tests will flicker. Use a lazy initial state.
6. No `any`. No console. Do not add a test file in this task if you cannot do it without a DOM library setup. The shell test task will cover it. You may add `useReducedMotion.test.tsx` beside it if you keep the test in this folder and it stubs matchMedia.
7. If you add a test, run that vitest file only.
8. Otherwise run eslint on the ts file.
9. Do not commit.
10. Do not edit other hooks.
11. The hook does not write to the DOM.
12. It does not cache a module-level boolean that ignores later changes.
13. SSR: `typeof window === 'undefined'` returns false.
14. The query string is exactly `(prefers-reduced-motion: reduce)`.
15. Export type is a function, not a component.
16. Do not default to true. True would kill motion for everyone in tests.
17. No store.
18. A change event updates state.
19. Do not read `prefers-reduced-motion` from localStorage.
20. Done when missing `matchMedia` returns false without throwing.

### UI-042 — Undo memory

Owns: `src/ui/shell/useUndo.ts` only.

1. Export `useUndo<T>()` that returns `{ current: T | null, set: (next: T, label: string) => void, undo: () => T | null, label: string | null, clear: () => void }`.
2. `set` stores the previous `current` as the undo value and stores `label`. The new value becomes current.
3. `undo` returns the previous value, makes it current, and clears the label so the toast can hide. If there is nothing to undo, return null.
4. One level of undo only. A second set replaces the undo slot. Do not build a stack.
5. No network. No store. The hook does not dispatch.
6. `clear` drops the label and the undo slot but keeps `current`.
7. No `any` except the generic. No console.
8. Run eslint.
9. Do not commit.
10. Labels are the caller's strings. Do not format endpoints here.
11. The hook is safe to call twice on one page for two different states. No module-level singleton.
12. Functional updates are not required.
13. `set` with the same reference still replaces the undo slot. Do not try to be clever with Object.is unless you also keep the label. Simplest: always store.
14. Undo when empty does not throw.
15. Do not use localStorage.
16. TypeScript generic defaults to `unknown` if you need a default. Prefer no default and a required type argument at the call site, which TypeScript infers from `set`.
17. No React context.
18. The file imports only `react`.
19. Do not edit App.
20. Done when undo of an empty hook returns null.

### UI-043 — Snap readout

Owns: `src/ui/shell/snapReadout.ts` only.

1. Import `cellCenter` and `pointToCell` from `src/contracts/grid.ts` or the contracts barrel, whichever already exports them. Do not edit grid.ts.
2. Export `formatSnap(point: { east_m: number, north_m: number }, grid: GridSpec): { requested: string, accepted: string, cell: string }`.
3. `requested` is `east, north` in metres with one decimal, using the words "east" and "north".
4. Convert with `pointToCell` and `cellCenter`. `accepted` prints the cell-centre east and north. `cell` prints `row, col`.
5. Do not move the caller's point. This function is pure and returns strings.
6. If the helpers clamp, the strings show the clamped centre and that is the honesty. Do not add a second clamp.
7. No geocoding. No lat or lng.
8. No `any`. No console. No DOM.
9. Run eslint.
10. Do not commit.
11. Non-finite input returns the dash for all three strings and does not throw.
12. Read the `GridSpec` type and use it. Do not redeclare the grid.
13. Units stay in the string: `12.0 m east, 8.0 m north` or a similarly clear order. Pick one order and use it for both requested and accepted.
14. The cell string is `row 2, col 3` so it cannot be read as a coordinate pair of metres.
15. Do not import the router.
16. Export the function only.
17. A later test will compare against `cellCenter`. Keep the math inside the helpers.
18. No React import.
19. Do not round before the helper sees the point.
20. Done when the function is pure and typed with `GridSpec`.

### UI-044 — Shortcut list

Owns: `src/ui/shell/shortcuts.ts` only.

1. Export a readonly array `SHORTCUTS` of `{ id, label, keys }` for calculate, cancel, mode-2d, mode-3d, export, strict.
2. Labels match the command menu: Calculate, Cancel, 2D, 3D, Export JSON, Strict quality.
3. `keys` is a display string such as "C", "Esc", "2", "3", "E", "S". Also export `matches(id, event: { key: string, metaKey: boolean, ctrlKey: boolean }): boolean` for the menu-open chord and for these keys.
4. The chord for opening is key `k` or `K` with meta or ctrl, and not alt. `matches` can take a separate id `command-menu` for that chord.
5. Letter shortcuts match only when alt, meta, and ctrl are all false, so Ctrl+C does not calculate.
6. Escape matches cancel's display but `matches('cancel')` is true for Escape only when you document that the menu decides whether it is open. The function itself returns true for Escape when id is cancel.
7. No DOM. No `any`. No console.
8. Run eslint.
9. Do not commit.
10. Do not import React.
11. The array is `as const` so ids are a union.
12. Do not include a shortcut that the app cannot perform, such as a headset toggle.
13. keys are strings, not React nodes.
14. No localisation map. English only.
15. Do not read the store.
16. Export the type of one shortcut.
17. Case: letter matches are case-insensitive.
18. `matches` returns false for an unknown id.
19. Do not bind listeners here. This file is data and a pure matcher.
20. Done when the six ids exist and Ctrl+K is not treated as Calculate.

### UI-045 — Shared motion

Owns: `src/ui/shell/motion.css` only.

1. Define classes `.motion-toast`, `.motion-drawer`, `.motion-pill` that use the duration and easing tokens.
2. Toast: transform and opacity, 200ms.
3. Drawer: transform and opacity, 220ms.
4. Pill: background-color and transform, 180ms.
5. Do not animate width or height.
6. Under reduced motion, these classes set transition-duration to 0ms.
7. No keyframes that run on load for these classes. Transitions only.
8. Do not set colors. The components own color.
9. A comment at the top says components opt in by adding the class. Do not @import this from app.css if that would animate unrelated nodes. Do not use element selectors. Class selectors only.
10. Do not commit.
11. No JavaScript.
12. The easing is the token `--ease-out` with a fallback of `cubic-bezier(0.23, 1, 0.32, 1)`.
13. Will-change is omitted. It is not needed for these small fades.
14. Do not use `transition: all`.
15. Include a `.motion-press:active { transform: scale(0.97); }` rule.
16. Reduced motion also sets that active transform to none.
17. No filter blur larger than 0. A 2px blur is unnecessary here and costs paint on the map.
18. The file is valid CSS.
19. Do not target `*` .
20. Done when every duration in the file is at most 280ms.

### UI-046 — Destination undo label

Owns: `src/ui/features/destinations/undo.ts` only.

1. Export `destinationUndoLabel(name: string): string` returning `Destination set to ${name}`.
2. If the name is empty or whitespace, return "Destination updated".
3. Do not trim the name so hard that you change a real place's spelling. Trim only the ends.
4. No DOM. No React. No `any`. No console.
5. Run eslint.
6. Do not commit.
7. Do not edit Destinations.tsx in this task. A later pass can call it.
8. The function does not know about start points. Start labels stay at the call site.
9. Do not import the store.
10. A name with a quote or a `<` is not escaped here because it returns a string the React text node will escape. Do not HTML-escape.
11. Max practical length: if the name is longer than 80 characters, slice to 79 and add an ellipsis character.
12. Export only that function.
13. No template that says "fictional".
14. No localisation.
15. Pure.
16. Do not read POIs.
17. Unicode names pass through.
18. Newlines in the name become spaces.
19. Do not add a test file unless it fits in this path as `undo.test.ts`. A test is welcome and should run with vitest on this file only.
20. Done when the empty name does not produce "Destination set to ".

### UI-047 — Icon hit button

Owns: `src/ui/shell/HitButton.tsx` and `src/ui/shell/HitButton.module.css`.

1. Props: `label: string` required, plus native button attributes except you omit a children-only API. `children` is the glyph and is required.
2. The visible box is at least 44×44 even if the glyph is 16px.
3. `aria-label` is the `label` prop. Also set `title` to the same string so sighted users get the name.
4. If `label` is empty, throw in development only when `process.env.NODE_ENV !== 'production'`. In production, still set aria-label to "Button" rather than an empty name. Prefer requiring the label in the type as `string` and not rendering a silent control.
5. type defaults to button.
6. Press scale 0.97, 160ms, none under reduced motion.
7. Paper, hairline, 12px radius, ink glyph.
8. No `any`. No console. Run eslint.
9. Do not commit.
10. Export `HitButton`.
11. Disabled does not scale.
12. Focus-visible ring.
13. Do not use emoji children in the examples in comments.
14. The component does not know about routes.
15. className merges.
16. The glyph is centered.
17. No text truncation of the aria-label.
18. Do not position fixed.
19. The hit box uses min-width and min-height, not a transform hack that leaves the clickable area small.
20. Done when a 16px child still yields a 44px button.

### UI-048 — Keyboard hint

Owns: `src/ui/shell/Kbd.tsx` and `src/ui/shell/Kbd.module.css`.

1. Props: `children: string`.
2. Render `<kbd>` with a hairline, 4px radius, 12px mono, padding 0 4px, secondary ink.
3. It is not a button and has no click handler.
4. No `any`. No console. Run eslint.
5. Do not commit.
6. Export `Kbd`.
7. The element stays inline.
8. Do not uppercase the child's text. The caller passes "Ctrl K" or "Esc" as they want it seen.
9. No animation.
10. No title tooltip required.
11. Contrast of the kbd text on paper meets 4.5:1. Secondary ink `#686666` on white does. Do not lighten it.
12. No store.
13. className merges.
14. Do not use a pseudo-element that duplicates the text for screen readers.
15. Border is 1px solid hairline.
16. Line height 1.4 so the chip does not clip descenders.
17. User select is text.
18. The component rejects non-string children by typing children as string.
19. No icon.
20. Done when `<Kbd>Ctrl K</Kbd>` renders a kbd element with that text.

### UI-049 — Balanced headline

Owns: `src/ui/shell/Balance.tsx` only.

1. Props: `as` of `h1` or `h2` or `h3`, default `h2`, `children`, `className`.
2. Set `style={{ textWrap: 'balance' }}` merged with nothing that drops the caller's class.
3. Do not set a color. The parent owns ink.
4. Do not set a font size. The parent owns the scale.
5. No `any`. No console. Run eslint.
6. Do not commit.
7. Export `Balance`.
8. The element is the heading. Do not wrap an extra div, or the outline breaks.
9. children is `ReactNode`.
10. No animation.
11. No aria rewrite. If the child is text, the heading text is that text.
12. Do not add a kicker span.
13. className merges.
14. No store.
15. The CSS property in the style object is `textWrap: 'balance'`.
16. Do not add a stylesheet.
17. Default heading level is h2 so a page does not gain a second h1 by accident. App's title stays the h1.
18. Pass through `id` if you include `HTMLAttributes` for the chosen element. Use a narrow props type with optional `id`.
19. No console.
20. Done when `as="h1"` renders an h1 and the default renders an h2.

### UI-050 — Number with unit

Owns: `src/ui/shell/Number.tsx` only.

1. Props: `value: number | null | undefined`, `unit: string`, `decimals?: number`.
2. Render a span with class `tabular-nums` and the formatted value, a narrow no-break space is forbidden. Use a normal space, then the unit.
3. Non-finite becomes "—". The unit is omitted when the value is non-finite so you do not announce "dash metres" as a measurement. The dash alone is enough.
4. Default decimals is 0.
5. Use `toFixed`. Do not use scientific notation.
6. No `any`. No console. Run eslint.
7. Do not commit.
8. Export `NumberText` so the name does not shadow the global `Number` in JSX if that would be confusing. The file is `Number.tsx`. Export name `NumberText`.
9. No store.
10. A zero value renders `0` plus the unit.
11. The unit is a string the caller owns, such as "m" or "°".
12. Do not import formatters if that causes a cycle. You may import them. Prefer import from the primitives formatters for metres only when unit is `m`. For a generic unit, `toFixed` plus the unit string is the whole job.
13. className optional merge.
14. No animation.
15. The span is inline.
16. Negative numbers keep their sign.
17. Do not add grouping separators, so this matches the briefing strings.
18. No React context.
19. Children are not accepted. The value prop is the number.
20. Done when `NumberText` of NaN is the dash without a unit.

## Batch 6 — proof and the second pass

### UI-051 — Shell behavior tests

Owns: `src/ui/shell/shell.test.tsx` only, plus a new file if a component has no test yet. Keep tests under `src/ui/shell/`.

1. Use the existing vitest and testing-library imports the other UI tests use. Read one feature test and match the style.
2. Command menu: render it, click Commands, expect Calculate, press Escape, expect the menu to close. Stub matchMedia if the component asks for it.
3. Undo toast: render with a message, click Undo, expect the handler once.
4. `useReducedMotion`: with no matchMedia, the hook returns false. Use renderHook if the project already depends on it. If not, mount a tiny component. Do not add a package.
5. Failure card timeout text does not match /no path/i.
6. Strict failure text does not match /oxygen/i.
7. Do not delete a test to make it pass. Fix the component only if the test reveals a bug and the component file is one you are allowed to touch. You are not allowed to restyle. If a component is missing, skip that case with `it.skip` and a comment that names the missing file. Prefer not to skip if the file exists.
8. Run `npx vitest run src/ui/shell/shell.test.tsx` only.
9. No `any`. No console.
10. Do not commit.
11. Do not use a snapshot of the whole menu.
12. Query by role and name.
13. The Escape test must dispatch a keyboard event on the document or the focused element, matching how the component listens.
14. Do not start jsdom timers you do not clear.
15. Worker pill: active true shows the cell count you pass, and does not show a percent sign.
16. Empty route with both ends true renders nothing.
17. Stale mark false renders no `stale` test id. True does.
18. Do not import the real worker.
19. Do not edit feature tests in this task.
20. Done when this file's vitest run passes.

### UI-052 — Long destination name

Owns: `src/ui/features/destinations/Destinations.test.tsx` only.

1. Add one test. Do not rewrite the file's other tests.
2. The test renders the feature with a POI whose name is longer than 60 characters and whose id is `long-stop`.
3. Expect the name to be in the document.
4. Expect the option value or the selected value path to remain `long-stop`, not the long name.
5. Use the same render helpers as the existing tests. Read the file and copy the fixture shape so the typecheck stays valid.
6. If the component cannot accept that POI because of a kind filter, set `kind` to `science-stop`.
7. Run this vitest file only.
8. No `any`. No console.
9. Do not commit.
10. Do not change production code in this task. If the test fails because the value is the label, stop and report that in a comment at the top of the test rather than weakening the assertion. You may edit `Destinations.tsx` only to keep the option value equal to the id, and nothing else.
11. Do not add a snapshot.
12. The test name says the long name stays visible and the value stays the id.
13. Clean up renders the testing library way the file already uses.
14. Do not mock the store if the other tests do not.
15. Do not change the POI list of the other tests.
16. One assertion for the name and one for the id is enough.
17. No timer.
18. No network.
19. If the select is a combobox, query it by the role the component actually exposes. Read the JSX.
20. Done when this file passes.

### UI-053 — Weights stay closed

Owns: `src/ui/features/assumptions/Assumptions.test.tsx` only.

1. Add one test. Keep the others.
2. On first render, the equation or the word "Weights" may be in a summary, but the body sentence about a slope penalty is not visible. Use the testing-library hidden option correctly: `queryByText` does not see content inside a closed `<details>` in some environments. If it does see it, assert `details` is not open via the `open` property.
3. Click the summary "Weights" and then expect the slope penalty sentence.
4. Assert the strict control's accessible name or nearby text does not include OUTSIDE_EXTENT.
5. If the production copy still says OUTSIDE_EXTENT, you may edit `Assumptions.tsx` only to replace that phrase with the prefer-versus-strict sentence from UI-013. Do not restyle anything else.
6. Run this vitest file only.
7. No `any`. No console. No commit.
8. Do not change policy ids.
9. The test uses the existing render helper.
10. Do not add a snapshot.
11. Keyboard is not required in this test.
12. The disclosure test must not dispatch. Check the dispatch mock was not called by opening details, if the component gives you a dispatch mock. Read the test setup.
13. If there is no dispatch mock, do not invent one that changes the other tests.
14. Strict wording assertion is case-insensitive.
15. Do not remove the zero-policy test.
16. One new `it` block.
17. No timers.
18. If "Weights" is not the summary yet, the edit in line 5 may add the `<details>` and move the long descriptions inside it, keeping the test ids. That is allowed because otherwise the test cannot pass. Do not change toggle behavior.
19. Run eslint on the test and the tsx if you edit it.
20. Done when the new test passes and the old tests still pass.

### UI-054 — Cancel is absent until a run

Owns: `src/ui/features/request-controls/RequestControls.test.tsx` only.

1. Add one test if it is not already there. Read the file.
2. With `isRunning` false, `queryByTestId('cancel-request')` is null.
3. With `isRunning` true, the cancel button is present.
4. Do not change Calculate's id.
5. If the component already meets this, the test is still added so the behavior cannot regress.
6. If the component renders Cancel while idle, edit `RequestControls.tsx` only to mount Cancel when `isRunning` is true. Do not restyle.
7. Run this vitest file only.
8. No `any`. No console. No commit.
9. Use the existing props fixture.
10. Do not click Calculate in a way that needs the worker.
11. The idle case also expects `calculate` to be present.
12. No snapshot.
13. No timer.
14. Do not change the disabled rules unless the existing tests fail because of your edit. They should not.
15. One or two new assertions only.
16. Keep the test names descriptive.
17. Do not add a percent assertion that forces fake progress.
18. If `solving-progress` is only present while running, assert that too.
19. Run eslint on the files you touch.
20. Done when idle render has Calculate and no Cancel.

### UI-055 — Failure copy test

Owns: `src/ui/shell/failureCard.test.tsx` only.

1. Render `FailureCard` with status timeout and a message that itself contains no forbidden phrase.
2. Expect the text content not to match `/no path/i`.
3. Render status no-path with reason `strict-quality-disconnects` and expect the text not to match `/oxygen/i`.
4. Expect the prefer button when `onPrefer` is passed, and expect it absent when omitted.
5. If `FailureCard` does not exist yet, write the test against the props in UI-035 and skip the file with a comment only if the import fails. Prefer writing the test so it fails loudly. Do not skip. If the module is missing, create the test anyway and the run will fail until batch 4 is merged. In that case, do not invent a second component.
6. Run this file only when the component exists.
7. No `any`. No console. No commit.
8. Query the button by the name "Use prefer mode".
9. Clicking it calls the handler once.
10. Do not snapshot.
11. No worker.
12. The timeout case uses `getByText` with a function or a regex that matches "time limit".
13. Do not assert on class names.
14. Paper and CSS are not this test's job.
15. One file, four assertions spread across two or three tests.
16. Clean up is automatic.
17. Do not import TerrainView.
18. No timers.
19. If the button's accessible name differs, change the component's label to "Use prefer mode" only if you must, and only that string.
20. Done when the file passes against `FailureCard`.

### UI-056 — Snap readout test

Owns: `src/ui/shell/snapReadout.test.ts` only.

1. Build a tiny `GridSpec` that matches the real type. Read `GridSpec` in contracts. Use a 4 by 4 grid or whatever the required fields are. Do not cast through `any`. If the type is large, fill the required fields with honest dummy numbers and empty optional structures the type demands.
2. Pick a point you can compute by hand with `cellCenter` after `pointToCell`.
3. Assert `formatSnap` accepted string equals the east and north from `cellCenter` of that cell.
4. Assert the requested string contains the original east and north, not the centre, when the point is not already the centre.
5. Assert a NaN point returns dashes and does not throw.
6. Run this vitest file only.
7. No `any`. No console. No commit.
8. Do not edit `grid.ts`.
9. Do not edit `snapReadout.ts` unless the test finds a thrown error on NaN. Then you may add the finite guard only.
10. No DOM.
11. No snapshot.
12. The test imports `cellCenter` and `pointToCell` itself so it does not trust the implementation's private copy.
13. One grid is enough.
14. Do not use random numbers.
15. Document the chosen cell in a comment: row, col, expected centre.
16. No network.
17. No React.
18. The dash assertion uses the same character the implementation uses.
19. If GridSpec requires fields you cannot legally fill, stop and write the comment in the test file explaining the missing field, and do not fake the type with a double cast.
20. Done when the test passes or the file explains the type blocker in a comment and eslint is clean.

### UI-057 — Smoke ids stay put

Owns: `tests/app.smoke.test.tsx` only if a query is already broken. Prefer not to edit it.

1. Read the file. List the test ids it queries.
2. If they are `release-id`, `synthetic-badge`, `synthetic-production-warning`, `bundle-error`, `calculate`, `route-status`, `map-canvas`, `profile`, `briefing`, `terrain-view`, and `stale`, and those ids still exist in App or the features, do not edit the file.
3. If you do not edit it, write `docs/UI_SMOKE_NOTES.md` with the sentence "Smoke queries still match. No edit." and that is the whole change. You may create that docs file.
4. If an id moved, update only the query string. Do not change the expected mission behavior, the fixture, or the assertion about success.
5. Do not add a new dependency.
6. Do not commit.
7. Run `npx vitest run tests/app.smoke.test.tsx` only if the environment can load the app. If it fails for a pre-existing manifestUrl type error, record the error text in `docs/UI_SMOKE_NOTES.md` and do not "fix" it by casting in a shared file.
8. No `any` added.
9. No console.
10. Do not change snapshots of routes.
11. Do not skip the smoke test to turn it green.
12. Do not edit the terrain mock unless the test file already has one and it is the only way to keep `terrain-view`. Prefer not to.
13. The notes file is not a design essay. Five lines maximum.
14. If you create the notes file, say which ids you checked.
15. Do not edit App in this task.
16. Do not import testing-library changes.
17. Leave the smoke test's timeout alone.
18. Do not point the test at a different bundle.
19. A failure that is "element not found" for an id you removed is a bug in the earlier task. Do not hide it by deleting the assertion.
20. Done when either the smoke file is untouched and the notes file says so, or the only diff is a query string.

### UI-058 — Second pass on the 1440 frame

Owns: `src/ui/app.css` only.

1. Open the file after batch 1. If `.app` is already `100dvh` and `overflow: hidden` at 900px and above, and `main` is three columns, do not restyle feature modules.
2. If the document would still scroll because `main` stacks results under the map, fix only that grid.
3. If something you did in UI-002 used a class App does not render, delete that rule.
4. Check the 390px media query still stacks and uses safe-area padding.
5. Do not add a new font.
6. Do not change test ids. This is CSS.
7. Do not commit.
8. Do not edit a feature CSS file.
9. Buttons remain at least 44px.
10. Focus outline remains.
11. Print import from UI-033 must still be present. If it is missing and `shell/print.css` exists, add the import. If the file does not exist, do not invent a second print sheet.
12. No `!important` added in this pass except one you must keep for the focus ring.
13. The map column keeps `min-height: 0` so the grid child can shrink.
14. Do not set the canvas to `display: none` at desktop.
15. Header does not grow past 64px.
16. Gaps stay 12px, not 32px. Space is even because the type is small, not because the page is long.
17. Body background is paper.
18. Do not introduce a dark mode media query.
19. Comment a date-free note only if you need to explain a non-obvious min-height. One line.
20. Done when desktop `main` is a single row of three areas.

### UI-059 — Start menu overlap pass

Owns: `src/ui/StartMenuModal.module.css` only.

1. Read the module. If docked mode is `position: fixed` or `absolute` with a high z-index covering the canvas, change docked mode to static flow.
2. Do not change the TSX in this task. If the overlap is only fixable in TSX, stop and write the reason in a comment at the top of the module, and still remove the fixed positioning you can remove without a new class.
3. Expanded mode may overlay the controls column but must not set width to 100vw.
4. z-index of the docked menu is auto.
5. Do not hide the map by giving the menu a 100vh backdrop in docked mode.
6. 44px min-height on buttons you style here.
7. Paper background, ink text, hairline.
8. Do not commit.
9. Do not edit the TSX test ids.
10. Safe area padding on the bottom of the menu at narrow widths.
11. No animation longer than 200ms.
12. Reduced motion block if you have a transition.
13. Do not add a background image.
14. The menu's max-height on a 390 screen is 50vh so the map can exist below it, unless the menu is in normal flow and the page scrolls, which is the mobile rule.
15. No negative margins that pull the menu over the canvas.
16. Focus rings are not clipped by `overflow: hidden` on the focusable control. If you set overflow hidden, not on the button.
17. Do not change sound-button behavior via `pointer-events: none`.
18. Color tokens, not raw teal.
19. One comment if you change positioning, explaining that docked mode stays in the rail.
20. Done when docked mode has no fixed positioning.

### UI-060 — Review notes

Owns: `docs/UI_REVIEW.md` only.

1. Write what a reviewer should look at. Do not edit source.
2. State the branch name `ui/slide-system` and that the base is the merged integration on main.
3. List the six batches and whether each one was merged. If you do not know, write "not recorded".
4. Record the two viewports: 1440×900 and 390×844.
5. Record which controls must be exercised: Calculate, Cancel, the three policies, strict, round trip, both presets, both endpoint fields, layer toggles, 2D, 3D, export, print, the command menu, undo, and Escape on a drawer.
6. Record the honesty checks: stale is not a new route, timeout is not no-path, a missing return leg is not a complete round trip, synthetic data is labelled, reconstructed views are not photographs, no oxygen gauge.
7. Record failures you know about, including any pre-existing `manifestUrl` type errors if they are still present. Do not claim a command passed unless you ran it.
8. Keep it under 80 lines.
9. No screenshots embedded as binary. A path is fine if a screenshot exists.
10. Do not commit.
11. Plain sentences. No marketing.
12. Do not restate the whole task file.
13. Name files that were not supposed to change if you saw them change: contracts, routing, worker, package.json.
14. The notes are for the next human reviewer.
15. Include the date you write the file.
16. Do not invent a lighthouse score.
17. Do not say the UI is done if you have not looked at it.
18. If no browser was opened, write "Browser not run" in its own line.
19. End with the list of test commands the orchestrator should run: typecheck, lint, vitest, build.
20. Done when the file exists and contains the honesty checks from line 6.
