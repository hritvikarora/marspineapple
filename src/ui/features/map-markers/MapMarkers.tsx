/**
 * Map Markers Component. OWNER: Dhani (UI-017).
 * Start is an ink ring around a paper centre and the letter S.
 * Destination is an ink plate, a paper square, and the letter D.
 * Shape and letter carry the role. Ink and paper keep both readable on pale and dark terrain.
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
/** Square frame sits inside the ink plate. Corners stay within the plate radius. */
const DEST_FRAME_OUTER = 7;
const DEST_FRAME_INNER = 5.5;

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

function traceSquare(ctx: CanvasRenderingContext2D, px: number, py: number, half: number) {
  ctx.beginPath();
  ctx.moveTo(px - half, py - half);
  ctx.lineTo(px + half, py - half);
  ctx.lineTo(px + half, py + half);
  ctx.lineTo(px - half, py + half);
  ctx.closePath();
}

function drawEndpointPin(ctx: CanvasRenderingContext2D, px: number, py: number, letter: 'S' | 'D') {
  const isDestination = letter === 'D';

  // Shared ink plate. On pale ground it is the dark badge. On dark ground the
  // paper centre (start) or paper square (destination) is what remains.
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(px, py, ENDPOINT_HALO_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineWidth = ENDPOINT_STROKE_WIDTH;
  ctx.lineJoin = 'round';

  if (isDestination) {
    // Keep the shared body radius so this arc stays with the endpoint marks.
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(px, py, ENDPOINT_PIN_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = PAPER;
    traceSquare(ctx, px, py, DEST_FRAME_OUTER);
    ctx.fill();

    ctx.fillStyle = INK;
    traceSquare(ctx, px, py, DEST_FRAME_INNER);
    ctx.fill();

    // Paper square outline around the ink centre.
    ctx.fillStyle = INK;
    ctx.strokeStyle = PAPER;
    traceSquare(ctx, px, py, DEST_FRAME_OUTER);
    ctx.stroke();
  } else {
    // Paper centre and ink ring. The letter S is ink, so a pale map cannot hide the mark.
    ctx.fillStyle = PAPER;
    ctx.strokeStyle = INK;
    ctx.beginPath();
    ctx.arc(px, py, ENDPOINT_PIN_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.fillStyle = isDestination ? PAPER : INK;
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
        if (typeof ctx.setLineDash === 'function') ctx.setLineDash([]);
        ctx.globalAlpha = 1;

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

        // 2. Start: paper centre, ink ring, letter S. Cell centre from toPx, no pixel nudge.
        if (start) {
          const [sx, sy] = toPx(start);
          if (Number.isFinite(sx) && Number.isFinite(sy)) {
            drawEndpointPin(ctx, sx, sy, 'S');
          }
        }

        // 3. Destination: ink plate, paper square, letter D.
        if (destination) {
          const [dx, dy] = toPx(destination);
          if (Number.isFinite(dx) && Number.isFinite(dy)) {
            drawEndpointPin(ctx, dx, dy, 'D');
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
