# Debate Log — `ui-map-canvas`

Date: 2026-11-14  
Branch: `merge/integration`  
Pass 1 critique: `docs/debate-parts/pass1-ui-map-canvas.md`  
Authority: `docs/MERGE_PLAN.md` §5 item 3, plus the ui-map-canvas file assignment.  
Files: `src/ui/MapCanvas.tsx`, `src/ui/features/map-routes/MapRoutes.tsx`, `src/ui/features/map-rasters/MapRasters.tsx`.

---

## Proposed decision

Replace the fixed `PX_PER_CELL = 28` backing store. Cache raster pixels so a search-trace frame does not repaint a million cells. Scale pointer clicks from the canvas box into bitmap pixels. Draw one search-trace batch and dashed rejected paths in the routes band, not in chrome.

The cell size is exactly:

```ts
Math.max(1, Math.min(28, Math.floor(Math.min(960 / Math.max(1, grid.width), 960 / Math.max(1, grid.height)))))
```

`W` and `H` stay `grid.width * pxPerCell` and `grid.height * pxPerCell`. `scaleX` and `scaleY` stay `pxPerCell / cellSize`.

---

## Pass 1 critique that is accepted

1. **The formula fixes HiRISE and keeps the synthetic grid.** 20×12 stays at 28 (560×336). 1000×1000 becomes 1 (1000×1000). 51×51 becomes 18 (918×918). A zero or negative cell size is treated as 1 metre before dividing, so `scaleX` is not `Infinity`. The bitmap is not also clamped to 960 while the scale still comes from `pxPerCell`.
2. **Do not stretch a 1-pixel-per-cell buffer.** Above 4096 cells the existing cell painter runs once into an offscreen canvas of the real bitmap size (`cols * pxPerCell` by `rows * pxPerCell`), then `drawImage` blits it. Insets and the baseline slope stroke survive. `imageSmoothingEnabled` is set false only around that blit and restored afterwards, inside `save`/`restore` when the context has them.
3. **Small grids stay on `fillRect` of the context they were given.** `width * height <= 4096` never blits. A destination context with no `drawImage` (the foundation and MapRasters jsdom doubles) also stays on that loop. 4×4 and 4×3 therefore still call `fillRect` on the injected context. At 28 px and at 10 px the exclusion geometry is unchanged: baseline keeps `fillRect(x + 3, y + 3, px - 6, px - 6)` when `px >= 7`, and MapRasters keeps `pad = max(1, floor(px * 0.15))` when the inner tile is at least 1. At 1 px/cell a negative inset is not issued; the cell is filled instead, because canvas would flip a negative width into the neighbours.
4. **Clicks use `getBoundingClientRect`.** X scales by `bitmapWidth / rect.width` and Y by `bitmapHeight / rect.height`. A zero rect side falls back to `bitmap / canvas.width` or `bitmap / canvas.height` (1 when the attribute matches the backing store). jsdom's zero rect therefore yields finite metres.
5. **The paint effect has a real dependency list.** `toPx` / `fromPx` are not dependencies. The raster cache lives in a ref. Its key is bundle version, bundle id, grid size, px/cell, bitmap size, and each raster layer's visibility and opacity. The cache also stores the bundle object and the elevation, slope, roughness, quality, and exclusion buffers, so a new bundle or a replaced array drops the bitmap even when the version string is reused. `traceFrame` is not part of the key. The paint effect does not clear the cache in its cleanup, or a trace tick would free the bitmap before the next paint. Unmount clears it.
6. **`closedCells` is this frame's batch, not a flood fill.** `clearRect` drops the previous batch. Indexes convert through `cellCenter` (MapCanvas) or the equivalent cell-centre pixel `(col + 0.5) * pxPerCell` (MapRoutes). Closed cells are square outlines with a tick, frontier cells are rings, and the best path is a dotted polyline through centres with square vertex marks. Rejected paths use dash `[8, 4]` and default `#7c3aed`, not the return-leg amber `#fbbf24` or the selected-route cyan. Dash is cleared before chrome. The foundation mock has no `save`, so baseline code calls `save`/`restore` only when those methods exist and otherwise clears the dash.
7. **Who draws the overlay.** MapCanvas draws trace and rejected paths only when no custom `routes` layer is registered, so the isolated canvas tests and the fallback still show them. MapRoutes draws them when `routeLayerVisible` is true, including when no candidate exists yet. A hidden routes layer returns before `save`, which is what `MapRoutes.test.tsx` asserts. They are not drawn from the chrome callback.
8. **The routes ref is not updated in a passive effect.** A `useEffect` write runs after MapCanvas has already painted, so the last candidate set and the last trace frame never reach that paint. `useLayoutEffect` writes the ref after this commit and before MapCanvas's paint effect. The register effect still depends only on `registerLayer`, so a trace tick does not call `setCustomLayers` again. The ref is not written during render: `react-hooks/refs` forbids that, and the layout effect already beats the paint effect.

---

## Pass 1 proposals that this assignment does not take

- Pass 1 gates the bitmap on `pxPerCell === 1` and would cache CTX (51×51) as a full-size offscreen. The assignment gates the blit on `width * height > 4096` so the 4×3, 4×4, and 20×12 grids stay on `fillRect`. CTX is 2601 cells, so it still uses the direct loop. That loop is cheap next to HiRISE, and it keeps the 18 px exclusion inset.
- Pass 1 asks for one owner so the overlay is not drawn twice. The assignment requires both the MapCanvas baseline and the active MapRoutes layer. MapCanvas skips the overlay when `customLayers.routes` is set, so the two owners do not stack.
- Pass 1's `activeTraceFrame`, `highlightPathIndex`, `pickMode`, `unifiedPois`, and `onSelectCandidate` props are not added. Existing props stay, including `data-testid="map-canvas"`, `data-selected-candidate`, and `data-hover-index`. The new props are optional: `traceFrame?: SearchTraceFrame | null` and `rejectedPaths`. `SearchTraceFrame` is a type import from `src/contracts`. There is no value import of `three`, `evaEngine`, `searchTrace`, or `coordBridge`.
- No hard clamp at 4096 pixels on a side. A grid larger than the allocation budget can still fail to allocate. 1000×1000 and 2000×2000 stay one pixel per cell.

---

## Residual risks

- `App.tsx` and `MapRoutesSlotProps` are outside this edit. The slot does not yet pass `traceFrame` or `rejectedPaths` into `MapRoutes`. Until the shell passes those props, the composed app shows the overlay only from MapCanvas, and only when the custom routes layer is absent. Passing the frame to both is safe: MapCanvas does not draw it again while the routes layer is registered.
- MapCanvas must receive `traceFrame` for the paint effect to run on a trace tick. The routes ref is updated in the layout effect of that same commit, so the routes draw sees the frame when both props change together.
- In-place mutation of an elevation buffer on the same array reference does not invalidate the cache. Bundles are treated as immutable.
- A side above ~4096 pixels is still requested at 1 px/cell. Allocation failure falls back to the direct painter, which can fail the same way.
- The east scale bar remains an east-metre bar. Square pixels on non-square metres are unchanged on purpose, so cell centres stay on the route vertices.

---

## Examiner

First pass, GPT-6 Luna, high reasoning: **82/100, fail.** Click scaling, the small-grid `fillRect` path, and cache invalidation on bundle or array replacement were accepted. The named defect: `blitBitmap` treated “`drawImage` exists” as success, so a throw while blitting escaped and the direct `fillRect` painter never ran. The same hole was in both raster implementations. A one-pixel-per-cell grid could also still request a canvas side past the browser limit.

Correction applied before the second pass:

- `drawImage` is inside `try`. On any throw the cache is dropped and the destination is painted with the existing `fillRect` loop. `imageSmoothingEnabled` is restored in `finally`.
- Offscreen canvases with a side above 4096 are refused before allocation.
- The visible map keeps the required cell-size formula. 20×12 stays 28 and 1000×1000 stays 1. Only a bitmap that would exceed 4096 on a side is fitted, and `scaleX` / `scaleY` are then taken from that fitted cell size so picking still matches the painter.
- The cache key also stamps every byte of each raster buffer (two 32-bit hashes plus the byte length), so an in-place edit of any cell drops the bitmap. Array replacement still drops it by identity.

Second pass, GPT-6 Luna: **82/100, fail.** The 4096 side cap was accepted. The remaining defect was the first stamp, which hashed about 32 samples, so an unsampled in-place edit kept the old bitmap.

Third pass, GPT-6 Luna, high reasoning, read-only: **94/100, pass.**

The named residual, not a fail: `MapRasters` sizes its offscreen bitmap from `cols * pxPerCell` and `rows * pxPerCell`. On an extreme aspect ratio the short axis can round to a zero-length bitmap, the blit is rejected, and that grid repaints with `fillRect` every frame. HiRISE, CTX, and the synthetic 20×12 grid are not in that case. The throw is caught.
