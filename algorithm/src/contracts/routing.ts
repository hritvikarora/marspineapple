export type PolicyId = 'shortest' | 'terrain' | 'uncertainty';
export type QualityMode = 'prefer' | 'strict';
export type QualityClass = 'acceptable' | 'unknown' | 'low' | 'invalid';

export const QUALITY_CODE = {
  ACCEPTABLE: 0,
  UNKNOWN: 1,
  LOW: 2,
  INVALID: 3,
} as const;
export type QualityCode = (typeof QUALITY_CODE)[keyof typeof QUALITY_CODE];

export const SOURCE_FOM_CODE = {
  NO_DATA: 0,
  ACCEPTABLE: 1,
  LOW_CORRELATION: 2,
  INTERPOLATED: 3,
  EXTRAPOLATED: 4,
  SATURATED: 5,
  MANUALLY_EDITED: 6,
  MISSING_QUALITY_RASTER: 7,
} as const;
export type SourceFomCode = (typeof SOURCE_FOM_CODE)[keyof typeof SOURCE_FOM_CODE];

export type ExclusionReasonCode =
  | 'OUT_OF_BOUNDS'
  | 'NO_DATA'
  | 'INTERPOLATED_OR_UNRELIABLE'
  | 'EXPLICIT_HAZARD_MASK'
  | 'UNSUPPORTED_DERIVATIVE'
  | 'MAX_TERRAIN_SLOPE_EXCEEDED'
  | 'STRICT_QUALITY_EXCLUDED';

export type LocalMeterPoint = {
  eastM: number;
  northM: number;
};

export type NormalizedGridPoint = {
  requestedEastM: number;
  requestedNorthM: number;
  col: number;
  row: number;
  cellIndex: number;
  cellCenterEastM: number;
  cellCenterNorthM: number;
};

export type ConstraintProfileId = 'educational-eva-v1' | 'conservative-15deg' | 'relaxed-25deg' | string;

export type ConstraintProfile = {
  profileId: ConstraintProfileId;
  version: string;
  maxTerrainSlopeDeg: number;
  maxRouteGradeDeg: number;
  maxUphillGradeDeg?: number;
  maxDownhillGradeDeg?: number;
  roughnessScaleM: number;
  nominalWalkingSpeedMps: number;
  gradePenaltyKappa: number;
  isSimulatedAssumption: true;
};

export type PolicyWeightVector = {
  alpha: number;
  beta: number;
  gamma: number;
};

export type EffectivePolicyWeights = {
  policyId: PolicyId;
  nominal: PolicyWeightVector;
  effective: PolicyWeightVector;
  uniformQualityOverride: boolean;
  minAdmissibleU: number;
  maxAdmissibleU: number;
};

export type RegionRoutingBundle = {
  regionId: string;
  datasetVersion: string;
  gridWidth: number;
  gridHeight: number;
  cellSpacingEastM: number;
  cellSpacingNorthM: number;
  noDataSentinel: number;
  roughnessScaleM: number;
  qualityMappingVersion: string;
  elevationM: Float32Array;
  terrainSlopeDeg: Float32Array;
  roughnessNormalized: Float32Array;
  qualityCode: Uint8Array;
  derivativeSupportMask?: Uint8Array;
  explicitExclusionMask?: Uint8Array;
  sourceFomCode?: Uint8Array;
};

export type RouteRequest = {
  requestId: string;
  regionId: string;
  datasetVersion: string;
  start: LocalMeterPoint;
  destination: LocalMeterPoint;
  policies: PolicyId[];
  qualityMode: QualityMode;
  profileId?: ConstraintProfileId;
  customProfile?: ConstraintProfile;
  returnToStart?: boolean;
  scienceStopDurationS?: number;
  timeoutMs?: number;
};

export type ElevationProfilePoint = {
  sampleIndex: number;
  cellIndex: number;
  row: number;
  col: number;
  eastM: number;
  northM: number;
  distanceM: number;
  surfaceDistanceM: number;
  elevationM: number;
  terrainSlopeDeg: number;
  incomingGradeDeg: number;
  qualityClass: QualityClass;
};

export type QualityExposureInterval = {
  qualityClass: 'acceptable' | 'unknown' | 'low';
  startDistanceM: number;
  endDistanceM: number;
  lengthM: number;
  startSampleIndex: number;
  endSampleIndex: number;
};

export type RouteMetrics = {
  horizontalDistanceM: number;
  surfaceDistanceM: number;
  cumulativeAscentM: number;
  cumulativeDescentM: number;
  netElevationChangeM: number;
  maxTerrainSlopeDeg: number;
  maxTerrainSlopeAtDistanceM: number;
  maxTerrainSlopeCellIndex: number;
  maxRouteGradeDeg: number;
  maxUphillGradeDeg: number;
  maxDownhillGradeDeg: number;
  maxRouteGradeAtDistanceM: number;
  lowQualityDistanceM: number;
  lowQualityPct: number;
  unknownQualityDistanceM: number;
  unknownQualityPct: number;
  acceptableQualityDistanceM: number;
  acceptableQualityPct: number;
  weightedUncertaintyExposureM: number;
  integratedTerrainPenaltyCostM: number;
  integratedRoughnessPenaltyCostM: number;
  estimatedTimeS: number;
  gradeAdjustedTimeS: number;
  gridSpacingM: { dx: number; dy: number };
  slopeBaselineM: { eastM: number; northM: number };
  elevationProfile: ElevationProfilePoint[];
  qualityIntervals: QualityExposureInterval[];
};

export type Draped3DPoint = {
  eastM: number;
  northM: number;
  baseElevationM: number;
  worldY: number;
  isSubdividedMidpoint: boolean;
};

export type RouteExplanation = {
  summary: string;
  bullets: string[];
  reasonCodes: string[];
};

export type ReturnLegResult = {
  status: 'complete' | 'incomplete_round_trip';
  cellIndices: number[];
  polylineMeters: LocalMeterPoint[];
  metrics?: RouteMetrics;
  failureReason?: string;
};

export type RouteCandidate = {
  candidateId: string;
  matchedPolicies: PolicyId[];
  cellIndices: number[];
  polylineMeters: LocalMeterPoint[];
  draped3DPolyline?: Draped3DPoint[];
  totalCost: number;
  exploredNodes: number;
  metrics: RouteMetrics;
  explanation: RouteExplanation;
  returnLeg?: ReturnLegResult;
};

export type EquivalenceTopology =
  | 'case_1_all_three_merged'
  | 'case_2_terrain_uncertainty_merged'
  | 'case_3_shortest_terrain_merged'
  | 'case_4_shortest_uncertainty_merged'
  | 'case_5_all_three_distinct'
  | 'subset_request';

export type RouteResponse =
  | {
      status: 'success';
      requestId: string;
      regionId: string;
      datasetVersion: string;
      profileId: string;
      qualityMode: QualityMode;
      normalizedStart: NormalizedGridPoint;
      normalizedDestination: NormalizedGridPoint;
      effectiveWeights: Record<PolicyId, EffectivePolicyWeights>;
      policyStatuses: Partial<Record<PolicyId, 'success' | 'no_path' | 'timeout' | 'cancelled'>>;
      equivalenceTopology: EquivalenceTopology;
      candidates: RouteCandidate[];
      reasonCodes: string[];
      solveTimeMs: number;
    }
  | {
      status: 'no_path';
      requestId: string;
      regionId: string;
      datasetVersion: string;
      normalizedStart: NormalizedGridPoint;
      normalizedDestination: NormalizedGridPoint;
      reasonCode: 'DISCONNECTED_COMPONENTS' | 'SEARCH_EXHAUSTED' | 'STRICT_QUALITY_BLOCKED';
      message: string;
      solveTimeMs: number;
    }
  | {
      status: 'invalid_input';
      requestId: string;
      endpoint?: 'start' | 'destination' | 'request';
      reasonCode: ExclusionReasonCode | 'EMPTY_POLICIES' | 'INVALID_DIMENSIONS';
      message: string;
    }
  | {
      status: 'cancelled';
      requestId: string;
      message: string;
    }
  | {
      status: 'timeout';
      requestId: string;
      timeoutMs: number;
      completedPolicies: PolicyId[];
      message: string;
    }
  | {
      status: 'data_error';
      requestId: string;
      reasonCode:
        | 'BUNDLE_NOT_LOADED'
        | 'REGION_MISMATCH'
        | 'DATASET_VERSION_MISMATCH'
        | 'ARRAY_LENGTH_MISMATCH'
        | 'INVALID_GRID_DIMENSIONS';
      message: string;
    };
