/**
 * PickModeToggle component. OWNER: Dhani (UI Role).
 * Controls whether clicking on the 2D map places the Start or Destination endpoint.
 */
import { useId, type FC } from 'react';
import styles from './endpoints.module.css';

export interface PickModeToggleProps {
  pickMode: 'start' | 'destination';
  setPickMode: (mode: 'start' | 'destination') => void;
}

const PICK_OPTIONS: ReadonlyArray<{ value: 'start' | 'destination'; label: string }> = [
  { value: 'start', label: 'Start' },
  { value: 'destination', label: 'Destination' },
];

export const PickModeToggle: FC<PickModeToggleProps> = ({ pickMode, setPickMode }) => {
  const idPrefix = useId();
  const groupName = `${idPrefix}-pick`;

  return (
    <fieldset className={styles.pickFieldset} data-testid="pick-mode-toggle">
      <legend className={styles.pickLegend}>Map click sets</legend>
      <div className={styles.pickPill} role="radiogroup" aria-label="Map click target endpoint">
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
              {isSelected && (
                <svg
                  className={styles.segmentCheckIcon}
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M3.5 8.5L6.5 11.5L12.5 4.5" />
                </svg>
              )}
              <span className={styles.pickSegmentLabel}>{option.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
};
