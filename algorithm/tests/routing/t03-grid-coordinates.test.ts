import { describe, expect, it } from 'vitest';
import {
  cellCenterToLocalMeters,
  indexToRowCol,
  localMetersToGridPoint,
  rowColToIndex,
  stepPlanarDistanceM,
} from '../../src/coordinates/grid.js';

describe('T03: North-Up Row-Major Coordinate Adapter & Boundary Clamping', () => {
  it('converts between row/col and flat row-major index', () => {
    expect(rowColToIndex(4, 0, 5)).toBe(20);
    expect(rowColToIndex(2, 2, 5)).toBe(12);
    expect(indexToRowCol(20, 5)).toEqual({ row: 4, col: 0 });
    expect(indexToRowCol(12, 5)).toEqual({ row: 2, col: 2 });
  });

  it('maps southwest corner (0, 0) on a 5x5 grid (dx=5, dy=5) to (row=4, col=0, k=20) with center (2.5, 2.5)', () => {
    const res = localMetersToGridPoint({ eastM: 0, northM: 0 }, 5, 5, 5, 5);
    expect(res).toEqual({
      ok: true,
      value: {
        requestedEastM: 0,
        requestedNorthM: 0,
        col: 0,
        row: 4,
        cellIndex: 20,
        cellCenterEastM: 2.5,
        cellCenterNorthM: 2.5,
      },
    });
  });

  it('clamps exact northeast border (25.0, 25.0) on 5x5 grid to (row=0, col=4, k=4) with center (22.5, 22.5)', () => {
    const res = localMetersToGridPoint({ eastM: 25.0, northM: 25.0 }, 5, 5, 5, 5);
    expect(res).toEqual({
      ok: true,
      value: {
        requestedEastM: 25.0,
        requestedNorthM: 25.0,
        col: 4,
        row: 0,
        cellIndex: 4,
        cellCenterEastM: 22.5,
        cellCenterNorthM: 22.5,
      },
    });
  });

  it('maps interior point (11.1, 14.2) on 5x5 grid (5m, 5m) to (row=2, col=2, k=12) with center (12.5, 12.5)', () => {
    const res = localMetersToGridPoint({ eastM: 11.1, northM: 14.2 }, 5, 5, 5, 5);
    expect(res).toEqual({
      ok: true,
      value: {
        requestedEastM: 11.1,
        requestedNorthM: 14.2,
        col: 2,
        row: 2,
        cellIndex: 12,
        cellCenterEastM: 12.5,
        cellCenterNorthM: 12.5,
      },
    });
  });

  it('supports rectangular grid (4x4, dx=20, dy=5) NE border and step planar distances', () => {
    const res = localMetersToGridPoint({ eastM: 80.0, northM: 20.0 }, 4, 4, 20, 5);
    expect(res).toEqual({
      ok: true,
      value: {
        requestedEastM: 80.0,
        requestedNorthM: 20.0,
        col: 3,
        row: 0,
        cellIndex: 3,
        cellCenterEastM: 70.0,
        cellCenterNorthM: 17.5,
      },
    });

    expect(cellCenterToLocalMeters(0, 3, 4, 20, 5)).toEqual({ eastM: 70.0, northM: 17.5 });
    expect(stepPlanarDistanceM(0, 20, 5)).toBe(5);
    expect(stepPlanarDistanceM(4, 20, 5)).toBe(5);
    expect(stepPlanarDistanceM(2, 20, 5)).toBe(20);
    expect(stepPlanarDistanceM(6, 20, 5)).toBe(20);
    expect(stepPlanarDistanceM(1, 20, 5)).toBeCloseTo(Math.sqrt(425), 10);
    expect(stepPlanarDistanceM(3, 20, 5)).toBeCloseTo(Math.sqrt(425), 10);
    expect(stepPlanarDistanceM(5, 20, 5)).toBeCloseTo(Math.sqrt(425), 10);
    expect(stepPlanarDistanceM(7, 20, 5)).toBeCloseTo(Math.sqrt(425), 10);
  });

  it('rejects out-of-bounds and non-finite points with OUT_OF_BOUNDS', () => {
    for (const pt of [
      { eastM: -0.001, northM: 10 },
      { eastM: 25.001, northM: 10 },
      { eastM: 10, northM: -0.001 },
      { eastM: 10, northM: 25.001 },
      { eastM: Number.NaN, northM: 10 },
      { eastM: 10, northM: Number.POSITIVE_INFINITY },
    ]) {
      const res = localMetersToGridPoint(pt, 5, 5, 5, 5);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.reasonCode).toBe('OUT_OF_BOUNDS');
      }
    }
  });
});
