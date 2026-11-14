/**
 * PickModeToggle component. OWNER: Dhani (UI Role).
 * Controls whether clicking on the 2D map places the Start or Destination endpoint.
 */
import type { FC } from 'react';
import styles from './endpoints.module.css';

export interface PickModeToggleProps {
  pickMode: 'start' | 'destination';
  setPickMode: (mode: 'start' | 'destination') => void;
}

export const PickModeToggle: FC<PickModeToggleProps> = ({ pickMode, setPickMode }) => {
  return (
    <fieldset className={styles.pickFieldset} data-testid="pick-mode-toggle">
      <legend className={styles.pickLegend}>Map click sets</legend>
      <div className={styles.pickOptions} role="radiogroup" aria-label="Map click target endpoint">
        <label className={styles.pickOptionLabel}>
          <input
            type="radio"
            name="pick"
            value="start"
            checked={pickMode === 'start'}
            onChange={() => setPickMode('start')}
            aria-label="start endpoint"
          />
          <span className={`${styles.pickMarkerBadge} ${styles.badgeStart}`} aria-hidden="true">
            S
          </span>
          <span>Start</span>
        </label>

        <label className={styles.pickOptionLabel}>
          <input
            type="radio"
            name="pick"
            value="destination"
            checked={pickMode === 'destination'}
            onChange={() => setPickMode('destination')}
            aria-label="destination endpoint"
          />
          <span className={`${styles.pickMarkerBadge} ${styles.badgeDestination}`} aria-hidden="true">
            D
          </span>
          <span>Destination</span>
        </label>
      </div>
      <p className={styles.pickHint}>
        Clicking on the 2D canvas sets the <strong>{pickMode}</strong> endpoint.
      </p>
    </fieldset>
  );
};
