# `eng-trace` examiner log (`src/routing/searchTrace.ts`)

**Role:** `eng-trace` (`merge/integration`)  
**Owned files:** `src/routing/searchTrace.ts`, `docs/debate-parts/debate-eng-trace.md`  
**Examiner:** GPT-6 Luna via `codex exec -m gpt-6-luna -c model_reasoning_effort=high -s read-only`  
**Graded model:** Grok 4.7 High

The examiner is not a helper. A score under 85 is a fail. Codex was read-only. `codex apply` was not run.

---

## Round 1 — fail

**Command:** non-interactive `codex exec` with the complete source of `src/routing/searchTrace.ts` on stdin.  
**Source hash:** `2122733DABBFE17293C482E7ED38313F1043AFF655DFFABB6BEABCECDD2DC5E3` (70,614 bytes)

| Category | Score |
|---|---:|
| Correctness | 18/30 |
| Contracts | 12/20 |
| Tests | 0/15 |
| HiRISE cost | 11/20 |
| Honesty | 10/15 |
| **Total** | **51/100** |

**Examiner objection (correctness):** both same-cell paths bypassed admissibility. `runSearch` returned a successful zero-cost route before filling or checking its admissibility mask, and the separate `startIndex === goalIndex` branch did the same for A*, Dijkstra, and greedy best-first. An excluded, missing-elevation, over-slope, or strict-quality-invalid cell was reported as a valid route, and A* and Dijkstra could report an optimal-cost match.

**Examiner objection (HiRISE cost):** the large-grid branch skipped the searches, but `framesFromSolvedPath` rebuilt every sampled prefix from the beginning. With 48 frames and a long stored path, that was up to about 48 passes. Offset-corridor construction could also scan the entire shared candidate path repeatedly.

**Examiner objection (tests, contracts, honesty):** the source contains no tests, so the tests category was zero. Rejected corridors hardcoded non-strict quality while strict quality was on. Sampled frame costs were a fraction of the stored final cost rather than a measured prefix.

SCORE: 51

---

## Fixes applied after the fail

The same-cell gate was already present in the newer file (`sameCellRun` calls `isCellAdmissible` before a zero-cost success, and both call sites use it). That newer gate was kept.

1. **Measured frames, one pass.** `framesFromSolvedPath` walks the stored cells once. Each frame cost is the sum of steps that pass `spanAllowed` before `computeEdgeCost`. Prefixes are index-sampled up to 256 cells. The stored total is not spread by fraction. `openSize` stays 0 and `frontierCells` stays empty, because this is not a live search.
2. **Offset corridors.** A sidestep is one Bresenham from the mission start cell to the mission destination through a shifted midpoint. `linkedCorridor` requires every step to be a legal king move. A two-cell neighbor spur is not returned. If no start-to-destination sidestep exists, the option is labeled "No offset corridor" and its path is empty.
3. **Strict quality.** `buildRejectedPathOptions` takes an optional `strictQuality` (default `false` so the five-argument call still typechecks). `computeSearchTraceAndCompare` passes the request flag into straight-line and offset measurement.

No test file was added. `tests/searchTrace.test.ts` belongs to `test-unit-int`, and this worker may not edit that path.

`npx eslint src/routing/searchTrace.ts` exited 0 after these edits.

---

## Other Luna scores on this module

These are written verdicts from `codex exec -m gpt-6-luna -c model_reasoning_effort=high -s read-only`, with the full source in the prompt. Under 85 is a fail.

| Pass | Score | Defect named |
|---|---:|---|
| Same-cell admissibility | 68 | A shared cell was a zero-cost success without `isCellAdmissible`. Fixed by `sameCellRun`. |
| Disconnected offset | 64 | An offset could skip blocked cells. Fixed by king-move `spanAllowed` and abandoning a broken shift. |
| Dangling spur | 68 | `spurCells` / `spurSample` returned `[idx, next]` and the UI called it an offset corridor. Removed. The only offset kept is a legal path from the mission start cell to the mission destination. |

## Round 2 — fail

**Score: 82/100.** GPT-6 Luna, high reasoning, read-only, full source in the prompt.

Defect: on a grid above 100,000 cells the skipped A* row copied the selected candidate's stored cost without checking that the candidate includes the resolved policy, while the frames priced that same polyline with the trace policy's weights. The row and the frames could describe different costs.

Change: `largeGridAstarStats` uses the last frame's gated step sum whenever frames exist, so the row and the frames share one cost. The stored candidate cost is copied only when no frames were priced and the candidate's policies include the trace policy. Otherwise the stored cost is not shown.

## Round 3 — fail

**Score: 76/100.** GPT-6 Luna, high reasoning, read-only, full source in the prompt.

Defect: `categoryForCandidate` called a route rough terrain when its maximum slope was more than one degree above the selected route. The candidate metrics have no roughness total, and the reason then said the corridor "crosses rougher ground."

Change: that slope test no longer returns `rough-terrain`. A slope above 20 degrees is `excess-slope`, and the sentence says "steeper" only when the slope is actually higher than the selected route. The candidate rough-terrain sentence no longer claims a roughness comparison. A measured sidestep above 0.5 m roughness says that, and does not call the selected route smoother.

## Round 4 — fail

**Score: 78/100.** GPT-6 Luna, high reasoning, read-only, full source in the prompt.

Defect: `pathFromCandidate` returned the finite points it had already copied when it hit a non-finite stored point. The rejected option could draw that shortened line while the metrics still described the full candidate.

Change: a stored path is used only when every point is finite and the count matches the cell list. Otherwise the cells are draped, and that drape is used only when it also covers every cell. An incomplete corridor is not drawn. The reason says the figures describe the full solved route, not a shortened line.

A 15/100 verdict that `policiesOverlap` and `peakRoughness` were missing was not applied. Both functions are defined in this file, and `tsc -p tsconfig.app.json` reported no `searchTrace` errors.

## Round 5 — fail

**Score: 78/100.** GPT-6 Luna, high reasoning, read-only, full source in the prompt.

Defect: when the grid is missing or unusable, `fallbackPair` returned two corridors with distance 0 and `costRatio` 1. Those zeros were not measurements.

Change: unmeasured metric fields are `NaN`, the labels say no corridor was built, and the reason says the fields are not comparison results. The same `NaN` metrics are used when an offset was checked and no legal start-to-destination corridor was found.

## Round 6 — fail

**Score: 68/100.** GPT-6 Luna, high reasoning, read-only, full source in the prompt.

Defect: `measureCells` set `weightedCost` to 0 for a one-cell path when the rasters were finite, without `isCellAdmissible`. Strict quality could reject that cell and the cost was still 0.

Change: a one-cell cost is 0 only when that cell passes `isCellAdmissible` for the same strict-quality flag used for the other steps. Otherwise the cost stays null.

## Round 7 — fail

**Score: 78/100.** GPT-6 Luna, high reasoning, read-only, full source in the prompt.

Defect: with `maxFrames: 0` on a grid above 100,000 cells, the skipped A* row copied the selected candidate's stored cost whenever the candidate included the trace policy, even if `weightsOverride` was active. That stored cost can belong to different weights.

Change: a stored cost is copied only when no frames were priced, the candidate includes the policy, and no weight override is active. An active override with no frames leaves the cost null and says why.

## Round 8 — fail

**Score: 78/100.** GPT-6 Luna, high reasoning, read-only, full source in the prompt.

Defect: when `selectedCandidateId` matches no candidate, `baselineOf` used zeros. Deltas against that zero were described as differences from "the selected route."

Change: `Baseline.found` is false in that case. Metric fields are `NaN`, and the reasons say no selected route was matched, so the numbers are not a comparison.

## Round 9 — fail

**Score: 72/100.** GPT-6 Luna, high reasoning, read-only, full source in the prompt.

Defect: on a grid above 100,000 cells, `framesFromSolvedPath` still walked every cell of the selected path to price it. A very long path could do substantial main-thread work after the search skip.

Change: paths longer than 4,096 cells are index-sampled into at most 48 frames and are not priced. Frame cost 0 is labeled as not a measured route cost. The skipped A* row does not treat that 0 as its cost. It copies the stored cost only when the candidate includes the policy and no weight override is active. Otherwise the row cost is null.

## Round 10 — fail

**Score: 76/100.** GPT-6 Luna, high reasoning, read-only, full source in the prompt.

Defect: weight choice ignored `RouteRequest.weightOverrides`. On a large grid the skipped A* row could copy a stored cost for a policy even when that candidate had been priced with different request weights.

Change: after an explicit trace override, weights come from `request.weightOverrides` for the active policy when those three numbers are finite and non-negative. Otherwise the EVA table is used. A stored cost is still copied only when no trace override is active. A request override is not a trace override, because that is the weight set the stored candidate used.

## Round 11 — fail

**Score: 72/100.** GPT-6 Luna, high reasoning, read-only, full source in the prompt.

Defect: a missing selected distance or unknown-quality length was treated as a measured zero, and deltas were reported against that zero.

Change: `measuredNumber` keeps a missing metric as `NaN`. Deltas are emitted only when the selected distance, unknown-quality length, and slope are all finite (`baselineMetricsReady`). Otherwise the metric fields are `NaN` and the reason says no delta is reported.

## Round 12 — fail

**Score: 79/100.** GPT-6 Luna, high reasoning, read-only, full source in the prompt.

Defect: with `maxFrames` 0 on a large grid, the skipped A* row copied the stored cost when a route-request weight override was active. `largeGridAstarStats` only saw `weights.fromOverride`, not `weights.fromRequest`.

Change: the stored cost is copied only when the candidate includes the policy and neither a trace override nor a request weight override is active. Otherwise the row cost is null.

## Round 13 — fail

**Score: 68/100.** GPT-6 Luna, high reasoning, read-only, full source in the prompt.

Defect: the large-grid search skip still let rejected-path generation copy, drape, or roughness-scan a full candidate path. A million-cell path could still do heavy main-thread work.

Change: `pathFromCandidate` and `peakRoughness` stop at 4,096 cells. A longer corridor is not copied or scanned. The reason states the cell count and the main-thread cap.

## Round 14 — fail

**Score: 82/100.** GPT-6 Luna, high reasoning, read-only, full source in the prompt.

Defect: `runSearch` pushed an inadmissible start cell onto the heap. The search counted that cell as explored and could emit a frame that said legal neighbors were pushed, even though the admissibility guard expanded nothing.

Change: if the start cell fails the admissibility mask, the run returns immediately with 0 explored nodes, no frames, and a notice that no search was run.

## Round 15 — fail

**Score: 76/100.** GPT-6 Luna, high reasoning, read-only, full source in the prompt.

Defect: `allCandidatesShareCells` ran `sameCells` on full candidate cell arrays before any large-grid guard, so a million-cell path could still be scanned on the main thread.

Change: `sameCells` returns false when the list is longer than 4,096 cells and does not walk it. Callers treat that as "not compared as the same list."

## Round 16 — fail

**Score: 76/100.** GPT-6 Luna, high reasoning, read-only, full source in the prompt.

Defect: `sameCells` returned false for every path longer than 4,096 cells. An identical long candidate could be shown again as a rejected alternative.

Change: lists of that length are compared at 64 evenly spaced indexes, including the first and last cell. A match suppresses the duplicate. The comparison does not walk every cell, and a match is not a proof that the unsampled cells are identical.

## Round 17 — fail

**Score: 76/100.** GPT-6 Luna, high reasoning, read-only, full source in the prompt.

Defect: a 64-index sample was treated as proof that two long cell lists are the same. Distinct corridors that differ between the sample points could be hidden, and the code could claim that every candidate shares one corridor.

Change: a list longer than 4,096 cells is `uncompared`. It is not walked. It is not treated as the same list, and it is not shown as a distinct rejected corridor. `allCandidatesShareCells` is true only when every comparison is `same`.

## Round 18 — fail

**Score: 79/100.** GPT-6 Luna, high reasoning, read-only, full source in the prompt.

Defect: when the selected candidate id matches nothing, `baselineOf` has an empty policy list. `policiesOverlap` is then false, and every other candidate is labeled `alternative-policy` with no selected route to differ from.

Change: `categoryForCandidate` returns `suboptimal-detour` when no selected route was found, before the policy-overlap test. The reason already says no comparison is made.

## Round 19 — fail

**Score: 72/100.** GPT-6 Luna, high reasoning, read-only, full source in the prompt.

Defect: on a grid above 100,000 cells, the skipped A* row could still carry a re-priced path cost in `weightedCost`. That number looked like an A* result even though A* did not run.

Change: every large-grid A* row now has `weightedCost: null`. The notice says A* did not run. Frame costs, when present, stay labeled as gated sums along the stored cells, not as an A* result.

## Round 20 — fail

**Score: 80/100.** GPT-6 Luna, high reasoning, read-only, full source in the prompt.

Defect: `offsetReason` said every solved candidate uses the same cells whenever no offset path was returned. `buildOffsetCells` can return no path when long lists are `uncompared`, so that sentence was not established.

Change: the shared-cells sentence is used only when `allCandidatesShareCells` is true. Otherwise the reason says long paths were not compared cell by cell and does not claim they share a corridor.

## Round 21 — fail

**Score: 78/100.** GPT-6 Luna, high reasoning, read-only, full source in the prompt.

Defect: `maxDijkstraNodes` also caps greedy best-first, and the skip notice called it a generic comparison cap. The option name made that look like a Dijkstra-only limit.

Change: the field comment and the skip notice now say the cap applies to Dijkstra and to greedy best-first. The behavior is unchanged: the original trace brief uses this one cap for both comparison searches.

## Round 22 — fail

**Score: 78/100.** GPT-6 Luna, high reasoning, read-only, full source in the prompt.

Defect: any shared policy was enough to divide the two weighted costs. A candidate that lists several policies has one scalar cost, and an overlap does not prove that cost used the same weights as the selected route.

Change: weighted costs are compared only when both the candidate and the selected route list exactly one policy and that policy is the same. Otherwise the cost ratio is the horizontal-distance ratio.

## Round 23 — fail

**Score: 78/100.** GPT-6 Luna, high reasoning, read-only, full source in the prompt.

Defect: the large-grid A* row now has a null weighted cost, but `sampledNotice` still said that skipped A* cost matched the last frame's step sum.

Change: the notice says the skipped A* row has no weighted cost. Frame step sums, when present, are gated costs along the stored cells and are not an A* result.

## Round 24 — fail

**Score: 82/100.** GPT-6 Luna, high reasoning, read-only, full source in the prompt. `npx eslint src/routing/searchTrace.ts` exited 0 before this review.

Defect: `sameCells` returns `uncompared` for equal-length paths longer than 4,096 cells, and `buildRejectedPathOptions` keeps a candidate only when the comparison is `different`. Long alternatives are therefore omitted even though the code has not shown that they match the selected route.

The source still has no tests. Luna has not scored the file at 85 or above.
