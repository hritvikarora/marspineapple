/**
 * Layer Controls & Legends Component. OWNER: Dhani (TASK-009).
 * Provides toggles and opacity controls for terrain rasters and mission overlays.
 * Updating display settings does not trigger recalculations or mark routes stale.
 */
import { type ChangeEvent, type FC } from 'react';
import type { LayerKey } from '../../../state/store';
import type { LayerControlsSlotProps } from '../../shared/types';
import { Panel } from '../../shared/primitives/Panel';
import './layer-controls.css';

interface LayerMeta {
  key: LayerKey;
  label: string;
  description: string;
  legend?: Array<{ color: string; label: string }>;
}

const LAYER_CONFIGS: LayerMeta[] = [
  {
    key: 'elevation',
    label: 'Elevation',
    description: 'Continuous digital elevation model in local planar meters.',
    legend: [
      { color: 'rgb(90, 50, 35)', label: 'Low Elevation' },
      { color: 'rgb(240, 144, 90)', label: 'High Elevation' },
    ],
  },
  {
    key: 'slope',
    label: 'Slope Gradient',
    description: 'Surface incline in degrees relative to local gravitational vector.',
    legend: [
      { color: 'rgb(245, 158, 11)', label: '15° – 25° (Moderate)' },
      { color: 'rgb(239, 68, 68)', label: '> 25° (Steep / Critical)' },
    ],
  },
  {
    key: 'roughness',
    label: 'Surface Roughness',
    description: 'Sub-pixel micro-relief obstacles and texture hazards.',
    legend: [{ color: 'rgba(255, 255, 255, 0.6)', label: 'High Roughness Obstacles' }],
  },
  {
    key: 'quality',
    label: 'Data Quality',
    description: 'Confidence classifications for elevation measurements (Quality 0..3).',
    legend: [
      { color: 'rgb(245, 158, 11)', label: 'Low Quality (2)' },
      { color: 'rgb(168, 85, 247)', label: 'Unknown Quality (3)' },
      { color: 'rgb(15, 23, 42)', label: 'No Elevation (0)' },
    ],
  },
  {
    key: 'exclusion',
    label: 'Exclusion Barriers',
    description: 'Hard constraints and impassable hazards (Exclusion 1..4).',
    legend: [
      { color: 'rgb(220, 38, 38)', label: 'Missing / Unsupported' },
      { color: 'rgb(236, 72, 153)', label: 'Manual Hazard' },
    ],
  },
  {
    key: 'route',
    label: 'Candidate Routes',
    description: 'Computed traversal polylines and waypoint indicators.',
    legend: [
      { color: '#2ecc71', label: 'Selected Outbound' },
      { color: '#60a5fa', label: 'Alternative Policy' },
    ],
  },
  {
    key: 'poi',
    label: 'Waypoints & Landmarks',
    description: 'Outposts and science destination targets.',
    legend: [
      { color: '#3b82f6', label: 'Outpost' },
      { color: '#10b981', label: 'Science Target' },
    ],
  },
];

export const LayerControls: FC<LayerControlsSlotProps> = ({ layers, dispatch }) => {
  const handleVisibilityChange = (layer: LayerKey, checked: boolean) => {
    dispatch({
      type: 'view/setLayer',
      layer,
      visible: checked,
    });
  };

  const handleOpacityChange = (layer: LayerKey, e: ChangeEvent<HTMLInputElement>) => {
    const opacity = parseFloat(e.target.value);
    dispatch({
      type: 'view/setLayer',
      layer,
      opacity,
    });
  };

  return (
    <Panel className="layer-controls-panel" title="Map Layers & Legends">
      <div className="layer-controls-container" data-testid="layer-controls-feature">
        <p className="layer-controls-hint">
          Toggle layer visibility and adjust opacity. Display adjustments do not invalidate route solutions.
        </p>

        <div className="layer-controls-list" role="group" aria-label="Map layer controls">
          {LAYER_CONFIGS.map(({ key, label, description, legend }) => {
            const currentSetting = layers[key];
            if (!currentSetting) return null;

            return (
              <div key={key} className="layer-control-card" data-testid={`layer-card-${key}`}>
                <div className="layer-control-main-row">
                  <label className="layer-control-toggle">
                    <input
                      type="checkbox"
                      className="layer-control-checkbox"
                      data-testid={`layer-toggle-${key}`}
                      aria-label={key}
                      checked={currentSetting.visible}
                      onChange={(e) => handleVisibilityChange(key, e.target.checked)}
                    />
                    <span className="layer-control-label-text">{label}</span>
                  </label>

                  {currentSetting.visible && (
                    <div className="layer-opacity-group">
                      <label htmlFor={`opacity-${key}`} className="layer-opacity-label">
                        {Math.round(currentSetting.opacity * 100)}%
                      </label>
                      <input
                        id={`opacity-${key}`}
                        type="range"
                        className="layer-opacity-slider"
                        data-testid={`layer-opacity-${key}`}
                        min="0.1"
                        max="1.0"
                        step="0.05"
                        value={currentSetting.opacity}
                        aria-label={`${label} opacity`}
                        onChange={(e) => handleOpacityChange(key, e)}
                      />
                    </div>
                  )}
                </div>

                <p className="layer-control-desc">{description}</p>

                {currentSetting.visible && legend && legend.length > 0 && (
                  <div className="layer-legend-items" aria-label={`${label} legend items`}>
                    {legend.map((item) => (
                      <div key={item.label} className="layer-legend-item">
                        <span className="layer-legend-swatch" style={{ backgroundColor: item.color }} />
                        <span className="layer-legend-text">{item.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
};
