import { QUALITY_CODE } from '../contracts/routing.js';

export function isValidElevationSample(z: number, noDataSentinel: number): boolean {
  return Number.isFinite(z) && Math.abs(z - noDataSentinel) > 1e-5;
}

export function buildElevationSupportMask(
  elevationM: Float32Array | Float64Array,
  qualityCode: Uint8Array,
  noDataSentinel: number
): Uint8Array {
  const n = elevationM.length;
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    mask[i] =
      isValidElevationSample(elevationM[i], noDataSentinel) &&
      qualityCode[i] !== QUALITY_CODE.INVALID
        ? 1
        : 0;
  }
  return mask;
}

export function createMaskedElevationGrid(
  elevationM: Float32Array | Float64Array,
  supportMask: Uint8Array
): Float64Array {
  const n = elevationM.length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = supportMask[i] === 1 ? elevationM[i] : Number.NaN;
  }
  return out;
}

export function bilinearResampleSupportedOnly(
  maskedElev: Float64Array,
  srcW: number,
  srcH: number,
  colFrac: number,
  rowFrac: number
): { supported: boolean; elevationM: number } {
  if (colFrac < 0 || colFrac > srcW - 1 || rowFrac < 0 || rowFrac > srcH - 1) {
    return { supported: false, elevationM: Number.NaN };
  }
  const c0 = Math.floor(colFrac);
  const r0 = Math.floor(rowFrac);
  const c1 = Math.min(srcW - 1, c0 + 1);
  const r1 = Math.min(srcH - 1, r0 + 1);
  const z00 = maskedElev[r0 * srcW + c0];
  const z10 = maskedElev[r0 * srcW + c1];
  const z01 = maskedElev[r1 * srcW + c0];
  const z11 = maskedElev[r1 * srcW + c1];
  if (!Number.isFinite(z00) || !Number.isFinite(z10) || !Number.isFinite(z01) || !Number.isFinite(z11)) {
    return { supported: false, elevationM: Number.NaN };
  }
  const tx = colFrac - c0;
  const ty = rowFrac - r0;
  const top = z00 * (1 - tx) + z10 * tx;
  const bottom = z01 * (1 - tx) + z11 * tx;
  return { supported: true, elevationM: top * (1 - ty) + bottom * ty };
}
