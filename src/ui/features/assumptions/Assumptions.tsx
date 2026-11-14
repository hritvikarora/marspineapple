/**
 * Mission Assumptions & Constraints Component. OWNER: Dhani (TASK-005).
 * Enables learners to configure routing optimization policies, strict data quality constraints,
 * and round-trip traverses without unsupported physics models (e.g. oxygen/battery).
 */
import { type ChangeEvent, type FC } from 'react';
import { ROUTE_POLICIES, type RoutePolicyId } from '../../../contracts';
import type { AssumptionsSlotProps } from '../../shared/types';
import { Panel } from '../../shared/primitives/Panel';
import './assumptions.css';

const POLICY_METADATA: Record<RoutePolicyId, { title: string; description: string }> = {
  'shortest-feasible': {
    title: 'Shortest Feasible',
    description: 'Minimizes total planar surface distance across traversable cells.',
  },
  'terrain-aware': {
    title: 'Terrain Aware',
    description: 'Penalizes steep slopes and surface roughness to reduce mechanical strain.',
  },
  'uncertainty-aware': {
    title: 'Uncertainty Aware',
    description: 'Penalizes low or unknown data quality cells to prioritize well-characterized ground.',
  },
};

export const Assumptions: FC<AssumptionsSlotProps> = ({
  mission,
  strictQualitySupported,
  dispatch,
}) => {
  const handlePolicyToggle = (policy: RoutePolicyId, checked: boolean) => {
    let newPolicies: RoutePolicyId[];
    if (checked) {
      newPolicies = [...mission.policies, policy];
    } else {
      newPolicies = mission.policies.filter((p) => p !== policy);
    }
    dispatch({ type: 'mission/setPolicies', policies: newPolicies });
  };

  const handleStrictQualityChange = (e: ChangeEvent<HTMLInputElement>) => {
    dispatch({ type: 'mission/setStrictQuality', value: e.target.checked });
  };

  const handleRoundTripChange = (e: ChangeEvent<HTMLInputElement>) => {
    dispatch({ type: 'mission/setRoundTrip', value: e.target.checked });
  };

  return (
    <Panel className="assumptions-panel" title="Mission Assumptions">
      <div className="assumptions-container" data-testid="assumptions-feature">
        {/* Routing Policies */}
        <fieldset className="assumptions-fieldset">
          <legend className="assumptions-legend">Routing Policies</legend>
          <p className="assumptions-hint">
            Select one or more policies to compute and compare distinct traverse strategies:
          </p>

          <div className="assumptions-policies-list" role="group" aria-label="Available routing policies">
            {ROUTE_POLICIES.map((policy) => {
              const isChecked = mission.policies.includes(policy);
              const meta = POLICY_METADATA[policy];
              return (
                <label key={policy} className="assumptions-checkbox-item">
                  <input
                    type="checkbox"
                    className="assumptions-checkbox"
                    data-testid={`policy-toggle-${policy}`}
                    checked={isChecked}
                    onChange={(e) => handlePolicyToggle(policy, e.target.checked)}
                  />
                  <div className="assumptions-checkbox-label">
                    <span className="assumptions-policy-title">{meta.title}</span>
                    <span className="assumptions-policy-desc">{meta.description}</span>
                  </div>
                </label>
              );
            })}
          </div>

          {mission.policies.length === 0 && (
            <p className="assumptions-warning" data-testid="no-policies-warning" role="alert">
              At least one policy is required to calculate a traverse.
            </p>
          )}
        </fieldset>

        {/* Quality Constraint */}
        <fieldset className="assumptions-fieldset">
          <legend className="assumptions-legend">Quality & Safety Constraints</legend>
          <label className="assumptions-checkbox-item">
            <input
              type="checkbox"
              className="assumptions-checkbox"
              data-testid="strict-quality-toggle"
              checked={mission.strictQuality}
              disabled={!strictQualitySupported}
              onChange={handleStrictQualityChange}
            />
            <div className="assumptions-checkbox-label">
              <span className="assumptions-policy-title">Strict Quality Exclusion</span>
              <span className="assumptions-policy-desc">
                Treats low-quality (2) and unknown (3) elevation cells as hard barriers (OUTSIDE_EXTENT/MANUAL) rather than cost penalties.
              </span>
            </div>
          </label>
          {!strictQualitySupported && (
            <p className="assumptions-note">Strict quality exclusion is not available for this bundle configuration.</p>
          )}
        </fieldset>

        {/* Traverse Scope */}
        <fieldset className="assumptions-fieldset">
          <legend className="assumptions-legend">Mission Scope</legend>
          <label className="assumptions-checkbox-item">
            <input
              type="checkbox"
              className="assumptions-checkbox"
              data-testid="round-trip-toggle"
              checked={mission.roundTrip}
              onChange={handleRoundTripChange}
            />
            <div className="assumptions-checkbox-label">
              <span className="assumptions-policy-title">Round-Trip Mission</span>
              <span className="assumptions-policy-desc">
                Requires solving both outbound exploration and a distinct safe return traverse to the starting outpost.
              </span>
            </div>
          </label>
        </fieldset>
      </div>
    </Panel>
  );
};
