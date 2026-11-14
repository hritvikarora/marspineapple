/**
 * EndpointsFeature component. OWNER: Dhani (UI Role).
 * Implements TASK-004: Endpoint forms, map pick selection modes, cell-resolution feedback,
 * and extent validation.
 */
import type { FC } from 'react';
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
        <h2 className={styles.sectionTitle}>Endpoints &amp; Placement</h2>
      </div>

      {/* Map click target selection mode */}
      <PickModeToggle pickMode={pickMode} setPickMode={setPickMode} />

      {/* Quick swap action */}
      <div className={styles.swapContainer}>
        <button
          type="button"
          className={styles.swapBtn}
          onClick={handleSwap}
          disabled={!canSwap}
          data-testid="swap-endpoints"
          aria-label="Swap start and destination endpoints"
          title="Swap start and destination coordinates"
        >
          ⇄ Swap Start &amp; Destination
        </button>
      </div>

      {/* Start Endpoint Form */}
      <CoordinateForm
        which="start"
        endpoint={start}
        grid={grid}
        onSet={(p) => setEndpoint('start', p, null)}
        onClear={() => setEndpoint('start', null, null)}
        isActiveTarget={pickMode === 'start'}
        onSelectAsTarget={() => setPickMode('start')}
      />

      {/* Destination Endpoint Form */}
      <CoordinateForm
        which="destination"
        endpoint={destination}
        grid={grid}
        onSet={(p) => setEndpoint('destination', p, null)}
        onClear={() => setEndpoint('destination', null, null)}
        isActiveTarget={pickMode === 'destination'}
        onSelectAsTarget={() => setPickMode('destination')}
      />

      {/* Regional Grid Specification & Coordinate Frame Info */}
      <div className={styles.gridInfoCard} data-testid="grid-info-card">
        <h4 className={styles.gridInfoTitle}>Region Grid Frame &amp; Extent</h4>
        <div className={styles.gridInfoDetails}>
          <span>
            East: [{grid.extent.west_m} m, {grid.extent.east_m} m)
          </span>
          <span>
            North: ({grid.extent.south_m} m, {grid.extent.north_m} m]
          </span>
          <span>
            Grid: {grid.width} × {grid.height} cells
          </span>
          <span>
            Cell size: {grid.cellSizeEast_m} m × {grid.cellSizeNorth_m} m
          </span>
        </div>
        <p className={styles.feedbackNote}>
          Local planar meters (+east, +north). Outer eastern and southern boundary edges are outside valid extent.
          Solver operates on discrete cell centers.
        </p>
      </div>
    </section>
  );
};
