/**
 * ⚠️ MINIMAL 2D MAP — OWNER: Dhani (replace freely). Plain canvas, local-metre frame only.
 * Uses the shared adapter (cellCenter / pointToCell) so map, routing and 3D agree.
 */
import { useEffect, useRef } from 'react';
import { EXCLUSION, QUALITY, type GridBundle, type LocalPoint, type RouteCandidate } from '../contracts';
import type { DisplayState } from '../state/store';

interface Props {
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
}

/** Max on-screen size of the longer map side (px). Real bundles (1000x1000 cells) must not create a 28000 px canvas. */
const MAX_MAP_PX = 900;
/** Max pixels per cell for small grids (keeps the synthetic 20x12 fixture readable). */
const MAX_PX_PER_CELL = 28;

/** Raster layers as one cell-per-pixel RGBA image (cached per bundle + layer settings). */
function rasterImage(bundle: GridBundle, layers: DisplayState['layers']): HTMLCanvasElement | null {
  const { width, height } = bundle.manifest.grid;
  const off = document.createElement('canvas');
  off.width = width;
  off.height = height;
  const octx = off.getContext('2d');
  if (!octx) return null;
  const img = octx.createImageData(width, height);
  const d = img.data;
  let lo = Infinity, hi = -Infinity;
  for (const z of bundle.elevation) if (Number.isFinite(z)) { lo = Math.min(lo, z); hi = Math.max(hi, z); }
  const blend = (o: number, rgb: [number, number, number], a: number) => {
    d[o] = d[o]! * (1 - a) + rgb[0] * a; d[o + 1] = d[o + 1]! * (1 - a) + rgb[1] * a; d[o + 2] = d[o + 2]! * (1 - a) + rgb[2] * a;
  };
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    const z = bundle.elevation[i]!;
    d[o + 3] = 255;
    if (layers.elevation.visible && Number.isFinite(z)) {
      const t = hi > lo ? (z - lo) / (hi - lo) : 0.5;
      const v = 60 + 170 * t;
      d[o] = v; d[o + 1] = v * 0.75; d[o + 2] = v * 0.6;
    } else { d[o] = 0; d[o + 1] = 0; d[o + 2] = 0; }
    if (layers.quality.visible) {
      const q = bundle.quality[i];
      if (q === QUALITY.UNKNOWN) blend(o, [140, 80, 220], layers.quality.opacity);
      else if (q === QUALITY.LOW) blend(o, [255, 170, 0], layers.quality.opacity);
      else if (q === QUALITY.NO_ELEVATION) blend(o, [0, 0, 0], layers.quality.opacity);
    }
    if (layers.exclusion.visible && bundle.exclusion[i] !== EXCLUSION.NONE) blend(o, [220, 30, 30], layers.exclusion.opacity);
    if (layers.slope.visible && bundle.slope[i]! > 25) blend(o, [255, 255, 255], 0.6 * layers.slope.opacity);
  }
  octx.putImageData(img, 0, 0);
  return off;
}

export function MapCanvas({ bundle, candidates, selectedCandidateId, start, destination, layers, stale, hover, onPick }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const raster = useRef<{ key: unknown[]; img: HTMLCanvasElement | null } | null>(null);
  const { grid } = bundle.manifest;
  // One uniform scale in px per METRE (not per cell), so anisotropic cells keep true ground proportions.
  const widthM = grid.extent.east_m - grid.extent.west_m, heightM = grid.extent.north_m - grid.extent.south_m;
  const scale = Math.min(MAX_MAP_PX / widthM, MAX_MAP_PX / heightM, MAX_PX_PER_CELL / grid.cellSizeEast_m, MAX_PX_PER_CELL / grid.cellSizeNorth_m);
  const sx = scale, sy = scale;
  const W = Math.max(1, Math.round(widthM * scale));
  const H = Math.max(1, Math.round(heightM * scale));
  const toPx = (p: LocalPoint): [number, number] => [(p.east_m - grid.extent.west_m) * sx, (grid.extent.north_m - p.north_m) * sy];

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    const key = [bundle, layers.elevation, layers.quality, layers.exclusion, layers.slope];
    if (!raster.current || raster.current.key.some((k, i) => k !== key[i])) raster.current = { key, img: rasterImage(bundle, layers) };
    if (raster.current.img) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(raster.current.img, 0, 0, W, H);
    }
    if (layers.route.visible) {
      const ordered = [...candidates].sort((a, b) => Number(a.candidateId === selectedCandidateId) - Number(b.candidateId === selectedCandidateId));
      for (const c of ordered) {
        const sel = c.candidateId === selectedCandidateId;
        ctx.strokeStyle = sel ? (stale ? '#9ab' : '#00e5ff') : 'rgba(255,255,255,0.7)';
        ctx.lineWidth = sel ? 4 : 2;
        ctx.setLineDash(stale ? [6, 4] : []);
        ctx.beginPath();
        c.outbound.path.forEach((p, k) => { const [px, py] = toPx(p); if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    const marker = (p: LocalPoint | null, color: string, label: string) => {
      if (!p) return;
      const [px, py] = toPx(p);
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(px, py, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.fillText(label, px + 9, py - 6);
    };
    if (layers.poi.visible) for (const poi of bundle.manifest.pointsOfInterest) {
      const [px, py] = toPx(poi.position);
      ctx.strokeStyle = '#ffd400'; ctx.lineWidth = 2; ctx.strokeRect(px - 5, py - 5, 10, 10);
    }
    if (hover) {
      const [hx, hy] = toPx(hover.point);
      ctx.strokeStyle = '#ffd400'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(hx, hy, 9, 0, Math.PI * 2); ctx.stroke();
    }
    marker(start, '#2ecc71', 'S');
    marker(destination, '#e74c3c', 'D');
    // north arrow + 50 m scale bar (local metres)
    ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif'; ctx.fillText('N ↑', W - 34, 16);
    const bar = 50 * sx;
    ctx.fillRect(10, H - 14, bar, 4); ctx.fillText('50 m', 14 + bar, H - 8);
  });

  return (
    <canvas
      ref={ref}
      width={W}
      height={H}
      data-testid="map-canvas"
      data-selected-candidate={selectedCandidateId ?? ''}
      data-hover-index={hover?.pathIndex ?? ''}
      aria-label="Map: click to place the selected endpoint"
      style={{ cursor: 'crosshair', maxWidth: '100%', imageRendering: 'pixelated' }}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const px = ((e.clientX - rect.left) / rect.width) * W;
        const py = ((e.clientY - rect.top) / rect.height) * H;
        onPick({ east_m: grid.extent.west_m + px / sx, north_m: grid.extent.north_m - py / sy });
      }}
    />
  );
}
