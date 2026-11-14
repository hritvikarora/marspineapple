I'll audit the routing code against the merge plan, invariants, and the tests you named, reading only those files.The spec conflict is in the quality penalties: §5 overrides §2.3. I’ll read the solver next and check it against that override and the tests.The slope failures at `worker.sim.test.ts` lines 77 and 132 come from the test fixtures, not from `evaEngine.ts`. The solver is applying the 20° limit the spec requires.

`reqFor(noisy, 'after-cancel', 1)` uses `cases[1]`. A start cell at 23.6° fails `isCellAdmissible` (`slope > 20`) before search, so the engine returns `invalid-input` / `endpoint-excluded` / `start`. The test expects `success`. `reqFor(noisy, 'new-region')` uses `cases[0]`. Under a 20° cap that pair is disconnected, so the engine returns `no-path` (or `endpoint-excluded` if an endpoint itself is over 20°). The test also expects `success`. `expectations.ts` already allows both outcomes on non-flat terrain: `endpoint-excluded` is a solver limit (lines 54–57), and a `success` requirement exists only inside `if (flat)`. The hardcoded `success` asserts are the placeholder-era 25° assumption. Wave 3 should change those asserts. Do not raise `EVA_LIMITS` to 25°.

## Checklist

Quality penalties match §5, which overrides §2.3. Do not switch these back to `UNKNOWN = 0.75` / `LOW = 1.0`.

| Code | Penalty |
|---|---|
| `GOOD` (1) | 0.0 |
| `LOW` (2) | 0.5 |
| `UNKNOWN` (3) | 1.0 |
| `NO_ELEVATION` (0) and anything else | `Infinity` |

`worseQuality` is the higher penalty, and the same function is used in `computeEdgeCostFromStepLen` (so both `computeEdgeCost` and `runAStar`), `buildMarsLeg`, and `pathHasZeroQualityPenalty`. Corners are an admissibility gate only. With `gamma = 3`, an `UNKNOWN` step costs `1 + 3·1 = 4×` length, which still forces the `quality-patchwork` detour (`3 > 368/210`). Goldens must be regenerated because the `LOW`/`UNKNOWN` order changed.

Admissibility matches the spec. `exclusion === NONE`, finite elevation/slope/roughness, `slope <= 20` (`>` rejects), quality in `{1,2,3}`, and strict mode keeps only `GOOD`. Diagonal corners are `ur * width + vc` and `vr * width + uc`. Grade is `|dz| / stepLen > tan(20°)`, so equality stays allowed. `0 * Infinity` is short-circuited to `0`, so a zero weight cannot become `NaN`. `Math.max(0, sNorm)` is a sound deviation from the §2.3 snippet: a negative slope cannot push cost below distance and break the invariant `weightedCost >= straight-line`.

`beginSearch` plus `heap.clear()` is safe on `AbortSearchSignal`. The throw is inside `runAStar`'s `try`, so `finally` clears the heap. The stamp is not rolled back; the next `beginSearch()` increments it. Wrap to `0` fills `seenStamp` and `closedStamp` and restarts at `1`. `sharedWorkspace` is allocated only in `acquireWorkspace`.

The `Date.now` budget currently fits the handler. `handler.ts` sets `deadline = Date.now() + timeoutMs` and stops on `Date.now() > deadline`. The mock adds 1 ms per call. One engine `Date.now` at `t0` does not move that deadline. `shouldStop` / `onProgress` run only when `(explored.n & 511) === 0`, and stop is checked before progress. The timeout test's first progress with `exploredNodes: 0` does not satisfy `> 0`. The engine's first poll is at 512 nodes and is still under the deadline; the third poll (1536 nodes) times out. Polling every node, or adding two more `Date.now` calls before that first poll, fails line 188.

`weightOverrides` replace slope, roughness, and quality for that policy. Uniform quality sets `gammaNominal = 0` only for the default uncertainty weight. An explicit `override.quality` is not cleared. There is no `console.*` and no `any` in the three files.

HiRISE behavior is the right shape. All-`UNKNOWN` makes `minPenalty === maxPenalty`, so uncertainty reuses terrain-aware instead of a third search. The workspace is one reused ~45 MB block, not one per policy. `index.ts` does not import `searchTrace.ts`. `src/config.ts` imports only `MODEL_VERSION` from `./routing`; that binding has no solver dependency, so Rollup can keep it out of the entry chunk.

## Fix before verification

1. **Heap tie-break does not match §2.3.6.** `hasHigherPriority` orders by `f`, then **higher `g`**, then cross-product, then cell index. The spec is `f`, then cross-product, then cell index. Higher-`g` first is still optimal with this consistent heuristic, but it changes which equal-cost corridor you get. On top of that, an equal-`g` edge rewrites `parentIndex` when the new parent has a smaller cross-product. That second tie-break is also outside the spec. Invariants will not catch either. Bit-exact paths and goldens will.

```280:292:src/routing/evaEngine.ts
  const fu = fScore[u]!;
  const fv = fScore[v]!;
  if (fu !== fv) return fu < fv;

  const gu = gScore[u]!;
  const gv = gScore[v]!;
  if (gu !== gv) return gu > gv;
  // ...
  return u < v;
```

2. **Reused trace frames alias the source arrays.** `remapFramesForReuse` copies the frame object and the note, then shares `closedCells`, `frontierCells`, and `currentBestCells`. Both policies are pushed into `RouteSuccess.trace`. In-process callers (`solveRoute` in `realdata.test.ts`) see two frames pointing at one array; `postMessage` hides it. Slice those three arrays.

3. **The first snapshot is taken before neighbors are generated.** `openSize` / `frontierCells` are read after `popMin` and before the successor loop. The first frame is always an empty frontier (`open 0`), and every later frame omits the nodes the expanded cell is about to push. `currentBestCost: gScore[u]` itself is right. Move the snapshot to after the neighbor pushes if a test or the visualizer expects the wavefront that includes those successors.

4. **`computeEdgeCost` stays finite for edges `runAStar` rejects.** It does not apply slope, exclusion, strict quality, or `|dz| / len <= tan(20°)`. Search applies those gates first, then calls `computeEdgeCostFromStepLen`. `eng-trace` must do the same. If it treats `computeEdgeCost` as a full edge predicate, steep and excluded steps look traversable.

5. **Delete the unused quality maps.** `MAP_MARSPINEAPPLE_QUALITY_TO_INTERNAL` and `MAP_INTERNAL_QUALITY_TO_MARSPINEAPPLE` are not consulted. Penalties are applied in contract-code space, which is the correct §5 behavior. Wiring those tables in later, on top of the current switch, will invert `LOW` and `UNKNOWN`.

## Edge cases

- **Frame cap.** `floor(48 / policyCount)` per search, then a hard stop at 48. Compaction runs on an even boundary (16, 24, or 48), so the odd-tail drop in `compactTraceFrames` does not hit production. `closedCells` are deltas until compaction subsamples them. `sampleEvery` doubles at that boundary, then one more frame is stored. `{ now: () => 0 }` yields `computeMs === 0` and does not affect the heap or the notes.
- **`exploredTotal` includes return-leg expansions.** Return search is called with `maxFrames === 0`, so it has no frames. The total will be larger than the last frame's `exploredCount`.
- **`maxTerrainSlope_deg` starts at 0.** On real rasters the max is correct. A path whose slopes are all negative reports 0.
- **`downsampleUniform` uses `?? 0`.** A hole becomes cell 0, which is a real cell. Batches are dense today.
- **Duplicate or unknown policy ids** are dropped. `no-path` then echoes the deduped canonical list. `checkResponse` sorts and compares with `JSON.stringify`, so a duplicated request policy fails that invariant. Normal requests do not do this.
- **`sharedWorkspace` is not reentrant.** A `shouldStop` / `onProgress` that calls `solveRoute` corrupts the outer search. The handler does not do that.
- **Stamp wrap does not reset `heapPos`.** That is safe only because every exit, including abort, goes through `heap.clear()`. `beginSearch()` runs before the `try`. `AbortSearchSignal` cannot be thrown in that gap. Keep it that way.
- **HiRISE round trip is four A\* runs** (shortest and terrain, each both ways). Uncertainty is skipped when quality is uniform. The graph is symmetric, so reversing the outbound cells and calling `buildMarsLeg` is optimal and is the lever if `realdata.test.ts` misses 8000 ms. A backward search can pick a different equal-cost path; the cost is the same.
- **`index.ts` exports more than the §3.1 barrel** (`EVA_LIMITS`, `qualityPenalty`, `computeEdgeCost`, `isCellAdmissible`, and so on). That does not pull `searchTrace.ts` into the worker. It does mean a UI file that imports `solveRoute` from `src/routing` drags the solver into the entry chunk. Keep app code on `MODEL_VERSION` only.

`src/contracts/route.ts` matches §5: optional `trace?: SearchTraceData`, frame fields including `currentBestCost`, no timestamps or functions. `MODEL_VERSION` is `eva-astar-1.0.0`. Candidate ids follow `ROUTE_POLICIES`, not request order and not `EVAL_ORDER`. Strict failure reruns A\* with `strictQuality = false` and splits `strict-quality-disconnects` from `disconnected-under-limits`.
