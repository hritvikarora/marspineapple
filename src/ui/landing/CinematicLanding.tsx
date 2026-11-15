/**
 * Cinematic landing (lazy chunk). OWNER: Dhani (UI).
 * Preloads & GPU-warms all globe, orbital mosaic, HiRISE, and CTX 20 m assets
 * on the first screen before starting the zoom-in animation, then drives six
 * scrollable chapters: Mars -> Jezero -> Two points -> A* search -> Evidence -> Walk it.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';
import type { GridBundle, RouteCandidate } from '../../contracts';
import { loadAndValidateBundle } from '../../data/loadBundle';
import { MODEL_VERSION, solveRoute } from '../../routing';
import { computeSearchTraceAndCompare } from '../../routing/searchTrace';
import { LangToggle } from '../LangToggle';
import { plannerHref, stationHref, syncViewUrl, useUiLang } from '../i18n';
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

const CHAPTERS_BY_LANG = {
  en: ['Mars', 'Jezero', 'Two points', 'A* search', 'Evidence', 'Walk it'],
  it: ['Marte', 'Jezero', 'Due punti', 'Ricerca A*', 'Prove', 'Cammina'],
} as const;
const DECODE_GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/+-·*';

function DecodeText({
  text,
  active,
  triggerKey = 0,
  duration = 460,
  className,
}: {
  text: string;
  active: boolean;
  triggerKey?: number;
  duration?: number;
  className?: string;
}) {
  const reduced =
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isWebdriver = typeof navigator !== 'undefined' && navigator.webdriver;
  const shouldDecode = active && !reduced && !isWebdriver;
  const [rendered, setRendered] = useState(text);

  useEffect(() => {
    if (!shouldDecode) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / duration);
      const locked = Math.floor(k * text.length);
      let out = '';
      for (let i = 0; i < text.length; i++) {
        const ch = text[i]!;
        if (i < locked || ch === ' ' || ch === '·' || ch === '°' || ch === '\n') {
          out += ch;
        } else {
          const gi = Math.abs(Math.floor(now * 0.045 + i * 7)) % DECODE_GLYPHS.length;
          out += DECODE_GLYPHS[gi]!;
        }
      }
      setRendered(out);
      if (k < 1) raf = requestAnimationFrame(step);
      else setRendered(text);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [text, shouldDecode, triggerKey, duration]);

  const shown = shouldDecode ? rendered : text;
  return (
    <span className={`cl-decode ${className ?? ''}`} aria-label={text}>
      <span aria-hidden="true">{shown}</span>
    </span>
  );
}

function Words({ text, className, delay = 0 }: { text: string; className?: string; delay?: number }) {
  return (
    <span className={`cl-words ${className ?? ''}`} aria-label={text}>
      {text.split(' ').map((w, i) => (
        <span key={i} className="cl-slit" aria-hidden="true" style={{ '--sibling-index': i } as CSSProperties}>
          <span className="cl-word" style={{ animationDelay: `${delay + i * 68}ms` }}>
            <span className="cl-word-inner">{w}&nbsp;</span>
          </span>
        </span>
      ))}
    </span>
  );
}

function MaskLines({
  lines,
  className,
  baseDelay = 0,
  stepDelay = 95,
}: {
  lines: string[];
  className?: string;
  baseDelay?: number;
  stepDelay?: number;
}) {
  return (
    <span className={`cl-mask-group ${className ?? ''}`}>
      {lines.map((line, i) => (
        <span key={i} className="cl-mask-line" style={{ '--sibling-index': i } as CSSProperties}>
          <span
            className="cl-mask-inner"
            style={{
              transitionDelay: `${baseDelay + i * stepDelay}ms`,
              animationDelay: `${baseDelay + i * stepDelay}ms`,
            }}
          >
            {line}
          </span>
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
  const [lang] = useUiLang();
  const chapters = CHAPTERS_BY_LANG[lang];
  const [chapter, setChapter] = useState(0);
  const [facts, setFacts] = useState<Facts | null>(null);
  const [webgl, setWebgl] = useState(true);
  const [ready, setReady] = useState(false);
  const [loadPct, setLoadPct] = useState(6);
  const [loadNote, setLoadNote] = useState('Preloading orbital imagery and terrain elevation…');
  const reduced =
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const goPlanner = useCallback(
    (e?: MouseEvent<HTMLElement>) => {
      e?.preventDefault();
      syncViewUrl('planner', lang);
      onPlan();
    },
    [lang, onPlan],
  );

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
    let lastTop = el.scrollTop;
    let vel = 0;
    let velRaf = 0;
    const decayVelocity = () => {
      vel *= 0.84;
      if (Math.abs(vel) < 0.015) {
        vel = 0;
        velRaf = 0;
        el.style.setProperty('--cl-vel', '0');
        return;
      }
      el.style.setProperty('--cl-vel', vel.toFixed(3));
      velRaf = requestAnimationFrame(decayVelocity);
    };
    const onScroll = () => {
      const p = el.scrollTop / Math.max(1, el.clientHeight);
      sceneRef.current?.setProgress(p);
      const nextChapter = Math.min(CHAPTERS_BY_LANG.en.length - 1, Math.max(0, Math.round(p)));
      setChapter(nextChapter);
      el.style.setProperty('--flash', String(Math.max(0, 0.42 * (1 - Math.abs(p - 1.5) * 4.5))));
      el.querySelectorAll<HTMLElement>('.cl-ch').forEach((sec, i) => {
        if (Math.abs(p - i) < 0.65) sec.classList.add('in');
      });
      if (!reduced) {
        const dy = el.scrollTop - lastTop;
        lastTop = el.scrollTop;
        vel = Math.max(-1.6, Math.min(1.6, vel * 0.45 + dy * 0.022));
        el.style.setProperty('--cl-vel', vel.toFixed(3));
        if (!velRaf && Math.abs(vel) >= 0.015) {
          velRaf = requestAnimationFrame(decayVelocity);
        }
      }
    };
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(velRaf);
    };
  }, [reduced]);

  const goTo = useCallback(
    (i: number) => {
      const clamped = Math.max(0, Math.min(chapters.length - 1, i));
      const el = scroller.current;
      if (!el) return;
      el.scrollTo({
        top: clamped * el.clientHeight,
        behavior: reduced ? 'auto' : 'smooth',
      });
    },
    [chapters.length, reduced],
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
            <span>{lang === 'it' ? 'MARS PATHFINDER · PREVOLO' : 'MARS PATHFINDER · PREFLIGHT'}</span>
            <span className="cl-loader-pct">{loadPct}%</span>
          </div>
          <div className="cl-loader-track" role="progressbar" aria-valuenow={loadPct} aria-valuemin={0} aria-valuemax={100}>
            <div className="cl-loader-bar" style={{ transform: `scaleX(${loadPct / 100})` }} />
          </div>
          <p className="cl-loader-note">{loadNote}</p>
          <a href={plannerHref(lang)} className="cl-loader-skip" onClick={goPlanner}>
            {lang === 'it' ? 'Salta intro e apri pianificatore' : 'Skip intro & open map planner'}
          </a>
        </div>
      </div>

      <nav className="cl-nav" aria-label={lang === 'it' ? 'Navigazione iniziale' : 'Landing'}>
        <span className="cl-brand">
          MARS <b>PATHFINDER</b>
        </span>
        <ol className="cl-corridor" id="cl-corridor">
          {chapters.map((c, i) => (
            <li key={`${lang}-${i}`}>
              <button
                type="button"
                className={i === chapter ? 'active' : ''}
                aria-current={i === chapter ? 'step' : undefined}
                onClick={() => goTo(i)}
              >
                <span className="cl-idx">{String(i + 1).padStart(2, '0')}</span>
                <span className="cl-label cl-roll-clip">
                  <span className="cl-roll-text" data-text={c}>
                    {c}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>
        <div className="cl-actions">
          <LangToggle className="cl-lang-toggle" />
          <a className="cl-skip" href={plannerHref(lang)} onClick={goPlanner} data-testid="landing-plan">
            <span className="cl-roll-clip">
              <span
                className="cl-roll-text"
                data-text={lang === 'it' ? 'Pianifica sulla mappa' : 'Plan on the map'}
              >
                {lang === 'it' ? 'Pianifica sulla mappa' : 'Plan on the map'}
              </span>
            </span>
          </a>
          <a
            className="cl-skip cl-skip-station"
            href={stationHref(lang)}
            data-testid="landing-top-station"
          >
            <span className="cl-roll-clip">
              <span
                className="cl-roll-text"
                data-text={lang === 'it' ? 'Entra nella stazione' : 'Enter the station'}
              >
                {lang === 'it' ? 'Entra nella stazione' : 'Enter the station'}
              </span>
            </span>
          </a>
        </div>
      </nav>

      <div className="cl-rail" aria-label={lang === 'it' ? 'Sezioni' : 'Scroll sections'}>
        {chapters.map((c, i) => (
          <button
            key={c}
            type="button"
            className={i === chapter ? 'active' : ''}
            aria-label={`${lang === 'it' ? 'Vai a' : 'Jump to'} ${c}`}
            title={c}
            onClick={() => goTo(i)}
          />
        ))}
      </div>

      <section className="cl-ch cl-hero in">
        <p className="cl-kicker">
          <DecodeText text="01 · NASA Space Apps Challenge 2026" active={ready && chapter === 0} triggerKey={lang === 'it' ? 1 : 0} duration={560} />
        </p>
        <h2 id="landing-title" className="cl-h1">
          <Words key={`h1a-${lang}`} text={lang === 'it' ? 'Google Maps' : 'Google Maps'} delay={160} />
          <br />
          <Words
            key={`h1b-${lang}`}
            text={lang === 'it' ? 'per una passeggiata su Marte.' : 'for a walk on Mars.'}
            className="cl-accent"
            delay={360}
          />
        </h2>
        <p className="cl-lead">
          <MaskLines
            key={`lead-${lang}`}
            lines={
              lang === 'it'
                ? ['Terreno orbitale reale.', 'Ricerca A* che spiega ogni passo.', 'Un percorso da vivere in VR.']
                : ['Real orbital terrain.', 'A path search that explains every step.', 'A route you can walk in VR.']
            }
            baseDelay={760}
            stepDelay={120}
            className="cl-hero-lines"
          />
        </p>
        <button type="button" className="cl-scroll" onClick={() => goTo(1)}>
          <span className="cl-roll-clip">
            <span
              className="cl-roll-text"
              data-text={lang === 'it' ? 'Scorri per scendere ↓' : 'Scroll to descend ↓'}
            >
              {lang === 'it' ? 'Scorri per scendere ↓' : 'Scroll to descend ↓'}
            </span>
          </span>
        </button>
      </section>

      <section className="cl-ch">
        <div className="cl-copy">
          <p className="cl-step">
            <DecodeText text={lang === 'it' ? '02 · Orbita di Jezero' : '02 · Jezero Orbit'} active={ready && chapter === 1} duration={440} />
          </p>
          <h3 className="cl-h2">
            <MaskLines
              key={`c2-${lang}`}
              lines={
                lang === 'it'
                  ? ['Cratere Jezero,', 'fronte del delta occidentale.']
                  : ['Jezero crater,', 'western delta front.']
              }
              stepDelay={105}
            />
          </h3>
          <p className="cl-body-reveal">
            {lang === 'it'
              ? 'Dove Perseverance ha campionato antichi sedimenti lacustri. Scendiamo dall’orbita marziana su un modello altimetrico HiRISE e CTX da 1 km² del cono del delta.'
              : 'Where Perseverance cored ancient lake sediments. We dive from Martian orbit onto a crisp 1 km² HiRISE & CTX elevation terrain model of the delta fan.'}
          </p>
          <span className="cl-coords">
            <DecodeText
              text={
                lang === 'it'
                  ? '18.4555° N · 77.4055° E · Delta Occidentale di Jezero'
                  : '18.4555° N · 77.4055° E · Jezero Western Delta'
              }
              active={ready && chapter === 1}
              duration={620}
            />
          </span>
        </div>
      </section>

      <section className="cl-ch">
        <div className="cl-copy">
          <p className="cl-step">
            <DecodeText text={lang === 'it' ? '03 · Due Punti' : '03 · Two Points'} active={ready && chapter === 2} duration={440} />
          </p>
          <h3 className="cl-h2">
            <MaskLines
              key={`c3-${lang}`}
              lines={lang === 'it' ? ['Imposta partenza e', 'destinazione.'] : ['Drop start and', 'destination.']}
              stepDelay={105}
            />
          </h3>
          <p className="cl-body-reveal">
            {lang === 'it'
              ? 'Scegli un punto di partenza e una tappa scientifica sulla mappa HiRISE ad alta risoluzione o dai preset del rover: dati altimetrici USGS reali a 1 m.'
              : 'Pick a start outpost and science destination directly on the high-resolution HiRISE map or from rover presets. The surface beneath is real USGS 1 m elevation data, never a flat backdrop.'}
          </p>
        </div>
      </section>

      <section className="cl-ch">
        <div className="cl-copy">
          <p className="cl-step">
            <DecodeText text={lang === 'it' ? '04 · Ricerca A*' : '04 · A* Search'} active={ready && chapter === 3} duration={440} />
          </p>
          <h3 className="cl-h2">
            <MaskLines
              key={`c4-${lang}`}
              lines={lang === 'it' ? ['Guarda A* ragionare', 'in tempo reale.'] : ['Watch A* think', 'in real time.']}
              stepDelay={105}
            />
          </h3>
          <p className="cl-body-reveal">
            {lang === 'it'
              ? `Ogni riquadro ambra è una cella valutata dal solver${facts?.explored ? ` (${facts.explored.toLocaleString('it')} nodi)` : ''}. Le pareti oltre il limite della tuta EVA bloccano il passo e il corridoio ciano trova la via sicura.`
              : `Each amber cell is one the solver genuinely evaluated${facts?.explored ? ` (${facts.explored.toLocaleString('en')} nodes)` : ''}. Cliffs steeper than EVA suit limits act as walls, and the cyan route locks onto the lowest-cost safe corridor.`}
          </p>
        </div>
      </section>

      <section className="cl-ch">
        <div className="cl-copy cl-facts">
          <p className="cl-step">
            <DecodeText text={lang === 'it' ? '05 · Prove' : '05 · Evidence'} active={ready && chapter === 4} duration={440} />
          </p>
          <h3 className="cl-h2">
            <MaskLines
              key={`c5-${lang}`}
              lines={lang === 'it' ? ['Ogni percorso', 'si spiega da solo.'] : ['Every route', 'explains itself.']}
              stepDelay={105}
            />
          </h3>
          {facts ? (
            <dl>
              <div>
                <dt>{lang === 'it' ? 'Distanza' : 'Distance'}</dt>
                <dd>
                  <Count to={facts.distance} active={chapter >= 4} /> m
                </dd>
              </div>
              <div>
                <dt>{lang === 'it' ? 'Dislivello' : 'Climb'}</dt>
                <dd>
                  <Count to={facts.ascent} decimals={1} active={chapter >= 4} /> m
                </dd>
              </div>
              <div>
                <dt>{lang === 'it' ? 'Pendenza max' : 'Max slope'}</dt>
                <dd>
                  <Count to={facts.maxSlope} decimals={1} active={chapter >= 4} />°
                </dd>
              </div>
              {facts.dijkstra ? (
                <div>
                  <dt>A* vs Dijkstra</dt>
                  <dd>
                    <Count to={facts.explored} active={chapter >= 4} /> / {facts.dijkstra.toLocaleString(lang === 'it' ? 'it' : 'en')}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : (
            <p className="cl-body-reveal">
              {lang === 'it'
                ? 'Distanza, dislivello, pendenza massima e spiegazione A* animata con rapporto stampabile ed esportazione JSON.'
                : 'Distance, climb, peak slope, and animated A* reasoning with a printable briefing and JSON export.'}
            </p>
          )}
          <p className="cl-fine">
            {lang === 'it'
              ? 'Qui mostrato su rilievo CTX a 20 m (Enchanted Lake → Wildcat Ridge). Il pianificatore esegue lo stesso algoritmo su HiRISE a 1 m.'
              : 'Shown here on CTX 20 m elevation (Enchanted Lake → Wildcat Ridge). The planner runs the same engine at 1 m HiRISE resolution.'}
          </p>
        </div>
      </section>

      <section className="cl-ch cl-final">
        <div className="cl-copy">
          <p className="cl-step">
            <DecodeText text={lang === 'it' ? '06 · Cammina' : '06 · Walk It'} active={ready && chapter === 5} duration={440} />
          </p>
          <h3 className="cl-h2">
            <MaskLines
              key={`c6-${lang}`}
              lines={
                lang === 'it'
                  ? ['Pianifica sulla mappa,', 'o indossa il casco.']
                  : ['Plan on the map,', 'or put the helmet on.']
              }
              stepDelay={105}
            />
          </h3>
          <p className="cl-body-reveal">
            {lang === 'it'
              ? 'Scegli due punti sulla mappa interattiva di Jezero per vedere l’algoritmo A* animato passo dopo passo, poi percorri il sentiero in Marswalk VR.'
              : 'Pick two points on the interactive Jezero map to watch the A* pathfinder animate step by step, then walk your route in Marswalk VR.'}
          </p>
          <div className="cl-cta">
            <a
              className="cl-btn"
              href={plannerHref(lang)}
              onClick={goPlanner}
              data-testid="landing-map"
            >
              <strong className="cl-roll-clip">
                <span
                  className="cl-roll-text"
                  data-text={lang === 'it' ? 'Pianifica sulla mappa' : 'Plan on the map'}
                >
                  {lang === 'it' ? 'Pianifica sulla mappa' : 'Plan on the map'}
                </span>
              </strong>
              <span>
                {lang === 'it'
                  ? 'Mappa HiRISE interattiva · spiegazione A* animata'
                  : 'Interactive HiRISE map · animated A* explainer'}
              </span>
            </a>
            <a className="cl-btn cl-btn-light" href={stationHref(lang)} data-testid="landing-station">
              <strong className="cl-roll-clip">
                <span
                  className="cl-roll-text"
                  data-text={lang === 'it' ? 'Entra nella stazione' : 'Enter the station'}
                >
                  {lang === 'it' ? 'Entra nella stazione' : 'Enter the station'}
                </span>
              </strong>
              <span>
                {lang === 'it'
                  ? 'VR o PC · navigatore EVA · svolta per svolta'
                  : 'VR or PC · EVA navigator · turn-by-turn'}
              </span>
            </a>
          </div>
          <p className="cl-fine">
            {lang === 'it'
              ? 'Simulazione educativa, non valutazione di sicurezza. Dati: NASA/JPL-Caltech, USGS Astrogeology, University of Arizona.'
              : 'Educational simulation, not a safety assessment. Data: NASA/JPL-Caltech, USGS Astrogeology, University of Arizona.'}
          </p>
        </div>
      </section>
    </div>
  );
}
