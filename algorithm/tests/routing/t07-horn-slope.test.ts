import { describe, expect, it } from 'vitest';
import { computeHornSlopeGrid, cropHaloDerivativeGrid } from '../../src/routing/hornSlope.js';

describe('T07 3x3 Weighted Horn Slope & Support Mask', () => {
  it('computes exact 12.0 deg slope on Float64Array inclined plane and marks borders unsupported', () => {
    const width = 5;
    const height = 5;
    const dx = 10;
    const dy = 10;
    const tan12 = Math.tan((12 * Math.PI) / 180);
    const elev = new Float64Array(width * height);
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        elev[r * width + c] = -2540.0 + c * dx * tan12;
      }
    }

    const { slopeDeg, slopeDegFloat64, derivativeSupportMask } = computeHornSlopeGrid(
      elev,
      width,
      height,
      dx,
      dy
    );

    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        const k = r * width + c;
        const isBorder = r === 0 || r === height - 1 || c === 0 || c === width - 1;
        if (isBorder) {
          expect(derivativeSupportMask[k]).toBe(0);
          expect(Number.isNaN(slopeDeg[k])).toBe(true);
          expect(Number.isNaN(slopeDegFloat64[k])).toBe(true);
        } else {
          expect(derivativeSupportMask[k]).toBe(1);
          expect(Math.abs(slopeDegFloat64[k] - 12.0)).toBeLessThanOrEqual(1e-12);
          expect(Math.abs(slopeDeg[k] - 12.0)).toBeLessThanOrEqual(1e-5);
        }
      }
    }
  });

  it('matches quantized Float32Array 12.0 deg plane within <= 1e-3 deg', () => {
    const width = 6;
    const height = 6;
    const dx = 10;
    const dy = 10;
    const tan12 = Math.tan((12 * Math.PI) / 180);
    const elev = new Float32Array(width * height);
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        elev[r * width + c] = -2540.0 + c * dx * tan12;
      }
    }

    const { slopeDeg, derivativeSupportMask } = computeHornSlopeGrid(elev, width, height, dx, dy);

    for (let r = 1; r < height - 1; r++) {
      for (let c = 1; c < width - 1; c++) {
        const k = r * width + c;
        expect(derivativeSupportMask[k]).toBe(1);
        expect(Math.abs(slopeDeg[k] - 12.0)).toBeLessThanOrEqual(1e-3);
        expect(slopeDeg[k]).toBeGreaterThanOrEqual(11.999);
        expect(slopeDeg[k]).toBeLessThanOrEqual(12.001);
      }
    }
  });

  it('propagates a single unsupported cell at (2, 2) to all 9 touching 3x3 windows', () => {
    const width = 6;
    const height = 6;
    const elev = new Float64Array(width * height).fill(-2540.0);
    const support = new Uint8Array(width * height).fill(1);
    support[2 * width + 2] = 0;

    const { slopeDeg, derivativeSupportMask } = computeHornSlopeGrid(elev, width, height, 10, 10, support);

    for (let r = 1; r < height - 1; r++) {
      for (let c = 1; c < width - 1; c++) {
        const k = r * width + c;
        const touches22 = Math.abs(r - 2) <= 1 && Math.abs(c - 2) <= 1;
        if (touches22) {
          expect(derivativeSupportMask[k]).toBe(0);
          expect(Number.isNaN(slopeDeg[k])).toBe(true);
        } else {
          expect(derivativeSupportMask[k]).toBe(1);
          expect(slopeDeg[k]).toBe(0);
        }
      }
    }

    // Also verify noDataSentinel and NaN elevation behave identically
    const elevWithNoData = new Float32Array(width * height).fill(-2540.0);
    elevWithNoData[2 * width + 2] = -32768;
    const resNoData = computeHornSlopeGrid(elevWithNoData, width, height, 10, 10);
    for (let r = 1; r <= 3; r++) {
      for (let c = 1; c <= 3; c++) {
        expect(resNoData.derivativeSupportMask[r * width + c]).toBe(0);
      }
    }
    expect(resNoData.derivativeSupportMask[4 * width + 4]).toBe(1);
  });

  it('crops F07B 7x9 halo ridge to 5x7 interior with expected Horn slopes', () => {
    const haloW = 9;
    const haloH = 7;
    const elevHalo = new Float32Array(haloW * haloH);
    for (let rh = 0; rh < haloH; rh++) {
      for (let ch = 0; ch < haloW; ch++) {
        let z = -2540.0;
        if (rh >= 3 && rh <= 6) {
          if (ch === 4) z = -2535.0;
          else if (ch === 3 || ch === 5) z = -2537.5;
        }
        elevHalo[rh * haloW + ch] = z;
      }
    }

    const { slopeDeg } = computeHornSlopeGrid(elevHalo, haloW, haloH, 10, 10);
    const cropped = cropHaloDerivativeGrid(slopeDeg, haloW, haloH);

    expect(cropped.length).toBe(5 * 7);
    // Interior Row 0: 0 deg across all 7 columns
    for (let c = 0; c < 7; c++) {
      expect(cropped[0 * 7 + c]).toBe(0);
    }
    // Interior Row 3: [0.0000, 7.1250, 14.0362, 0.0000, 14.0362, 7.1250, 0.0000]
    const expectedRow3 = [0, 7.125, 14.0362, 0, 14.0362, 7.125, 0];
    for (let c = 0; c < 7; c++) {
      expect(Math.abs(cropped[3 * 7 + c] - expectedRow3[c])).toBeLessThan(1e-4);
    }
  });
});
