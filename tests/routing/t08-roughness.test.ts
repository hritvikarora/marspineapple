import { describe, expect, it } from 'vitest';
import { computePlaneFitRoughnessGrid } from '../../src/routing/roughness.js';

describe('T08 Detrended 3x3 Plane-Fit RMS Roughness', () => {
  it('yields <= 1e-12 m residual on unquantized Float64Array tilted planes', () => {
    const width = 6;
    const height = 6;
    const dx = 10;
    const dy = 10;
    const tan12 = Math.tan((12 * Math.PI) / 180);
    const elev = new Float64Array(width * height);
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        // Arbitrary tilt in both X (12 deg) and Y
        elev[r * width + c] = -2540.0 + c * dx * tan12 - r * dy * 0.15;
      }
    }

    const { rmsResidualM, roughnessNormalized, derivativeSupportMask } = computePlaneFitRoughnessGrid(
      elev,
      width,
      height,
      0.5
    );

    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        const k = r * width + c;
        const isBorder = r === 0 || r === height - 1 || c === 0 || c === width - 1;
        if (isBorder) {
          expect(derivativeSupportMask[k]).toBe(0);
          expect(Number.isNaN(rmsResidualM[k])).toBe(true);
          expect(Number.isNaN(roughnessNormalized[k])).toBe(true);
        } else {
          expect(derivativeSupportMask[k]).toBe(1);
          expect(rmsResidualM[k]).toBeLessThanOrEqual(1e-12);
          expect(roughnessNormalized[k]).toBeLessThanOrEqual(1e-12);
        }
      }
    }
  });

  it('yields <= 1e-4 m residual on quantized Float32Array 12 deg plane', () => {
    const width = 6;
    const height = 6;
    const dx = 10;
    const tan12 = Math.tan((12 * Math.PI) / 180);
    const elev = new Float32Array(width * height);
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        elev[r * width + c] = -2540.0 + c * dx * tan12;
      }
    }

    const { rmsResidualM, derivativeSupportMask } = computePlaneFitRoughnessGrid(elev, width, height, 0.5);

    for (let r = 1; r < height - 1; r++) {
      for (let c = 1; c < width - 1; c++) {
        const k = r * width + c;
        expect(derivativeSupportMask[k]).toBe(1);
        expect(rmsResidualM[k]).toBeLessThanOrEqual(1e-4);
      }
    }
  });

  it('matches F07B 7x9 Float32Array ridge residuals and normalized roughness', () => {
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

    const { rmsResidualM, roughnessNormalized, derivativeSupportMask } = computePlaneFitRoughnessGrid(
      elevHalo,
      haloW,
      haloH,
      0.5
    );

    // Interior Row 0 corresponds to halo row 1, cols 1..7
    for (let c = 0; c < 7; c++) {
      const k = 1 * haloW + (c + 1);
      expect(derivativeSupportMask[k]).toBe(1);
      expect(rmsResidualM[k]).toBe(0);
      expect(roughnessNormalized[k]).toBe(0);
    }

    // Interior Row 3 corresponds to halo row 4, cols 1..7
    const expectedRow3 = [0.0, 0.589256, 0.0, 1.178511, 0.0, 0.589256, 0.0];
    const expectedNorm3 = [0, 1, 0, 1, 0, 1, 0];
    for (let c = 0; c < 7; c++) {
      const k = 4 * haloW + (c + 1);
      expect(derivativeSupportMask[k]).toBe(1);
      expect(Math.abs(rmsResidualM[k] - expectedRow3[c])).toBeLessThanOrEqual(1e-5);
      expect(roughnessNormalized[k]).toBe(expectedNorm3[c]);
    }
  });

  it('marks 3x3 windows touching unsupported or noData cells as unsupported', () => {
    const width = 5;
    const height = 5;
    const elev = new Float32Array(width * height).fill(-2540.0);
    const support = new Uint8Array(width * height).fill(1);
    support[2 * width + 2] = 0;

    const { rmsResidualM, roughnessNormalized, derivativeSupportMask } = computePlaneFitRoughnessGrid(
      elev,
      width,
      height,
      0.5,
      support
    );

    for (let r = 1; r < height - 1; r++) {
      for (let c = 1; c < width - 1; c++) {
        const k = r * width + c;
        expect(derivativeSupportMask[k]).toBe(0);
        expect(Number.isNaN(rmsResidualM[k])).toBe(true);
        expect(Number.isNaN(roughnessNormalized[k])).toBe(true);
      }
    }
  });
});
