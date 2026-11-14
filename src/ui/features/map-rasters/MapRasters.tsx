/**
 * Map Rasters Component. OWNER: Dhani (TASK-008).
 * Renders multi-layer terrain rasters (elevation, slope, roughness, quality, exclusion)
 * onto the 2D Canvas in accordance with physical data units and frozen quality/exclusion codes.
 */
import { type FC, useEffect, useMemo } from 'react';
import type { CanvasDrawHelpers, MapRastersSlotProps } from '../../shared/types';
import { getElevationColor, getExclusionColor, getQualityColor, getSlopeColor } from './colorScale';
import './map-rasters.css';

export const MapRasters: FC<MapRastersSlotProps> = ({ bundle, layers, registerLayer }) => {
  const { grid } = bundle.manifest;

  // Precalculate elevation bounds
  const { minZ, maxZ } = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < bundle.elevation.length; i++) {
      const z = bundle.elevation[i]!;
      if (Number.isFinite(z)) {
        if (z < min) min = z;
        if (z > max) max = z;
      }
    }
    return {
      minZ: Number.isFinite(min) ? min : 0,
      maxZ: Number.isFinite(max) ? max : 100,
    };
  }, [bundle.elevation]);

  useEffect(() => {
    const drawRasters = (helpers: CanvasDrawHelpers) => {
      const { ctx, pxPerCell } = helpers;
      const { width: cols, height: rows } = grid;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          const x = c * pxPerCell;
          const y = r * pxPerCell;

          // 1. Base Elevation Shading
          if (layers.elevation.visible) {
            const z = bundle.elevation[i]!;
            ctx.fillStyle = getElevationColor(z, minZ, maxZ, layers.elevation.opacity);
            ctx.fillRect(x, y, pxPerCell, pxPerCell);
          }

          // 2. Slope Gradient Overlay
          if (layers.slope.visible) {
            const slopeDeg = bundle.slope[i]!;
            const sCol = getSlopeColor(slopeDeg, layers.slope.opacity);
            if (sCol) {
              ctx.fillStyle = sCol;
              ctx.fillRect(x, y, pxPerCell, pxPerCell);
            }
          }

          // 3. Roughness Overlay
          if (layers.roughness.visible) {
            const roughness = bundle.roughness[i]!;
            if (roughness > 0.05) {
              const alpha = Math.min(1, roughness) * layers.roughness.opacity;
              ctx.fillStyle = `rgba(255,255,255,${alpha * 0.35})`;
              ctx.fillRect(x, y, pxPerCell, pxPerCell);
            }
          }

          // 4. Data Quality Overlay (Codes 0..3)
          if (layers.quality.visible) {
            const q = bundle.quality[i]!;
            const qCol = getQualityColor(q, layers.quality.opacity);
            if (qCol) {
              ctx.fillStyle = qCol;
              ctx.fillRect(x, y, pxPerCell, pxPerCell);
            }
          }

          // 5. Exclusion Barriers (Codes 1..4)
          if (layers.exclusion.visible) {
            const ex = bundle.exclusion[i]!;
            const exCol = getExclusionColor(ex, layers.exclusion.opacity);
            if (exCol) {
              ctx.fillStyle = exCol;
              // Distinct centered hatch/tile to contrast against underlying terrain
              const pad = Math.max(1, Math.floor(pxPerCell * 0.15));
              ctx.fillRect(x + pad, y + pad, pxPerCell - pad * 2, pxPerCell - pad * 2);
            }
          }
        }
      }
    };

    return registerLayer(drawRasters);
  }, [bundle, grid, layers, minZ, maxZ, registerLayer]);

  // Compute active layer summary
  const activeLayers = useMemo(() => {
    const active: string[] = [];
    if (layers.elevation.visible) active.push(`Elevation (${minZ.toFixed(0)}m to ${maxZ.toFixed(0)}m)`);
    if (layers.slope.visible) active.push('Slope');
    if (layers.roughness.visible) active.push('Roughness');
    if (layers.quality.visible) active.push('Quality');
    if (layers.exclusion.visible) active.push('Exclusion');
    return active;
  }, [layers, minZ, maxZ]);

  return (
    <div className="map-rasters-status" data-testid="map-rasters-info">
      <span className="map-rasters-label">Rendered Rasters:</span>
      <span className="map-rasters-list">
        {activeLayers.length > 0 ? activeLayers.join(', ') : 'None (all hidden)'}
      </span>
    </div>
  );
};
