/**
 * Shared spatial vocabulary. OWNER: Role C (integration). Change only via INTERFACE.md review.
 *
 * Conventions (frozen v1):
 *  - Local planar frame in metres: `east_m` grows to the east, `north_m` grows to the north.
 *  - Grid is north-up, row-major. Row 0 is the NORTH edge, column 0 is the WEST edge.
 *  - Flat index = row * width + col.
 *  - Samples represent CELL CENTRES: centre(row, col) =
 *      east_m  = extent.west_m  + (col + 0.5) * cellSizeEast_m
 *      north_m = extent.north_m - (row + 0.5) * cellSizeNorth_m
 *  - Elevation is metres relative to the manifest's `verticalReference` (negative values are valid).
 *  - No `x`, `y`, `lat`, `lng` fields in shared contracts.
 */

/** A position in the local planar frame of the loaded region (metres). */
export interface LocalPoint {
  east_m: number;
  north_m: number;
}

/** A path vertex: cell centre plus its elevation sample (metres, manifest vertical reference). */
export interface LocalPoint3 extends LocalPoint {
  elevation_m: number;
}

export interface CellRef {
  row: number;
  col: number;
  /** row * width + col */
  index: number;
}

/** Outer edges (not centres) of the delivered grid, in the local frame. */
export interface Extent {
  west_m: number;
  east_m: number;
  south_m: number;
  north_m: number;
}
