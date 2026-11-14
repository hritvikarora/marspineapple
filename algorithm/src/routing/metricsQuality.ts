import {
  QUALITY_CODE,
  type QualityExposureInterval,
  type RegionRoutingBundle,
} from '../contracts/routing.js';

export type QualityExposureMetrics = {
  lowQualityDistanceM: number;
  lowQualityPct: number;
  unknownQualityDistanceM: number;
  unknownQualityPct: number;
  acceptableQualityDistanceM: number;
  acceptableQualityPct: number;
  weightedUncertaintyExposureM: number;
  qualityIntervals: QualityExposureInterval[];
};

type EdgeQualityClass = 'acceptable' | 'unknown' | 'low';

function classifyEdgeQuality(
  q: Uint8Array,
  u: number,
  v: number,
  ru: number,
  cu: number,
  rv: number,
  cv: number,
  w: number
): EdgeQualityClass {
  const qu = q[u];
  const qv = q[v];

  if (ru !== rv && cu !== cv) {
    const w1 = ru * w + cv;
    const w2 = rv * w + cu;
    const qw1 = q[w1];
    const qw2 = q[w2];

    if (
      qu === QUALITY_CODE.LOW ||
      qv === QUALITY_CODE.LOW ||
      qw1 === QUALITY_CODE.LOW ||
      qw2 === QUALITY_CODE.LOW
    ) {
      return 'low';
    }
    if (
      qu === QUALITY_CODE.UNKNOWN ||
      qv === QUALITY_CODE.UNKNOWN ||
      qw1 === QUALITY_CODE.UNKNOWN ||
      qw2 === QUALITY_CODE.UNKNOWN
    ) {
      return 'unknown';
    }
    return 'acceptable';
  }

  if (qu === QUALITY_CODE.LOW || qv === QUALITY_CODE.LOW) {
    return 'low';
  }
  if (qu === QUALITY_CODE.UNKNOWN || qv === QUALITY_CODE.UNKNOWN) {
    return 'unknown';
  }
  return 'acceptable';
}

/**
 * Computes corner-aware, length-weighted observation quality exposure metrics
 * and run-length encoded (RLE) quality exposure intervals along a route.
 */
export function computeQualityExposureMetrics(
  bundle: RegionRoutingBundle,
  cellIndices: number[]
): QualityExposureMetrics {
  const m = Math.max(0, cellIndices.length - 1);
  if (m === 0) {
    return {
      lowQualityDistanceM: 0,
      lowQualityPct: 0,
      unknownQualityDistanceM: 0,
      unknownQualityPct: 0,
      acceptableQualityDistanceM: 0,
      acceptableQualityPct: 0,
      weightedUncertaintyExposureM: 0,
      qualityIntervals: [],
    };
  }

  const w = bundle.gridWidth;
  const dx = bundle.cellSpacingEastM;
  const dy = bundle.cellSpacingNorthM;
  const q = bundle.qualityCode;

  let lowQualityDistanceM = 0;
  let unknownQualityDistanceM = 0;
  let acceptableQualityDistanceM = 0;
  let cumulativeHorizM = 0;

  const qualityIntervals: QualityExposureInterval[] = [];

  for (let j = 1; j <= m; j++) {
    const u = cellIndices[j - 1];
    const v = cellIndices[j];

    const ru = Math.floor(u / w);
    const cu = u - ru * w;
    const rv = Math.floor(v / w);
    const cv = v - rv * w;

    const dHoriz = Math.hypot((cv - cu) * dx, (ru - rv) * dy);
    const edgeClass = classifyEdgeQuality(q, u, v, ru, cu, rv, cv, w);

    if (edgeClass === 'low') {
      lowQualityDistanceM += dHoriz;
    } else if (edgeClass === 'unknown') {
      unknownQualityDistanceM += dHoriz;
    } else {
      acceptableQualityDistanceM += dHoriz;
    }

    const startDistanceM = cumulativeHorizM;
    cumulativeHorizM += dHoriz;

    const lastInterval =
      qualityIntervals.length > 0 ? qualityIntervals[qualityIntervals.length - 1] : null;
    if (lastInterval && lastInterval.qualityClass === edgeClass) {
      lastInterval.endDistanceM = cumulativeHorizM;
      lastInterval.lengthM += dHoriz;
      lastInterval.endSampleIndex = j;
    } else {
      qualityIntervals.push({
        qualityClass: edgeClass,
        startDistanceM,
        endDistanceM: cumulativeHorizM,
        lengthM: dHoriz,
        startSampleIndex: j - 1,
        endSampleIndex: j,
      });
    }
  }

  const totalHorizM = lowQualityDistanceM + unknownQualityDistanceM + acceptableQualityDistanceM;
  const lowQualityPct = totalHorizM > 0 ? (100 * lowQualityDistanceM) / totalHorizM : 0;
  const unknownQualityPct = totalHorizM > 0 ? (100 * unknownQualityDistanceM) / totalHorizM : 0;
  const acceptableQualityPct =
    totalHorizM > 0 ? (100 * acceptableQualityDistanceM) / totalHorizM : 0;

  const weightedUncertaintyExposureM =
    1.0 * lowQualityDistanceM + 0.75 * unknownQualityDistanceM;

  return {
    lowQualityDistanceM,
    lowQualityPct,
    unknownQualityDistanceM,
    unknownQualityPct,
    acceptableQualityDistanceM,
    acceptableQualityPct,
    weightedUncertaintyExposureM,
    qualityIntervals,
  };
}
