/**
 * EndpointsFeature component. OWNER: Dhani (UI Role).
 * Implements TASK-004 / UI-012: Endpoint forms, map pick selection modes, cell-resolution feedback,
 * and extent validation.
 */
import type { FC } from 'react';
import { Button } from '../../shared';
import type { EndpointsSlotProps } from '../../shared/types';
import { CoordinateForm } from './CoordinateForm';
import { PickModeToggle } from './PickModeToggle';
import styles from './endpoints.module.css';

export const EndpointsFeature: FC<EndpointsSlotProps> = ({
  pickMode,
  setPickMode,
  start,
  destination,
  grid,
  setEndpoint,
}) => {
  const handleSwap = () => {
    const prevStart = start;
    const prevDest = destination;
    setEndpoint('start', prevDest ? prevDest.point : null, prevDest ? prevDest.poiId : null);
    setEndpoint('destination', prevStart ? prevStart.point : null, prevStart ? prevStart.poiId : null);
  };

  const canSwap = Boolean(start || destination);

  return (
    <section className={styles.container} aria-label="Mission endpoints">
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Endpoints</h2>
        <Button
          variant="secondary"
          size="sm"
          className={styles.swapBtn}
          onClick={handleSwap}
          disabled={!canSwap}
          data-testid="swap-endpoints"
          title="Swap start and destination"
        >
          <svg
            className={styles.swapIcon}
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
            <path d="M3 5.5h10M10.5 3l2.5 2.5-2.5 2.5" />
            <path d="M13 10.5H3M5.5 8L3 10.5 5.5 13" />
          </svg>
          <span>Swap</span>
        </Button>
      </div>

      <PickModeToggle pickMode={pickMode} setPickMode={setPickMode} />

      <CoordinateForm
        which="start"
        endpoint={start}
        grid={grid}
        onSet={(p) => setEndpoint('start', p, null)}
        onClear={() => setEndpoint('start', null, null)}
        isActiveTarget={pickMode === 'start'}
        onSelectAsTarget={() => setPickMode('start')}
      />

      <CoordinateForm
        which="destination"
        endpoint={destination}
        grid={grid}
        onSet={(p) => setEndpoint('destination', p, null)}
        onClear={() => setEndpoint('destination', null, null)}
        isActiveTarget={pickMode === 'destination'}
        onSelectAsTarget={() => setPickMode('destination')}
      />

      <div className={`measurement ${styles.gridInfoCard}`} data-testid="grid-info-card">
        <span>
          {grid.width} × {grid.height} cells
        </span>
        <span className={styles.gridInfoSep} aria-hidden="true">
          ·
        </span>
        <span>
          {grid.cellSizeEast_m} m × {grid.cellSizeNorth_m} m
        </span>
        <span className={styles.gridInfoSep} aria-hidden="true">
          ·
        </span>
        <span>
          East: [{grid.extent.west_m} m, {grid.extent.east_m} m)
        </span>
        <span className={styles.gridInfoSep} aria-hidden="true">
          ·
        </span>
        <span>
          North: ({grid.extent.south_m} m, {grid.extent.north_m} m]
        </span>
      </div>
    </section>
  );
};
