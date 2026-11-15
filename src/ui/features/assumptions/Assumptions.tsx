/**
 * Mission assumptions. Three policies stay visible.
 * The cost equation sits in a closed disclosure and is not a route calculation.
 */
import { useId, useState, type FC } from 'react';
import { ROUTE_POLICIES, type RoutePolicyId } from '../../../contracts';
import type { AssumptionsSlotProps } from '../../shared/types';
import { Panel } from '../../shared/primitives/Panel';
import './assumptions.css';

const POLICY_TITLES: Record<RoutePolicyId, string> = {
  'shortest-feasible': 'Shortest Feasible',
  'terrain-aware': 'Terrain Aware',
  'uncertainty-aware': 'Uncertainty Aware',
};

const POLICY_DESCRIPTIONS: Record<RoutePolicyId, string> = {
  'shortest-feasible': 'Minimizes total planar surface distance across traversable cells.',
  'terrain-aware': 'Penalizes steep slopes and surface roughness to reduce mechanical strain.',
  'uncertainty-aware':
    'Penalizes low or unknown data quality cells to prioritize well-characterized ground.',
};

const COST_EQUATION =
  'Shortest distance, plus a slope and roughness penalty, plus a quality penalty.';

const STRICT_QUALITY_COPY =
  'Strict mode hard-excludes low and unknown quality cells when this bundle allows it, and prefer mode keeps them with a cost penalty.';

const STRICT_QUALITY_UNAVAILABLE =
  'Strict quality exclusion is not available. This bundle has no strict quality classes.';

const ROUND_TRIP_COPY = 'Plan a return leg.';

export const Assumptions: FC<AssumptionsSlotProps> = ({
  mission,
  strictQualitySupported,
  dispatch,
}) => {
  const [weightsOpen, setWeightsOpen] = useState(false);
  const strictUnavailableId = useId();

  const handlePolicyToggle = (policy: RoutePolicyId, checked: boolean) => {
    const policies = ROUTE_POLICIES.filter((id) =>
      id === policy ? checked : mission.policies.includes(id),
    );
    dispatch({ type: 'mission/setPolicies', policies });
  };

  return (
    <Panel className="assumptions-panel" title="Mission Assumptions">
      <div className="assumptions-container" data-testid="assumptions-feature">
        <fieldset className="assumptions-fieldset">
          <legend className="assumptions-legend">Routing Policies</legend>
          <div className="assumptions-policies-list">
            {ROUTE_POLICIES.map((policy) => (
              <label key={policy} className="assumptions-row">
                <input
                  type="checkbox"
                  className="assumptions-checkbox"
                  data-testid={`policy-toggle-${policy}`}
                  checked={mission.policies.includes(policy)}
                  onChange={(event) => {
                    handlePolicyToggle(policy, event.target.checked);
                  }}
                />
                <span className="assumptions-policy-title">{POLICY_TITLES[policy]}</span>
              </label>
            ))}
          </div>

          {mission.policies.length === 0 && (
            <p className="assumptions-warning" data-testid="no-policies-warning" role="alert">
              At least one policy is required to calculate a traverse.
            </p>
          )}

          <details className="assumptions-weights" open={weightsOpen}>
            <summary
              className="assumptions-weights-summary"
              onClick={(event) => {
                event.preventDefault();
                setWeightsOpen((open) => !open);
              }}
            >
              Weights
            </summary>
            {weightsOpen ? (
              <div className="assumptions-weights-body">
                <p className="assumptions-equation">{COST_EQUATION}</p>
                <ul className="assumptions-weights-list">
                  {ROUTE_POLICIES.map((policy) => (
                    <li key={policy}>{POLICY_DESCRIPTIONS[policy]}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </details>
        </fieldset>

        <fieldset className="assumptions-fieldset">
          <legend className="assumptions-legend">Quality</legend>
          <div className="assumptions-switch-list">
            <label className="assumptions-row assumptions-row-strict">
              <input
                type="checkbox"
                className="assumptions-checkbox"
                data-testid="strict-quality-toggle"
                checked={mission.strictQuality}
                disabled={!strictQualitySupported}
                aria-describedby={strictQualitySupported ? undefined : strictUnavailableId}
                onChange={(event) => {
                  dispatch({ type: 'mission/setStrictQuality', value: event.target.checked });
                }}
              />
              <span className="assumptions-strict-copy">
                <span className="assumptions-policy-title">Strict quality</span>
                <span className="assumptions-strict-sentence">{STRICT_QUALITY_COPY}</span>
              </span>
            </label>
            {!strictQualitySupported && (
              <p className="assumptions-note" id={strictUnavailableId}>
                {STRICT_QUALITY_UNAVAILABLE}
              </p>
            )}
          </div>
        </fieldset>

        <fieldset className="assumptions-fieldset">
          <legend className="assumptions-legend">Round trip</legend>
          <div className="assumptions-switch-list">
            <label className="assumptions-row">
              <input
                type="checkbox"
                className="assumptions-checkbox"
                data-testid="round-trip-toggle"
                checked={mission.roundTrip}
                onChange={(event) => {
                  dispatch({ type: 'mission/setRoundTrip', value: event.target.checked });
                }}
              />
              <span className="assumptions-policy-title">{ROUND_TRIP_COPY}</span>
            </label>
          </div>
        </fieldset>
      </div>
    </Panel>
  );
};
