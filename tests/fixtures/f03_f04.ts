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

export const F03A_PATH_CELLS = [4, 5, 2] as const;
export const F03A_EXPECTED_LENGTH_M = 10.0;

export const F04_DEFAULT_MAX_TERRAIN_SLOPE_DEG = 20;

export function createFixtureF03SubtestABundle(): RegionRoutingBundle {
  const gridWidth = 3;
  const gridHeight = 3;
  const size = gridWidth * gridHeight;
  const noDataSentinel = -32768;
  const elevationM = new Float32Array(size).fill(-2540.0);
  const terrainSlopeDeg = new Float32Array(size).fill(0);
  const roughnessNormalized = new Float32Array(size).fill(0);
  const qualityCode = new Uint8Array(size).fill(QUALITY_CODE.ACCEPTABLE);

  // Block (0, 1) -> index 1
  elevationM[1] = noDataSentinel;
  qualityCode[1] = QUALITY_CODE.INVALID;

  return {
    regionId: 'fixture-f03a',
    datasetVersion: '1.0.0',
    gridWidth,
    gridHeight,
    cellSpacingEastM: 5,
    cellSpacingNorthM: 5,
    noDataSentinel,
    roughnessScaleM: 1,
    qualityMappingVersion: '1.0.0',
    elevationM,
    terrainSlopeDeg,
    roughnessNormalized,
    qualityCode,
  };
}

export function createFixtureF03SubtestBBundle(): RegionRoutingBundle {
  const bundle = createFixtureF03SubtestABundle();
  // Also block (1, 2) -> index 5
  bundle.regionId = 'fixture-f03b';
  bundle.elevationM[5] = bundle.noDataSentinel;
  bundle.qualityCode[5] = QUALITY_CODE.INVALID;
  return bundle;
}

export function createFixtureF04Bundle(): RegionRoutingBundle {
  const gridWidth = 7;
  const gridHeight = 7;
  const size = gridWidth * gridHeight;
  const elevationM = new Float32Array(size).fill(-2540.0);
  const terrainSlopeDeg = new Float32Array(size).fill(0);
  const roughnessNormalized = new Float32Array(size).fill(0);
  const qualityCode = new Uint8Array(size).fill(QUALITY_CODE.ACCEPTABLE);

  // Column c = 3 is an impassable ridge with s = 26 deg > 20 deg
  for (let r = 0; r < gridHeight; r++) {
    terrainSlopeDeg[r * gridWidth + 3] = 26;
  }

  return {
    regionId: 'fixture-f04',
    datasetVersion: '1.0.0',
    gridWidth,
    gridHeight,
    cellSpacingEastM: 10,
    cellSpacingNorthM: 10,
    noDataSentinel: -32768,
    roughnessScaleM: 1,
    qualityMappingVersion: '1.0.0',
    elevationM,
    terrainSlopeDeg,
    roughnessNormalized,
    qualityCode,
  };
}

function isCellPassable(
  bundle: RegionRoutingBundle,
  row: number,
  col: number,
  maxTerrainSlopeDeg: number
): boolean {
  if (row < 0 || row >= bundle.gridHeight || col < 0 || col >= bundle.gridWidth) {
    return false;
  }
  const idx = row * bundle.gridWidth + col;
  return (
    bundle.elevationM[idx] !== bundle.noDataSentinel &&
    bundle.qualityCode[idx] !== QUALITY_CODE.INVALID &&
    bundle.terrainSlopeDeg[idx] <= maxTerrainSlopeDeg
  );
}

export function countPassableNeighbors(
  bundle: RegionRoutingBundle,
  row: number,
  col: number,
  maxTerrainSlopeDeg = F04_DEFAULT_MAX_TERRAIN_SLOPE_DEG
): number {
  let count = 0;
  for (let d = 0; d < DIR_COUNT; d++) {
    const dr = DIR_DR[d];
    const dc = DIR_DC[d];
    const vr = row + dr;
    const vc = col + dc;
    if (!isCellPassable(bundle, vr, vc, maxTerrainSlopeDeg)) continue;
    if (DIR_IS_DIAG[d]) {
      if (
        !isCellPassable(bundle, row + dr, col, maxTerrainSlopeDeg) ||
        !isCellPassable(bundle, row, col + dc, maxTerrainSlopeDeg)
      ) {
        continue;
      }
    }
    count++;
  }
  return count;
}

export function solveReferenceShortestPath(
  bundle: RegionRoutingBundle,
  startRow: number,
  startCol: number,
  goalRow: number,
  goalCol: number,
  maxTerrainSlopeDeg = F04_DEFAULT_MAX_TERRAIN_SLOPE_DEG
): SinglePolicySolveResult {
  const w = bundle.gridWidth;
  const h = bundle.gridHeight;
  const n = w * h;

  if (
    !isCellPassable(bundle, startRow, startCol, maxTerrainSlopeDeg) ||
    !isCellPassable(bundle, goalRow, goalCol, maxTerrainSlopeDeg)
  ) {
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
      if (!isCellPassable(bundle, vr, vc, maxTerrainSlopeDeg)) continue;

      if (DIR_IS_DIAG[d]) {
        if (
          !isCellPassable(bundle, ur + dr, uc, maxTerrainSlopeDeg) ||
          !isCellPassable(bundle, ur, uc + dc, maxTerrainSlopeDeg)
        ) {
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
