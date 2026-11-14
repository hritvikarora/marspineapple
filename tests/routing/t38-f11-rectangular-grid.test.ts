import { describe, expect, it } from 'vitest';
import {
  createFixtureF11Bundle,
  F11_SINGLE_DIAG_M,
  F11_SUBTEST_B_EUCLIDEAN_M,
  F11_SUBTEST_B_PATH_M,
  solveReferenceShortestPath,
} from '../fixtures/f11.js';

describe('T38: Fixture F11 Rectangular Grid (20m x 5m)', () => {
  it('Subtest A: single diagonal step (3,0) -> (2,1) has length sqrt(425) m', () => {
    const bundle = createFixtureF11Bundle();
    const res = solveReferenceShortestPath(bundle, 3, 0, 2, 1);
    expect(res.status).toBe('success');
    expect(res.cellIndices).toEqual([15, 11]);
    expect(Math.abs(res.totalCost - F11_SINGLE_DIAG_M)).toBeLessThan(1e-7);
  });

  it('Subtest B (Finding 10): (3,0) -> (0,1) has 8-neighbor length sqrt(425) + 10 m (+22.46% > 8.24% over 25 m Euclidean)', () => {
    const bundle = createFixtureF11Bundle();
    const res = solveReferenceShortestPath(bundle, 3, 0, 0, 1);
    expect(res.status).toBe('success');
    expect(res.cellIndices.length).toBe(4);
    expect(Math.abs(res.totalCost - F11_SUBTEST_B_PATH_M)).toBeLessThan(1e-7);

    const excessRatio = (res.totalCost - F11_SUBTEST_B_EUCLIDEAN_M) / F11_SUBTEST_B_EUCLIDEAN_M;
    expect(excessRatio).toBeGreaterThan(0.0824);
    expect(Math.abs(excessRatio - 0.224621125)).toBeLessThan(1e-6);
  });
});
