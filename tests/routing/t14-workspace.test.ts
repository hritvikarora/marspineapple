import { describe, it, expect } from 'vitest';
import { SolverWorkspace } from '../../src/routing/workspace.js';

describe('T14: SolverWorkspace', () => {
  it('allocates TypedArrays with exact capacity and sentinel defaults', () => {
    const ws = new SolverWorkspace(16);
    expect(ws.capacity).toBe(16);
    expect(ws.gScore.length).toBe(16);
    expect(ws.fScore.length).toBe(16);
    expect(ws.crossScore.length).toBe(16);
    expect(ws.parentIndex.length).toBe(16);
    expect(ws.seenStamp.length).toBe(16);
    expect(ws.closedStamp.length).toBe(16);
    expect(ws.heapNodes.length).toBe(16);
    expect(ws.heapPos.length).toBe(16);
    expect(ws.componentId.length).toBe(16);
    expect(ws.adjMask.length).toBe(16);
    expect(ws.bfsQueue.length).toBe(16);

    expect(ws.heapPos.every((v) => v === -1)).toBe(true);
    expect(ws.componentId.every((v) => v === -1)).toBe(true);
  });

  it('increments currentSearchId in O(1) without clearing gScore/fScore', () => {
    const ws = new SolverWorkspace(4);
    ws.gScore[0] = 42.5;
    ws.fScore[0] = 99.5;

    const id1 = ws.beginSearch();
    const id2 = ws.beginSearch();

    expect(id1).toBe(1);
    expect(id2).toBe(2);
    expect(ws.gScore[0]).toBe(42.5);
    expect(ws.fScore[0]).toBe(99.5);
  });

  it('resets seenStamp and closedStamp safely on uint32 0xFFFFFFFF -> 1 wraparound', () => {
    const ws = new SolverWorkspace(4);
    ws.seenStamp.fill(0xffffffff);
    ws.closedStamp.fill(0xffffffff);
    ws.currentSearchId = 0xffffffff;

    const wrappedId = ws.beginSearch();
    expect(wrappedId).toBe(1);
    expect(ws.currentSearchId).toBe(1);
    expect(ws.seenStamp.every((v) => v === 0)).toBe(true);
    expect(ws.closedStamp.every((v) => v === 0)).toBe(true);
  });
});
