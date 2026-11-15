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

const COSMIC_BG = 'rgba(9, 7, 17, 0.88)';
const COSMIC_IVORY = '#F6F1EA';
const COSMIC_CYAN = '#33E6FF';
const COSMIC_HAIRLINE = 'rgba(246, 241, 234, 0.18)';

function monoFont(scale: number): string {
  return scale <= 1.01
    ? MONO_FONT
    : `${Math.round(12 * scale)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
}

function paintInkLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  cosmic: boolean,
  uiScale: number,
): void {
  ctx.font = monoFont(uiScale);
  ctx.lineWidth = Math.max(1, uiScale);
  ctx.fillStyle = cosmic ? COSMIC_IVORY : INK;
  if (!cosmic) {
    ctx.fillText(text, x - 1, y);
    ctx.fillText(text, x + 1, y);
    ctx.fillText(text, x, y - 1);
    ctx.fillText(text, x, y + 1);
  }
  ctx.fillText(text, x, y);
}

function labelChipWidth(label: string, scale: number): number {
  const raw = Math.ceil(label.length * MONO_ADVANCE_PX * scale + 16 * scale);
  const minW = Math.round(36 * scale);
  const maxW = Math.round(CHIP_MAX_W * scale);
  if (raw < minW) return minW;
  if (raw > maxW) return maxW;
  return raw;
}

function drawBoundary(ctx: CanvasRenderingContext2D, width: number, height: number, cosmic: boolean, uiScale: number): void {
  ctx.strokeStyle = cosmic ? COSMIC_HAIRLINE : HAIRLINE;
  ctx.lineWidth = Math.max(1, Math.round(uiScale));
  ctx.strokeRect(0.5, 0.5, Math.max(0, width - 1), Math.max(0, height - 1));
}

function drawNorth(ctx: CanvasRenderingContext2D, cosmic: boolean, uiScale: number): void {
  const inset = EDGE_INSET * uiScale;
  const radius = NORTH_RADIUS * uiScale;
  const cx = inset + radius;
  const cy = inset + radius;

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = cosmic ? COSMIC_BG : PAPER_CHIP;
  ctx.fill();
  ctx.strokeStyle = cosmic ? COSMIC_CYAN : INK;
  ctx.lineWidth = Math.max(1, uiScale);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx, cy - 1 * uiScale);
  ctx.lineTo(cx - 4 * uiScale, cy + 6 * uiScale);
  ctx.lineTo(cx - 1.25 * uiScale, cy + 6 * uiScale);
  ctx.lineTo(cx - 1.25 * uiScale, cy + 11 * uiScale);
  ctx.lineTo(cx + 1.25 * uiScale, cy + 11 * uiScale);
  ctx.lineTo(cx + 1.25 * uiScale, cy + 6 * uiScale);
  ctx.lineTo(cx + 4 * uiScale, cy + 6 * uiScale);
  ctx.closePath();
  ctx.fillStyle = cosmic ? COSMIC_CYAN : INK;
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  paintInkLabel(ctx, 'N', cx, cy - 8 * uiScale, cosmic, uiScale);
}

function drawScale(
  ctx: CanvasRenderingContext2D,
  height: number,
  scaleX: number,
  cosmic: boolean,
  uiScale: number,
): void {
  const { widthPx, label } = calculateScaleBar(scaleX, 80 * uiScale);
  const inset = EDGE_INSET * uiScale;
  const bandH = SCALE_BAND_H * uiScale;
  const barH = BAR_H * uiScale;
  const bandBottom = height - inset;
  const bandTop = bandBottom - bandH;
  const barX = inset;
  const barY = bandTop + (bandH - barH) / 2;
  const tickTop = bandTop + 4 * uiScale;
  const tickBottom = bandBottom - 4 * uiScale;

  ctx.fillStyle = cosmic ? COSMIC_BG : PAPER;
  ctx.fillRect(barX, barY, widthPx, barH);
  ctx.fillStyle = cosmic ? COSMIC_CYAN : INK;
  ctx.fillRect(barX, barY, widthPx / 2, barH);
  ctx.strokeStyle = cosmic ? COSMIC_IVORY : INK;
  ctx.lineWidth = Math.max(1, uiScale);
  ctx.strokeRect(barX, barY, widthPx, barH);

  ctx.beginPath();
  ctx.moveTo(barX, tickTop);
  ctx.lineTo(barX, tickBottom);
  ctx.moveTo(barX + widthPx, tickTop);
  ctx.lineTo(barX + widthPx, tickBottom);
  ctx.stroke();

  const chipW = labelChipWidth(label, uiScale);
  const chipX = barX + widthPx + 8 * uiScale;
  const chipY = bandTop;
  ctx.fillStyle = cosmic ? COSMIC_BG : PAPER_CHIP;
  ctx.fillRect(chipX, chipY, chipW, bandH);
  ctx.strokeStyle = cosmic ? COSMIC_HAIRLINE : HAIRLINE;
  ctx.lineWidth = Math.max(1, uiScale);
  ctx.strokeRect(chipX + 0.5, chipY + 0.5, chipW - 1, bandH - 1);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  paintInkLabel(ctx, label, chipX + 8 * uiScale, chipY + bandH / 2, cosmic, uiScale);
}

export const MapChrome: FC<MapChromeSlotProps> = ({ grid, crs, registerLayer }) => {
  useEffect(() => {
    const drawChrome = (helpers: CanvasDrawHelpers) => {
      const { ctx, width, height, scaleX } = helpers;
      const cosmic = width >= 500;
      const uiScale = width >= 800 ? width / 650 : 1;
      ctx.save();
      try {
        drawBoundary(ctx, width, height, cosmic, uiScale);
        drawNorth(ctx, cosmic, uiScale);
        drawScale(ctx, height, scaleX, cosmic, uiScale);
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
