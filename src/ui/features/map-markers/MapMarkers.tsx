/**
 * Map Markers Component. OWNER: Dhani (TASK-010).
 * Renders distinct, accessible spatial markers for start points, destination targets,
 * fictional outposts, and science waypoints onto the Canvas.
 */
import { type FC, useEffect } from 'react';
import type { CanvasDrawHelpers, MapMarkersSlotProps } from '../../shared/types';
import './map-markers.css';

export const MapMarkers: FC<MapMarkersSlotProps> = ({
  pois,
  start,
  destination,
  poiLayerVisible,
  registerLayer,
}) => {
  useEffect(() => {
    const drawMarkers = (helpers: CanvasDrawHelpers) => {
      const { ctx, toPx } = helpers;

      ctx.save();

      // 1. Render POIs if POI layer is visible
      if (poiLayerVisible) {
        for (const poi of pois) {
          const [px, py] = toPx(poi.position);

          if (poi.kind === 'outpost') {
            // Blue diamond for habitation outpost
            ctx.fillStyle = '#3b82f6';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(px, py - 7);
            ctx.lineTo(px + 7, py);
            ctx.lineTo(px, py + 7);
            ctx.lineTo(px - 7, py);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Label
            ctx.font = 'bold 10px system-ui, sans-serif';
            ctx.fillStyle = 'rgba(9, 13, 22, 0.8)';
            const textWidth = ctx.measureText(poi.name).width;
            ctx.fillRect(px + 9, py - 7, textWidth + 6, 14);
            ctx.fillStyle = '#93c5fd';
            ctx.fillText(poi.name, px + 12, py + 4);
          } else if (poi.kind === 'science-stop') {
            // Emerald target ring for science waypoint
            ctx.fillStyle = '#10b981';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(px, py, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Inner pip
            ctx.fillStyle = '#ffd400';
            ctx.beginPath();
            ctx.arc(px, py, 2, 0, Math.PI * 2);
            ctx.fill();

            // Label
            ctx.font = '10px system-ui, sans-serif';
            ctx.fillStyle = 'rgba(9, 13, 22, 0.8)';
            const textWidth = ctx.measureText(poi.name).width;
            ctx.fillRect(px + 8, py - 6, textWidth + 6, 13);
            ctx.fillStyle = '#6ee7b7';
            ctx.fillText(poi.name, px + 11, py + 4);
          } else {
            // Context marker
            ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
            ctx.beginPath();
            ctx.arc(px, py, 3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // 2. Render Mission Start Marker (Green Circle with 'S')
      if (start) {
        const [sx, sy] = toPx(start);

        // Halo backdrop
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.beginPath();
        ctx.arc(sx, sy, 11, 0, Math.PI * 2);
        ctx.fill();

        // Pin body
        ctx.fillStyle = '#22c55e';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, sy, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Text letter 'S'
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('S', sx, sy);
      }

      // 3. Render Mission Destination Marker (Red Circle with 'D')
      if (destination) {
        const [dx, dy] = toPx(destination);

        // Halo backdrop
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.beginPath();
        ctx.arc(dx, dy, 11, 0, Math.PI * 2);
        ctx.fill();

        // Pin body
        ctx.fillStyle = '#ef4444';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(dx, dy, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Text letter 'D'
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('D', dx, dy);
      }

      ctx.restore();
    };

    return registerLayer(drawMarkers);
  }, [pois, start, destination, poiLayerVisible, registerLayer]);

  return (
    <div className="map-markers-status" data-testid="map-markers-info">
      <div className="map-markers-summary">
        <span className="map-markers-summary-item">
          <strong>Start:</strong> {start ? `${start.east_m.toFixed(0)}m E, ${start.north_m.toFixed(0)}m N` : 'Unset'}
        </span>
        <span className="map-markers-summary-item">
          <strong>Dest:</strong> {destination ? `${destination.east_m.toFixed(0)}m E, ${destination.north_m.toFixed(0)}m N` : 'Unset'}
        </span>
        <span className="map-markers-summary-item">
          <strong>Waypoints:</strong> {poiLayerVisible ? `${pois.length} active` : 'Hidden'}
        </span>
      </div>
    </div>
  );
};
