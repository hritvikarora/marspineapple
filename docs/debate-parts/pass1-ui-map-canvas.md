The sizing formula fixes HiRISE. The cache gate, the click fallback, and the `latestRef` timing do not. As written, Pass 1 will keep the synthetic 20×12 tests green and still paint the CTX bundle wrong, drop the last trace frame, and leak dashes into the chrome layer.

## 1. Canvas size

`MAX_CANVAS_PX = 960` is a preferred cell size, not a bitmap cap. `Math.max(1, Math.floor(960 / maxDim))` collapses to 0 whenever a side is larger than 960, and the outer `Math.max(1, …)` then forces 1 px per cell. The canvas becomes `grid.width × grid.height` and walks past 960.

| Grid | `pxPerCell` | Bitmap | Verdict |
|---|---|---|---|
| Synthetic 20×12, 10 m cells | 28 | 560×336 | Same as today |
| 1×1 | 28 | 28×28 | Fine |
| CTX 51×51, east 18.97 m / north 20 m | 18 | 918×918 | Fine |
| HiRISE 1000×1000, east 0.9486 m / north 1 m | 1 | 1000×1000 | The case that matters. Today is 28000×28000, which browsers will not allocate |
| 2000×2000 | 1 | 2000×2000 | Still fine |
| 8000+ or either side above ~4096 | 1 | side = grid side | Allocation starts failing. Nothing in the formula stops it |

Keep `W = grid.width * pxPerCell` and `H = grid.height * pxPerCell` for every bundle you actually ship. `sx = pxPerCell / cellSizeEast_m` and `sy = pxPerCell / cellSizeNorth_m` stay consistent with `pointToCell`, which divides by cell size, not by `extent.east_m - extent.west_m`. On HiRISE those two widths match. If they ever diverge, cell-size scale is the one that agrees with picking.

Do not also set `W = Math.min(960, grid.width * pxPerCell)` while `sx` still comes from `pxPerCell`. The last columns would fall off the bitmap and clicks would land in the wrong cell. `sx = W / (grid.width * cellSizeEast_m)` is the same number only while that product holds.

Square pixels on non-square metres are a real distortion, and they are the right distortion for a cell picker. HiRISE is 948.6 m east by 1000 m north, drawn as a square. One cell east and one cell north are both exactly `pxPerCell` pixels, so routes stay on cell centers. The east scale is about 1.054 px/m and the north scale is 1 px/m. The chrome scale bar uses only `scaleX`, so it is an east-metre bar. Leave both axes on `pxPerCell`. An isotropic metres-per-pixel scale would make cell widths fractional and break the raster grid.

A hard clamp belongs in a separate branch, and only past a real allocation budget (4096 on a side is a sane line). In that branch the bitmap is smaller than the grid, `pxPerCell` is no longer an integer, rasters can only be `drawImage` of a `cols × rows` buffer, and `sx`/`sy` must be recomputed from the actual `W`/`H`. `c * pxPerCell` fill rects are then wrong. None of the current bundles need that branch.

`cellSize <= 0` or `width === 0` still produces `Infinity` or a zero-sized canvas. Guard those before dividing.

The baseline exclusion inset breaks at the HiRISE pixel size. It is `fillRect(x + 3, y + 3, px - 6, px - 6)`. Canvas flips a negative width. It does not ignore it.

- `px >= 7`: real inset.
- `px === 6`: zero size, nothing drawn.
- `px === 1`: width −5, flipped into a 5×5 rect that spills into neighboring cells.

MapRasters uses `pad = max(1, floor(px * 0.15))`. At `px === 1` that flips into a 1×1 full cell. At `px === 2` the inner size is 0 and the exclusion disappears. Any cached raster has to special-case `inner < 1` (paint the whole cell, or skip it). Do not run the +3 inset at `pxPerCell === 1`.

## 2. ImageData cache

The 1:1 buffer is the right tool when each cell is already one pixel. It is the wrong tool when you then stretch it.

`drawImage` of a `cols × rows` bitmap up to `cols * pxPerCell` with `imageSmoothingEnabled = false` turns every cell into a solid block. These details do not survive that stretch:

- MapRasters exclusion inset (`pad` / inner tile).
- Baseline exclusion inset of 3 px.
- Baseline slope, which is a diagonal `stroke`, not a fill. MapRasters slope is a full-cell `fillRect` and only for `slope > 5`. The baseline cache has to keep the baseline formula (`rgb(v, v*0.75, v*0.6)`, quality tint, slope stroke above 25°). Sharing `colorScale.ts` with the baseline drawer changes the picture.

CTX is the bundle this gate gets wrong. 51×51 is above `20×20`, so it takes the ImageData path, then stretches 18×. Synthetic 20×12 and the test grids (4×3, 4×4) stay on `fillRect`, so the tests pass while CTX exclusions become solid squares. Gate the 1:1 path on `pxPerCell === 1`, not on `cols > 20`. For CTX, paint the existing loop once into an offscreen canvas of the real bitmap size (918×918) and blit that. 2601 cells is cheap. HiRISE at 1 px/cell is where a `Uint8ClampedArray` loop earns its keep, and there the inset cannot exist anyway.

`putImageData` replaces pixels. It does not source-over. `fillRect` of `rgba(...)` does. A cache that is later `drawImage`d must be composited in the buffer, in layer order, skipping `null` colors. Writing zeroes for “good quality” or “slope ≤ 5” punches out the elevation under it. Straight-alpha over an opaque pixel:

```text
out = src * a + dst * (1 - a)
```

Use each helper’s alpha once. `getSlopeColor` already bakes `opacity * 0.6` into the minor-grade string. Multiplying by `layers.slope.opacity` again squares it. `Uint8ClampedArray` truncates. The string helpers `Math.round`. Write rounded bytes or you drift by 1. Parsing a million `rgba(...)` strings will also erase the win. Numeric helpers that the existing string functions call are the single source of truth. Tests assert those strings, so the string wrappers stay.

Build the buffer in a `useRef`, keyed on primitive visibility and opacity plus `bundle`, `minZ`, and `maxZ`. A buffer allocated inside the draw or inside the `useEffect` is rebuilt on every trace tick. HiRISE is 4 MB. One cached copy is fine. A 4 MB allocation at 30 fps is a stutter. Drop the ref on key change and on unmount. Do not put `traceFrame` in the key.

`imageSmoothingEnabled = false` belongs only around that `drawImage`, inside `save`/`restore`. The flag sticks on the context. Route strokes ignore it. A later `drawImage` would not.

The test mocks never grow `drawImage`. `foundation.test.tsx` replaces `HTMLCanvasElement.prototype.getContext` with a plain object that has `fillRect` and `setLineDash` and no `drawImage`. That stub is used for the offscreen canvas too, so `getContext('2d') == null` is false in those tests. `typeof ImageData === 'undefined'` is also false under Vitest’s jsdom. The check that actually saves the tests is `typeof ctx.drawImage !== 'function'` on the context you were given, and then the existing `fillRect` loop on that same context. `MapRasters.test.tsx` counts `fillRect` on the injected context for a 4×3 grid. An offscreen blit that never calls `fillRect` fails that test even though the picture would be right.

## 3. Clicks

The scale `(clientX - rect.left) * (rect.width > 0 ? W / rect.width : 1)` is the right mapping for this stylesheet. There is no `object-fit`. The bitmap fills the canvas border box. Desktop sets `maxWidth: '100%'`. Mobile also sets `height: auto`. Using `W / rect.width` and `H / rect.height` separately stays correct if those two scales ever differ. `object-fit: contain` would letterbox inside the rect and this formula would miss. Do not add it.

`fromPx` must keep using the same `sx`/`sy` as `toPx`. The click handler is recreated each render, so it sees the current scales. The draw effect does not own picking.

jsdom’s `getBoundingClientRect` is all zeros. The current division produces `Infinity`, and `foundation.test.tsx` still passes because `typeof NaN === 'number'`. The `rect.width > 0 ? … : 1` fallback treats `clientX`/`clientY` as bitmap pixels and returns finite metres. That is the right unlaid-out behavior. It is not CSS-scale behavior. If a test ever asserts the metre value of a click, zero-rect coordinates are bitmap pixels, not a scaled box.

## 4. Effect deps and trace playback

An explicit dependency list is right. `toPx` and `fromPx` must stay off that list. They are new function identities every render, and listing them defeats the list. `sx`, `sy`, `W`, `H`, and `pxPerCell` are the real inputs. `customLayers` from `useState` in `App.tsx` is stable until a layer registers. An inline object would redraw forever.

Trace at 10–30 fps then does: `clearRect`, one cached blit, a few polylines, and at most 256 closed cells plus 256 frontier cells. That is cheap. Rebuilding the raster in that effect is not.

`closedCells` is not a flood fill. The solver pushes a batch, caps it at 256, downsamples, then clears the batch. `compactTraceFrames` throws away more. `frontierCells` and `currentBestCells` are snapshots. `clearRect` every frame erases the previous batch, so painting `frame.closedCells` shows a sparse sparkle that moves, not a growing explored region. A growing mask is a separate `Uint8Array` of `width * height`, unioned with each frame’s indices and blitted from its own cache. Even that mask is only the downsampled subset. `exploredCount` is the true count, and you do not have those indices.

`currentBestCells` are row-major indices. Convert them with `cellCenter`. A polyline through cell origins sits half a cell off the committed route, whose vertices are centers.

Draw order as specified puts the trace on top of the selected route. The selected route is already `#00e5ff`, and the plan’s frontier is bright cyan. During playback the best-path stroke covers the route. Rejected dashes in amber sit on the same hue as the return leg (`#fbbf24`, dash `[5,5]`). Pick a different rejected default.

`setLineDash([4, 4])` sticks. `MapChrome` never resets it, and its `save` captures whatever dash is current, so the boundary and the north arrow stroke dashed. `save`/`restore` around the rejected paths and the trace, and a `setLineDash([])` before leaving that block.

`layers.route.visible` is not in the new draw. `MapRoutes` already bails when the route layer is hidden. Rejected paths drawn by `MapCanvas` would remain. Decide that explicitly.

`onPickCandidate` has no hit test. The click handler always calls `onPick`, which places an endpoint. A second callback either never fires or steals that click. `selectionSync.test.tsx` only reads `data-selected-candidate` and `data-hover-index`. Keep those attributes. Wire candidate picking with a pixel threshold and a rule for which callback wins, or leave the prop out of this pass.

Playback state in the root `App` re-renders the whole shell at frame rate. `MapCanvas` can afford the redraw. The clock should not clone mission state to do it.

## 5. `MapRoutes` ref and slot props

`MapCanvas` and `MapRoutes` are siblings. `MapCanvas` is first. Every render finishes, then effects run in that same order. The canvas effect runs before the routes effect.

The current sync effect is already one commit late:

```18:21:src/ui/features/map-routes/MapRoutes.tsx
  const latestRef = useRef({ candidates, selectedCandidateId, stale, hover, routeLayerVisible });
  useEffect(() => {
    latestRef.current = { candidates, selectedCandidateId, stale, hover, routeLayerVisible };
  });
```

Adding `[candidates, selectedCandidateId, stale, hover, routeLayerVisible, traceFrame, rejectedPaths]` does not fix it. The effect still runs after `MapCanvas` has drawn. The last candidate update and the last trace frame stay off the canvas until something else renders `MapCanvas`.

Write the ref during render. Delete the sync effect. Render order is `MapCanvas`, then `MapRoutes`, and both finish before any effect, so the canvas effect sees the new ref.

```tsx
latestRef.current = {
  candidates,
  selectedCandidateId,
  stale,
  hover,
  routeLayerVisible,
};
```

Keep `registerLayer` as the only dependency of the draw effect. Putting `traceFrame` on that effect re-registers the layer every frame. `registerCanvasLayer` calls `setCustomLayers`, which replaces `customLayers`, which retriggers the canvas effect through App. That is a 30 fps state loop for a value the draw function can read from the ref.

`MapRoutesSlotProps` can stay untouched, and extra optional props still satisfy `FeatureModule<'map-routes'>`. `Slot` passes only the slot props, so `App` cannot pass `traceFrame` or `rejectedPaths` into `MapRoutes` without a `types.ts` change. Those optional props are unreachable in the composed app. One owner should draw them. `MapCanvas` already has to, because the z-order is under the routes, then between the routes and the markers. Drawing them again inside `MapRoutes` doubles the ink.

`hover` on the slot includes `distance_m` and `elevation_m`. The `MapCanvas` hover prop does not. The tag in `MapRoutes` reads both. A ref that stored the canvas hover shape would crash the tag. Keep the slot hover type.
