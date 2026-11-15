/**
 * Route Request, Cancel, and Progress Controls Component. OWNER: Dhani (TASK-006).
 * Manages route execution lifecycle, providing clear feedback on solving state and cancellation.
 */
import { useId, type FC } from 'react';
import type { RequestControlsSlotProps } from '../../shared/types';
import { Button } from '../../shared/primitives/Button';
import './request-controls.css';

export const RequestControls: FC<RequestControlsSlotProps> = ({
  requestRoute,
  cancelRoute,
  canRequest,
  canReason,
  isRunning,
  candidateCount,
}) => {
  const reasonId = useId();
  const isCalculateDisabled = !canRequest || isRunning;
  const hasReason = typeof canReason === 'string' && canReason.trim().length > 0;
  const showReason = !canRequest && !isRunning && hasReason;

  const calculateLabel = isRunning
    ? 'Calculating...'
    : candidateCount > 0
      ? 'Recalculate'
      : 'Calculate';

  const handleCalculateClick = () => {
    if (isCalculateDisabled) {
      return;
    }
    requestRoute();
  };

  return (
    <div className="request-controls-container" data-testid="request-controls-feature">
      <div className="request-controls-buttons">
        <Button
          variant="primary"
          size="md"
          className="request-controls-calculate-btn"
          data-testid="calculate"
          disabled={isCalculateDisabled}
          onClick={handleCalculateClick}
          title={showReason ? canReason : undefined}
          aria-busy={isRunning}
          aria-describedby={showReason ? reasonId : undefined}
        >
          {calculateLabel}
        </Button>

        {isRunning && (
          <Button
            variant="danger"
            size="md"
            className="request-controls-cancel-btn"
            data-testid="cancel-request"
            onClick={cancelRoute}
          >
            Cancel
          </Button>
        )}
      </div>

      {isRunning && (
        <div
          className="request-controls-progress"
          role="status"
          aria-live="polite"
          data-testid="solving-progress"
        >
          <span className="request-controls-spinner" aria-hidden="true" />
          <span className="request-controls-progress-text">Calculating</span>
        </div>
      )}

      {showReason && (
        <p id={reasonId} className="request-controls-reason" data-testid="cannot-request-reason">
          {canReason}
        </p>
      )}
    </div>
  );
};
