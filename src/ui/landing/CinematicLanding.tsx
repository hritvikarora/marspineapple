/**
 * Cinematic landing (lazy chunk). OWNER: Dhani (UI).
 * Preloads & GPU-warms all globe, orbital mosaic, HiRISE, and CTX 20 m assets
 * on the first screen before starting the zoom-in animation, then drives six
 * scrollable chapters: Mars -> Jezero -> Two points -> A* search -> Evidence -> Walk it.
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { GridBundle, RouteCandidate } from '../../contracts';
import { loadAndValidateBundle } from '../../data/loadBundle';
import { MODEL_VERSION, solveRoute } from '../../routing';
import { computeSearchTraceAndCompare } from '../../routing/searchTrace';
import { LandingScene, preloadImage } from './landingScene';
import './landing.css';

interface Props {
  onPlan: () => void;
}

interface Facts {
  distance: number;
  ascent: number;
  maxSlope: number;
  explored: number;
  dijkstra: number | null;
}

const CHAPTERS = ['Mars', 'Jezero', 'Two points', 'A* search', 'Evidence', 'Walk it'];

function Words({ text, className, delay = 0 }: { text: string; className?: string; delay?: number }) {
  return (
    <span className={`cl-words ${className ?? ''}`} aria-label={text}>
      {text.split(' ').map((w, i) => (
        <span key={i} className="cl-word" aria-hidden="true" style={{ animationDelay: `${delay + i * 70}ms` }}>
          {w}&nbsp;
        </span>
      ))}
    </span>
  );
}

function Count({ to, decimals = 0, active }: { to: number; decimals?: number; active: boolean }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / 1100);
      setV(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, active]);
  return <span className="cl-num">{v.toFixed(decimals)}</span>;
}

export default function CinematicLanding({ onPlan }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<LandingScene | null>(null);
  const [chapter, setChapter] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [facts, setFacts] = useState<Facts | null>(null);
  const [webgl, setWebgl] = useState(true);
  const [ready, setReady] = useState(false);
  const [loadPct, setLoadPct] = useState(6);
  const [loadNote, setLoadNote] = useState('Preloading orbital imagery and terrain elevation…');
  const reduced =
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    let alive = true;
    let scene: LandingScene | null = null;
    let rafA = 0;
    let rafB = 0;
    let completed = 0;
    const TOTAL = 4;
    const bump = (note: string) => {
      if (!alive) return;
      completed += 1;
      setLoadPct(Math.min(92, Math.round((completed / TOTAL) * 86) + 6));
      setLoadNote(note);
    };

    const loadAll = async () => {
      const [globeImg, jezeroOrthoImg, terrainImg, bundleResult] = await Promise.all([
        preloadImage('marswalk-vr/mars_globe.jpg').then((r) => {
          bump('Decoded Mars global albedo…');
          return r;
        }),
        preloadImage('sites/jezero-delta/outer_ortho_0_0.jpg').then((r) => {
          bump('Decoded Jezero regional orbital mosaic…');
          return r;
        }),
        preloadImage('bundles/jezero-west-hirise-v0.1.0/texture-hirise-2048.jpg').then((r) => {
          bump('Decoded HiRISE 1 m delta orthophoto…');
          return r;
        }),
        loadAndValidateBundle('bundles/jezero-west-ctx20m-v0.1.0/manifest.json', { timeoutMs: 20000 })
          .then((b) => {
            bump('Computing CTX 20 m elevation & A* path trace…');
            return b;
          })
          .catch(() => {
            bump('Terrain model skipped — ready for stage warmup…');
            return null;
          }),
      ]);

      if (!alive || !canvas.current) return;

      let candidate: RouteCandidate | null = null;
      let frames: ReturnType<typeof computeSearchTraceAndCompare>['frames'] = [];
      let dijkstra: number | null = null;
      let explored = 0;
      const bundle: GridBundle | null = bundleResult;

      if (bundle) {
        const pois = bundle.manifest.pointsOfInterest;
        const a = pois.find((p) => p.id === 'poi-p4') ?? pois[0];
        const b = pois.find((p) => p.id === 'poi-p3') ?? pois[1];
        if (a && b) {
          const request = {
            requestId: 'landing',
            bundleVersion: bundle.bundleVersion,
            modelVersion: MODEL_VERSION,
            start: a.position,
            destination: b.position,
            policies: ['terrain-aware' as const],
            strictQuality: false,
            roundTrip: false,
          };
          const res = solveRoute(bundle, request);
          candidate = res.status === 'success' ? (res.candidates[0] ?? null) : null;
          if (candidate) {
            try {
              const tr = computeSearchTraceAndCompare(
                bundle,
                request,
                res.status === 'success' ? res.candidates : [],
                candidate.candidateId,
                { maxFrames: 120 },
              );
              frames = tr.frames;
              explored = tr.comparison.astar.exploredNodes || (frames.at(-1)?.exploredCount ?? 0);
              dijkstra = tr.comparison.dijkstra.skipped ? null : tr.comparison.dijkstra.exploredNodes;
            } catch {
              /* Landing story works cleanly even if trace fails */
            }
            const m = candidate.outbound.metrics;
            setFacts({
              distance: m.horizontalDistance_m,
              ascent: m.ascent_m,
              maxSlope: m.maxTerrainSlope_deg,
              explored,
              dijkstra,
            });
          }
        }
      }

      if (!alive) return;
      setLoadNote('Compiling WebGL shaders & uploading GPU textures…');
      setLoadPct(96);

      try {
        scene = new LandingScene(canvas.current, {
          reducedMotion: reduced,
          assets: { globeImg, jezeroOrthoImg, terrainImg },
        });
        sceneRef.current = scene;
        if (bundle) {
          scene.setData({ bundle, candidate, frames });
        }
        scene.warmup();
      } catch {
        if (alive) {
          setWebgl(false);
          setLoadPct(100);
          setReady(true);
        }
        return;
      }

      // Let GPU commit uploaded textures before starting the zoom-in frame timer
      rafA = requestAnimationFrame(() => {
        rafB = requestAnimationFrame(() => {
          if (!alive || !scene) return;
          setLoadPct(100);
          setReady(true);
          scene.begin();
        });
      });
    };

    void loadAll();

    return () => {
      alive = false;
      cancelAnimationFrame(rafA);
      cancelAnimationFrame(rafB);
      scene?.dispose();
      sceneRef.current = null;
    };
  }, [reduced]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onScroll = () => {
      const p = el.scrollTop / Math.max(1, el.clientHeight);
      sceneRef.current?.setProgress(p);
      const nextChapter = Math.min(CHAPTERS.length - 1, Math.max(0, Math.round(p)));
      setChapter(nextChapter);
      el.style.setProperty('--flash', String(Math.max(0, 0.42 * (1 - Math.abs(p - 1.5) * 4.5))));
      el.querySelectorAll<HTMLElement>('.cl-ch').forEach((sec, i) => {
        if (Math.abs(p - i) < 0.65) sec.classList.add('in');
      });
    };
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const goTo = useCallback(
    (i: number) => {
      setMenuOpen(false);
      const clamped = Math.max(0, Math.min(CHAPTERS.length - 1, i));
      const el = scroller.current;
      if (!el) return;
      el.scrollTo({
        top: clamped * el.clientHeight,
        behavior: reduced ? 'auto' : 'smooth',
      });
    },
    [reduced],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement) return;
    if (e.key === 'ArrowDown' || e.key === 'PageDown') {
      e.preventDefault();
      goTo(chapter + 1);
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault();
      goTo(chapter - 1);
    }
  };

  return (
    <div
      className={`landing cl${ready ? ' cl-ready' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="landing-title"
      data-testid="landing"
      ref={scroller}
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <canvas ref={canvas} className="cl-stage" aria-hidden="true" />
      {!webgl && <div className="cl-stage cl-stage-fallback" aria-hidden="true" />}
      <div className="cl-flash" aria-hidden="true" />
      <div className="cl-vignette" aria-hidden="true" />

      <div className={`cl-preloader${ready ? ' done' : ''}`} aria-hidden={ready}>
        <div className="cl-loader-card">
          <div className="cl-loader-head">
            <span>MARS PATHFINDER · PREFLIGHT</span>
            <span className="cl-loader-pct">{loadPct}%</span>
          </div>
          <div className="cl-loader-track" role="progressbar" aria-valuenow={loadPct} aria-valuemin={0} aria-valuemax={100}>
            <div className="cl-loader-bar" style={{ transform: `scaleX(${loadPct / 100})` }} />
          </div>
          <p className="cl-loader-note">{loadNote}</p>
          <button type="button" className="cl-loader-skip" onClick={onPlan}>
            Skip intro &amp; open map planner
          </button>
        </div>
      </div>

      <nav className="cl-nav" aria-label="Landing">
        <span className="cl-brand">
          MARS <b>PATHFINDER</b>
        </span>
        <ol className={`cl-corridor ${menuOpen ? 'open' : ''}`} id="cl-corridor">
          {CHAPTERS.map((c, i) => (
            <li key={c}>
              <button
                type="button"
                className={i === chapter ? 'active' : ''}
                aria-current={i === chapter ? 'step' : undefined}
                onClick={() => goTo(i)}
              >
                <span className="cl-idx">{String(i + 1).padStart(2, '0')}</span>
                <span className="cl-label">{c}</span>
              </button>
            </li>
          ))}
        </ol>
        <div className="cl-actions">
          <button
            type="button"
            className="cl-menu"
            aria-expanded={menuOpen}
            aria-controls="cl-corridor"
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? 'Close' : 'Chapters'}
          </button>
          <button type="button" className="cl-skip" onClick={onPlan} data-testid="landing-plan">
            Open the planner
          </button>
        </div>
      </nav>

      <div className="cl-rail" aria-label="Scroll sections">
        {CHAPTERS.map((c, i) => (
          <button
            key={c}
            type="button"
            className={i === chapter ? 'active' : ''}
            aria-label={`Jump to ${c}`}
            title={c}
            onClick={() => goTo(i)}
          />
        ))}
      </div>

      <section className="cl-ch cl-hero in">
        <p className="cl-kicker">01 · NASA Space Apps Challenge 2026</p>
        <h2 id="landing-title" className="cl-h1">
          <Words text="Google Maps" delay={180} />
          <br />
          <Words text="for a walk on Mars." className="cl-accent" delay={420} />
        </h2>
        <p className="cl-lead">
          Real orbital terrain. A path search that explains every step. A route you can walk in VR.
        </p>
        <button type="button" className="cl-scroll" onClick={() => goTo(1)}>
          Scroll to descend ↓
        </button>
      </section>

      <section className="cl-ch">
        <div className="cl-copy">
          <p className="cl-step">02 · Jezero Orbit</p>
          <h3 className="cl-h2">Jezero crater, western delta front.</h3>
          <p>
            Where Perseverance cored ancient lake sediments. We dive from Martian orbit onto a crisp 1 km² HiRISE &amp; CTX
            elevation terrain model of the delta fan.
          </p>
          <span className="cl-coords">18.4555° N · 77.4055° E · Jezero Western Delta</span>
        </div>
      </section>

      <section className="cl-ch">
        <div className="cl-copy">
          <p className="cl-step">03 · Two Points</p>
          <h3 className="cl-h2">Drop start and destination.</h3>
          <p>
            Pick a start outpost and science destination directly on the high-resolution HiRISE map or from rover presets.
            The surface beneath is real USGS 1 m elevation data, never a flat backdrop.
          </p>
        </div>
      </section>

      <section className="cl-ch">
        <div className="cl-copy">
          <p className="cl-step">04 · A* Search</p>
          <h3 className="cl-h2">Watch A* think in real time.</h3>
          <p>
            Each amber cell is one the solver genuinely evaluated
            {facts?.explored ? ` (${facts.explored.toLocaleString('en')} nodes)` : ''}. Cliffs steeper than EVA suit
            limits act as walls, and the cyan route locks onto the lowest-cost safe corridor.
          </p>
        </div>
      </section>

      <section className="cl-ch">
        <div className="cl-copy cl-facts">
          <p className="cl-step">05 · Evidence</p>
          <h3 className="cl-h2">Every route explains itself.</h3>
          {facts ? (
            <dl>
              <div>
                <dt>Distance</dt>
                <dd>
                  <Count to={facts.distance} active={chapter >= 4} /> m
                </dd>
              </div>
              <div>
                <dt>Climb</dt>
                <dd>
                  <Count to={facts.ascent} decimals={1} active={chapter >= 4} /> m
                </dd>
              </div>
              <div>
                <dt>Max slope</dt>
                <dd>
                  <Count to={facts.maxSlope} decimals={1} active={chapter >= 4} />°
                </dd>
              </div>
              {facts.dijkstra ? (
                <div>
                  <dt>A* vs Dijkstra</dt>
                  <dd>
                    <Count to={facts.explored} active={chapter >= 4} /> / {facts.dijkstra.toLocaleString('en')}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : (
            <p>Distance, climb, peak slope, and animated A* reasoning with a printable briefing and JSON export.</p>
          )}
          <p className="cl-fine">
            Shown here on CTX 20 m elevation (Enchanted Lake → Wildcat Ridge). The planner runs the same engine at 1 m HiRISE resolution.
          </p>
        </div>
      </section>

      <section className="cl-ch cl-final">
        <div className="cl-copy">
          <p className="cl-step">06 · Walk It</p>
          <h3 className="cl-h2">Plan on the map, or put the helmet on.</h3>
          <p>
            Pick two points on the interactive Jezero map to watch the A* pathfinder animate step by step, then walk your route in Marswalk VR.
          </p>
          <div className="cl-cta">
            <button type="button" className="cl-btn" onClick={onPlan}>
              <strong>Plan on the map</strong>
              <span>Interactive HiRISE map · animated A* explainer</span>
            </button>
            <a className="cl-btn cl-btn-light" href="marswalk-vr/index.html" data-testid="landing-station">
              <strong>Enter the station</strong>
              <span>VR or PC · EVA navigator · turn-by-turn</span>
            </a>
          </div>
          <p className="cl-fine">
            Educational simulation, not a safety assessment. Data: NASA/JPL-Caltech, USGS Astrogeology, University of Arizona.
          </p>
        </div>
      </section>
    </div>
  );
}
