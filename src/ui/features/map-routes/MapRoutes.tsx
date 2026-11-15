/**
 * Map Routes Component. OWNER: Dhani (TASK-011). UI-019 stroke pass.
 * Selected route: solid ink. The same polyline is dashed while stale.
 * Equivalent policies that share a path are one line on the sampled coordinates.
 * Return legs differ by dash pattern. Rejected paths stay dashed and lighter.
 * Search-trace batches are drawn here when this layer is active, not in chrome.
 */
import { type FC, useEffect, useLayoutEffect, useRef } from 'react';
import type { SearchTraceFrame } from '../../../contracts';
import type { CanvasDrawHelpers, MapRoutesSlotProps, RouteCandidate } from '../../shared/types';
import './map-routes.css';

const NO_REJECTED_PATHS: readonly RejectedPathOverlay[] = [];
const REJECTED_COLOR = 'rgba(104, 102, 102, 0.6)';
const REJECTED_DASH: readonly number[] = [8, 4];

const PAPER_HALO_SELECTED = 'rgba(255, 255, 255, 0.92)';
const PAPER_HALO_STALE = 'rgba(255, 255, 255, 0.85)';
const PAPER_HALO_UNSELECTED = 'rgba(255, 255, 255, 0.55)';
const PAPER_HALO_UNSELECTED_STALE = 'rgba(255, 255, 255, 0.4)';

const INK_SOLID = '#000000';
const INK_STALE = 'rgba(0, 0, 0, 0.82)';
const INK_RETURN_STALE = 'rgba(0, 0, 0, 0.72)';
const INK_SECONDARY = '#686666';
const INK_SECONDARY_MUTED = 'rgba(104, 102, 102, 0.72)';
const INK_SECONDARY_STALE = 'rgba(104, 102, 102, 0.55)';

const DASH_SOLID: readonly number[] = [];
const DASH_SELECTED_STALE: readonly number[] = [8, 4];
/** Selected return leg. MapRoutes.test.tsx expects setLineDash([5, 5]). */
const DASH_RETURN_SELECTED: readonly number[] = [5, 5];
const DASH_RETURN_STALE: readonly number[] = [2, 4];
const DASH_UNSELECTED_OUTBOUND: readonly number[] = [4, 4];
const DASH_UNSELECTED_RETURN: readonly number[] = [2, 4];

const ROUTE_LINE_WIDTH = 2;
const ROUTE_HALO_WIDTH = 4;

interface StrokeStyleSpec {
  strokeStyle: string;
  lineWidth: number;
  dash: readonly number[];
  haloStyle: string;
  haloWidth: number;
}

interface RejectedPathOverlay {
  id: string;
  path: readonly { east_m: number; north_m: number }[];
  colorHex?: string;
}

type MapRoutesProps = MapRoutesSlotProps & {
  traceFrame?: SearchTraceFrame | null;
  rejectedPaths?: readonly RejectedPathOverlay[];
};

interface RouteDrawState {
  candidates: MapRoutesSlotProps['candidates'];
  selectedCandidateId: string | null;
  stale: boolean;
  hover: MapRoutesSlotProps['hover'];
  routeLayerVisible: boolean;
  traceFrame: SearchTraceFrame | null;
  rejectedPaths: readonly RejectedPathOverlay[];
}

function applyDash(ctx: CanvasRenderingContext2D, dash: readonly number[]) {
  if (typeof ctx.setLineDash !== 'function') return;
  ctx.setLineDash(dash.length === 0 ? [] : [...dash]);
}

function clearDash(ctx: CanvasRenderingContext2D) {
  applyDash(ctx, DASH_SOLID);
}

function traceCellPixel(index: number, cols: number, rows: number, pxPerCell: number): [number, number] | null {
  if (!Number.isInteger(index) || index < 0 || cols <= 0 || rows <= 0 || pxPerCell <= 0) return null;
  if (index >= cols * rows) return null;
  const row = Math.floor(index / cols);
  const col = index - row * cols;
  return [(col + 0.5) * pxPerCell, (row + 0.5) * pxPerCell];
}

/** This frame's batch only. Squares, rings, and a dotted centerline stay distinct without relying on hue. */
function drawTraceFrame(
  ctx: CanvasRenderingContext2D,
  frame: SearchTraceFrame,
  pxPerCell: number,
  width: number,
  height: number,
) {
  clearDash(ctx);
  const cols = pxPerCell > 0 ? Math.round(width / pxPerCell) : 0;
  const rows = pxPerCell > 0 ? Math.round(height / pxPerCell) : 0;
  ctx.lineWidth = 1;
  ctx.strokeStyle = INK_SOLID;
  for (const index of frame.closedCells) {
    const pixel = traceCellPixel(index, cols, rows, pxPerCell);
    if (!pixel) continue;
    const [px, py] = pixel;
    const originX = px - pxPerCell / 2;
    const originY = py - pxPerCell / 2;
    const inset = pxPerCell >= 3 ? 1 : 0;
    const size = Math.max(1, pxPerCell - inset * 2);
    ctx.strokeRect(originX + inset, originY + inset, size, size);
    const reach = Math.max(0.5, size * 0.22);
    ctx.beginPath();
    ctx.moveTo(px - reach, py);
    ctx.lineTo(px + reach, py);
    ctx.stroke();
  }

  ctx.strokeStyle = INK_SECONDARY;
  const radius = Math.min(Math.max(pxPerCell * 0.32, 0.5), pxPerCell * 0.5);
  for (const index of frame.frontierCells) {
    const pixel = traceCellPixel(index, cols, rows, pxPerCell);
    if (!pixel) continue;
    ctx.beginPath();
    ctx.arc(pixel[0], pixel[1], radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.strokeStyle = INK_STALE;
  ctx.lineWidth = Math.max(1, Math.min(3, pxPerCell * 0.15));
  ctx.beginPath();
  let moved = false;
  const centers: [number, number][] = [];
  for (const index of frame.currentBestCells) {
    const pixel = traceCellPixel(index, cols, rows, pxPerCell);
    if (!pixel) continue;
    centers.push(pixel);
    if (!moved) {
      ctx.moveTo(pixel[0], pixel[1]);
      moved = true;
    } else {
      ctx.lineTo(pixel[0], pixel[1]);
    }
  }
  if (!moved) return;
  applyDash(ctx, [2, 2]);
  ctx.stroke();
  clearDash(ctx);
  const mark = Math.max(1, Math.min(4, pxPerCell * 0.2));
  for (const [px, py] of centers) {
    ctx.strokeRect(px - mark / 2, py - mark / 2, mark, mark);
  }
}

function drawRejectedPaths(
  ctx: CanvasRenderingContext2D,
  paths: readonly RejectedPathOverlay[],
  toPx: CanvasDrawHelpers['toPx'],
) {
  ctx.lineWidth = 2;
  for (const path of paths) {
    if (path.path.length < 2) continue;
    ctx.beginPath();
    path.path.forEach((point, index) => {
      const [px, py] = toPx(point);
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.strokeStyle = path.colorHex && path.colorHex.length > 0 ? path.colorHex : REJECTED_COLOR;
    applyDash(ctx, REJECTED_DASH);
    ctx.stroke();
  }
}

type RouteInkRole = 'selected-outbound' | 'selected-return' | 'other-outbound' | 'other-return';

interface SharedPolyline {
  path: readonly { east_m: number; north_m: number }[];
  selected: boolean;
}

function geometryKey(path: readonly { east_m: number; north_m: number }[]): string {
  let key = '';
  for (const point of path) {
    key += point.east_m;
    key += ',';
    key += point.north_m;
    key += ';';
  }
  return key;
}

/** One stroke per distinct polyline. A shared path is not shifted into a second corridor. */
function uniquePolylines(
  candidates: readonly RouteCandidate[],
  selectedCandidateId: string | null,
  leg: 'outbound' | 'return',
): SharedPolyline[] {
  const grouped = new Map<string, SharedPolyline>();
  for (const candidate of candidates) {
    const path = leg === 'outbound' ? candidate.outbound.path : candidate.returnLeg?.path;
    if (path == null || path.length === 0) continue;
    const selected = candidate.candidateId === selectedCandidateId;
    const key = geometryKey(path);
    const previous = grouped.get(key);
    grouped.set(key, {
      path: previous?.path ?? path,
      selected: (previous?.selected ?? false) || selected,
    });
  }
  const background: SharedPolyline[] = [];
  const foreground: SharedPolyline[] = [];
  for (const polyline of grouped.values()) {
    if (polyline.selected) foreground.push(polyline);
    else background.push(polyline);
  }
  return background.concat(foreground);
}

function routeStroke(role: RouteInkRole, stale: boolean): StrokeStyleSpec {
  if (role === 'selected-outbound') {
    return {
      strokeStyle: stale ? INK_STALE : INK_SOLID,
      lineWidth: ROUTE_LINE_WIDTH,
      dash: stale ? DASH_SELECTED_STALE : DASH_SOLID,
      haloStyle: stale ? PAPER_HALO_STALE : PAPER_HALO_SELECTED,
      haloWidth: ROUTE_HALO_WIDTH,
    };
  }
  if (role === 'selected-return') {
    return {
      strokeStyle: stale ? INK_RETURN_STALE : INK_SOLID,
      lineWidth: ROUTE_LINE_WIDTH,
      dash: stale ? DASH_RETURN_STALE : DASH_RETURN_SELECTED,
      haloStyle: stale ? PAPER_HALO_STALE : PAPER_HALO_SELECTED,
      haloWidth: ROUTE_HALO_WIDTH,
    };
  }
  if (role === 'other-outbound') {
    return {
      strokeStyle: stale ? INK_SECONDARY_STALE : INK_SECONDARY,
      lineWidth: ROUTE_LINE_WIDTH,
      dash: DASH_UNSELECTED_OUTBOUND,
      haloStyle: stale ? PAPER_HALO_UNSELECTED_STALE : PAPER_HALO_UNSELECTED,
      haloWidth: ROUTE_HALO_WIDTH,
    };
  }
  return {
    strokeStyle: stale ? INK_SECONDARY_STALE : INK_SECONDARY_MUTED,
    lineWidth: ROUTE_LINE_WIDTH,
    dash: DASH_UNSELECTED_RETURN,
    haloStyle: stale ? PAPER_HALO_UNSELECTED_STALE : PAPER_HALO_UNSELECTED,
    haloWidth: ROUTE_HALO_WIDTH,
  };
}

function strokePolyline(
  ctx: CanvasRenderingContext2D,
  path: readonly { east_m: number; north_m: number }[],
  toPx: CanvasDrawHelpers['toPx'],
  spec: StrokeStyleSpec,
) {
  if (path.length === 0) return;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const paint = () => {
    ctx.beginPath();
    let started = false;
    for (const point of path) {
      const [px, py] = toPx(point);
      if (!started) {
        ctx.moveTo(px, py);
        started = true;
      } else {
        ctx.lineTo(px, py);
      }
    }
  };
  paint();
  ctx.strokeStyle = spec.haloStyle;
  ctx.lineWidth = spec.haloWidth;
  applyDash(ctx, spec.dash);
  ctx.stroke();
  paint();
  ctx.strokeStyle = spec.strokeStyle;
  ctx.lineWidth = spec.lineWidth;
  applyDash(ctx, spec.dash);
  ctx.stroke();
}

export const MapRoutes: FC<MapRoutesProps> = ({
  candidates,
  selectedCandidateId,
  stale,
  hover,
  routeLayerVisible,
  registerLayer,
  traceFrame = null,
  rejectedPaths = NO_REJECTED_PATHS,
}) => {
  const latestRef = useRef<RouteDrawState>({
    candidates,
    selectedCandidateId,
    stale,
    hover,
    routeLayerVisible,
    traceFrame,
    rejectedPaths,
  });

  // Runs after this commit and before MapCanvas's paint effect, so the canvas
  // reads this frame's routes instead of the previous commit.
  useLayoutEffect(() => {
    latestRef.current = {
      candidates,
      selectedCandidateId,
      stale,
      hover,
      routeLayerVisible,
      traceFrame,
      rejectedPaths,
    };
  }, [candidates, selectedCandidateId, stale, hover, routeLayerVisible, traceFrame, rejectedPaths]);

  useEffect(() => {
    const drawRoutes = (helpers: CanvasDrawHelpers) => {
      const {
        candidates: curCandidates,
        selectedCandidateId: curSelectedCandidateId,
        stale: curStale,
        hover: curHover,
        routeLayerVisible: curVisible,
        traceFrame: curTrace,
        rejectedPaths: curRejected,
      } = latestRef.current;

      if (!curVisible) return;
      if (curCandidates.length === 0 && curTrace == null && curRejected.length === 0) return;

      const { ctx, toPx, pxPerCell, width, height } = helpers;
      ctx.save();

      if (curCandidates.length > 0) {
        for (const polyline of uniquePolylines(curCandidates, curSelectedCandidateId, 'outbound')) {
          strokePolyline(
            ctx,
            polyline.path,
            toPx,
            routeStroke(polyline.selected ? 'selected-outbound' : 'other-outbound', curStale),
          );
        }
        for (const polyline of uniquePolylines(curCandidates, curSelectedCandidateId, 'return')) {
          strokePolyline(
            ctx,
            polyline.path,
            toPx,
            routeStroke(polyline.selected ? 'selected-return' : 'other-return', curStale),
          );
        }

        if (curHover) {
          const [hx, hy] = toPx(curHover.point);
          applyDash(ctx, DASH_SOLID);
          ctx.strokeStyle = INK_SOLID;
          ctx.lineWidth = ROUTE_LINE_WIDTH;
          ctx.beginPath();
          ctx.arc(hx, hy, 8, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(hx, hy, 3, 0, Math.PI * 2);
          ctx.fill();

          ctx.font = '10px monospace';
          const tagText = `${Math.round(curHover.distance_m)}m (${curHover.point.elevation_m.toFixed(1)}m)`;
          const tagW = ctx.measureText(tagText).width;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(hx + 11, hy - 9, tagW + 6, 15);
          ctx.fillStyle = INK_SOLID;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(tagText, hx + 14, hy - 1);
        }
      }

      if (curTrace) drawTraceFrame(ctx, curTrace, pxPerCell, width, height);
      if (curRejected.length > 0) drawRejectedPaths(ctx, curRejected, toPx);
      clearDash(ctx);
      ctx.restore();
    };

    return registerLayer(drawRoutes);
  }, [registerLayer]);

  return (
    <div className="map-routes-status" data-testid="map-routes-info">
      <div className="map-routes-summary">
        <span className="map-routes-item">
          <strong>Candidates:</strong> {candidates.length}
        </span>
        <span className="map-routes-item">
          <strong>Selected:</strong> {selectedCandidateId ?? 'None'}
        </span>
        {stale && (
          <span className="map-routes-stale-tag" data-testid="map-routes-stale-indicator">
            Stale
          </span>
        )}
      </div>
    </div>
  );
};
