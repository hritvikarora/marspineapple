/**
 * Map Rasters Component. OWNER: Dhani (TASK-008 / UI-018).
 * Renders multi-layer terrain rasters (elevation, slope, roughness, quality, exclusion)
 * onto the 2D Canvas in accordance with physical data units and frozen quality/exclusion codes.
 *
 * Grids of 4096 cells or fewer keep the fillRect loop on the destination context so the
 * small-grid tests observe those calls. Larger grids paint that same loop once into an
 * offscreen bitmap keyed by bundle identity, layer visibility, and layer opacity.
 *
 * Quality and exclusion words stay on the info line. This layer paints bundle rasters only.
 */
import { type FC, useEffect, useMemo, useRef } from 'react';
import type { CanvasDrawHelpers, MapRastersSlotProps } from '../../shared/types';
import {
  exclusionLegendItems,
  getElevationColor,
  getExclusionColor,
  getQualityColor,
  getSlopeColor,
  qualityLegendItems,
  type ExclusionLegendItem,
  type ExclusionPattern,
  type QualityLegendItem,
} from './colorScale';
import './map-rasters.css';

type RasterLegendItem = QualityLegendItem | ExclusionLegendItem;

const EXCLUSION_SWATCH_CLASS: Record<ExclusionPattern, string> = {
  crosshatch: 'map-rasters-swatch map-rasters-swatch-crosshatch',
  diagonal: 'map-rasters-swatch map-rasters-swatch-diagonal',
  horizontal: 'map-rasters-swatch map-rasters-swatch-horizontal',
  frame: 'map-rasters-swatch map-rasters-swatch-frame',
};

function legendPattern(item: RasterLegendItem): ExclusionPattern | null {
  if ('pattern' in item) return item.pattern;
  return null;
}

function RasterLegend({ items }: { items: readonly RasterLegendItem[] }) {
  return (
    <span className="map-rasters-legend">
      {items.map((item, index) => {
        const pattern = legendPattern(item);
        const comma = index < items.length - 1 ? ', ' : '';
        return (
          <span key={item.code} className="map-rasters-legend-item">
            {item.color ? (
              <span
                className={pattern ? EXCLUSION_SWATCH_CLASS[pattern] : 'map-rasters-swatch'}
                style={{ backgroundColor: item.color }}
                aria-hidden="true"
              />
            ) : null}
            <span className="map-rasters-legend-word">
              {item.label}
              {comma}
            </span>
          </span>
        );
      })}
    </span>
  );
}

type RasterBundle = MapRastersSlotProps['bundle'];
type RasterLayers = MapRastersSlotProps['layers'];

const RASTER_LAYER_NAMES = ['elevation', 'slope', 'roughness', 'quality', 'exclusion'] as const;
const MAX_CANVAS_SIDE = 4096;

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

interface RasterBitmapCache {
  key: string;
  bundle: RasterBundle;
  elevation: RasterBundle['elevation'];
  slope: RasterBundle['slope'];
  roughness: RasterBundle['roughness'];
  quality: RasterBundle['quality'];
  exclusion: RasterBundle['exclusion'];
  canvas: HTMLCanvasElement;
}

function rasterCacheKey(
  bundle: RasterBundle,
  layers: RasterLayers,
  pxPerCell: number,
  bitmapW: number,
  bitmapH: number,
  minZ: number,
  maxZ: number,
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
    `z${minZ}:${maxZ}`,
    layerKey,
    bufferStamp(bundle.elevation),
    bufferStamp(bundle.slope),
    bufferStamp(bundle.roughness),
    bufferStamp(bundle.quality),
    bufferStamp(bundle.exclusion),
  ].join('~');
}

function cacheIsCurrent(cache: RasterBitmapCache | null, bundle: RasterBundle, key: string): cache is RasterBitmapCache {
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

function paintOffscreen(width: number, height: number, paint: (target: CanvasRenderingContext2D) => void): HTMLCanvasElement | null {
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

function paintRasterCells(
  ctx: CanvasRenderingContext2D,
  bundle: RasterBundle,
  layers: RasterLayers,
  pxPerCell: number,
  minZ: number,
  maxZ: number,
) {
  const { width: cols, height: rows } = bundle.manifest.grid;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const x = c * pxPerCell;
      const y = r * pxPerCell;

      if (layers.elevation.visible) {
        const z = bundle.elevation[i]!;
        ctx.fillStyle = getElevationColor(z, minZ, maxZ, layers.elevation.opacity);
        ctx.fillRect(x, y, pxPerCell, pxPerCell);
      }

      if (layers.slope.visible) {
        const slopeDeg = bundle.slope[i]!;
        const sCol = getSlopeColor(slopeDeg, layers.slope.opacity);
        if (sCol) {
          ctx.fillStyle = sCol;
          ctx.fillRect(x, y, pxPerCell, pxPerCell);
        }
      }

      if (layers.roughness.visible) {
        const roughness = bundle.roughness[i]!;
        if (roughness > 0.05) {
          const alpha = Math.min(1, roughness) * layers.roughness.opacity;
          ctx.fillStyle = `rgba(255,255,255,${alpha * 0.35})`;
          ctx.fillRect(x, y, pxPerCell, pxPerCell);
        }
      }

      if (layers.quality.visible) {
        const q = bundle.quality[i]!;
        const qCol = getQualityColor(q, layers.quality.opacity);
        if (qCol) {
          ctx.fillStyle = qCol;
          ctx.fillRect(x, y, pxPerCell, pxPerCell);
        }
      }

      if (layers.exclusion.visible) {
        const ex = bundle.exclusion[i]!;
        const exCol = getExclusionColor(ex, layers.exclusion.opacity);
        if (exCol) {
          ctx.fillStyle = exCol;
          const pad = Math.max(1, Math.floor(pxPerCell * 0.15));
          const inner = pxPerCell - pad * 2;
          if (inner >= 1) {
            ctx.fillRect(x + pad, y + pad, inner, inner);
          } else {
            ctx.fillRect(x, y, pxPerCell, pxPerCell);
          }
        }
      }
    }
  }
}

export const MapRasters: FC<MapRastersSlotProps> = ({ bundle, layers, registerLayer }) => {
  const { grid } = bundle.manifest;
  const rasterCacheRef = useRef<RasterBitmapCache | null>(null);

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
    return () => {
      rasterCacheRef.current = null;
    };
  }, []);

  useEffect(() => {
    const drawRasters = (helpers: CanvasDrawHelpers) => {
      const { ctx, pxPerCell, width, height } = helpers;
      const cols = grid.width;
      const rows = grid.height;
      const cellCount = cols * rows;
      const bitmapW = cols * pxPerCell;
      const bitmapH = rows * pxPerCell;
      const paint = (target: CanvasRenderingContext2D) => {
        paintRasterCells(target, bundle, layers, pxPerCell, minZ, maxZ);
      };

      if (rasterCacheRef.current && rasterCacheRef.current.bundle !== bundle) {
        rasterCacheRef.current = null;
      }

      if (cellCount <= 4096 || typeof ctx.drawImage !== 'function') {
        paint(ctx);
        return;
      }

      const key = rasterCacheKey(bundle, layers, pxPerCell, bitmapW, bitmapH, minZ, maxZ);
      if (!cacheIsCurrent(rasterCacheRef.current, bundle, key)) {
        const painted = paintOffscreen(bitmapW, bitmapH, paint);
        if (!painted) {
          paint(ctx);
          return;
        }
        rasterCacheRef.current = {
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

      const bitmap = rasterCacheRef.current?.canvas;
      if (!bitmap || bitmap.width > MAX_CANVAS_SIDE || bitmap.height > MAX_CANVAS_SIDE || !blitBitmap(ctx, bitmap, width, height)) {
        rasterCacheRef.current = null;
        paint(ctx);
      }
    };

    return registerLayer(drawRasters);
  }, [bundle, grid, layers, minZ, maxZ, registerLayer]);

  const activeLayers = useMemo(() => {
    const active: string[] = [];
    if (layers.elevation.visible) active.push(`Elevation (${minZ.toFixed(0)}m to ${maxZ.toFixed(0)}m)`);
    if (layers.slope.visible) active.push('Slope');
    if (layers.roughness.visible) active.push('Roughness');
    if (layers.quality.visible) active.push('Quality');
    if (layers.exclusion.visible) active.push('Exclusion');
    return active;
  }, [layers, minZ, maxZ]);

  const qualityLegend = layers.quality.visible ? qualityLegendItems(layers.quality.opacity) : [];
  const exclusionLegend = layers.exclusion.visible ? exclusionLegendItems(layers.exclusion.opacity) : [];

  return (
    <div className="map-rasters-status" data-testid="map-rasters-info">
      <span className="map-rasters-label">Rendered Rasters:</span>
      <span className="map-rasters-list">
        {activeLayers.length > 0 ? activeLayers.join(', ') : 'None (all hidden)'}
      </span>
      {qualityLegend.length > 0 ? <RasterLegend items={qualityLegend} /> : null}
      {qualityLegend.length > 0 && exclusionLegend.length > 0 ? (
        <span className="map-rasters-legend-sep"> — </span>
      ) : null}
      {exclusionLegend.length > 0 ? <RasterLegend items={exclusionLegend} /> : null}
    </div>
  );
};
