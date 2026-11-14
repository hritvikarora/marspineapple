import { QUALITY_CODE, type RegionRoutingBundle } from '../../src/contracts/routing.js';

/**
 * F09 Subtest A: 3x5 Slope-vs-Distance Counterexample Under Uniform UNKNOWN (U = 0.75).
 * Center cell (1,2) [index 7] has terrain slope 10 deg (S = 0.5); all other cells have 0 deg.
 */
export function createFixtureF09SubtestACounterexampleBundle(): RegionRoutingBundle {
  const width = 5;
  const height = 3;
  const n = width * height;
  const elevationM = new Float32Array(n).fill(-2540.0);
  const terrainSlopeDeg = new Float32Array(n).fill(0.0);
  terrainSlopeDeg[1 * width + 2] = 10.0;

  return {
    regionId: 'fixture-f09a-uniform-unknown',
    datasetVersion: 'f09a-v1',
    gridWidth: width,
    gridHeight: height,
    cellSpacingEastM: 10,
    cellSpacingNorthM: 10,
    noDataSentinel: -32768,
    roughnessScaleM: 0.5,
    qualityMappingVersion: 'fom-mapping-v1',
    elevationM,
    terrainSlopeDeg,
    roughnessNormalized: new Float32Array(n).fill(0.0),
    qualityCode: new Uint8Array(n).fill(QUALITY_CODE.UNKNOWN),
    derivativeSupportMask: new Uint8Array(n).fill(1),
  };
}

/**
 * F09 Subtest C: 3x5 Mixed UNKNOWN (U = 0.75) and LOW (U = 1.0) with zero ACCEPTABLE cells.
 * Center cell (1,2) [index 7] is LOW; all other cells are UNKNOWN.
 */
export function createFixtureF09SubtestCMixedUnknownLowBundle(): RegionRoutingBundle {
  const width = 5;
  const height = 3;
  const n = width * height;
  const qualityCode = new Uint8Array(n).fill(QUALITY_CODE.UNKNOWN);
  qualityCode[1 * width + 2] = QUALITY_CODE.LOW;

  return {
    regionId: 'fixture-f09c-mixed-unknown-low',
    datasetVersion: 'f09c-v1',
    gridWidth: width,
    gridHeight: height,
    cellSpacingEastM: 10,
    cellSpacingNorthM: 10,
    noDataSentinel: -32768,
    roughnessScaleM: 0.5,
    qualityMappingVersion: 'fom-mapping-v1',
    elevationM: new Float32Array(n).fill(-2540.0),
    terrainSlopeDeg: new Float32Array(n).fill(0.0),
    roughnessNormalized: new Float32Array(n).fill(0.0),
    qualityCode,
    derivativeSupportMask: new Uint8Array(n).fill(1),
  };
}
