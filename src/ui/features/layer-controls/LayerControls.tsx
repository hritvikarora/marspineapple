/**
 * Layer visibility and opacity. Display changes dispatch view/setLayer only
 * and do not recalculate or delete a route.
 */
import { type ChangeEvent, type FC } from 'react';
import type { LayerKey } from '../../../state/store';
import type { LayerControlsSlotProps } from '../../shared/types';
import './layer-controls.css';

interface LayerMeta {
  key: LayerKey;
  label: string;
  title: string;
  legend: readonly string[];
}

const LAYER_CONFIGS: readonly LayerMeta[] = [
  {
    key: 'elevation',
    label: 'Elevation',
    title: 'Elevation in local metres.',
    legend: ['Low Elevation', 'High Elevation'],
  },
  {
    key: 'slope',
    label: 'Slope',
    title: 'Surface incline in degrees.',
    legend: ['15° – 25° (Moderate)', '> 25° (Steep / Critical)'],
  },
  {
    key: 'roughness',
    label: 'Roughness',
    title: 'Surface roughness.',
    legend: ['High Roughness Obstacles'],
  },
  {
    key: 'quality',
    label: 'Quality',
    title: 'Quality codes 0, 1, 2, and 3.',
    legend: ['Low Quality (2)', 'Unknown Quality (3)', 'No Elevation (0)'],
  },
  {
    key: 'exclusion',
    label: 'Exclusion',
    title: 'Excluded cells on the display overlay.',
    legend: ['Missing / Unsupported', 'Manual Hazard'],
  },
  {
    key: 'route',
    label: 'Route',
    title: 'Shows the route. Hiding it leaves the route in place.',
    legend: ['Selected Outbound', 'Alternative Policy'],
  },
  {
    key: 'poi',
    label: 'Places',
    title: 'Outpost and science stops.',
    legend: ['Outpost', 'Science Target'],
  },
];

export const LayerControls: FC<LayerControlsSlotProps> = ({ layers, dispatch }) => {
  const handleVisibilityChange = (layer: LayerKey, event: ChangeEvent<HTMLInputElement>) => {
    dispatch({
      type: 'view/setLayer',
      layer,
      visible: event.target.checked,
    });
  };

  const handleOpacityChange = (layer: LayerKey, event: ChangeEvent<HTMLInputElement>) => {
    const opacity = Number(event.target.value);
    if (!Number.isFinite(opacity)) return;
    dispatch({
      type: 'view/setLayer',
      layer,
      opacity,
    });
  };

  return (
    <fieldset className="layer-controls" data-testid="layer-controls-feature">
      <legend className="layer-controls-legend">Layers</legend>
      <div className="layer-controls-list">
        {LAYER_CONFIGS.map(({ key, label, title, legend }) => {
          const setting = layers[key];
          const opacityId = `layer-opacity-input-${key}`;
          const percent = Math.round(setting.opacity * 100);

          return (
            <div key={key} className="layer-row" data-testid={`layer-card-${key}`} title={title}>
              <label className="layer-toggle">
                <input
                  type="checkbox"
                  className="layer-checkbox"
                  data-testid={`layer-toggle-${key}`}
                  checked={setting.visible}
                  onChange={(event) => handleVisibilityChange(key, event)}
                />
                <span className="layer-name">{label.toLowerCase()}</span>
              </label>

              {setting.visible && legend.length > 0 ? (
                <span className="layer-legend-words">
                  {legend.map((phrase) => (
                    <span key={phrase} className="layer-legend-text">
                      {phrase}
                    </span>
                  ))}
                </span>
              ) : null}

              <label className="layer-opacity" htmlFor={opacityId}>
                <span className="layer-opacity-name">{label} opacity</span>
                <input
                  id={opacityId}
                  type="range"
                  className="layer-opacity-range"
                  data-testid={`layer-opacity-${key}`}
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={setting.opacity}
                  aria-label={`${label} opacity`}
                  onChange={(event) => handleOpacityChange(key, event)}
                />
                <span className="layer-opacity-value">{percent}%</span>
              </label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
};
