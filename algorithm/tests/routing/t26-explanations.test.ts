import { describe, expect, it } from 'vitest';
import type {
  ConstraintProfile,
  EffectivePolicyWeights,
  PolicyId,
  RouteMetrics,
} from '../../src/contracts/routing.js';
import {
  buildCandidateExplanations,
  formatDistanceDelta,
  formatQualityDelta,
  formatTerrainDelta,
} from '../../src/routing/explanations.js';

function makeMetrics(overrides: Partial<RouteMetrics>): RouteMetrics {
  return {
    horizontalDistanceM: 40,
    surfaceDistanceM: 40,
    cumulativeAscentM: 0,
    cumulativeDescentM: 0,
    netElevationChangeM: 0,
    maxTerrainSlopeDeg: 0,
    maxTerrainSlopeAtDistanceM: 0,
    maxTerrainSlopeCellIndex: 0,
    maxRouteGradeDeg: 0,
    maxUphillGradeDeg: 0,
    maxDownhillGradeDeg: 0,
    maxRouteGradeAtDistanceM: 0,
    lowQualityDistanceM: 0,
    lowQualityPct: 0,
    unknownQualityDistanceM: 0,
    unknownQualityPct: 0,
    acceptableQualityDistanceM: 40,
    acceptableQualityPct: 100,
    weightedUncertaintyExposureM: 0,
    integratedTerrainPenaltyCostM: 0,
    integratedRoughnessPenaltyCostM: 0,
    estimatedTimeS: 80,
    gradeAdjustedTimeS: 80,
    gridSpacingM: { dx: 10, dy: 10 },
    slopeBaselineM: { eastM: 20, northM: 20 },
    elevationProfile: [],
    qualityIntervals: [],
    ...overrides,
  };
}

const DEFAULT_PROFILE: ConstraintProfile = {
  profileId: 'educational-eva-v1',
  version: '1.0',
  maxTerrainSlopeDeg: 20,
  maxRouteGradeDeg: 20,
  roughnessScaleM: 0.5,
  nominalWalkingSpeedMps: 0.5,
  gradePenaltyKappa: 1.5,
  isSimulatedAssumption: true,
};

function makeWeights(uniformOverride = false): Record<PolicyId, EffectivePolicyWeights> {
  return {
    shortest: {
      policyId: 'shortest',
      nominal: { alpha: 0, beta: 0, gamma: 0 },
      effective: { alpha: 0, beta: 0, gamma: 0 },
      uniformQualityOverride: false,
      minAdmissibleU: uniformOverride ? 0.75 : 0,
      maxAdmissibleU: uniformOverride ? 0.75 : 1,
    },
    terrain: {
      policyId: 'terrain',
      nominal: { alpha: 2, beta: 1, gamma: 0 },
      effective: { alpha: 2, beta: 1, gamma: 0 },
      uniformQualityOverride: false,
      minAdmissibleU: uniformOverride ? 0.75 : 0,
      maxAdmissibleU: uniformOverride ? 0.75 : 1,
    },
    uncertainty: {
      policyId: 'uncertainty',
      nominal: { alpha: 2, beta: 1, gamma: 2 },
      effective: { alpha: 2, beta: 1, gamma: uniformOverride ? 0 : 2 },
      uniformQualityOverride: uniformOverride,
      minAdmissibleU: uniformOverride ? 0.75 : 0,
      maxAdmissibleU: uniformOverride ? 0.75 : 1,
    },
  };
}

describe('T26: Deterministic signed-delta explanation engine', () => {
  it('Finding 6 Regression 1: F08 equal-length North vs. South uses equal-length clause and Q3 trade-off', () => {
    const middleShortest = makeMetrics({
      horizontalDistanceM: 40.0,
      maxTerrainSlopeDeg: 15.0,
      integratedTerrainPenaltyCostM: 80.0,
      integratedRoughnessPenaltyCostM: 20.0,
    });
    const northTerrain = makeMetrics({
      horizontalDistanceM: 20 + 20 * Math.SQRT2,
      maxTerrainSlopeDeg: 0.0,
      lowQualityDistanceM: 20.0,
      lowQualityPct: (20 / (20 + 20 * Math.SQRT2)) * 100,
      acceptableQualityDistanceM: 20 * Math.SQRT2,
      acceptableQualityPct: ((20 * Math.SQRT2) / (20 + 20 * Math.SQRT2)) * 100,
      weightedUncertaintyExposureM: 20.0,
      integratedTerrainPenaltyCostM: 0.0,
    });
    const southUncertainty = makeMetrics({
      horizontalDistanceM: 20 + 20 * Math.SQRT2,
      maxTerrainSlopeDeg: 5.0,
      lowQualityDistanceM: 0.0,
      lowQualityPct: 0.0,
      acceptableQualityDistanceM: 20 + 20 * Math.SQRT2,
      acceptableQualityPct: 100.0,
      weightedUncertaintyExposureM: 0.0,
      integratedTerrainPenaltyCostM: 10.0,
    });

    const explanations = buildCandidateExplanations({
      candidates: [
        { matchedPolicies: ['shortest'], metrics: middleShortest },
        { matchedPolicies: ['terrain'], metrics: northTerrain },
        { matchedPolicies: ['uncertainty'], metrics: southUncertainty },
      ],
      equivalenceTopology: 'case_5_all_three_distinct',
      profile: DEFAULT_PROFILE,
      qualityMode: 'prefer',
      effectiveWeights: makeWeights(false),
      uniformQualityClass: null,
    });

    expect(explanations).toHaveLength(3);
    expect(explanations[2].summary).toContain('follows an equal-length 48.3 m alternative corridor');
    expect(explanations[2].summary).toContain(
      'while crossing a 5.0° max-slope corridor (vs. 0.0° on the terrain route)'
    );
    expect(explanations[2].summary).not.toContain('adds 0.0 m');
  });

  it('Finding 6 Regression 2: Branch Q2 LOW-for-UNKNOWN trade-off wording', () => {
    const direct = makeMetrics({
      horizontalDistanceM: 40.0,
      lowQualityDistanceM: 20.0,
      lowQualityPct: 50.0,
      unknownQualityDistanceM: 20.0,
      unknownQualityPct: 50.0,
      weightedUncertaintyExposureM: 35.0,
    });
    const detourLen = 20 + 20 * Math.SQRT2;
    const detour = makeMetrics({
      horizontalDistanceM: detourLen,
      lowQualityDistanceM: 0.0,
      lowQualityPct: 0.0,
      unknownQualityDistanceM: detourLen,
      unknownQualityPct: 100.0,
      weightedUncertaintyExposureM: 0.75 * detourLen,
    });

    const clause = formatQualityDelta(detour, direct);
    expect(clause).toContain('to reduce high-penalty low-confidence exposure from 20.0 m (50.0%) to 0.0 m (0.0%)');
    expect(clause).toContain('by routing through 48.3 m (100.0%) of unknown-quality terrain (vs. 20.0 m)');
    expect(clause).toContain('weighted observation-uncertainty exposure from 35.0 to 36.2 m-eq');
  });

  it('Finding 6 Regression 3: Branch T3 higher single-cell peak slope accepted for lower integrated terrain penalty', () => {
    const a = makeMetrics({
      maxTerrainSlopeDeg: 8.0,
      integratedTerrainPenaltyCostM: 120.0,
    });
    const b = makeMetrics({
      maxTerrainSlopeDeg: 10.0,
      integratedTerrainPenaltyCostM: 45.0,
    });

    const clause = formatTerrainDelta(b, a);
    expect(clause).toBe(
      'accepting a higher single-cell peak slope (8.0° → 10.0°) to reduce cumulative weighted slope/roughness exposure from 120.0 to 45.0 cost-m'
    );
  });

  it('Finding 6 Regression 4: Shorter uncertainty corridor when deltaD < 0', () => {
    const clause = formatDistanceDelta(40.0, 60.0);
    expect(clause).toBe('takes a 20.0 m (-33.3%) shorter corridor');
  });

  it('Templates 1a, 1b, 2, 3b, 4, and 5 emit required notices and uniform quality disclosure', () => {
    const flat = makeMetrics({ horizontalDistanceM: 25, maxTerrainSlopeDeg: 2.0 });
    const singleGentle = buildCandidateExplanations({
      candidates: [{ matchedPolicies: ['shortest', 'terrain', 'uncertainty'], metrics: flat }],
      equivalenceTopology: 'case_1_all_three_merged',
      profile: DEFAULT_PROFILE,
      qualityMode: 'prefer',
      effectiveWeights: makeWeights(false),
      uniformQualityClass: null,
    });
    expect(singleGentle[0].reasonCodes).toContain('CORRIDOR_ALREADY_GENTLE_AND_OBSERVED');

    const standaloneUniform = buildCandidateExplanations({
      candidates: [{ matchedPolicies: ['uncertainty'], metrics: flat }],
      equivalenceTopology: 'subset_request',
      profile: DEFAULT_PROFILE,
      qualityMode: 'prefer',
      effectiveWeights: makeWeights(true),
      uniformQualityClass: 'unknown',
    });
    expect(standaloneUniform).toHaveLength(1);
    expect(standaloneUniform[0].reasonCodes).toContain('UNIFORM_QUALITY_NO_DIFFERENTIATION');
    expect(standaloneUniform[0].bullets.some((b) => b.includes('γ_eff = 0'))).toBe(true);

    const shortUnc = makeMetrics({
      horizontalDistanceM: 40,
      maxTerrainSlopeDeg: 10,
      integratedTerrainPenaltyCostM: 40,
    });
    const badTerr = makeMetrics({
      horizontalDistanceM: 50,
      maxTerrainSlopeDeg: 0,
      lowQualityDistanceM: 30,
      unknownQualityDistanceM: 10,
      integratedTerrainPenaltyCostM: 0,
    });
    const case4 = buildCandidateExplanations({
      candidates: [
        { matchedPolicies: ['shortest', 'uncertainty'], metrics: shortUnc },
        { matchedPolicies: ['terrain'], metrics: badTerr },
      ],
      equivalenceTopology: 'case_4_shortest_uncertainty_merged',
      profile: DEFAULT_PROFILE,
      qualityMode: 'prefer',
      effectiveWeights: makeWeights(false),
      uniformQualityClass: null,
    });
    expect(case4[0].summary).toContain('observation-quality penalty outweighs its terrain savings');
    expect(case4[1].summary).toContain('adds 10.0 m (+25.0%)');
  });
});
