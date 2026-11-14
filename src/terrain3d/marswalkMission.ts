/**
 * Educational route progress for one walker.
 *
 * Progress follows the outbound polyline, then the return polyline only when a
 * round trip has a non-empty return leg. Tobler time is walking time from
 * accepted horizontal displacement. It is not a survival clock.
 */
import type { GridBundle, LocalPoint, LocalPoint3 } from '../contracts';
import { pointToCell } from '../contracts';
import type { DottedProximityHit, SceneOrigin, UnifiedPoi } from './coordBridge';
import { consumePlayerGateStep, readPlayerGateStep } from './marswalkPlayer';
import {
  DEFAULT_MAX_SLOPE_DEG,
  checkArrivalAtDestination,
  checkCorridorSafety,
  defaultArrivalRadiusForGrid,
  defaultCorridorThresholdForGrid,
  findClosestRejectedPath,
  findNearestPointOnPath,
  sceneXYZToLocal,
} from './coordBridge';
import type { MarswalkPoisHandle, MarswalkTerrainHandle } from './marswalkTypes';

const DEFAULT_POI_RADIUS_M = 9;
const MIN_SAMPLE_M = 0.05;
const MAX_WALK_GRADE = 1.5;

const EMPTY_REJECTED: readonly MarswalkRejectedPath[] = [];

export interface MarswalkRejectedPath {
  readonly id: string;
  readonly label: string;
  readonly reason: string;
  readonly path: readonly LocalPoint3[];
}

export type MarswalkReturnLegState = 'absent' | 'unavailable' | 'active' | 'complete';
export type MarswalkMissionLeg = 'outbound' | 'return';

export interface MarswalkNearbyPoi {
  readonly poi: UnifiedPoi;
  readonly distance_m: number;
}

export interface MarswalkMissionSnapshot {
  readonly progress: number;
  readonly outboundProgress: number;
  readonly returnProgress: number | null;
  readonly leg: MarswalkMissionLeg;
  readonly returnLegState: MarswalkReturnLegState;
  readonly arrivedAtDestination: boolean;
  readonly complete: boolean;
  readonly roundTrip: boolean;
  readonly distanceToDestination_m: number | null;
  readonly nearbyRejected: DottedProximityHit | null;
  readonly nearbyPoi: MarswalkNearbyPoi | null;
  readonly visitedIds: readonly string[];
  readonly travelSeconds: number;
  /** False when accepted distance has no Tobler time, so `travelSeconds` is not a full total. */
  readonly travelTimeComplete: boolean;
  /** Accepted metres omitted from `travelSeconds` because grade was unavailable. */
  readonly untimedDistance_m: number;
  readonly remainingSeconds: number | null;
  /** True when `remainingSeconds` applies the current cell grade to the whole remainder. */
  readonly remainingUsesCurrentGrade: boolean;
  /** True when `remainingSeconds` includes the return polyline. */
  readonly remainingCoversReturn: boolean;
  readonly distanceWalked_m: number;
  readonly slope_deg: number | null;
  readonly east_m: number | null;
  readonly north_m: number | null;
  readonly elevation_m: number | null;
  /** Walking-time model. Stops are not included. */
  readonly travelTimeBasis: 'Tobler hiking function, no stops';
}

export type MaybeGetter<T> = T | (() => T);

export interface MarswalkMissionOptions {
  bundle: MaybeGetter<GridBundle>;
  origin: MaybeGetter<SceneOrigin>;
  outboundPath: MaybeGetter<readonly LocalPoint3[]>;
  returnLeg?: MaybeGetter<readonly LocalPoint3[] | null>;
  roundTrip?: MaybeGetter<boolean>;
  destination?: MaybeGetter<LocalPoint | null>;
  start?: MaybeGetter<LocalPoint | null>;
  rejectedPaths?: MaybeGetter<readonly MarswalkRejectedPath[]>;
  poisHandle?: MaybeGetter<MarswalkPoisHandle | null>;
  terrain?: MaybeGetter<MarswalkTerrainHandle | null>;
  /** Active route cells. Required for mission gating; an absent list is not treated as an empty waiver set. */
  activePathCells?: MaybeGetter<readonly number[] | ReadonlySet<number>>;
  selectedCandidateId?: MaybeGetter<string | null>;
  /** Visit radius passed to `findNearestPoi`. Defaults to 9 m. */
  poiRadius_m?: number;
}

/**
 * A step the corridor gate already accepted.
 * `update` does not treat a bare pose change as walking.
 */
export interface MarswalkAcceptedStep {
  /** Horizontal metres the gate allowed for this pose change. */
  horizontal_m: number;
  /** Local east of the gated pose, copied from the player gate record. */
  east_m: number;
  /** Local north of the gated pose, copied from the player gate record. */
  north_m: number;
  /** Rise/run for that accepted step. Omit to sample terrain between the previous pose and this one. */
  grade?: number | null;
}

export interface MarswalkMissionHandle {
  update(
    sceneX: number,
    sceneZ: number,
    acceptedStep?: MarswalkAcceptedStep | null,
  ): MarswalkMissionSnapshot;
  resetMission(): void;
  getSnapshot(): MarswalkMissionSnapshot;
  estimateTravelSeconds(distance_m: number, grade: number): number | null;
}

function readValue<T>(value: T | (() => T)): T {
  if (typeof value === 'function') return (value as () => T)();
  return value;
}

/** Tobler walking speed in km/h. `grade` is rise/run, not degrees. */
export function toblerSpeedKmh(grade: number): number | null {
  if (!Number.isFinite(grade)) return null;
  const speed = 6 * Math.exp(-3.5 * Math.abs(grade + 0.05));
  if (!Number.isFinite(speed) || speed <= 1e-6) return null;
  return speed;
}

/** Seconds to walk `distance_m` at the Tobler speed for `grade`, or null when that estimate is undefined. */
export function estimateTravelSeconds(distance_m: number, grade: number): number | null {
  if (!Number.isFinite(distance_m) || distance_m < 0) return null;
  if (distance_m === 0) return 0;
  const kmh = toblerSpeedKmh(grade);
  if (kmh === null) return null;
  const metresPerSecond = kmh / 3.6;
  if (!Number.isFinite(metresPerSecond) || metresPerSecond <= 0) return null;
  const seconds = distance_m / metresPerSecond;
  return Number.isFinite(seconds) ? seconds : null;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function polylineLength(path: readonly LocalPoint3[]): number {
  let total = 0;
  for (let i = 0; i < path.length - 1; i += 1) {
    const start = path[i];
    const end = path[i + 1];
    if (!start || !end) continue;
    if (
      !Number.isFinite(start.east_m) ||
      !Number.isFinite(start.north_m) ||
      !Number.isFinite(end.east_m) ||
      !Number.isFinite(end.north_m)
    ) {
      continue;
    }
    total += Math.hypot(end.east_m - start.east_m, end.north_m - start.north_m);
  }
  return total;
}

function progressAlong(position: LocalPoint, path: readonly LocalPoint3[]): number {
  if (path.length === 0) return 0;
  const sample = findNearestPointOnPath(position, path);
  if (!sample || !Number.isFinite(sample.progressFraction)) return 0;
  return clamp01(sample.progressFraction);
}

function gradeFromSlopeDeg(slopeDeg: number): number | null {
  if (!Number.isFinite(slopeDeg)) return null;
  const grade = Math.tan((slopeDeg * Math.PI) / 180);
  return Number.isFinite(grade) ? grade : null;
}

function copyHit(hit: DottedProximityHit | null): DottedProximityHit | null {
  if (!hit) return null;
  return {
    rejectedId: hit.rejectedId,
    label: hit.label,
    reason: hit.reason,
    distance_m: hit.distance_m,
    closestPoint: {
      east_m: hit.closestPoint.east_m,
      north_m: hit.closestPoint.north_m,
      elevation_m: hit.closestPoint.elevation_m,
    },
  };
}

function poseAdmissible(
  bundle: GridBundle,
  origin: SceneOrigin,
  terrain: MarswalkTerrainHandle | null,
  path: readonly LocalPoint3[],
  cells: readonly number[] | ReadonlySet<number>,
  sceneX: number,
  sceneZ: number,
): boolean {
  if (!terrain) return false;
  const position = horizontalPosition(sceneX, sceneZ, origin);
  if (!position) return false;
  const height = terrain.heightAtSceneXZ(sceneX, sceneZ);
  if (!Number.isFinite(height)) return false;
  const grid = bundle.manifest.grid;
  if (pointToCell(grid, position) === null) {
    const slope = terrain.slopeDegAtSceneXZ(sceneX, sceneZ);
    if (!Number.isFinite(slope) || slope > DEFAULT_MAX_SLOPE_DEG) return false;
  }
  const safety = checkCorridorSafety(position, bundle, cells, path, {
    maxCorridorDeviation_m: defaultCorridorThresholdForGrid(grid),
    maxSlope_deg: DEFAULT_MAX_SLOPE_DEG,
  });
  return !safety.isOffPath;
}

function segmentAdmissible(
  bundle: GridBundle,
  origin: SceneOrigin,
  terrain: MarswalkTerrainHandle | null,
  path: readonly LocalPoint3[],
  cells: readonly number[] | ReadonlySet<number>,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
): boolean {
  const dx = Number.isFinite(bundle.manifest.grid.cellSizeEast_m) ? bundle.manifest.grid.cellSizeEast_m : 1;
  const dz = Number.isFinite(bundle.manifest.grid.cellSizeNorth_m) ? bundle.manifest.grid.cellSizeNorth_m : 1;
  const substep = Math.min(0.35, Math.max(0.2, Math.min(dx, dz) * 0.45));
  const distance = Math.hypot(x1 - x0, z1 - z0);
  const steps = Math.max(1, Math.ceil(distance / substep));
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const z = z0 + (z1 - z0) * t;
    if (!poseAdmissible(bundle, origin, terrain, path, cells, x, z)) return false;
  }
  return true;
}

function horizontalPosition(
  sceneX: number,
  sceneZ: number,
  origin: SceneOrigin,
): { east_m: number; north_m: number } | null {
  if (!Number.isFinite(sceneX) || !Number.isFinite(sceneZ)) return null;
  try {
    const local = sceneXYZToLocal({ x: sceneX, y: 0, z: sceneZ }, origin, 1);
    return { east_m: local.east_m, north_m: local.north_m };
  } catch (err) {
    if (err instanceof RangeError) return null;
    throw err;
  }
}

export function createMarswalkMission(options: MarswalkMissionOptions): MarswalkMissionHandle {
  const visited = new Set<string>();
  let leg: MarswalkMissionLeg = 'outbound';
  let outboundProgress = 0;
  let returnProgress = 0;
  let arrived = false;
  let returnComplete = false;
  let travelSeconds = 0;
  let travelTimeComplete = true;
  let untimedDistance = 0;
  let distanceWalked = 0;
  let lastSceneX: number | null = null;
  let lastSceneZ: number | null = null;
  let trustedPose: { east_m: number; north_m: number } | null = null;
  let trustedSceneX: number | null = null;
  let trustedSceneZ: number | null = null;
  let lastBundleVersion: string | null = null;
  let missionTrusted = false;
  let trustedDistance: number | null = null;
  let sawCandidate = false;
  let lastCandidate: string | null = null;
  let nearbyRejected: DottedProximityHit | null = null;
  let nearbyPoi: MarswalkNearbyPoi | null = null;
  let snapshot = emptySnapshot();

  function poiRadius(): number {
    const radius = options.poiRadius_m;
    if (radius === undefined || !Number.isFinite(radius) || radius < 0) return DEFAULT_POI_RADIUS_M;
    return radius;
  }

  function readBundle(): GridBundle {
    return readValue(options.bundle);
  }

  function readOrigin(): SceneOrigin {
    return readValue(options.origin);
  }

  function readOutbound(): readonly LocalPoint3[] {
    const path = readValue(options.outboundPath);
    return Array.isArray(path) ? path : [];
  }

  function readReturn(): readonly LocalPoint3[] | null {
    if (options.returnLeg === undefined) return null;
    const path = readValue(options.returnLeg);
    if (!path || path.length === 0) return null;
    return path;
  }

  function readRoundTrip(): boolean {
    if (options.roundTrip === undefined) return false;
    return readValue(options.roundTrip) === true;
  }

  function readPoint(value: MaybeGetter<LocalPoint | null> | undefined): LocalPoint | null {
    if (value === undefined) return null;
    const point = readValue(value);
    if (!point || !Number.isFinite(point.east_m) || !Number.isFinite(point.north_m)) return null;
    return point;
  }

  function readCells(): readonly number[] | ReadonlySet<number> | null {
    if (options.activePathCells === undefined) return null;
    const cells = readValue(options.activePathCells);
    if (Array.isArray(cells) || cells instanceof Set) return cells;
    return null;
  }

  function readRejected(): readonly MarswalkRejectedPath[] {
    if (options.rejectedPaths === undefined) return EMPTY_REJECTED;
    const paths = readValue(options.rejectedPaths);
    return Array.isArray(paths) ? paths : EMPTY_REJECTED;
  }

  function readPois(): MarswalkPoisHandle | null {
    if (options.poisHandle === undefined || options.poisHandle === null) return null;
    const handle = readValue(options.poisHandle);
    if (!handle || typeof handle.findNearestPoi !== 'function') return null;
    return handle;
  }

  function readTerrain(): MarswalkTerrainHandle | null {
    if (options.terrain === undefined || options.terrain === null) return null;
    const terrain = readValue(options.terrain);
    if (!terrain || typeof terrain.heightAtSceneXZ !== 'function') return null;
    return terrain;
  }

  function resetRouteProgress(): void {
    leg = 'outbound';
    outboundProgress = 0;
    returnProgress = 0;
    arrived = false;
    returnComplete = false;
    missionTrusted = false;
    trustedDistance = null;
  }

  function noteCandidate(changedBundle: boolean): void {
    if (options.selectedCandidateId === undefined) return;
    const id = readValue(options.selectedCandidateId) ?? null;
    if (!sawCandidate) {
      sawCandidate = true;
      lastCandidate = id;
      return;
    }
    if (id === lastCandidate) return;
    lastCandidate = id;
    if (!changedBundle) resetRouteProgress();
  }

  function gradeForStep(
    terrain: MarswalkTerrainHandle | null,
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    horizontal: number,
  ): number | null {
    if (!terrain || horizontal <= 1e-4) return null;
    const y0 = terrain.heightAtSceneXZ(x0, z0);
    const y1 = terrain.heightAtSceneXZ(x1, z1);
    const exaggeration = terrain.verticalExaggeration;
    if (Number.isFinite(y0) && Number.isFinite(y1) && Number.isFinite(exaggeration) && exaggeration !== 0) {
      const grade = (y1 - y0) / exaggeration / horizontal;
      if (Number.isFinite(grade) && Math.abs(grade) <= MAX_WALK_GRADE) return grade;
    }
    return gradeFromSlopeDeg(terrain.slopeDegAtSceneXZ(x1, z1));
  }

  function physicalSample(
    terrain: MarswalkTerrainHandle | null,
    origin: SceneOrigin,
    sceneX: number,
    sceneZ: number,
  ): { elevation_m: number | null; slope_deg: number | null } {
    if (!terrain) return { elevation_m: null, slope_deg: null };
    const sceneY = terrain.heightAtSceneXZ(sceneX, sceneZ);
    const slope = terrain.slopeDegAtSceneXZ(sceneX, sceneZ);
    const exaggeration = terrain.verticalExaggeration;
    const elevation =
      Number.isFinite(sceneY) &&
      Number.isFinite(exaggeration) &&
      exaggeration !== 0 &&
      Number.isFinite(origin.elevation_m)
        ? origin.elevation_m + sceneY / exaggeration
        : null;
    return {
      elevation_m: elevation,
      slope_deg: Number.isFinite(slope) ? slope : null,
    };
  }

  function publish(
    origin: SceneOrigin,
    position: { east_m: number; north_m: number } | null,
    sceneX: number,
    sceneZ: number,
    distanceToDestination_m: number | null,
  ): MarswalkMissionSnapshot {
    const roundTrip = readRoundTrip();
    const returnPath = readReturn();
    const returnUsable = roundTrip && returnPath !== null && returnPath.length > 0;
    let returnLegState: MarswalkReturnLegState;
    if (!roundTrip) returnLegState = 'absent';
    else if (!returnUsable) returnLegState = 'unavailable';
    else if (returnComplete) returnLegState = 'complete';
    else returnLegState = 'active';

    const complete =
      returnLegState === 'unavailable'
        ? false
        : returnComplete || (!roundTrip && arrived);

    const terrain = readTerrain();
    const sample = Number.isFinite(sceneX) && Number.isFinite(sceneZ)
      ? physicalSample(terrain, origin, sceneX, sceneZ)
      : { elevation_m: null, slope_deg: null };

    const outbound = readOutbound();
    const outboundRemain = polylineLength(outbound) * (1 - clamp01(outboundProgress));
    let remainingDistance: number | null = null;
    let remainingCoversReturn = false;
    if (complete) {
      remainingDistance = 0;
    } else if (outbound.length === 0) {
      remainingDistance = null;
    } else if (!roundTrip || returnLegState === 'absent') {
      remainingDistance = outboundRemain;
    } else if (returnLegState === 'unavailable') {
      remainingDistance = arrived ? null : outboundRemain;
    } else if (returnPath) {
      const returnRemain = polylineLength(returnPath) * (1 - clamp01(returnProgress));
      if (leg === 'return') {
        remainingDistance = returnRemain;
        remainingCoversReturn = true;
      } else {
        remainingDistance = outboundRemain + polylineLength(returnPath);
        remainingCoversReturn = true;
      }
    }

    const grade = sample.slope_deg === null ? null : gradeFromSlopeDeg(sample.slope_deg);
    const remainingSeconds =
      remainingDistance === null || (remainingDistance > 0 && grade === null)
        ? null
        : estimateTravelSeconds(remainingDistance, grade ?? 0);
    const progress = leg === 'return' ? returnProgress : outboundProgress;

    snapshot = {
      progress,
      outboundProgress,
      returnProgress: returnUsable || returnComplete ? returnProgress : null,
      leg,
      returnLegState,
      arrivedAtDestination: arrived,
      complete,
      roundTrip,
      distanceToDestination_m,
      nearbyRejected,
      nearbyPoi,
      visitedIds: [...visited],
      travelSeconds,
      travelTimeComplete,
      untimedDistance_m: untimedDistance,
      remainingSeconds,
      remainingUsesCurrentGrade: remainingSeconds !== null && remainingDistance !== 0,
      remainingCoversReturn,
      distanceWalked_m: distanceWalked,
      slope_deg: sample.slope_deg,
      east_m: position ? position.east_m : null,
      north_m: position ? position.north_m : null,
      elevation_m: sample.elevation_m,
      travelTimeBasis: 'Tobler hiking function, no stops',
    };
    return snapshot;
  }

  function update(
    sceneX: number,
    sceneZ: number,
    acceptedStep?: MarswalkAcceptedStep | null,
  ): MarswalkMissionSnapshot {
    const bundle = readBundle();
    const origin = readOrigin();
    const bundleChanged = lastBundleVersion !== null && bundle.bundleVersion !== lastBundleVersion;
    lastBundleVersion = bundle.bundleVersion;
    if (bundleChanged) {
      visited.clear();
      resetRouteProgress();
      lastSceneX = null;
      lastSceneZ = null;
      trustedPose = null;
      trustedSceneX = null;
      trustedSceneZ = null;
      nearbyRejected = null;
      nearbyPoi = null;
    }
    noteCandidate(bundleChanged);

    const position = horizontalPosition(sceneX, sceneZ, origin);
    if (!position) return publish(origin, null, sceneX, sceneZ, null);

    const terrain = readTerrain();
    const grid = bundle.manifest.grid;
    const cellEast = Number.isFinite(grid.cellSizeEast_m) && grid.cellSizeEast_m > 0 ? grid.cellSizeEast_m : 1;
    const cellNorth = Number.isFinite(grid.cellSizeNorth_m) && grid.cellSizeNorth_m > 0 ? grid.cellSizeNorth_m : 1;
    const maxStep_m = 32 * Math.max(0.25, Math.min(cellEast, cellNorth) * 0.45);
    const sceneDelta =
      lastSceneX !== null && lastSceneZ !== null
        ? Math.hypot(sceneX - lastSceneX, sceneZ - lastSceneZ)
        : null;
    const returnPathNow = readReturn();
    const outboundNow = readOutbound();
    const legPath = leg === 'return' && returnPathNow ? returnPathNow : outboundNow;
    const routeCells = readCells();
    const gateRecord = acceptedStep ? readPlayerGateStep(acceptedStep) : null;
    if (gateRecord !== null) consumePlayerGateStep(acceptedStep);
    const claimed = gateRecord?.horizontal_m;
    const claimAgrees =
      claimed !== undefined &&
      Number.isFinite(claimed) &&
      sceneDelta !== null &&
      Math.abs(sceneDelta - claimed) <= Math.max(0.25, Math.abs(claimed) * 0.05);
    const segmentOk =
      gateRecord !== null &&
      Math.hypot(gateRecord.east_m - position.east_m, gateRecord.north_m - position.north_m) <= 0.05 &&
      lastSceneX !== null &&
      lastSceneZ !== null &&
      Math.hypot(
        gateRecord.from_east_m - (lastSceneX + origin.east_m),
        gateRecord.from_north_m - (origin.north_m - lastSceneZ),
      ) <= 0.05 &&
      claimAgrees &&
      lastSceneX !== null &&
      lastSceneZ !== null &&
      sceneDelta !== null &&
      sceneDelta >= MIN_SAMPLE_M &&
      sceneDelta <= maxStep_m &&
      routeCells !== null &&
      segmentAdmissible(
        bundle,
        origin,
        terrain,
        legPath,
        routeCells,
        lastSceneX,
        lastSceneZ,
        sceneX,
        sceneZ,
      );
    const idleLegal =
      sceneDelta !== null &&
      sceneDelta < MIN_SAMPLE_M &&
      missionTrusted &&
      routeCells !== null &&
      poseAdmissible(bundle, origin, terrain, legPath, routeCells, sceneX, sceneZ);

    if (segmentOk && lastSceneX !== null && lastSceneZ !== null && sceneDelta !== null) {
      missionTrusted = true;
      distanceWalked += sceneDelta;
      const grade = gradeForStep(terrain, lastSceneX, lastSceneZ, sceneX, sceneZ, sceneDelta);
      const seconds = grade === null ? null : estimateTravelSeconds(sceneDelta, grade);
      if (seconds === null) {
        travelTimeComplete = false;
        untimedDistance += sceneDelta;
      } else {
        travelSeconds += seconds;
      }
      lastSceneX = sceneX;
      lastSceneZ = sceneZ;
      consumePlayerGateStep(acceptedStep);
    } else if (sceneDelta !== null && sceneDelta >= MIN_SAMPLE_M) {
      missionTrusted = false;
      nearbyRejected = null;
      nearbyPoi = null;
    } else if (lastSceneX === null || lastSceneZ === null) {
      lastSceneX = sceneX;
      lastSceneZ = sceneZ;
    }

    const roundTrip = readRoundTrip();
    const returnPath = readReturn();
    const returnUsable = roundTrip && returnPath !== null;
    const outbound = readOutbound();
    if (!returnUsable && leg === 'return') {
      leg = 'outbound';
      returnComplete = false;
    }

    const refreshMission = segmentOk || idleLegal;
    let distanceToDestination: number | null = trustedDistance;
    if (refreshMission) {
      if (leg === 'outbound') outboundProgress = progressAlong(position, outbound);
      else if (returnPath) returnProgress = progressAlong(position, returnPath);

      const destination = readPoint(options.destination);
      if (destination) {
        const status = checkArrivalAtDestination(
          position,
          destination,
          defaultArrivalRadiusForGrid(grid),
        );
        distanceToDestination = Number.isFinite(status.distanceToDestination_m)
          ? status.distanceToDestination_m
          : null;
        trustedDistance = distanceToDestination;
        if (leg === 'outbound' && status.arrived) arrived = true;
      }

      let switchedThisUpdate = false;
      if (arrived && returnUsable && returnPath && leg === 'outbound') {
        leg = 'return';
        returnProgress = progressAlong(position, returnPath);
        switchedThisUpdate = true;
      }

      if (leg === 'return' && returnPath && !switchedThisUpdate) {
        const start = readPoint(options.start);
        if (start) {
          const back = checkArrivalAtDestination(position, start, defaultArrivalRadiusForGrid(grid));
          if (back.arrived) {
            returnComplete = true;
            returnProgress = 1;
          }
        }
      }

      const rejected = findClosestRejectedPath(
        position,
        readRejected(),
        defaultCorridorThresholdForGrid(grid),
      );
      nearbyRejected = copyHit(rejected);

      const pois = readPois();
      const radius = poiRadius();
      if (pois) {
        let hit: { poi: UnifiedPoi; distance_m: number } | null;
        try {
          hit = pois.findNearestPoi(sceneX, sceneZ, radius);
        } catch {
          // A disposed POI handle must not break mission updates.
          hit = null;
        }
        if (hit && Number.isFinite(hit.distance_m) && hit.distance_m <= radius && hit.poi.id.length > 0) {
          nearbyPoi = { poi: hit.poi, distance_m: hit.distance_m };
          visited.add(hit.poi.id);
        } else {
          nearbyPoi = null;
        }
      } else {
        nearbyPoi = null;
      }
    }

    if (refreshMission) {
      trustedPose = { east_m: position.east_m, north_m: position.north_m };
      trustedSceneX = sceneX;
      trustedSceneZ = sceneZ;
    }
    const shown = refreshMission ? position : trustedPose;
    const sampleX = refreshMission ? sceneX : (trustedSceneX ?? Number.NaN);
    const sampleZ = refreshMission ? sceneZ : (trustedSceneZ ?? Number.NaN);
    return publish(origin, shown, sampleX, sampleZ, distanceToDestination);
  }

  function resetMission(): void {
    resetRouteProgress();
    visited.clear();
    travelSeconds = 0;
    travelTimeComplete = true;
    untimedDistance = 0;
    distanceWalked = 0;
    lastSceneX = null;
    lastSceneZ = null;
    trustedPose = null;
    trustedSceneX = null;
    trustedSceneZ = null;
    nearbyRejected = null;
    nearbyPoi = null;
    snapshot = emptySnapshot();
  }

  snapshot = emptySnapshot();

  return {
    update,
    resetMission,
    getSnapshot: () => snapshot,
    estimateTravelSeconds,
  };
}

function emptySnapshot(): MarswalkMissionSnapshot {
  return {
    progress: 0,
    outboundProgress: 0,
    returnProgress: null,
    leg: 'outbound',
    returnLegState: 'absent',
    arrivedAtDestination: false,
    complete: false,
    roundTrip: false,
    distanceToDestination_m: null,
    nearbyRejected: null,
    nearbyPoi: null,
    visitedIds: [],
    travelSeconds: 0,
    travelTimeComplete: true,
    untimedDistance_m: 0,
    remainingSeconds: null,
    remainingUsesCurrentGrade: false,
    remainingCoversReturn: false,
    distanceWalked_m: 0,
    slope_deg: null,
    east_m: null,
    north_m: null,
    elevation_m: null,
    travelTimeBasis: 'Tobler hiking function, no stops',
  };
}
