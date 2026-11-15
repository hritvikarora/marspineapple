/**
 * Mission context. One title, one context line, one next step.
 * Outposts are fictional. Science stops are not labeled fictional.
 */
import { useContext, useId } from 'react';
import type { MissionContextSlotProps } from '../../shared/types';
import { AppStateContext } from '../../../state/context';
import { formatReleaseId } from '../../../contracts';
import { computeNextAction } from './nextAction';
import './mission-context.css';

const SIMULATION_COPY = 'Educational Simulation: Not an operational navigation system.';

export function MissionContext({
  manifest,
  release,
  production = false,
}: MissionContextSlotProps) {
  const headingId = useId();
  const appCtx = useContext(AppStateContext);

  if (!manifest) {
    return (
      <section className="mission-context mission-context-empty" aria-label="Mission context">
        <p className="mission-context-line">No region data loaded.</p>
      </section>
    );
  }

  const mission = appCtx?.state.currentMission;
  const routeRun = appCtx?.state.routeRun;
  const isStale = appCtx?.state.isStale ?? false;
  const nextAction = computeNextAction(mission, routeRun, isStale);

  const outposts = (manifest.pointsOfInterest ?? []).filter((poi) => poi.kind === 'outpost');
  const isSynthetic = Boolean(manifest.synthetic);
  const grid = manifest.grid;
  const extent = grid?.extent;
  const outpostCopy = fictionalOutpostSentence(outposts);
  const releaseCopy = formatReleaseId(release);

  return (
    <section
      className="mission-context"
      aria-labelledby={headingId}
      data-testid="mission-context-panel"
    >
      <div className="mission-context-title-row">
        <h2 id={headingId} className="mission-context-title">
          {manifest.title || 'Mars Mission Planner'}
        </h2>
        {isSynthetic ? (
          <span className="mission-context-chip" data-testid="mission-context-synthetic-badge">
            Synthetic Fixture
          </span>
        ) : null}
      </div>

      <p className="mission-context-line">
        <span data-testid="mission-context-simulation-disclaimer">{SIMULATION_COPY}</span>{' '}
        <span data-testid="mission-context-fictional-outpost">{outpostCopy}</span>{' '}
        <span className="mission-context-release">{releaseCopy}</span>
      </p>

      {isSynthetic ? (
        <p
          className="mission-context-line"
          role="alert"
          data-testid="mission-context-synthetic-warning"
        >
          Synthetic Test Data: artificial test fixture.
        </p>
      ) : null}

      {production && isSynthetic ? (
        <p
          className="mission-context-alert"
          role="alert"
          data-testid="mission-context-production-warning"
        >
          Production Warning: This build is serving synthetic test data.
        </p>
      ) : null}

      <p className="mission-context-next" data-testid="mission-context-next-step">
        {routeRun?.kind === 'running'
          ? `${nextAction.action} ${routeRun.exploredNodes} nodes explored`
          : nextAction.action}
      </p>

      <details className="mission-region-details">
        <summary>Region & Terrain Context</summary>
        {manifest.description ? (
          <p className="mission-context-desc">{manifest.description}</p>
        ) : null}
        <table className="region-specs-table" aria-label="Terrain region specifications">
          <tbody>
            <tr>
              <th scope="row">Bundle / Dataset</th>
              <td>
                {manifest.bundleId} ({manifest.bundleVersion})
              </td>
            </tr>
            {grid ? (
              <>
                <tr>
                  <th scope="row">Grid Dimensions</th>
                  <td>
                    {grid.width} × {grid.height} cells
                  </td>
                </tr>
                <tr>
                  <th scope="row">Cell Resolution</th>
                  <td>
                    {grid.cellSizeEast_m} m × {grid.cellSizeNorth_m} m
                  </td>
                </tr>
              </>
            ) : null}
            {extent ? (
              <tr>
                <th scope="row">Local Extent</th>
                <td>
                  East: [{extent.west_m} m, {extent.east_m} m]
                  <br />
                  North: [{extent.south_m} m, {extent.north_m} m]
                </td>
              </tr>
            ) : null}
            {manifest.crs ? (
              <tr>
                <th scope="row">Vertical Datum</th>
                <td>{manifest.crs.verticalReference}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
        {manifest.limitations && manifest.limitations.length > 0 ? (
          <div className="mission-limitations">
            <p className="mission-limitations-label">Documented limitations</p>
            <ul className="mission-limitations-list">
              {manifest.limitations.map((limitation) => (
                <li key={limitation}>{limitation}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </details>
    </section>
  );
}

function fictionalOutpostSentence(
  outposts: readonly { name: string; purpose: string }[],
): string {
  if (outposts.length === 0) {
    return 'Fictional Outpost: Mission Start Point.';
  }
  const named = outposts.map((outpost) => {
    const purpose = outpost.purpose.trim();
    return purpose.length > 0 ? `${outpost.name}. ${purpose}` : outpost.name;
  });
  return `Fictional Outpost: ${named.join(' ')}`;
}
