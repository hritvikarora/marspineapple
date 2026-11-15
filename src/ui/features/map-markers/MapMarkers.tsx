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

const COSMIC_OBSIDIAN = 'rgba(9, 7, 17, 0.90)';
const COSMIC_IVORY = '#F6F1EA';
const COSMIC_VOID = '#040208';
const COSMIC_CYAN = '#33E6FF';
const COSMIC_AMBER = '#FFB37A';
const COSMIC_START = '#5BE08A';
const COSMIC_DEST = '#FF6B5B';

function scaledFont(family: 'sans-bold' | 'sans' | 'mono-bold', scale: number): string {
  if (scale <= 1.01) {
    if (family === 'sans-bold') return FONT_SANS_BOLD;
    if (family === 'mono-bold') return FONT_MONO_BOLD;
    return FONT_SANS;
  }
  if (family === 'mono-bold') {
    return `bold ${Math.round(11 * scale)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
  }
  const px = Math.round(9.5 * scale);
  return `${family === 'sans-bold' ? 'bold ' : ''}${px}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
}

function drawPoiLabel(
  ctx: CanvasRenderingContext2D,
  name: string,
  px: number,
  py: number,
  canvasWidth: number,
  bold: boolean,
  pillBackground: string,
  cosmic: boolean,
  uiScale: number,
) {
  if (!name) return;

  ctx.font = scaledFont(bold ? 'sans-bold' : 'sans', uiScale);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  const textWidth = ctx.measureText(name).width;
  const padX = Math.round(8 * uiScale);
  const pillW = textWidth + padX;
  const pillH = Math.round((bold ? 14 : 13) * uiScale);
  const offset = Math.round(11 * uiScale);
  let pillX = px + offset;
  if (canvasWidth > 0 && pillX + pillW > canvasWidth && px - offset - pillW >= 0) {
    pillX = px - offset - pillW;
  }
  const pillY = py - pillH / 2;
  const border = Math.max(1, Math.round(uiScale));

  ctx.fillStyle = cosmic ? (bold ? COSMIC_CYAN : COSMIC_AMBER) : INK_SECONDARY;
  ctx.fillRect(pillX - border, pillY - border, pillW + border * 2, pillH + border * 2);
  ctx.fillStyle = cosmic ? COSMIC_OBSIDIAN : pillBackground;
  ctx.fillRect(pillX, pillY, pillW, pillH);

  ctx.fillStyle = cosmic ? COSMIC_IVORY : INK;
  ctx.fillText(name, pillX + Math.round(4 * uiScale), py);
}

function traceSquare(ctx: CanvasRenderingContext2D, px: number, py: number, half: number) {
  ctx.beginPath();
  ctx.moveTo(px - half, py - half);
  ctx.lineTo(px + half, py - half);
  ctx.lineTo(px + half, py + half);
  ctx.lineTo(px - half, py + half);
  ctx.closePath();
}

function drawEndpointPin(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  letter: 'S' | 'D',
  cosmic: boolean,
  uiScale: number,
) {
  const isDestination = letter === 'D';

  if (cosmic) {
    const accent = isDestination ? COSMIC_DEST : COSMIC_START;
    const halo = isDestination ? 'rgba(255, 107, 91, 0.28)' : 'rgba(91, 224, 138, 0.26)';
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(px, py, 16 * uiScale, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = COSMIC_VOID;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.4 * uiScale;
    ctx.lineJoin = 'round';
    if (isDestination) {
      traceSquare(ctx, px, py, 9 * uiScale);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(px, py, 9.5 * uiScale, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = isDestination ? COSMIC_IVORY : COSMIC_START;
    ctx.font = scaledFont('mono-bold', uiScale);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, px, py);
    return;
  }

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
      const cosmic = width >= 500;
      const uiScale = width >= 800 ? width / 650 : 1;

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
              const r = OUTPOST_RADIUS * uiScale;
              ctx.fillStyle = cosmic ? COSMIC_CYAN : INK;
              ctx.strokeStyle = cosmic ? COSMIC_VOID : PAPER;
              ctx.lineWidth = POI_STROKE_WIDTH * uiScale;
              ctx.beginPath();
              ctx.moveTo(px, py - r);
              ctx.lineTo(px + r, py);
              ctx.lineTo(px, py + r);
              ctx.lineTo(px - r, py);
              ctx.closePath();
              ctx.fill();
              ctx.stroke();

              drawPoiLabel(ctx, poi.name, px, py, width, true, PAPER, cosmic, uiScale);
            } else if (poi.kind === 'science-stop') {
              ctx.fillStyle = cosmic ? 'rgba(9, 7, 17, 0.8)' : PAPER;
              ctx.beginPath();
              ctx.arc(px, py, SCIENCE_HALO_RADIUS * uiScale, 0, Math.PI * 2);
              ctx.fill();

              ctx.fillStyle = cosmic ? COSMIC_VOID : PAPER;
              ctx.strokeStyle = cosmic ? COSMIC_AMBER : INK;
              ctx.lineWidth = POI_STROKE_WIDTH * uiScale;
              ctx.beginPath();
              ctx.arc(px, py, SCIENCE_RING_RADIUS * uiScale, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();

              ctx.fillStyle = cosmic ? COSMIC_AMBER : INK;
              ctx.beginPath();
              ctx.arc(px, py, SCIENCE_PIP_RADIUS * uiScale, 0, Math.PI * 2);
              ctx.fill();

              drawPoiLabel(ctx, poi.name, px, py, width, false, PAPER_SUBTLE, cosmic, uiScale);
            } else {
              ctx.fillStyle = cosmic ? 'rgba(246, 241, 234, 0.72)' : INK_SECONDARY;
              ctx.strokeStyle = cosmic ? COSMIC_VOID : PAPER;
              ctx.lineWidth = POI_STROKE_WIDTH * uiScale;
              ctx.beginPath();
              ctx.arc(px, py, CONTEXT_DOT_RADIUS * uiScale, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
            }
          }
        }

        // 2. Start: marker at cell centre from toPx, no pixel nudge.
        if (start) {
          const [sx, sy] = toPx(start);
          if (Number.isFinite(sx) && Number.isFinite(sy)) {
            drawEndpointPin(ctx, sx, sy, 'S', cosmic, uiScale);
          }
        }

        // 3. Destination: square mark at cell centre.
        if (destination) {
          const [dx, dy] = toPx(destination);
          if (Number.isFinite(dx) && Number.isFinite(dy)) {
            drawEndpointPin(ctx, dx, dy, 'D', cosmic, uiScale);
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
