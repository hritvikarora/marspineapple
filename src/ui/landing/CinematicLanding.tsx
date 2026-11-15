/**
 * Cinematic landing (lazy chunk). OWNER: Dhani (UI).
 * One pinned WebGL stage + six scroll "chapters". The stage tells the product story with real data:
 * Mars -> Jezero -> two points -> the actual A* search on the CTX 20 m bundle -> the route -> walk it.
 */
import { useEffect, useRef, useState } from 'react';
import type { GridBundle, RouteCandidate } from '../../contracts';
import { loadAndValidateBundle } from '../../data/loadBundle';
import { MODEL_VERSION, solveRoute } from '../../routing';
import { computeSearchTraceAndCompare } from '../../routing/searchTrace';
import { LandingScene } from './landingScene';
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
        <span key={i} className="cl-word" aria-hidden="true" style={{ animationDelay: `${delay + i * 80}ms` }}>
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
      const k = Math.min(1, (performance.now() - t0) / 1200);
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
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (!canvas.current) return;
    let scene: LandingScene;
    try {
      scene = new LandingScene(canvas.current, {
        reducedMotion: reduced,
        globeTexture: 'marswalk-vr/mars_globe.jpg',
        terrainTexture: 'bundles/jezero-west-hirise-v0.1.0/texture-hirise-2048.jpg',
      });
    } catch {
      queueMicrotask(() => setWebgl(false));
      return;
    }
    sceneRef.current = scene;
    let alive = true;
    // Real data for the story: CTX 20 m bundle (70 KB), real A* + its search trace.
    void loadAndValidateBundle('bundles/jezero-west-ctx20m-v0.1.0/manifest.json', { timeoutMs: 20000 })
      .then((bundle: GridBundle) => {
        if (!alive) return;
        const pois = bundle.manifest.pointsOfInterest;
        const a = pois.find((p) => p.id === 'poi-p4') ?? pois[0];
        const b = pois.find((p) => p.id === 'poi-p3') ?? pois[1];
        if (!a || !b) return;
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
        const cand: RouteCandidate | null = res.status === 'success' ? (res.candidates[0] ?? null) : null;
        let frames: ReturnType<typeof computeSearchTraceAndCompare>['frames'] = [];
        let dijkstra: number | null = null;
        let explored = 0;
        if (cand) {
          try {
            const tr = computeSearchTraceAndCompare(bundle, request, res.status === 'success' ? res.candidates : [], cand.candidateId, { maxFrames: 120 });
            frames = tr.frames;
            explored = tr.comparison.astar.exploredNodes || (frames.at(-1)?.exploredCount ?? 0);
            dijkstra = tr.comparison.dijkstra.skipped ? null : tr.comparison.dijkstra.exploredNodes;
          } catch {
            /* the story still works without the trace */
          }
          const m = cand.outbound.metrics;
          setFacts({ distance: m.horizontalDistance_m, ascent: m.ascent_m, maxSlope: m.maxTerrainSlope_deg, explored, dijkstra });
        }
        scene.setData({ bundle, candidate: cand, frames });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      scene.dispose();
      sceneRef.current = null;
    };
  }, [reduced]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onScroll = () => {
      const p = el.scrollTop / Math.max(1, el.clientHeight);
      sceneRef.current?.setProgress(p);
      setChapter(Math.min(CHAPTERS.length - 1, Math.round(p)));
      el.style.setProperty('--flash', String(Math.max(0, 1 - Math.abs(p - 1.5) * 6)));
      el.querySelectorAll<HTMLElement>('.cl-ch').forEach((sec, i) => {
        if (Math.abs(p - i) < 0.6) sec.classList.add('in');
      });
    };
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const goTo = (i: number) => {
    setMenuOpen(false);
    scroller.current?.scrollTo({ top: i * (scroller.current?.clientHeight ?? 0), behavior: reduced ? 'auto' : 'smooth' });
  };

  return (
    <div className="landing cl" role="dialog" aria-modal="true" aria-labelledby="landing-title" data-testid="landing" ref={scroller}>
      <canvas ref={canvas} className="cl-stage" aria-hidden="true" />
      {!webgl && <div className="cl-stage cl-stage-fallback" aria-hidden="true" />}
      <div className="cl-flash" aria-hidden="true" />
      <div className="cl-vignette" aria-hidden="true" />

      <nav className="cl-nav" aria-label="Landing">
        <span className="cl-brand">
          MARS <b>PATHFINDER</b>
        </span>
        <ol className={`cl-corridor ${menuOpen ? 'open' : ''}`} id="cl-corridor">
          {CHAPTERS.map((c, i) => (
            <li key={c}>
              <button type="button" className={i === chapter ? 'active' : ''} aria-current={i === chapter ? 'step' : undefined} onClick={() => goTo(i)}>
                <span className="cl-idx">{String(i + 1).padStart(2, '0')}</span>
                <span className="cl-label">{c}</span>
              </button>
            </li>
          ))}
        </ol>
        <div className="cl-actions">
          <button type="button" className="cl-menu" aria-expanded={menuOpen} aria-controls="cl-corridor" onClick={() => setMenuOpen((o) => !o)}>
            {menuOpen ? 'Close' : 'Chapters'}
          </button>
          <button type="button" className="cl-skip" onClick={onPlan} data-testid="landing-plan">
            Open the planner
          </button>
        </div>
      </nav>

      <section className="cl-ch cl-hero">
        <p className="cl-kicker">NASA Space Apps Challenge 2026</p>
        <h2 id="landing-title" className="cl-h1">
          <Words text="Google Maps" delay={1100} />
          <br />
          <Words text="for a walk on Mars." className="cl-accent" delay={1500} />
        </h2>
        <p className="cl-lead">Real orbital terrain. A search that explains itself. A route you can walk in VR.</p>
        <p className="cl-scroll" aria-hidden="true">
          Scroll to descend
        </p>
      </section>

      <section className="cl-ch">
        <div className="cl-copy">
          <p className="cl-step">01 · Where</p>
          <h3 className="cl-h2">Jezero crater, western delta front.</h3>
          <p>Where Perseverance cored ancient lake sediments. 18.4° N, 77.4° E. We dive from orbit to a 1 km² patch of it.</p>
        </div>
      </section>

      <section className="cl-ch">
        <div className="cl-copy">
          <p className="cl-step">02 · Choose</p>
          <h3 className="cl-h2">Drop two points. That is the whole interface.</h3>
          <p>
            Start and destination, on the map in the browser or on a map panel inside the VR station. The terrain under them is the USGS
            HiRISE 1 m elevation model, not a picture.
          </p>
        </div>
      </section>

      <section className="cl-ch">
        <div className="cl-copy">
          <p className="cl-step">03 · Search</p>
          <h3 className="cl-h2">Watch A* think.</h3>
          <p>
            Each orange cell is one the search really closed, in order, on this terrain{facts?.explored ? ` (${facts.explored.toLocaleString('en')} cells)` : ''}.
            Slopes past the suit limits are walls. Then the cyan route draws itself.
          </p>
        </div>
      </section>

      <section className="cl-ch">
        <div className="cl-copy cl-facts">
          <p className="cl-step">04 · Evidence</p>
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
                  <dt>Cells vs Dijkstra</dt>
                  <dd>
                    <Count to={facts.explored} active={chapter >= 4} /> / {facts.dijkstra.toLocaleString('en')}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : (
            <p>Distance, climb, steepest slope and data quality, for every alternative route, with a printable briefing and JSON export.</p>
          )}
          <p className="cl-fine">Shown here on the 20 m CTX model, Enchanted Lake → Wildcat Ridge. The planner runs the same engine on 1 m HiRISE.</p>
        </div>
      </section>

      <section className="cl-ch cl-final">
        <div className="cl-copy">
          <p className="cl-step">05 · Walk</p>
          <h3 className="cl-h2">Then put the helmet on.</h3>
          <p>Leave the station through the airlock and follow turn-by-turn directions on the same terrain, on a Meta Quest 2 or a PC.</p>
          <div className="cl-cta">
            <button type="button" className="cl-btn" onClick={onPlan}>
              <strong>Plan on the map</strong>
              <span>Browser · two points · compare routes</span>
            </button>
            <a className="cl-btn cl-btn-light" href="marswalk-vr/index.html" data-testid="landing-station">
              <strong>Enter the station</strong>
              <span>VR or PC · EVA navigator · directions</span>
            </a>
          </div>
          <p className="cl-fine">Educational simulation, not a safety assessment. Data: NASA/JPL-Caltech, USGS Astrogeology, University of Arizona.</p>
        </div>
      </section>
    </div>
  );
}
