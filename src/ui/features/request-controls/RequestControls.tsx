/**
 * Calculate and Cancel controls. OWNER: Dhani (UI-014).
 * Calculate is the primary action. Cancel is mounted only while a request is running.
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
  const reason = typeof canReason === 'string' ? canReason : '';
  const showReason = !canRequest && reason.trim().length > 0;
  const isCalculateDisabled = !canRequest || isRunning;
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
          aria-busy={isRunning ? 'true' : 'false'}
          aria-describedby={showReason ? reasonId : undefined}
          onClick={handleCalculateClick}
          children={calculateLabel}
        />
        {isRunning ? (
          <Button
            variant="danger"
            size="md"
            className="request-controls-cancel-btn"
            data-testid="cancel-route"
            onClick={cancelRoute}
            children="Cancel"
          />
        ) : null}
      </div>
      {isRunning ? (
        <div
          className="request-controls-progress"
          role="status"
          aria-live="polite"
          data-testid="solving-progress"
          children="Calculating"
        />
      ) : null}
      {showReason ? (
        <p
          id={reasonId}
          className="request-controls-reason"
          data-testid="cannot-request-reason"
          children={reason}
        />
      ) : null}
    </div>
  );
};
