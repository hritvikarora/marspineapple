import { describe, expect, it } from 'vitest';
import {
  QUALITY_CODE,
  type ConstraintProfile,
  type PolicyWeightVector,
  type QualityMode,
  type RegionRoutingBundle,
} from '../../src/contracts/routing.js';
import {
  DIR_COUNT,
  DIR_DC,
  DIR_DR,
  DIR_IS_DIAG,
  NOMINAL_POLICY_WEIGHTS,
  QUALITY_PENALTY_BY_CODE,
  type EdgeEvaluatorPort,
  type SolverWorkspacePort,
} from '../../src/routing/types.js';
import { solveAStar } from '../../src/routing/astar.js';

const DEFAULT_PROFILE: ConstraintProfile = {
  profileId: 'educational-eva-v1',
  version: '1.0.0',
  maxTerrainSlopeDeg: 20,
  maxRouteGradeDeg: 20,
  roughnessScaleM: 0.5,
  nominalWalkingSpeedMps: 0.5,
  gradePenaltyKappa: 1.5,
  isSimulatedAssumption: true,
};

function createWorkspace(capacity: number): SolverWorkspacePort {
  const heapPos = new Int32Array(capacity);
  heapPos.fill(-1);
  const componentId = new Int32Array(capacity);
  componentId.fill(-1);

  return {
    capacity,
    currentSearchId: 0,
    gScore: new Float64Array(capacity),
    fScore: new Float64Array(capacity),
    crossScore: new Float64Array(capacity),
    parentIndex: new Int32Array(capacity),
    seenStamp: new Uint32Array(capacity),
    closedStamp: new Uint32Array(capacity),
    heapNodes: new Int32Array(capacity),
    heapPos,
    componentId,
    adjMask: new Uint8Array(capacity),
    bfsQueue: new Int32Array(capacity),
    beginSearch(): number {
      this.currentSearchId = (this.currentSearchId + 1) >>> 0;
      if (this.currentSearchId === 0) {
        this.seenStamp.fill(0);
        this.closedStamp.fill(0);
        this.currentSearchId = 1;
      }
      return this.currentSearchId;
    },
  };
}

function createFlatBundle(
  width: number,
  height: number,
  dx: number,
  dy: number,
  elevationValue = -2540.0
): RegionRoutingBundle {
  const n = width * height;
  const elevationM = new Float32Array(n).fill(elevationValue);
  const terrainSlopeDeg = new Float32Array(n).fill(0);
  const roughnessNormalized = new Float32Array(n).fill(0);
  const qualityCode = new Uint8Array(n).fill(QUALITY_CODE.ACCEPTABLE);

  return {
    regionId: 'jezero-test',
    datasetVersion: '1.0.0',
    gridWidth: width,
    gridHeight: height,
    cellSpacingEastM: dx,
    cellSpacingNorthM: dy,
    noDataSentinel: -32768,
    roughnessScaleM: 0.5,
    qualityMappingVersion: 'fom-mapping-v1',
    elevationM,
    terrainSlopeDeg,
    roughnessNormalized,
    qualityCode,
  };
}

function isCellAdmissibleLocal(
  bundle: RegionRoutingBundle,
  row: number,
  col: number,
  profile: ConstraintProfile,
  qualityMode: QualityMode
): boolean {
  if (row < 0 || row >= bundle.gridHeight || col < 0 || col >= bundle.gridWidth) {
    return false;
  }
  const k = row * bundle.gridWidth + col;
  const z = bundle.elevationM[k];
  if (!Number.isFinite(z) || Math.abs(z - bundle.noDataSentinel) <= 1e-5) {
    return false;
  }
  const q = bundle.qualityCode[k];
  if (q === QUALITY_CODE.INVALID || q < 0 || q > 2) {
    return false;
  }
  if (bundle.explicitExclusionMask && bundle.explicitExclusionMask[k] === 1) {
    return false;
  }
  const s = bundle.terrainSlopeDeg[k];
  const r = bundle.roughnessNormalized[k];
  if (
    (bundle.derivativeSupportMask && bundle.derivativeSupportMask[k] === 0) ||
    !Number.isFinite(s) ||
    !Number.isFinite(r)
  ) {
    return false;
  }
  if (s > profile.maxTerrainSlopeDeg) {
    return false;
  }
  if (qualityMode === 'strict' && q !== QUALITY_CODE.ACCEPTABLE) {
    return false;
  }
  return true;
}

function createStandardEdgeEvaluator(): EdgeEvaluatorPort {
  return {
    isEdgeAdmissible(bundle, uIndex, vIndex, dir, profile, qualityMode): boolean {
      const w = bundle.gridWidth;
      const uRow = Math.floor(uIndex / w);
      const uCol = uIndex - uRow * w;
      const vRow = Math.floor(vIndex / w);
      const vCol = vIndex - vRow * w;

      if (!isCellAdmissibleLocal(bundle, uRow, uCol, profile, qualityMode)) return false;
      if (!isCellAdmissibleLocal(bundle, vRow, vCol, profile, qualityMode)) return false;

      if (DIR_IS_DIAG[dir] === 1) {
        if (!isCellAdmissibleLocal(bundle, uRow, vCol, profile, qualityMode)) return false;
        if (!isCellAdmissibleLocal(bundle, vRow, uCol, profile, qualityMode)) return false;
      }

      const dx = bundle.cellSpacingEastM;
      const dy = bundle.cellSpacingNorthM;
      const d = DIR_IS_DIAG[dir] === 1 ? Math.hypot(dx, dy) : DIR_DR[dir] !== 0 ? dy : dx;
      const dz = bundle.elevationM[vIndex] - bundle.elevationM[uIndex];
      const maxGrade =
        dz > 0
          ? (profile.maxUphillGradeDeg ?? profile.maxRouteGradeDeg)
          : dz < 0
            ? (profile.maxDownhillGradeDeg ?? profile.maxRouteGradeDeg)
            : profile.maxRouteGradeDeg;
      const gradeDeg = Math.atan(Math.abs(dz) / d) * (180 / Math.PI);
      return gradeDeg <= maxGrade + 1e-12;
    },

    computeEdgeCost(bundle, uIndex, vIndex, dir, profile, weights): number {
      const w = bundle.gridWidth;
      const uRow = Math.floor(uIndex / w);
      const uCol = uIndex - uRow * w;
      const vRow = Math.floor(vIndex / w);
      const vCol = vIndex - vRow * w;

      const dx = bundle.cellSpacingEastM;
      const dy = bundle.cellSpacingNorthM;
      const d = DIR_IS_DIAG[dir] === 1 ? Math.hypot(dx, dy) : DIR_DR[dir] !== 0 ? dy : dx;

      const S = Math.max(bundle.terrainSlopeDeg[uIndex], bundle.terrainSlopeDeg[vIndex]) / profile.maxTerrainSlopeDeg;
      const R = Math.max(0, Math.min(1, Math.max(bundle.roughnessNormalized[uIndex], bundle.roughnessNormalized[vIndex])));

      const uQ = QUALITY_PENALTY_BY_CODE[bundle.qualityCode[uIndex] as 0 | 1 | 2] ?? Number.POSITIVE_INFINITY;
      const vQ = QUALITY_PENALTY_BY_CODE[bundle.qualityCode[vIndex] as 0 | 1 | 2] ?? Number.POSITIVE_INFINITY;
      let U = Math.max(uQ, vQ);

      if (DIR_IS_DIAG[dir] === 1) {
        const w1Q = QUALITY_PENALTY_BY_CODE[bundle.qualityCode[uRow * w + vCol] as 0 | 1 | 2] ?? Number.POSITIVE_INFINITY;
        const w2Q = QUALITY_PENALTY_BY_CODE[bundle.qualityCode[vRow * w + uCol] as 0 | 1 | 2] ?? Number.POSITIVE_INFINITY;
        U = Math.max(U, w1Q, w2Q);
      }

      return d * (1 + weights.alpha * S + weights.beta * R + weights.gamma * U);
    },
  };
}

function buildAdjacencyMask(
  bundle: RegionRoutingBundle,
  profile: ConstraintProfile,
  qualityMode: QualityMode,
  edgeEvaluator: EdgeEvaluatorPort
): Uint8Array {
  const w = bundle.gridWidth;
  const h = bundle.gridHeight;
  const mask = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const u = r * w + c;
      let bits = 0;
      for (let dir = 0; dir < DIR_COUNT; dir++) {
        const vr = r + DIR_DR[dir];
        const vc = c + DIR_DC[dir];
        if (vr < 0 || vr >= h || vc < 0 || vc >= w) continue;
        const v = vr * w + vc;
        if (edgeEvaluator.isEdgeAdmissible(bundle, u, v, dir, profile, qualityMode)) {
          bits |= 1 << dir;
        }
      }
      mask[u] = bits;
    }
  }
  return mask;
}

function runInlineDijkstra(
  bundle: RegionRoutingBundle,
  startIndex: number,
  goalIndex: number,
  profile: ConstraintProfile,
  qualityMode: QualityMode,
  weights: PolicyWeightVector,
  edgeEvaluator: EdgeEvaluatorPort
): { status: 'success' | 'no_path'; totalCost: number; exploredNodes: number } {
  const w = bundle.gridWidth;
  const h = bundle.gridHeight;
  const n = w * h;
  const dist = new Float64Array(n).fill(Number.POSITIVE_INFINITY);
  const visited = new Uint8Array(n);
  dist[startIndex] = 0;
  let exploredNodes = 0;

  while (true) {
    let u = -1;
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < n; i++) {
      if (!visited[i] && dist[i] < best) {
        best = dist[i];
        u = i;
      }
    }
    if (u === -1) {
      return { status: 'no_path', totalCost: Number.POSITIVE_INFINITY, exploredNodes };
    }
    visited[u] = 1;
    exploredNodes++;
    if (u === goalIndex) {
      return { status: 'success', totalCost: dist[goalIndex], exploredNodes };
    }
    const ur = Math.floor(u / w);
    const uc = u - ur * w;
    for (let dir = 0; dir < DIR_COUNT; dir++) {
      const vr = ur + DIR_DR[dir];
      const vc = uc + DIR_DC[dir];
      if (vr < 0 || vr >= h || vc < 0 || vc >= w) continue;
      const v = vr * w + vc;
      if (visited[v]) continue;
      if (!edgeEvaluator.isEdgeAdmissible(bundle, u, v, dir, profile, qualityMode)) continue;
      const cand = dist[u] + edgeEvaluator.computeEdgeCost(bundle, u, v, dir, profile, weights);
      if (cand < dist[v]) {
        dist[v] = cand;
      }
    }
  }
}

describe('T17 Deterministic 8-Neighbor A* Search Engine', () => {
  const edgeEvaluator = createStandardEdgeEvaluator();

  it('handles same-cell requests immediately with zero cost and zero explored nodes', () => {
    const bundle = createFlatBundle(5, 5, 5, 5);
    const ws = createWorkspace(25);
    const result = solveAStar({
      bundle,
      workspace: ws,
      startIndex: 12,
      goalIndex: 12,
      profile: DEFAULT_PROFILE,
      qualityMode: 'prefer',
      weights: NOMINAL_POLICY_WEIGHTS.shortest,
      edgeEvaluator,
    });

    expect(result).toEqual({
      status: 'success',
      cellIndices: [12],
      totalCost: 0,
      exploredNodes: 0,
    });
    expect(ws.currentSearchId).toBe(0);
  });

  it('solves F01A flat cardinal, F01B pure diagonal, and F01C octile mix exactly', () => {
    const bundle = createFlatBundle(5, 5, 5, 5, -2540.0);
    const ws = createWorkspace(25);

    // F01A: (2,0) -> (2,4)
    const cardinal = solveAStar({
      bundle,
      workspace: ws,
      startIndex: 2 * 5 + 0,
      goalIndex: 2 * 5 + 4,
      profile: DEFAULT_PROFILE,
      qualityMode: 'prefer',
      weights: NOMINAL_POLICY_WEIGHTS.shortest,
      edgeEvaluator,
    });
    expect(cardinal.status).toBe('success');
    expect(cardinal.cellIndices).toEqual([10, 11, 12, 13, 14]);
    expect(cardinal.totalCost).toBeCloseTo(20.0, 9);

    // F01B: (4,0) -> (0,4)
    const diag = solveAStar({
      bundle,
      workspace: ws,
      startIndex: 4 * 5 + 0,
      goalIndex: 0 * 5 + 4,
      profile: DEFAULT_PROFILE,
      qualityMode: 'prefer',
      weights: NOMINAL_POLICY_WEIGHTS.terrain,
      edgeEvaluator,
    });
    expect(diag.status).toBe('success');
    expect(diag.cellIndices).toEqual([20, 16, 12, 8, 4]);
    expect(diag.totalCost).toBeCloseTo(20 * Math.SQRT2, 9);

    // F01C: (4,0) -> (2,4)
    const octile = solveAStar({
      bundle,
      workspace: ws,
      startIndex: 4 * 5 + 0,
      goalIndex: 2 * 5 + 4,
      profile: DEFAULT_PROFILE,
      qualityMode: 'prefer',
      weights: NOMINAL_POLICY_WEIGHTS.uncertainty,
      edgeEvaluator,
    });
    expect(octile.status).toBe('success');
    expect(octile.totalCost).toBeCloseTo(10 * Math.SQRT2 + 10, 9);
    const dijkstra = runInlineDijkstra(
      bundle,
      20,
      14,
      DEFAULT_PROFILE,
      'prefer',
      NOMINAL_POLICY_WEIGHTS.uncertainty,
      edgeEvaluator
    );
    expect(octile.exploredNodes).toBeLessThanOrEqual(dijkstra.exploredNodes);
  });

  it('solves F02 wall barrier with 1-cell gap enforcing no-corner-cutting', () => {
    const bundle = createFlatBundle(5, 5, 10, 10, -2540.0);
    for (let r = 1; r <= 4; r++) {
      bundle.elevationM[r * 5 + 2] = bundle.noDataSentinel;
    }
    const ws = createWorkspace(25);
    const result = solveAStar({
      bundle,
      workspace: ws,
      startIndex: 2 * 5 + 0,
      goalIndex: 2 * 5 + 4,
      profile: DEFAULT_PROFILE,
      qualityMode: 'prefer',
      weights: NOMINAL_POLICY_WEIGHTS.shortest,
      edgeEvaluator,
    });

    expect(result.status).toBe('success');
    expect(result.cellIndices).toEqual([10, 5, 1, 2, 3, 9, 14]);
    // Must pass cardinally through the open gap (0,1) -> (0,2) -> (0,3) without cutting corners.
    expect(result.cellIndices.slice(2, 5)).toEqual([1, 2, 3]);
    expect(result.totalCost).toBeCloseTo(40 + 20 * Math.SQRT2, 9);
    const dijk = runInlineDijkstra(
      bundle,
      10,
      14,
      DEFAULT_PROFILE,
      'prefer',
      NOMINAL_POLICY_WEIGHTS.shortest,
      edgeEvaluator
    );
    expect(Math.abs(result.totalCost - dijk.totalCost)).toBeLessThanOrEqual(1e-7);
    expect(result.exploredNodes).toBeLessThanOrEqual(dijk.exploredNodes);
  });

  it('handles F03A single blocked corner and F03B double pinch no_path', () => {
    const bundle = createFlatBundle(3, 3, 5, 5);
    bundle.elevationM[0 * 3 + 1] = bundle.noDataSentinel; // (0,1)
    const ws = createWorkspace(9);

    const f03a = solveAStar({
      bundle,
      workspace: ws,
      startIndex: 1 * 3 + 1, // (1,1) = 4
      goalIndex: 0 * 3 + 2,  // (0,2) = 2
      profile: DEFAULT_PROFILE,
      qualityMode: 'prefer',
      weights: NOMINAL_POLICY_WEIGHTS.shortest,
      edgeEvaluator,
    });
    expect(f03a.status).toBe('success');
    expect(f03a.cellIndices).toEqual([4, 5, 2]);
    expect(f03a.totalCost).toBeCloseTo(10.0, 9);

    // Block (1,2) as well -> F03B
    bundle.elevationM[1 * 3 + 2] = bundle.noDataSentinel;
    const f03b = solveAStar({
      bundle,
      workspace: ws,
      startIndex: 4,
      goalIndex: 2,
      profile: DEFAULT_PROFILE,
      qualityMode: 'prefer',
      weights: NOMINAL_POLICY_WEIGHTS.shortest,
      edgeEvaluator,
    });
    expect(f03b.status).toBe('no_path');
    expect(f03b.cellIndices).toEqual([]);
  });

  it('routes weighted detours across F06 (corner quality) and F08 (3-way policy split) matching Dijkstra', () => {
    // F06: 3x5 grid, dx=dy=10m, (1,2) has LOW quality
    const f06 = createFlatBundle(5, 3, 10, 10);
    f06.qualityCode[1 * 5 + 2] = QUALITY_CODE.LOW;
    const wsF06 = createWorkspace(15);

    const f06Terrain = solveAStar({
      bundle: f06,
      workspace: wsF06,
      startIndex: 5,
      goalIndex: 9,
      profile: DEFAULT_PROFILE,
      qualityMode: 'prefer',
      weights: NOMINAL_POLICY_WEIGHTS.terrain,
      edgeEvaluator,
    });
    expect(f06Terrain.cellIndices).toEqual([5, 6, 7, 8, 9]);
    expect(f06Terrain.totalCost).toBeCloseTo(40.0, 9);

    const f06Unc = solveAStar({
      bundle: f06,
      workspace: wsF06,
      startIndex: 5,
      goalIndex: 9,
      profile: DEFAULT_PROFILE,
      qualityMode: 'prefer',
      weights: NOMINAL_POLICY_WEIGHTS.uncertainty,
      edgeEvaluator,
    });
    expect(f06Unc.cellIndices).toEqual([5, 1, 2, 3, 9]);
    expect(f06Unc.totalCost).toBeCloseTo(20 + 20 * Math.SQRT2, 9);

    // F08: 5x5 grid, dx=dy=10m
    const f08 = createFlatBundle(5, 5, 10, 10);
    // Middle corridor r=2: c=1,2,3 have slope 15 deg, roughness 0.5
    for (const c of [1, 2, 3]) {
      f08.terrainSlopeDeg[2 * 5 + c] = 15;
      f08.roughnessNormalized[2 * 5 + c] = 0.5;
    }
    // North half c=2: (0,2) and (1,2) LOW quality
    f08.qualityCode[0 * 5 + 2] = QUALITY_CODE.LOW;
    f08.qualityCode[1 * 5 + 2] = QUALITY_CODE.LOW;
    // South half c=2: (3,2) and (4,2) gentle slope 5 deg
    f08.terrainSlopeDeg[3 * 5 + 2] = 5;
    f08.terrainSlopeDeg[4 * 5 + 2] = 5;

    const wsF08 = createWorkspace(25);
    const policies: Array<[PolicyWeightVector, number[], number]> = [
      [NOMINAL_POLICY_WEIGHTS.shortest, [10, 11, 12, 13, 14], 40.0],
      [NOMINAL_POLICY_WEIGHTS.terrain, [10, 6, 7, 8, 14], 20 + 20 * Math.SQRT2],
      [NOMINAL_POLICY_WEIGHTS.uncertainty, [10, 16, 17, 18, 14], 30 + 20 * Math.SQRT2],
    ];

    for (const [weights, expectedPath, expectedCost] of policies) {
      const astar = solveAStar({
        bundle: f08,
        workspace: wsF08,
        startIndex: 10,
        goalIndex: 14,
        profile: DEFAULT_PROFILE,
        qualityMode: 'prefer',
        weights,
        edgeEvaluator,
      });
      const dijk = runInlineDijkstra(f08, 10, 14, DEFAULT_PROFILE, 'prefer', weights, edgeEvaluator);

      expect(astar.status).toBe('success');
      expect(astar.cellIndices).toEqual(expectedPath);
      expect(astar.totalCost).toBeCloseTo(expectedCost, 7);
      expect(Math.abs(astar.totalCost - dijk.totalCost)).toBeLessThanOrEqual(1e-7);
      expect(astar.exploredNodes).toBeLessThanOrEqual(dijk.exploredNodes);
    }
  });

  it('terminates only when goal is popped from the heap, not on neighbor discovery (4-node counterexample)', () => {
    // 1x4 grid: index 0 (start), index 1 (a), index 2 (b), index 3 (goal)
    const bundle = createFlatBundle(4, 1, 5, 5);
    const ws = createWorkspace(4);

    // Custom graph where s(0)->a(1) cost=5, a(1)->g(3) cost=30 (total 35),
    // s(0)->b(2) cost=6, b(2)->g(3) cost=6 (total 12), and h(1)=5, h(2)=5 if we map indices carefully.
    // Let's use a 3x3 grid with dx=dy=5m:
    // Start s = (1,0)=3, Goal g = (1,2)=5
    // Neighbor a = (0,1)=1 (dist to g = sqrt(5^2 + 5^2) = 5*sqrt(2)), Neighbor b = (2,1)=7 (same h).
    // Give (3->1) cost 5, (1->5) cost 30; (3->7) cost 6, (7->5) cost 6; block all other edges.
    const grid3x3 = createFlatBundle(3, 3, 5, 5);
    const ws3x3 = createWorkspace(9);
    const customEvaluator: EdgeEvaluatorPort = {
      isEdgeAdmissible(_b, u, v): boolean {
        const pair = `${u}->${v}`;
        return pair === '3->1' || pair === '1->5' || pair === '3->7' || pair === '7->5';
      },
      computeEdgeCost(_b, u, v): number {
        const pair = `${u}->${v}`;
        if (pair === '3->1') return 5;
        if (pair === '1->5') return 30;
        if (pair === '3->7') return 6;
        if (pair === '7->5') return 6;
        return 1000;
      },
    };

    const result = solveAStar({
      bundle: grid3x3,
      workspace: ws3x3,
      startIndex: 3,
      goalIndex: 5,
      profile: DEFAULT_PROFILE,
      qualityMode: 'prefer',
      weights: NOMINAL_POLICY_WEIGHTS.shortest,
      edgeEvaluator: customEvaluator,
    });

    expect(result.status).toBe('success');
    expect(result.cellIndices).toEqual([3, 7, 5]);
    expect(result.totalCost).toBeCloseTo(12, 9);
  });

  it('uses precomputed adjMask without calling isEdgeAdmissible and matches rectangular grids', () => {
    // F11B rectangular grid: 5x5, dx=20m, dy=5m; (3,0)=15 -> (0,1)=1
    const rect = createFlatBundle(5, 5, 20, 5);
    const ws = createWorkspace(25);
    const adjMask = buildAdjacencyMask(rect, DEFAULT_PROFILE, 'prefer', edgeEvaluator);

    let admissibleCalls = 0;
    const spyEvaluator: EdgeEvaluatorPort = {
      isEdgeAdmissible(bundle, u, v, dir, profile, qualityMode): boolean {
        admissibleCalls++;
        return edgeEvaluator.isEdgeAdmissible(bundle, u, v, dir, profile, qualityMode);
      },
      computeEdgeCost(bundle, u, v, dir, profile, weights): number {
        return edgeEvaluator.computeEdgeCost(bundle, u, v, dir, profile, weights);
      },
    };

    const res = solveAStar({
      bundle: rect,
      workspace: ws,
      startIndex: 15,
      goalIndex: 1,
      profile: DEFAULT_PROFILE,
      qualityMode: 'prefer',
      weights: NOMINAL_POLICY_WEIGHTS.shortest,
      edgeEvaluator: spyEvaluator,
      adjMask,
    });

    expect(admissibleCalls).toBe(0);
    expect(res.status).toBe('success');
    expect(res.totalCost).toBeCloseTo(Math.hypot(20, 5) + 10, 9);
  });

  it('handles immediate and mid-search cancellation and timeout while leaving heapPos clean', () => {
    const bundle = createFlatBundle(10, 10, 5, 5);
    const ws = createWorkspace(100);

    const immediateCancelled = solveAStar({
      bundle,
      workspace: ws,
      startIndex: 0,
      goalIndex: 99,
      profile: DEFAULT_PROFILE,
      qualityMode: 'prefer',
      weights: NOMINAL_POLICY_WEIGHTS.shortest,
      edgeEvaluator,
      isCancelled: () => true,
    });
    expect(immediateCancelled.status).toBe('cancelled');
    expect(immediateCancelled.cellIndices).toEqual([]);
    expect(immediateCancelled.exploredNodes).toBe(0);
    expect(Array.from(ws.heapPos).every((p) => p === -1)).toBe(true);

    const immediateTimedOut = solveAStar({
      bundle,
      workspace: ws,
      startIndex: 0,
      goalIndex: 99,
      profile: DEFAULT_PROFILE,
      qualityMode: 'prefer',
      weights: NOMINAL_POLICY_WEIGHTS.shortest,
      edgeEvaluator,
      isTimedOut: () => true,
    });
    expect(immediateTimedOut.status).toBe('timeout');
    expect(immediateTimedOut.cellIndices).toEqual([]);
    expect(immediateTimedOut.exploredNodes).toBe(0);
    expect(Array.from(ws.heapPos).every((p) => p === -1)).toBe(true);

    let cancelChecks = 0;
    const midCancelled = solveAStar({
      bundle,
      workspace: ws,
      startIndex: 0,
      goalIndex: 99,
      profile: DEFAULT_PROFILE,
      qualityMode: 'prefer',
      weights: NOMINAL_POLICY_WEIGHTS.shortest,
      edgeEvaluator,
      isCancelled: () => ++cancelChecks > 3,
    });
    expect(midCancelled.status).toBe('cancelled');
    expect(midCancelled.exploredNodes).toBe(2);
    expect(Array.from(ws.heapPos).every((p) => p === -1)).toBe(true);

    let timeoutChecks = 0;
    const midTimedOut = solveAStar({
      bundle,
      workspace: ws,
      startIndex: 0,
      goalIndex: 99,
      profile: DEFAULT_PROFILE,
      qualityMode: 'prefer',
      weights: NOMINAL_POLICY_WEIGHTS.shortest,
      edgeEvaluator,
      isTimedOut: () => ++timeoutChecks > 4,
    });
    expect(midTimedOut.status).toBe('timeout');
    expect(midTimedOut.exploredNodes).toBe(3);
    expect(Array.from(ws.heapPos).every((p) => p === -1)).toBe(true);

    // Subsequent solve in the exact same workspace still succeeds cleanly.
    const recovered = solveAStar({
      bundle,
      workspace: ws,
      startIndex: 0,
      goalIndex: 99,
      profile: DEFAULT_PROFILE,
      qualityMode: 'prefer',
      weights: NOMINAL_POLICY_WEIGHTS.shortest,
      edgeEvaluator,
    });
    expect(recovered.status).toBe('success');
    expect(recovered.totalCost).toBeCloseTo(9 * Math.hypot(5, 5), 9);
    expect(Array.from(ws.heapPos).every((p) => p === -1)).toBe(true);
  });

  it('throws if workspace capacity is smaller than bundle cell count', () => {
    const bundle = createFlatBundle(5, 5, 5, 5);
    const smallWs = createWorkspace(10);
    expect(() =>
      solveAStar({
        bundle,
        workspace: smallWs,
        startIndex: 0,
        goalIndex: 24,
        profile: DEFAULT_PROFILE,
        qualityMode: 'prefer',
        weights: NOMINAL_POLICY_WEIGHTS.shortest,
        edgeEvaluator,
      })
    ).toThrow(RangeError);
  });

  it('matches reference Dijkstra cost and explores <= nodes on a 20x20 mixed terrain/barrier grid', () => {
    const w = 20;
    const h = 20;
    const bundle = createFlatBundle(w, h, 10, 10, -2540);
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const k = r * w + c;
        bundle.terrainSlopeDeg[k] = ((r * 3 + c * 5) % 19);
        bundle.roughnessNormalized[k] = ((r + c * 2) % 10) / 10;
        bundle.qualityCode[k] = ((r + c) % 3) as 0 | 1 | 2;
      }
    }
    // Add a ridge barrier leaving two gaps
    for (let r = 2; r < 18; r++) {
      if (r !== 6 && r !== 14) {
        bundle.terrainSlopeDeg[r * w + 10] = 25;
      }
    }
    const ws = createWorkspace(w * h);
    const startIndex = 10 * w + 1;
    const goalIndex = 10 * w + 18;

    for (const weights of [
      NOMINAL_POLICY_WEIGHTS.shortest,
      NOMINAL_POLICY_WEIGHTS.terrain,
      NOMINAL_POLICY_WEIGHTS.uncertainty,
    ]) {
      const astar = solveAStar({
        bundle,
        workspace: ws,
        startIndex,
        goalIndex,
        profile: DEFAULT_PROFILE,
        qualityMode: 'prefer',
        weights,
        edgeEvaluator,
      });
      const dijk = runInlineDijkstra(bundle, startIndex, goalIndex, DEFAULT_PROFILE, 'prefer', weights, edgeEvaluator);

      expect(astar.status).toBe('success');
      expect(astar.status).toBe(dijk.status);
      expect(Math.abs(astar.totalCost - dijk.totalCost)).toBeLessThanOrEqual(1e-7);
      expect(astar.exploredNodes).toBeLessThanOrEqual(dijk.exploredNodes);

      // Independently audit every edge and recompute exact edge cost sum.
      let recomputedCost = 0;
      for (let i = 1; i < astar.cellIndices.length; i++) {
        const u = astar.cellIndices[i - 1];
        const v = astar.cellIndices[i];
        const dr = Math.floor(v / w) - Math.floor(u / w);
        const dc = (v % w) - (u % w);
        let foundDir = -1;
        for (let d = 0; d < DIR_COUNT; d++) {
          if (DIR_DR[d] === dr && DIR_DC[d] === dc) {
            foundDir = d;
            break;
          }
        }
        expect(foundDir).toBeGreaterThanOrEqual(0);
        expect(edgeEvaluator.isEdgeAdmissible(bundle, u, v, foundDir, DEFAULT_PROFILE, 'prefer')).toBe(true);
        recomputedCost += edgeEvaluator.computeEdgeCost(bundle, u, v, foundDir, DEFAULT_PROFILE, weights);
      }
      expect(Math.abs(recomputedCost - astar.totalCost)).toBeLessThanOrEqual(1e-9);
    }
  });
});
