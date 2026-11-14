import type { LocalMeterPoint, NormalizedGridPoint } from '../contracts/routing.js';
import { DIR_IS_DIAG, DIR_DR } from '../routing/types.js';

export function rowColToIndex(row: number, col: number, width: number): number {
  return row * width + col;
}

export function indexToRowCol(index: number, width: number): { row: number; col: number } {
  const row = Math.floor(index / width);
  const col = index - row * width;
  return { row, col };
}

export function cellCenterToLocalMeters(
  row: number,
  col: number,
  height: number,
  dx: number,
  dy: number
): LocalMeterPoint {
  return {
    eastM: (col + 0.5) * dx,
    northM: (height - 1 - row + 0.5) * dy,
  };
}

export function localMetersToGridPoint(
  point: LocalMeterPoint,
  width: number,
  height: number,
  dx: number,
  dy: number
): { ok: true; value: NormalizedGridPoint } | { ok: false; reasonCode: 'OUT_OF_BOUNDS'; message: string } {
  const maxEastM = width * dx;
  const maxNorthM = height * dy;
  if (
    !Number.isFinite(point.eastM) ||
    !Number.isFinite(point.northM) ||
    point.eastM < 0 ||
    point.eastM > maxEastM ||
    point.northM < 0 ||
    point.northM > maxNorthM
  ) {
    return {
      ok: false,
      reasonCode: 'OUT_OF_BOUNDS',
      message: `Point (${point.eastM}, ${point.northM}) lies outside [0, ${maxEastM}] x [0, ${maxNorthM}] m.`,
    };
  }
  const col = Math.min(width - 1, Math.max(0, Math.floor(point.eastM / dx)));
  const row = Math.min(height - 1, Math.max(0, Math.floor((maxNorthM - point.northM) / dy)));
  const cellIndex = row * width + col;
  const center = cellCenterToLocalMeters(row, col, height, dx, dy);
  return {
    ok: true,
    value: {
      requestedEastM: point.eastM,
      requestedNorthM: point.northM,
      col,
      row,
      cellIndex,
      cellCenterEastM: center.eastM,
      cellCenterNorthM: center.northM,
    },
  };
}

export function stepPlanarDistanceM(dir: number, dx: number, dy: number): number {
  if (DIR_IS_DIAG[dir] === 1) return Math.hypot(dx, dy);
  return DIR_DR[dir] !== 0 ? dy : dx;
}
