import type { ReactNode } from 'react';
import type { RouteCandidate, SearchTraceFrame } from '../contracts';
import type { SearchTraceResult } from '../routing/searchTrace';
import type { RouteRunState } from '../state/store';
import { useUiLang, type UiLang } from './i18n';
import './path-explainer.css';

export interface PathExplainerProps {
  run: RouteRunState;
  isStale: boolean;
  selectedCandidate: RouteCandidate | null;
  traceResult: SearchTraceResult | null;
  activeFrame: SearchTraceFrame | null;
  playhead: number;
  isPlaying: boolean;
  reducedMotion: boolean;
  onPlayPause: () => void;
  onReplay: () => void;
  onScrub: (fraction: number) => void;
}

const PHASE_LABELS: Record<UiLang, Record<string, string>> = {
  en: {
    endpoints: 'Endpoints',
    admissibility: 'Safety gate',
    'policy-eval': 'Cost function',
    'frontier-pruning': 'A* frontier',
    comparison: 'Vs Dijkstra',
    selection: 'Route choice',
  },
  it: {
    endpoints: 'Punti estremi',
    admissibility: 'Soglia sicurezza',
    'policy-eval': 'Funzione di costo',
    'frontier-pruning': 'Frontiera A*',
    comparison: 'Confronto Dijkstra',
    selection: 'Scelta percorso',
  },
};

const STEP_TITLES_IT: Record<string, string> = {
  endpoints: 'Posiziona partenza e destinazione sulla griglia',
  admissibility: 'Scarta celle e passi oltre il limite della tuta',
  'policy-eval': 'Calcola il costo di ogni passo con i pesi attivi',
  'frontier-pruning': 'Espandi il nodo con minima priorità A*',
  comparison: 'Confronta Dijkstra e Greedy Best-First con A*',
  selection: 'Mantieni il percorso ottimo e i corridoi scartati',
};

function MathFormula({ phase, raw }: { phase?: string; raw: string }): ReactNode {
  const s = raw.trim();
  let expr: ReactNode = s;

  if (s.includes('row * width') || s === '(east_m, north_m)') {
    expr = (
      <>
        <var>i</var> <span className="pe-op">=</span> <var>r</var> <span className="pe-op">&middot;</span>{' '}
        <var>W</var> <span className="pe-op">+</span> <var>c</var>
      </>
    );
  } else if (s.includes('tan(') || s.includes('z[v]')) {
    expr = (
      <>
        <span className="pe-op">|</span>
        <var>z</var>
        <sub>
          <var>v</var>
        </sub>{' '}
        <span className="pe-op">&minus;</span> <var>z</var>
        <sub>
          <var>u</var>
        </sub>
        <span className="pe-op">|</span> <span className="pe-op">/</span> &Delta;<var>s</var>{' '}
        <span className="pe-op">&le;</span> tan(20&deg;)
      </>
    );
  } else if (s.includes('slopeWeight') || s.includes('stepLen')) {
    expr = (
      <>
        &Delta;<var>g</var> <span className="pe-op">=</span> &Delta;<var>s</var>{' '}
        <span className="pe-op">&middot;</span> (1 <span className="pe-op">+</span> <var>w</var>
        <sub>s</sub>
        <var>s&#772;</var> <span className="pe-op">+</span> <var>w</var>
        <sub>r</sub>
        <var>r&#772;</var> <span className="pe-op">+</span> <var>w</var>
        <sub>q</sub>
        <var>q</var>)
      </>
    );
  } else if (s.includes('A* priority') || (phase === 'frontier-pruning' && s.includes('Euclidean'))) {
    expr = (
      <>
        <var>f</var>(<var>n</var>) <span className="pe-op">=</span> <var>g</var>(<var>n</var>){' '}
        <span className="pe-op">+</span> <var>h</var>(<var>n</var>), &nbsp; <var>h</var>(<var>n</var>){' '}
        <span className="pe-op">=</span> &parallel;<var>p</var>
        <sub>
          <var>n</var>
        </sub>{' '}
        <span className="pe-op">&minus;</span> <var>p</var>*&parallel;<sub>2</sub>
      </>
    );
  } else if (s.includes('Dijkstra priority')) {
    expr = (
      <>
        <var>f</var>
        <sub>D</sub>(<var>n</var>) <span className="pe-op">=</span> <var>g</var>(<var>n</var>){' '}
        <span className="pe-op">|</span> <var>f</var>
        <sub>G</sub>(<var>n</var>) <span className="pe-op">=</span> <var>h</var>(<var>n</var>)
      </>
    );
  } else if (s.includes('suit_limit')) {
    expr = (
      <>
        <var>&theta;</var> <span className="pe-op">&le;</span> <var>&theta;</var>
        <sub>max</sub>
      </>
    );
  } else if (s.startsWith('(east_m, north_m)')) {
    expr = (
      <>
        <var>p</var> <span className="pe-op">=</span> (<var>e</var>, <var>n</var>) &middot; &Delta;<var>x</var>{' '}
        <span className="pe-op">=</span> 1 m
      </>
    );
  }

  return (
    <span className="pe-formula pe-formula-math" role="math" aria-label={s}>
      {expr}
    </span>
  );
}

const IDLE_PILLARS_BY_LANG = {
  en: [
    {
      code: '01',
      title: 'Sample HiRISE terrain',
      formula: '(east_m, north_m) · 1 m/cell',
      detail: 'Reads bundled orbital elevation, slope angle, surface roughness, quality flags, and manual hazard masks.',
    },
    {
      code: '02',
      title: 'Gate unwalkable terrain',
      formula: 'slope <= suit_limit',
      detail: 'Rejects steep crater walls, excluded voids, and missing-elevation patches before scoring any corridor.',
    },
    {
      code: '03',
      title: 'Expand A* search wave',
      formula: 'f(n) = g(n) + h(n)',
      detail: 'Combines accumulated traverse effort g(n) with straight-line heuristic h(n) toward your destination.',
    },
  ],
  it: [
    {
      code: '01',
      title: 'Campiona il terreno HiRISE',
      formula: '(east_m, north_m) · 1 m/cell',
      detail: 'Legge quota orbitale, pendenza, rugosità superficiale, qualità dei dati e aree interdette.',
    },
    {
      code: '02',
      title: 'Filtra i tratti non percorribili',
      formula: 'slope <= suit_limit',
      detail: 'Esclude pareti ripide del cratere, zone vuote o prive di quota prima di valutare i corridoi.',
    },
    {
      code: '03',
      title: 'Espandi l’onda di ricerca A*',
      formula: 'f(n) = g(n) + h(n)',
      detail: 'Unisce il costo accumulato g(n) alla distanza euclidea h(n) fino alla destinazione.',
    },
  ],
} as const;

export function PathExplainer({
  run,
  isStale,
  selectedCandidate,
  traceResult,
  activeFrame,
  playhead,
  isPlaying,
  reducedMotion,
  onPlayPause,
  onReplay,
  onScrub,
}: PathExplainerProps) {
  const [lang] = useUiLang();
  const isSuccess = run.kind === 'finished' && run.response.status === 'success';
  const clamped = Math.max(0, Math.min(1, playhead));
  const steps = traceResult?.thinkingSteps ?? [];
  const activeStepIndex =
    steps.length === 0
      ? -1
      : clamped >= 0.995
        ? steps.length - 1
        : Math.min(steps.length - 1, Math.floor(clamped * steps.length));

  const exploredCount =
    activeFrame?.exploredCount ??
    traceResult?.comparison.astar.exploredNodes ??
    (run.kind === 'running' ? run.exploredNodes : 0);
  const openSize = activeFrame?.openSize ?? 0;
  const reductionFactor = traceResult?.comparison.nodeReductionFactor ?? null;
  const distM =
    selectedCandidate?.outbound.metrics.horizontalDistance_m ??
    traceResult?.comparison.astar.horizontalDistance_m ??
    null;
  const maxSlopeDeg = selectedCandidate?.outbound.metrics.maxTerrainSlope_deg ?? null;
  const totalPathCells =
    selectedCandidate?.outbound.metrics.cellCount ??
    traceResult?.comparison.astar.pathCellCount ??
    0;
  const isGridSkipped =
    Boolean(traceResult?.comparison.astar.skipped) ||
    (traceResult != null && traceResult.comparison.astar.exploredNodes === 0) ||
    Boolean(activeFrame?.note.includes('closedCells is empty'));
  const liveStepCells =
    totalPathCells > 0
      ? Math.min(totalPathCells, Math.max(1, Math.round(clamped * totalPathCells)))
      : 0;
  const waveNote = isGridSkipped
    ? totalPathCells > 0
      ? `Step ${Math.max(1, activeStepIndex + 1)}/${Math.max(1, steps.length)} · Scoring cell ${liveStepCells.toLocaleString()} of ${totalPathCells.toLocaleString()} (${Math.round(clamped * 100)}%) across 1 m HiRISE terrain`
      : `Step ${Math.max(1, activeStepIndex + 1)}/${Math.max(1, steps.length)} · Evaluating 1 m HiRISE grid constraints`
    : (activeFrame?.note ?? '');

  return (
    <section
      className={`pe-card ${isPlaying ? 'pe-playing' : ''} ${isStale ? 'pe-stale' : ''}`}
      aria-label="How the path is calculated"
      data-testid="path-explainer"
    >
      <div className="pe-head">
        <div className="pe-title-group">
          <span className="pe-eyebrow">
            <span className={`pe-dot ${run.kind === 'running' || isPlaying ? 'pe-dot-active' : ''}`} aria-hidden="true" />
            {run.kind === 'running'
              ? lang === 'it'
                ? 'RICERCA SUL TERRENO'
                : 'SEARCHING TERRAIN'
              : isPlaying
                ? lang === 'it'
                  ? 'RIPRODUZIONE ONDA A*'
                  : 'REPLAYING A* WAVEFRONT'
                : lang === 'it'
                  ? 'CALCOLO PERCORSO A*'
                  : 'A* PATH CALCULATION'}
          </span>
          <h2 className="pe-title">
            {lang === 'it' ? 'Come troviamo il percorso più sicuro' : 'How we find the safest route'}
          </h2>
        </div>

        {isSuccess && traceResult && (
          <div className="pe-controls">
            <button
              type="button"
              className="pe-ctrl-btn"
              onClick={onPlayPause}
              data-testid="explainer-play-pause"
            >
              {isPlaying
                ? lang === 'it'
                  ? 'Pausa'
                  : 'Pause'
                : clamped >= 0.995
                  ? lang === 'it'
                    ? 'Avvia'
                    : 'Play'
                  : lang === 'it'
                    ? 'Riprendi'
                    : 'Resume'}
            </button>
            <button
              type="button"
              className="pe-ctrl-btn pe-ctrl-accent"
              onClick={onReplay}
              data-testid="explainer-replay"
            >
              {lang === 'it' ? 'Ripeti' : 'Replay'}
            </button>
          </div>
        )}
      </div>

      {run.kind === 'idle' && (
        <div className="pe-idle">
          <p className="pe-lead">
            {lang === 'it' ? (
              <>
                Scegli <strong>Partenza</strong> e <strong>Destinazione</strong> sulla mappa di Jezero, poi premi{' '}
                <strong>Calcola percorso</strong> per vedere A* animato.
              </>
            ) : (
              <>
                Pick a <strong>Start</strong> and <strong>Destination</strong> on the Jezero map, then press{' '}
                <strong>Calculate routes</strong> to watch A* search the terrain live.
              </>
            )}
          </p>
          <ol className="pe-steps">
            {IDLE_PILLARS_BY_LANG[lang].map((item) => (
              <li key={item.code} className="pe-step pe-step-idle">
                <div className="pe-step-top">
                  <span className="pe-step-num">{item.code}</span>
                  <span className="pe-step-name">{item.title}</span>
                  <MathFormula raw={item.formula} />
                </div>
                <p className="pe-step-text">{item.detail}</p>
              </li>
            ))}
          </ol>
        </div>
      )}

      {run.kind === 'running' && (
        <div className="pe-running" role="status">
          <div className="pe-scan-bar" aria-hidden="true" />
          <div className="pe-metrics">
            <div className="pe-metric">
              <span className="pe-metric-label">Cells explored</span>
              <strong className="pe-metric-val">{run.exploredNodes.toLocaleString()}</strong>
            </div>
            <div className="pe-metric">
              <span className="pe-metric-label">Heuristic</span>
              <strong className="pe-metric-val">f = g + h</strong>
            </div>
          </div>
          <p className="pe-wave-note">
            Sampling DEM elevation &amp; slope cells, expanding lowest-cost EVA corridor…
          </p>
        </div>
      )}

      {run.kind === 'finished' && run.response.status !== 'success' && (
        <div className="pe-blocked" role="status">
          <p className="pe-lead">
            {run.response.status === 'timeout'
              ? 'Search paused at the step/time budget — a timeout is not proof that no path exists.'
              : 'No traversable corridor met all active slope, roughness, and quality constraints.'}
          </p>
          {'message' in run.response && run.response.message && (
            <p className="pe-step-text">{run.response.message}</p>
          )}
        </div>
      )}

      {isSuccess && !traceResult && (
        <p className="pe-lead">Computing search breakdown and Dijkstra comparison…</p>
      )}

      {isSuccess && traceResult && (
        <>
          <div className="pe-metrics">
            {isGridSkipped ? (
              <>
                <div className="pe-metric">
                  <span className="pe-metric-label">{lang === 'it' ? 'Celle percorso' : 'Path cells'}</span>
                  <strong className="pe-metric-val" data-testid="explainer-explored">
                    {totalPathCells > 0 ? `${liveStepCells.toLocaleString()} / ${totalPathCells.toLocaleString()}` : '—'}
                  </strong>
                </div>
                <div className="pe-metric">
                  <span className="pe-metric-label">{lang === 'it' ? 'Distanza' : 'Distance'}</span>
                  <strong className="pe-metric-val">
                    {distM != null ? `${Math.round(distM)} m` : '—'}
                  </strong>
                </div>
                <div className="pe-metric">
                  <span className="pe-metric-label">{lang === 'it' ? 'Pendenza max' : 'Max slope'}</span>
                  <strong className="pe-metric-val pe-metric-accent">
                    {maxSlopeDeg != null ? `${maxSlopeDeg.toFixed(1)}°` : '—'}
                  </strong>
                </div>
              </>
            ) : (
              <>
                <div className="pe-metric">
                  <span className="pe-metric-label">{lang === 'it' ? 'Esplorate' : 'Explored'}</span>
                  <strong className="pe-metric-val" data-testid="explainer-explored">
                    {exploredCount.toLocaleString()}
                  </strong>
                </div>
                <div className="pe-metric">
                  <span className="pe-metric-label">{lang === 'it' ? 'Frontiera' : 'Frontier'}</span>
                  <strong className="pe-metric-val">{openSize.toLocaleString()}</strong>
                </div>
                <div className="pe-metric">
                  <span className="pe-metric-label">
                    {reductionFactor != null ? 'vs Dijkstra' : lang === 'it' ? 'Distanza' : 'Distance'}
                  </span>
                  <strong className="pe-metric-val pe-metric-accent">
                    {reductionFactor != null
                      ? `${reductionFactor.toFixed(1)}× ${lang === 'it' ? 'in meno' : 'fewer'}`
                      : distM != null
                        ? `${Math.round(distM)} m`
                        : '—'}
                  </strong>
                </div>
              </>
            )}
          </div>

          <label className="pe-scrubber">
            <span className="sr-only">Replay A* path calculation progress</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(clamped * 100)}
              onChange={(e) => onScrub(Number(e.target.value) / 100)}
              aria-label="Replay A* path calculation"
            />
          </label>

          {waveNote && (
            <p className="pe-wave-note" data-testid="explainer-wave-note">
              {waveNote}
            </p>
          )}

          <ol className="pe-steps" data-testid="explainer-steps">
            {steps.map((step, index) => {
              const stepSpan = 1 / Math.max(1, steps.length);
              const startAt = index * stepSpan;
              const isRevealed = reducedMotion || clamped >= startAt || index === 0;
              const isActive = index === activeStepIndex;
              const localProgress = reducedMotion || clamped >= 0.995 || !isPlaying
                ? 1
                : Math.max(0, Math.min(1, (clamped - startAt) / (stepSpan * 0.78)));
              const visibleText =
                localProgress >= 0.98 || !isActive
                  ? step.detail
                  : step.detail.slice(0, Math.max(12, Math.ceil(step.detail.length * localProgress)));

              return (
                <li
                  key={`${step.index}-${step.phase}`}
                  className={`pe-step ${isRevealed ? 'pe-step-revealed' : 'pe-step-upcoming'} ${
                    isActive ? 'pe-step-active' : ''
                  }`}
                >
                  <button
                    type="button"
                    className="pe-step-btn"
                    onClick={() => onScrub(Math.min(1, (index + 0.95) / steps.length))}
                  >
                    <div className="pe-step-top">
                      <span className="pe-step-num">{String(index + 1).padStart(2, '0')}</span>
                      <span className="pe-step-name">
                        {(lang === 'it' && STEP_TITLES_IT[step.phase]) ||
                          step.title ||
                          PHASE_LABELS[lang][step.phase] ||
                          (lang === 'it' ? 'Passo' : 'Step')}
                      </span>
                      {step.formula && <MathFormula phase={step.phase} raw={step.formula} />}
                    </div>
                    {isActive && <p className="pe-step-text">{visibleText}</p>}
                  </button>
                </li>
              );
            })}
          </ol>

          {traceResult.rejectedPaths.length > 0 && (
            <div className="pe-rejected" data-testid="explainer-rejected">
              <span className="pe-rejected-title">
                {lang === 'it' ? 'Perché non andare dritti?' : 'Why not go straight?'}
              </span>
              <ul className="pe-rejected-list">
                {traceResult.rejectedPaths.slice(0, 2).map((rej) => (
                  <li key={rej.id} className="pe-rejected-item">
                    <span
                      className="pe-rejected-swatch"
                      style={{ backgroundColor: rej.colorHex }}
                      aria-hidden="true"
                    />
                    <div>
                      <strong>{rej.label}:</strong> <span>{rej.reason}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {traceResult.sampledNotice && !isGridSkipped && (
            <p className="pe-footnote">{traceResult.sampledNotice}</p>
          )}
        </>
      )}
    </section>
  );
}
