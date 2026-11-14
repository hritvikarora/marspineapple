/**
 * Compute detrended 3x3 least-squares plane-fit RMS roughness residuals and
 * normalized roughness values R in [0, 1].
 *
 * Uses the orthogonal centered coordinates xi = dc in {-1, 0, +1} and
 * eta = -dr in {-1, 0, +1} so the best-fit plane z_hat = a*xi + b*eta + c0
 * has exact closed-form coefficients c0 = sum(z)/9, a = sum(xi*z)/6, b = sum(eta*z)/6.
 */
export function computePlaneFitRoughnessGrid(
  elevationM: Float32Array | Float64Array,
  width: number,
  height: number,
  roughnessScaleM = 0.5,
  cellSupportMask?: Uint8Array,
  noDataSentinel = -32768
): {
  rmsResidualM: Float64Array;
  roughnessNormalized: Float32Array;
  derivativeSupportMask: Uint8Array;
} {
  const n = width * height;
  const rmsResidualM = new Float64Array(n);
  const roughnessNormalized = new Float32Array(n);
  const derivativeSupportMask = new Uint8Array(n);
  rmsResidualM.fill(Number.NaN);
  roughnessNormalized.fill(Number.NaN);

  const isCellValid = (idx: number): boolean => {
    if (cellSupportMask && cellSupportMask[idx] === 0) return false;
    const z = elevationM[idx];
    return Number.isFinite(z) && Math.abs(z - noDataSentinel) > 1e-5;
  };

  for (let r = 1; r < height - 1; r++) {
    for (let c = 1; c < width - 1; c++) {
      const k = r * width + c;
      let sumZ = 0;
      let sumXiZ = 0;
      let sumEtaZ = 0;
      let allSupported = true;

      for (let dr = -1; dr <= 1 && allSupported; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const idx = (r + dr) * width + (c + dc);
          if (!isCellValid(idx)) {
            allSupported = false;
            break;
          }
          const z = elevationM[idx];
          const xi = dc;
          const eta = -dr;
          sumZ += z;
          sumXiZ += xi * z;
          sumEtaZ += eta * z;
        }
      }
      if (!allSupported) continue;

      const c0 = sumZ / 9;
      const a = sumXiZ / 6;
      const b = sumEtaZ / 6;

      let sumSqRes = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const z = elevationM[(r + dr) * width + (c + dc)];
          const zHat = a * dc + b * -dr + c0;
          const diff = z - zHat;
          sumSqRes += diff * diff;
        }
      }

      const rms = Math.sqrt(Math.max(0, sumSqRes / 9));
      derivativeSupportMask[k] = 1;
      rmsResidualM[k] = rms;
      roughnessNormalized[k] = Math.min(1, rms / roughnessScaleM);
    }
  }

  return { rmsResidualM, roughnessNormalized, derivativeSupportMask };
}
