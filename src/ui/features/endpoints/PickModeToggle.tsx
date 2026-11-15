/**
 * PickModeToggle component. OWNER: Dhani (UI Role).
 * Thin Start / Destination / Inspect pill.
 * Start and Destination choose the map-click target. Inspect does not change
 * pick mode — the slot type is still 'start' | 'destination' — and moves focus
 * to the snapped cell centre when a point exists.
 */
import { useId, type FC } from 'react';
import styles from './endpoints.module.css';

export interface PickModeToggleProps {
  pickMode: 'start' | 'destination';
  setPickMode: (mode: 'start' | 'destination') => void;
  canInspect: boolean;
  onInspect: () => void;
}

const PICK_OPTIONS: ReadonlyArray<{ value: 'start' | 'destination'; label: string }> = [
  { value: 'start', label: 'Start' },
  { value: 'destination', label: 'Destination' },
];

export const PickModeToggle: FC<PickModeToggleProps> = ({
  pickMode,
  setPickMode,
  canInspect,
  onInspect,
}) => {
  const idPrefix = useId();
  const groupName = `${idPrefix}-pick`;

  return (
    <fieldset className={styles.pickFieldset} data-testid="pick-mode-toggle">
      <legend className={styles.pickLegend}>Map click sets</legend>
      <div className={styles.pickPill}>
        <div className={styles.pickModes} role="radiogroup" aria-label="Map click target endpoint">
          {PICK_OPTIONS.map((option) => {
            const inputId = `${idPrefix}-${option.value}`;
            const isSelected = pickMode === option.value;
            return (
              <label
                key={option.value}
                htmlFor={inputId}
                className={`${styles.pickSegment} ${
                  isSelected ? styles.pickSegmentSelected : styles.pickSegmentUnselected
                }`}
                data-selected={isSelected ? 'true' : 'false'}
              >
                <input
                  id={inputId}
                  type="radio"
                  name={groupName}
                  value={option.value}
                  checked={isSelected}
                  onChange={() => setPickMode(option.value)}
                  className={styles.visuallyHiddenRadio}
                />
                <span className={`${styles.pickSegmentLabel} ${isSelected ? styles.pickSegmentLabelSelected : ''}`}>
                  {option.label}
                </span>
              </label>
            );
          })}
        </div>
        <button
          type="button"
          className={`${styles.pickSegment} ${styles.pickSegmentUnselected} ${styles.pickSegmentInspect}`}
          onClick={onInspect}
          disabled={!canInspect}
        >
          Inspect
        </button>
      </div>
    </fieldset>
  );
};
