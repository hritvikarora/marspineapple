/**
 * Coordinate validation helper for TASK-004. OWNER: Dhani (UI Role).
 * Validates local planar coordinates against the region grid extent.
 */
import { pointToCell } from '../../shared';
import type { GridSpec, LocalPoint } from '../../shared';

export function validateCoordinate(
  eastStr: string,
  northStr: string,
  grid: GridSpec,
): { point?: LocalPoint; error?: string } {
  const trimmedEast = eastStr.trim();
  const trimmedNorth = northStr.trim();

  if (!trimmedEast || !trimmedNorth) {
    return { error: 'Both East and North coordinates are required.' };
  }

  const east_m = Number(trimmedEast);
  const north_m = Number(trimmedNorth);

  if (!Number.isFinite(east_m) || !Number.isFinite(north_m)) {
    return { error: 'Coordinates must be valid finite numbers in meters.' };
  }

  const cell = pointToCell(grid, { east_m, north_m });
  if (!cell) {
    if (east_m < grid.extent.west_m) {
      return { error: `East coordinate ${east_m} m is outside extent (west limit is ${grid.extent.west_m} m).` };
    }
    if (east_m >= grid.extent.east_m) {
      return {
        error: `East coordinate ${east_m} m is outside extent (east limit is ${grid.extent.east_m} m; outer boundary is excluded).`,
      };
    }
    if (north_m <= grid.extent.south_m) {
      return {
        error: `North coordinate ${north_m} m is outside extent (south limit is ${grid.extent.south_m} m; outer boundary is excluded).`,
      };
    }
    if (north_m > grid.extent.north_m) {
      return { error: `North coordinate ${north_m} m is outside extent (north limit is ${grid.extent.north_m} m).` };
    }
    return { error: `Point (${east_m} m, ${north_m} m) is outside the regional grid extent.` };
  }

  return { point: { east_m, north_m } };
}
