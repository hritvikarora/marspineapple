import { describe, expect, it } from 'vitest';
import { QUALITY_CODE } from '../../src/contracts/routing.js';
import {
  bilinearResampleSupportedOnly,
  buildElevationSupportMask,
  createMaskedElevationGrid,
  isValidElevationSample,
} from '../../src/routing/elevationSupport.js';

describe('T06: Elevation-Support Mask & Uncontaminated Resampling Guard', () => {
  it('treats negative Martian elevations like -2540.0 m as valid when noDataSentinel is -32768', () => {
    expect(isValidElevationSample(-2540.0, -32768)).toBe(true);
    expect(isValidElevationSample(-32768, -32768)).toBe(false);
    expect(isValidElevationSample(Number.NaN, -32768)).toBe(false);
    expect(isValidElevationSample(Number.POSITIVE_INFINITY, -32768)).toBe(false);
  });

  it('masks finite INVALID cells to 0 and NaN, preventing bilinear contamination into adjacent samples', () => {
    const elev = new Float32Array([-2540, -2530, 1000, -2520]);
    const quality = new Uint8Array([
      QUALITY_CODE.ACCEPTABLE,
      QUALITY_CODE.ACCEPTABLE,
      QUALITY_CODE.INVALID,
      QUALITY_CODE.ACCEPTABLE,
    ]);

    const mask = buildElevationSupportMask(elev, quality, -32768);
    expect(Array.from(mask)).toEqual([1, 1, 0, 1]);

    const masked = createMaskedElevationGrid(elev, mask);
    expect(masked[0]).toBe(-2540);
    expect(masked[1]).toBe(-2530);
    expect(Number.isNaN(masked[2])).toBe(true);
    expect(masked[3]).toBe(-2520);

    const res = bilinearResampleSupportedOnly(masked, 2, 2, 0.5, 0.5);
    expect(res.supported).toBe(false);
    expect(Number.isNaN(res.elevationM)).toBe(true);
  });

  it('bilinearly resamples when all 4 surrounding posts are supported', () => {
    const elev = new Float32Array([10, 20, 30, 40]);
    const quality = new Uint8Array([
      QUALITY_CODE.ACCEPTABLE,
      QUALITY_CODE.UNKNOWN,
      QUALITY_CODE.LOW,
      QUALITY_CODE.ACCEPTABLE,
    ]);

    const mask = buildElevationSupportMask(elev, quality, -32768);
    const masked = createMaskedElevationGrid(elev, mask);

    const center = bilinearResampleSupportedOnly(masked, 2, 2, 0.5, 0.5);
    expect(center.supported).toBe(true);
    expect(center.elevationM).toBeCloseTo(25, 10);

    const edge = bilinearResampleSupportedOnly(masked, 2, 2, 1.0, 1.0);
    expect(edge.supported).toBe(true);
    expect(edge.elevationM).toBeCloseTo(40, 10);

    const oob = bilinearResampleSupportedOnly(masked, 2, 2, -0.1, 0.5);
    expect(oob.supported).toBe(false);
    expect(Number.isNaN(oob.elevationM)).toBe(true);
  });
});
