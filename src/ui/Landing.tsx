/**
 * Landing entry point. OWNER: Dhani (UI).
 * Lazy-loads the cinematic three.js landing (its own chunk); shows a light static choice while it loads
 * or if it fails. Shown on the published build only; tests and automated browsers skip it (see App).
 */
import { Component, lazy, Suspense, type ReactNode } from 'react';
import { LangToggle } from './LangToggle';
import { plannerHref, stationHref, syncViewUrl, useUiLang } from './i18n';

const CinematicLanding = lazy(() => import('./landing/CinematicLanding'));

interface Props {
  onPlan: () => void;
}

function StaticLanding({ onPlan }: Props) {
  const [lang] = useUiLang();
  return (
    <div className="landing" role="dialog" aria-modal="true" aria-labelledby="landing-title" data-testid="landing">
      <div className="landing-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <p className="landing-kicker">NASA Space Apps Challenge 2026 · Jezero crater, Mars</p>
          <LangToggle />
        </div>
        <h2 id="landing-title">
          {lang === 'it' ? 'Google Maps per una passeggiata su Marte' : 'Google Maps for a Mars EVA'}
        </h2>
        <div className="landing-options">
          <a
            className="landing-option"
            href={plannerHref(lang)}
            onClick={(e) => {
              e.preventDefault();
              syncViewUrl('planner', lang);
              onPlan();
            }}
            data-testid="landing-plan"
          >
            <strong>{lang === 'it' ? 'Pianifica sulla mappa' : 'Plan on the map'}</strong>
            <span>
              {lang === 'it'
                ? 'Mappa 2D nel browser: scegli due punti, confronta i percorsi ed esporta il briefing.'
                : '2D map in the browser: choose two points, compare routes, export the briefing.'}
            </span>
          </a>
          <a className="landing-option landing-option-dark" href={stationHref(lang)} data-testid="landing-station">
            <strong>{lang === 'it' ? 'Entra nella stazione' : 'Enter the station'}</strong>
            <span>
              {lang === 'it'
                ? 'Marswalk in VR (Quest 2) o PC, con navigatore EVA e indicazioni svolta per svolta.'
                : 'Marswalk in VR (Quest 2) or on a PC, with the EVA navigator and turn-by-turn directions.'}
            </span>
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
