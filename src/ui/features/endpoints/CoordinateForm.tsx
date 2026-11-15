/**
 * CoordinateForm component. OWNER: Dhani (UI Role).
 * Provides accessible numeric coordinate inputs, extent validation, and snapped cell-center feedback.
 */
import { useId, useMemo, useState, type FC, type FormEvent } from 'react';
import { Button, VisuallyHidden, cellCenter, pointToCell } from '../../shared';
import type { GridSpec, LocalPoint } from '../../shared';
import type { MissionEndpoint } from '../../../state/store';
import styles from './endpoints.module.css';
import { validateCoordinate } from './validation';

export interface CoordinateFormProps {
  which: 'start' | 'destination';
  endpoint: MissionEndpoint | null;
  grid: GridSpec;
  onSet: (point: LocalPoint) => void;
  onClear: () => void;
  isActiveTarget: boolean;
  onSelectAsTarget: () => void;
}

export const CoordinateForm: FC<CoordinateFormProps> = ({
  which,
  endpoint,
  grid,
  onSet,
  onClear,
  isActiveTarget,
  onSelectAsTarget,
}) => {
  const idPrefix = useId();
  const cardTitleId = `${idPrefix}-title`;
  const eastInputId = `${idPrefix}-east`;
  const northInputId = `${idPrefix}-north`;
  const eastHintId = `${idPrefix}-east-hint`;
  const northHintId = `${idPrefix}-north-hint`;
  const errorId = `${idPrefix}-error`;

  const isStart = which === 'start';
  const labelText = isStart ? 'Start' : 'Destination';

  // Track previous endpoint to adjust local state during render without effects
  const [prevEndpoint, setPrevEndpoint] = useState(endpoint);
  const [eastInput, setEastInput] = useState(endpoint ? endpoint.point.east_m.toString() : '');
  const [northInput, setNorthInput] = useState(endpoint ? endpoint.point.north_m.toString() : '');
  const [error, setError] = useState<string | null>(null);

  if (endpoint !== prevEndpoint) {
    setPrevEndpoint(endpoint);
    setEastInput(endpoint ? endpoint.point.east_m.toString() : '');
    setNorthInput(endpoint ? endpoint.point.north_m.toString() : '');
    setError(null);
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const result = validateCoordinate(eastInput, northInput, grid);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.point) {
      setError(null);
      onSet(result.point);
    }
  };

  const handleSnapToCenter = () => {
    if (endpoint) {
      const cell = pointToCell(grid, endpoint.point);
      if (cell) {
        const center = cellCenter(grid, cell.row, cell.col);
        onSet(center);
        setEastInput(center.east_m.toString());
        setNorthInput(center.north_m.toString());
        setError(null);
      }
    } else {
      const result = validateCoordinate(eastInput, northInput, grid);
      if (result.point) {
        const cell = pointToCell(grid, result.point);
        if (cell) {
          const center = cellCenter(grid, cell.row, cell.col);
          onSet(center);
          setEastInput(center.east_m.toString());
          setNorthInput(center.north_m.toString());
          setError(null);
        }
      }
    }
  };

  const cellDetails = useMemo(() => {
    if (!endpoint) return null;
    const cell = pointToCell(grid, endpoint.point);
    if (!cell) return null;
    const center = cellCenter(grid, cell.row, cell.col);
    const diffEast = endpoint.point.east_m - center.east_m;
    const diffNorth = endpoint.point.north_m - center.north_m;
    const offsetDistance = Math.hypot(diffEast, diffNorth);
    return {
      cell,
      center,
      diffEast,
      diffNorth,
      offsetDistance,
      isAligned: offsetDistance < 0.001,
    };
  }, [endpoint, grid]);

  const eastDescribedBy = [eastHintId, error ? errorId : null].filter(Boolean).join(' ');
  const northDescribedBy = [northHintId, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div
      className={`${styles.card} ${isActiveTarget ? styles.cardActiveTarget : ''}`}
      data-testid={`endpoint-card-${which}`}
    >
      <div className={styles.cardHeader}>
        <div className={styles.cardTitleWrapper}>
          <span
            className={`${styles.pickMarkerBadge} ${isActiveTarget ? styles.badgeActive : ''}`}
            aria-hidden="true"
          >
            {isStart ? 'S' : 'D'}
          </span>
          <h3 id={cardTitleId} className={styles.cardTitle}>
            {labelText}
          </h3>
          {endpoint?.poiId && (
            <span className={styles.badgePreset} data-testid={`endpoint-${which}-preset-badge`}>
              Preset: {endpoint.poiId}
            </span>
          )}
        </div>
        <div className={styles.cardTargetSlot}>
          {isActiveTarget ? (
            <span className={styles.activeTargetBadge} data-testid={`endpoint-${which}-active-target`}>
              Active map target
            </span>
          ) : (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className={styles.setTargetBtn}
              onClick={onSelectAsTarget}
              aria-label={`Set ${which} as map click target`}
            >
              Set as map target
            </Button>
          )}
        </div>
      </div>

      <form className={styles.form} onSubmit={handleSubmit} aria-labelledby={cardTitleId} noValidate>
        <div className={styles.inputGrid}>
          <div className={styles.inputGroup}>
            <label htmlFor={eastInputId} className={styles.inputLabel}>
              East <VisuallyHidden>({which}) </VisuallyHidden>(m)
            </label>
            <input
              id={eastInputId}
              data-testid={`endpoint-${which}-east`}
              type="text"
              inputMode="decimal"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              className={`measurement ${styles.coordInput} ${error ? styles.inputHasError : ''}`}
              placeholder="25.0"
              value={eastInput}
              onChange={(e) => {
                setEastInput(e.target.value);
                if (error) setError(null);
              }}
              aria-describedby={eastDescribedBy}
              aria-invalid={error ? true : undefined}
            />
            <span id={eastHintId} className={`tabular-nums ${styles.inputHint}`}>
              {grid.extent.west_m} m to &lt; {grid.extent.east_m} m
            </span>
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor={northInputId} className={styles.inputLabel}>
              North <VisuallyHidden>({which}) </VisuallyHidden>(m)
            </label>
            <input
              id={northInputId}
              data-testid={`endpoint-${which}-north`}
              type="text"
              inputMode="decimal"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              className={`measurement ${styles.coordInput} ${error ? styles.inputHasError : ''}`}
              placeholder="65.0"
              value={northInput}
              onChange={(e) => {
                setNorthInput(e.target.value);
                if (error) setError(null);
              }}
              aria-describedby={northDescribedBy}
              aria-invalid={error ? true : undefined}
            />
            <span id={northHintId} className={`tabular-nums ${styles.inputHint}`}>
              &gt; {grid.extent.south_m} m to {grid.extent.north_m} m
            </span>
          </div>
        </div>

        {error && (
          <div id={errorId} className={styles.errorMessage} role="alert" data-testid={`endpoint-${which}-error`}>
            <svg
              className={styles.errorIcon}
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <circle cx="8" cy="8" r="6" />
              <path d="M8 5v3.5" />
              <path d="M8 11h.01" />
            </svg>
            <span className={styles.errorText}>{error}</span>
          </div>
        )}

        <div className={styles.buttonRow}>
          <Button type="submit" variant="primary" size="sm" data-testid={`endpoint-${which}-apply`}>
            Apply
            <VisuallyHidden> {which}</VisuallyHidden>
          </Button>

          {endpoint && !cellDetails?.isAligned && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleSnapToCenter}
              data-testid={`endpoint-${which}-snap`}
              title="Snap coordinates to containing cell center"
            >
              Snap to cell center
              <VisuallyHidden> ({which})</VisuallyHidden>
            </Button>
          )}

          {endpoint && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onClear}
              data-testid={`endpoint-${which}-clear`}
            >
              Clear
              <VisuallyHidden> {which} endpoint</VisuallyHidden>
            </Button>
          )}
        </div>
      </form>

      {endpoint && cellDetails ? (
        <div className={styles.cellFeedback} data-testid={`endpoint-${which}-feedback`}>
          <dl className={styles.feedbackList}>
            <div className={styles.feedbackRow}>
              <dt className={styles.feedbackKey}>Requested</dt>
              <dd
                className={`measurement ${styles.feedbackVal}`}
                data-testid={`endpoint-${which}-requested-pos`}
              >
                East {endpoint.point.east_m.toFixed(2)} m, North {endpoint.point.north_m.toFixed(2)} m
              </dd>
            </div>

            <div className={styles.feedbackRow}>
              <dt className={styles.feedbackKey}>Accepted cell center</dt>
              <dd
                className={`measurement ${styles.feedbackVal}`}
                data-testid={`endpoint-${which}-cell-center`}
              >
                East {cellDetails.center.east_m.toFixed(2)} m, North {cellDetails.center.north_m.toFixed(2)} m
              </dd>
            </div>

            <div className={styles.feedbackRow}>
              <dt className={styles.feedbackKey}>Grid cell</dt>
              <dd
                className={`measurement ${styles.feedbackVal}`}
                data-testid={`endpoint-${which}-cell-indices`}
              >
                Row {cellDetails.cell.row}, Col {cellDetails.cell.col} (Index {cellDetails.cell.index})
              </dd>
            </div>

            <div className={styles.feedbackRow}>
              <dt className={styles.feedbackKey}>Alignment</dt>
              <dd className={`measurement ${styles.feedbackVal}`}>
                {cellDetails.isAligned
                  ? 'Aligned with cell center (0.00 m offset)'
                  : `${cellDetails.offsetDistance.toFixed(2)} m offset from center`}
              </dd>
            </div>
          </dl>
        </div>
      ) : (
        <p className={styles.emptyState} data-testid={`endpoint-${which}-empty`}>
          Endpoint not set. Click on the map or enter coordinates above.
        </p>
      )}
    </div>
  );
};
