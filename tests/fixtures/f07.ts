import { QUALITY_CODE, type RegionRoutingBundle } from '../../src/contracts/routing.js';

export type HornAndRoughnessResult = {
  slopeDeg: Float64Array;
  rmsResidualM: Float64Array;
  roughnessNormalized: Float32Array;
};

/**
 * Self-contained 3x3 Horn slope + detrended plane-fit RMS roughness on a 1-cell halo,
 * cropped to the (haloHeight - 2) x (haloWidth - 2) interior grid.
 */
export function computeCroppedHaloDerivatives(
  haloElevation: Float32Array | Float64Array,
  haloWidth: number,
  haloHeight: number,
  dx: number,
  dy: number,
  roughnessScaleM: number
): {
  interiorWidth: number;
  interiorHeight: number;
  elevationM: Float32Array;
  terrainSlopeDeg: Float32Array;
  terrainSlopeDegF64: Float64Array;
  rmsResidualM: Float64Array;
  roughnessNormalized: Float32Array;
} {
  const interiorWidth = haloWidth - 2;
  const interiorHeight = haloHeight - 2;
  const n = interiorWidth * interiorHeight;

  const elevationM = new Float32Array(n);
  const terrainSlopeDeg = new Float32Array(n);
  const terrainSlopeDegF64 = new Float64Array(n);
  const rmsResidualM = new Float64Array(n);
  const roughnessNormalized = new Float32Array(n);

  const radToDeg = 180 / Math.PI;

  for (let rInt = 0; rInt < interiorHeight; rInt++) {
    const r = rInt + 1;
    for (let cInt = 0; cInt < interiorWidth; cInt++) {
      const c = cInt + 1;
      const kInt = rInt * interiorWidth + cInt;
      const kHalo = r * haloWidth + c;
      elevationM[kInt] = haloElevation[kHalo];

      const zNW = haloElevation[(r - 1) * haloWidth + (c - 1)];
      const zN = haloElevation[(r - 1) * haloWidth + c];
      const zNE = haloElevation[(r - 1) * haloWidth + (c + 1)];
      const zW = haloElevation[r * haloWidth + (c - 1)];
      const zC = haloElevation[r * haloWidth + c];
      const zE = haloElevation[r * haloWidth + (c + 1)];
      const zSW = haloElevation[(r + 1) * haloWidth + (c - 1)];
      const zS = haloElevation[(r + 1) * haloWidth + c];
      const zSE = haloElevation[(r + 1) * haloWidth + (c + 1)];

      // Horn (1981) 3x3 weighted finite differences (r-1 is North, r+1 is South)
      const p = (zNE + 2 * zE + zSE - (zNW + 2 * zW + zSW)) / (8 * dx);
      const q = (zNW + 2 * zN + zNE - (zSW + 2 * zS + zSE)) / (8 * dy);
      const slope = Math.atan(Math.hypot(p, q)) * radToDeg;

      terrainSlopeDegF64[kInt] = slope;
      terrainSlopeDeg[kInt] = slope;

      // Closed-form 3x3 least-squares plane fit z_hat(xi, eta) = a*xi + b*eta + cMean
      // xi = dc in {-1, 0, 1}, eta = -dr in {1, 0, -1}
      const cMean = (zNW + zN + zNE + zW + zC + zE + zSW + zS + zSE) / 9;
      const a = (zNE + zE + zSE - (zNW + zW + zSW)) / 6;
      const b = (zNW + zN + zNE - (zSW + zS + zSE)) / 6;

      const windowVals = [
        { z: zNW, xi: -1, eta: 1 },
        { z: zN, xi: 0, eta: 1 },
        { z: zNE, xi: 1, eta: 1 },
        { z: zW, xi: -1, eta: 0 },
        { z: zC, xi: 0, eta: 0 },
        { z: zE, xi: 1, eta: 0 },
        { z: zSW, xi: -1, eta: -1 },
        { z: zS, xi: 0, eta: -1 },
        { z: zSE, xi: 1, eta: -1 },
      ];

      let sqSum = 0;
      for (const sample of windowVals) {
        const resid = sample.z - (a * sample.xi + b * sample.eta + cMean);
        sqSum += resid * resid;
      }
      const rms = Math.sqrt(Math.max(0, sqSum / 9));
      rmsResidualM[kInt] = rms;
      roughnessNormalized[kInt] = Math.min(1, rms / roughnessScaleM);
    }
  }

  return {
    interiorWidth,
    interiorHeight,
    elevationM,
    terrainSlopeDeg,
    terrainSlopeDegF64,
    rmsResidualM,
    roughnessNormalized,
  };
}

export type FixtureF07AResult = {
  haloWidth: number;
  haloHeight: number;
  elevationF64: Float64Array;
  slopeDegF64: Float64Array;
  rmsResidualF64: Float64Array;
  rmsResidualFromFloat32M: Float64Array;
  bundle: RegionRoutingBundle;
};

/**
 * F07A: Inclined plane of known grade (default 12 deg) comparing unquantized Float64
 * against quantized Float32Array serialized into RegionRoutingBundle.
 */
export function createFixtureF07AInclinedPlane(deg = 12): FixtureF07AResult {
  const haloWidth = 9;
  const haloHeight = 7;
  const dx = 10;
  const dy = 10;
  const roughnessScaleM = 0.5;
  const tanSlope = Math.tan((deg * Math.PI) / 180);

  const elevationF64 = new Float64Array(haloWidth * haloHeight);
  const elevationF32 = new Float32Array(haloWidth * haloHeight);

  for (let r = 0; r < haloHeight; r++) {
    for (let c = 0; c < haloWidth; c++) {
      const z = -2540.0 + c * dx * tanSlope;
      elevationF64[r * haloWidth + c] = z;
      elevationF32[r * haloWidth + c] = z;
    }
  }

  const derivF64 = computeCroppedHaloDerivatives(
    elevationF64,
    haloWidth,
    haloHeight,
    dx,
    dy,
    roughnessScaleM
  );
  const derivF32 = computeCroppedHaloDerivatives(
    elevationF32,
    haloWidth,
    haloHeight,
    dx,
    dy,
    roughnessScaleM
  );

  const nInt = derivF32.interiorWidth * derivF32.interiorHeight;
  const bundle: RegionRoutingBundle = {
    regionId: 'fixture-f07a-inclined-plane',
    datasetVersion: 'f07a-v1',
    gridWidth: derivF32.interiorWidth,
    gridHeight: derivF32.interiorHeight,
    cellSpacingEastM: dx,
    cellSpacingNorthM: dy,
    noDataSentinel: -32768,
    roughnessScaleM,
    qualityMappingVersion: 'fom-mapping-v1',
    elevationM: derivF32.elevationM,
    terrainSlopeDeg: derivF32.terrainSlopeDeg,
    roughnessNormalized: derivF32.roughnessNormalized,
    qualityCode: new Uint8Array(nInt).fill(QUALITY_CODE.ACCEPTABLE),
    derivativeSupportMask: new Uint8Array(nInt).fill(1),
  };

  return {
    haloWidth,
    haloHeight,
    elevationF64,
    slopeDegF64: derivF64.terrainSlopeDegF64,
    rmsResidualF64: derivF64.rmsResidualM,
    rmsResidualFromFloat32M: derivF32.rmsResidualM,
    bundle,
  };
}

/**
 * F07B: Closed-form 7x9 Float32Array halo ridge cropped to 5x7 interior RegionRoutingBundle.
 */
export function createFixtureF07BDerivedRidgeBundle(): {
  bundle: RegionRoutingBundle;
  rmsResidualM: Float64Array;
} {
  const haloWidth = 9;
  const haloHeight = 7;
  const dx = 10;
  const dy = 10;
  const roughnessScaleM = 0.5;
  const haloElevation = new Float32Array(haloWidth * haloHeight);

  for (let rh = 0; rh < haloHeight; rh++) {
    for (let ch = 0; ch < haloWidth; ch++) {
      let z = -2540.0;
      if (rh >= 3) {
        if (ch === 4) {
          z = -2535.0;
        } else if (ch === 3 || ch === 5) {
          z = -2537.5;
        }
      }
      haloElevation[rh * haloWidth + ch] = z;
    }
  }

  const deriv = computeCroppedHaloDerivatives(
    haloElevation,
    haloWidth,
    haloHeight,
    dx,
    dy,
    roughnessScaleM
  );
  const nInt = deriv.interiorWidth * deriv.interiorHeight;

  const bundle: RegionRoutingBundle = {
    regionId: 'fixture-f07b-derived-ridge',
    datasetVersion: 'f07b-v1',
    gridWidth: deriv.interiorWidth,
    gridHeight: deriv.interiorHeight,
    cellSpacingEastM: dx,
    cellSpacingNorthM: dy,
    noDataSentinel: -32768,
    roughnessScaleM,
    qualityMappingVersion: 'fom-mapping-v1',
    elevationM: deriv.elevationM,
    terrainSlopeDeg: deriv.terrainSlopeDeg,
    roughnessNormalized: deriv.roughnessNormalized,
    qualityCode: new Uint8Array(nInt).fill(QUALITY_CODE.ACCEPTABLE),
    derivativeSupportMask: new Uint8Array(nInt).fill(1),
  };

  return {
    bundle,
    rmsResidualM: deriv.rmsResidualM,
  };
}
