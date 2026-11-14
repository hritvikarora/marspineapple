import type {
  ConstraintProfile,
  LocalMeterPoint,
  QualityMode,
  RegionRoutingBundle,
  ReturnLegResult,
  RouteMetrics,
} from '../contracts/routing.js';
import {
  DIR_COUNT,
  DIR_DC,
  DIR_DR,
  type EdgeEvaluatorPort,
  type SinglePolicySolveResult,
} from './types.js';

export type BuildReturnLegParams = {
  bundle: RegionRoutingBundle;
  outboundCellIndices: number[];
  profile: ConstraintProfile;
  qualityMode: QualityMode;
  edgeEvaluator: Pick<EdgeEvaluatorPort, 'isEdgeAdmissible'>;
  computeMetrics: (cellIndices: number[]) => RouteMetrics;
  resolveReturnPathIfAsymmetric?: () => SinglePolicySolveResult;
};

function findDirection(dr: number, dc: number): number {
  for (let d = 0; d < DIR_COUNT; d++) {
    if (DIR_DR[d] === dr && DIR_DC[d] === dc) {
      return d;
    }
  }
  return -1;
}

function buildPolylineMeters(bundle: RegionRoutingBundle, cellIndices: number[]): LocalMeterPoint[] {
  const w = bundle.gridWidth;
  const h = bundle.gridHeight;
  const dx = bundle.cellSpacingEastM;
  const dy = bundle.cellSpacingNorthM;
  const out: LocalMeterPoint[] = new Array(cellIndices.length);

  for (let i = 0; i < cellIndices.length; i++) {
    const k = cellIndices[i];
    const r = Math.floor(k / w);
    const c = k - r * w;
    out[i] = {
      eastM: (c + 0.5) * dx,
      northM: (h - 1 - r + 0.5) * dy,
    };
  }
  return out;
}

/**
 * Builds the return leg for a round-trip journey by reversing the outbound
 * path when all reversed edges remain admissible, or falling back to an
 * asymmetric return-path resolver if provided.
 */
export function buildReturnLeg(params: BuildReturnLegParams): ReturnLegResult {
  const {
    bundle,
    outboundCellIndices,
    profile,
    qualityMode,
    edgeEvaluator,
    computeMetrics,
    resolveReturnPathIfAsymmetric,
  } = params;

  const reversed = [...outboundCellIndices].reverse();
  const w = bundle.gridWidth;
  let allReversedAdmissible = true;

  for (let i = 1; i < reversed.length; i++) {
    const u = reversed[i - 1];
    const v = reversed[i];
    const ru = Math.floor(u / w);
    const cu = u - ru * w;
    const rv = Math.floor(v / w);
    const cv = v - rv * w;
    const dir = findDirection(rv - ru, cv - cu);

    if (
      dir === -1 ||
      !edgeEvaluator.isEdgeAdmissible(bundle, u, v, dir, profile, qualityMode)
    ) {
      allReversedAdmissible = false;
      break;
    }
  }

  if (allReversedAdmissible) {
    return {
      status: 'complete',
      cellIndices: reversed,
      polylineMeters: buildPolylineMeters(bundle, reversed),
      metrics: computeMetrics(reversed),
    };
  }

  const resolved = resolveReturnPathIfAsymmetric?.();
  if (resolved && resolved.status === 'success' && resolved.cellIndices.length > 0) {
    return {
      status: 'complete',
      cellIndices: resolved.cellIndices,
      polylineMeters: buildPolylineMeters(bundle, resolved.cellIndices),
      metrics: computeMetrics(resolved.cellIndices),
    };
  }

  return {
    status: 'incomplete_round_trip',
    cellIndices: [],
    polylineMeters: [],
    failureReason: 'RETURN_PATH_INFEASIBLE_UNDER_DIRECTIONAL_GRADE_LIMIT',
  };
}
