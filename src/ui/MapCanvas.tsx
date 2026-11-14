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
  onPick: (p: LocalPoint) => void;
}

const PX_PER_CELL = 28;

export function MapCanvas({ bundle, candidates, selectedCandidateId, start, destination, layers, stale, onPick }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { grid } = bundle.manifest;
  const sx = PX_PER_CELL / grid.cellSizeEast_m;
  const sy = PX_PER_CELL / grid.cellSizeNorth_m;
  const W = grid.width * PX_PER_CELL;
  const H = grid.height * PX_PER_CELL;
  const toPx = (p: LocalPoint): [number, number] => [(p.east_m - grid.extent.west_m) * sx, (grid.extent.north_m - p.north_m) * sy];

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    let lo = Infinity, hi = -Infinity;
    for (const z of bundle.elevation) if (Number.isFinite(z)) { lo = Math.min(lo, z); hi = Math.max(hi, z); }
    for (let r = 0; r < grid.height; r++) {
      for (let c = 0; c < grid.width; c++) {
        const i = r * grid.width + c;
        const x = c * PX_PER_CELL, y = r * PX_PER_CELL;
        const z = bundle.elevation[i]!;
        if (layers.elevation.visible) {
          if (Number.isFinite(z)) {
            const t = hi > lo ? (z - lo) / (hi - lo) : 0.5;
            const v = Math.round(60 + 170 * t);
            ctx.fillStyle = `rgb(${v},${Math.round(v * 0.75)},${Math.round(v * 0.6)})`;
          } else ctx.fillStyle = '#000';
          ctx.fillRect(x, y, PX_PER_CELL, PX_PER_CELL);
        }
        if (layers.quality.visible) {
          const q = bundle.quality[i];
          const col = q === QUALITY.UNKNOWN ? '140,80,220' : q === QUALITY.LOW ? '255,170,0' : q === QUALITY.NO_ELEVATION ? '0,0,0' : null;
          if (col) { ctx.fillStyle = `rgba(${col},${layers.quality.opacity})`; ctx.fillRect(x, y, PX_PER_CELL, PX_PER_CELL); }
        }
        if (layers.exclusion.visible && bundle.exclusion[i] !== EXCLUSION.NONE) {
          ctx.fillStyle = `rgba(220,30,30,${layers.exclusion.opacity})`;
          ctx.fillRect(x + 3, y + 3, PX_PER_CELL - 6, PX_PER_CELL - 6);
        }
        if (layers.slope.visible && bundle.slope[i]! > 25) {
          ctx.strokeStyle = `rgba(255,255,255,${layers.slope.opacity})`;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + PX_PER_CELL, y + PX_PER_CELL); ctx.stroke();
        }
      }
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
