# Mars Pathfinder UI direction

This is the brief for the UI branch. The attached slides are the visual inspiration. The designer did not know every real control, so the slides are not a feature spec. Keep every existing mission function. Change how it is arranged, typed, and paced.

## What the product is

An educational Mars mission planner. One person picks a start and a destination, compares three route policies, and inspects the map, the profile, and the 3D walk. The outpost is fictional. The product is an educational simulation. There is no oxygen, battery, radiation, or survival gauge, and no Quest headset claim.

## What is wrong now

The current screen is a long stack of labels, checkboxes, and paragraphs. Desktop users scroll to reach the map, the result, and the briefing. Text sits wherever it fit. That is the thing to replace.

## The standard

One desktop view at 1440×900. The map stays visible. Mission controls, evidence, and the result share that same view. Spacing stays even and generous by making controls thin, not by adding pages. At 390×844 the same information becomes one stacked sheet with safe-area padding and no overlapping controls. 44×44px hit areas. Icons may replace repeated words, and every icon keeps a text name for assistive tech.

The slides show a light, thin, paper-and-ink system:

- Paper `#FFFFFF` and `#FAFAFA`
- Ink `#000000`
- Secondary ink `#686666`
- Hairline `#E5E5E5`
- One quiet status color for errors and exclusions
- 12px continuous corners
- A plain sans for words and a mono with tabular numbers for metres, degrees, and counts
- Motion under 300ms, ease-out, interruptible, and still when `prefers-reduced-motion` is set

Do not switch this to a blue enterprise dashboard. Do not add a marketing hero, a video, or a contact-sales page.

## Slide ideas that must survive

- Header with the product name, the educational-simulation label, the release, a 2D/3D pill, and a command menu hint.
- A short fictional-outpost line. Science stops are not called fictional.
- Map first. Local metres only (`east_m`, `north_m`). Scale bar. No latitude or longitude.
- Skeleton placeholders that reserve the same boxes the loaded content will use.
- Destination choice as a short combobox, a Start / Destination / Inspect pill, a cell-centre readout, and an undo after a pick.
- Three policies visible. Weight equations stay behind a disclosure. Prefer versus Strict is one switch. Round trip is one switch.
- Calculate and Cancel stay obvious. While solving, show the real explored-cell count. A changed input keeps the previous route visible and marked stale.
- Layer switches do not recalculate a route. The point inspector shows one cell: elevation, slope, roughness, quality, exclusion.
- Mission evidence sits beside the map: distance, ascent, descent, max slope, quality lengths, and an honest round-trip state. A missing return leg is not shown as a complete round trip.
- Sources and credits open in the existing drawer. Reconstructed views are not labeled as rover photographs.
- Print briefing is light, flowing, and does not clip controls. JSON export stays an explicit action.
- 3D keeps a reset, a true vertical scale, and honest failure text for no path, strict-quality disconnect, timeout, and a lost WebGL context. Timeout is not proof that no path exists.

## Interaction rules

- Respond within 400ms or show a skeleton. Do not fake a progress percent.
- Bigger hit areas than the visible glyph.
- Do not offer more than the real choices. Three policies, not a wall of settings.
- Accept a messy typed coordinate and show the snapped cell centre.
- Animations ease out, can reverse, and do not carry information by motion alone.
- Numbers in columns use tabular figures.
- Headlines do not leave one word alone on the last line when the browser can balance them.

## Hard constraints

- Preserve every `data-testid` used by the current tests.
- Do not add packages, Leaflet, or a new `src/ui/features/*/entry.tsx`.
- Do not import `three`, `evaEngine`, or `searchTrace` from a file that is in the eager app graph unless that file is already allowed to do so.
- Do not edit `src/routing`, `src/contracts`, `src/worker`, or `package.json` from a UI task.
- English copy only.
