# MARS PATHFINDER — Algorithmic Efficiency & Baseline Discipline (`efficiency.md`)

This document defines the exact algorithmic choices that keep our solver fast and memory-bounded while remaining **100% faithful to [project-plan.md](project-plan.md) and [team-tasks.md](team-tasks.md)**.

Per [team-tasks.md](team-tasks.md#L59-L85):
> *"Use A* with a binary heap and indexed arrays for scores and predecessors. The grid is small enough that a straightforward, well-tested implementation is preferable to a complex navigation framework... Reuse loaded immutable terrain across requests. Reset per-search arrays carefully, or use generation markers if justified by measurements. Do not introduce a complex cache before the basic solve time has been measured on the actual demonstration laptop."*

Accordingly, we separate **Baseline Optimizations (Shipped in Release 1)** from **Deferred Optimizations (Added Only If Measured Laptop Timings Require Them)**, and we record no benchmark numbers until the code is actually timed on our machine.

---

## 1. What "Exact" Means Here: Optimal on the Declared 8-Neighbor Graph

Our A* solver finds a **globally minimum-cost path on the declared 8-neighbor graph** (verified to $< 10^{-7}$ against a reference Dijkstra oracle evaluating the same effective policy weights).
- **Important Geometric Distinction (Square vs. Rectangular Grids):**
  - On **square grids ($\Delta x = \Delta y$)**, because movement is restricted to 8 discrete grid directions ($0^\circ, 45^\circ, 90^\circ, \dots$), the shortest unobstructed 8-neighbor path on flat ground can be up to $\sec(\pi/8)\sqrt{2}\sin(\pi/8 + \pi/4) - 1 = \sqrt{4 - 2\sqrt{2}} - 1 \approx \mathbf{8.239\%}$ longer than an unconstrained any-angle Euclidean line (e.g., moving $4$ East and $2$ North costs $2\sqrt{2} + 2 \approx 4.828$ cell units vs. $\sqrt{20} \approx 4.472$ Euclidean units, $+7.96\%$).
  - On **rectangular grids ($\Delta x \neq \Delta y$)**, the diagonal step angle is $\theta_d = \arctan(\Delta y / \Delta x) \neq 45^\circ$, so unobstructed 8-neighbor digitization stretch depends on aspect ratio and heading and can exceed $8.24\%$ (e.g., for $\Delta x = 20\text{ m}, \Delta y = 5\text{ m}$ and displacement $\Delta c = 1, \Delta r = 3$, the optimal 8-neighbor path is $\sqrt{425} + 10 \approx 30.616\text{ m}$ vs. $25.0\text{ m}$ Euclidean, or $+22.46\%$).
- We therefore describe the solver as **exact / cost-optimal on the declared 8-neighbor graph**, never claiming "zero geometric approximation error."

---

## 2. Baseline Optimizations (Shipped in the Core Solver)

These five techniques are simple, inspectable, and directly address the requirements in `team-tasks.md`:

### 2.1 Pre-Allocated TypedArray Workspace, Generation Stamp (`currentSearchId++`) & Single-Owner Mutex
Instead of allocating per-node JavaScript objects inside the A* loop, `SolverWorkspace` pre-allocates flat TypedArrays (`gScore: Float64Array`, `fScore: Float64Array`, `crossScore: Float64Array`, `parentIndex: Int32Array`, `seenStamp: Uint32Array`, `closedStamp: Uint32Array`, `heapNodes: Int32Array`, `heapPos: Int32Array`) once when a region bundle of size $N = W \cdot H$ is loaded.
- Incrementing `currentSearchId++` before each A* solve invalidates `seenStamp` and `closedStamp` in $O(1)$ time without zeroing $N$-element arrays between policies.
- **Single-Active-Owner Workspace Mutex:** Because `SolverWorkspace` is mutable shared state inside the worker, if a search ever yields to the event loop via `MessageChannel`, a newly arrived `PLAN_ROUTE` or `LOAD_BUNDLE` message must **never** enter `SolverWorkspace` while the yielded frame is suspended. Incoming messages increment `activeTaskEpoch++` and wait in `pendingNextTask` until the suspended search resumes, observes `localEpoch !== activeTaskEpoch`, and exits cleanly.
- *(Note: Result construction still allocates the returned path array, elevation profile array, and explanation strings—which is tiny, bounded $O(m)$ output work at the end of a solve.)*

### 2.2 Indexed Binary Min-Heap (`binaryHeap.ts`) with Strict Weak Ordering & Heuristic Reuse
- As specified in [project-plan.md](project-plan.md#L289) and [team-tasks.md](team-tasks.md#L59), we use a standard **2-ary (binary) indexed min-heap** (`parent = (i - 1) >> 1`, `left = (i << 1) + 1`, `right = (i << 1) + 2`).
- **Strict Lexicographic Comparator (No Intransitive $\epsilon$-Window):** `hasHigherPriority(u, v)` compares `(fScore[u], -gScore[u], crossScore[u], u)` using exact IEEE-754 `Float64` `<`, `>`, and `!==` operators so the heap comparator is a strict weak ordering across all possible inputs.
- Maintaining `heapPos[v]` allows `decreaseKey` (`siftUp(heapPos[v])`) in place so the heap never contains duplicate stale entries and never exceeds $N$ elements.
- When relaxing an already-seen node (`seenStamp[v] === currentSearchId`), its Euclidean heuristic $h(v)$ is already equal to `fScore[v] - gScore[v]`, so updating `fScore[v] = candidateG + (fScore[v] - gScore[v])` avoids recomputing `Math.sqrt()`.

### 2.3 Lazy Connected-Component Labeling per `(profileId, qualityMode)`
- **Why Degree-0 Checks Are Not Enough:** Checking only whether `goalIndex` has 0 valid immediate neighbors catches a single blocked post (`F04` trivial case), but misses a separated multi-cell basin (e.g., a flat crater floor surrounded by a ring of $>20^\circ$ cliffs). Inside that basin, the goal has valid neighbors, so A* would still flood-fill every reachable cell outside the basin before returning `no_path`.
- **How Lazy Component Labeling Works:**
  Because edge admissibility under `educational-eva-v1` is undirected (symmetric) and identical across `shortest`, `terrain`, and `uncertainty`:
  - On the **first request** for a given `(profileId, qualityMode)`, we run one linear-time $O(N)$ BFS pass to label connected components in `componentId = new Int32Array(N)` (and cache the 8-bit neighbor admissibility mask `adjMask = new Uint8Array(N)` using `|dz| <= d * Math.tan(maxGradeRad)` instead of repeated `Math.atan()` calls).
  - That first query pays the full $O(N)$ component-labeling pass; on that query and all subsequent queries for `(profileId, qualityMode)`, checking `componentId[startIndex] !== componentId[goalIndex]` detects any unreachable goal (whether a single cell or a 500-cell walled basin) in $O(1)$ without running A* across 3 policies.

### 2.4 Policy Ordering (`terrain` $\to$ `uncertainty` $\to$ `shortest`), Effective-Policy Override & Clean-Path Reuse
We evaluate whichever policies are requested in the relative order `terrain` $\to$ `uncertainty` $\to$ `shortest`:
1. **Uniform Quality ($U_{\max} = U_{\min} \implies \gamma_{\text{eff}} = 0$ Model Rule):** Under the raw $\gamma = 2$ formula, a constant positive floor $U > 0$ adds $\gamma U \cdot D_{\text{horiz}}(P)$, which penalizes horizontal length and can make raw `uncertainty` reject a gentle detour that `terrain` preferred. Therefore, by explicit **Effective-Policy Model Rule**, when $U_{\max} = U_{\min}$ across admissible cells, $\gamma_{\text{eff}} = 0$ (`uniformQualityOverride: true` in `effectiveWeights`). If `terrain` was already solved in the same request, `uncertainty` reuses its result and attaches `UNIFORM_QUALITY_NO_DIFFERENTIATION`; if `policies: ['uncertainty']` was requested standalone, it runs A* directly with $\gamma_{\text{eff}} = 0$.
2. **True Cost-Preserving Clean-Path Reuse ($U(e) = 0$ on all edges of $P_{\text{terrain}}$):** When $U_{\max} > U_{\min}$ ($\gamma_{\text{eff}} = 2$) and `terrain` has been solved, because $C_{\text{uncertainty}}(P) \ge C_{\text{terrain}}(P)$ for all paths $P$, if every edge of $P_{\text{terrain}}$ already has $U(e) = 0$, then $C_{\text{uncertainty}}(P_{\text{terrain}}) = C_{\text{terrain}}(P_{\text{terrain}})$, proving $P_{\text{terrain}}$ is also an exact minimizer of the raw $\gamma = 2$ `uncertainty` objective without a second search.
3. **Resilience Near Unified Request Deadline:** A single request deadline `t_deadline = t_requestStart + timeoutMs` governs lazy component initialization, all policy A* solves, and post-solve metric assembly. Running `terrain` and `uncertainty` before `shortest` ensures the two primary mission-comparison policies finish first. If any policy completes before `t_deadline`, the top-level response status is `success` with per-policy statuses recorded in `policyStatuses`.

### 2.5 Return-Leg Reversal Under Symmetric Costs
- Because edge admissibility and edge costs in `educational-eva-v1` are symmetric ($\text{cost}(u,v) = \text{cost}(v,u)$), the reversed outbound cell sequence $P_{\text{ret}} = (k_m, k_{m-1}, \dots, k_0)$ has the exact same optimal cost as an outbound path.
- *(Note: Because tie-breaking rules like larger-$g$ are directional, an independent search from Destination to Start could select a different equal-cost tie polyline whose secondary metrics differ slightly. Reversing the outbound path is the canonical symmetric implementation; an explicit reverse A* search is needed only if a future profile introduces asymmetric uphill vs. downhill costs.)*

---

## 3. Deferred Optimizations (Do Not Implement Before Measuring Laptop Timings)

To keep the codebase simple and verifiable for the hackathon, the following ideas are **explicitly deferred** unless `benchmark.test.ts` on the demonstration laptop shows that a $200 \times 200$ (or $500 \times 500$) solve is too slow:

1. **LRU Request Cache:** Deferred per [team-tasks.md](team-tasks.md#L85) (*"Do not introduce a complex cache before the basic solve time has been measured on the actual demonstration laptop"*).
2. **4-ary Heap / Octile Heuristic:** Deferred per [team-tasks.md](team-tasks.md#L59-L61), which specifies a binary heap and straight-line horizontal Euclidean heuristic. (Note also that because `fScore`, `gScore`, and `crossScore` live in separate `Float64Array`s rather than interleaved in `heapNodes`, a 4-ary heap does not place all comparison keys in a single cache line.)
3. **Cross-Policy Branch-and-Bound Pruning:** If ever enabled, pruning against an upper bound $B_{\text{upper}}$ is valid on **pop** (where $g(v) = g^*(v)$ under a consistent heuristic so $g(v) + h(v)$ is a true lower bound on all paths through $v$), or skips pushing a specific candidate relaxation without permanently banning $v$ if a cheaper $g(v)$ arrives later. Not needed for the baseline $40{,}000$-cell grid.
4. **Frequent Cooperative Chunking:** On a $200 \times 200$ grid that solves in a few milliseconds, yielding every $4{,}096$ pops is unnecessary overhead. Check `activeTaskEpoch` and `performance.now() >= t_deadline` between policy runs, and only yield mid-search if elapsed wall-clock time since the last yield exceeds $50\text{ ms}$ (serialized by the single-owner workspace mutex in Section 2.1).
