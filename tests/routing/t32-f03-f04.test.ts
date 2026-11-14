import { describe, expect, it } from 'vitest';
import {
  countPassableNeighbors,
  createFixtureF03SubtestABundle,
  createFixtureF03SubtestBBundle,
  createFixtureF04Bundle,
  F03A_EXPECTED_LENGTH_M,
  F03A_PATH_CELLS,
  solveReferenceShortestPath,
} from '../fixtures/f03_f04.js';

describe('T32: Fixtures F03 & F04', () => {
  it('F03A: single blocked orthogonal corner (0,1) forces cardinal path [4, 5, 2] of 10.0 m', () => {
    const bundle = createFixtureF03SubtestABundle();
    const res = solveReferenceShortestPath(bundle, 1, 1, 0, 2);
    expect(res.status).toBe('success');
    expect(res.cellIndices).toEqual([...F03A_PATH_CELLS]);
    expect(Math.abs(res.totalCost - F03A_EXPECTED_LENGTH_M)).toBeLessThan(1e-7);
  });

  it('F03B: double checkerboard pinch (0,1) and (1,2) blocked returns no_path', () => {
    const bundle = createFixtureF03SubtestBBundle();
    const res = solveReferenceShortestPath(bundle, 1, 1, 0, 2);
    expect(res.status).toBe('no_path');
    expect(res.cellIndices).toEqual([]);
  });

  it('F04: separated multi-cell basin returns no_path despite goal (3,5) having degree 8', () => {
    const bundle = createFixtureF04Bundle();
    expect(countPassableNeighbors(bundle, 3, 5)).toBe(8);
    const res = solveReferenceShortestPath(bundle, 3, 1, 3, 5);
    expect(res.status).toBe('no_path');
    expect(res.cellIndices).toEqual([]);
  });
});
