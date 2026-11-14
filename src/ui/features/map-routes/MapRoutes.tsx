/**
 * Map Routes Component. OWNER: Dhani (TASK-011).
 * Renders candidate route polylines, outbound/return legs, stale route indications,
 * and profile hover synchronization onto the 2D Canvas.
 */
import { type FC, useEffect, useRef } from 'react';
import type { CanvasDrawHelpers, MapRoutesSlotProps, RouteCandidate } from '../../shared/types';
import './map-routes.css';

export const MapRoutes: FC<MapRoutesSlotProps> = ({
  candidates,
  selectedCandidateId,
  stale,
  hover,
  routeLayerVisible,
  registerLayer,
}) => {
  const latestRef = useRef({ candidates, selectedCandidateId, stale, hover, routeLayerVisible });
  useEffect(() => {
    latestRef.current = { candidates, selectedCandidateId, stale, hover, routeLayerVisible };
  });

  useEffect(() => {
    const drawRoutes = (helpers: CanvasDrawHelpers) => {
      const {
        candidates: curCandidates,
        selectedCandidateId: curSelectedCandidateId,
        stale: curStale,
        hover: curHover,
        routeLayerVisible: curVisible,
      } = latestRef.current;

      if (!curVisible || curCandidates.length === 0) return;
      const { ctx, toPx } = helpers;

      ctx.save();

      // Render unselected routes first, selected route on top
      const sortedCandidates: RouteCandidate[] = [...curCandidates].sort((a, b) => {
        if (a.candidateId === curSelectedCandidateId) return 1;
        if (b.candidateId === curSelectedCandidateId) return -1;
        return 0;
      });

      for (const candidate of sortedCandidates) {
        const isSelected = candidate.candidateId === curSelectedCandidateId;

        // 1. Draw Outbound Leg
        ctx.beginPath();
        candidate.outbound.path.forEach((p, idx) => {
          const [px, py] = toPx(p);
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });

        if (isSelected) {
          if (curStale) {
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.7)';
            ctx.lineWidth = 3.5;
            ctx.setLineDash([6, 4]);
          } else {
            ctx.strokeStyle = '#00e5ff';
            ctx.lineWidth = 4;
            ctx.setLineDash([]);
          }
        } else {
          ctx.strokeStyle = curStale ? 'rgba(148, 163, 184, 0.35)' : 'rgba(255, 255, 255, 0.6)';
          ctx.lineWidth = 2;
          ctx.setLineDash(curStale ? [4, 4] : []);
        }
        ctx.stroke();

        // 2. Draw Return Leg if present (dashed line)
        if (candidate.returnLeg && candidate.returnLeg.path.length > 0) {
          ctx.beginPath();
          candidate.returnLeg.path.forEach((p, idx) => {
            const [px, py] = toPx(p);
            if (idx === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });

          if (isSelected) {
            ctx.strokeStyle = curStale ? 'rgba(245, 158, 11, 0.5)' : '#fbbf24';
            ctx.lineWidth = 3;
            ctx.setLineDash([5, 5]); // Return leg is always dashed
          } else {
            ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([3, 3]);
          }
          ctx.stroke();
        }
      }

      // 3. Hover Synchronization Ring
      if (curHover) {
        const [hx, hy] = toPx(curHover.point);

        // Outer pulsing ring
        ctx.strokeStyle = '#ffd400';
        ctx.lineWidth = 3;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(hx, hy, 8, 0, Math.PI * 2);
        ctx.stroke();

        // Inner solid pip
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(hx, hy, 3, 0, Math.PI * 2);
        ctx.fill();

        // Distance / Elevation tag
        ctx.font = '10px monospace';
        const tagText = `${Math.round(curHover.distance_m)}m (${curHover.point.elevation_m.toFixed(1)}m)`;
        const tagW = ctx.measureText(tagText).width;
        ctx.fillStyle = 'rgba(9, 13, 22, 0.85)';
        ctx.fillRect(hx + 11, hy - 9, tagW + 6, 15);
        ctx.fillStyle = '#fef08a';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(tagText, hx + 14, hy - 1);
      }

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
            Inputs Changed (Stale)
          </span>
        )}
      </div>
    </div>
  );
};
