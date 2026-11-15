/**
 * Map chrome. OWNER: Dhani (UI-016).
 * North-up mark and a local-metre scale bar on the existing canvas layer,
 * plus the coordinate reference readout.
 */
import { type FC, useEffect } from 'react';
import type { CanvasDrawHelpers, MapChromeSlotProps } from '../../shared/types';
import { calculateScaleBar } from './scale';
import './map-chrome.css';

const INK = '#000000';
const PAPER = '#FFFFFF';
const PAPER_CHIP = 'rgba(255, 255, 255, 0.8)';
const HAIRLINE = '#E5E5E5';

const MONO_FONT =
  '12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

const EDGE_INSET = 12;
const NORTH_RADIUS = 16;
const SCALE_BAND_H = 22;
const BAR_H = 4;
const CHIP_MAX_W = 119;
const MONO_ADVANCE_PX = 7.2;

function paintInkLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
): void {
  ctx.font = MONO_FONT;
  ctx.lineWidth = 1;
  ctx.fillStyle = INK;
  ctx.fillText(text, x - 1, y);
  ctx.fillText(text, x + 1, y);
  ctx.fillText(text, x, y - 1);
  ctx.fillText(text, x, y + 1);
  ctx.fillText(text, x, y);
}

function labelChipWidth(label: string): number {
  const raw = Math.ceil(label.length * MONO_ADVANCE_PX + 16);
  if (raw < 36) return 36;
  if (raw > CHIP_MAX_W) return CHIP_MAX_W;
  return raw;
}

function drawBoundary(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.strokeStyle = HAIRLINE;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, Math.max(0, width - 1), Math.max(0, height - 1));
}

function drawNorth(ctx: CanvasRenderingContext2D): void {
  const cx = EDGE_INSET + NORTH_RADIUS;
  const cy = EDGE_INSET + NORTH_RADIUS;

  ctx.beginPath();
  ctx.arc(cx, cy, NORTH_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = PAPER_CHIP;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx, cy - 1);
  ctx.lineTo(cx - 4, cy + 6);
  ctx.lineTo(cx - 1.25, cy + 6);
  ctx.lineTo(cx - 1.25, cy + 11);
  ctx.lineTo(cx + 1.25, cy + 11);
  ctx.lineTo(cx + 1.25, cy + 6);
  ctx.lineTo(cx + 4, cy + 6);
  ctx.closePath();
  ctx.fillStyle = INK;
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  paintInkLabel(ctx, 'N', cx, cy - 8);
}

function drawScale(
  ctx: CanvasRenderingContext2D,
  height: number,
  scaleX: number,
): void {
  const { widthPx, label } = calculateScaleBar(scaleX, 80);
  const bandBottom = height - EDGE_INSET;
  const bandTop = bandBottom - SCALE_BAND_H;
  const barX = EDGE_INSET;
  const barY = bandTop + (SCALE_BAND_H - BAR_H) / 2;
  const tickTop = bandTop + 4;
  const tickBottom = bandBottom - 4;

  ctx.fillStyle = PAPER;
  ctx.fillRect(barX, barY, widthPx, BAR_H);
  ctx.fillStyle = INK;
  ctx.fillRect(barX, barY, widthPx / 2, BAR_H);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.strokeRect(barX, barY, widthPx, BAR_H);

  ctx.beginPath();
  ctx.moveTo(barX, tickTop);
  ctx.lineTo(barX, tickBottom);
  ctx.moveTo(barX + widthPx, tickTop);
  ctx.lineTo(barX + widthPx, tickBottom);
  ctx.stroke();

  const chipW = labelChipWidth(label);
  const chipX = barX + widthPx + 8;
  const chipY = bandTop;
  ctx.fillStyle = PAPER_CHIP;
  ctx.fillRect(chipX, chipY, chipW, SCALE_BAND_H);
  ctx.strokeStyle = HAIRLINE;
  ctx.lineWidth = 1;
  ctx.strokeRect(chipX + 0.5, chipY + 0.5, chipW - 1, SCALE_BAND_H - 1);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  paintInkLabel(ctx, label, chipX + 8, chipY + SCALE_BAND_H / 2);
}

export const MapChrome: FC<MapChromeSlotProps> = ({ grid, crs, registerLayer }) => {
  useEffect(() => {
    const drawChrome = (helpers: CanvasDrawHelpers) => {
      const { ctx, width, height, scaleX } = helpers;
      ctx.save();
      try {
        drawBoundary(ctx, width, height);
        drawNorth(ctx);
        drawScale(ctx, height, scaleX);
      } finally {
        ctx.restore();
      }
    };

    return registerLayer(drawChrome);
  }, [registerLayer]);

  return (
    <div className="map-chrome-metadata" data-testid="map-chrome-info">
      <p className="map-chrome-note">North is up. The scale bar is local metres.</p>
      <div className="map-chrome-details">
        <span className="map-chrome-item" title="Coordinate reference system">
          <strong>CRS:</strong> {crs.description}
        </span>
        <span className="map-chrome-item" title="Planar grid extent in local metres">
          <strong>Extent:</strong>{' '}
          <span className="map-chrome-m">
            [{grid.extent.west_m}m W to {grid.extent.east_m}m E, {grid.extent.south_m}m S to {grid.extent.north_m}m N]
          </span>
        </span>
        <span className="map-chrome-item" title="Grid resolution per raster cell">
          <strong>Resolution:</strong>{' '}
          <span className="map-chrome-m">
            {grid.cellSizeEast_m}m × {grid.cellSizeNorth_m}m/cell ({grid.width}×{grid.height} cells)
          </span>
        </span>
      </div>
    </div>
  );
};
