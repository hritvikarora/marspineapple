# MARS PATHFINDER — Search Correctness, Binary Heap Architecture & Web Worker Execution

This document is the technical reference for **Point 4 of Ayush's assignment**: how the A* pathfinding engine guarantees optimality on the 8-neighbor graph, how tie-breaking and equal-cost parent selection work, how the indexed **binary min-heap** and $O(1)$ generation-counter workspace operate, how lazy connected-component labeling catches separated basins, and how the Web Worker handles buffer ownership, policy ordering, and timeouts.

---

## 1. A* Search Formulation & Optimality on the 8-Neighbor Graph

### 1.1 State Space & Graph Definition
Given a validated region grid of dimensions $W \times H$ ($N = W \cdot H$ cells):
- **Vertices ($V$):** Every cell index $u \in \{0, 1, \dots, N - 1\}$ that passes cell-level admissibility ($\text{CellExclusionReason}(u) = \text{NONE}$).
- **Directed Edges ($E$):** Ordered pairs $(u, v)$ where $v$ is one of the 8 neighbors of $u$, $v \in V$, the transition passes the diagonal no-corner-cutting rule, and the along-edge grade satisfies $g_{\text{abs}}(u, v) \le \theta_{\text{maxGrade}}$.
- **Edge Weight ($\text{cost}(u,v)$):**
  $$\text{cost}(u, v) = d(u, v) \cdot \big(1 + \alpha S(u, v) + \beta R(u, v) + \gamma U(u, v)\big)$$
  where $d(u,v) \in \{\Delta x, \Delta y, \sqrt{\Delta x^2 + \Delta y^2}\} > 0$, $\alpha, \beta, \gamma \ge 0$, and $S, R, U \in [0, 1]$.

### 1.2 Why Negative Science Rewards Are Forbidden
Subtracting cost near a point of interest ($\text{cost}(u,v) = d - \text{reward}$) can create negative cycles or make $\text{cost}(u,v) < d(u,v)$, which causes the Euclidean heuristic $h(u)$ to overestimate remaining cost ($h(u) > h^*(u)$) and breaks A* optimality. Science objectives define **which destination endpoints are selected**, never negative edge weights.

### 1.3 Admissibility & Consistency of the Euclidean Heuristic
For any cell $u$ with cell-center $(E_u, N_u)$ and goal cell $g$ with cell-center $(E_g, N_g)$, the baseline heuristic required by [project-plan.md](project-plan.md#L289) and [team-tasks.md](team-tasks.md#L61) is the 2D Euclidean horizontal distance:
$$h(u) = \sqrt{(E_u - E_g)^2 + (N_u - N_g)^2}$$

Because $\alpha, \beta, \gamma \ge 0$ and $S, R, U \ge 0$, every admissible edge satisfies $\text{cost}(u, v) \ge d(u, v)$. By the Euclidean triangle inequality in $\mathbb{R}^2$:
$$h(u) \le d(u, v) + h(v) \le \text{cost}(u, v) + h(v), \qquad h(g) = 0$$
Thus $h$ is both **admissible** and **consistent (monotonic)**. The first time a node $u$ is popped from the priority queue, $g[u] = g^*(u)$ is optimal **on the declared 8-neighbor graph**, and closed nodes never need re-expansion.

---

## 2. Critical A* Correctness Rules & Concrete Counterexamples

### 2.1 Rule 1: Terminate on POP, Never on Neighbor PUSH
A* must terminate **only when `u === goalIndex` is popped from the top of the min-heap**, never the first moment `goalIndex` is encountered as a neighbor.

**Concrete 4-Node Counterexample:**
Suppose Start $s = (0,0)$, Goal $g = (0,2)$, $\Delta x = 5\text{ m}$:
- Node $a$: $\text{cost}(s,a) = 5$, $h(a) = 5 \implies f(a) = \mathbf{10}$.
- Node $b$: $\text{cost}(s,b) = 6$, $h(b) = 5 \implies f(b) = \mathbf{11}$.
- A* pops $a$ first ($f(a) = 10 < f(b) = 11$) and sees neighbor $g$ across a high-penalty edge $\text{cost}(a,g) = 30$, giving $g[g] = 5 + 30 = \mathbf{35}$.
- Stopping on neighbor discovery would return suboptimal cost **$35$**.
- Pushing $g$ with $f(g) = 35$ lets A* next pop $b$ ($f(b) = 11 < 35$), relax $(b \to g)$ with $\text{cost}(b,g) = 6$ to $g[g] = 6 + 6 = \mathbf{12}$, and then pop $g$ with optimal cost **$12 < 35$**.

---

### 2.2 Rule 2: Strict Transitive Total Order in the Binary Min-Heap (No $\epsilon$-Comparator Cycles!)
1. **Why $\epsilon$-Based Approximate Tie Windows Are Intransitive and Forbidden in Heaps:**
   If a comparator treats $|f[u] - f[v]| \le \epsilon$ as tied and breaks ties by larger $g$, the relation is **not transitive**:
   - Consider $A: (f = 10, g = 1)$, $B: (f = 10 + 0.75\epsilon, g = 2)$, $C: (f = 10 + 1.50\epsilon, g = 3)$.
   - Under an $\epsilon$-window: $B \prec A$ (since $|f_A - f_B| \le \epsilon$ and $g_B > g_A$), $C \prec B$ (since $|f_B - f_C| \le \epsilon$ and $g_C > g_B$), **yet $A \prec C$** (since $f_C - f_A = 1.50\epsilon > \epsilon$)!
   - That creates a comparator cycle ($B \prec A \prec C \prec B$), violating the strict weak ordering required by a binary heap so the heap root is no longer guaranteed to be minimum.
2. **Strict IEEE-754 `Float64` Lexicographic Total Order (`isHigherPriority(u, v)`):**
   Because all `fScore`, `gScore`, and `crossScore` values are finite `Float64` numbers (never `NaN`), we compare them with **ordinary strict numeric ordering (`!==`, `<`, `>`) and zero $\epsilon$-band**:
   - **Level 1 (Smaller $f$-score):** If `fScore[u] !== fScore[v]`, return `fScore[u] < fScore[v]`.
   - **Level 2 (Larger $g$-score / Smaller $h$-score):** If `gScore[u] !== gScore[v]`, return `gScore[u] > gScore[v]`.
   - **Level 3 (Smaller Cross-Product Deviation):** Let $\text{cross}(k) = |(E_k - E_s)(N_g - N_s) - (N_k - N_s)(E_g - E_s)|$. If `crossScore[u] !== crossScore[v]`, return `crossScore[u] < crossScore[v]`.
   - **Level 4 (Smaller Canonical Cell Index):** Return `u < v`.
   Because exact equality (`===`) on finite `Float64` numbers is an equivalence relation and `u !== v` for distinct heap entries, this 4-tuple lexicographic order is mathematically guaranteed to be **irreflexive, asymmetric, and strictly transitive** ($x \prec y \land y \prec z \implies x \prec z$).
3. **Strict Edge Relaxation Rule:**
   When relaxing edge $(u \to v)$ with `candidateG = gScore[u] + stepCost`:
   - Update `parentIndex[v] = u` when `candidateG < gScore[v]`, **or** when `candidateG === gScore[v]` and `(crossScore[u] < crossScore[parentIndex[v]] || (crossScore[u] === crossScore[parentIndex[v]] && u < parentIndex[v]))`.
   - Floating-point tolerances (e.g., $10^{-7}$) are used **only in post-solve verification assertions** when comparing total path cost against the reference Dijkstra oracle—never inside the heap comparator.

---

### 2.3 Rule 3: Lazy Connected-Component Labeling for Unreachable Goals (Single-Cell & Multi-Cell Basins)
Checking only whether `goalIndex` has degree $0$ (all 8 immediate neighbors blocked) catches a single blocked post, but **misses a separated multi-cell basin** (e.g., a $500$-cell flat crater floor surrounded by a ring of $>20^\circ$ cliffs). Inside that basin, `goalIndex` has valid neighbors, so a degree-$0$ check passes and A* would flood-fill every reachable cell outside the crater before returning `no_path`.

**The Unified Solution (Lazy Component Labeling per `(profileId, qualityMode)`):**
Because edge admissibility under `educational-eva-v1` is undirected and shared across all three policies:
- The first time a `(profileId, qualityMode)` pair is queried on the loaded bundle, we run a linear-time BFS component labeling pass ($O(N)$ time) to populate `componentId = new Int32Array(N)` (`-1` for inadmissible cells, $\ge 0$ for connected component ID).
- Before running A*, we check:
  1. **Same-Cell Request (`startIndex === goalIndex`):** Return the 1-cell zero-length route immediately.
  2. **Disconnected Component (`componentId[startIndex] !== componentId[goalIndex]`):** Immediately return `no_path` (`DISCONNECTED_GOAL`)—catching both degree-0 islands and multi-cell walled basins with one exact check.

---

## 3. Binary Min-Heap & Workspace Memory Architecture

Per [project-plan.md](project-plan.md#L289) and [team-tasks.md](team-tasks.md#L59), we use a **binary min-heap** (`binaryHeap.ts`) backed by flat TypedArrays in `SolverWorkspace`, pre-allocated once per loaded region of $N = W \cdot H$ cells:

| TypedArray | Type | Size | Purpose |
| :--- | :--- | :---: | :--- |
| `gScore` | `Float64Array` | $N$ | Best known cost from start $g[u]$ (64-bit prevents `Float32` accumulation drift) |
| `fScore` | `Float64Array` | $N$ | Total priority $f[u] = g[u] + h(u)$ |
| `crossScore` | `Float64Array` | $N$ | Cross-product straight-line deviation $\text{cross}(u)$ |
| `parentIndex` | `Int32Array` | $N$ | Predecessor cell index (`-1` for start) |
| `seenStamp` | `Uint32Array` | $N$ | Generation stamp (`currentSearchId`) when cell was reached in current solve |
| `closedStamp` | `Uint32Array` | $N$ | Generation stamp (`currentSearchId`) when cell was popped/closed |
| `heapNodes` | `Int32Array` | $N$ | Binary min-heap array of cell indices (children at `2i+1`, `2i+2`; parent at `(i-1)>>1`) |
| `heapPos` | `Int32Array` | $N$ | Current index of cell $u$ inside `heapNodes` (`-1` if not in heap) |

- **$O(1)$ Generation-Stamp Reset:** Incrementing `currentSearchId++` resets `seenStamp` and `closedStamp` between policy solves without running `.fill()` across $N$ elements.
- **In-Place `decreaseKey` (`siftUp`):** Using `heapPos[v]`, improving an already-open node sifts it up in place so the binary heap never exceeds $N$ entries.
- **Bounded Predecessor Backtracking:** Path reconstruction verifies `0 <= curr < totalCells` and `steps <= totalCells` at every step, returning `data_error` (`BROKEN_PREDECESSOR_CHAIN` or `PREDECESSOR_CYCLE_DETECTED`) rather than hanging if memory is ever corrupted.

---

## 4. Reference Dijkstra Verification Engine

We implement a standalone reference **Dijkstra solver** (`solveDijkstra`, with $h(u) \equiv 0$) for automated unit testing:
- On every synthetic fixture, tests assert:
  1. `resultAStar.status === resultDijkstra.status`,
  2. Every cell and edge in `resultAStar.path` passes `verifyPathAdmissibility`,
  3. The recomputed total edge cost matches Dijkstra within floating-point tolerance: $|C(P_{\text{A*}}) - C(P_{\text{Dijkstra}})| \le 10^{-7}$ (allowing different valid geometries when equal-cost ties exist).

---

## 5. Web Worker Execution, Buffer Ownership & Policy Ordering

### 5.1 Safe Buffer Ownership (Never Detach UI / 3D TypedArrays!)
The #1 real-world Web Worker hazard ([team-tasks.md](team-tasks.md#L83)) is transferring an `ArrayBuffer` via `postMessage(data, [data.buffer])`, which **detaches (zeros out)** the buffer on the main thread and breaks the 2D map and 3D terrain mesh.
- **Rule:** When loading a region bundle into the worker (`LOAD_BUNDLE`), pass a **structured clone** (copying $\sim 1\text{ MB}$ of numeric grids once takes $< 1\text{ ms}$) or let the worker hold its own copy. Never include shared UI/3D buffers in the transfer list.

### 5.2 Policy Execution Order, Standalone Policy Subsets & Partial Timeout Semantics
When a `RouteRequest` specifies `policies: Policy[]` (any non-empty subset of `['shortest', 'terrain', 'uncertainty']`):
1. **Execution Order Over the Requested Subset:**
   Evaluate only the requested policies in the priority order:
   $$\text{\texttt{terrain}} \longrightarrow \text{\texttt{uncertainty}} \longrightarrow \text{\texttt{shortest}}$$
2. **Uniform-Quality Effective-Policy Rule & Standalone `['uncertainty']` Requests (Findings 1 & 7 Fix):**
   - When observation quality is uniform across all admissible cells in the bundle ($U_{\max} = U_{\min}$), the `uncertainty` policy's effective weight is $\gamma_{\text{eff}} = 0$ (`uniformQualityOverride: true`, exported in `effectiveWeights`).
   - If **both** `'terrain'` and `'uncertainty'` were requested, `uncertainty` shares the exact same effective weights $(\alpha=2, \beta=1, \gamma_{\text{eff}}=0)$ as `terrain`, reuses the already-computed `terrain` result in $0\text{ ms}$, and merges into `['terrain', 'uncertainty']`.
   - If **`'uncertainty'` was requested WITHOUT `'terrain'`** (e.g., `policies: ['uncertainty']`), the solver executes `uncertainty` directly using $\gamma_{\text{eff}}$ and returns **only** the requested `'uncertainty'` policy—never failing on a missing `terrain` dependency and never injecting an unrequested `'terrain'` policy into the response.
   - When quality is **not** uniform ($\gamma_{\text{eff}} = 2$), if `'terrain'` was also requested and every edge of $P_{\text{terrain}}$ has $U(e) = 0$ (`ACCEPTABLE`), `uncertainty` reuses $P_{\text{terrain}}$ as a true cost-preserving optimum; otherwise it solves A* with $\gamma_{\text{eff}} = 2$.
3. **Top-Level vs. Per-Policy Timeout Status ([project-plan.md](project-plan.md#L254)):**
   - If **at least one** requested policy succeeds before the $5000\text{ ms}$ timeout, the top-level response returns `status: 'success'` with the completed route candidate(s), while recording `{ shortest: 'timeout' }` in `policyStatuses` and attaching a warning.
   - Top-level `status: 'timeout'` is returned **only when zero policies finish** within the budget.

### 5.3 Single-Owner Workspace Mutex, Request Deadlines & Cooperative Cancellation (Finding 5 Safeguard)
Because `RoutingEngine` reuses a single `SolverWorkspace` (`gScore`, `parentIndex`, `heapPos`, `currentSearchId`) and supports mid-search `MessageChannel` yielding, **reentrant concurrent access to `SolverWorkspace` is strictly forbidden**:
1. **Serialized Single-Active-Owner Mutex:**
   - At most **one** async operation (`calculateRoutes` or `loadBundle`) may hold the workspace lock at any time.
   - If a new `RouteRequest` B or a `LOAD_BUNDLE` message arrives while Request A is suspended at a yield point:
     1. Increment `activeTaskEpoch++` (marking Request A as cancelled) and store the incoming message in `pendingNextTask` (superseding any earlier queued request).
     2. **Do not start Request B or mutate `SolverWorkspace` or `loadedBundle` while Request A is still suspended.**
     3. When Request A resumes from its yield, its very first check observes `myEpoch !== activeTaskEpoch`, immediately aborts without writing to `SolverWorkspace`, resolves Request A as `{ status: 'cancelled' }`, and releases the workspace lock—at which point the worker loop dequeues and starts `pendingNextTask`.
2. **Unified Request Deadline Across Initialization, Search & Metrics:**
   - Record `t_requestStart = performance.now()` at the entry of `calculateRoutes` (once it acquires the workspace lock) and set `t_deadline = t_requestStart + timeoutMs` (default $5000\text{ ms}$).
   - Lazy connected-component labeling (`componentId`), each policy's A* loop, and post-solve metric/profile construction all check `performance.now() > t_deadline` against that single shared request deadline.
