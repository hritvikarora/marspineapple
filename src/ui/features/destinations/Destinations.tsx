/**
 * Science Destination Preset Selector Component. OWNER: Dhani (TASK-003).
 * Enables learners to choose curated scientific destinations without needing map precision.
 */
import { type ChangeEvent, type FC, useId, useMemo } from 'react';
import type { DestinationsSlotProps, PointOfInterest } from '../../shared/types';
import { Panel } from '../../shared/primitives/Panel';
import { Button } from '../../shared/primitives/Button';
import './destinations.css';

export const Destinations: FC<DestinationsSlotProps> = ({
  pois,
  mission,
  setEndpoint,
}) => {
  const startSelectId = useId();
  const destSelectId = useId();
  const destHintId = useId();

  // Filter POIs to destination stops (science stops and test targets), preserving all available goals
  const scienceStops = useMemo(
    () => pois.filter((poi) => poi.kind === 'science-stop' || poi.kind === 'test'),
    [pois],
  );

  // Determine currently selected POI based on destination.poiId or matching coordinates
  const selectedPoi = useMemo(() => {
    if (mission.destination?.poiId) {
      const match = scienceStops.find((p) => p.id === mission.destination?.poiId);
      if (match) return match;
    }
    if (mission.destination?.point) {
      return scienceStops.find(
        (p) =>
          p.position.east_m === mission.destination?.point.east_m &&
          p.position.north_m === mission.destination?.point.north_m,
      );
    }
    return undefined;
  }, [scienceStops, mission.destination]);

  const handleStartChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const startId = e.target.value;
    if (!startId) {
      setEndpoint('start', null, null);
      return;
    }
    const targetPoi = pois.find((p) => p.id === startId);
    if (targetPoi) {
      setEndpoint('start', targetPoi.position, targetPoi.id);
    }
  };

  const handleSelectChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    if (!selectedId) {
      // Clear preset selection without affecting start point
      setEndpoint('destination', null, null);
      return;
    }
    const targetPoi = scienceStops.find((p) => p.id === selectedId) || pois.find((p) => p.id === selectedId);
    if (targetPoi) {
      // Does not modify or clear start point
      setEndpoint('destination', targetPoi.position, targetPoi.id);
    }
  };

  const handlePresetClick = (poi: PointOfInterest) => {
    setEndpoint('destination', poi.position, poi.id);
  };

  return (
    <Panel className="destinations-panel" title="Science Destinations">
      <div className="destinations-container" data-testid="destinations-feature">
        <div className="destinations-selector-group">
          <label htmlFor={startSelectId} className="destinations-label">
            Start preset
          </label>
          <select
            id={startSelectId}
            className="destinations-select"
            data-testid="start-preset-dropdown"
            aria-label="start preset"
            value={mission.start?.poiId ?? ''}
            onChange={handleStartChange}
          >
            <option value="">{mission.start && !mission.start.poiId ? 'Custom point' : 'Choose start'}</option>
            {pois.map((poi) => (
              <option key={poi.id} value={poi.id}>
                {poi.name}
              </option>
            ))}
          </select>
        </div>

        {scienceStops.length === 0 ? (
          <p className="destinations-empty" data-testid="no-science-stops">
            No science stops are in this bundle.
          </p>
        ) : (
          <>
            <div className="destinations-selector-group">
              <label htmlFor={destSelectId} className="destinations-label">
                Destination preset
              </label>
              <p id={destHintId} className="destinations-hint">
                Science stop
              </p>
              <select
                id={destSelectId}
                className="destinations-select"
                data-testid="destinations-dropdown"
                value={selectedPoi?.id ?? ''}
                onChange={handleSelectChange}
                aria-label="destination preset"
                aria-describedby={destHintId}
              >
                <option value="">
                  {mission.destination && !selectedPoi ? 'Custom point' : 'Choose a science stop'}
                </option>
                {scienceStops.map((poi) => (
                  <option key={poi.id} value={poi.id}>
                    {poi.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="destinations-quick-picks" role="group" aria-label="Quick pick science destinations">
              <span className="destinations-quick-picks-heading">Quick select</span>
              <div className="destinations-chips">
                {scienceStops.map((poi) => {
                  const isSelected = selectedPoi?.id === poi.id;
                  return (
                    <Button
                      key={poi.id}
                      variant={isSelected ? 'primary' : 'secondary'}
                      size="sm"
                      className={`destinations-chip ${isSelected ? 'is-selected' : ''}`}
                      data-testid={`destination-chip-${poi.id}`}
                      aria-pressed={isSelected}
                      onClick={() => handlePresetClick(poi)}
                    >
                      {poi.name}
                    </Button>
                  );
                })}
              </div>
            </div>

            {selectedPoi && (
              <div className="destination-details" data-testid="selected-destination-details">
                <div className="destination-details-header">
                  <h4 className="destination-details-name">{selectedPoi.name}</h4>
                  <div className="destination-details-tags">
                    {selectedPoi.officialName ? (
                      <span className="destination-tag official" title="IAU/official planetary nomenclature">
                        Official Feature
                      </span>
                    ) : (
                      <span className="destination-tag informal" title="Informal mission science waypoint">
                        Mission Target
                      </span>
                    )}
                    {selectedPoi.synthetic && (
                      <span className="destination-tag synthetic" title="Simulated destination for educational exercise">
                        Synthetic Target
                      </span>
                    )}
                  </div>
                </div>

                <p className="destination-purpose">{selectedPoi.purpose}</p>

                <dl className="destination-coords-list">
                  <div className="destination-coord-item">
                    <dt>Easting</dt>
                    <dd className="destination-coord-value tabular-nums">
                      {selectedPoi.position.east_m.toLocaleString()} m
                    </dd>
                  </div>
                  <div className="destination-coord-item">
                    <dt>Northing</dt>
                    <dd className="destination-coord-value tabular-nums">
                      {selectedPoi.position.north_m.toLocaleString()} m
                    </dd>
                  </div>
                  {selectedPoi.positionalUncertainty_m !== null && selectedPoi.positionalUncertainty_m !== undefined && (
                    <div className="destination-coord-item">
                      <dt>Uncertainty</dt>
                      <dd className="destination-coord-value tabular-nums">
                        ±{selectedPoi.positionalUncertainty_m} m
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            )}
          </>
        )}
      </div>
    </Panel>
  );
};
