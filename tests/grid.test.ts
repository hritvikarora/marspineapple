import { describe, expect, it } from 'vitest';
import { cellCenter, pointToCell, toSceneXYZ, type GridSpec } from '../src/contracts';

const grid: GridSpec = {
  width: 4, height: 3, cellSizeEast_m: 10, cellSizeNorth_m: 5,
  extent: { west_m: 100, east_m: 140, south_m: 200, north_m: 215 },
  orientation: 'north-up', order: 'row-major', sampleConvention: 'cell-center',
};

describe('shared coordinate adapter (rectangular cells)', () => {
  it('row 0 is north, col 0 is west, samples at cell centres', () => {
    expect(cellCenter(grid, 0, 0)).toEqual({ east_m: 105, north_m: 212.5 });
    expect(cellCenter(grid, 2, 3)).toEqual({ east_m: 135, north_m: 202.5 });
  });
  it('pointToCell is the inverse and rejects outside points', () => {
    expect(pointToCell(grid, { east_m: 135, north_m: 202.5 })).toEqual({ row: 2, col: 3, index: 11 });
    expect(pointToCell(grid, { east_m: 100, north_m: 215 })).toEqual({ row: 0, col: 0, index: 0 });
    expect(pointToCell(grid, { east_m: 140, north_m: 210 })).toBeNull();
    expect(pointToCell(grid, { east_m: 99.9, north_m: 210 })).toBeNull();
    expect(pointToCell(grid, { east_m: Number.NaN, north_m: 210 })).toBeNull();
  });
  it('scene adapter maps east->X, elevation->Y, north->-Z', () => {
    expect(toSceneXYZ({ east_m: 1, north_m: 2 }, 3)).toEqual([1, 3, -2]);
  });
});
