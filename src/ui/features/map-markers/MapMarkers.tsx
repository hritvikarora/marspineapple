/**
 * Map Markers Component. OWNER: Dhani (UI-017).
 * Renders high-contrast paper-and-ink spatial markers for start ('S'), destination ('D'),
 * fictional outposts, science stops, and context points onto the 2D Canvas.
 */
import { type FC, useEffect } from 'react';
import type { CanvasDrawHelpers, MapMarkersSlotProps } from '../../shared/types';
import './map-markers.css';

const PAPER = '#FFFFFF';
const PAPER_SUBTLE = '#FAFAFA';
const INK = '#000000';
const INK_SECONDARY = '#686666';

const FONT_SANS_BOLD =
  'bold 10px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const FONT_SANS =
  '10px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const FONT_MONO_BOLD =
  'bold 11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

const ENDPOINT_HALO_RADIUS = 11;
const ENDPOINT_PIN_RADIUS = 8.5;
const ENDPOINT_STROKE_WIDTH = 2;

const OUTPOST_RADIUS = 6;
const SCIENCE_HALO_RADIUS = 6.5;
const SCIENCE_RING_RADIUS = 4.5;
const SCIENCE_PIP_RADIUS = 1.8;
const CONTEXT_DOT_RADIUS = 2.5;
const POI_STROKE_WIDTH = 1.5;

function drawPoiLabel(
  ctx: CanvasRenderingContext2D,
  name: string,
  px: number,
  py: number,
  canvasWidth: number,
  bold: boolean,
  pillBackground: string,
) {
  if (!name) return;

  ctx.font = bold ? FONT_SANS_BOLD : FONT_SANS;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  const textWidth = ctx.measureText(name).width;
  const pillW = textWidth + 8;
  const pillH = bold ? 14 : 13;
  const offset = 11;
  let pillX = px + offset;
  if (canvasWidth > 0 && pillX + pillW > canvasWidth && px - offset - pillW >= 0) {
    pillX = px - offset - pillW;
  }
  const pillY = py - pillH / 2;

  // Paper pill with secondary-ink frame reads on both pale and dark terrain without strokeRect.
  ctx.fillStyle = INK_SECONDARY;
  ctx.fillRect(pillX - 1, pillY - 1, pillW + 2, pillH + 2);
  ctx.fillStyle = pillBackground;
  ctx.fillRect(pillX, pillY, pillW, pillH);

  ctx.fillStyle = INK;
  ctx.fillText(name, pillX + 4, py);
}

function drawEndpointPin(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  letter: 'S' | 'D',
  inverse: boolean,
) {
  const fill = inverse ? INK : PAPER;
  const stroke = inverse ? PAPER : INK;
  const outerHalo = inverse ? INK : PAPER;

  // Outer contrast halo ensures boundary contrast even when terrain matches the stroke color.
  ctx.fillStyle = outerHalo;
  ctx.beginPath();
  ctx.arc(px, py, ENDPOINT_HALO_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = ENDPOINT_STROKE_WIDTH;
  ctx.beginPath();
  ctx.arc(px, py, ENDPOINT_PIN_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = stroke;
  ctx.font = FONT_MONO_BOLD;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, px, py);
}

export const MapMarkers: FC<MapMarkersSlotProps> = ({
  pois,
  start,
  destination,
  poiLayerVisible,
  registerLayer,
}) => {
  useEffect(() => {
    const drawMarkers = (helpers: CanvasDrawHelpers) => {
      const { ctx, toPx, width } = helpers;

      ctx.save();
      try {
        // 1. Render smaller POI marks when the POI layer is visible
        if (poiLayerVisible) {
          for (const poi of pois) {
            const [px, py] = toPx(poi.position);
            if (!Number.isFinite(px) || !Number.isFinite(py)) continue;

            if (poi.kind === 'outpost') {
              ctx.fillStyle = INK;
              ctx.strokeStyle = PAPER;
              ctx.lineWidth = POI_STROKE_WIDTH;
              ctx.beginPath();
              ctx.moveTo(px, py - OUTPOST_RADIUS);
              ctx.lineTo(px + OUTPOST_RADIUS, py);
              ctx.lineTo(px, py + OUTPOST_RADIUS);
              ctx.lineTo(px - OUTPOST_RADIUS, py);
              ctx.closePath();
              ctx.fill();
              ctx.stroke();

              drawPoiLabel(ctx, poi.name, px, py, width, true, PAPER);
            } else if (poi.kind === 'science-stop') {
              ctx.fillStyle = PAPER;
              ctx.beginPath();
              ctx.arc(px, py, SCIENCE_HALO_RADIUS, 0, Math.PI * 2);
              ctx.fill();

              ctx.fillStyle = PAPER;
              ctx.strokeStyle = INK;
              ctx.lineWidth = POI_STROKE_WIDTH;
              ctx.beginPath();
              ctx.arc(px, py, SCIENCE_RING_RADIUS, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();

              ctx.fillStyle = INK;
              ctx.beginPath();
              ctx.arc(px, py, SCIENCE_PIP_RADIUS, 0, Math.PI * 2);
              ctx.fill();

              drawPoiLabel(ctx, poi.name, px, py, width, false, PAPER_SUBTLE);
            } else {
              ctx.fillStyle = INK_SECONDARY;
              ctx.strokeStyle = PAPER;
              ctx.lineWidth = POI_STROKE_WIDTH;
              ctx.beginPath();
              ctx.arc(px, py, CONTEXT_DOT_RADIUS, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
            }
          }
        }

        // 2. Render Mission Start Marker (Paper fill, ink stroke, letter 'S')
        if (start) {
          const [sx, sy] = toPx(start);
          if (Number.isFinite(sx) && Number.isFinite(sy)) {
            drawEndpointPin(ctx, sx, sy, 'S', false);
          }
        }

        // 3. Render Mission Destination Marker (Ink fill, paper stroke, letter 'D')
        if (destination) {
          const [dx, dy] = toPx(destination);
          if (Number.isFinite(dx) && Number.isFinite(dy)) {
            drawEndpointPin(ctx, dx, dy, 'D', true);
          }
        }
      } finally {
        ctx.restore();
      }
    };

    return registerLayer(drawMarkers);
  }, [pois, start, destination, poiLayerVisible, registerLayer]);

  return (
    <div className="map-markers-status" data-testid="map-markers-info">
      <div className="map-markers-summary">
        <span className="map-markers-summary-item">
          <strong>Start:</strong>{' '}
          <span className="map-markers-value">
            {start ? `${start.east_m.toFixed(0)}m E, ${start.north_m.toFixed(0)}m N` : 'Unset'}
          </span>
        </span>
        <span className="map-markers-summary-item">
          <strong>Dest:</strong>{' '}
          <span className="map-markers-value">
            {destination ? `${destination.east_m.toFixed(0)}m E, ${destination.north_m.toFixed(0)}m N` : 'Unset'}
          </span>
        </span>
        <span className="map-markers-summary-item">
          <strong>Waypoints:</strong>{' '}
          <span className="map-markers-value">
            {poiLayerVisible ? `${pois.length} active` : 'Hidden'}
          </span>
        </span>
      </div>
    </div>
  );
};
