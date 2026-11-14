/**
 * Compute 3x3 weighted Horn (1981) terrain slope in degrees and the complete-window
 * derivative support mask over an elevation raster.
 *
 * Border cells (r = 0, r = height - 1, c = 0, c = width - 1) and any interior cell
 * whose 3x3 neighborhood contains an unsupported, non-finite, or noData elevation
 * receive derivativeSupportMask = 0 and NaN slope.
 */
export function computeHornSlopeGrid(
  elevationM: Float32Array | Float64Array,
  width: number,
  height: number,
  dx: number,
  dy: number,
  cellSupportMask?: Uint8Array,
  noDataSentinel = -32768
): {
  slopeDeg: Float32Array;
  slopeDegFloat64: Float64Array;
  derivativeSupportMask: Uint8Array;
} {
  const n = width * height;
  const slopeDeg = new Float32Array(n);
  const slopeDegFloat64 = new Float64Array(n);
  const derivativeSupportMask = new Uint8Array(n);
  slopeDeg.fill(Number.NaN);
  slopeDegFloat64.fill(Number.NaN);

  const isCellValid = (idx: number): boolean => {
    if (cellSupportMask && cellSupportMask[idx] === 0) return false;
    const z = elevationM[idx];
    return Number.isFinite(z) && Math.abs(z - noDataSentinel) > 1e-5;
  };

  const radToDeg = 180 / Math.PI;
  for (let r = 1; r < height - 1; r++) {
    for (let c = 1; c < width - 1; c++) {
      const k = r * width + c;
      let allSupported = true;
      for (let dr = -1; dr <= 1 && allSupported; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!isCellValid((r + dr) * width + (c + dc))) {
            allSupported = false;
            break;
          }
        }
      }
      if (!allSupported) continue;

      const zNW = elevationM[(r - 1) * width + (c - 1)];
      const zN = elevationM[(r - 1) * width + c];
      const zNE = elevationM[(r - 1) * width + (c + 1)];
      const zW = elevationM[r * width + (c - 1)];
      const zE = elevationM[r * width + (c + 1)];
      const zSW = elevationM[(r + 1) * width + (c - 1)];
      const zS = elevationM[(r + 1) * width + c];
      const zSE = elevationM[(r + 1) * width + (c + 1)];

      // r - 1 is North, r + 1 is South
      const dzdx = (zNE + 2 * zE + zSE - (zNW + 2 * zW + zSW)) / (8 * dx);
      const dzdy = (zNW + 2 * zN + zNE - (zSW + 2 * zS + zSE)) / (8 * dy);
      const deg = Math.atan(Math.hypot(dzdx, dzdy)) * radToDeg;

      derivativeSupportMask[k] = 1;
      slopeDegFloat64[k] = deg;
      slopeDeg[k] = deg;
    }
  }

  return { slopeDeg, slopeDegFloat64, derivativeSupportMask };
}

/**
 * Extract the (haloHeight - 2) x (haloWidth - 2) interior raster from a 1-cell halo grid.
 */
export function cropHaloDerivativeGrid(
  grid: Float32Array,
  haloWidth: number,
  haloHeight: number
): Float32Array {
  const intW = Math.max(0, haloWidth - 2);
  const intH = Math.max(0, haloHeight - 2);
  const out = new Float32Array(intW * intH);
  for (let r = 0; r < intH; r++) {
    for (let c = 0; c < intW; c++) {
      out[r * intW + c] = grid[(r + 1) * haloWidth + (c + 1)];
    }
  }
  return out;
}
