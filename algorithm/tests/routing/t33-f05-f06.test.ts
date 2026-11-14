import { describe, expect, it } from 'vitest';
import {
  F05_DEST_POINT,
  F05_EXPECTED_CELL_INDEX,
  F05_START_POINT,
  F06_CORNER_CLEAR_DETOUR,
  F06_CORNER_CLIPPING_COST_GAMMA2,
  F06_CORNER_CLIPPING_PATH,
  F06_CROSSOVER_GAMMA,
  F06_DETOUR_LENGTH_M,
  F06_DIRECT_LENGTH_M,
  F06_DIRECT_LOW_QUALITY_M,
  F06_DIRECT_PATH,
  createFixtureF05AdmissibleBundle,
  createFixtureF05InterpolatedCenterBundle,
  createFixtureF06Bundle,
  evaluatePathCost,
  solveReferenceRoute,
} from '../fixtures/f05_f06.js';

describe('T33: Fixtures F05 & F06', () => {
  describe('F05: Same-Cell Admissible vs. INTERPOLATED Rejection', () => {
    it('Subtest A: admissible same-cell request returns [12] with 0 m distance and finite 0% quality', () => {
      const bundle = createFixtureF05AdmissibleBundle();

      for (const policy of ['shortest', 'terrain', 'uncertainty'] as const) {
        const res = solveReferenceRoute(bundle, F05_START_POINT, F05_DEST_POINT, policy, 'prefer');
        expect(res.status).toBe('success');
        if (res.status !== 'success') continue;

        expect(res.cellIndices).toEqual([F05_EXPECTED_CELL_INDEX]);
        expect(res.horizontalDistanceM).toBe(0);
        expect(res.surfaceDistanceM).toBe(0);
        expect(res.cumulativeAscentM).toBe(0);
        expect(res.cumulativeDescentM).toBe(0);
        expect(res.maxRouteGradeDeg).toBe(0);
        expect(res.totalCost).toBe(0);
        expect(res.lowQualityPct).toBe(0);
        expect(Number.isNaN(res.lowQualityPct)).toBe(false);
        expect(res.unknownQualityPct).toBe(0);
        expect(res.acceptableQualityPct).toBe(0);
      }
    });

    it('Subtest B: finite-elevation INTERPOLATED cell rejects same-cell request in prefer mode before shortcut', () => {
      const bundle = createFixtureF05InterpolatedCenterBundle();
      expect(bundle.elevationM[F05_EXPECTED_CELL_INDEX]).toBe(-2540.0);
      expect(bundle.terrainSlopeDeg[F05_EXPECTED_CELL_INDEX]).toBe(0.0);

      for (const policy of ['shortest', 'terrain', 'uncertainty'] as const) {
        const res = solveReferenceRoute(bundle, F05_START_POINT, F05_DEST_POINT, policy, 'prefer');
        expect(res).toEqual({
          status: 'invalid_input',
          endpoint: 'start',
          reasonCode: 'INTERPOLATED_OR_UNRELIABLE',
        });
      }
    });
  });

  describe('F06: Corner-Clear Low-Quality Detour', () => {
    const startPt = { eastM: 5, northM: 15 }; // (r=1, c=0) -> k=5
    const goalPt = { eastM: 45, northM: 15 }; // (r=1, c=4) -> k=9

    it('selects the 40.0 m direct shortcut for shortest and terrain policies', () => {
      const bundle = createFixtureF06Bundle();

      for (const policy of ['shortest', 'terrain'] as const) {
        const res = solveReferenceRoute(bundle, startPt, goalPt, policy, 'prefer');
        expect(res.status).toBe('success');
        if (res.status !== 'success') continue;

        expect(res.cellIndices).toEqual([...F06_DIRECT_PATH]);
        expect(res.horizontalDistanceM).toBeCloseTo(F06_DIRECT_LENGTH_M, 8);
        expect(res.totalCost).toBeCloseTo(F06_DIRECT_LENGTH_M, 8);
        expect(res.lowQualityDistanceM).toBeCloseTo(F06_DIRECT_LOW_QUALITY_M, 8);
        expect(res.lowQualityPct).toBeCloseTo(50.0, 8);
      }
    });

    it('penalizes the corner-clipping path [(1,0),(1,1),(0,2),(1,3),(1,4)] to 20 + 60*sqrt(2) under gamma = 2', () => {
      const bundle = createFixtureF06Bundle();
      const clipped = evaluatePathCost(bundle, F06_CORNER_CLIPPING_PATH, {
        alpha: 2,
        beta: 1,
        gamma: 2,
      });

      expect(clipped.horizontalDistanceM).toBeCloseTo(F06_DETOUR_LENGTH_M, 8);
      expect(clipped.totalCost).toBeCloseTo(F06_CORNER_CLIPPING_COST_GAMMA2, 8);
      expect(clipped.totalCost).toBeCloseTo(104.85281374, 6);
    });

    it('verifies exact crossover gamma = sqrt(2) - 1 and selects corner-clear detour for uncertainty (gamma = 2)', () => {
      expect(F06_CROSSOVER_GAMMA).toBeCloseTo(0.41421356, 8);

      const bundle = createFixtureF06Bundle();
      const directAtCrossover = evaluatePathCost(bundle, F06_DIRECT_PATH, {
        alpha: 2,
        beta: 1,
        gamma: F06_CROSSOVER_GAMMA,
      });
      const detourAtCrossover = evaluatePathCost(bundle, F06_CORNER_CLEAR_DETOUR, {
        alpha: 2,
        beta: 1,
        gamma: F06_CROSSOVER_GAMMA,
      });
      expect(directAtCrossover.totalCost).toBeCloseTo(detourAtCrossover.totalCost, 8);

      const res = solveReferenceRoute(bundle, startPt, goalPt, 'uncertainty', 'prefer');
      expect(res.status).toBe('success');
      if (res.status !== 'success') return;

      expect(res.cellIndices).toEqual([...F06_CORNER_CLEAR_DETOUR]);
      expect(res.horizontalDistanceM).toBeCloseTo(F06_DETOUR_LENGTH_M, 8);
      expect(res.totalCost).toBeCloseTo(48.28427125, 6);
      expect(res.lowQualityDistanceM).toBe(0);
      expect(res.lowQualityPct).toBe(0);
    });
  });
});
