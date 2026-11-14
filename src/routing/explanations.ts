import type {
  ConstraintProfile,
  EffectivePolicyWeights,
  EquivalenceTopology,
  PolicyId,
  QualityClass,
  QualityMode,
  RouteExplanation,
  RouteMetrics,
} from '../contracts/routing.js';

const DELTA_EPS = 1e-4;

function formatPct(numerator: number, denominator: number): string {
  if (denominator <= 1e-9) {
    return '0.0';
  }
  return ((numerator / denominator) * 100).toFixed(1);
}

function formatBaseline(metrics: RouteMetrics): string {
  const east = metrics.slopeBaselineM.eastM;
  const north = metrics.slopeBaselineM.northM;
  if (Math.abs(east - north) <= 1e-6) {
    return east.toFixed(1);
  }
  return `${east.toFixed(1)}×${north.toFixed(1)}`;
}

/**
 * Clause Builder 1: Signed horizontal distance comparison between route B and reference route A.
 */
export function formatDistanceDelta(distBM: number, distAM: number): string {
  const delta = distBM - distAM;
  if (delta > DELTA_EPS) {
    return `adds ${delta.toFixed(1)} m (+${formatPct(delta, distAM)}%)`;
  }
  if (delta < -DELTA_EPS) {
    const absDelta = Math.abs(delta);
    return `takes a ${absDelta.toFixed(1)} m (-${formatPct(absDelta, distAM)}%) shorter corridor`;
  }
  return `follows an equal-length ${distBM.toFixed(1)} m alternative corridor`;
}

/**
 * Clause Builder 2: Signed terrain comparison (max slope and integrated slope/roughness penalty).
 */
export function formatTerrainDelta(metricsB: RouteMetrics, metricsA: RouteMetrics): string {
  const deltaSlope = metricsB.maxTerrainSlopeDeg - metricsA.maxTerrainSlopeDeg;
  const srA = metricsA.integratedTerrainPenaltyCostM;
  const srB = metricsB.integratedTerrainPenaltyCostM;
  const rA = metricsA.integratedRoughnessPenaltyCostM;
  const rB = metricsB.integratedRoughnessPenaltyCostM;
  const slopeA = metricsA.maxTerrainSlopeDeg.toFixed(1);
  const slopeB = metricsB.maxTerrainSlopeDeg.toFixed(1);

  // Branch T1: Peak terrain slope strictly reduced
  if (deltaSlope < -DELTA_EPS) {
    let clause = `to reduce maximum modeled terrain slope from ${slopeA}° to ${slopeB}°`;
    if (rB < rA - DELTA_EPS) {
      clause += ` and cumulative roughness exposure from ${rA.toFixed(1)} to ${rB.toFixed(1)} cost-m`;
    }
    return clause;
  }

  // Branch T2: Equal peak slope with lower integrated slope/roughness exposure
  if (Math.abs(deltaSlope) <= DELTA_EPS && srB < srA - DELTA_EPS) {
    return `to reduce cumulative slope and roughness exposure from ${srA.toFixed(1)} to ${srB.toFixed(1)} cost-m (at ${slopeB}° max slope)`;
  }

  // Branch T3: Higher peak slope accepted for lower integrated terrain exposure
  if (deltaSlope > DELTA_EPS && srB < srA - DELTA_EPS) {
    return `accepting a higher single-cell peak slope (${slopeA}° → ${slopeB}°) to reduce cumulative weighted slope/roughness exposure from ${srA.toFixed(1)} to ${srB.toFixed(1)} cost-m`;
  }

  if (rB < rA - DELTA_EPS) {
    return `to reduce cumulative roughness exposure from ${rA.toFixed(1)} to ${rB.toFixed(1)} cost-m (at ${slopeB}° max slope)`;
  }

  return `with ${slopeB}° maximum modeled terrain slope (${srB.toFixed(1)} cost-m weighted slope/roughness exposure)`;
}

/**
 * Clause Builder 3: Separate LOW (U=1.0) vs UNKNOWN (U=0.75) quality comparison with optional terrain trade-off.
 */
export function formatQualityDelta(metricsB: RouteMetrics, metricsA: RouteMetrics): string {
  const lowA = metricsA.lowQualityDistanceM;
  const lowB = metricsB.lowQualityDistanceM;
  const unkA = metricsA.unknownQualityDistanceM;
  const unkB = metricsB.unknownQualityDistanceM;
  const deltaLow = lowB - lowA;
  const deltaUnk = unkB - unkA;
  const wUA = metricsA.weightedUncertaintyExposureM;
  const wUB = metricsB.weightedUncertaintyExposureM;
  const deltaWU = wUB - wUA;

  let clause: string;

  // Branch Q1: Non-increasing in both LOW and UNKNOWN with strict reduction in weighted uncertainty
  if (deltaLow <= DELTA_EPS && deltaUnk <= DELTA_EPS && deltaWU < -DELTA_EPS) {
    const lowReduced = deltaLow < -DELTA_EPS;
    const unkReduced = deltaUnk < -DELTA_EPS;
    if (lowReduced && unkReduced) {
      clause = `to reduce low-confidence exposure from ${lowA.toFixed(1)} m to ${lowB.toFixed(1)} m and unknown-quality exposure from ${unkA.toFixed(1)} m to ${unkB.toFixed(1)} m`;
    } else if (lowReduced) {
      clause = `to reduce low-confidence quality exposure from ${lowA.toFixed(1)} m (${metricsA.lowQualityPct.toFixed(1)}%) to ${lowB.toFixed(1)} m (${metricsB.lowQualityPct.toFixed(1)}%)`;
    } else {
      clause = `to reduce unknown-quality exposure from ${unkA.toFixed(1)} m (${metricsA.unknownQualityPct.toFixed(1)}%) to ${unkB.toFixed(1)} m (${metricsB.unknownQualityPct.toFixed(1)}%)`;
    }
  } else if (deltaLow < -DELTA_EPS && deltaUnk > DELTA_EPS) {
    // Branch Q2: LOW-for-UNKNOWN trade-off
    const wuVerb = deltaWU < -DELTA_EPS ? 'lowering' : 'shifting';
    clause =
      `to reduce high-penalty low-confidence exposure from ${lowA.toFixed(1)} m (${metricsA.lowQualityPct.toFixed(1)}%) ` +
      `to ${lowB.toFixed(1)} m (${metricsB.lowQualityPct.toFixed(1)}%) by routing through ${unkB.toFixed(1)} m ` +
      `(${metricsB.unknownQualityPct.toFixed(1)}%) of unknown-quality terrain (vs. ${unkA.toFixed(1)} m), ` +
      `${wuVerb} weighted observation-uncertainty exposure from ${wUA.toFixed(1)} to ${wUB.toFixed(1)} m-eq`;
  } else if (deltaWU < -DELTA_EPS) {
    clause = `to lower weighted observation-uncertainty exposure from ${wUA.toFixed(1)} to ${wUB.toFixed(1)} m-eq`;
  } else {
    clause = `with ${lowB.toFixed(1)} m low-confidence and ${unkB.toFixed(1)} m unknown-quality exposure`;
  }

  // Branch Q3: Combined quality + terrain trade-off
  if (deltaWU < -DELTA_EPS && metricsB.maxTerrainSlopeDeg > metricsA.maxTerrainSlopeDeg + DELTA_EPS) {
    clause += ` while crossing a ${metricsB.maxTerrainSlopeDeg.toFixed(1)}° max-slope corridor (vs. ${metricsA.maxTerrainSlopeDeg.toFixed(1)}° on the terrain route)`;
  }

  return clause;
}

export type BuildCandidateExplanationsParams = {
  candidates: Array<{ matchedPolicies: PolicyId[]; metrics: RouteMetrics }>;
  equivalenceTopology: EquivalenceTopology;
  profile: ConstraintProfile;
  qualityMode: QualityMode;
  effectiveWeights: Record<PolicyId, EffectivePolicyWeights>;
  uniformQualityClass: QualityClass | null;
};

function buildUniformQualityNotice(uniformQualityClass: QualityClass | null): string {
  const label = uniformQualityClass ? uniformQualityClass.toUpperCase() : 'UNIFORM';
  return (
    `Observation quality is uniform (${label}) across all admissible cells in this region, ` +
    `so effective quality weight is set to γ_eff = 0 (UNIFORM_QUALITY_NO_DIFFERENTIATION) ` +
    `and uncertainty-aware routing evaluates the terrain-only objective.`
  );
}

function buildStrictModeNotice(): string {
  return 'Strict quality mode is active: low-confidence and unknown-quality cells are excluded as hard constraints.';
}

function buildSummaryMetricsBullet(m: RouteMetrics): string {
  return (
    `Horizontal distance ${m.horizontalDistanceM.toFixed(1)} m (3D surface ${m.surfaceDistanceM.toFixed(1)} m), ` +
    `max slope ${m.maxTerrainSlopeDeg.toFixed(1)}° over ${formatBaseline(m)} m baseline, ` +
    `ascent ${m.cumulativeAscentM.toFixed(1)} m / descent ${m.cumulativeDescentM.toFixed(1)} m.`
  );
}

/**
 * Generates deterministic, signed-delta explanations for all deduplicated route candidates.
 */
export function buildCandidateExplanations(
  params: BuildCandidateExplanationsParams
): RouteExplanation[] {
  const {
    candidates,
    equivalenceTopology,
    profile,
    qualityMode,
    effectiveWeights,
    uniformQualityClass,
  } = params;

  const findCandidate = (policy: PolicyId) =>
    candidates.find((c) => c.matchedPolicies.includes(policy));

  const hasUniformOverride = Object.values(effectiveWeights).some(
    (w) => w?.uniformQualityOverride === true
  );

  const appendSharedFlags = (
    bullets: string[],
    reasonCodes: string[],
    includeUniformNotice: boolean
  ): void => {
    if (includeUniformNotice && hasUniformOverride) {
      bullets.push(buildUniformQualityNotice(uniformQualityClass));
      if (!reasonCodes.includes('UNIFORM_QUALITY_NO_DIFFERENTIATION')) {
        reasonCodes.push('UNIFORM_QUALITY_NO_DIFFERENTIATION');
      }
    }
    if (qualityMode === 'strict') {
      bullets.push(buildStrictModeNotice());
      if (!reasonCodes.includes('STRICT_QUALITY_MODE')) {
        reasonCodes.push('STRICT_QUALITY_MODE');
      }
    }
  };

  // Standalone single-policy request (Template 5)
  if (candidates.length === 1 && candidates[0].matchedPolicies.length === 1) {
    const c = candidates[0];
    const m = c.metrics;
    const policy = c.matchedPolicies[0];
    const baseline = formatBaseline(m);
    const summary =
      `${policy} policy route: ${m.horizontalDistanceM.toFixed(1)} m horizontal distance, ` +
      `${m.maxTerrainSlopeDeg.toFixed(1)}° max modeled slope over ${baseline} m baseline, ` +
      `${m.lowQualityDistanceM.toFixed(1)} m low-confidence and ${m.unknownQualityDistanceM.toFixed(1)} m unknown-quality exposure.`;
    const bullets = [buildSummaryMetricsBullet(m)];
    const reasonCodes = ['STANDALONE_POLICY_ROUTE'];
    const policyHasUniform = effectiveWeights[policy]?.uniformQualityOverride === true;
    appendSharedFlags(bullets, reasonCodes, policyHasUniform || hasUniformOverride);
    return [{ summary, bullets, reasonCodes }];
  }

  // Case 1: All requested policies merge into one corridor (Template 1a / 1b)
  if (equivalenceTopology === 'case_1_all_three_merged' || candidates.length === 1) {
    const c = candidates[0];
    const m = c.metrics;
    const baseline = formatBaseline(m);
    const isGentleAndObserved =
      m.maxTerrainSlopeDeg <= 5 + DELTA_EPS &&
      m.lowQualityDistanceM + m.unknownQualityDistanceM <= DELTA_EPS;

    const summary = isGentleAndObserved
      ? `All requested policies select the same ${m.horizontalDistanceM.toFixed(1)} m route (max modeled terrain slope ${m.maxTerrainSlopeDeg.toFixed(1)}° over a ${baseline} m baseline, 0 m low/unknown quality exposure). Along this corridor, the shortest feasible path already crosses gentle, well-observed terrain.`
      : `All requested policies select the same ${m.horizontalDistanceM.toFixed(1)} m route (max modeled terrain slope ${m.maxTerrainSlopeDeg.toFixed(1)}° over a ${baseline} m baseline, ${m.lowQualityDistanceM.toFixed(1)} m low-confidence and ${m.unknownQualityDistanceM.toFixed(1)} m unknown-quality exposure). Under the active ${profile.maxTerrainSlopeDeg.toFixed(1)}° admissibility constraints, no alternative corridor achieves a lower weighted terrain or observation-quality cost.`;

    const bullets = [buildSummaryMetricsBullet(m)];
    const reasonCodes = [
      isGentleAndObserved ? 'CORRIDOR_ALREADY_GENTLE_AND_OBSERVED' : 'SINGLE_ADMISSIBLE_CORRIDOR',
    ];
    appendSharedFlags(bullets, reasonCodes, true);
    return [{ summary, bullets, reasonCodes }];
  }

  const shortCand = findCandidate('shortest');
  const terrCand = findCandidate('terrain');
  const uncCand = findCandidate('uncertainty');

  return candidates.map((c) => {
    const m = c.metrics;
    const policies = c.matchedPolicies;
    const bullets = [buildSummaryMetricsBullet(m)];
    const reasonCodes: string[] = [];

    // Case 4: ['shortest', 'uncertainty'] merged vs distinct ['terrain'] (Template 3b)
    if (
      equivalenceTopology === 'case_4_shortest_uncertainty_merged' &&
      policies.includes('shortest') &&
      policies.includes('uncertainty') &&
      terrCand
    ) {
      const tm = terrCand.metrics;
      const summary =
        `The terrain-aware policy ${formatDistanceDelta(tm.horizontalDistanceM, m.horizontalDistanceM)} ` +
        `${formatTerrainDelta(tm, m)}, but crosses ${tm.lowQualityDistanceM.toFixed(1)} m low-confidence ` +
        `and ${tm.unknownQualityDistanceM.toFixed(1)} m unknown-quality terrain. ` +
        `The uncertainty-aware policy remains on the ${m.horizontalDistanceM.toFixed(1)} m path ` +
        `(${m.lowQualityDistanceM.toFixed(1)} m low-confidence, ${m.unknownQualityDistanceM.toFixed(1)} m unknown-quality) ` +
        `because the detour's observation-quality penalty outweighs its terrain savings.`;
      reasonCodes.push('QUALITY_PENALTY_OUTWEIGHS_TERRAIN_DETOUR');
      appendSharedFlags(bullets, reasonCodes, false);
      return { summary, bullets, reasonCodes };
    }

    // Shortest (or shortest + terrain merged) baseline candidate
    if (policies.includes('shortest')) {
      const label = policies.includes('terrain')
        ? 'Shortest and terrain-aware policies select the same'
        : 'Shortest feasible route:';
      const summary = policies.includes('terrain')
        ? `${label} ${m.horizontalDistanceM.toFixed(1)} m route (${m.maxTerrainSlopeDeg.toFixed(1)}° max modeled slope, ${m.lowQualityDistanceM.toFixed(1)} m low-confidence, ${m.unknownQualityDistanceM.toFixed(1)} m unknown-quality exposure).`
        : `${label} ${m.horizontalDistanceM.toFixed(1)} m (${m.maxTerrainSlopeDeg.toFixed(1)}° max modeled slope, ${m.lowQualityDistanceM.toFixed(1)} m low-confidence, ${m.unknownQualityDistanceM.toFixed(1)} m unknown-quality exposure).`;
      reasonCodes.push('SHORTEST_FEASIBLE_BASELINE');
      appendSharedFlags(bullets, reasonCodes, false);
      return { summary, bullets, reasonCodes };
    }

    // Terrain (or terrain + uncertainty merged) candidate compared with shortest (Template 2)
    if (policies.includes('terrain')) {
      const summary = shortCand
        ? `Compared with the shortest feasible route (${shortCand.metrics.horizontalDistanceM.toFixed(1)} m), the terrain-aware route ${formatDistanceDelta(m.horizontalDistanceM, shortCand.metrics.horizontalDistanceM)} ${formatTerrainDelta(m, shortCand.metrics)}.`
        : `Terrain-aware route: ${m.horizontalDistanceM.toFixed(1)} m (${m.maxTerrainSlopeDeg.toFixed(1)}° max modeled slope, ${m.lowQualityDistanceM.toFixed(1)} m low-confidence, ${m.unknownQualityDistanceM.toFixed(1)} m unknown-quality exposure).`;
      reasonCodes.push(
        policies.includes('uncertainty') ? 'TERRAIN_AND_UNCERTAINTY_MERGED' : 'TERRAIN_DETOUR'
      );
      appendSharedFlags(bullets, reasonCodes, policies.includes('uncertainty'));
      return { summary, bullets, reasonCodes };
    }

    // Distinct uncertainty candidate compared with terrain (or shortest if terrain absent) (Template 3a)
    const refCand = terrCand ?? shortCand ?? uncCand;
    const summary =
      refCand && refCand !== c
        ? `Compared with the terrain-aware route (${refCand.metrics.horizontalDistanceM.toFixed(1)} m), the uncertainty-aware route ${formatDistanceDelta(m.horizontalDistanceM, refCand.metrics.horizontalDistanceM)} ${formatQualityDelta(m, refCand.metrics)}.`
        : `Uncertainty-aware route: ${m.horizontalDistanceM.toFixed(1)} m (${m.lowQualityDistanceM.toFixed(1)} m low-confidence, ${m.unknownQualityDistanceM.toFixed(1)} m unknown-quality exposure).`;
    reasonCodes.push('UNCERTAINTY_QUALITY_DETOUR');
    appendSharedFlags(bullets, reasonCodes, true);
    return { summary, bullets, reasonCodes };
  });
}
