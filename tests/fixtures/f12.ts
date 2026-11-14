import { QUALITY_CODE, type RegionRoutingBundle } from '../../src/contracts/routing.js';

/**
 * F12 Subtest A: 5x5 sensitivity grid (dx = dy = 10 m).
 * - Start (2,0) [10] and Goal (2,4) [14] have 0 deg slope.
 * - Direct row-2 corridor (2,1)..(2,3) [11..13] has 18 deg slope.
 * - Northern corridor rows 0..1 has 12 deg slope.
 * - Southern rows 3..4 have 28 deg slope (blocked under all three presets).
 */
export function createFixtureF12SensitivityBundle(): RegionRoutingBundle {
  const width = 5;
  const height = 5;
  const n = width * height;
  const terrainSlopeDeg = new Float32Array(n);

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const k = r * width + c;
      if (r <= 1) {
        terrainSlopeDeg[k] = 12.0;
      } else if (r === 2) {
        terrainSlopeDeg[k] = c === 0 || c === 4 ? 0.0 : 18.0;
      } else {
        terrainSlopeDeg[k] = 28.0;
      }
    }
  }

  return {
    regionId: 'fixture-f12a-sensitivity',
    datasetVersion: 'f12a-v1',
    gridWidth: width,
    gridHeight: height,
    cellSpacingEastM: 10,
    cellSpacingNorthM: 10,
    noDataSentinel: -32768,
    roughnessScaleM: 0.5,
    qualityMappingVersion: 'fom-mapping-v1',
    elevationM: new Float32Array(n).fill(-2540.0),
    terrainSlopeDeg,
    roughnessNormalized: new Float32Array(n).fill(0.0),
    qualityCode: new Uint8Array(n).fill(QUALITY_CODE.ACCEPTABLE),
    derivativeSupportMask: new Uint8Array(n).fill(1),
  };
}

/**
 * F12 Subtest C: 2x2 saddle quad (z00=0, z01=10, z10=10, z11=0).
 */
export function createFixtureF12SaddleQuadBundle(): RegionRoutingBundle {
  return {
    regionId: 'fixture-f12c-saddle-quad',
    datasetVersion: 'f12c-v1',
    gridWidth: 2,
    gridHeight: 2,
    cellSpacingEastM: 10,
    cellSpacingNorthM: 10,
    noDataSentinel: -32768,
    roughnessScaleM: 0.5,
    qualityMappingVersion: 'fom-mapping-v1',
    elevationM: new Float32Array([0, 10, 10, 0]),
    terrainSlopeDeg: new Float32Array(4).fill(0.0),
    roughnessNormalized: new Float32Array(4).fill(0.0),
    qualityCode: new Uint8Array(4).fill(QUALITY_CODE.ACCEPTABLE),
    derivativeSupportMask: new Uint8Array(4).fill(1),
  };
}
