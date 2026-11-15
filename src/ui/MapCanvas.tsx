/**
 * 2D MAP CANVAS — OWNER: Dhani. Plain canvas, local-metre frame only.
 * Uses the shared adapter (cellCenter / pointToCell) so map, routing and 3D agree.
 * Supports independently registering canvas layers to replace corresponding baseline rendering,
 * while preserving full baseline rendering when custom layers are absent.
 *
 * Backing-store scale targets up to 2000×2000 for 1000×1000 HiRISE grids so orbital textures
 * and vector route/marker pins stay sharp without exceeding browser backing limits.
 * Raster pixels are cached above 4096 cells. Search-trace and route overlays repaint without
 * rebuilding that cache. Trace is a per-frame batch, drawn in the routes band, never in chrome.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  cellCenter,
  EXCLUSION,
  QUALITY,
  type GridBundle,
  type GridSpec,
  type LocalPoint,
  type RouteCandidate,
  type SearchTraceFrame,
} from '../contracts';
import type { DisplayState } from '../state/store';
import type { CanvasDrawHelpers, CustomCanvasLayer } from './shared/types';

export type { CanvasDrawHelpers, CustomCanvasLayer };

export interface RejectedPathOverlay {
  id: string;
  path: readonly { east_m: number; north_m: number }[];
  colorHex?: string;
}

export interface MapCanvasProps {
  bundle: GridBundle;
  candidates: RouteCandidate[];
  selectedCandidateId: string | null;
  start: LocalPoint | null;
  destination: LocalPoint | null;
  layers: DisplayState['layers'];
  stale: boolean;
  /** Shared hover sample (from the selection view-model). */
  hover: { pathIndex: number; point: LocalPoint } | null;
  onPick: (p: LocalPoint) => void;
  customLayers?: {
    rasters?: CustomCanvasLayer;
    routes?: CustomCanvasLayer;
    markers?: CustomCanvasLayer;
    chrome?: CustomCanvasLayer;
  };
  /** One sampled search batch. Cells listed here are not a cumulative explored mask. */
  traceFrame?: SearchTraceFrame | null;
  rejectedPaths?: readonly RejectedPathOverlay[];
  /** Animated route reveal fraction (0..1); defaults to 1 (complete path). */
  routeRevealFrac?: number;
}

const NO_REJECTED_PATHS: readonly RejectedPathOverlay[] = [];
const RASTER_LAYER_NAMES = ['elevation', 'slope', 'roughness', 'quality', 'exclusion'] as const;
const REJECTED_COLOR = '#7c3aed';
const REJECTED_DASH: readonly number[] = [8, 4];
/** Past this side length, browsers start returning a null 2D context. Shipped bundles stay under it. */
const MAX_CANVAS_SIDE = 4096;

interface RasterBitmapCache {
  key: string;
  bundle: GridBundle;
  elevation: Float32Array;
  slope: Float32Array;
  roughness: Float32Array;
  quality: Uint8Array;
  exclusion: Uint8Array;
  canvas: HTMLCanvasElement;
}

/** 20×12 stays at 28. 1000×1000 upgrades to 2 (2000×2000). Never lets the per-cell size fall below 1. */
function mapPxPerCell(width: number, height: number): number {
  return Math.max(
    1,
    Math.min(28, Math.floor(Math.min(2000 / Math.max(1, width), 2000 / Math.max(1, height)))),
  );
}

function hasPhotoTextureAsset(bundle: GridBundle): boolean {
  if (bundle.manifest.synthetic) return false;
  return (bundle.manifest.displayAssets ?? []).some((a) => a.kind === 'texture' && !a.file.endsWith('.svg'));
}

function resolveOrthoTextureUrl(bundle: GridBundle): string | null {
  if (bundle.manifest.synthetic || !bundle.manifestUrl) return null;
  const asset = (bundle.manifest.displayAssets ?? []).find((a) => a.kind === 'texture' && !a.file.endsWith('.svg'));
  if (!asset) return null;
  try {
    const base = typeof window !== 'undefined' ? new URL(bundle.manifestUrl, window.location.href) : new URL(bundle.manifestUrl);
    const resolved = new URL(asset.file, base).toString();
    return /^https?:|^data:|^blob:|^\//i.test(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

function finiteCellSize(size: number): number {
  return Number.isFinite(size) && size > 0 ? size : 1;
}

function canvasGeometry(grid: GridSpec): { pxPerCell: number; scaleX: number; scaleY: number; width: number; height: number } {
  const preferred = mapPxPerCell(grid.width, grid.height);
  const cols = grid.width;
  const rows = grid.height;
  let pxPerCell = preferred;
  let width = cols * preferred;
  let height = rows * preferred;
  // 20×12 and 1000×1000 never enter this branch. Larger grids must not ask for a side above 4096.
  if (cols > 0 && rows > 0 && (width > MAX_CANVAS_SIDE || height > MAX_CANVAS_SIDE)) {
    pxPerCell = Math.min(preferred, MAX_CANVAS_SIDE / cols, MAX_CANVAS_SIDE / rows);
    width = Math.min(MAX_CANVAS_SIDE, Math.max(1, Math.ceil(cols * pxPerCell - 1e-6)));
    height = Math.min(MAX_CANVAS_SIDE, Math.max(1, Math.ceil(rows * pxPerCell - 1e-6)));
  }
  return {
    pxPerCell,
    scaleX: pxPerCell / finiteCellSize(grid.cellSizeEast_m),
    scaleY: pxPerCell / finiteCellSize(grid.cellSizeNorth_m),
    width,
    height,
  };
}

/** Every byte. A sampled stamp leaves an unsampled in-place edit on the cached bitmap. */
function bufferStamp(data: ArrayBufferView): string {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  } catch {
    return `detached:${data.byteLength}`;
  }
  let high = 2166136261;
  let low = 2166136261 ^ bytes.length;
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i] ?? 0;
    high = Math.imul(high ^ byte, 16777619);
    low = Math.imul(low ^ byte, 2246822519);
  }
  return `${(high >>> 0).toString(16)}:${(low >>> 0).toString(16)}:${bytes.length}`;
}

function toPixel(grid: GridSpec, scaleX: number, scaleY: number, point: LocalPoint): [number, number] {
  return [(point.east_m - grid.extent.west_m) * scaleX, (grid.extent.north_m - point.north_m) * scaleY];
}

function fromPixel(grid: GridSpec, scaleX: number, scaleY: number, px: number, py: number): LocalPoint {
  return {
    east_m: grid.extent.west_m + px / scaleX,
    north_m: grid.extent.north_m - py / scaleY,
  };
}

function rasterCacheKey(
  bundle: GridBundle,
  pxPerCell: number,
  layers: DisplayState['layers'],
  bitmapW: number,
  bitmapH: number,
): string {
  const grid = bundle.manifest.grid;
  const layerKey = RASTER_LAYER_NAMES.map((name) => {
    const layer = layers[name];
    return `${name}:${layer.visible ? 1 : 0}:${layer.opacity}`;
  }).join('|');
  return [
    bundle.bundleVersion,
    bundle.manifest.bundleId ?? '',
    `${grid.width}x${grid.height}`,
    `px${pxPerCell}`,
    `bmp${bitmapW}x${bitmapH}`,
    layerKey,
    bufferStamp(bundle.elevation),
    bufferStamp(bundle.slope),
    bufferStamp(bundle.roughness),
    bufferStamp(bundle.quality),
    bufferStamp(bundle.exclusion),
  ].join('~');
}

function cacheIsCurrent(cache: RasterBitmapCache | null, bundle: GridBundle, key: string): cache is RasterBitmapCache {
  return (
    cache !== null &&
    cache.key === key &&
    cache.bundle === bundle &&
    cache.elevation === bundle.elevation &&
    cache.slope === bundle.slope &&
    cache.roughness === bundle.roughness &&
    cache.quality === bundle.quality &&
    cache.exclusion === bundle.exclusion
  );
}

function paintOffscreen(
  width: number,
  height: number,
  paint: (target: CanvasRenderingContext2D) => void,
): HTMLCanvasElement | null {
  if (!(width > 0) || !(height > 0) || width > MAX_CANVAS_SIDE || height > MAX_CANVAS_SIDE) return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const offscreen = canvas.getContext('2d');
    if (!offscreen || typeof offscreen.fillRect !== 'function') return null;
    paint(offscreen);
    return canvas;
  } catch {
    return null;
  }
}

/** Returns false when the blit throws so the caller can paint with fillRect instead. */
function blitBitmap(ctx: CanvasRenderingContext2D, bitmap: HTMLCanvasElement, width: number, height: number): boolean {
  const canSave = typeof ctx.save === 'function' && typeof ctx.restore === 'function';
  let previousSmoothing: boolean | undefined;
  try {
    if (canSave) ctx.save();
    previousSmoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bitmap, 0, 0, width, height);
    return true;
  } catch {
    return false;
  } finally {
    if (typeof previousSmoothing === 'boolean') ctx.imageSmoothingEnabled = previousSmoothing;
    if (canSave) {
      try {
        ctx.restore();
      } catch {
        // The blit already failed; keep the fillRect fallback reachable.
      }
    }
  }
}

/**
 * Small grids (the synthetic fixture and the unit-test grids) fill the destination directly.
 * Larger grids paint once into an offscreen bitmap and blit it. The destination context must
 * actually implement drawImage — the jsdom test double does not, and must keep fillRect.
 */
function paintCachedRaster(
  ctx: CanvasRenderingContext2D,
  cacheRef: { current: RasterBitmapCache | null },
  bundle: GridBundle,
  layers: DisplayState['layers'],
  pxPerCell: number,
  bitmapW: number,
  bitmapH: number,
  paint: (target: CanvasRenderingContext2D) => void,
) {
  const cellCount = bundle.manifest.grid.width * bundle.manifest.grid.height;
  if (cellCount <= 4096 || typeof ctx.drawImage !== 'function') {
    paint(ctx);
    return;
  }
  const key = rasterCacheKey(bundle, pxPerCell, layers, bitmapW, bitmapH);
  if (!cacheIsCurrent(cacheRef.current, bundle, key)) {
    const painted = paintOffscreen(bitmapW, bitmapH, paint);
    if (!painted) {
      paint(ctx);
      return;
    }
    cacheRef.current = {
      key,
      bundle,
      elevation: bundle.elevation,
      slope: bundle.slope,
      roughness: bundle.roughness,
      quality: bundle.quality,
      exclusion: bundle.exclusion,
      canvas: painted,
    };
  }
  const bitmap = cacheRef.current?.canvas;
  if (!bitmap || !blitBitmap(ctx, bitmap, bitmapW, bitmapH)) {
    cacheRef.current = null;
    paint(ctx);
  }
}

function paintBaselineCells(
  ctx: CanvasRenderingContext2D,
  bundle: GridBundle,
  layers: DisplayState['layers'],
  pxPerCell: number,
) {
  const { grid } = bundle.manifest;
  let lo = Infinity;
  let hi = -Infinity;
  for (const z of bundle.elevation) {
    if (Number.isFinite(z)) {
      lo = Math.min(lo, z);
      hi = Math.max(hi, z);
    }
  }

  const photoUnderlay = hasPhotoTextureAsset(bundle);
  for (let r = 0; r < grid.height; r++) {
    for (let c = 0; c < grid.width; c++) {
      const i = r * grid.width + c;
      const x = c * pxPerCell;
      const y = r * pxPerCell;
      const z = bundle.elevation[i]!;

      if (layers.elevation.visible) {
        if (Number.isFinite(z)) {
          const t = hi > lo ? (z - lo) / (hi - lo) : 0.5;
          const v = Math.round(60 + 170 * t);
          if (photoUnderlay) {
            ctx.fillStyle = `rgba(${v},${Math.round(v * 0.72)},${Math.round(v * 0.56)},${(layers.elevation.opacity * 0.24).toFixed(3)})`;
          } else {
            ctx.fillStyle = `rgb(${v},${Math.round(v * 0.75)},${Math.round(v * 0.6)})`;
          }
        } else {
          ctx.fillStyle = '#000';
        }
        ctx.fillRect(x, y, pxPerCell, pxPerCell);
      }

      if (layers.quality.visible) {
        const q = bundle.quality[i];
        const col =
          q === QUALITY.UNKNOWN
            ? '140,80,220'
            : q === QUALITY.LOW
              ? '255,170,0'
              : q === QUALITY.NO_ELEVATION
                ? '0,0,0'
                : null;
        if (col) {
          ctx.fillStyle = `rgba(${col},${layers.quality.opacity})`;
          ctx.fillRect(x, y, pxPerCell, pxPerCell);
        }
      }

      if (layers.exclusion.visible && bundle.exclusion[i] !== EXCLUSION.NONE) {
        ctx.fillStyle = `rgba(220,30,30,${layers.exclusion.opacity})`;
        // The historical 3px inset is a negative width at 1px/cell and Canvas flips it into neighbors.
        if (pxPerCell >= 7) {
          ctx.fillRect(x + 3, y + 3, pxPerCell - 6, pxPerCell - 6);
        } else {
          ctx.fillRect(x, y, pxPerCell, pxPerCell);
        }
      }

      if (layers.slope.visible && bundle.slope[i]! > 25) {
        ctx.strokeStyle = `rgba(255,255,255,${layers.slope.opacity})`;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + pxPerCell, y + pxPerCell);
        ctx.stroke();
      }
    }
  }
}

function cellCenterForIndex(grid: GridSpec, index: number): LocalPoint | null {
  if (!Number.isInteger(index) || index < 0 || grid.width <= 0 || grid.height <= 0) return null;
  if (index >= grid.width * grid.height) return null;
  const row = Math.floor(index / grid.width);
  const col = index - row * grid.width;
  return cellCenter(grid, row, col);
}

function clearDash(ctx: CanvasRenderingContext2D) {
  if (typeof ctx.setLineDash === 'function') ctx.setLineDash([]);
}

/** Square outline + tick, ring, and a dotted centerline. Shape carries the meaning, not hue alone. */
function drawTraceFrame(
  ctx: CanvasRenderingContext2D,
  grid: GridSpec,
  frame: SearchTraceFrame,
  scaleX: number,
  scaleY: number,
  pxPerCell: number,
) {
  const canSave = typeof ctx.save === 'function' && typeof ctx.restore === 'function';
  if (canSave) ctx.save();
  clearDash(ctx);
  try {
    const macro = grid.width >= 100;
    const cellDrawSize = macro ? Math.max(pxPerCell * 2.5, (grid.width * pxPerCell) / 260) : pxPerCell;
    const uiScale = macro ? Math.max(1, (grid.width * pxPerCell) / 700) : 1;

    ctx.lineWidth = Math.max(1, uiScale * 0.85);
    ctx.strokeStyle = macro ? 'rgba(51, 230, 255, 0.55)' : 'rgba(34, 211, 238, 0.95)';
    ctx.fillStyle = macro ? 'rgba(51, 230, 255, 0.14)' : 'rgba(34, 211, 238, 0.18)';
    for (const index of frame.closedCells) {
      const center = cellCenterForIndex(grid, index);
      if (!center) continue;
      const [px, py] = toPixel(grid, scaleX, scaleY, center);
      const inset = cellDrawSize >= 3 ? 1 : 0;
      const size = Math.max(1, cellDrawSize - inset * 2);
      const originX = px - cellDrawSize / 2;
      const originY = py - cellDrawSize / 2;
      if (macro) ctx.fillRect(originX + inset, originY + inset, size, size);
      ctx.strokeRect(originX + inset, originY + inset, size, size);
      const reach = Math.max(0.5, size * 0.22);
      ctx.beginPath();
      ctx.moveTo(px - reach, py);
      ctx.lineTo(px + reach, py);
      ctx.stroke();
    }

    ctx.strokeStyle = macro ? '#ffb37a' : '#f472b6';
    ctx.lineWidth = Math.max(1, uiScale * 1.1);
    const radius = macro
      ? Math.max(cellDrawSize * 0.55, uiScale * 2.2)
      : Math.min(Math.max(pxPerCell * 0.32, 0.5), pxPerCell * 0.5);
    for (const index of frame.frontierCells) {
      const center = cellCenterForIndex(grid, index);
      if (!center) continue;
      const [px, py] = toPixel(grid, scaleX, scaleY, center);
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.strokeStyle = '#e9d5ff';
    ctx.lineWidth = macro ? Math.max(2, uiScale * 1.5) : Math.max(1, Math.min(3, pxPerCell * 0.15));
    ctx.beginPath();
    let moved = false;
    const centers: [number, number][] = [];
    for (const index of frame.currentBestCells) {
      const center = cellCenterForIndex(grid, index);
      if (!center) continue;
      const pixel = toPixel(grid, scaleX, scaleY, center);
      centers.push(pixel);
      if (!moved) {
        ctx.moveTo(pixel[0], pixel[1]);
        moved = true;
      } else {
        ctx.lineTo(pixel[0], pixel[1]);
      }
    }
    if (moved) {
      if (typeof ctx.setLineDash === 'function') {
        ctx.setLineDash(macro ? [Math.round(4 * uiScale), Math.round(3 * uiScale)] : [2, 2]);
      }
      ctx.stroke();
      clearDash(ctx);
      const mark = macro ? Math.max(3, uiScale * 2) : Math.max(1, Math.min(4, pxPerCell * 0.2));
      for (const [px, py] of centers) {
        ctx.strokeRect(px - mark / 2, py - mark / 2, mark, mark);
      }
    }
  } finally {
    clearDash(ctx);
    if (canSave) ctx.restore();
  }
}

function drawRejectedPaths(
  ctx: CanvasRenderingContext2D,
  grid: GridSpec,
  paths: readonly RejectedPathOverlay[],
  scaleX: number,
  scaleY: number,
  pxPerCell: number,
) {
  if (paths.length === 0) return;
  const canSave = typeof ctx.save === 'function' && typeof ctx.restore === 'function';
  if (canSave) ctx.save();
  try {
    const uiScale = grid.width >= 100 ? Math.max(1, (grid.width * pxPerCell) / 700) : 1;
    ctx.lineWidth = Math.max(2, 2 * uiScale);
    const dash = REJECTED_DASH.map((n) => Math.round(n * uiScale));
    for (const path of paths) {
      if (path.path.length < 2) continue;
      ctx.beginPath();
      path.path.forEach((point, index) => {
        const [px, py] = toPixel(grid, scaleX, scaleY, point);
        if (index === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.strokeStyle = path.colorHex && path.colorHex.length > 0 ? path.colorHex : REJECTED_COLOR;
      if (typeof ctx.setLineDash === 'function') ctx.setLineDash(dash);
      ctx.stroke();
    }
  } finally {
    clearDash(ctx);
    if (canSave) ctx.restore();
  }
}

export function MapCanvas({
  bundle,
  candidates,
  selectedCandidateId,
  start,
  destination,
  layers,
  stale,
  hover,
  onPick,
  customLayers,
  traceFrame = null,
  rejectedPaths = NO_REJECTED_PATHS,
  routeRevealFrac = 1,
}: MapCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const rasterCacheRef = useRef<RasterBitmapCache | null>(null);
  const { grid } = bundle.manifest;
  const geometry = canvasGeometry(grid);
  const { pxPerCell, scaleX: sx, scaleY: sy, width: W, height: H } = geometry;
  const orthoUrl = useMemo(() => resolveOrthoTextureUrl(bundle), [bundle]);
  const [loadedOrtho, setLoadedOrtho] = useState<{ url: string; img: HTMLImageElement } | null>(null);
  const orthoImg = loadedOrtho && orthoUrl && loadedOrtho.url === orthoUrl ? loadedOrtho.img : null;

  useEffect(() => {
    if (!orthoUrl || typeof Image === 'undefined') return;
    let cancelled = false;
    const img = new Image();
    const commit = () => {
      if (!cancelled) setLoadedOrtho({ url: orthoUrl, img });
    };
    img.onload = () => {
      if (typeof img.decode === 'function') {
        img.decode().then(commit, commit);
      } else {
        commit();
      }
    };
    img.onerror = () => {
      if (!cancelled) setLoadedOrtho(null);
    };
    img.src = orthoUrl;
    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [orthoUrl]);

  useEffect(() => {
    return () => {
      rasterCacheRef.current = null;
    };
  }, []);

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    if (rasterCacheRef.current && rasterCacheRef.current.bundle !== bundle) {
      rasterCacheRef.current = null;
    }
    ctx.clearRect(0, 0, W, H);
    if (orthoImg && typeof ctx.drawImage === 'function') {
      const prevSmooth = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(orthoImg, 0, 0, W, H);
      if (typeof prevSmooth === 'boolean') ctx.imageSmoothingEnabled = prevSmooth;
    }

    const helpers: CanvasDrawHelpers = {
      ctx,
      width: W,
      height: H,
      pxPerCell,
      scaleX: sx,
      scaleY: sy,
      toPx: (point) => toPixel(grid, sx, sy, point),
      fromPx: (px, py) => fromPixel(grid, sx, sy, px, py),
    };

    if (customLayers?.rasters) {
      customLayers.rasters(helpers);
    } else {
      paintCachedRaster(ctx, rasterCacheRef, bundle, layers, pxPerCell, W, H, (target) => {
        paintBaselineCells(target, bundle, layers, pxPerCell);
      });
    }

    const revealFrac = Math.max(0, Math.min(1, routeRevealFrac));
    const selectedCandidate = candidates.find((c) => c.candidateId === selectedCandidateId) ?? null;

    if (layers.route.visible && traceFrame) {
      drawTraceFrame(ctx, grid, traceFrame, sx, sy, pxPerCell);
    }
    if (layers.route.visible && rejectedPaths.length > 0) {
      drawRejectedPaths(ctx, grid, rejectedPaths, sx, sy, pxPerCell);
    }

    if (customLayers?.routes) {
      customLayers.routes(helpers);
    } else if (layers.route.visible) {
      const ordered = [...candidates].sort(
        (a, b) => Number(a.candidateId === selectedCandidateId) - Number(b.candidateId === selectedCandidateId),
      );
      for (const candidate of ordered) {
        const sel = candidate.candidateId === selectedCandidateId;
        const pts = sel && revealFrac < 1
          ? candidate.outbound.path.slice(0, Math.max(2, Math.round(candidate.outbound.path.length * revealFrac)))
          : candidate.outbound.path;
        ctx.strokeStyle = sel ? (stale ? '#9ab' : '#33e6ff') : 'rgba(246,241,234,0.65)';
        ctx.lineWidth = sel ? (W >= 800 ? 6 : 4) : (W >= 800 ? 3 : 2);
        if (typeof ctx.setLineDash === 'function') ctx.setLineDash(stale ? [6, 4] : []);
        ctx.beginPath();
        pts.forEach((point, index) => {
          const [px, py] = toPixel(grid, sx, sy, point);
          if (index) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        });
        ctx.stroke();
      }
      clearDash(ctx);
    }

    if (layers.route.visible && selectedCandidate && revealFrac > 0 && revealFrac < 1 && selectedCandidate.outbound.path.length >= 2) {
      const path = selectedCandidate.outbound.path;
      const tipIdx = Math.min(path.length - 1, Math.max(0, Math.round((path.length - 1) * revealFrac)));
      const tipPt = path[tipIdx];
      if (tipPt) {
        const [tx, ty] = toPixel(grid, sx, sy, tipPt);
        const uiScale = W >= 800 ? W / 650 : 1;
        const pulseRadius = (15 + 6 * Math.sin(revealFrac * Math.PI * 12)) * uiScale;
        ctx.save?.();
        ctx.fillStyle = 'rgba(51, 230, 255, 0.20)';
        ctx.beginPath();
        ctx.arc(tx, ty, pulseRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(51, 230, 255, 0.72)';
        ctx.lineWidth = 1.6 * uiScale;
        ctx.beginPath();
        ctx.arc(tx, ty, pulseRadius * 0.72, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#33e6ff';
        ctx.beginPath();
        ctx.arc(tx, ty, 4.5 * uiScale, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore?.();
      }
    }

    if (customLayers?.markers) {
      customLayers.markers(helpers);
    } else {
      const marker = (point: LocalPoint | null, color: string, label: string) => {
        if (!point) return;
        const [px, py] = toPixel(grid, sx, sy, point);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(px, py, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(label, px + 9, py - 6);
      };

      if (layers.poi.visible) {
        for (const poi of bundle.manifest.pointsOfInterest) {
          const [px, py] = toPixel(grid, sx, sy, poi.position);
          ctx.strokeStyle = '#ffd400';
          ctx.lineWidth = 2;
          ctx.strokeRect(px - 5, py - 5, 10, 10);
        }
      }

      if (hover) {
        const [hx, hy] = toPixel(grid, sx, sy, hover.point);
        ctx.strokeStyle = '#ffd400';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(hx, hy, 9, 0, Math.PI * 2);
        ctx.stroke();
      }

      marker(start, '#2ecc71', 'S');
      marker(destination, '#e74c3c', 'D');
    }

    clearDash(ctx);
    if (customLayers?.chrome) {
      customLayers.chrome(helpers);
    } else {
      ctx.fillStyle = '#fff';
      ctx.font = '12px sans-serif';
      ctx.fillText('N ↑', W - 34, 16);
      const bar = 50 * sx;
      ctx.fillRect(10, H - 14, bar, 4);
      ctx.fillText('50 m', 14 + bar, H - 8);
    }
  }, [
    bundle,
    candidates,
    selectedCandidateId,
    start,
    destination,
    layers,
    stale,
    hover,
    customLayers,
    traceFrame,
    rejectedPaths,
    routeRevealFrac,
    orthoImg,
    grid,
    pxPerCell,
    sx,
    sy,
    W,
    H,
  ]);

  const smoothScale = grid.width >= 100 || !bundle.manifest.synthetic;

  return (
    <canvas
      ref={ref}
      width={W}
      height={H}
      data-testid="map-canvas"
      data-selected-candidate={selectedCandidateId ?? ''}
      data-hover-index={hover?.pathIndex ?? ''}
      aria-label="Map: click to place the selected endpoint"
      style={{
        cursor: 'crosshair',
        maxWidth: '100%',
        imageRendering: smoothScale ? 'auto' : 'pixelated',
      }}
      onClick={(event) => {
        const canvasEl = event.currentTarget;
        const rect = canvasEl.getBoundingClientRect();
        const scaleX = rect.width > 0 ? W / rect.width : canvasEl.width > 0 ? W / canvasEl.width : 1;
        const scaleY = rect.height > 0 ? H / rect.height : canvasEl.height > 0 ? H / canvasEl.height : 1;
        const px = (event.clientX - rect.left) * scaleX;
        const py = (event.clientY - rect.top) * scaleY;
        onPick(fromPixel(grid, sx, sy, px, py));
      }}
    />
  );
}
