import { describe, expect, it } from 'vitest';
import { QUALITY_CODE, type RegionRoutingBundle } from '../../src/contracts/routing.js';
import { computeQualityExposureMetrics } from '../../src/routing/metricsQuality.js';

function makeQualityBundle(width: number, height: number, qualityCodes: number[]): RegionRoutingBundle {
  const n = width * height;
  return {
    regionId: 'test-region',
    datasetVersion: 'v1',
    gridWidth: width,
    gridHeight: height,
    cellSpacingEastM: 10,
    cellSpacingNorthM: 10,
    noDataSentinel: -9999,
    roughnessScaleM: 0.5,
    qualityMappingVersion: '1.0',
    elevationM: new Float32Array(n).fill(-2500),
    terrainSlopeDeg: new Float32Array(n).fill(0),
    roughnessNormalized: new Float32Array(n).fill(0),
    qualityCode: new Uint8Array(qualityCodes),
  };
}

describe('T22: computeQualityExposureMetrics', () => {
  it('returns 0 for all distances and percentages and empty qualityIntervals on 0-edge route [12]', () => {
    const bundle = makeQualityBundle(5, 5, new Array(25).fill(QUALITY_CODE.ACCEPTABLE));
    const res = computeQualityExposureMetrics(bundle, [12]);

    expect(res.lowQualityDistanceM).toBe(0);
    expect(res.lowQualityPct).toBe(0);
    expect(res.unknownQualityDistanceM).toBe(0);
    expect(res.unknownQualityPct).toBe(0);
    expect(res.acceptableQualityDistanceM).toBe(0);
    expect(res.acceptableQualityPct).toBe(0);
    expect(res.weightedUncertaintyExposureM).toBe(0);
    expect(res.qualityIntervals).toEqual([]);
  });

  it('attributes full 10*sqrt(2) m length to lowQualityDistanceM when a diagonal step clips a LOW orthogonal corner', () => {
    // 3x3 grid:
    // (0,0)=ACC (0,1)=LOW (0,2)=ACC
    // (1,0)=ACC (1,1)=ACC (1,2)=ACC
    // Step (1,0) -> (0,1) would hit LOW endpoint, so test (1,0) -> (0,1)? Wait:
    // Diagonal (1,0) [idx 3] -> (0,1) [idx 1] has corners (1,1) and (0,0).
    // Diagonal (1,1) [idx 4] -> (0,2) [idx 2] has endpoints ACC, ACC and orthogonal corners (1,2)=ACC and (0,1)=LOW!
    const q = [
      QUALITY_CODE.ACCEPTABLE, QUALITY_CODE.LOW,        QUALITY_CODE.ACCEPTABLE,
      QUALITY_CODE.ACCEPTABLE, QUALITY_CODE.ACCEPTABLE, QUALITY_CODE.ACCEPTABLE,
      QUALITY_CODE.ACCEPTABLE, QUALITY_CODE.ACCEPTABLE, QUALITY_CODE.ACCEPTABLE,
    ];
    const bundle = makeQualityBundle(3, 3, q);
    const res = computeQualityExposureMetrics(bundle, [4, 2]);

    const diagLen = 10 * Math.SQRT2;
    expect(res.lowQualityDistanceM).toBeCloseTo(diagLen, 9);
    expect(res.lowQualityPct).toBeCloseTo(100, 9);
    expect(res.unknownQualityDistanceM).toBe(0);
    expect(res.acceptableQualityDistanceM).toBe(0);
    expect(res.weightedUncertaintyExposureM).toBeCloseTo(diagLen, 9);
    expect(res.qualityIntervals).toEqual([
      {
        qualityClass: 'low',
        startDistanceM: 0,
        endDistanceM: diagLen,
        lengthM: diagLen,
        startSampleIndex: 0,
        endSampleIndex: 1,
      },
    ]);
  });

  it('merges contiguous runs into compact RLE intervals whose lengthM sum equals horizontalDistanceM', () => {
    // 1x6 row:
    // 0: ACC, 1: ACC, 2: UNKNOWN, 3: UNKNOWN, 4: LOW, 5: ACC
    // Edges:
    // 0->1: ACC (10m)
    // 1->2: UNKNOWN (10m)
    // 2->3: UNKNOWN (10m)
    // 3->4: LOW (10m)
    // 4->5: LOW (10m)
    const q = [
      QUALITY_CODE.ACCEPTABLE,
      QUALITY_CODE.ACCEPTABLE,
      QUALITY_CODE.UNKNOWN,
      QUALITY_CODE.UNKNOWN,
      QUALITY_CODE.LOW,
      QUALITY_CODE.ACCEPTABLE,
    ];
    const bundle = makeQualityBundle(6, 1, q);
    const res = computeQualityExposureMetrics(bundle, [0, 1, 2, 3, 4, 5]);

    expect(res.acceptableQualityDistanceM).toBeCloseTo(10, 9);
    expect(res.unknownQualityDistanceM).toBeCloseTo(20, 9);
    expect(res.lowQualityDistanceM).toBeCloseTo(20, 9);
    expect(res.acceptableQualityPct).toBeCloseTo(20, 9);
    expect(res.unknownQualityPct).toBeCloseTo(40, 9);
    expect(res.lowQualityPct).toBeCloseTo(40, 9);
    expect(res.weightedUncertaintyExposureM).toBeCloseTo(20 * 1.0 + 20 * 0.75, 9);

    expect(res.qualityIntervals).toEqual([
      {
        qualityClass: 'acceptable',
        startDistanceM: 0,
        endDistanceM: 10,
        lengthM: 10,
        startSampleIndex: 0,
        endSampleIndex: 1,
      },
      {
        qualityClass: 'unknown',
        startDistanceM: 10,
        endDistanceM: 30,
        lengthM: 20,
        startSampleIndex: 1,
        endSampleIndex: 3,
      },
      {
        qualityClass: 'low',
        startDistanceM: 30,
        endDistanceM: 50,
        lengthM: 20,
        startSampleIndex: 3,
        endSampleIndex: 5,
      },
    ]);

    const sumLengths = res.qualityIntervals.reduce((acc, iv) => acc + iv.lengthM, 0);
    expect(sumLengths).toBeCloseTo(50, 9);
  });
});
