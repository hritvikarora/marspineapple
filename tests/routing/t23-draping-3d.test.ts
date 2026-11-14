import { describe, expect, it } from 'vitest';
import type { RegionRoutingBundle } from '../../src/contracts/routing.js';
import {
  buildDraped3DRoutePolyline,
  type MeshQuadDiagonalSplit,
} from '../../src/routing/draping3d.js';

function makeQuadBundle(elevations: [number, number, number, number]): RegionRoutingBundle {
  return {
    regionId: 'test-quad',
    datasetVersion: 'v1',
    gridWidth: 2,
    gridHeight: 2,
    cellSpacingEastM: 10,
    cellSpacingNorthM: 10,
    noDataSentinel: -9999,
    roughnessScaleM: 0.5,
    qualityMappingVersion: 'v1',
    elevationM: new Float32Array(elevations),
    terrainSlopeDeg: new Float32Array(4),
    roughnessNormalized: new Float32Array(4),
    qualityCode: new Uint8Array(4),
  };
}

describe('T23: buildDraped3DRoutePolyline', () => {
  it('lifts diagonal midpoint over a 2x2 saddle quad at 1x and 3x exaggeration (Finding 9)', () => {
    // z00=0, z01=10, z10=10, z11=0
    const bundle = makeQuadBundle([0, 10, 10, 0]);

    const pts1x = buildDraped3DRoutePolyline(bundle, [0, 3]);
    expect(pts1x).toHaveLength(3);
    expect(pts1x[0]).toEqual({
      eastM: 5,
      northM: 15,
      baseElevationM: 0,
      worldY: 0.35,
      isSubdividedMidpoint: false,
    });
    expect(pts1x[1]).toEqual({
      eastM: 10,
      northM: 10,
      baseElevationM: 10,
      worldY: 10.35,
      isSubdividedMidpoint: true,
    });
    expect(pts1x[2]).toEqual({
      eastM: 15,
      northM: 5,
      baseElevationM: 0,
      worldY: 0.35,
      isSubdividedMidpoint: false,
    });

    const split: MeshQuadDiagonalSplit = 'ne_sw';
    const pts3x = buildDraped3DRoutePolyline(bundle, [0, 3], {
      verticalExaggeration: 3,
      hoverOffsetM: 0.35,
      refElevationM: 0,
      quadSplit: split,
    });
    expect(pts3x[1].baseElevationM).toBe(10);
    expect(pts3x[1].worldY).toBeCloseTo(30.35, 10);
  });

  it('uses zEdgeMid when the route diagonal is higher than the opposite diagonal', () => {
    // z00=12, z01=2, z10=2, z11=12
    const bundle = makeQuadBundle([12, 2, 2, 12]);
    const pts = buildDraped3DRoutePolyline(bundle, [0, 3], {
      verticalExaggeration: 2,
      hoverOffsetM: 0.5,
      refElevationM: 2,
    });

    expect(pts).toHaveLength(3);
    expect(pts[1].isSubdividedMidpoint).toBe(true);
    expect(pts[1].baseElevationM).toBe(12);
    expect(pts[1].worldY).toBeCloseTo((12 - 2) * 2 + 0.5, 10);
  });

  it('does not insert midpoints for cardinal steps and handles empty/single-cell paths', () => {
    const bundle = makeQuadBundle([0, 4, 8, 12]);
    expect(buildDraped3DRoutePolyline(bundle, [])).toEqual([]);

    const single = buildDraped3DRoutePolyline(bundle, [2]);
    expect(single).toHaveLength(1);
    expect(single[0].isSubdividedMidpoint).toBe(false);
    expect(single[0].baseElevationM).toBe(8);

    // (0,0) -> (0,1) -> (1,1) are two cardinal steps
    const cardinal = buildDraped3DRoutePolyline(bundle, [0, 1, 3]);
    expect(cardinal).toHaveLength(3);
    expect(cardinal.every((p) => !p.isSubdividedMidpoint)).toBe(true);
  });
});
