import { describe, expect, it } from 'vitest';
import { BinaryMinHeap, hasHigherPriority } from '../../src/routing/binaryHeap.js';

describe('T15 Indexed Binary Min-Heap with Strict Weak Lexicographic Ordering', () => {
  it('enforces strict transitivity on micro-spaced fScores and pops [A, B, C] for all 6 permutations', () => {
    const n = 3;
    const fScore = new Float64Array([10, 10 + 0.75e-9, 10 + 1.5e-9]);
    const gScore = new Float64Array([1, 2, 3]);
    const crossScore = new Float64Array([0, 0, 0]);
    const [A, B, C] = [0, 1, 2];

    expect(hasHigherPriority(A, B, fScore, gScore, crossScore)).toBe(true);
    expect(hasHigherPriority(B, C, fScore, gScore, crossScore)).toBe(true);
    expect(hasHigherPriority(A, C, fScore, gScore, crossScore)).toBe(true);

    expect(hasHigherPriority(B, A, fScore, gScore, crossScore)).toBe(false);
    expect(hasHigherPriority(C, B, fScore, gScore, crossScore)).toBe(false);
    expect(hasHigherPriority(C, A, fScore, gScore, crossScore)).toBe(false);
    expect(hasHigherPriority(A, A, fScore, gScore, crossScore)).toBe(false);

    const permutations = [
      [A, B, C],
      [A, C, B],
      [B, A, C],
      [B, C, A],
      [C, A, B],
      [C, B, A],
    ];

    const heapNodes = new Int32Array(n);
    const heapPos = new Int32Array(n).fill(-1);
    const heap = new BinaryMinHeap(heapNodes, heapPos, fScore, gScore, crossScore);

    for (const perm of permutations) {
      heap.clear();
      for (const node of perm) {
        heap.pushOrDecreaseKey(node);
      }
      expect(heap.size).toBe(3);
      const popped = [heap.popMin(), heap.popMin(), heap.popMin()];
      expect(popped).toEqual([A, B, C]);
      expect(heap.size).toBe(0);
      expect(heap.popMin()).toBe(-1);
    }
  });

  it('breaks ties by larger gScore, then smaller crossScore, then smaller cellIndex', () => {
    const fScore = new Float64Array([10, 10, 10, 10]);
    const gScore = new Float64Array([4, 5, 5, 5]);
    const crossScore = new Float64Array([0, 2, 1, 1]);
    // Priorities:
    // node 2: f=10, g=5, cross=1, idx=2 (highest)
    // node 3: f=10, g=5, cross=1, idx=3
    // node 1: f=10, g=5, cross=2, idx=1
    // node 0: f=10, g=4, cross=0, idx=0 (lowest)
    const heapNodes = new Int32Array(4);
    const heapPos = new Int32Array(4).fill(-1);
    const heap = new BinaryMinHeap(heapNodes, heapPos, fScore, gScore, crossScore);

    heap.pushOrDecreaseKey(0);
    heap.pushOrDecreaseKey(1);
    heap.pushOrDecreaseKey(3);
    heap.pushOrDecreaseKey(2);

    expect([heap.popMin(), heap.popMin(), heap.popMin(), heap.popMin()]).toEqual([2, 3, 1, 0]);
  });

  it('updates existing node in place on pushOrDecreaseKey without creating duplicates', () => {
    const fScore = new Float64Array([30, 10, 20]);
    const gScore = new Float64Array([1, 1, 1]);
    const crossScore = new Float64Array([0, 0, 0]);
    const heapNodes = new Int32Array(3);
    const heapPos = new Int32Array(3).fill(-1);
    const heap = new BinaryMinHeap(heapNodes, heapPos, fScore, gScore, crossScore);

    heap.pushOrDecreaseKey(0);
    heap.pushOrDecreaseKey(1);
    heap.pushOrDecreaseKey(2);
    expect(heap.size).toBe(3);

    // Improve node 0 to become the best
    fScore[0] = 5;
    heap.pushOrDecreaseKey(0);
    expect(heap.size).toBe(3);

    expect(heap.popMin()).toBe(0);
    expect(heap.popMin()).toBe(1);
    expect(heap.popMin()).toBe(2);
    expect(heap.popMin()).toBe(-1);
    expect(Array.from(heapPos)).toEqual([-1, -1, -1]);
  });
});
