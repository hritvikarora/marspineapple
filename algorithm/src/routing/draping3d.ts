import type { Draped3DPoint, RegionRoutingBundle } from '../contracts/routing.js';

export type MeshQuadDiagonalSplit = 'ne_sw' | 'nw_se';

export type Draped3DRouteOptions = {
  verticalExaggeration?: number;
  hoverOffsetM?: number;
  refElevationM?: number;
  quadSplit?: MeshQuadDiagonalSplit;
};

/**
 * Builds a 3D draped polyline from a sequence of grid cell indices.
 * Inserts a subdivided quad-center midpoint on diagonal steps using
 * max(zEdgeMid, zOppMid) so the route never tunnels beneath a saddle quad.
 */
export function buildDraped3DRoutePolyline(
  bundle: RegionRoutingBundle,
  cellIndices: number[],
  options?: Draped3DRouteOptions
): Draped3DPoint[] {
  const Ez = options?.verticalExaggeration ?? 1.0;
  const lift = options?.hoverOffsetM ?? 0.35;
  const zRef = options?.refElevationM ?? 0.0;
  const w = bundle.gridWidth;
  const h = bundle.gridHeight;
  const dx = bundle.cellSpacingEastM;
  const dy = bundle.cellSpacingNorthM;
  const out: Draped3DPoint[] = [];

  for (let i = 0; i < cellIndices.length; i++) {
    const k = cellIndices[i];
    const r = Math.floor(k / w);
    const c = k - r * w;
    const eastM = (c + 0.5) * dx;
    const northM = (h - 1 - r + 0.5) * dy;
    const z = bundle.elevationM[k];

    if (i > 0) {
      const prevK = cellIndices[i - 1];
      const prevR = Math.floor(prevK / w);
      const prevC = prevK - prevR * w;
      if (Math.abs(r - prevR) === 1 && Math.abs(c - prevC) === 1) {
        const prevEastM = (prevC + 0.5) * dx;
        const prevNorthM = (h - 1 - prevR + 0.5) * dy;
        const prevZ = bundle.elevationM[prevK];
        const w1Z = bundle.elevationM[prevR * w + c];
        const w2Z = bundle.elevationM[r * w + prevC];
        const zEdgeMid = 0.5 * (prevZ + z);
        const zOppMid = 0.5 * (w1Z + w2Z);
        const zDrapedMid = Math.max(zEdgeMid, zOppMid);

        out.push({
          eastM: 0.5 * (prevEastM + eastM),
          northM: 0.5 * (prevNorthM + northM),
          baseElevationM: zDrapedMid,
          worldY: (zDrapedMid - zRef) * Ez + lift,
          isSubdividedMidpoint: true,
        });
      }
    }

    out.push({
      eastM,
      northM,
      baseElevationM: z,
      worldY: (z - zRef) * Ez + lift,
      isSubdividedMidpoint: false,
    });
  }

  return out;
}
