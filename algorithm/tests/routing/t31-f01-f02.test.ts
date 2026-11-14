import { describe, expect, it } from 'vitest';
import {
  createFixtureF01Bundle,
  createFixtureF02Bundle,
  F01_SUBTEST_A_CARDINAL_M,
  F01_SUBTEST_B_DIAGONAL_M,
  F01_SUBTEST_C_OCTILE_M,
  F02_EXPECTED_LENGTH_M,
  F02_GAP_PATH_CELLS,
  solveReferenceShortestPath,
} from '../fixtures/f01_f02.js';

describe('T31: Fixtures F01 & F02', () => {
  it('F01 Subtest A: cardinal East (2,0) -> (2,4) on negative Martian elevation', () => {
    const bundle = createFixtureF01Bundle();
    const res = solveReferenceShortestPath(bundle, 2, 0, 2, 4);
    expect(res.status).toBe('success');
    expect(res.cellIndices).toEqual([10, 11, 12, 13, 14]);
    expect(Math.abs(res.totalCost - F01_SUBTEST_A_CARDINAL_M)).toBeLessThan(1e-7);
  });

  it('F01 Subtest B: pure diagonal NE (4,0) -> (0,4)', () => {
    const bundle = createFixtureF01Bundle();
    const res = solveReferenceShortestPath(bundle, 4, 0, 0, 4);
    expect(res.status).toBe('success');
    expect(res.cellIndices).toEqual([20, 16, 12, 8, 4]);
    expect(Math.abs(res.totalCost - F01_SUBTEST_B_DIAGONAL_M)).toBeLessThan(1e-7);
  });

  it('F01 Subtest C: octile mix (4,0) -> (2,4)', () => {
    const bundle = createFixtureF01Bundle();
    const res = solveReferenceShortestPath(bundle, 4, 0, 2, 4);
    expect(res.status).toBe('success');
    expect(res.cellIndices.length).toBe(5);
    expect(Math.abs(res.totalCost - F01_SUBTEST_C_OCTILE_M)).toBeLessThan(1e-7);
  });

  it('F02: wall barrier with 1-cell gap at (0,2) and no-corner-cutting', () => {
    const bundle = createFixtureF02Bundle();
    const res = solveReferenceShortestPath(bundle, 2, 0, 2, 4);
    expect(res.status).toBe('success');
    expect(res.cellIndices.length).toBe(F02_GAP_PATH_CELLS.length);
    expect(res.cellIndices[0]).toBe(F02_GAP_PATH_CELLS[0]);
    expect(res.cellIndices.slice(2)).toEqual(F02_GAP_PATH_CELLS.slice(2));
    expect(Math.abs(res.totalCost - F02_EXPECTED_LENGTH_M)).toBeLessThan(1e-7);
  });
});
