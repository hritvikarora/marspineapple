import {
  QUALITY_CODE,
  type RegionRoutingBundle,
} from '../../src/contracts/routing.js';
import {
  DIR_COUNT,
  DIR_DC,
  DIR_DR,
  DIR_IS_DIAG,
  type SinglePolicySolveResult,
} from '../../src/routing/types.js';

export const F11_SINGLE_DIAG_M = Math.sqrt(425);
export const F11_SUBTEST_B_PATH_M = Math.sqrt(425) + 10;
export const F11_SUBTEST_B_EUCLIDEAN_M = 25.0;

export function createFixtureF11Bundle(): RegionRoutingBundle {
  const gridWidth = 5;
  const gridHeight = 5;
  const size = gridWidth * gridHeight;
  const elevationM = new Float32Array(size).fill(-2540.0);
  const terrainSlopeDeg = new Float32Array(size).fill(0);
  const roughnessNormalized = new Float32Array(size).fill(0);
  const qualityCode = new Uint8Array(size).fill(QUALITY_CODE.ACCEPTABLE);

  return {
    regionId: 'fixture-f11',
    datasetVersion: '1.0.0',
    gridWidth,
    gridHeight,
    cellSpacingEastM: 20,
    cellSpacingNorthM: 5,
    noDataSentinel: -32768,
    roughnessScaleM: 1,
    qualityMappingVersion: '1.0.0',
    elevationM,
    terrainSlopeDeg,
    roughnessNormalized,
    qualityCode,
  };
}

function isCellPassable(bundle: RegionRoutingBundle, row: number, col: number): boolean {
  if (row < 0 || row >= bundle.gridHeight || col < 0 || col >= bundle.gridWidth) {
    return false;
  }
  const idx = row * bundle.gridWidth + col;
  return (
    bundle.elevationM[idx] !== bundle.noDataSentinel &&
    bundle.qualityCode[idx] !== QUALITY_CODE.INVALID
  );
}

export function solveReferenceShortestPath(
  bundle: RegionRoutingBundle,
  startRow: number,
  startCol: number,
  goalRow: number,
  goalCol: number
): SinglePolicySolveResult {
  const w = bundle.gridWidth;
  const h = bundle.gridHeight;
  const n = w * h;

  if (!isCellPassable(bundle, startRow, startCol) || !isCellPassable(bundle, goalRow, goalCol)) {
    return { status: 'no_path', cellIndices: [], totalCost: Infinity, exploredNodes: 0 };
  }

  const startIdx = startRow * w + startCol;
  const goalIdx = goalRow * w + goalCol;

  const dist = new Float64Array(n).fill(Infinity);
  const parent = new Int32Array(n).fill(-1);
  const visited = new Uint8Array(n);
  dist[startIdx] = 0;

  let exploredNodes = 0;
  for (let iter = 0; iter < n; iter++) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      if (!visited[i] && dist[i] < best) {
        best = dist[i];
        u = i;
      }
    }
    if (u === -1 || u === goalIdx) break;
    visited[u] = 1;
    exploredNodes++;

    const ur = Math.floor(u / w);
    const uc = u % w;

    for (let d = 0; d < DIR_COUNT; d++) {
      const dr = DIR_DR[d];
      const dc = DIR_DC[d];
      const vr = ur + dr;
      const vc = uc + dc;
      if (!isCellPassable(bundle, vr, vc)) continue;

      if (DIR_IS_DIAG[d]) {
        if (!isCellPassable(bundle, ur + dr, uc) || !isCellPassable(bundle, ur, uc + dc)) {
          continue;
        }
      }

      const stepCost = Math.hypot(dc * bundle.cellSpacingEastM, dr * bundle.cellSpacingNorthM);
      const v = vr * w + vc;
      const alt = dist[u] + stepCost;
      if (alt < dist[v]) {
        dist[v] = alt;
        parent[v] = u;
      }
    }
  }

  if (!Number.isFinite(dist[goalIdx])) {
    return { status: 'no_path', cellIndices: [], totalCost: Infinity, exploredNodes };
  }

  const cellIndices: number[] = [];
  for (let cur = goalIdx; cur !== -1; cur = parent[cur]) {
    cellIndices.push(cur);
  }
  cellIndices.reverse();

  return {
    status: 'success',
    cellIndices,
    totalCost: dist[goalIdx],
    exploredNodes,
  };
}
