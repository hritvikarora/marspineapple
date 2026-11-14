/**
 * ⚠️ MINIMAL ELEVATION PROFILE — OWNER: Dhani (replace freely).
 * x = cumulative horizontal distance (m), y = elevation (m). Hover / slider writes the shared
 * hover sample; map, 3D and briefing read it back from the store.
 */
import type { SelectionView } from '../state/store';

interface Props {
  selection: SelectionView;
  onHover: (pathIndex: number | null) => void;
}

const W = 560, H = 140, PAD = 34;

export function ElevationProfile({ selection, onHover }: Props) {
  const c = selection.candidate;
  if (!c) return <p className="muted" data-testid="profile" data-candidate-id="">Elevation profile appears after a route is calculated.</p>;
  const { distance_m, elevation_m } = c.outbound.profile;
  const dMax = Math.max(distance_m[distance_m.length - 1] ?? 0, 1);
  let lo = Math.min(...elevation_m), hi = Math.max(...elevation_m);
  if (hi - lo < 1) { lo -= 0.5; hi += 0.5; }
  const px = (d: number) => PAD + (d / dMax) * (W - PAD - 8);
  const py = (z: number) => H - 20 - ((z - lo) / (hi - lo)) * (H - 34);
  const pts = distance_m.map((d, i) => `${px(d).toFixed(1)},${py(elevation_m[i]!).toFixed(1)}`).join(' ');
  const hv = selection.hover;
  const nearest = (d: number) => {
    let best = 0;
    for (let i = 1; i < distance_m.length; i++) if (Math.abs(distance_m[i]! - d) < Math.abs(distance_m[best]! - d)) best = i;
    return best;
  };
  return (
    <figure data-testid="profile" data-candidate-id={c.candidateId} data-hover-index={hv?.pathIndex ?? ''} style={{ margin: 0 }}>
      <svg
        width={W}
        height={H}
        role="img"
        aria-label={`Elevation profile of ${c.candidateId}`}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const d = ((e.clientX - r.left - PAD) / (W - PAD - 8)) * dMax;
          onHover(nearest(Math.max(0, Math.min(dMax, d))));
        }}
        onMouseLeave={() => onHover(null)}
        style={{ background: '#1f1916', maxWidth: '100%' }}
      >
        <polyline points={pts} fill="none" stroke="#00e5ff" strokeWidth={2} />
        <text x={4} y={14} fill="#bbb" fontSize={10}>{hi.toFixed(1)} m</text>
        <text x={4} y={H - 22} fill="#bbb" fontSize={10}>{lo.toFixed(1)} m</text>
        <text x={W - 70} y={H - 4} fill="#bbb" fontSize={10}>{dMax.toFixed(0)} m →</text>
        {hv && <circle cx={px(hv.distance_m)} cy={py(hv.point.elevation_m)} r={5} fill="#ffd400" />}
      </svg>
      <label className="muted">
        Inspect position along route{' '}
        <input
          type="range"
          aria-label="Inspect position along route"
          min={0}
          max={distance_m.length - 1}
          value={hv?.pathIndex ?? 0}
          onChange={(e) => onHover(Number(e.target.value))}
        />
      </label>
      <figcaption className="muted">
        Horizontal distance (m) vs elevation (m, bundle vertical reference). Vertical axis is stretched to fit.
        {hv && ` Inspecting ${hv.distance_m.toFixed(0)} m along route, elevation ${hv.point.elevation_m.toFixed(1)} m.`}
      </figcaption>
    </figure>
  );
}
