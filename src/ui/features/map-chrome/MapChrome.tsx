/**
 * Map Chrome Component. OWNER: Dhani (TASK-007).
 * Renders spatial boundary, North arrow orientation, and dynamic meter scale bar onto the canvas,
 * and provides accessible coordinate reference system metadata.
 */
import { type FC, useEffect } from 'react';
import type { CanvasDrawHelpers, MapChromeSlotProps } from '../../shared/types';
import { calculateScaleBar } from './scale';
import './map-chrome.css';

export const MapChrome: FC<MapChromeSlotProps> = ({ grid, crs, registerLayer }) => {
  useEffect(() => {
    const drawChrome = (helpers: CanvasDrawHelpers) => {
      const { ctx, width: W, height: H, scaleX: sx } = helpers;

      // 1. Grid boundary outline (perimeter box)
      ctx.save();
      ctx.strokeStyle = 'rgba(115, 208, 193, 0.4)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, W - 1, H - 1);

      // Corner accent brackets
      const bracketLen = Math.min(12, W * 0.05);
      ctx.strokeStyle = '#73d0c1';
      ctx.lineWidth = 2;
      ctx.beginPath();
      // Top-left
      ctx.moveTo(0, bracketLen);
      ctx.lineTo(0, 0);
      ctx.lineTo(bracketLen, 0);
      // Top-right
      ctx.moveTo(W - bracketLen, 0);
      ctx.lineTo(W, 0);
      ctx.lineTo(W, bracketLen);
      // Bottom-left
      ctx.moveTo(0, H - bracketLen);
      ctx.lineTo(0, H);
      ctx.lineTo(bracketLen, H);
      // Bottom-right
      ctx.moveTo(W - bracketLen, H);
      ctx.lineTo(W, H);
      ctx.lineTo(W, H - bracketLen);
      ctx.stroke();

      // 2. North Arrow (Top-Right)
      const arrowX = W - 32;
      const arrowY = 32;
      ctx.fillStyle = 'rgba(9, 13, 22, 0.7)';
      ctx.beginPath();
      ctx.arc(arrowX, arrowY, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Draw arrow needle pointing straight up (+North, row 0)
      ctx.beginPath();
      ctx.moveTo(arrowX, arrowY - 14); // North tip
      ctx.lineTo(arrowX - 5, arrowY + 6);
      ctx.lineTo(arrowX, arrowY + 2);
      ctx.closePath();
      ctx.fillStyle = '#ef4444'; // Red north needle
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(arrowX, arrowY - 14);
      ctx.lineTo(arrowX + 5, arrowY + 6);
      ctx.lineTo(arrowX, arrowY + 2);
      ctx.closePath();
      ctx.fillStyle = '#ffffff'; // White needle side
      ctx.fill();

      // North text label
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('N', arrowX, arrowY - 16);

      // 3. Dynamic Meter Scale Bar (Bottom-Left)
      const { widthPx, label } = calculateScaleBar(sx, 70);
      const barX = 14;
      const barY = H - 18;
      const barH = 5;

      // Dark background badge for high contrast over any terrain
      ctx.fillStyle = 'rgba(9, 13, 22, 0.75)';
      ctx.fillRect(barX - 4, barY - 16, widthPx + 40, 24);

      // Alternating black and white scale segments
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(barX, barY, widthPx, barH);
      ctx.fillStyle = '#090d16';
      ctx.fillRect(barX, barY, widthPx / 2, barH);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.strokeRect(barX, barY, widthPx, barH);

      // Scale text label
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, barX + widthPx + 6, barY + barH / 2);

      ctx.restore();
    };

    return registerLayer(drawChrome);
  }, [grid, crs, registerLayer]);

  return (
    <div className="map-chrome-metadata" data-testid="map-chrome-info">
      <div className="map-chrome-details">
        <span className="map-chrome-item" title="Coordinate reference system">
          <strong>CRS:</strong> {crs.description}
        </span>
        <span className="map-chrome-item" title="Planar grid extent in meters">
          <strong>Extent:</strong> [{grid.extent.west_m}m W to {grid.extent.east_m}m E, {grid.extent.south_m}m S to {grid.extent.north_m}m N]
        </span>
        <span className="map-chrome-item" title="Grid resolution per raster cell">
          <strong>Resolution:</strong> {grid.cellSizeEast_m}m × {grid.cellSizeNorth_m}m/cell ({grid.width}×{grid.height} cells)
        </span>
      </div>
    </div>
  );
};
