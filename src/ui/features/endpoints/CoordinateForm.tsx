/**
 * CoordinateForm component. OWNER: Dhani (UI Role).
 * Provides accessible numeric coordinate inputs, extent validation, and snapped cell-center feedback.
 */
import { useId, useMemo, useState, type FC, type FormEvent } from 'react';
import { cellCenter, pointToCell } from '../../shared';
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
  const eastInputId = `${idPrefix}-east`;
  const northInputId = `${idPrefix}-north`;
  const errorId = `${idPrefix}-error`;
  const hintId = `${idPrefix}-hint`;

  const isStart = which === 'start';
  const labelText = isStart ? 'Start Endpoint (S)' : 'Destination Endpoint (D)';
  const badgeClass = isStart ? styles.badgeStart : styles.badgeDestination;

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

  return (
    <div
      className={`${styles.card} ${isActiveTarget ? styles.cardActiveTarget : ''}`}
      data-testid={`endpoint-card-${which}`}
    >
      <div className={styles.cardHeader}>
        <div className={styles.cardTitleWrapper}>
          <span className={`${styles.pickMarkerBadge} ${badgeClass}`} aria-hidden="true">
            {isStart ? 'S' : 'D'}
          </span>
          <h3 className={styles.cardTitle}>{labelText}</h3>
          {endpoint?.poiId && (
            <span className={styles.badgePreset} data-testid={`endpoint-${which}-preset-badge`}>
              Preset: {endpoint.poiId}
            </span>
          )}
        </div>
        <div>
          {isActiveTarget ? (
            <span className={styles.activeTargetBadge} data-testid={`endpoint-${which}-active-target`}>
              Active Map Target
            </span>
          ) : (
            <button
              type="button"
              className={styles.setTargetBtn}
              onClick={onSelectAsTarget}
              aria-label={`Set ${which} as map click target`}
            >
              Set as Map Target
            </button>
          )}
        </div>
      </div>

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <div className={styles.inputGrid}>
          <div className={styles.inputGroup}>
            <label htmlFor={eastInputId} className={styles.inputLabel}>
              East coordinate (m)
            </label>
            <input
              id={eastInputId}
              data-testid={`endpoint-${which}-east`}
              type="text"
              inputMode="decimal"
              className={`${styles.coordInput} ${error ? styles.inputHasError : ''}`}
              placeholder="e.g. 25.0"
              value={eastInput}
              onChange={(e) => {
                setEastInput(e.target.value);
                if (error) setError(null);
              }}
              aria-describedby={error ? errorId : hintId}
              aria-invalid={error ? true : undefined}
              aria-label={`${which} east coordinate in meters`}
            />
            <span id={hintId} className={styles.inputHint}>
              Valid: {grid.extent.west_m} m to &lt; {grid.extent.east_m} m
            </span>
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor={northInputId} className={styles.inputLabel}>
              North coordinate (m)
            </label>
            <input
              id={northInputId}
              data-testid={`endpoint-${which}-north`}
              type="text"
              inputMode="decimal"
              className={`${styles.coordInput} ${error ? styles.inputHasError : ''}`}
              placeholder="e.g. 65.0"
              value={northInput}
              onChange={(e) => {
                setNorthInput(e.target.value);
                if (error) setError(null);
              }}
              aria-describedby={error ? errorId : hintId}
              aria-invalid={error ? true : undefined}
              aria-label={`${which} north coordinate in meters`}
            />
            <span className={styles.inputHint}>
              Valid: &gt; {grid.extent.south_m} m to {grid.extent.north_m} m
            </span>
          </div>
        </div>

        {error && (
          <p id={errorId} className={styles.errorMessage} role="alert" data-testid={`endpoint-${which}-error`}>
            ⚠ {error}
          </p>
        )}

        <div className={styles.buttonRow}>
          <button
            type="submit"
            className={`${styles.actionBtn} ${styles.primaryAction}`}
            data-testid={`endpoint-${which}-apply`}
          >
            Apply {which === 'start' ? 'Start' : 'Destination'}
          </button>

          {endpoint && !cellDetails?.isAligned && (
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.secondaryAction}`}
              onClick={handleSnapToCenter}
              data-testid={`endpoint-${which}-snap`}
              title="Snap coordinates to containing cell center"
            >
              Snap to Cell Center
            </button>
          )}

          {endpoint && (
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.clearAction}`}
              onClick={onClear}
              data-testid={`endpoint-${which}-clear`}
              aria-label={`Clear ${which} endpoint`}
            >
              Clear
            </button>
          )}
        </div>
      </form>

      {/* Cell-Resolution & Snapping Feedback */}
      {endpoint && cellDetails ? (
        <div className={styles.cellFeedback} data-testid={`endpoint-${which}-feedback`}>
          <div className={styles.feedbackHeader}>
            <span>Cell Resolution &amp; Center Snapping</span>
            <span>
              {grid.cellSizeEast_m}m × {grid.cellSizeNorth_m}m cell
            </span>
          </div>

          <div className={styles.feedbackRow}>
            <span>Requested Position:</span>
            <span className={styles.feedbackVal} data-testid={`endpoint-${which}-requested-pos`}>
              East {endpoint.point.east_m.toFixed(2)} m, North {endpoint.point.north_m.toFixed(2)} m
            </span>
          </div>

          <div className={styles.feedbackRow}>
            <span>Accepted Cell Center:</span>
            <span className={styles.feedbackVal} data-testid={`endpoint-${which}-cell-center`}>
              East {cellDetails.center.east_m.toFixed(2)} m, North {cellDetails.center.north_m.toFixed(2)} m
            </span>
          </div>

          <div className={styles.feedbackRow}>
            <span>Grid Cell Coordinates:</span>
            <span className={styles.feedbackVal} data-testid={`endpoint-${which}-cell-indices`}>
              Row {cellDetails.cell.row}, Col {cellDetails.cell.col} (Index {cellDetails.cell.index})
            </span>
          </div>

          <div className={styles.feedbackRow}>
            <span>Center Alignment:</span>
            <span className={styles.feedbackVal}>
              {cellDetails.isAligned
                ? 'Aligned with cell center (0.00 m offset)'
                : `${cellDetails.offsetDistance.toFixed(2)} m offset from center`}
            </span>
          </div>

          <p className={styles.feedbackNote}>
            The routing engine operates on discrete raster cell centers. Calculations will traverse from this cell
            center.
          </p>
        </div>
      ) : (
        <p className={styles.emptyState} data-testid={`endpoint-${which}-empty`}>
          Endpoint not set. Click on the 2D map or enter coordinates above to place {which}.
        </p>
      )}
    </div>
  );
};
