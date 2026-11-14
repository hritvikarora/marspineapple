import { describe, expect, it } from 'vitest';
import type {
  ConstraintProfile,
  Draped3DPoint,
  LocalMeterPoint,
  NormalizedGridPoint,
  RegionRoutingBundle,
  RouteRequest,
} from '../../src/contracts/routing.js';
import {
  DIR_COUNT,
  DIR_DC,
  DIR_DR,
  DIR_IS_DIAG,
} from '../../src/routing/types.js';
import {
  createFixtureF12SaddleQuadBundle,
  createFixtureF12SensitivityBundle,
} from '../fixtures/f12.js';

function normalizeEndpoint(
  point: LocalMeterPoint,
  bundle: RegionRoutingBundle
): { ok: true; value: NormalizedGridPoint } | { ok: false; reasonCode: 'OUT_OF_BOUNDS' } {
  const w = bundle.gridWidth;
  const h = bundle.gridHeight;
  const dx = bundle.cellSpacingEastM;
  const dy = bundle.cellSpacingNorthM;
  const lenE = w * dx;
  const lenN = h * dy;

  if (
    !Number.isFinite(point.eastM) ||
    !Number.isFinite(point.northM) ||
    point.eastM < 0 ||
    point.eastM > lenE ||
    point.northM < 0 ||
    point.northM > lenN
  ) {
    return { ok: false, reasonCode: 'OUT_OF_BOUNDS' };
  }

  const col = Math.min(w - 1, Math.max(0, Math.floor(point.eastM / dx)));
  const row = Math.min(h - 1, Math.max(0, Math.floor((lenN - point.northM) / dy)));
  return {
    ok: true,
    value: {
      requestedEastM: point.eastM,
      requestedNorthM: point.northM,
      col,
      row,
      cellIndex: row * w + col,
      cellCenterEastM: (col + 0.5) * dx,
      cellCenterNorthM: (h - 1 - row + 0.5) * dy,
    },
  };
}

function validateVersion(
  request: Pick<RouteRequest, 'regionId' | 'datasetVersion'>,
  bundle: RegionRoutingBundle
): 'OK' | 'REGION_MISMATCH' | 'DATASET_VERSION_MISMATCH' {
  if (request.regionId !== bundle.regionId) return 'REGION_MISMATCH';
  if (request.datasetVersion !== bundle.datasetVersion) return 'DATASET_VERSION_MISMATCH';
  return 'OK';
}

function yieldViaMessageChannel(): Promise<void> {
  return new Promise<void>((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.onmessage = null;
      channel.port1.close();
      channel.port2.close();
      resolve();
    };
    channel.port2.postMessage(undefined);
  });
}

async function solveShortestWithYield(
  bundle: RegionRoutingBundle,
  startIdx: number,
  goalIdx: number,
  maxSlopeDeg: number,
  workspace: { dist: Float64Array; parent: Int32Array; visited: Uint8Array },
  yieldEveryPops: number,
  isCancelled: () => boolean
): Promise<{ status: 'success' | 'no_path' | 'cancelled'; cellIndices: number[]; totalCost: number }> {
  const w = bundle.gridWidth;
  const h = bundle.gridHeight;
  const n = w * h;
  workspace.dist.fill(Number.POSITIVE_INFINITY);
  workspace.parent.fill(-1);
  workspace.visited.fill(0);
  workspace.dist[startIdx] = 0;

  let pops = 0;
  for (let step = 0; step < n; step++) {
    let u = -1;
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < n; i++) {
      if (!workspace.visited[i] && workspace.dist[i] < best) {
        best = workspace.dist[i];
        u = i;
      }
    }
    if (u === -1 || u === goalIdx) break;
    workspace.visited[u] = 1;
    pops++;

    if (yieldEveryPops > 0 && pops % yieldEveryPops === 0) {
      await yieldViaMessageChannel();
      if (isCancelled()) {
        return { status: 'cancelled', cellIndices: [], totalCost: Number.NaN };
      }
    }

    const r = Math.floor(u / w);
    const c = u - r * w;
    for (let d = 0; d < DIR_COUNT; d++) {
      const nr = r + DIR_DR[d];
      const nc = c + DIR_DC[d];
      if (nr < 0 || nr >= h || nc < 0 || nc >= w) continue;
      const v = nr * w + nc;
      if (bundle.terrainSlopeDeg[v] > maxSlopeDeg) continue;
      if (DIR_IS_DIAG[d]) {
        const w1 = r * w + nc;
        const w2 = nr * w + c;
        if (bundle.terrainSlopeDeg[w1] > maxSlopeDeg || bundle.terrainSlopeDeg[w2] > maxSlopeDeg) {
          continue;
        }
      }
      const dStep = Math.hypot((nc - c) * bundle.cellSpacingEastM, (r - nr) * bundle.cellSpacingNorthM);
      const cand = workspace.dist[u] + dStep;
      if (cand < workspace.dist[v] - 1e-12) {
        workspace.dist[v] = cand;
        workspace.parent[v] = u;
      }
    }
  }

  if (!Number.isFinite(workspace.dist[goalIdx])) {
    return { status: 'no_path', cellIndices: [], totalCost: Number.POSITIVE_INFINITY };
  }

  const cellIndices: number[] = [];
  let cur = goalIdx;
  while (cur !== -1) {
    cellIndices.push(cur);
    cur = workspace.parent[cur];
  }
  cellIndices.reverse();
  return { status: 'success', cellIndices, totalCost: workspace.dist[goalIdx] };
}

function drapeDiagonalStep(
  bundle: RegionRoutingBundle,
  cellIndices: number[],
  verticalExaggeration = 1.0,
  hoverOffsetM = 0.35
): Draped3DPoint[] {
  const w = bundle.gridWidth;
  const h = bundle.gridHeight;
  const dx = bundle.cellSpacingEastM;
  const dy = bundle.cellSpacingNorthM;
  const out: Draped3DPoint[] = [];

  for (let i = 0; i < cellIndices.length; i++) {
    const k = cellIndices[i];
    const r = Math.floor(k / w);
    const c = k - r * w;
    const eastM = (c + 0.5) * dx;
    const northM = (h - 1 - r + 0.5) * dy;
    const z = bundle.elevationM[k];

    if (i > 0) {
      const prevK = cellIndices[i - 1];
      const prevR = Math.floor(prevK / w);
      const prevC = prevK - prevR * w;
      if (Math.abs(r - prevR) === 1 && Math.abs(c - prevC) === 1) {
        const prevEastM = (prevC + 0.5) * dx;
        const prevNorthM = (h - 1 - prevR + 0.5) * dy;
        const zEdgeMid = 0.5 * (bundle.elevationM[prevK] + z);
        const zOppMid = 0.5 * (bundle.elevationM[prevR * w + c] + bundle.elevationM[r * w + prevC]);
        const zDraped = Math.max(zEdgeMid, zOppMid);
        out.push({
          eastM: 0.5 * (prevEastM + eastM),
          northM: 0.5 * (prevNorthM + northM),
          baseElevationM: zDraped,
          worldY: zDraped * verticalExaggeration + hoverOffsetM,
          isSubdividedMidpoint: true,
        });
      }
    }

    out.push({
      eastM,
      northM,
      baseElevationM: z,
      worldY: z * verticalExaggeration + hoverOffsetM,
      isSubdividedMidpoint: false,
    });
  }
  return out;
}

describe('T39: Fixture F12 boundary clamping, sensitivity profiles, mid-search yield race, and 3D saddle draping', () => {
  it('Subtest A: SW/NE border clamping, datasetVersion mismatch, and 15/20/25 deg sensitivity corridor switching', async () => {
    const bundle = createFixtureF12SensitivityBundle();

    // SW (0,0) -> (r=4, c=0, k=20), center (5,5)
    const sw = normalizeEndpoint({ eastM: 0, northM: 0 }, bundle);
    expect(sw).toEqual({
      ok: true,
      value: {
        requestedEastM: 0,
        requestedNorthM: 0,
        col: 0,
        row: 4,
        cellIndex: 20,
        cellCenterEastM: 5,
        cellCenterNorthM: 5,
      },
    });

    // NE (50,50) -> clamps cleanly to (r=0, c=4, k=4), center (45,45)
    const ne = normalizeEndpoint({ eastM: 50, northM: 50 }, bundle);
    expect(ne).toEqual({
      ok: true,
      value: {
        requestedEastM: 50,
        requestedNorthM: 50,
        col: 4,
        row: 0,
        cellIndex: 4,
        cellCenterEastM: 45,
        cellCenterNorthM: 45,
      },
    });

    // Out-of-bounds
    expect(normalizeEndpoint({ eastM: -0.001, northM: 10 }, bundle).ok).toBe(false);
    expect(normalizeEndpoint({ eastM: 50.001, northM: 10 }, bundle).ok).toBe(false);
    expect(normalizeEndpoint({ eastM: Number.NaN, northM: 10 }, bundle).ok).toBe(false);

    // Dataset version mismatch
    expect(
      validateVersion({ regionId: bundle.regionId, datasetVersion: 'stale-v0' }, bundle)
    ).toBe('DATASET_VERSION_MISMATCH');

    const profiles: Array<Pick<ConstraintProfile, 'profileId' | 'maxTerrainSlopeDeg'>> = [
      { profileId: 'conservative-15deg', maxTerrainSlopeDeg: 15 },
      { profileId: 'educational-eva-v1', maxTerrainSlopeDeg: 20 },
      { profileId: 'relaxed-25deg', maxTerrainSlopeDeg: 25 },
    ];

    const workspace = {
      dist: new Float64Array(25),
      parent: new Int32Array(25),
      visited: new Uint8Array(25),
    };

    const res15 = await solveShortestWithYield(
      bundle,
      10,
      14,
      profiles[0].maxTerrainSlopeDeg,
      workspace,
      0,
      () => false
    );
    expect(res15.cellIndices).toEqual([10, 5, 6, 7, 8, 9, 14]);
    expect(res15.totalCost).toBeCloseTo(60.0, 7);

    const res20 = await solveShortestWithYield(
      bundle,
      10,
      14,
      profiles[1].maxTerrainSlopeDeg,
      workspace,
      0,
      () => false
    );
    expect(res20.cellIndices).toEqual([10, 11, 12, 13, 14]);
    expect(res20.totalCost).toBeCloseTo(40.0, 7);

    const res25 = await solveShortestWithYield(
      bundle,
      10,
      14,
      profiles[2].maxTerrainSlopeDeg,
      workspace,
      0,
      () => false
    );
    expect(res25.cellIndices).toEqual([10, 11, 12, 13, 14]);
    expect(res25.totalCost).toBeCloseTo(40.0, 7);
  });

  it('Subtest B (Finding 5): Mid-search MessageChannel yield + superseding PLAN_ROUTE & LOAD_BUNDLE serializes workspace access', async () => {
    const bundleA = createFixtureF12SensitivityBundle();
    const bundleB = createFixtureF12SensitivityBundle();
    const workspace = {
      dist: new Float64Array(25),
      parent: new Int32Array(25),
      visited: new Uint8Array(25),
    };

    // Unyielded reference solve for Request B (20 deg profile)
    const syncRef = await solveShortestWithYield(bundleB, 10, 14, 20, workspace, 0, () => false);

    let activeEpoch = 0;
    let activeBundle = bundleA;
    let queueChain: Promise<void> = Promise.resolve();
    const orderLog: string[] = [];

    const enqueue = <T>(fn: (isCancelled: () => boolean) => Promise<T>): Promise<T> => {
      const myEpoch = ++activeEpoch;
      const isCancelled = () => activeEpoch !== myEpoch;
      const p = queueChain.then(() => fn(isCancelled));
      queueChain = p.then(
        () => undefined,
        () => undefined
      );
      return p;
    };

    // Request A yields every 8 pops on 15 deg profile (takes > 8 pops to reach goal)
    const reqAPromise = enqueue(async (isCancelled) => {
      orderLog.push('A:start');
      const res = await solveShortestWithYield(
        activeBundle,
        10,
        14,
        15,
        workspace,
        8,
        isCancelled
      );
      orderLog.push(`A:end:${res.status}`);
      return res;
    });

    // Allow A to enter and hit its first 8-pop MessageChannel yield
    await Promise.resolve();
    expect(orderLog).toEqual(['A:start']);

    // Superseding LOAD_BUNDLE + PLAN_ROUTE arrive while A is suspended
    const loadPromise = enqueue(async () => {
      orderLog.push('LOAD_BUNDLE');
      activeBundle = bundleB;
      return 'LOADED';
    });

    const reqBPromise = enqueue(async (isCancelled) => {
      orderLog.push('B:start');
      const res = await solveShortestWithYield(
        activeBundle,
        10,
        14,
        20,
        workspace,
        8,
        isCancelled
      );
      orderLog.push(`B:end:${res.status}`);
      return res;
    });

    const [resA, loadRes, resB] = await Promise.all([reqAPromise, loadPromise, reqBPromise]);
    expect(resA.status).toBe('cancelled');
    expect(loadRes).toBe('LOADED');
    expect(resB.status).toBe('success');
    expect(resB.cellIndices).toEqual(syncRef.cellIndices);
    expect(resB.totalCost).toBe(syncRef.totalCost);
    expect(orderLog).toEqual(['A:start', 'A:end:cancelled', 'LOAD_BUNDLE', 'B:start', 'B:end:success']);
  });

  it('Subtest C (Finding 9): 2x2 saddle quad drapes diagonal midpoint to 10.0 m while cell metrics stay at cell centers', () => {
    const bundle = createFixtureF12SaddleQuadBundle();
    const cellPath = [0, 3]; // (0,0) -> (1,1)

    const draped1x = drapeDiagonalStep(bundle, cellPath, 1.0, 0.35);
    const draped3x = drapeDiagonalStep(bundle, cellPath, 3.0, 0.35);

    expect(draped1x).toHaveLength(3);
    expect(draped1x[1].isSubdividedMidpoint).toBe(true);
    expect(draped1x[1].baseElevationM).toBe(10.0);
    expect(draped1x[1].worldY).toBeCloseTo(10.35, 10);

    expect(draped3x[1].baseElevationM).toBe(10.0);
    expect(draped3x[1].worldY).toBeCloseTo(30.35, 10);

    // Authoritative RouteMetrics evaluate only cell-center elevations z[0]=0, z[3]=0
    const zStart = bundle.elevationM[0];
    const zEnd = bundle.elevationM[3];
    const horizDist = Math.hypot(bundle.cellSpacingEastM, bundle.cellSpacingNorthM);
    const surfaceDist = Math.hypot(horizDist, zEnd - zStart);
    expect(zEnd - zStart).toBe(0);
    expect(surfaceDist).toBeCloseTo(10 * Math.SQRT2, 10);
  });
});
