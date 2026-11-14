/**
 * THE shared coordinate adapter. Map, 3D and routing must use these instead of re-deriving.
 * See geometry.ts for conventions.
 */
import type { CellRef, LocalPoint } from './geometry';
import type { GridSpec } from './manifest';

export function cellIndex(grid: Pick<GridSpec, 'width'>, row: number, col: number): number {
  return row * grid.width + col;
}

export function cellRef(grid: Pick<GridSpec, 'width'>, index: number): CellRef {
  return { row: Math.floor(index / grid.width), col: index % grid.width, index };
}

export function cellCenter(grid: GridSpec, row: number, col: number): LocalPoint {
  return {
    east_m: grid.extent.west_m + (col + 0.5) * grid.cellSizeEast_m,
    north_m: grid.extent.north_m - (row + 0.5) * grid.cellSizeNorth_m,
  };
}

/** Containing cell of a local point, or null if outside the extent. Points on the east/south outer edge are outside. */
export function pointToCell(grid: GridSpec, p: LocalPoint): CellRef | null {
  if (!Number.isFinite(p.east_m) || !Number.isFinite(p.north_m)) return null;
  const col = Math.floor((p.east_m - grid.extent.west_m) / grid.cellSizeEast_m);
  const row = Math.floor((grid.extent.north_m - p.north_m) / grid.cellSizeNorth_m);
  if (col < 0 || row < 0 || col >= grid.width || row >= grid.height) return null;
  return { row, col, index: cellIndex(grid, row, col) };
}

/** Three.js adapter (Role B): X = east, Y = elevation, Z = -north. Subtract display origins outside. */
export function toSceneXYZ(p: LocalPoint, elevation_m: number): [number, number, number] {
  return [p.east_m, elevation_m, -p.north_m];
}
