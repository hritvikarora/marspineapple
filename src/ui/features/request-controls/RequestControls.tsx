/**
 * Route Request, Cancel, and Progress Controls Component. OWNER: Dhani (TASK-006).
 * Manages route execution lifecycle, providing clear feedback on solving state and cancellation.
 */
import { type FC } from 'react';
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
  return (
    <div className="request-controls-container" data-testid="request-controls-feature">
      <div className="request-controls-buttons">
        <Button
          variant="primary"
          size="md"
          className="request-controls-calculate-btn"
          data-testid="calculate"
          disabled={!canRequest || isRunning}
          onClick={requestRoute}
          title={!canRequest ? canReason : 'Calculate traversable paths for selected policies'}
          aria-busy={isRunning}
        >
          {isRunning ? 'Calculating...' : candidateCount > 0 ? 'Recalculate Traverse' : 'Calculate Traverse'}
        </Button>

        {isRunning && (
          <Button
            variant="danger"
            size="md"
            className="request-controls-cancel-btn"
            data-testid="cancel-request"
            onClick={cancelRoute}
            aria-label="Cancel traverse calculation"
          >
            Cancel
          </Button>
        )}
      </div>

      {isRunning && (
        <div className="request-controls-progress" role="status" aria-live="polite" data-testid="solving-progress">
          <span className="request-controls-spinner" aria-hidden="true" />
          <span className="request-controls-progress-text">Solving optimal Martian traverse routes...</span>
        </div>
      )}

      {!canRequest && !isRunning && canReason && (
        <p className="request-controls-reason" data-testid="cannot-request-reason">
          {canReason}
        </p>
      )}
    </div>
  );
};
