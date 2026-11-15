/**
 * Landing choice: plan on the website (2D map + A*) or enter the station (Marswalk WebXR walk, Quest 2 or PC).
 * OWNER: Dhani (UI). Shown on the published build only; tests and automated browsers go straight to the planner.
 */
import { useEffect, useRef } from 'react';

interface Props {
  onPlan: () => void;
}

export function Landing({ onPlan }: Props) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus(), []);
  return (
    <div className="landing" role="dialog" aria-modal="true" aria-labelledby="landing-title" data-testid="landing">
      <div className="landing-card">
        <p className="landing-kicker">NASA Space Apps Challenge 2026 · Jezero crater, Mars</p>
        <h2 id="landing-title">Google Maps for a Mars EVA</h2>
        <p className="landing-lead">
          Pick a start and a destination on real HiRISE 1 m terrain of the Jezero delta front. A deterministic A* search finds the route
          and explains it. Then walk it.
        </p>
        <div className="landing-options">
          <button ref={first} type="button" className="landing-option" onClick={onPlan} data-testid="landing-plan">
            <strong>Plan on the map</strong>
            <span>2D map in the browser: choose two points, compare routes, export the briefing. No headset needed.</span>
          </button>
          <a className="landing-option landing-option-dark" href="marswalk-vr/index.html" data-testid="landing-station">
            <strong>Enter the station</strong>
            <span>
              Marswalk in VR (Meta Quest 2) or on a PC: inside the base, use the EVA navigator to pick two points, then follow
              turn-by-turn directions on the terrain.
            </span>
          </a>
        </div>
        <p className="landing-note">Educational simulation, not a safety assessment. Data: NASA/JPL-Caltech, USGS, University of Arizona.</p>
      </div>
    </div>
  );
}
