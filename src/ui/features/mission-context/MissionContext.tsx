/**
 * Mission Context & Initial Guidance Feature. OWNER: Dhani (TASK-002).
 * Displays region information, educational simulation disclaimer, synthetic fixture warning,
 * fictional outpost labeling, and dynamic initial guidance with clear next actions.
 */
import { useContext, useId } from 'react';
import type { MissionContextSlotProps } from '../../shared/types';
import { AppStateContext } from '../../../state/context';
import { formatReleaseId } from '../../../contracts';
import { computeNextAction } from './nextAction';
import './mission-context.css';

const WORKFLOW_STEPS = [
  { step: 1, label: '1. Start' },
  { step: 2, label: '2. Destination' },
  { step: 3, label: '3. Policies' },
  { step: 4, label: '4. Calculate' },
  { step: 5, label: '5. Review' },
];

export function MissionContext({
  manifest,
  release,
  production = false,
}: MissionContextSlotProps) {
  const headingId = useId();
  const nextStepId = useId();
  const appCtx = useContext(AppStateContext);

  if (!manifest) {
    return (
      <section className="mission-context mission-context-empty" aria-label="Mission context">
        <p className="muted">No region data loaded.</p>
      </section>
    );
  }

  const mission = appCtx?.state.currentMission;
  const routeRun = appCtx?.state.routeRun;
  const isStale = appCtx?.state.isStale ?? false;
  const nextAction = computeNextAction(mission, routeRun, isStale);

  const outposts = (manifest.pointsOfInterest ?? []).filter((p) => p.kind === 'outpost');
  const isSynthetic = Boolean(manifest.synthetic);
  const grid = manifest.grid;
  const extent = grid?.extent;

  return (
    <section
      className="mission-context"
      aria-labelledby={headingId}
      data-testid="mission-context-panel"
    >
      <header className="mission-context-header">
        <div className="mission-context-title-row">
          <h2 id={headingId} className="mission-context-title">
            {manifest.title || 'Mars Mission Planner'}
          </h2>
          <div className="mission-context-badges" aria-label="Mission mode flags">
            <span className="mission-badge badge-simulation">Educational Simulation</span>
            {isSynthetic && (
              <span className="mission-badge badge-synthetic" data-testid="mission-context-synthetic-badge">
                Synthetic Fixture
              </span>
            )}
            <span className="mission-badge badge-outpost">Fictional Outpost</span>
          </div>
        </div>
      </header>

      {/* Production Warning for Synthetic Bundle */}
      {production && isSynthetic && (
        <div
          role="alert"
          className="mission-context-notice production-synthetic-alert"
          data-testid="mission-context-production-warning"
        >
          ⚠ Production Warning: This build is serving synthetic test data instead of real Mars observations.
        </div>
      )}

      {/* Educational Simulation Disclaimer */}
      <div
        role="note"
        className="mission-context-notice disclaimer-box"
        data-testid="mission-context-simulation-disclaimer"
      >
        <strong>Educational Simulation:</strong> Models theoretical rover traverse capabilities across
        Martian terrain for educational inquiry. Not an operational navigation system or life-support safety assessment.
      </div>

      {/* Synthetic Data Notice */}
      {isSynthetic && (
        <div
          role="alert"
          className="mission-context-notice synthetic-box"
          data-testid="mission-context-synthetic-warning"
        >
          <strong>Synthetic Test Data:</strong> This terrain grid is an artificial test fixture for
          algorithm development and verification. It does not represent NASA observation data.
        </div>
      )}

      {/* Fictional Outpost Notice */}
      <div
        className="mission-context-notice outpost-box"
        data-testid="mission-context-fictional-outpost"
      >
        <strong>Fictional Outpost:</strong> Starting bases and habitat locations in this simulation are
        fictional educational constructs.
        {outposts.length > 0 ? (
          <div style={{ marginTop: '4px' }}>
            {outposts.map((op) => (
              <div key={op.id} className="outpost-item">
                • <em>{op.name}</em> (Fictional outpost): {op.purpose}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ marginTop: '4px' }}>
            • <em>Mission Start Point:</em> Fictional simulated base location.
          </div>
        )}
      </div>

      {/* Dynamic Next Step & Initial Guidance Card */}
      <div
        className="mission-next-step-card"
        data-testid="mission-context-next-step"
        aria-labelledby={nextStepId}
      >
        <div className="mission-next-step-badge">
          <span>
            <span className="step-number" aria-hidden="true">
              {nextAction.step}
            </span>
            Next Action
          </span>
          <span className="step-status">Step {nextAction.step} of 5</span>
        </div>
        <h3 id={nextStepId} className="mission-next-step-title">
          {nextAction.action}
        </h3>
        <p className="mission-next-step-desc">{nextAction.instruction}</p>

        {/* Workflow Progress Steps */}
        <ol className="workflow-progress-list" aria-label="Planning workflow steps">
          {WORKFLOW_STEPS.map((s) => {
            const isCurrent = s.step === nextAction.step;
            const isCompleted = s.step < nextAction.step;
            return (
              <li
                key={s.step}
                className={`workflow-step-item ${isCurrent ? 'active' : ''} ${isCompleted ? 'completed' : ''}`.trim()}
                aria-current={isCurrent ? 'step' : undefined}
              >
                <div className="workflow-step-dot" aria-hidden="true" />
                <span>{s.label}</span>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Collapsible Region & Terrain Details */}
      <details className="mission-region-details">
        <summary>Region & Terrain Context</summary>
        {manifest.description && (
          <p className="mission-context-desc" style={{ marginTop: '6px', marginBottom: '8px' }}>
            {manifest.description}
          </p>
        )}
        <table className="region-specs-table" aria-label="Terrain region specifications">
          <tbody>
            <tr>
              <th scope="row">Bundle / Dataset</th>
              <td>
                {manifest.bundleId} ({manifest.bundleVersion})
              </td>
            </tr>
            {grid && (
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
            )}
            {extent && (
              <tr>
                <th scope="row">Local Extent</th>
                <td>
                  East: [{extent.west_m} m, {extent.east_m} m]<br />
                  North: [{extent.south_m} m, {extent.north_m} m]
                </td>
              </tr>
            )}
            {manifest.crs && (
              <tr>
                <th scope="row">Vertical Datum</th>
                <td>{manifest.crs.verticalReference}</td>
              </tr>
            )}
            {release && (
              <tr>
                <th scope="row">Release</th>
                <td>{formatReleaseId(release)}</td>
              </tr>
            )}
          </tbody>
        </table>

        {manifest.limitations && manifest.limitations.length > 0 && (
          <div style={{ marginTop: '8px' }}>
            <strong style={{ fontSize: '11px', color: 'var(--color-muted, #b7c3cf)' }}>
              Documented Limitations:
            </strong>
            <ul className="mission-limitations-list">
              {manifest.limitations.map((lim, idx) => (
                <li key={idx}>{lim}</li>
              ))}
            </ul>
          </div>
        )}
      </details>
    </section>
  );
}
