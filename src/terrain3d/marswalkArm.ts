/**
 * Wrist panel parented to the desktop camera.
 * One canvas texture, English telemetry only. Key I toggles the panel.
 */
import * as THREE from 'three';

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 460;
const REDRAW_SECONDS = 0.25;

export type MarswalkArmReturnState = 'absent' | 'unavailable' | 'active' | 'complete';

export interface MarswalkArmTelemetry {
  east_m?: number | null;
  north_m?: number | null;
  elevation_m?: number | null;
  slope_deg?: number | null;
  progress?: number | null;
  blocked?: boolean | null;
  /** True only after a corridor gate has reported this pose. */
  gateChecked?: boolean;
  blockReason?: string | null;
  deviation_m?: number | null;
  returnLegState?: MarswalkArmReturnState | null;
  travelSeconds?: number | null;
  /** False when `travelSeconds` omits accepted distance. Null means the caller did not say. */
  travelTimeComplete?: boolean | null;
  untimedDistance_m?: number | null;
  remainingSeconds?: number | null;
  remainingOutboundOnly?: boolean;
  /** True when the remainder includes the return leg. Null means the caller did not say. */
  remainingCoversReturn?: boolean | null;
  /** True when the current cell grade was applied to the whole remainder. */
  remainingUsesCurrentGrade?: boolean | null;
}

export interface MarswalkArmOptions {
  camera: THREE.PerspectiveCamera;
  domElement?: HTMLElement;
}

export interface MarswalkArmHandle {
  readonly group: THREE.Group;
  update(dtSeconds: number, telemetry?: MarswalkArmTelemetry): void;
  setTelemetry(telemetry: MarswalkArmTelemetry): void;
  toggle(): void;
  setOpen(open: boolean): void;
  isOpen(): boolean;
  dispose(): void;
}

interface ArmState {
  east_m: number | null;
  north_m: number | null;
  elevation_m: number | null;
  slope_deg: number | null;
  progress: number | null;
  blocked: boolean | null;
  gateChecked: boolean;
  blockReason: string | null;
  deviation_m: number | null;
  returnLegState: MarswalkArmReturnState | null;
  travelSeconds: number | null;
  travelTimeComplete: boolean | null;
  untimedDistance_m: number | null;
  remainingSeconds: number | null;
  remainingOutboundOnly: boolean;
  remainingCoversReturn: boolean | null;
  remainingUsesCurrentGrade: boolean | null;
}

function emptyState(): ArmState {
  return {
    east_m: null,
    north_m: null,
    elevation_m: null,
    slope_deg: null,
    progress: null,
    blocked: null,
    gateChecked: false,
    blockReason: null,
    deviation_m: null,
    returnLegState: null,
    travelSeconds: null,
    travelTimeComplete: null,
    untimedDistance_m: null,
    remainingSeconds: null,
    remainingOutboundOnly: false,
    remainingCoversReturn: null,
    remainingUsesCurrentGrade: null,
  };
}

function formatMetres(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'unavailable';
  const abs = Math.abs(value);
  const digits = abs >= 1000 ? 0 : abs >= 100 ? 1 : 2;
  return `${value.toFixed(digits)} m`;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return 'unavailable';
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const remain = total % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return `${hours} h ${minutes % 60} min`;
  }
  return `${minutes} min ${remain} s`;
}

function formatProgress(progress: number | null): string {
  if (progress === null || !Number.isFinite(progress)) return 'unavailable';
  const clamped = Math.min(1, Math.max(0, progress));
  return `${Math.round(clamped * 100)}%`;
}

function formatSlope(slope: number | null): string {
  if (slope === null || !Number.isFinite(slope)) return 'unavailable';
  return `${slope.toFixed(1)}°`;
}

function hostDocument(element: HTMLElement | undefined): Document | null {
  try {
    if (element && 'ownerDocument' in element && element.ownerDocument) return element.ownerDocument;
  } catch {
    return null;
  }
  try {
    const candidate = (globalThis as { document?: unknown }).document;
    if (candidate && typeof (candidate as Document).createElement === 'function') {
      return candidate as Document;
    }
  } catch {
    return null;
  }
  return null;
}

function isJsdomDocument(doc: Document): boolean {
  try {
    return /jsdom/i.test(doc.defaultView?.navigator?.userAgent ?? '');
  } catch {
    return false;
  }
}

function context2d(canvas: HTMLCanvasElement, doc: Document): CanvasRenderingContext2D | null {
  if (isJsdomDocument(doc) || typeof canvas.getContext !== 'function') return null;
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx || typeof ctx.fillText !== 'function') return null;
    return ctx;
  } catch {
    return null;
  }
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

function drawPanel(ctx: CanvasRenderingContext2D, state: ArmState): void {
  const width = CANVAS_WIDTH;
  const height = CANVAS_HEIGHT;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#14110e';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#7f663f';
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, width - 16, height - 16);

  ctx.fillStyle = '#f3efe6';
  ctx.font = '600 28px sans-serif';
  ctx.fillText('EVA wrist', 28, 48);
  ctx.font = '22px sans-serif';
  ctx.fillText(`East ${formatMetres(state.east_m)}`, 28, 92);
  ctx.fillText(`North ${formatMetres(state.north_m)}`, 28, 126);
  ctx.fillText(`Elevation ${formatMetres(state.elevation_m)}`, 28, 160);
  ctx.fillText(`Slope ${formatSlope(state.slope_deg)}`, 28, 194);
  ctx.fillText(`Route progress ${formatProgress(state.progress)}`, 28, 228);

  if (state.blocked === true) {
    ctx.fillStyle = '#ffb4a2';
    const reason = state.blockReason ? `: ${state.blockReason}` : '';
    ctx.fillText(`Step refused${reason}`, 28, 270);
    if (state.deviation_m !== null && Number.isFinite(state.deviation_m)) {
      ctx.fillText(`Corridor deviation ${formatMetres(state.deviation_m)}`, 28, 304);
    }
  } else if (state.gateChecked && state.blocked === false) {
    ctx.fillStyle = '#b7e4c7';
    ctx.fillText('Corridor clear', 28, 270);
  } else {
    ctx.fillStyle = '#f3efe6';
    ctx.fillText('Corridor not checked', 28, 270);
  }

  ctx.fillStyle = '#f3efe6';
  const walkNote =
    state.travelTimeComplete === false
      ? `incomplete, ${formatMetres(state.untimedDistance_m)} not timed`
      : state.travelTimeComplete === true
        ? 'complete for accepted distance'
        : 'completeness not stated';
  ctx.fillText(`Tobler walk time, no stops ${formatDuration(state.travelSeconds)} (${walkNote})`, 28, 338);
  ctx.fillText(`Tobler time left, no stops ${formatDuration(state.remainingSeconds)}`, 28, 372);
  ctx.font = '18px sans-serif';
  const gradeBasis =
    state.remainingUsesCurrentGrade === true
      ? 'Uses the slope sample at this pose for the whole remainder, not a signed climb.'
      : state.remainingUsesCurrentGrade === false
        ? 'Not a current-grade remainder.'
        : 'Grade basis was not provided.';
  const coverage =
    state.remainingCoversReturn === true
      ? 'Includes the return leg.'
      : state.remainingCoversReturn === false || state.remainingOutboundOnly
        ? 'Does not include the return leg.'
        : 'Return coverage was not provided.';
  ctx.fillText(gradeBasis, 28, 406);
  ctx.fillText(coverage, 28, 434);

  if (state.returnLegState === 'unavailable') {
    ctx.fillStyle = '#f6d58a';
    ctx.fillText('Return leg unavailable', 360, 92);
  } else if (state.returnLegState === 'complete') {
    ctx.fillStyle = '#b7e4c7';
    ctx.fillText('Return leg complete', 360, 92);
  } else if (state.returnLegState === 'active') {
    ctx.fillStyle = '#f3efe6';
    ctx.fillText('Return leg active', 360, 92);
  }
}

export function createMarswalkArm(options: MarswalkArmOptions): MarswalkArmHandle {
  const { camera } = options;
  const doc = hostDocument(options.domElement);
  const win = doc?.defaultView ?? null;
  const state = emptyState();

  let canvas: HTMLCanvasElement | null = null;
  let context: CanvasRenderingContext2D | null = null;
  if (doc) {
    try {
      const created = doc.createElement('canvas');
      created.width = CANVAS_WIDTH;
      created.height = CANVAS_HEIGHT;
      canvas = created;
      context = context2d(created, doc);
    } catch {
      canvas = null;
      context = null;
    }
  }

  let texture: THREE.CanvasTexture | null = null;
  if (canvas && context) {
    try {
      texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
    } catch {
      texture = null;
    }
  }

  const panelGeom = new THREE.PlaneGeometry(0.3, 0.1875);
  const panelMat = new THREE.MeshBasicMaterial({
    color: 0x14110e,
    transparent: true,
    opacity: 0.94,
    depthTest: false,
    side: THREE.DoubleSide,
    ...(texture ? { map: texture } : {}),
  });
  const panel = new THREE.Mesh(panelGeom, panelMat);
  panel.name = 'marswalk-arm-panel';
  panel.position.set(0.02, 0.08, -0.02);
  panel.frustumCulled = false;
  panel.renderOrder = 20;

  const cuffGeom = new THREE.BoxGeometry(0.028, 0.028, 0.12);
  const cuffMat = new THREE.MeshBasicMaterial({ color: 0xc4b8a5, depthTest: false });
  const cuff = new THREE.Mesh(cuffGeom, cuffMat);
  cuff.name = 'marswalk-arm-cuff';
  cuff.frustumCulled = false;
  cuff.renderOrder = 19;

  const group = new THREE.Group();
  group.name = 'marswalk-arm';
  group.position.set(0.28, -0.22, -0.48);
  group.rotation.set(-0.35, -0.45, 0.12);
  group.add(cuff, panel);
  group.frustumCulled = false;
  camera.add(group);

  let open = true;
  let disposed = false;
  let gpuDisposed = false;
  let acc = 1;
  let dirty = true;

  function paint(): void {
    if (!context || !texture || disposed) return;
    try {
      drawPanel(context, state);
      texture.needsUpdate = true;
    } catch {
      // A missing 2D implementation must not break the frame.
    }
  }

  function merge(telemetry: MarswalkArmTelemetry): void {
    const poseChanged =
      (telemetry.east_m !== undefined && telemetry.east_m !== state.east_m) ||
      (telemetry.north_m !== undefined && telemetry.north_m !== state.north_m) ||
      (telemetry.elevation_m !== undefined && telemetry.elevation_m !== state.elevation_m);
    if (telemetry.east_m !== undefined) state.east_m = telemetry.east_m;
    if (telemetry.north_m !== undefined) state.north_m = telemetry.north_m;
    if (telemetry.elevation_m !== undefined) state.elevation_m = telemetry.elevation_m;
    if (telemetry.slope_deg !== undefined) state.slope_deg = telemetry.slope_deg;
    if (telemetry.progress !== undefined) state.progress = telemetry.progress;
    if (telemetry.blocked !== undefined) state.blocked = telemetry.blocked;
    if (telemetry.gateChecked !== undefined) state.gateChecked = telemetry.gateChecked;
    if (telemetry.blockReason !== undefined) state.blockReason = telemetry.blockReason;
    if (telemetry.deviation_m !== undefined) state.deviation_m = telemetry.deviation_m;
    if (telemetry.returnLegState !== undefined) state.returnLegState = telemetry.returnLegState;
    if (telemetry.travelSeconds !== undefined) state.travelSeconds = telemetry.travelSeconds;
    if (telemetry.travelTimeComplete !== undefined) state.travelTimeComplete = telemetry.travelTimeComplete;
    if (telemetry.untimedDistance_m !== undefined) state.untimedDistance_m = telemetry.untimedDistance_m;
    if (telemetry.remainingSeconds !== undefined) state.remainingSeconds = telemetry.remainingSeconds;
    if (telemetry.remainingOutboundOnly !== undefined) {
      state.remainingOutboundOnly = telemetry.remainingOutboundOnly;
    }
    if (telemetry.remainingCoversReturn !== undefined) {
      state.remainingCoversReturn = telemetry.remainingCoversReturn;
    }
    if (telemetry.remainingUsesCurrentGrade !== undefined) {
      state.remainingUsesCurrentGrade = telemetry.remainingUsesCurrentGrade;
    }
    if (poseChanged && telemetry.gateChecked === undefined) {
      state.gateChecked = false;
      state.blocked = null;
      state.blockReason = null;
      state.deviation_m = null;
    }
    dirty = true;
  }

  function setOpen(next: boolean): void {
    if (disposed) return;
    open = next;
    group.visible = open;
    if (open) {
      dirty = true;
      acc = REDRAW_SECONDS;
    }
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (disposed || event.repeat) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (isEditableTarget(event.target, doc)) return;
    if (event.code !== 'KeyI') return;
    setOpen(!open);
  }

  function update(dtSeconds: number, telemetry?: MarswalkArmTelemetry): void {
    if (disposed) return;
    if (telemetry) merge(telemetry);
    if (!open) return;
    acc += Number.isFinite(dtSeconds) ? Math.max(0, dtSeconds) : 0;
    if (acc < REDRAW_SECONDS && !dirty) return;
    acc = 0;
    dirty = false;
    paint();
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    win?.removeEventListener('keydown', onKeyDown, true);
    group.removeFromParent();
    if (gpuDisposed) return;
    gpuDisposed = true;
    texture?.dispose();
    panelMat.dispose();
    cuffMat.dispose();
    panelGeom.dispose();
    cuffGeom.dispose();
  }

  if (win && typeof win.addEventListener === 'function') {
    win.addEventListener('keydown', onKeyDown, true);
  }

  return {
    group,
    update,
    setTelemetry(telemetry: MarswalkArmTelemetry): void {
      if (disposed) return;
      merge(telemetry);
    },
    toggle(): void {
      setOpen(!open);
    },
    setOpen,
    isOpen: () => open,
    dispose,
  };
}
