/**
 * Non-blocking mission quick-start card.
 * Docked and expanded layouts stay in normal document flow: no backdrop,
 * no focus trap, and no fixed layer over the map or the mission controls.
 * Places come from the `pois` prop. Bundle copy (names, kinds, summaries)
 * is read through `getUnifiedPoisForBundle`, which does not import three.
 */
import { useId, useMemo, useState, type JSX } from 'react';
import {
  ROUTE_POLICIES,
  pointToCell,
  type GridBundle,
  type LocalPoint,
  type RoutePolicyId,
  type SourceRecord,
} from '../contracts';
import { getUnifiedPoisForBundle, type UnifiedPoi } from '../terrain3d/coordBridge';
import styles from './StartMenuModal.module.css';

/**
 * Region key named by the start-menu contract.
 * `src/contracts` does not export `RegionId`; bundle ids are strings.
 * This alias stays in the UI file so the shared contract is not edited here.
 */
export type RegionId = string;

export interface StartMenuLaunchPayload {
  regionId: RegionId;
  startPoint: LocalPoint;
  destinationPoint: LocalPoint;
  startLabel: string;
  destinationLabel: string;
  strictQuality: boolean;
  roundTrip: boolean;
  policies: RoutePolicyId[];
  launchMode: 'animate-then-3d' | 'planner-only' | 'enter-3d';
}

export interface StartMenuModalProps {
  /** 'docked' = compact in-flow card; 'expanded' = same card with the place summaries open. */
  displayMode: 'docked' | 'expanded';
  activeRegionId: RegionId;
  bundle: GridBundle | null;
  bundleLoading: boolean;
  pois: UnifiedPoi[];
  currentStart: LocalPoint | null;
  currentDestination: LocalPoint | null;
  soundEnabled: boolean;
  onExpand(): void;
  onCollapse(): void;
  onSwitchRegion(regionId: RegionId): void;
  onSelectEndpoints(start: LocalPoint, destination: LocalPoint, startLabel?: string, destLabel?: string): void;
  onLaunchMission(payload: StartMenuLaunchPayload): void;
  onToggleSound(): void;
}

interface Placed {
  id: string;
  position: LocalPoint;
}

interface ShownPoi extends Placed {
  manifestPoiId: string | null;
  name: string;
  shortLabel: string;
  kind: UnifiedPoi['kind'];
  summary: string;
}

interface PairChoice {
  pointA: string;
  pointB: string;
}

interface StoredChoice {
  key: string;
  choice: PairChoice;
}

/** One millimetre in the local metre frame. */
const MILLIMETRE_M = 0.001;

const TOO_FEW_PLACES = 'At least two places are required.';
const POINTS_MUST_DIFFER = 'The two points must differ.';
const CHOOSE_LISTED_PLACES = 'Choose two different listed places.';
const BUNDLE_LOADING = 'The region bundle is still loading.';
const BUNDLE_MISSING = 'No region bundle is loaded.';

function copyPoint(point: LocalPoint): LocalPoint {
  return { east_m: point.east_m, north_m: point.north_m };
}

function horizontalDistance(a: LocalPoint, b: LocalPoint): number {
  return Math.hypot(a.east_m - b.east_m, a.north_m - b.north_m);
}

function samePlace(a: Placed, b: Placed, bundle: GridBundle | null): boolean {
  if (a.id === b.id) return true;
  if (a.position.east_m === b.position.east_m && a.position.north_m === b.position.north_m) return true;
  if (!bundle) return false;
  const aCell = pointToCell(bundle.manifest.grid, a.position);
  const bCell = pointToCell(bundle.manifest.grid, b.position);
  return aCell !== null && bCell !== null && aCell.index === bCell.index;
}

function matchPoiId(point: LocalPoint, catalog: readonly Placed[], bundle: GridBundle | null): string | null {
  const exact = catalog.filter(
    (poi) => poi.position.east_m === point.east_m && poi.position.north_m === point.north_m,
  );
  if (exact.length > 1) return null;
  const exactOne = exact[0];
  if (exactOne) return exactOne.id;

  const near = catalog.filter((poi) => horizontalDistance(poi.position, point) <= MILLIMETRE_M);
  if (bundle) {
    const cell = pointToCell(bundle.manifest.grid, point);
    if (!cell) return null;
    const inCell = near.filter((poi) => {
      const poiCell = pointToCell(bundle.manifest.grid, poi.position);
      return poiCell !== null && poiCell.index === cell.index;
    });
    if (inCell.length !== 1) return null;
    return inCell[0]?.id ?? null;
  }
  if (near.length !== 1) return null;
  return near[0]?.id ?? null;
}

function hasDistinctPair(catalog: readonly Placed[], bundle: GridBundle | null): boolean {
  for (const left of catalog) {
    for (const right of catalog) {
      if (left.id === right.id) continue;
      if (!samePlace(left, right, bundle)) return true;
    }
  }
  return false;
}

function defaultPair(catalog: readonly ShownPoi[], bundle: GridBundle | null): { a: string | null; b: string | null } {
  const start = catalog.find((poi) => poi.kind === 'base' || poi.kind === 'outpost') ?? catalog[0];
  if (start === undefined) return { a: null, b: null };
  const different = catalog.filter((poi) => poi.id !== start.id && !samePlace(start, poi, bundle));
  const preferred = different.find((poi) => poi.kind === 'science' || poi.kind === 'sample-depot');
  const destination = preferred ?? different[0];
  return { a: start.id, b: destination === undefined ? null : destination.id };
}

function resolveSelection(
  catalog: readonly ShownPoi[],
  bundle: GridBundle | null,
  currentStart: LocalPoint | null,
  currentDestination: LocalPoint | null,
): PairChoice {
  const defaults = defaultPair(catalog, bundle);
  const pointA = currentStart === null ? (defaults.a ?? '') : (matchPoiId(currentStart, catalog, bundle) ?? '');
  const pointB = currentDestination === null
    ? (defaults.b ?? '')
    : (matchPoiId(currentDestination, catalog, bundle) ?? '');
  return { pointA, pointB };
}

function toShown(poi: UnifiedPoi, bundlePois: readonly UnifiedPoi[]): ShownPoi {
  const match = bundlePois.find((item) => item.id === poi.id);
  const source = match ?? poi;
  return {
    id: poi.id,
    manifestPoiId: poi.manifestPoiId,
    name: source.name,
    shortLabel: source.shortLabel,
    kind: source.kind,
    summary: source.summary,
    position: copyPoint(poi.position),
  };
}

function pointKey(point: LocalPoint | null): string {
  if (!point) return '';
  return `${point.east_m},${point.north_m}`;
}

function isFictionalScenarioBase(kind: UnifiedPoi['kind']): boolean {
  return kind === 'base' || kind === 'outpost';
}

function partitionSources(sources: readonly SourceRecord[]): { elevation: SourceRecord[]; rest: SourceRecord[] } {
  const primary = sources.filter((source) => /^\s*elevation\b/i.test(source.usedFor));
  const elevation = primary.length > 0
    ? primary
    : sources.filter((source) => /\belevation\b/i.test(source.usedFor));
  const elevationIds = new Set(elevation.map((source) => source.id));
  const rest = sources.filter((source) => !elevationIds.has(source.id));
  return { elevation, rest };
}

function explainBlock(
  bundleLoading: boolean,
  bundle: GridBundle | null,
  placeCount: number,
  catalog: readonly ShownPoi[],
  pointA: ShownPoi | undefined,
  pointB: ShownPoi | undefined,
): string | null {
  const messages: string[] = [];
  if (bundleLoading) messages.push(BUNDLE_LOADING);
  else if (bundle === null) messages.push(BUNDLE_MISSING);
  if (placeCount < 2) {
    messages.push(TOO_FEW_PLACES);
  } else if (!bundleLoading && bundle !== null) {
    if (!hasDistinctPair(catalog, bundle)) messages.push(POINTS_MUST_DIFFER);
    else if (pointA === undefined || pointB === undefined) messages.push(CHOOSE_LISTED_PLACES);
    else if (samePlace(pointA, pointB, bundle)) messages.push(POINTS_MUST_DIFFER);
  }
  return messages.length === 0 ? null : messages.join(' ');
}

function focusCalculateButton(): void {
  if (typeof document === 'undefined') return;
  const calculate = document.querySelector<HTMLElement>('[data-testid="calculate"]');
  calculate?.focus();
}

function BundleFacts({ bundle }: { bundle: GridBundle }) {
  const synthetic = bundle.manifest.synthetic === true;
  const { elevation, rest } = partitionSources(bundle.manifest.sources);
  const qualityNote = bundle.manifest.limitations.find((line) => /quality/i.test(line));

  return (
    <div className={styles.facts}>
      {synthetic ? (
        <p className={styles.badge} data-testid="start-menu-synthetic">[Synthetic Fixture]</p>
      ) : elevation.length > 0 ? (
        <ul className={styles.sources} aria-label="Elevation source">
          {elevation.map((source) => (
            <li key={source.id}>
              {source.creator}; instrument: {source.instrument}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.meta}>No elevation source is listed for this bundle.</p>
      )}
      {bundle.hashesVerified === false ? (
        <p className={styles.meta}>Terrain files were not hash-checked.</p>
      ) : null}
      {!synthetic && rest.length > 0 ? (
        <details className={styles.details}>
          <summary>Other sources</summary>
          <ul className={styles.sources}>
            {rest.map((source) => (
              <li key={source.id}>
                {source.creator}; instrument: {source.instrument}. {source.usedFor}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {qualityNote ? (
        <details className={styles.details}>
          <summary>Quality limitation</summary>
          <p className={styles.meta}>{qualityNote}</p>
        </details>
      ) : null}
    </div>
  );
}

export function StartMenuModal({
  displayMode,
  activeRegionId,
  bundle,
  bundleLoading,
  pois,
  currentStart,
  currentDestination,
  soundEnabled,
  onExpand,
  onCollapse,
  onSwitchRegion,
  onSelectEndpoints,
  onLaunchMission,
  onToggleSound,
}: StartMenuModalProps): JSX.Element {
  const headingId = useId();
  const pointAFieldId = useId();
  const pointBFieldId = useId();
  const regionFieldId = useId();
  const noticeId = useId();

  const bundlePois = useMemo(
    () => (bundle ? getUnifiedPoisForBundle(bundle) : []),
    [bundle],
  );
  const shownCatalog = useMemo(
    () => pois.map((poi) => toShown(poi, bundlePois)),
    [pois, bundlePois],
  );

  const propsKey = [
    activeRegionId,
    bundle?.bundleVersion ?? '',
    shownCatalog.map((poi) => poi.id).join('|'),
    pointKey(currentStart),
    pointKey(currentDestination),
  ].join('\u001f');

  const derived = resolveSelection(shownCatalog, bundle, currentStart, currentDestination);
  const [override, setOverride] = useState<StoredChoice | null>(null);
  const selected = override !== null && override.key === propsKey ? override.choice : derived;
  const pointA = shownCatalog.find((poi) => poi.id === selected.pointA);
  const pointB = shownCatalog.find((poi) => poi.id === selected.pointB);
  const reason = explainBlock(bundleLoading, bundle, pois.length, shownCatalog, pointA, pointB);
  const pairInvalid = reason !== null
    && (reason.includes(POINTS_MUST_DIFFER) || reason.includes(CHOOSE_LISTED_PLACES));
  const selectsDisabled = bundleLoading || bundle === null || pois.length === 0;
  const regionIds = bundle !== null && bundle.manifest.bundleId !== activeRegionId
    ? [activeRegionId, bundle.manifest.bundleId]
    : [activeRegionId];

  function publish(next: PairChoice): void {
    setOverride({ key: propsKey, choice: next });
    const start = shownCatalog.find((poi) => poi.id === next.pointA);
    const destination = shownCatalog.find((poi) => poi.id === next.pointB);
    if (!start || !destination) return;
    onSelectEndpoints(copyPoint(start.position), copyPoint(destination.position), start.shortLabel, destination.shortLabel);
  }

  function launch(launchMode: StartMenuLaunchPayload['launchMode']): void {
    if (reason !== null || bundle === null || pointA === undefined || pointB === undefined) return;
    const startPoint = copyPoint(pointA.position);
    const destinationPoint = copyPoint(pointB.position);
    onSelectEndpoints(startPoint, destinationPoint, pointA.shortLabel, pointB.shortLabel);
    const policies: RoutePolicyId[] = [...ROUTE_POLICIES];
    const payload: StartMenuLaunchPayload = {
      regionId: activeRegionId,
      startPoint,
      destinationPoint,
      startLabel: pointA.shortLabel,
      destinationLabel: pointB.shortLabel,
      strictQuality: false,
      roundTrip: false,
      policies,
      launchMode,
    };
    onLaunchMission(payload);
  }

  function collapse(): void {
    onCollapse();
    focusCalculateButton();
  }

  const rootClass = displayMode === 'expanded'
    ? `${styles.root} ${styles.expanded}`
    : `${styles.root} ${styles.docked}`;
  const briefingOpen = displayMode === 'expanded';
  const muteLabel = soundEnabled ? 'Mute sound' : 'Unmute sound';

  return (
    <section
      className={rootClass}
      data-testid="start-menu"
      data-mode={displayMode}
      aria-labelledby={headingId}
    >
      <h2 id={headingId} className={styles.heading}>Mission quick start</h2>
      <p className={styles.disclaimer}>
        Educational simulation. The outpost is fictional. This is not a safety assessment or an operational rover tool.
      </p>

      {!bundleLoading && bundle !== null ? <BundleFacts bundle={bundle} /> : null}

      <label className={styles.field} htmlFor={regionFieldId}>
        <span>Region</span>
        <select
          id={regionFieldId}
          data-testid="start-menu-region"
          value={activeRegionId}
          onChange={(event) => {
            const nextRegion = event.target.value;
            if (nextRegion !== activeRegionId) onSwitchRegion(nextRegion);
          }}
        >
          {regionIds.map((id) => (
            <option key={id} value={id}>{id}</option>
          ))}
        </select>
      </label>

      <div className={styles.pair}>
        <label className={styles.field} htmlFor={pointAFieldId} data-testid="start-menu-point-a">
          <span>Point A</span>
          <select
            id={pointAFieldId}
            data-testid="start-menu-preset-a"
            value={selected.pointA}
            disabled={selectsDisabled}
            aria-invalid={pairInvalid ? true : undefined}
            aria-describedby={reason !== null ? noticeId : undefined}
            onChange={(event) => publish({ pointA: event.target.value, pointB: selected.pointB })}
          >
            {selected.pointA === '' ? (
              <option value="">{shownCatalog.length === 0 ? 'No places loaded' : 'Unmatched custom point'}</option>
            ) : null}
            {shownCatalog.map((poi) => (
              <option key={poi.id} value={poi.id}>{poi.shortLabel}</option>
            ))}
          </select>
        </label>
        <label className={styles.field} htmlFor={pointBFieldId} data-testid="start-menu-point-b">
          <span>Point B</span>
          <select
            id={pointBFieldId}
            data-testid="start-menu-preset-b"
            value={selected.pointB}
            disabled={selectsDisabled}
            aria-invalid={pairInvalid ? true : undefined}
            aria-describedby={reason !== null ? noticeId : undefined}
            onChange={(event) => publish({ pointA: selected.pointA, pointB: event.target.value })}
          >
            {selected.pointB === '' ? (
              <option value="">{shownCatalog.length === 0 ? 'No places loaded' : 'Unmatched custom point'}</option>
            ) : null}
            {shownCatalog.map((poi) => (
              <option key={poi.id} value={poi.id}>{poi.shortLabel}</option>
            ))}
          </select>
        </label>
      </div>

      {pointA && pointB ? (
        <p className={styles.pairLine}>{pointA.shortLabel} to {pointB.shortLabel}.</p>
      ) : null}
      {pointA && isFictionalScenarioBase(pointA.kind) ? (
        <p className={styles.meta}>{pointA.shortLabel} is a fictional scenario base.</p>
      ) : null}
      {displayMode === 'expanded' && pointA && pointB ? (
        <div className={styles.summaries}>
          <p>Point A, {pointA.name}. {pointA.summary}</p>
          <p>Point B, {pointB.name}. {pointB.summary}</p>
        </div>
      ) : null}

      {reason !== null ? (
        <p id={noticeId} className={styles.notice} role="status" data-testid="start-menu-notice">
          {reason}
          {reason.includes(TOO_FEW_PLACES) && bundlePois.length >= 2
            ? ` The loaded bundle lists ${bundlePois.length} places. This menu was given ${pois.length}.`
            : ''}
        </p>
      ) : (
        <p className={styles.meta}>Strict quality stays off for this launch, and the round trip stays off.</p>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.button} ${styles.primary}`}
          data-testid="start-menu-launch"
          disabled={reason !== null}
          onClick={() => launch('animate-then-3d')}
        >
          Plan route and animate search
        </button>
        <button
          type="button"
          className={styles.button}
          data-testid="start-menu-plan"
          disabled={reason !== null}
          onClick={() => launch('planner-only')}
        >
          Plan route only
        </button>
        <button
          type="button"
          className={styles.button}
          data-testid="start-menu-enter-3d"
          disabled={reason !== null}
          onClick={() => launch('enter-3d')}
        >
          Open 3D view
        </button>
        <button
          type="button"
          className={styles.button}
          data-testid="start-menu-dismiss"
          onClick={collapse}
        >
          Hide
        </button>
        <button
          type="button"
          className={styles.button}
          data-testid="start-menu-mute"
          aria-pressed={!soundEnabled}
          aria-label={muteLabel}
          data-sound-enabled={soundEnabled ? 'true' : 'false'}
          onClick={onToggleSound}
        >
          {muteLabel}
        </button>
        <button
          type="button"
          className={styles.button}
          data-testid="start-menu-expand"
          aria-expanded={briefingOpen}
          onClick={briefingOpen ? onCollapse : onExpand}
        >
          {briefingOpen ? 'Full briefing open' : 'Open full briefing'}
        </button>
      </div>
    </section>
  );
}
