import { describe, expect, it } from 'vitest';
import {
  AsyncWorkspaceMutex,
  BinaryMinHeap,
  QUALITY_CODE,
  RoutePlannerClient,
  SolverWorkspace,
  assertAStarMatchesDijkstra,
  buildDraped3DRoutePolyline,
  buildElevationSupportMask,
  computeConnectedComponentsAndAdjMask,
  computeEdgeCost,
  computeHornSlopeGrid,
  computePlaneFitRoughnessGrid,
  createDefaultCellAdmissibility,
  createDefaultEdgeEvaluator,
  createDefaultRoutePlannerClient,
  createDefaultRoutingEngine,
  createDefaultWorkerMessageHandler,
  createMaskedElevationGrid,
  createYieldChannel,
  formatQualityDelta,
  hasHigherPriority,
  localMetersToGridPoint,
  resolveConstraintProfile,
  resolveEffectivePolicyWeights,
  solveAStar,
  solveDijkstra,
  verifyPathAdmissibility,
  type ClientWorkerInboundMessage,
  type ClientWorkerOutboundMessage,
  type ConstraintProfileId,
  type PolicyId,
  type QualityMode,
  type RegionRoutingBundle,
  type RouteMetrics,
  type RouteRequest,
  type RouteResponse,
  type WorkerEnginePort,
  type WorkerLike,
} from '../../src/routing/index.js';
import {
  F01_SUBTEST_A_CARDINAL_M,
  F01_SUBTEST_B_DIAGONAL_M,
  F01_SUBTEST_C_OCTILE_M,
  F02_EXPECTED_LENGTH_M,
  F02_GAP_PATH_CELLS,
  F03A_EXPECTED_LENGTH_M,
  F03A_PATH_CELLS,
  F05_DEST_POINT,
  F05_EXPECTED_CELL_INDEX,
  F05_START_POINT,
  F06_CORNER_CLEAR_DETOUR,
  F06_DETOUR_LENGTH_M,
  F06_DIRECT_LENGTH_M,
  F06_DIRECT_LOW_QUALITY_M,
  F06_DIRECT_PATH,
  F08_CORRIDOR_LENGTH_M,
  F08_DEST_POINT,
  F08_MIDDLE_LENGTH_M,
  F08_MIDDLE_PATH,
  F08_NORTH_PATH,
  F08_NORTH_TERRAIN_COST,
  F08_SOUTH_PATH,
  F08_SOUTH_UNCERTAINTY_COST,
  F08_START_POINT,
  F11_SINGLE_DIAG_M,
  F11_SUBTEST_B_EUCLIDEAN_M,
  F11_SUBTEST_B_PATH_M,
  countPassableNeighbors,
  createFixtureF01Bundle,
  createFixtureF02Bundle,
  createFixtureF03SubtestABundle,
  createFixtureF03SubtestBBundle,
  createFixtureF04Bundle,
  createFixtureF05AdmissibleBundle,
  createFixtureF05InterpolatedCenterBundle,
  createFixtureF06Bundle,
  createFixtureF07AInclinedPlane,
  createFixtureF07BDerivedRidgeBundle,
  createFixtureF08Bundle,
  createFixtureF09SubtestACounterexampleBundle,
  createFixtureF09SubtestCMixedUnknownLowBundle,
  createFixtureF10FomSplitBundle,
  createFixtureF10InterpolatedSpikeBundle,
  createFixtureF10LowBarrierBundle,
  createFixtureF11Bundle,
  createFixtureF12SaddleQuadBundle,
  createFixtureF12SensitivityBundle,
} from '../fixtures/routingFixtures.js';

const ALL_POLICIES: PolicyId[] = ['shortest', 'terrain', 'uncertainty'];

function cellCenterMeters(
  bundle: RegionRoutingBundle,
  row: number,
  col: number
): { eastM: number; northM: number } {
  return {
    eastM: (col + 0.5) * bundle.cellSpacingEastM,
    northM: (bundle.gridHeight - 1 - row + 0.5) * bundle.cellSpacingNorthM,
  };
}

function makeRequest(
  bundle: RegionRoutingBundle,
  start: { eastM: number; northM: number },
  destination: { eastM: number; northM: number },
  options: {
    requestId?: string;
    policies?: PolicyId[];
    qualityMode?: QualityMode;
    profileId?: ConstraintProfileId;
    returnToStart?: boolean;
    scienceStopDurationS?: number;
    timeoutMs?: number;
  } = {}
): RouteRequest {
  return {
    requestId: options.requestId ?? `req-${bundle.regionId}`,
    regionId: bundle.regionId,
    datasetVersion: bundle.datasetVersion,
    start,
    destination,
    policies: options.policies ?? ALL_POLICIES,
    qualityMode: options.qualityMode ?? 'prefer',
    profileId: options.profileId ?? 'educational-eva-v1',
    ...(options.returnToStart !== undefined ? { returnToStart: options.returnToStart } : {}),
    ...(options.scienceStopDurationS !== undefined
      ? { scienceStopDurationS: options.scienceStopDurationS }
      : {}),
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
  };
}

function createInMemoryWorkerBridge(engine: WorkerEnginePort): WorkerLike {
  const worker: WorkerLike = {
    onmessage: null,
    onerror: null,
    postMessage(msg: ClientWorkerInboundMessage) {
      queueMicrotask(() => {
        void handler(msg);
      });
    },
  };
  const handler = createDefaultWorkerMessageHandler((outbound) => {
    worker.onmessage?.({ data: outbound as ClientWorkerOutboundMessage });
  }, engine);
  return worker;
}

/**
 * Runs the real default RoutingEngine and compares every requested policy against:
 * 1) Independent Dijkstra oracle (status + cost equality <= 1e-7)
 * 2) Independent path admissibility audit (verifyPathAdmissibility)
 * 3) Direct A* vs Dijkstra node expansion bound (exploredNodes_A* <= exploredNodes_Dijkstra)
 */
function runAndVerifyAgainstOracle(
  bundle: RegionRoutingBundle,
  start: { eastM: number; northM: number },
  destination: { eastM: number; northM: number },
  options: {
    policies?: PolicyId[];
    qualityMode?: QualityMode;
    profileId?: ConstraintProfileId;
    returnToStart?: boolean;
    scienceStopDurationS?: number;
  } = {}
): Extract<RouteResponse, { status: 'success' | 'no_path' }> {
  const engine = createDefaultRoutingEngine();
  const loadRes = engine.loadBundle(bundle);
  expect(loadRes.ok).toBe(true);

  const req = makeRequest(bundle, start, destination, options);
  const res = engine.planRoutes(req);
  expect(res.status === 'success' || res.status === 'no_path').toBe(true);
  if (res.status !== 'success' && res.status !== 'no_path') {
    throw new Error(`Unexpected response status '${res.status}' for ${bundle.regionId}`);
  }

  const profile = resolveConstraintProfile(req.profileId, req.customProfile);
  const cellAdmissibility = createDefaultCellAdmissibility();
  const edgeEvaluator = createDefaultEdgeEvaluator(cellAdmissibility);
  const weightResolution = resolveEffectivePolicyWeights(
    bundle,
    profile,
    req.qualityMode,
    cellAdmissibility
  );

  const startIndex = res.normalizedStart.cellIndex;
  const goalIndex = res.normalizedDestination.cellIndex;
  const workspace = new SolverWorkspace(bundle.gridWidth * bundle.gridHeight);

  for (const policy of req.policies) {
    const effWeights = weightResolution.effectiveWeights[policy].effective;
    const dijkstraRes = solveDijkstra({
      bundle,
      startIndex,
      goalIndex,
      profile,
      qualityMode: req.qualityMode,
      weights: effWeights,
      edgeEvaluator,
    });

    const aStarDirect = solveAStar({
      bundle,
      workspace,
      startIndex,
      goalIndex,
      profile,
      qualityMode: req.qualityMode,
      weights: effWeights,
      edgeEvaluator,
    });

    const aStarAudit = verifyPathAdmissibility({
      bundle,
      cellIndices: aStarDirect.cellIndices,
      expectedStartIndex: startIndex,
      expectedGoalIndex: goalIndex,
      profile,
      qualityMode: req.qualityMode,
      weights: effWeights,
      cellAdmissibility,
      edgeEvaluator,
    });

    assertAStarMatchesDijkstra(aStarDirect, dijkstraRes, aStarAudit);

    if (res.status === 'no_path') {
      expect(dijkstraRes.status).toBe('no_path');
    } else {
      const candidate = res.candidates.find((c) => c.matchedPolicies.includes(policy));
      expect(candidate).toBeDefined();
      if (!candidate) continue;

      const engineAudit = verifyPathAdmissibility({
        bundle,
        cellIndices: candidate.cellIndices,
        expectedStartIndex: startIndex,
        expectedGoalIndex: goalIndex,
        profile,
        qualityMode: req.qualityMode,
        weights: effWeights,
        cellAdmissibility,
        edgeEvaluator,
      });

      expect(engineAudit.valid).toBe(true);
      expect(dijkstraRes.status).toBe('success');
      expect(Math.abs(engineAudit.recomputedCost - dijkstraRes.totalCost)).toBeLessThanOrEqual(
        1e-7
      );
      expect(candidate.exploredNodes).toBeLessThanOrEqual(dijkstraRes.exploredNodes);
    }
  }

  return res;
}

function createSyntheticJezero200Bundle(): RegionRoutingBundle {
  const width = 200;
  const height = 200;
  const n = width * height;
  const dx = 10;
  const dy = 10;
  const elevationM = new Float32Array(n);
  const terrainSlopeDeg = new Float32Array(n);
  const roughnessNormalized = new Float32Array(n);
  const qualityCode = new Uint8Array(n).fill(QUALITY_CODE.ACCEPTABLE);
  const derivativeSupportMask = new Uint8Array(n).fill(1);
  const explicitExclusionMask = new Uint8Array(n);

  // Build realistic deterministic Western Jezero crater floor:
  // - Smooth rolling elevation around -2540 m with gentle sinusoidal topography
  // - East-west middle corridor (rows 95..105) with moderate slope (~14 deg) & roughness
  // - Northern band (rows 55..85) flat & smooth, but with LOW quality corridor in cols 80..120
  // - Southern band (rows 115..135) gentle 5 deg slope with ACCEPTABLE quality (triggers 3-way split!)
  // - Impassable crater basin wall enclosing rows 155..175, cols 155..175 (slope 28 deg wall, 0 deg interior)
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const k = r * width + c;
      elevationM[k] = -2540.0 + 1.5 * Math.sin(r * 0.08) + 1.2 * Math.cos(c * 0.07);

      let slope = 2.0 + 2.0 * Math.abs(Math.sin((r + c) * 0.05));
      let rough = 0.08 + 0.07 * Math.abs(Math.cos(r * 0.11 - c * 0.09));

      // Moderate ridge band along center rows 92..108, cols 40..150
      if (r >= 92 && r <= 108 && c >= 40 && c <= 150) {
        slope = 14.5;
        rough = 0.45;
      }

      // Northern smooth band rows 65..88, cols 45..145 with LOW quality zone in cols 85..115
      if (r >= 65 && r <= 88 && c >= 45 && c <= 145) {
        slope = 0.5;
        rough = 0.02;
        if (c >= 85 && c <= 115) {
          qualityCode[k] = QUALITY_CODE.LOW;
        }
      }

      // Southern gentle band rows 112..135, cols 45..145 (slope 4 deg in cols 85..115)
      if (r >= 112 && r <= 135 && c >= 45 && c <= 145) {
        slope = c >= 85 && c <= 115 ? 4.5 : 1.0;
        rough = 0.05;
        qualityCode[k] = QUALITY_CODE.ACCEPTABLE;
      }

      // Scattered UNKNOWN patches outside the main bands for realistic quality variation
      if (r >= 20 && r <= 45 && c >= 120 && c <= 170) {
        qualityCode[k] = QUALITY_CODE.UNKNOWN;
      }

      // Walled crater basin enclosing interior (160..170, 160..170) with 28 deg cliff ring
      const inOuterBasin = r >= 156 && r <= 174 && c >= 156 && c <= 174;
      const inInnerBasin = r >= 159 && r <= 171 && c >= 159 && c <= 171;
      if (inOuterBasin && !inInnerBasin) {
        slope = 28.0;
        rough = 0.85;
      } else if (inInnerBasin) {
        slope = 0.0;
        rough = 0.0;
        qualityCode[k] = QUALITY_CODE.ACCEPTABLE;
      }

      terrainSlopeDeg[k] = slope;
      roughnessNormalized[k] = rough;
    }
  }

  return {
    regionId: 'western-jezero-200x200-synth',
    datasetVersion: 'bench-v1',
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
    derivativeSupportMask,
    explicitExclusionMask,
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

describe('T40: Public Assembly, Full F01-F12 Cross-Module Conformance & 200x200 Benchmark', () => {
  it('Protocol Check #5: Strict weak ordering comparator and permutation-invariant BinaryMinHeap extraction', () => {
    // Micro-spaced triple: A=(f=10, g=1), B=(f=10 + 0.75e-9, g=2), C=(f=10 + 1.50e-9, g=3)
    const fScore = new Float64Array([10, 10 + 0.75e-9, 10 + 1.5e-9]);
    const gScore = new Float64Array([1, 2, 3]);
    const crossScore = new Float64Array([0, 0, 0]);

    // Irreflexivity
    for (const i of [0, 1, 2]) {
      expect(hasHigherPriority(i, i, fScore, gScore, crossScore)).toBe(false);
    }
    // Asymmetry & strict transitivity: A < B < C and A < C
    expect(hasHigherPriority(0, 1, fScore, gScore, crossScore)).toBe(true);
    expect(hasHigherPriority(1, 0, fScore, gScore, crossScore)).toBe(false);
    expect(hasHigherPriority(1, 2, fScore, gScore, crossScore)).toBe(true);
    expect(hasHigherPriority(2, 1, fScore, gScore, crossScore)).toBe(false);
    expect(hasHigherPriority(0, 2, fScore, gScore, crossScore)).toBe(true);
    expect(hasHigherPriority(2, 0, fScore, gScore, crossScore)).toBe(false);

    const permutations = [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0],
    ];
    for (const perm of permutations) {
      const heapNodes = new Int32Array(3);
      const heapPos = new Int32Array(3).fill(-1);
      const heap = new BinaryMinHeap(heapNodes, heapPos, fScore, gScore, crossScore);
      for (const n of perm) {
        heap.pushOrDecreaseKey(n);
      }
      expect([heap.popMin(), heap.popMin(), heap.popMin()]).toEqual([0, 1, 2]);
    }
  });

  it('F01 & F02: Integrated engine matches Dijkstra oracle on negative elevations, 8-neighbor geometry, and 1-cell wall gap', () => {
    const f01 = createFixtureF01Bundle();

    // F01A: Cardinal East (2,0) -> (2,4)
    const r01a = runAndVerifyAgainstOracle(
      f01,
      cellCenterMeters(f01, 2, 0),
      cellCenterMeters(f01, 2, 4)
    );
    expect(r01a.status).toBe('success');
    if (r01a.status === 'success') {
      expect(r01a.equivalenceTopology).toBe('case_1_all_three_merged');
      expect(r01a.candidates[0].cellIndices).toEqual([10, 11, 12, 13, 14]);
      expect(r01a.candidates[0].metrics.horizontalDistanceM).toBeCloseTo(
        F01_SUBTEST_A_CARDINAL_M,
        7
      );
      expect(r01a.candidates[0].metrics.surfaceDistanceM).toBeCloseTo(F01_SUBTEST_A_CARDINAL_M, 7);
      expect(r01a.candidates[0].totalCost).toBeCloseTo(F01_SUBTEST_A_CARDINAL_M, 7);
    }

    // F01B: Pure Diagonal NE (4,0) -> (0,4)
    const r01b = runAndVerifyAgainstOracle(
      f01,
      cellCenterMeters(f01, 4, 0),
      cellCenterMeters(f01, 0, 4)
    );
    expect(r01b.status).toBe('success');
    if (r01b.status === 'success') {
      expect(r01b.candidates[0].cellIndices).toEqual([20, 16, 12, 8, 4]);
      expect(r01b.candidates[0].metrics.horizontalDistanceM).toBeCloseTo(
        F01_SUBTEST_B_DIAGONAL_M,
        7
      );
      expect(r01b.candidates[0].totalCost).toBeCloseTo(F01_SUBTEST_B_DIAGONAL_M, 7);
    }

    // F01C: Octile mix (4,0) -> (2,4)
    const r01c = runAndVerifyAgainstOracle(
      f01,
      cellCenterMeters(f01, 4, 0),
      cellCenterMeters(f01, 2, 4)
    );
    expect(r01c.status).toBe('success');
    if (r01c.status === 'success') {
      expect(r01c.candidates[0].cellIndices).toHaveLength(5);
      expect(r01c.candidates[0].metrics.horizontalDistanceM).toBeCloseTo(F01_SUBTEST_C_OCTILE_M, 7);
      expect(r01c.candidates[0].totalCost).toBeCloseTo(F01_SUBTEST_C_OCTILE_M, 7);
    }

    // F02: Wall barrier with 1-cell gap at (0,2)
    const f02 = createFixtureF02Bundle();
    const r02 = runAndVerifyAgainstOracle(
      f02,
      cellCenterMeters(f02, 2, 0),
      cellCenterMeters(f02, 2, 4)
    );
    expect(r02.status).toBe('success');
    if (r02.status === 'success') {
      expect(r02.candidates[0].cellIndices).toHaveLength(F02_GAP_PATH_CELLS.length);
      expect(r02.candidates[0].cellIndices[0]).toBe(10);
      expect(r02.candidates[0].cellIndices[r02.candidates[0].cellIndices.length - 1]).toBe(14);
      // Must pass cardinally through the northern gap (0,1) -> (0,2) -> (0,3) = [1, 2, 3]
      expect(r02.candidates[0].cellIndices.slice(2, 5)).toEqual([1, 2, 3]);
      for (const blocked of [7, 12, 17, 22]) {
        expect(r02.candidates[0].cellIndices).not.toContain(blocked);
      }
      expect(r02.candidates[0].metrics.horizontalDistanceM).toBeCloseTo(F02_EXPECTED_LENGTH_M, 7);
      expect(r02.candidates[0].totalCost).toBeCloseTo(F02_EXPECTED_LENGTH_M, 7);
    }
  });

  it('F03 & F04: Enforces no-corner-cutting and O(1) disconnected-component no_path with degree-8 goal', () => {
    const f03a = createFixtureF03SubtestABundle();
    const r03a = runAndVerifyAgainstOracle(
      f03a,
      cellCenterMeters(f03a, 1, 1),
      cellCenterMeters(f03a, 0, 2)
    );
    expect(r03a.status).toBe('success');
    if (r03a.status === 'success') {
      expect(r03a.candidates[0].cellIndices).toEqual([...F03A_PATH_CELLS]);
      expect(r03a.candidates[0].metrics.horizontalDistanceM).toBeCloseTo(F03A_EXPECTED_LENGTH_M, 7);
      expect(r03a.candidates[0].totalCost).toBeCloseTo(F03A_EXPECTED_LENGTH_M, 7);
    }

    const f03b = createFixtureF03SubtestBBundle();
    const r03b = runAndVerifyAgainstOracle(
      f03b,
      cellCenterMeters(f03b, 1, 1),
      cellCenterMeters(f03b, 0, 2)
    );
    expect(r03b.status).toBe('no_path');

    const f04 = createFixtureF04Bundle();
    expect(countPassableNeighbors(f04, 3, 5)).toBe(8);
    const r04 = runAndVerifyAgainstOracle(
      f04,
      cellCenterMeters(f04, 3, 1),
      cellCenterMeters(f04, 3, 5)
    );
    expect(r04.status).toBe('no_path');
    if (r04.status === 'no_path') {
      expect(r04.reasonCode).toBe('DISCONNECTED_COMPONENTS');
    }
  });

  it('F05 & F06: Handles same-cell metrics, INTERPOLATED same-cell rejection, and corner-clear LOW detour', () => {
    // F05A: Admissible same-cell request
    const f05a = createFixtureF05AdmissibleBundle();
    const r05a = runAndVerifyAgainstOracle(f05a, F05_START_POINT, F05_DEST_POINT);
    expect(r05a.status).toBe('success');
    if (r05a.status === 'success') {
      const c = r05a.candidates[0];
      expect(c.cellIndices).toEqual([F05_EXPECTED_CELL_INDEX]);
      expect(c.totalCost).toBe(0);
      expect(c.metrics.horizontalDistanceM).toBe(0);
      expect(c.metrics.surfaceDistanceM).toBe(0);
      expect(c.metrics.cumulativeAscentM).toBe(0);
      expect(c.metrics.cumulativeDescentM).toBe(0);
      expect(c.metrics.maxRouteGradeDeg).toBe(0);
      expect(c.metrics.lowQualityPct).toBe(0);
      expect(Number.isNaN(c.metrics.lowQualityPct)).toBe(false);
    }

    // F05B: INTERPOLATED same-cell rejection before same-cell shortcut
    const f05b = createFixtureF05InterpolatedCenterBundle();
    const engine = createDefaultRoutingEngine();
    expect(engine.loadBundle(f05b).ok).toBe(true);
    const r05b = engine.planRoutes(makeRequest(f05b, F05_START_POINT, F05_DEST_POINT));
    expect(r05b).toEqual({
      status: 'invalid_input',
      requestId: `req-${f05b.regionId}`,
      endpoint: 'start',
      reasonCode: 'INTERPOLATED_OR_UNRELIABLE',
      message: expect.any(String),
    });

    // F06: Low-quality shortcut vs corner-clear detour
    const f06 = createFixtureF06Bundle();
    const r06 = runAndVerifyAgainstOracle(
      f06,
      cellCenterMeters(f06, 1, 0),
      cellCenterMeters(f06, 1, 4)
    );
    expect(r06.status).toBe('success');
    if (r06.status === 'success') {
      expect(r06.equivalenceTopology).toBe('case_3_shortest_terrain_merged');
      const shortTerr = r06.candidates.find((c) => c.matchedPolicies.includes('shortest'))!;
      const unc = r06.candidates.find((c) => c.matchedPolicies.includes('uncertainty'))!;

      expect(shortTerr.matchedPolicies).toEqual(['shortest', 'terrain']);
      expect(shortTerr.cellIndices).toEqual([...F06_DIRECT_PATH]);
      expect(shortTerr.metrics.horizontalDistanceM).toBeCloseTo(F06_DIRECT_LENGTH_M, 7);
      expect(shortTerr.metrics.lowQualityDistanceM).toBeCloseTo(F06_DIRECT_LOW_QUALITY_M, 7);

      expect(unc.matchedPolicies).toEqual(['uncertainty']);
      expect(unc.cellIndices).toEqual([...F06_CORNER_CLEAR_DETOUR]);
      expect(unc.metrics.horizontalDistanceM).toBeCloseTo(F06_DETOUR_LENGTH_M, 7);
      expect(unc.metrics.lowQualityDistanceM).toBe(0);
    }
  });

  it('F07: Verifies real Horn slope / plane-fit roughness modules on F07A and engine ridge detour on F07B', () => {
    const f07a = createFixtureF07AInclinedPlane(12);
    // Run real src/routing/hornSlope.ts and src/routing/roughness.ts on F07A Float64 halo
    const horn64 = computeHornSlopeGrid(f07a.elevationF64, f07a.haloWidth, f07a.haloHeight, 10, 10);
    const rough64 = computePlaneFitRoughnessGrid(
      f07a.elevationF64,
      f07a.haloWidth,
      f07a.haloHeight,
      0.5
    );
    for (let r = 1; r < f07a.haloHeight - 1; r++) {
      for (let c = 1; c < f07a.haloWidth - 1; c++) {
        const idx = r * f07a.haloWidth + c;
        expect(Math.abs(horn64.slopeDegFloat64[idx] - 12.0)).toBeLessThanOrEqual(1e-12);
        expect(rough64.rmsResidualM[idx]).toBeLessThanOrEqual(1e-12);
      }
    }
    for (let i = 0; i < f07a.bundle.terrainSlopeDeg.length; i++) {
      expect(Math.abs(f07a.bundle.terrainSlopeDeg[i] - 12.0)).toBeLessThanOrEqual(1e-3);
      expect(f07a.rmsResidualFromFloat32M[i]).toBeLessThanOrEqual(1e-4);
    }

    const { bundle: f07b } = createFixtureF07BDerivedRidgeBundle();
    const r07b = runAndVerifyAgainstOracle(
      f07b,
      cellCenterMeters(f07b, 2, 0),
      cellCenterMeters(f07b, 2, 6)
    );
    expect(r07b.status).toBe('success');
    if (r07b.status === 'success') {
      expect(r07b.equivalenceTopology).toBe('case_2_terrain_uncertainty_merged');
      const shortCand = r07b.candidates.find((c) => c.matchedPolicies.includes('shortest'))!;
      const terrUncCand = r07b.candidates.find((c) => c.matchedPolicies.includes('terrain'))!;

      expect(shortCand.cellIndices).toEqual([14, 15, 16, 17, 18, 19, 20]);
      expect(shortCand.metrics.horizontalDistanceM).toBeCloseTo(60.0, 7);
      expect(shortCand.totalCost).toBeCloseTo(60.0, 7);

      expect(terrUncCand.matchedPolicies).toEqual(['terrain', 'uncertainty']);
      expect(terrUncCand.cellIndices).toEqual([14, 7, 1, 2, 3, 4, 5, 13, 20]);
      expect(terrUncCand.metrics.horizontalDistanceM).toBeCloseTo(60 + 20 * Math.SQRT2, 7);
      expect(terrUncCand.totalCost).toBeCloseTo(60 + 20 * Math.SQRT2, 7);
    }
  });

  it('F08: Corner-legal 3-way policy split and equal-length signed explanation', () => {
    const f08 = createFixtureF08Bundle();
    const r08 = runAndVerifyAgainstOracle(f08, F08_START_POINT, F08_DEST_POINT);
    expect(r08.status).toBe('success');
    if (r08.status === 'success') {
      expect(r08.equivalenceTopology).toBe('case_5_all_three_distinct');
      expect(r08.candidates).toHaveLength(3);

      const shortCand = r08.candidates.find((c) => c.matchedPolicies.includes('shortest'))!;
      const terrCand = r08.candidates.find((c) => c.matchedPolicies.includes('terrain'))!;
      const uncCand = r08.candidates.find((c) => c.matchedPolicies.includes('uncertainty'))!;

      expect(shortCand.cellIndices).toEqual([...F08_MIDDLE_PATH]);
      expect(shortCand.metrics.horizontalDistanceM).toBeCloseTo(F08_MIDDLE_LENGTH_M, 7);
      expect(shortCand.totalCost).toBeCloseTo(40.0, 7);

      expect(terrCand.cellIndices).toEqual([...F08_NORTH_PATH]);
      expect(terrCand.metrics.horizontalDistanceM).toBeCloseTo(F08_CORRIDOR_LENGTH_M, 7);
      expect(terrCand.totalCost).toBeCloseTo(F08_NORTH_TERRAIN_COST, 7);
      expect(terrCand.metrics.lowQualityDistanceM).toBeCloseTo(20.0, 7);

      expect(uncCand.cellIndices).toEqual([...F08_SOUTH_PATH]);
      expect(uncCand.metrics.horizontalDistanceM).toBeCloseTo(F08_CORRIDOR_LENGTH_M, 7);
      expect(uncCand.totalCost).toBeCloseTo(F08_SOUTH_UNCERTAINTY_COST, 7);
      expect(uncCand.metrics.lowQualityDistanceM).toBe(0);

      expect(uncCand.explanation.summary).toContain(
        'follows an equal-length 48.3 m alternative corridor'
      );
      expect(uncCand.explanation.summary).not.toContain('adds 0.0 m');
      expect(uncCand.explanation.summary).toContain(
        'while crossing a 5.0° max-slope corridor (vs. 0.0° on the terrain route)'
      );
    }
  });

  it('F09: Uniform quality override (gamma_eff=0), standalone ["uncertainty"], and mixed UNKNOWN/LOW behavior', () => {
    const f09a = createFixtureF09SubtestACounterexampleBundle();
    const startPt = cellCenterMeters(f09a, 1, 0);
    const goalPt = cellCenterMeters(f09a, 1, 4);

    // F09A: Uniform UNKNOWN (U=0.75) -> gamma_eff = 0, terrain & uncertainty merge on detour
    const r09a = runAndVerifyAgainstOracle(f09a, startPt, goalPt);
    expect(r09a.status).toBe('success');
    if (r09a.status === 'success') {
      expect(r09a.effectiveWeights.uncertainty.uniformQualityOverride).toBe(true);
      expect(r09a.effectiveWeights.uncertainty.effective.gamma).toBe(0);
      expect(r09a.effectiveWeights.uncertainty.minAdmissibleU).toBe(0.75);
      expect(r09a.effectiveWeights.uncertainty.maxAdmissibleU).toBe(0.75);
      expect(r09a.equivalenceTopology).toBe('case_2_terrain_uncertainty_merged');
      expect(r09a.reasonCodes).toContain('UNIFORM_QUALITY_NO_DIFFERENTIATION');

      const uncCand = r09a.candidates.find((c) => c.matchedPolicies.includes('uncertainty'))!;
      // Both [5,1,2,3,9] and [5,6,2,8,9] are equal-cost (20 + 20*sqrt(2)) detours avoiding 10 deg cell 7
      expect(uncCand.cellIndices).not.toContain(7);
      expect(uncCand.cellIndices).toHaveLength(5);
      expect(uncCand.metrics.horizontalDistanceM).toBeCloseTo(20 + 20 * Math.SQRT2, 7);
      expect(uncCand.totalCost).toBeCloseTo(20 + 20 * Math.SQRT2, 7);
    }

    // F09B: Standalone ['uncertainty'] without 'terrain'
    const r09bUniform = runAndVerifyAgainstOracle(f09a, startPt, goalPt, {
      policies: ['uncertainty'],
    });
    expect(r09bUniform.status).toBe('success');
    if (r09bUniform.status === 'success') {
      expect(r09bUniform.candidates).toHaveLength(1);
      expect(r09bUniform.candidates[0].matchedPolicies).toEqual(['uncertainty']);
      expect(r09bUniform.candidates[0].cellIndices).not.toContain(7);
      expect(r09bUniform.candidates[0].totalCost).toBeCloseTo(20 + 20 * Math.SQRT2, 7);
      expect(r09bUniform.reasonCodes).toContain('UNIFORM_QUALITY_NO_DIFFERENTIATION');
    }

    const f06 = createFixtureF06Bundle();
    const r09bMixed = runAndVerifyAgainstOracle(
      f06,
      cellCenterMeters(f06, 1, 0),
      cellCenterMeters(f06, 1, 4),
      { policies: ['uncertainty'] }
    );
    expect(r09bMixed.status).toBe('success');
    if (r09bMixed.status === 'success') {
      expect(r09bMixed.candidates).toHaveLength(1);
      expect(r09bMixed.candidates[0].matchedPolicies).toEqual(['uncertainty']);
      expect(r09bMixed.candidates[0].cellIndices).toEqual([...F06_CORNER_CLEAR_DETOUR]);
    }

    // F09C: Mixed UNKNOWN (0.75) and LOW (1.0) -> gamma_eff = 2, unshifted U, distant ACCEPTABLE invariance, Q2 wording
    const f09c = createFixtureF09SubtestCMixedUnknownLowBundle();
    const r09c = runAndVerifyAgainstOracle(f09c, startPt, goalPt);
    expect(r09c.status).toBe('success');
    if (r09c.status === 'success') {
      expect(r09c.effectiveWeights.uncertainty.uniformQualityOverride).toBe(false);
      expect(r09c.effectiveWeights.uncertainty.effective.gamma).toBe(2);
      expect(r09c.effectiveWeights.uncertainty.minAdmissibleU).toBe(0.75);
      expect(r09c.effectiveWeights.uncertainty.maxAdmissibleU).toBe(1.0);
    }

    const f09cWithCorner: RegionRoutingBundle = {
      ...f09c,
      qualityCode: new Uint8Array(f09c.qualityCode),
    };
    f09cWithCorner.qualityCode[4] = QUALITY_CODE.ACCEPTABLE;
    const profile = resolveConstraintProfile('educational-eva-v1');
    const effWeights = resolveEffectivePolicyWeights(
      f09cWithCorner,
      profile,
      'prefer',
      createDefaultCellAdmissibility()
    );
    expect(effWeights.effectiveWeights.uncertainty.effective.gamma).toBe(2);
    expect(
      computeEdgeCost(f09cWithCorner, 1, 0, 2, profile, effWeights.effectiveWeights.uncertainty.effective)
    ).toBeCloseTo(25.0, 7);
    expect(
      computeEdgeCost(f09cWithCorner, 1, 1, 2, profile, effWeights.effectiveWeights.uncertainty.effective)
    ).toBeCloseTo(30.0, 7);

    // Branch Q2 explanation verification
    const q2Clause = formatQualityDelta(
      {
        lowQualityDistanceM: 0,
        lowQualityPct: 0,
        unknownQualityDistanceM: 20 + 20 * Math.SQRT2,
        unknownQualityPct: 100,
        weightedUncertaintyExposureM: 0.75 * (20 + 20 * Math.SQRT2),
        maxTerrainSlopeDeg: 0,
      } as RouteMetrics,
      {
        lowQualityDistanceM: 20,
        lowQualityPct: 50,
        unknownQualityDistanceM: 20,
        unknownQualityPct: 50,
        weightedUncertaintyExposureM: 35,
        maxTerrainSlopeDeg: 0,
      } as RouteMetrics
    );
    expect(q2Clause).toContain('to reduce high-penalty low-confidence exposure');
    expect(q2Clause).toContain('unknown-quality terrain');
  });

  it('F10: Enforces prefer vs strict qualityMode, INTERPOLATED vs MANUALLY_EDITED, and +1000m elevation-support mask', () => {
    const f10a = createFixtureF10LowBarrierBundle();
    const s10 = cellCenterMeters(f10a, 1, 0);
    const g10 = cellCenterMeters(f10a, 1, 4);

    const r10aPrefer = runAndVerifyAgainstOracle(f10a, s10, g10, { qualityMode: 'prefer' });
    expect(r10aPrefer.status).toBe('success');

    const r10aStrict = runAndVerifyAgainstOracle(f10a, s10, g10, { qualityMode: 'strict' });
    expect(r10aStrict.status).toBe('no_path');
    if (r10aStrict.status === 'no_path') {
      expect(r10aStrict.reasonCode).toBe('STRICT_QUALITY_BLOCKED');
    }

    // F10B: INTERPOLATED vs MANUALLY_EDITED
    const f10b = createFixtureF10FomSplitBundle();
    const r10bAroundInterp = runAndVerifyAgainstOracle(
      f10b,
      cellCenterMeters(f10b, 1, 0),
      cellCenterMeters(f10b, 1, 2)
    );
    expect(r10bAroundInterp.status).toBe('success');
    if (r10bAroundInterp.status === 'success') {
      expect(r10bAroundInterp.candidates[0].cellIndices).not.toContain(6);
    }

    const r10bThroughEdited = runAndVerifyAgainstOracle(
      f10b,
      cellCenterMeters(f10b, 1, 2),
      cellCenterMeters(f10b, 1, 4)
    );
    expect(r10bThroughEdited.status).toBe('success');
    if (r10bThroughEdited.status === 'success') {
      expect(r10bThroughEdited.candidates[0].cellIndices).toEqual([7, 8, 9]);
    }

    // F10C: +1000m spike support mask via real T06/T07/T08 modules + integrated RoutingEngine
    const f10c = createFixtureF10InterpolatedSpikeBundle(1000.0);
    const supportMask = buildElevationSupportMask(
      f10c.elevationM,
      f10c.qualityCode,
      f10c.noDataSentinel
    );
    const maskedElev = createMaskedElevationGrid(f10c.elevationM, supportMask);
    expect(supportMask[3 * 7 + 3]).toBe(0);
    expect(Number.isNaN(maskedElev[3 * 7 + 3])).toBe(true);

    const hornSpike = computeHornSlopeGrid(
      f10c.elevationM,
      f10c.gridWidth,
      f10c.gridHeight,
      f10c.cellSpacingEastM,
      f10c.cellSpacingNorthM,
      supportMask,
      f10c.noDataSentinel
    );
    const roughSpike = computePlaneFitRoughnessGrid(
      f10c.elevationM,
      f10c.gridWidth,
      f10c.gridHeight,
      f10c.roughnessScaleM,
      supportMask,
      f10c.noDataSentinel
    );
    for (let r = 1; r < f10c.gridHeight - 1; r++) {
      for (let c = 1; c < f10c.gridWidth - 1; c++) {
        const k = r * f10c.gridWidth + c;
        const nearSpike = Math.abs(r - 3) <= 1 && Math.abs(c - 3) <= 1;
        if (nearSpike) {
          expect(hornSpike.derivativeSupportMask[k]).toBe(0);
          expect(roughSpike.derivativeSupportMask[k]).toBe(0);
        } else {
          expect(hornSpike.derivativeSupportMask[k]).toBe(1);
          expect(hornSpike.slopeDeg[k]).toBe(0);
          expect(roughSpike.roughnessNormalized[k]).toBe(0);
        }
      }
    }

    const r10c = runAndVerifyAgainstOracle(
      f10c,
      cellCenterMeters(f10c, 0, 0),
      cellCenterMeters(f10c, 6, 6)
    );
    expect(r10c.status).toBe('success');
    if (r10c.status === 'success') {
      for (const dr of [-1, 0, 1]) {
        for (const dc of [-1, 0, 1]) {
          expect(r10c.candidates[0].cellIndices).not.toContain((3 + dr) * 7 + (3 + dc));
        }
      }
    }
  });

  it('F11: Rectangular 20m x 5m grid geometry and >8.24% digitization stretch', () => {
    const f11 = createFixtureF11Bundle();

    const r11a = runAndVerifyAgainstOracle(
      f11,
      cellCenterMeters(f11, 3, 0),
      cellCenterMeters(f11, 2, 1)
    );
    expect(r11a.status).toBe('success');
    if (r11a.status === 'success') {
      expect(r11a.candidates[0].cellIndices).toEqual([15, 11]);
      expect(r11a.candidates[0].metrics.horizontalDistanceM).toBeCloseTo(F11_SINGLE_DIAG_M, 7);
      expect(r11a.candidates[0].totalCost).toBeCloseTo(F11_SINGLE_DIAG_M, 7);
    }

    const r11b = runAndVerifyAgainstOracle(
      f11,
      cellCenterMeters(f11, 3, 0),
      cellCenterMeters(f11, 0, 1)
    );
    expect(r11b.status).toBe('success');
    if (r11b.status === 'success') {
      const dist = r11b.candidates[0].metrics.horizontalDistanceM;
      expect(dist).toBeCloseTo(F11_SUBTEST_B_PATH_M, 7);
      const excessRatio = (dist - F11_SUBTEST_B_EUCLIDEAN_M) / F11_SUBTEST_B_EUCLIDEAN_M;
      expect(excessRatio).toBeGreaterThan(0.0824);
    }
  });

  it('F12: Boundary clamping, sensitivity profiles, return-leg, worker/client superseding yield isolation, and 3D saddle draping', async () => {
    const f12a = createFixtureF12SensitivityBundle();
    const engine = createDefaultRoutingEngine();
    expect(engine.loadBundle(f12a).ok).toBe(true);

    // SW (0,0) and NE (50,50) border clamping:
    // On f12a, SW row=4 has 28 deg slope (MAX_TERRAIN_SLOPE_EXCEEDED) while coordinate clamping maps (0,0) -> k=20, (50,50) -> k=4
    const swClamp = localMetersToGridPoint({ eastM: 0, northM: 0 }, 5, 5, 10, 10);
    const neClamp = localMetersToGridPoint({ eastM: 50, northM: 50 }, 5, 5, 10, 10);
    expect(swClamp.ok).toBe(true);
    expect(neClamp.ok).toBe(true);
    if (swClamp.ok && neClamp.ok) {
      expect(swClamp.value.row).toBe(4);
      expect(swClamp.value.col).toBe(0);
      expect(swClamp.value.cellIndex).toBe(20);
      expect(neClamp.value.row).toBe(0);
      expect(neClamp.value.col).toBe(4);
      expect(neClamp.value.cellIndex).toBe(4);
    }

    const borderSlopeRejected = engine.planRoutes(
      makeRequest(f12a, { eastM: 0, northM: 0 }, { eastM: 50, northM: 50 })
    );
    expect(borderSlopeRejected.status).toBe('invalid_input');
    if (borderSlopeRejected.status === 'invalid_input') {
      expect(borderSlopeRejected.endpoint).toBe('start');
      expect(borderSlopeRejected.reasonCode).toBe('MAX_TERRAIN_SLOPE_EXCEEDED');
    }

    const flat5x5: RegionRoutingBundle = {
      ...f12a,
      regionId: 'f12a-flat-borders',
      terrainSlopeDeg: new Float32Array(25).fill(0),
    };
    const flatEngine = createDefaultRoutingEngine();
    expect(flatEngine.loadBundle(flat5x5).ok).toBe(true);
    const borderRes = flatEngine.planRoutes(
      makeRequest(flat5x5, { eastM: 0, northM: 0 }, { eastM: 50, northM: 50 })
    );
    expect(borderRes.status).toBe('success');
    if (borderRes.status === 'success') {
      expect(borderRes.normalizedStart.row).toBe(4);
      expect(borderRes.normalizedStart.col).toBe(0);
      expect(borderRes.normalizedStart.cellIndex).toBe(20);
      expect(borderRes.normalizedDestination.row).toBe(0);
      expect(borderRes.normalizedDestination.col).toBe(4);
      expect(borderRes.normalizedDestination.cellIndex).toBe(4);
    }

    // Out-of-bounds rejection
    const oobRes = engine.planRoutes(
      makeRequest(f12a, { eastM: -0.001, northM: 10 }, { eastM: 45, northM: 25 })
    );
    expect(oobRes.status).toBe('invalid_input');
    if (oobRes.status === 'invalid_input') {
      expect(oobRes.reasonCode).toBe('OUT_OF_BOUNDS');
    }

    // datasetVersion mismatch
    const staleRes = engine.planRoutes({
      ...makeRequest(f12a, { eastM: 5, northM: 25 }, { eastM: 45, northM: 25 }),
      datasetVersion: 'stale-v0',
    });
    expect(staleRes.status).toBe('data_error');
    if (staleRes.status === 'data_error') {
      expect(staleRes.reasonCode).toBe('DATASET_VERSION_MISMATCH');
    }

    // Sensitivity switching across 15 / 20 / 25 deg + returnToStart round trip
    const r15 = runAndVerifyAgainstOracle(
      f12a,
      { eastM: 5, northM: 25 },
      { eastM: 45, northM: 25 },
      { profileId: 'conservative-15deg', returnToStart: true }
    );
    expect(r15.status).toBe('success');
    if (r15.status === 'success') {
      expect(r15.candidates[0].cellIndices).toEqual([10, 5, 6, 7, 8, 9, 14]);
      expect(r15.candidates[0].returnLeg?.status).toBe('complete');
      expect(r15.candidates[0].returnLeg?.cellIndices).toEqual([14, 9, 8, 7, 6, 5, 10]);
    }

    const r20 = runAndVerifyAgainstOracle(
      f12a,
      { eastM: 5, northM: 25 },
      { eastM: 45, northM: 25 },
      { profileId: 'educational-eva-v1' }
    );
    expect(r20.status).toBe('success');
    if (r20.status === 'success') {
      expect(r20.candidates[0].cellIndices).toEqual([10, 11, 12, 13, 14]);
    }

    const r25 = runAndVerifyAgainstOracle(
      f12a,
      { eastM: 5, northM: 25 },
      { eastM: 45, northM: 25 },
      { profileId: 'relaxed-25deg' }
    );
    expect(r25.status).toBe('success');
    if (r25.status === 'success') {
      expect(r25.candidates[0].cellIndices).toEqual([10, 11, 12, 13, 14]);
    }

    // F12B: Mid-search MessageChannel yield isolation via real RoutePlannerClient + worker handler + AsyncWorkspaceMutex
    const refSyncRes = engine.planRoutes(
      makeRequest(f12a, { eastM: 5, northM: 25 }, { eastM: 45, northM: 25 }, {
        requestId: 'sync-ref',
        profileId: 'educational-eva-v1',
      })
    );
    expect(refSyncRes.status).toBe('success');

    const yieldToEventLoop = createYieldChannel();
    const realEngine = createDefaultRoutingEngine();
    const mutex = new AsyncWorkspaceMutex();
    let reqAYieldStartedResolve!: () => void;
    const reqAYieldStarted = new Promise<void>((resolve) => {
      reqAYieldStartedResolve = resolve;
    });

    const yieldingPort: WorkerEnginePort = {
      loadBundle: (b) => realEngine.loadBundle(b),
      planRoutes: async (req, hooks) => {
        return mutex.supersedeAndEnqueue(req.requestId, async () => {
          if (req.requestId === 'yield-req-1') {
            reqAYieldStartedResolve();
            await yieldToEventLoop();
            if (hooks.isCancelled()) {
              return {
                status: 'cancelled',
                requestId: req.requestId,
                message: 'Cancelled after yield.',
              };
            }
          }
          return realEngine.planRoutes(req, hooks);
        });
      },
    };

    const client = createDefaultRoutePlannerClient({
      workerFactory: () => createInMemoryWorkerBridge(yieldingPort),
    });

    const loadA = await client.loadBundle(f12a);
    expect(loadA.ok).toBe(true);
    expect(f12a.elevationM.byteLength).toBeGreaterThan(0);

    const pA = client.planRoute(
      makeRequest(f12a, { eastM: 5, northM: 25 }, { eastM: 45, northM: 25 }, {
        requestId: 'yield-req-1',
        profileId: 'conservative-15deg',
      })
    );
    await reqAYieldStarted;

    // Dispatch superseding LOAD_BUNDLE and PLAN_ROUTE while yield-req-1 is suspended
    const f12bReload = createFixtureF12SensitivityBundle();
    const loadB = client.loadBundle(f12bReload);
    const pB = client.planRoute(
      makeRequest(f12bReload, { eastM: 5, northM: 25 }, { eastM: 45, northM: 25 }, {
        requestId: 'yield-req-2',
        profileId: 'educational-eva-v1',
      })
    );

    const [resA, resLoadB, resB] = await Promise.all([pA, loadB, pB]);
    expect(resA.status).toBe('cancelled');
    expect(resLoadB.ok).toBe(true);
    expect(resB.status).toBe('success');
    if (resB.status === 'success' && refSyncRes.status === 'success') {
      expect(resB.candidates[0].cellIndices).toEqual(refSyncRes.candidates[0].cellIndices);
      expect(resB.candidates[0].totalCost).toBe(refSyncRes.candidates[0].totalCost);
      expect(resB.candidates[0].metrics).toEqual(refSyncRes.candidates[0].metrics);
    }
    client.dispose();

    // F12C: 2x2 saddle quad draping at 1x and 3x vertical exaggeration
    const f12c = createFixtureF12SaddleQuadBundle();
    const r12c = runAndVerifyAgainstOracle(
      f12c,
      cellCenterMeters(f12c, 0, 0),
      cellCenterMeters(f12c, 1, 1)
    );
    expect(r12c.status).toBe('success');
    if (r12c.status === 'success') {
      const cand = r12c.candidates[0];
      expect(cand.cellIndices).toEqual([0, 3]);
      expect(cand.draped3DPolyline).toBeDefined();
      expect(cand.draped3DPolyline!).toHaveLength(3);
      expect(cand.draped3DPolyline![1].isSubdividedMidpoint).toBe(true);
      expect(cand.draped3DPolyline![1].baseElevationM).toBe(10.0);
      expect(cand.draped3DPolyline![1].worldY).toBeCloseTo(10.35, 7);
      expect(cand.metrics.surfaceDistanceM).toBeCloseTo(10 * Math.SQRT2, 7);

      const draped3x = buildDraped3DRoutePolyline(f12c, cand.cellIndices, {
        verticalExaggeration: 3.0,
        hoverOffsetM: 0.35,
      });
      expect(draped3x[1].baseElevationM).toBe(10.0);
      expect(draped3x[1].worldY).toBeCloseTo(30.35, 7);
    }
  });

  it('200 x 200 (40,000-cell) Western Jezero synthetic benchmark across 20 3-policy queries', () => {
    const bundle = createSyntheticJezero200Bundle();
    const profile = resolveConstraintProfile('educational-eva-v1');
    const cellAdmissibility = createDefaultCellAdmissibility();
    const edgeEvaluator = createDefaultEdgeEvaluator(cellAdmissibility);

    // 1. Measure standalone O(N) connected-component labeling initialization time
    const componentIdOut = new Int32Array(40000);
    const adjMaskOut = new Uint8Array(40000);
    const bfsQueue = new Int32Array(40000);
    const tCompStart = performance.now();
    const { componentCount } = computeConnectedComponentsAndAdjMask(
      bundle,
      profile,
      'prefer',
      edgeEvaluator,
      cellAdmissibility,
      componentIdOut,
      adjMaskOut,
      bfsQueue
    );
    const componentInitMs = performance.now() - tCompStart;
    expect(componentCount).toBeGreaterThanOrEqual(2);

    // 2. Load into real RoutingEngine and measure cold first query (includes lazy engine component init)
    const engine = createDefaultRoutingEngine();
    const tLoadStart = performance.now();
    const loadRes = engine.loadBundle(bundle);
    const bundleLoadMs = performance.now() - tLoadStart;
    expect(loadRes.ok).toBe(true);

    const coldFirstReq = makeRequest(
      bundle,
      cellCenterMeters(bundle, 10, 10),
      cellCenterMeters(bundle, 20, 25),
      { requestId: 'bench-cold-warmup' }
    );
    const tColdStart = performance.now();
    const coldRes = engine.planRoutes(coldFirstReq);
    const coldFirstQueryMs = performance.now() - tColdStart;
    expect(coldRes.status).toBe('success');

    // 3. Build 20 representative 3-policy queries across 4 categories
    type BenchCategory = 'short' | 'diagonal' | 'three_way_split' | 'unreachable_basin';
    const queries: Array<{
      id: string;
      category: BenchCategory;
      startRow: number;
      startCol: number;
      goalRow: number;
      goalCol: number;
    }> = [
      // 5 short routes
      { id: 'q01', category: 'short', startRow: 12, startCol: 12, goalRow: 18, goalCol: 28 },
      { id: 'q02', category: 'short', startRow: 25, startCol: 130, goalRow: 35, goalCol: 145 },
      { id: 'q03', category: 'short', startRow: 140, startCol: 20, goalRow: 150, goalCol: 42 },
      { id: 'q04', category: 'short', startRow: 50, startCol: 50, goalRow: 62, goalCol: 70 },
      { id: 'q05', category: 'short', startRow: 180, startCol: 40, goalRow: 192, goalCol: 65 },
      // 5 long diagonal routes
      { id: 'q06', category: 'diagonal', startRow: 5, startCol: 5, goalRow: 190, goalCol: 190 },
      { id: 'q07', category: 'diagonal', startRow: 190, startCol: 10, goalRow: 10, goalCol: 190 },
      { id: 'q08', category: 'diagonal', startRow: 15, startCol: 20, goalRow: 145, goalCol: 180 },
      { id: 'q09', category: 'diagonal', startRow: 145, startCol: 15, goalRow: 15, goalCol: 185 },
      { id: 'q10', category: 'diagonal', startRow: 30, startCol: 10, goalRow: 185, goalCol: 140 },
      // 5 three-way split routes across central ridge / north LOW / south gentle corridor
      { id: 'q11', category: 'three_way_split', startRow: 100, startCol: 46, goalRow: 100, goalCol: 144 },
      { id: 'q12', category: 'three_way_split', startRow: 98, startCol: 50, goalRow: 102, goalCol: 140 },
      { id: 'q13', category: 'three_way_split', startRow: 100, startCol: 55, goalRow: 100, goalCol: 138 },
      { id: 'q14', category: 'three_way_split', startRow: 97, startCol: 60, goalRow: 103, goalCol: 135 },
      { id: 'q15', category: 'three_way_split', startRow: 101, startCol: 52, goalRow: 99, goalCol: 142 },
      // 5 unreachable basin routes (goal inside flat degree-8 walled crater at 165,165)
      { id: 'q16', category: 'unreachable_basin', startRow: 10, startCol: 10, goalRow: 165, goalCol: 165 },
      { id: 'q17', category: 'unreachable_basin', startRow: 100, startCol: 20, goalRow: 163, goalCol: 164 },
      { id: 'q18', category: 'unreachable_basin', startRow: 185, startCol: 185, goalRow: 166, goalCol: 166 },
      { id: 'q19', category: 'unreachable_basin', startRow: 50, startCol: 150, goalRow: 164, goalCol: 167 },
      { id: 'q20', category: 'unreachable_basin', startRow: 150, startCol: 140, goalRow: 165, goalCol: 163 },
    ];

    const solveTimesMs: number[] = [];
    const resultsByCategory: Record<BenchCategory, number[]> = {
      short: [],
      diagonal: [],
      three_way_split: [],
      unreachable_basin: [],
    };
    let threeWaySplitObserved = 0;

    for (const q of queries) {
      const req = makeRequest(
        bundle,
        cellCenterMeters(bundle, q.startRow, q.startCol),
        cellCenterMeters(bundle, q.goalRow, q.goalCol),
        { requestId: q.id }
      );
      const t0 = performance.now();
      const res = engine.planRoutes(req);
      const elapsedMs = performance.now() - t0;

      solveTimesMs.push(elapsedMs);
      resultsByCategory[q.category].push(elapsedMs);

      if (q.category === 'unreachable_basin') {
        expect(res.status).toBe('no_path');
        if (res.status === 'no_path') {
          expect(res.reasonCode).toBe('DISCONNECTED_COMPONENTS');
        }
      } else {
        expect(res.status).toBe('success');
        if (res.status === 'success' && q.category === 'three_way_split') {
          if (res.equivalenceTopology === 'case_5_all_three_distinct') {
            threeWaySplitObserved++;
          }
        }
      }
    }

    expect(threeWaySplitObserved).toBeGreaterThanOrEqual(1);

    // 4. Verify Dijkstra oracle equivalence on one representative query from each reachable category
    for (const q of [queries[0], queries[5], queries[10]]) {
      const res = runAndVerifyAgainstOracle(
        bundle,
        cellCenterMeters(bundle, q.startRow, q.startCol),
        cellCenterMeters(bundle, q.goalRow, q.goalCol)
      );
      expect(res.status).toBe('success');
    }

    const sorted = [...solveTimesMs].sort((a, b) => a - b);
    const medianSolveMs = percentile(sorted, 0.5);
    const p95SolveMs = percentile(sorted, 0.95);
    const worstSolveMs = sorted[sorted.length - 1];

    // Confirm valid grid point clamping on 200x200 bounds
    const maxPt = localMetersToGridPoint({ eastM: 2000, northM: 2000 }, 200, 200, 10, 10);
    expect(maxPt.ok).toBe(true);

    console.info(
      JSON.stringify({
        benchmark: '200x200 Western Jezero Synthetic (40,000 cells, 20 x 3-policy queries)',
        nodeVersion: process.version,
        platform: `${process.platform}/${process.arch}`,
        gridCells: 40000,
        componentCount,
        bundleLoadMs: Number(bundleLoadMs.toFixed(3)),
        componentInitMs: Number(componentInitMs.toFixed(3)),
        coldFirstQueryMs: Number(coldFirstQueryMs.toFixed(3)),
        medianSolveMs: Number(medianSolveMs.toFixed(3)),
        p95SolveMs: Number(p95SolveMs.toFixed(3)),
        worstSolveMs: Number(worstSolveMs.toFixed(3)),
        threeWaySplitObserved,
        categoryMediansMs: {
          short: Number(percentile([...resultsByCategory.short].sort((a, b) => a - b), 0.5).toFixed(3)),
          diagonal: Number(
            percentile([...resultsByCategory.diagonal].sort((a, b) => a - b), 0.5).toFixed(3)
          ),
          three_way_split: Number(
            percentile([...resultsByCategory.three_way_split].sort((a, b) => a - b), 0.5).toFixed(3)
          ),
          unreachable_basin: Number(
            percentile([...resultsByCategory.unreachable_basin].sort((a, b) => a - b), 0.5).toFixed(
              3
            )
          ),
        },
      })
    );

    expect(Number.isFinite(componentInitMs)).toBe(true);
    expect(Number.isFinite(medianSolveMs)).toBe(true);
    expect(Number.isFinite(p95SolveMs)).toBe(true);
    expect(Number.isFinite(worstSolveMs)).toBe(true);
  });
});
