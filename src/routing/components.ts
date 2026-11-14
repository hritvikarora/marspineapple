import type {
  ConstraintProfile,
  QualityMode,
  RegionRoutingBundle,
} from '../contracts/routing.js';
import {
  DIR_COUNT,
  DIR_DC,
  DIR_DR,
  type CellAdmissibilityPort,
  type EdgeEvaluatorPort,
} from './types.js';

/**
 * Build the 8-bit admissible-neighbor mask and connected-component IDs for all
 * admissible cells in a region bundle using zero-allocation flat-array BFS.
 */
export function computeConnectedComponentsAndAdjMask(
  bundle: RegionRoutingBundle,
  profile: ConstraintProfile,
  qualityMode: QualityMode,
  edgeEvaluator: Pick<EdgeEvaluatorPort, 'isEdgeAdmissible'>,
  cellAdmissibility: CellAdmissibilityPort,
  componentIdOut: Int32Array,
  adjMaskOut: Uint8Array,
  bfsQueue: Int32Array
): { componentCount: number } {
  const width = bundle.gridWidth;
  const height = bundle.gridHeight;
  const totalCells = width * height;

  // Pass 1: Initialize component IDs to -1 and precompute 8-bit neighbor masks.
  for (let u = 0; u < totalCells; u++) {
    componentIdOut[u] = -1;
    const uRow = (u / width) | 0;
    const uCol = u - uRow * width;

    let mask = 0;
    for (let d = 0; d < DIR_COUNT; d++) {
      const nr = uRow + DIR_DR[d];
      const nc = uCol + DIR_DC[d];
      if (nr < 0 || nr >= height || nc < 0 || nc >= width) continue;
      const v = nr * width + nc;
      if (edgeEvaluator.isEdgeAdmissible(bundle, u, v, d, profile, qualityMode)) {
        mask |= 1 << d;
      }
    }
    adjMaskOut[u] = mask;
  }

  // Pass 2: Label connected components via flat-array BFS over admissible cells.
  let componentCount = 0;
  for (let u = 0; u < totalCells; u++) {
    if (componentIdOut[u] !== -1) continue;
    const uRow = (u / width) | 0;
    const uCol = u - uRow * width;
    if (cellAdmissibility.getCellExclusionReason(bundle, uRow, uCol, profile, qualityMode) !== null) {
      continue;
    }

    const compId = componentCount++;
    componentIdOut[u] = compId;
    let head = 0;
    let tail = 0;
    bfsQueue[tail++] = u;

    while (head < tail) {
      const curr = bfsQueue[head++];
      const currRow = (curr / width) | 0;
      const currCol = curr - currRow * width;
      const mask = adjMaskOut[curr];

      for (let d = 0; d < DIR_COUNT; d++) {
        if ((mask & (1 << d)) === 0) continue;
        const nr = currRow + DIR_DR[d];
        const nc = currCol + DIR_DC[d];
        const next = nr * width + nc;
        if (componentIdOut[next] === -1) {
          componentIdOut[next] = compId;
          bfsQueue[tail++] = next;
        }
      }
    }
  }

  return { componentCount };
}

/**
 * O(1) reachability check between two cell indices using precomputed component IDs.
 */
export function areCellsInSameComponent(
  componentId: Int32Array,
  startIndex: number,
  goalIndex: number
): boolean {
  if (
    startIndex < 0 ||
    goalIndex < 0 ||
    startIndex >= componentId.length ||
    goalIndex >= componentId.length
  ) {
    return false;
  }
  const startComp = componentId[startIndex];
  return startComp >= 0 && startComp === componentId[goalIndex];
}
