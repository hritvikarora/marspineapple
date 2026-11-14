/**
 * Walk / orbit rig for the educational Mars terrain view.
 *
 * Feet sit on `heightAtSceneXZ`. The eye is a fixed local offset. Movement is
 * refused before the rig translates. Inside the bundle, `checkCorridorSafety`
 * is the only slope, exclusion, and corridor test.
 */
import * as THREE from 'three';
import type { GridBundle, LocalPoint3 } from '../contracts';
import { pointToCell } from '../contracts';
import type { CorridorCheckResult, CorridorOffPathReason, SceneOrigin } from './coordBridge';
import {
  DEFAULT_MAX_SLOPE_DEG,
  checkCorridorSafety,
  defaultCorridorThresholdForGrid,
  findNearestPointOnPath,
  localToSceneXYZ,
  sceneXYZToLocal,
} from './coordBridge';
import type { MarswalkTerrainHandle } from './marswalkTypes';
import type { MarswalkAcceptedStep } from './marswalkMission';

/** Eye height above the feet, in the rig's local frame (metres). */
export const MARS_EYE_HEIGHT_M = 1.7;

const WALK_SPEED_MPS = 1.3;
const SPRINT_SPEED_MPS = 14;
const MAX_FRAME_DT_S = 0.05;
const MAX_SUBSTEPS = 32;
const LOOK_SENSITIVITY = 0.0022;
const ORBIT_SENSITIVITY = 0.005;
const MAX_CRUMBS = 480;
const CRUMB_SPACING_M = 0.5;

const EMPTY_PATH: readonly LocalPoint3[] = [];
const EMPTY_CELLS: readonly number[] = [];

export type PreStepBlockReason =
  | CorridorOffPathReason
  | 'outside-slope'
  | 'outside-slope-unknown'
  | 'non-finite-height'
  | 'range-error'
  | 'route-version-mismatch';

export type MarswalkStepFailure = PreStepBlockReason | 'no-active-path';

export interface PreStepDecision {
  readonly allowed: boolean;
  readonly reason: PreStepBlockReason | null;
  readonly east_m: number | null;
  readonly north_m: number | null;
  readonly heightY: number | null;
  readonly deviation_m: number | null;
  readonly cellSlope_deg: number | null;
  readonly nearestSafePoint: LocalPoint3 | null;
  readonly outsideBundle: boolean;
  readonly safety: CorridorCheckResult | null;
}

export interface PreStepInput {
  sceneX: number;
  sceneZ: number;
  terrain: MarswalkTerrainHandle;
  bundle: GridBundle;
  origin: SceneOrigin;
  verticalExaggeration: number;
  activePath: readonly LocalPoint3[];
  activePathCells: readonly number[] | ReadonlySet<number>;
  /**
   * When this differs from `bundle.bundleVersion`, the stale polyline and cells are ignored.
   * Corridor checks do not run, so a version mismatch cannot soft-lock free roam.
   * Height and outside-bundle slope still apply.
   */
  routeBundleVersion?: string | null;
}

export interface MarswalkBlockedDetail {
  reason: PreStepBlockReason;
  deviation_m: number | null;
  nearestSafePoint: LocalPoint3 | null;
  offPathCount: number;
  message: string;
}

export interface MarswalkPlayerOptions {
  camera: THREE.PerspectiveCamera;
  domElement: HTMLElement;
  terrain: MarswalkTerrainHandle;
  bundle: GridBundle;
  origin: SceneOrigin;
  verticalExaggeration: number;
  getActivePath: () => readonly LocalPoint3[];
  getActivePathCells: () => readonly number[] | ReadonlySet<number>;
  onBlocked?: (detail: MarswalkBlockedDetail) => void;
  onCleared?: () => void;
  getRouteBundleVersion?: () => string | null;
}

export interface MarswalkStepResult {
  readonly moved: boolean;
  readonly blocked: boolean;
  readonly reason: MarswalkStepFailure | null;
  readonly offPathCount: number;
}

export interface MarswalkPose {
  readonly sceneX: number;
  readonly sceneY: number;
  readonly sceneZ: number;
  readonly east_m: number | null;
  readonly north_m: number | null;
  readonly elevation_m: number | null;
  readonly blocked: boolean;
  readonly blockCode: PreStepBlockReason | null;
  readonly blockReason: string | null;
  readonly deviation_m: number | null;
  readonly cellSlope_deg: number | null;
  readonly offPathCount: number;
}

export interface MarswalkPlayerHandle {
  readonly root: THREE.Group;
  readonly rig: THREE.Group;
  readonly crumbs: THREE.Group;
  update(dtSeconds: number): void;
  /** `dxEast` is scene +x (east). `dzSouth` is scene +z (south, decreasing north). */
  moveRelativeSceneStep(dxEast: number, dzSouth: number): MarswalkStepResult;
  moveAlongRouteForDemo(): MarswalkStepResult;
  stepOffPathForDemo(): MarswalkStepResult;
  respawnToSafePoint(): void;
  syncGroundY(): void;
  dispose(): void;
  getOffPathCount(): number;
  isBlocked(): boolean;
  getLastDecision(): PreStepDecision | null;
  readPose(): MarswalkPose;
  takeAcceptedStep(): MarswalkAcceptedStep | null;
}

export function describeBlockReason(reason: PreStepBlockReason | null): string {
  switch (reason) {
    case 'corridor-deviation':
      return 'Outside the route corridor';
    case 'steep-slope':
      return 'Slope over 20 degrees';
    case 'excluded-cell':
      return 'Excluded cell';
    case 'outside-slope':
      return 'Slope over 20 degrees outside the map';
    case 'outside-slope-unknown':
      return 'Slope unavailable outside the map';
    case 'non-finite-height':
      return 'Elevation unavailable';
    case 'range-error':
      return 'Vertical exaggeration unavailable';
    case 'route-version-mismatch':
      return 'Route is from a different map';
    default:
      return 'Step refused';
  }
}

interface PlayerWalkRecord {
  east_m: number;
  north_m: number;
  from_east_m: number;
  from_north_m: number;
  horizontal_m: number;
}

const playerWalks = new WeakMap<object, PlayerWalkRecord>();

function stampWalk(
  decision: PreStepDecision,
  horizontal_m: number,
  from_east_m: number,
  from_north_m: number,
): MarswalkAcceptedStep | null {
  if (!decision.allowed || decision.reason !== null) return null;
  if (decision.east_m === null || decision.north_m === null) return null;
  if (!Number.isFinite(decision.east_m) || !Number.isFinite(decision.north_m)) return null;
  if (!Number.isFinite(horizontal_m) || horizontal_m < 0) return null;
  if (!Number.isFinite(from_east_m) || !Number.isFinite(from_north_m)) return null;
  const step: MarswalkAcceptedStep = {
    horizontal_m,
    east_m: decision.east_m,
    north_m: decision.north_m,
  };
  playerWalks.set(step, {
    east_m: decision.east_m,
    north_m: decision.north_m,
    from_east_m,
    from_north_m,
    horizontal_m,
  });
  return step;
}

function playerWalkRecord(step: object): PlayerWalkRecord | null {
  return playerWalks.get(step) ?? null;
}

/** Reads the gate record stored for this exact object. A copy has no record. */
export function readPlayerGateStep(
  step: MarswalkAcceptedStep | null | undefined,
): PlayerWalkRecord | null {
  if (!step || typeof step !== 'object') return null;
  const record = playerWalkRecord(step);
  return record ? { ...record } : null;
}

/** True until `consumePlayerGateStep` deletes the record. */
export function isPlayerGateStep(step: MarswalkAcceptedStep | null | undefined): boolean {
  return readPlayerGateStep(step) !== null;
}

/** Deletes the gate record. A later read of the same object fails. */
export function consumePlayerGateStep(step: MarswalkAcceptedStep | null | undefined): boolean {
  if (!step || typeof step !== 'object') return false;
  if (!playerWalks.has(step)) return false;
  playerWalks.delete(step);
  return true;
}

function isThenable(value: unknown): value is Promise<unknown> {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return false;
  const thenable = value as { then?: unknown };
  return typeof thenable.then === 'function';
}

function copyPoint(point: LocalPoint3 | null | undefined): LocalPoint3 | null {
  if (!point || !Number.isFinite(point.east_m) || !Number.isFinite(point.north_m)) return null;
  return {
    east_m: point.east_m,
    north_m: point.north_m,
    elevation_m: point.elevation_m,
  };
}

function finiteNonZero(value: number): number | null {
  if (!Number.isFinite(value) || value === 0) return null;
  return value;
}

function horizontalEastNorth(
  sceneX: number,
  sceneZ: number,
  origin: SceneOrigin,
): { east_m: number; north_m: number } | null {
  if (!Number.isFinite(sceneX) || !Number.isFinite(sceneZ)) return null;
  if (!Number.isFinite(origin.east_m) || !Number.isFinite(origin.north_m)) return null;
  return {
    east_m: sceneX + origin.east_m,
    north_m: origin.north_m - sceneZ,
  };
}

function mixHash(hash: number, value: number): number {
  return Math.imul(hash ^ (value | 0), 16777619);
}

function pathToken(path: readonly LocalPoint3[]): string {
  let hash = 2166136261;
  for (let i = 0; i < path.length; i += 1) {
    const point = path[i];
    if (!point) continue;
    hash = mixHash(hash, Math.round(point.east_m * 100));
    hash = mixHash(hash, Math.round(point.north_m * 100));
  }
  return `${path.length}:${hash}`;
}

function cellsToken(cells: readonly number[] | ReadonlySet<number>): string {
  let hash = 2166136261;
  let count = 0;
  const visit = (value: number): void => {
    count += 1;
    hash = mixHash(hash, value);
  };
  if (Array.isArray(cells)) {
    for (let i = 0; i < cells.length; i += 1) {
      const value = cells[i];
      if (value === undefined) continue;
      visit(value);
    }
  } else {
    for (const value of cells) visit(value);
  }
  return `${count}:${hash}`;
}

function refusedDecision(
  reason: PreStepBlockReason,
  outsideBundle: boolean,
): PreStepDecision {
  return {
    allowed: false,
    reason,
    east_m: null,
    north_m: null,
    heightY: null,
    deviation_m: null,
    cellSlope_deg: null,
    nearestSafePoint: null,
    outsideBundle,
    safety: null,
  };
}

/**
 * Pure pre-step gate. Converts with `sceneXYZToLocal`, then `checkCorridorSafety`.
 * `slopeDegAtSceneXZ` is consulted only outside the bundle rectangle.
 */
export function evaluatePreStep(input: PreStepInput): PreStepDecision {
  if (!Number.isFinite(input.sceneX) || !Number.isFinite(input.sceneZ)) {
    return refusedDecision('non-finite-height', false);
  }

  const exaggeration = finiteNonZero(input.verticalExaggeration);
  let local: LocalPoint3;
  try {
    local = sceneXYZToLocal(
      { x: input.sceneX, y: 0, z: input.sceneZ },
      input.origin,
      exaggeration ?? 0,
    );
  } catch (err) {
    if (err instanceof RangeError) return refusedDecision('range-error', false);
    throw err;
  }

  const version = input.routeBundleVersion;
  const mismatched =
    typeof version === 'string' && version.length > 0 && version !== input.bundle.bundleVersion;
  const path = mismatched ? EMPTY_PATH : input.activePath;
  const cells = mismatched ? EMPTY_CELLS : input.activePathCells;
  const grid = input.bundle.manifest.grid;
  const outsideBundle = pointToCell(grid, local) === null;

  let outsideSlope: number | null = null;
  let outsideSlopeKnown = false;
  if (outsideBundle) {
    const sampled = input.terrain.slopeDegAtSceneXZ(input.sceneX, input.sceneZ);
    if (Number.isFinite(sampled)) {
      outsideSlope = sampled;
      outsideSlopeKnown = true;
    }
  }

  const safety = checkCorridorSafety(local, input.bundle, cells, path, {
    maxCorridorDeviation_m: defaultCorridorThresholdForGrid(grid),
    maxSlope_deg: DEFAULT_MAX_SLOPE_DEG,
  });

  const sampledHeight = input.terrain.heightAtSceneXZ(input.sceneX, input.sceneZ);
  const heightY = Number.isFinite(sampledHeight) ? sampledHeight : null;
  const cellSlope =
    safety.cellSlope_deg !== null && Number.isFinite(safety.cellSlope_deg)
      ? safety.cellSlope_deg
      : outsideSlope;

  let reason: PreStepBlockReason | null = null;
  if (safety.isOffPath) reason = safety.reason ?? 'corridor-deviation';
  else if (outsideBundle && !outsideSlopeKnown) reason = 'outside-slope-unknown';
  else if (outsideBundle && outsideSlope !== null && outsideSlope > DEFAULT_MAX_SLOPE_DEG) {
    reason = 'outside-slope';
  }
  if (heightY === null && (reason === null || reason === 'outside-slope-unknown')) {
    reason = 'non-finite-height';
  }

  return {
    allowed: reason === null,
    reason,
    east_m: local.east_m,
    north_m: local.north_m,
    heightY,
    deviation_m: Number.isFinite(safety.deviation_m) ? safety.deviation_m : null,
    cellSlope_deg: cellSlope,
    nearestSafePoint: copyPoint(safety.nearestSafePoint),
    outsideBundle,
    safety,
  };
}

function readTagName(value: object): string {
  if (!('tagName' in value)) return '';
  const tag = (value as { tagName?: unknown }).tagName;
  return typeof tag === 'string' ? tag.toUpperCase() : '';
}

function isEditableTarget(target: EventTarget | null, _doc: Document | null): boolean {
  let current: object | null = typeof target === 'object' && target !== null ? target : null;
  for (let depth = 0; current !== null && depth < 8; depth += 1) {
    const tag = readTagName(current);
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if ('isContentEditable' in current && (current as { isContentEditable?: unknown }).isContentEditable === true) {
      return true;
    }
    if (!('parentElement' in current)) return false;
    const parent = (current as { parentElement?: unknown }).parentElement;
    current = typeof parent === 'object' && parent !== null ? parent : null;
  }
  return false;
}

function readOwnerDocument(element: HTMLElement): Document | null {
  try {
    const owner = element.ownerDocument;
    if (owner && typeof owner.addEventListener === 'function') return owner;
  } catch {
    return null;
  }
  return null;
}

function stepResult(
  moved: boolean,
  blocked: boolean,
  reason: MarswalkStepFailure | null,
  offPathCount: number,
): MarswalkStepResult {
  return { moved, blocked, reason, offPathCount };
}

export function createMarswalkPlayer(options: MarswalkPlayerOptions): MarswalkPlayerHandle {
  const { camera, domElement, terrain, bundle, origin } = options;
  const doc = readOwnerDocument(domElement);
  const win = doc?.defaultView ?? null;

  const root = new THREE.Group();
  root.name = 'marswalk-player';
  const rig = new THREE.Group();
  rig.name = 'marswalk-rig';
  const crumbs = new THREE.Group();
  crumbs.name = 'marswalk-crumbs';
  root.add(rig, crumbs);
  rig.add(camera);
  camera.rotation.order = 'YXZ';
  camera.position.set(0, MARS_EYE_HEIGHT_M, 0);

  const crumbPositions = new Float32Array(MAX_CRUMBS * 3);
  const crumbGeom = new THREE.BufferGeometry();
  const crumbAttr = new THREE.BufferAttribute(crumbPositions, 3);
  crumbAttr.setUsage(THREE.DynamicDrawUsage);
  crumbGeom.setAttribute('position', crumbAttr);
  crumbGeom.setDrawRange(0, 0);
  const crumbMat = new THREE.LineBasicMaterial({ color: 0xd8c4a0 });
  const crumbLine = new THREE.Line(crumbGeom, crumbMat);
  crumbLine.name = 'marswalk-crumbs-line';
  crumbLine.frustumCulled = false;
  crumbs.add(crumbLine);

  const keys = {
    forward: false,
    back: false,
    left: false,
    right: false,
    shiftLeft: false,
    shiftRight: false,
  };

  let yaw = 0;
  let pitch = 0;
  let orbitYaw = 0.75;
  let orbitPitch = 0.62;
  let orbitRadius = 18;
  let crumbCount = 0;
  let offPathCount = 0;
  let blockedLatch = false;
  let holdSuppress = false;
  let exitedForThisLock = false;
  let disposed = false;
  let lastDecision: PreStepDecision | null = null;
  let latestStamp: MarswalkAcceptedStep | null = null;
  let lastSafe: LocalPoint3 | null = null;
  let lastFiniteY: number | null = null;
  let appliedExaggeration = terrain.verticalExaggeration;
  let mismatchLatch = false;
  let dragging = false;
  let dragMoved = false;
  let dragId = -1;
  let lastPX = 0;
  let lastPY = 0;
  let dragOriginX = 0;
  let dragOriginY = 0;
  let pathTokenPrev = '';
  let cellsTokenPrev = '';

  const lookTarget = new THREE.Vector3();

  function usableExaggeration(): number | null {
    return finiteNonZero(terrain.verticalExaggeration) ?? finiteNonZero(options.verticalExaggeration);
  }

  function readPath(): readonly LocalPoint3[] {
    const path = options.getActivePath();
    return Array.isArray(path) ? path : EMPTY_PATH;
  }

  function readCells(): readonly number[] | ReadonlySet<number> {
    const cells = options.getActivePathCells();
    if (Array.isArray(cells) || cells instanceof Set) return cells;
    return EMPTY_CELLS;
  }

  function routeMismatch(): boolean {
    const version = options.getRouteBundleVersion?.();
    return typeof version === 'string' && version.length > 0 && version !== bundle.bundleVersion;
  }

  function watchMismatch(): void {
    const mismatched = routeMismatch();
    if (mismatched && !mismatchLatch) lastSafe = null;
    mismatchLatch = mismatched;
  }

  function gateInput(sceneX: number, sceneZ: number): PreStepInput {
    return {
      sceneX,
      sceneZ,
      terrain,
      bundle,
      origin,
      verticalExaggeration: usableExaggeration() ?? 0,
      activePath: readPath(),
      activePathCells: readCells(),
      routeBundleVersion: options.getRouteBundleVersion?.() ?? null,
    };
  }

  function movementKeysDown(): boolean {
    return keys.forward || keys.back || keys.left || keys.right;
  }

  function isLocked(): boolean {
    if (!doc) return false;
    try {
      return doc.pointerLockElement === domElement;
    } catch {
      return false;
    }
  }

  function requestLock(): void {
    const request = domElement.requestPointerLock;
    if (typeof request !== 'function') return;
    try {
      const result: unknown = request.call(domElement);
      if (isThenable(result)) void result.catch(() => undefined);
    } catch {
      // Pointer lock is absent in jsdom and some embedded webviews.
    }
  }

  function exitLock(): void {
    if (!doc || !isLocked()) return;
    const exit = doc.exitPointerLock;
    if (typeof exit !== 'function') return;
    try {
      const result: unknown = exit.call(doc);
      if (isThenable(result)) void result.catch(() => undefined);
    } catch {
      // Pointer lock is absent in jsdom and some embedded webviews.
    }
  }

  function maybeExitBecauseBlocked(): void {
    if (!blockedLatch || exitedForThisLock || !isLocked()) return;
    exitLock();
    exitedForThisLock = true;
  }

  function applyFpsCamera(): void {
    camera.position.set(0, MARS_EYE_HEIGHT_M, 0);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(pitch, yaw, 0);
    camera.updateMatrixWorld(true);
  }

  function applyOrbitCamera(): void {
    const horizontal = orbitRadius * Math.cos(orbitPitch);
    camera.position.set(
      horizontal * Math.sin(orbitYaw),
      MARS_EYE_HEIGHT_M + orbitRadius * Math.sin(orbitPitch),
      horizontal * Math.cos(orbitYaw),
    );
    camera.up.set(0, 1, 0);
    rig.updateMatrixWorld(true);
    lookTarget.set(0, MARS_EYE_HEIGHT_M, 0);
    rig.localToWorld(lookTarget);
    camera.lookAt(lookTarget);
  }

  function applyCamera(): void {
    if (isLocked()) applyFpsCamera();
    else applyOrbitCamera();
  }

  function pushCrumb(x: number, y: number, z: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
    if (crumbCount > 0) {
      const previous = crumbCount - 1;
      const dx = crumbAttr.getX(previous) - x;
      const dy = crumbAttr.getY(previous) - y;
      const dz = crumbAttr.getZ(previous) - z;
      if (Math.hypot(dx, dy, dz) < CRUMB_SPACING_M) return;
    }
    if (crumbCount >= MAX_CRUMBS) {
      crumbPositions.copyWithin(0, 3);
      crumbCount = MAX_CRUMBS - 1;
    }
    crumbAttr.setXYZ(crumbCount, x, y, z);
    crumbCount += 1;
    crumbGeom.setDrawRange(0, crumbCount);
    crumbAttr.needsUpdate = true;
  }

  function resetCrumbs(x: number, y: number, z: number): void {
    crumbCount = 0;
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
      crumbAttr.setXYZ(0, x, y, z);
      crumbCount = 1;
    }
    crumbGeom.setDrawRange(0, crumbCount);
    crumbAttr.needsUpdate = true;
  }

  function rebakeCrumbs(): void {
    const exaggeration = terrain.verticalExaggeration;
    if (!Number.isFinite(exaggeration) || exaggeration === 0) return;
    for (let i = 0; i < crumbCount; i += 1) {
      const x = crumbAttr.getX(i);
      const z = crumbAttr.getZ(i);
      const y = terrain.heightAtSceneXZ(x, z);
      if (!Number.isFinite(y)) continue;
      crumbAttr.setY(i, y);
    }
    crumbAttr.needsUpdate = true;
  }

  function syncGroundY(): void {
    const exaggeration = terrain.verticalExaggeration;
    if (!Number.isFinite(exaggeration) || exaggeration === 0) return;
    const y = terrain.heightAtSceneXZ(rig.position.x, rig.position.z);
    if (!Number.isFinite(y)) return;
    rig.position.y = y;
    lastFiniteY = y;
  }

  function placeFeet(sceneX: number, sceneZ: number): void {
    rig.position.x = sceneX;
    rig.position.z = sceneZ;
    const exaggeration = terrain.verticalExaggeration;
    if (!Number.isFinite(exaggeration) || exaggeration === 0) {
      if (lastFiniteY !== null) rig.position.y = lastFiniteY;
      return;
    }
    const y = terrain.heightAtSceneXZ(sceneX, sceneZ);
    if (Number.isFinite(y)) {
      rig.position.y = y;
      lastFiniteY = y;
    } else if (lastFiniteY !== null) {
      rig.position.y = lastFiniteY;
    }
  }

  function clearLatch(): void {
    holdSuppress = false;
    if (!blockedLatch) return;
    blockedLatch = false;
    exitedForThisLock = false;
    options.onCleared?.();
  }

  function rejectStep(decision: PreStepDecision, count: boolean): void {
    lastDecision = decision;
    if (decision.nearestSafePoint) lastSafe = decision.nearestSafePoint;
    if (!count) return;
    if (blockedLatch) {
      maybeExitBecauseBlocked();
      return;
    }
    blockedLatch = true;
    offPathCount += 1;
    maybeExitBecauseBlocked();
    const reason = decision.reason ?? 'non-finite-height';
    options.onBlocked?.({
      reason,
      deviation_m: decision.deviation_m,
      nearestSafePoint: decision.nearestSafePoint,
      offPathCount,
      message: `Step refused: ${describeBlockReason(reason)}`,
    });
  }

  function acceptStep(decision: PreStepDecision, sceneX: number, sceneZ: number): number {
    const stepM = Math.hypot(sceneX - rig.position.x, sceneZ - rig.position.z);
    rig.position.x = sceneX;
    rig.position.z = sceneZ;
    if (decision.heightY !== null) {
      rig.position.y = decision.heightY;
      lastFiniteY = decision.heightY;
    }
    if (decision.nearestSafePoint) lastSafe = decision.nearestSafePoint;
    lastDecision = decision;
    clearLatch();
    pushCrumb(rig.position.x, rig.position.y, rig.position.z);
    return stepM;
  }

  function maxSubstepMetres(): number {
    const grid = bundle.manifest.grid;
    const dx = Number.isFinite(grid.cellSizeEast_m) && grid.cellSizeEast_m > 0 ? grid.cellSizeEast_m : 1;
    const dz = Number.isFinite(grid.cellSizeNorth_m) && grid.cellSizeNorth_m > 0 ? grid.cellSizeNorth_m : 1;
    return Math.max(0.25, Math.min(dx, dz) * 0.45);
  }

  function moveScene(dx: number, dz: number, countBlocks: boolean): MarswalkStepResult {
    if (disposed || !Number.isFinite(dx) || !Number.isFinite(dz)) {
      return stepResult(false, false, null, offPathCount);
    }
    const distance = Math.hypot(dx, dz);
    if (distance < 1e-6) return stepResult(false, false, null, offPathCount);
    const fromHere = horizontalEastNorth(rig.position.x, rig.position.z, origin);
    const substep = maxSubstepMetres();
    const applied = Math.min(distance, substep * MAX_SUBSTEPS);
    const steps = Math.max(1, Math.ceil(applied / substep));
    const sx = (dx / distance) * (applied / steps);
    const sz = (dz / distance) * (applied / steps);
    let moved = false;
    let blocked = false;
    let reason: MarswalkStepFailure | null = null;
    let acceptedM = 0;
    let finalDecision: PreStepDecision | null = null;
    for (let i = 0; i < steps; i += 1) {
      const nextX = rig.position.x + sx;
      const nextZ = rig.position.z + sz;
      const decision = evaluatePreStep(gateInput(nextX, nextZ));
      if (!decision.allowed || decision.heightY === null) {
        rejectStep(decision, countBlocks);
        blocked = true;
        reason = decision.reason;
        break;
      }
      acceptedM += acceptStep(decision, nextX, nextZ);
      finalDecision = decision;
      moved = true;
      blocked = false;
      reason = null;
    }
    if (finalDecision && acceptedM > 0 && fromHere) {
      latestStamp = stampWalk(finalDecision, acceptedM, fromHere.east_m, fromHere.north_m);
    }
    return stepResult(moved, blocked, reason, offPathCount);
  }

  function fpsDisplacement(mx: number, mz: number, speed: number): { dx: number; dz: number } {
    return {
      dx: (Math.cos(yaw) * mx - Math.sin(yaw) * mz) * speed,
      dz: (-Math.sin(yaw) * mx - Math.cos(yaw) * mz) * speed,
    };
  }

  function orbitDisplacement(mx: number, mz: number, speed: number): { dx: number; dz: number } {
    let fx = -camera.position.x;
    let fz = -camera.position.z;
    const length = Math.hypot(fx, fz);
    if (length < 1e-4) {
      fx = 0;
      fz = -1;
    } else {
      fx /= length;
      fz /= length;
    }
    const rx = -fz;
    const rz = fx;
    return {
      dx: (rx * mx + fx * mz) * speed,
      dz: (rz * mx + fz * mz) * speed,
    };
  }

  function consumeRebind(): boolean {
    const nextPath = pathToken(readPath());
    const nextCells = cellsToken(readCells());
    const changed = nextPath !== pathTokenPrev || nextCells !== cellsTokenPrev;
    pathTokenPrev = nextPath;
    cellsTokenPrev = nextCells;
    if (changed) resetCrumbs(rig.position.x, rig.position.y, rig.position.z);
    return changed;
  }

  function sceneXZFromLocal(point: LocalPoint3): { x: number; z: number } | null {
    const exaggeration = usableExaggeration();
    if (exaggeration !== null) {
      try {
        const scene = localToSceneXYZ(point, origin, exaggeration);
        return { x: scene.x, z: scene.z };
      } catch (err) {
        if (!(err instanceof RangeError)) throw err;
      }
    }
    if (!Number.isFinite(point.east_m) || !Number.isFinite(point.north_m)) return null;
    return { x: point.east_m - origin.east_m, z: origin.north_m - point.north_m };
  }

  function tryPlace(point: LocalPoint3): boolean {
    const scene = sceneXZFromLocal(point);
    if (!scene) return false;
    const decision = evaluatePreStep(gateInput(scene.x, scene.z));
    lastDecision = decision;
    if (!decision.allowed || decision.heightY === null) return false;
    placeFeet(scene.x, scene.z);
    lastSafe = decision.nearestSafePoint ?? copyPoint(point);
    return true;
  }

  function rememberCandidate(list: LocalPoint3[], point: LocalPoint3 | null | undefined): void {
    const copy = copyPoint(point);
    if (!copy) return;
    const previous = list[list.length - 1];
    if (
      previous &&
      Math.hypot(previous.east_m - copy.east_m, previous.north_m - copy.north_m) < 0.2
    ) {
      return;
    }
    list.push(copy);
  }

  function spawn(): void {
    const first = copyPoint(readPath()[0]);
    if (first && tryPlace(first)) return;
  }

  function respawnToSafePoint(): void {
    if (disposed) return;
    watchMismatch();
    const path = routeMismatch() ? EMPTY_PATH : readPath();
    const candidates: LocalPoint3[] = [];
    rememberCandidate(candidates, lastSafe);
    const here = horizontalEastNorth(rig.position.x, rig.position.z, origin);
    if (here && path.length > 0) {
      rememberCandidate(candidates, findNearestPointOnPath(here, path)?.closestPoint);
    }
    const stride = Math.max(1, Math.ceil(path.length / 256));
    for (let i = 0; i < path.length; i += stride) rememberCandidate(candidates, path[i]);
    rememberCandidate(candidates, path[path.length - 1]);
    for (const candidate of candidates) {
      if (!tryPlace(candidate)) continue;
      resetCrumbs(rig.position.x, rig.position.y, rig.position.z);
      clearLatch();
      applyCamera();
      return;
    }
  }

  function proposeBeyondCorridor(): { x: number; z: number } | null {
    const path = readPath();
    const here = horizontalEastNorth(rig.position.x, rig.position.z, origin);
    if (!here || path.length === 0) return null;
    const nearest = findNearestPointOnPath(here, path);
    let dirEast = 1;
    let dirNorth = 0;
    const awayEast = nearest ? here.east_m - nearest.closestPoint.east_m : 0;
    const awayNorth = nearest ? here.north_m - nearest.closestPoint.north_m : 0;
    const awayLength = Math.hypot(awayEast, awayNorth);
    if (awayLength > 0.25) {
      dirEast = awayEast / awayLength;
      dirNorth = awayNorth / awayLength;
    } else if (nearest) {
      const start = path[nearest.segmentIndex];
      const end = path[Math.min(path.length - 1, nearest.segmentIndex + 1)];
      if (start && end) {
        const dx = end.east_m - start.east_m;
        const dy = end.north_m - start.north_m;
        const length = Math.hypot(dx, dy);
        if (length > 1e-6) {
          dirEast = -dy / length;
          dirNorth = dx / length;
        }
      }
    }
    const threshold = defaultCorridorThresholdForGrid(bundle.manifest.grid);
    let fallback: { x: number; z: number } | null = null;
    for (const sign of [1, -1]) {
      for (const extra of [1, 2, 4, 8]) {
        const distance = threshold + extra;
        const east = here.east_m + dirEast * sign * distance;
        const north = here.north_m + dirNorth * sign * distance;
        const sceneX = east - origin.east_m;
        const sceneZ = origin.north_m - north;
        const decision = evaluatePreStep(gateInput(sceneX, sceneZ));
        if (
          !decision.allowed &&
          decision.reason === 'corridor-deviation' &&
          decision.heightY !== null
        ) {
          return { x: sceneX, z: sceneZ };
        }
        if (!decision.allowed && fallback === null) fallback = { x: sceneX, z: sceneZ };
      }
    }
    return fallback;
  }

  function moveAlongRouteForDemo(): MarswalkStepResult {
    if (disposed) return stepResult(false, false, null, offPathCount);
    watchMismatch();
    const path = readPath();
    if (routeMismatch() || path.length === 0) {
      return stepResult(false, false, 'no-active-path', offPathCount);
    }
    const here = horizontalEastNorth(rig.position.x, rig.position.z, origin);
    if (!here) return stepResult(false, false, 'range-error', offPathCount);
    const nearest = findNearestPointOnPath(here, path);
    let startIndex = 0;
    if (nearest) {
      startIndex = nearest.t > 0.5 ? nearest.segmentIndex + 1 : nearest.nearestVertexIndex;
    }
    let target: LocalPoint3 | null = null;
    for (let i = Math.max(0, startIndex); i < path.length; i += 1) {
      const point = path[i];
      if (!point || !Number.isFinite(point.east_m) || !Number.isFinite(point.north_m)) continue;
      if (Math.hypot(point.east_m - here.east_m, point.north_m - here.north_m) > 0.35) {
        target = point;
        break;
      }
    }
    if (!target) return stepResult(false, false, null, offPathCount);
    const tx = target.east_m - origin.east_m;
    const tz = origin.north_m - target.north_m;
    const dx = tx - rig.position.x;
    const dz = tz - rig.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 1e-4) return stepResult(false, false, null, offPathCount);
    const step = Math.min(distance, Math.max(0.45, maxSubstepMetres()));
    return moveScene((dx / distance) * step, (dz / distance) * step, true);
  }

  function stepOffPathForDemo(): MarswalkStepResult {
    if (disposed) return stepResult(false, false, null, offPathCount);
    watchMismatch();
    if (routeMismatch() || readPath().length === 0) {
      return stepResult(false, false, 'no-active-path', offPathCount);
    }
    const proposal = proposeBeyondCorridor();
    if (!proposal) return stepResult(false, false, 'no-active-path', offPathCount);
    const decision = evaluatePreStep(gateInput(proposal.x, proposal.z));
    if (!decision.allowed) {
      rejectStep(decision, true);
      return stepResult(false, true, decision.reason, offPathCount);
    }
    return stepResult(false, false, null, offPathCount);
  }

  function clearKeys(): void {
    keys.forward = false;
    keys.back = false;
    keys.left = false;
    keys.right = false;
    keys.shiftLeft = false;
    keys.shiftRight = false;
  }

  function setKey(code: string, down: boolean): void {
    switch (code) {
      case 'KeyW':
      case 'ArrowUp':
        keys.forward = down;
        break;
      case 'KeyS':
      case 'ArrowDown':
        keys.back = down;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        keys.left = down;
        break;
      case 'KeyD':
      case 'ArrowRight':
        keys.right = down;
        break;
      case 'ShiftLeft':
        keys.shiftLeft = down;
        break;
      case 'ShiftRight':
        keys.shiftRight = down;
        break;
      default:
        break;
    }
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (disposed || event.repeat) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (isEditableTarget(event.target, doc)) return;
    if (event.code === 'KeyR') {
      respawnToSafePoint();
      return;
    }
    setKey(event.code, true);
  }

  function onKeyUp(event: KeyboardEvent): void {
    if (disposed) return;
    setKey(event.code, false);
  }

  function isWalkSurface(target: EventTarget | null): boolean {
    if (target === domElement) return true;
    if (typeof target !== 'object' || target === null) return false;
    let contained: boolean;
    try {
      contained = typeof domElement.contains === 'function' && domElement.contains(target as Node);
    } catch {
      return false;
    }
    if (!contained) return false;
    const tag = readTagName(target);
    return (
      tag !== 'BUTTON' &&
      tag !== 'INPUT' &&
      tag !== 'TEXTAREA' &&
      tag !== 'SELECT' &&
      tag !== 'A' &&
      tag !== 'LABEL'
    );
  }

  function onPointerDown(event: PointerEvent): void {
    if (disposed || event.button !== 0 || isLocked() || !isWalkSurface(event.target)) return;
    dragging = true;
    dragMoved = false;
    dragId = event.pointerId ?? -1;
    lastPX = event.clientX ?? 0;
    lastPY = event.clientY ?? 0;
    dragOriginX = lastPX;
    dragOriginY = lastPY;
    try {
      domElement.setPointerCapture?.(dragId);
    } catch {
      // setPointerCapture is optional in jsdom.
    }
  }

  function onPointerMove(event: PointerEvent): void {
    if (disposed || isLocked() || !dragging || event.pointerId !== dragId) return;
    const x = event.clientX ?? 0;
    const y = event.clientY ?? 0;
    const dx = x - lastPX;
    const dy = y - lastPY;
    lastPX = x;
    lastPY = y;
    if (Math.hypot(x - dragOriginX, y - dragOriginY) > 4) dragMoved = true;
    orbitYaw -= dx * ORBIT_SENSITIVITY;
    orbitPitch = Math.max(0.12, Math.min(1.35, orbitPitch + dy * ORBIT_SENSITIVITY));
    applyOrbitCamera();
  }

  function onMouseMove(event: MouseEvent): void {
    if (disposed || !isLocked()) return;
    const dx = event.movementX ?? 0;
    const dy = event.movementY ?? 0;
    if (dx === 0 && dy === 0) return;
    yaw -= dx * LOOK_SENSITIVITY;
    pitch = Math.max(-1.45, Math.min(1.45, pitch - dy * LOOK_SENSITIVITY));
    applyFpsCamera();
  }

  function releaseDragCapture(): void {
    const pointerId = dragId;
    dragging = false;
    try {
      if (typeof domElement.hasPointerCapture === 'function' && domElement.hasPointerCapture(pointerId)) {
        domElement.releasePointerCapture(pointerId);
      }
    } catch {
      // Pointer capture is absent in jsdom.
    }
  }

  function onPointerUp(event: PointerEvent): void {
    if (!dragging || event.pointerId !== dragId) return;
    const x = event.clientX ?? lastPX;
    const y = event.clientY ?? lastPY;
    const click = !dragMoved && Math.hypot(x - dragOriginX, y - dragOriginY) < 5;
    releaseDragCapture();
    if (click && !isLocked() && isWalkSurface(event.target)) requestLock();
  }

  function onWheel(event: WheelEvent): void {
    if (disposed || isLocked() || !Number.isFinite(event.deltaY) || event.deltaY === 0) return;
    orbitRadius = Math.min(80, Math.max(3, orbitRadius + Math.sign(event.deltaY) * 1.4));
    applyOrbitCamera();
    try {
      event.preventDefault();
    } catch {
      // A passive listener must not fail the frame.
    }
  }

  function onPointerLockChange(): void {
    clearKeys();
    exitedForThisLock = false;
    if (isLocked()) {
      camera.getWorldDirection(lookTarget);
      if (Math.hypot(lookTarget.x, lookTarget.z) > 1e-4) {
        yaw = Math.atan2(-lookTarget.x, -lookTarget.z);
      }
      pitch = Math.max(-1.2, Math.min(1.2, -lookTarget.y));
      applyFpsCamera();
    } else {
      applyOrbitCamera();
    }
  }

  function onBlur(): void {
    clearKeys();
  }

  function onVisibility(): void {
    if (!doc || doc.visibilityState === 'hidden') clearKeys();
  }

  function update(dtSeconds: number): void {
    if (disposed) return;
    watchMismatch();
    if (consumeRebind()) holdSuppress = true;
    if (holdSuppress && !movementKeysDown()) holdSuppress = false;
    applyCamera();
    const dt = Number.isFinite(dtSeconds) && dtSeconds > 0 ? Math.min(dtSeconds, MAX_FRAME_DT_S) : 0;
    if (dt > 0 && movementKeysDown() && !holdSuppress) {
      const speed = (keys.shiftLeft || keys.shiftRight ? SPRINT_SPEED_MPS : WALK_SPEED_MPS) * dt;
      const mx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      const mz = (keys.forward ? 1 : 0) - (keys.back ? 1 : 0);
      const length = Math.hypot(mx, mz);
      if (length > 0) {
        const nx = mx / length;
        const nz = mz / length;
        const delta = isLocked() ? fpsDisplacement(nx, nz, speed) : orbitDisplacement(nx, nz, speed);
        moveScene(delta.dx, delta.dz, true);
      }
    }
    const exaggeration = terrain.verticalExaggeration;
    if (exaggeration !== appliedExaggeration) {
      appliedExaggeration = exaggeration;
      syncGroundY();
      rebakeCrumbs();
    } else {
      syncGroundY();
    }
    applyCamera();
    if (blockedLatch) maybeExitBecauseBlocked();
  }

  function readPose(): MarswalkPose {
    const here = horizontalEastNorth(rig.position.x, rig.position.z, origin);
    const exaggeration = usableExaggeration();
    let elevation: number | null = null;
    if (
      here &&
      exaggeration !== null &&
      Number.isFinite(rig.position.y) &&
      Number.isFinite(origin.elevation_m)
    ) {
      elevation = origin.elevation_m + rig.position.y / exaggeration;
    }
    const reason = blockedLatch ? (lastDecision?.reason ?? null) : null;
    return {
      sceneX: rig.position.x,
      sceneY: rig.position.y,
      sceneZ: rig.position.z,
      east_m: here ? here.east_m : null,
      north_m: here ? here.north_m : null,
      elevation_m: elevation,
      blocked: blockedLatch,
      blockCode: reason,
      blockReason: reason ? describeBlockReason(reason) : null,
      deviation_m: lastDecision?.deviation_m ?? null,
      cellSlope_deg: lastDecision?.cellSlope_deg ?? null,
      offPathCount,
    };
  }

  function releaseCapture(): void {
    if (dragId < 0) return;
    try {
      if (typeof domElement.hasPointerCapture === 'function' && domElement.hasPointerCapture(dragId)) {
        domElement.releasePointerCapture(dragId);
      }
    } catch {
      // Pointer capture is absent in jsdom.
    }
    dragging = false;
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    releaseDragCapture();
    clearKeys();
    releaseCapture();
    exitLock();
    win?.removeEventListener('keydown', onKeyDown, true);
    win?.removeEventListener('keyup', onKeyUp, true);
    win?.removeEventListener('blur', onBlur);
    doc?.removeEventListener('pointermove', onPointerMove);
    doc?.removeEventListener('pointerup', onPointerUp);
    doc?.removeEventListener('pointercancel', onPointerUp);
    doc?.removeEventListener('mousemove', onMouseMove);
    doc?.removeEventListener('pointerlockchange', onPointerLockChange);
    doc?.removeEventListener('visibilitychange', onVisibility);
    domElement.removeEventListener('pointerdown', onPointerDown);
    domElement.removeEventListener('wheel', onWheel);
    rig.remove(camera);
    crumbGeom.dispose();
    crumbMat.dispose();
    crumbLine.removeFromParent();
    crumbs.removeFromParent();
    rig.removeFromParent();
    root.clear();
    root.removeFromParent();
  }

  if (win && typeof win.addEventListener === 'function') {
    win.addEventListener('keydown', onKeyDown, true);
    win.addEventListener('keyup', onKeyUp, true);
    win.addEventListener('blur', onBlur);
  }
  if (doc) {
    doc.addEventListener('pointermove', onPointerMove);
    doc.addEventListener('pointerup', onPointerUp);
    doc.addEventListener('pointercancel', onPointerUp);
    doc.addEventListener('mousemove', onMouseMove);
    doc.addEventListener('pointerlockchange', onPointerLockChange);
    doc.addEventListener('visibilitychange', onVisibility);
  }
  domElement.addEventListener('pointerdown', onPointerDown);
  domElement.addEventListener('wheel', onWheel, { passive: false });

  pathTokenPrev = pathToken(readPath());
  cellsTokenPrev = cellsToken(readCells());
  spawn();
  applyCamera();

  return {
    root,
    rig,
    crumbs,
    update,
    moveRelativeSceneStep: (dxEast, dzSouth) => moveScene(dxEast, dzSouth, true),
    moveAlongRouteForDemo,
    stepOffPathForDemo,
    respawnToSafePoint,
    syncGroundY,
    dispose,
    getOffPathCount: () => offPathCount,
    isBlocked: () => blockedLatch,
    getLastDecision: () => lastDecision,
    readPose,
    takeAcceptedStep: () => {
      const step = latestStamp;
      latestStamp = null;
      return step;
    },
  };
}
