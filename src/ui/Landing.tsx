/**
 * Landing entry point. OWNER: Dhani (UI).
 * Lazy-loads the cinematic three.js landing (its own chunk); shows a light static choice while it loads
 * or if it fails. Shown on the published build only; tests and automated browsers skip it (see App).
 */
import { Component, lazy, Suspense, type ReactNode } from 'react';

const CinematicLanding = lazy(() => import('./landing/CinematicLanding'));

interface Props {
  onPlan: () => void;
}

function StaticLanding({ onPlan }: Props) {
  return (
    <div className="landing" role="dialog" aria-modal="true" aria-labelledby="landing-title" data-testid="landing">
      <div className="landing-card">
        <p className="landing-kicker">NASA Space Apps Challenge 2026 · Jezero crater, Mars</p>
        <h2 id="landing-title">Google Maps for a Mars EVA</h2>
        <div className="landing-options">
          <button type="button" className="landing-option" onClick={onPlan} data-testid="landing-plan">
            <strong>Plan on the map</strong>
            <span>2D map in the browser: choose two points, compare routes, export the briefing.</span>
          </button>
          <a className="landing-option landing-option-dark" href="marswalk-vr/index.html" data-testid="landing-station">
            <strong>Enter the station</strong>
            <span>Marswalk in VR (Quest 2) or on a PC, with the EVA navigator and turn-by-turn directions.</span>
          </a>
        </div>
      </div>
    </div>
  );
}

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function Landing({ onPlan }: Props) {
  const fallback = <StaticLanding onPlan={onPlan} />;
  return (
    <Boundary fallback={fallback}>
      <Suspense fallback={<div className="landing cl-loading" aria-hidden="true" />}>
        <CinematicLanding onPlan={onPlan} />
      </Suspense>
    </Boundary>
  );
}
