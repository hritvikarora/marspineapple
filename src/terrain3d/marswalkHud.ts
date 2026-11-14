/**
 * DOM HUD mounted inside the existing terrain view.
 * Owns the test-id nodes, does not teleport, and does not import three.
 */

import {
  captionSourceLines,
  coarseModeLine,
  creditsLineEn,
  datasetCredits,
  legendEntries,
  limitationLines,
  mineralShiftCredit,
  offPathPlainLanguage,
  productDisclaimers,
  shortLayerLabel,
} from './marswalkInfo';
import type { CorridorOffPathReason } from './coordBridge';

export type HudSnapshot = {
  readonly offPathBlocked: boolean;
  readonly offPathMessage: string;
  readonly rejectedCallout: string | null;
  readonly arrivalVisible: boolean;
  readonly arrivalText: string;
  readonly creditsOpen: boolean;
  readonly layerLabel: string;
  readonly mapPeekOpen: boolean;
  readonly traceNote: string | null;
  readonly wristOn: boolean;
  /** Optional compass mirror. The helmet canvas is invisible to assistive tech. */
  readonly headingDeg?: number | null;
};

export type MarswalkHudSnapshot = HudSnapshot;

export type MarswalkHudCallbacks = {
  readonly onRespawn: () => void;
  readonly onToggleSources: () => void;
  readonly onReturnToMenu: () => void;
  readonly onToggleWrist: () => void;
  readonly onToggleLayer: () => void;
  readonly onToggleMap: () => void;
  readonly onToggleTrace: () => void;
};

export type MarswalkHudHandle = {
  readonly update: (snapshot: HudSnapshot | null) => void;
  readonly dispose: () => void;
};

const STYLE_ELEMENT_ID = 'marswalk-hud-style';
const BLOCKED_TEXT = '✕ OFF-PATH BLOCKED. This step was refused.';

const HUD_CSS = `
.marswalk-hud {
  position: absolute;
  inset: 0;
  z-index: 4;
  pointer-events: none;
  color: #f6f1e7;
  font: 16px/1.4 system-ui, sans-serif;
}
.marswalk-hud, .marswalk-hud * {
  box-sizing: border-box;
}
.marswalk-hud .marswalk-hud-bar,
.marswalk-hud .marswalk-hud-card,
.marswalk-hud .marswalk-hud-dialog,
.marswalk-hud .marswalk-hud-button {
  pointer-events: auto;
}
.marswalk-hud .marswalk-hud-bar,
.marswalk-hud .marswalk-hud-card,
.marswalk-hud .marswalk-hud-dialog {
  background: #14110e;
  color: #f6f1e7;
}
.marswalk-hud .marswalk-hud-hints,
.marswalk-hud .marswalk-hud-bar {
  max-width: 100%;
}
.marswalk-hud .marswalk-hud-hints {
  margin: 8px;
  padding: 8px 10px;
  background: #14110e;
  color: #f6f1e7;
}
.marswalk-hud .marswalk-hud-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin: 0 8px 8px;
  padding: 8px;
}
.marswalk-hud .marswalk-hud-button {
  min-height: 44px;
  padding: 8px 10px;
  border: 1px solid #f6f1e7;
  background: #2a241c;
  color: #f6f1e7;
  font: inherit;
  text-align: left;
}
.marswalk-hud .marswalk-hud-button:focus-visible {
  outline: 2px solid #f6f1e7;
  outline-offset: 2px;
}
.marswalk-hud .marswalk-hud-layer {
  font-weight: 700;
}
.marswalk-hud .marswalk-hud-card,
.marswalk-hud .marswalk-hud-dialog {
  white-space: pre-wrap;
  margin: 8px;
  padding: 12px;
  border: 2px solid #f6f1e7;
  max-width: min(40rem, calc(100% - 16px));
  overflow-wrap: anywhere;
}
.marswalk-hud .marswalk-hud-alert {
  font-size: 1.15rem;
  font-weight: 700;
  margin: 0 0 8px;
}
.marswalk-hud .marswalk-hud-dialog {
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: 8px;
  max-height: min(70%, 32rem);
  overflow: auto;
}
.marswalk-hud .is-emphasis {
  animation: marswalk-hud-emphasis 0.6s ease-out 1;
}
@keyframes marswalk-hud-emphasis {
  from { outline: 2px solid #f6f1e7; }
  to { outline: 2px solid transparent; }
}
@media (prefers-reduced-motion: reduce) {
  .marswalk-hud .is-emphasis {
    animation: none;
  }
}
.marswalk-hud [hidden] {
  display: none !important;
}
`;

let styleUsers = 0;
let mountSerial = 0;

const EMPTY_SNAPSHOT: HudSnapshot = {
  offPathBlocked: false,
  offPathMessage: '',
  rejectedCallout: null,
  arrivalVisible: false,
  arrivalText: '',
  creditsOpen: false,
  layerLabel: '',
  mapPeekOpen: false,
  traceNote: null,
  wristOn: false,
};

function acquireHudStyle(): void {
  styleUsers += 1;
  if (typeof document === 'undefined' || document.head === null) {
    return;
  }
  if (document.getElementById(STYLE_ELEMENT_ID) !== null) {
    return;
  }
  const style = document.createElement('style');
  style.id = STYLE_ELEMENT_ID;
  style.textContent = HUD_CSS;
  document.head.appendChild(style);
}

function releaseHudStyle(): void {
  if (styleUsers > 0) {
    styleUsers -= 1;
  }
  if (styleUsers > 0 || typeof document === 'undefined') {
    return;
  }
  const style = document.getElementById(STYLE_ELEMENT_ID);
  if (style !== null) {
    style.remove();
  }
}

function prefersMotion(): boolean {
  if (typeof matchMedia !== 'function') {
    return true;
  }
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches !== true;
  } catch {
    return true;
  }
}

function pointerLocked(): boolean {
  try {
    return document.pointerLockElement != null;
  } catch {
    return false;
  }
}

function exitPointerLock(): void {
  const exitLock = document.exitPointerLock;
  if (typeof exitLock !== 'function') {
    return;
  }
  try {
    exitLock.call(document);
  } catch {
    return;
  }
}

function invoke(fn: (() => void) | undefined): void {
  if (typeof fn === 'function') {
    fn();
  }
}

function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) {
    node.textContent = text;
  }
}

function addLine(parent: HTMLElement, text: string): void {
  const paragraph = document.createElement('p');
  paragraph.textContent = text;
  parent.appendChild(paragraph);
}

function addList(parent: HTMLElement, lines: readonly string[]): void {
  const list = document.createElement('ul');
  for (const line of lines) {
    const item = document.createElement('li');
    item.textContent = line;
    list.appendChild(item);
  }
  parent.appendChild(list);
}

function isCorridorReason(value: string): value is CorridorOffPathReason {
  return value === 'steep-slope' || value === 'excluded-cell' || value === 'corridor-deviation';
}

function plainCallout(value: string | null): string {
  if (value === null) {
    return '';
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return '';
  }
  if (isCorridorReason(trimmed)) {
    return offPathPlainLanguage({ reason: trimmed });
  }
  return trimmed;
}

function makeButton(testId: string, label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'marswalk-hud-button';
  button.setAttribute('data-testid', testId);
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

/**
 * Append the HUD into `container`. Does not create or replace a terrain-view element.
 * `update(null)` clears the off-path alert, rejected callout, arrival, and credits.
 */
export function mountMarswalkHud(
  container: HTMLElement,
  callbacks: MarswalkHudCallbacks,
): MarswalkHudHandle {
  mountSerial += 1;
  const serial = mountSerial;
  const alertId = `marswalk-hud-alert-${serial.toString()}`;
  const dialogTitleId = `marswalk-hud-credits-${serial.toString()}`;

  const previousPosition = container.style.position;
  let forcedPosition = false;
  try {
    if (typeof getComputedStyle === 'function' && getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
      forcedPosition = true;
    }
  } catch {
    forcedPosition = false;
  }

  const root = document.createElement('div');
  root.className = 'marswalk-hud';

  const hints = document.createElement('p');
  hints.className = 'marswalk-hud-hints';
  hints.textContent =
    'L layer, M map, T trace, I wrist, C credits. These buttons work without a keyboard.';
  root.appendChild(hints);

  const bar = document.createElement('div');
  bar.className = 'marswalk-hud-bar';

  const onLayerClick = (): void => invoke(callbacks.onToggleLayer);
  const onMapClick = (): void => invoke(callbacks.onToggleMap);
  const onTraceClick = (): void => invoke(callbacks.onToggleTrace);
  const onWristClick = (): void => invoke(callbacks.onToggleWrist);
  const onSourcesClick = (): void => invoke(callbacks.onToggleSources);
  const onRespawnClick = (): void => invoke(callbacks.onRespawn);
  const onReturnClick = (): void => invoke(callbacks.onReturnToMenu);

  const layerButton = makeButton('layer-toggle', 'Layer (L)', onLayerClick);
  const mapButton = makeButton('map-peek-toggle', 'Map (M)', onMapClick);
  const traceButton = makeButton('trace-toggle', 'Trace (T)', onTraceClick);
  const wristButton = makeButton('wrist-toggle', 'Wrist (I)', onWristClick);
  const sourcesButton = makeButton('sources-toggle', 'Sources (C)', onSourcesClick);
  const respawnButton = makeButton('respawn-safe-button', 'Respawn', onRespawnClick);
  const returnButton = makeButton('return-to-start-menu', 'Return to Start Menu', onReturnClick);

  const layerLabel = document.createElement('span');
  layerLabel.className = 'marswalk-hud-layer';
  layerLabel.setAttribute('data-testid', 'layer-label');

  const heading = document.createElement('span');
  heading.setAttribute('data-testid', 'heading-readout');

  bar.append(layerButton, layerLabel, mapButton, traceButton, wristButton, sourcesButton, heading, respawnButton, returnButton);
  root.appendChild(bar);

  const mapNote = document.createElement('p');
  mapNote.className = 'marswalk-hud-card';
  mapNote.setAttribute('role', 'status');
  mapNote.setAttribute('aria-live', 'polite');
  mapNote.setAttribute('data-testid', 'map-peek-note');
  root.appendChild(mapNote);

  const traceNote = document.createElement('p');
  traceNote.className = 'marswalk-hud-card';
  traceNote.setAttribute('role', 'status');
  traceNote.setAttribute('aria-live', 'polite');
  traceNote.setAttribute('data-testid', 'trace-note');
  root.appendChild(traceNote);

  const block = document.createElement('div');
  block.className = 'marswalk-hud-card';

  const alert = document.createElement('div');
  alert.className = 'marswalk-hud-alert';
  alert.id = alertId;
  alert.setAttribute('data-testid', 'off-path-alert');
  alert.setAttribute('role', 'alert');
  block.appendChild(alert);

  const detail = document.createElement('p');
  detail.setAttribute('data-testid', 'off-path-detail');
  detail.setAttribute('role', 'status');
  detail.setAttribute('aria-live', 'polite');
  block.appendChild(detail);
  root.appendChild(block);

  const callout = document.createElement('p');
  callout.className = 'marswalk-hud-card';
  callout.setAttribute('data-testid', 'rejected-path-callout');
  callout.setAttribute('role', 'status');
  callout.setAttribute('aria-live', 'polite');
  root.appendChild(callout);

  const arrival = document.createElement('section');
  arrival.className = 'marswalk-hud-card';
  const arrivalSummary = document.createElement('div');
  arrivalSummary.setAttribute('data-testid', 'arrival-summary');
  arrival.appendChild(arrivalSummary);
  root.appendChild(arrival);

  const dialog = document.createElement('div');
  dialog.className = 'marswalk-hud-dialog';
  dialog.setAttribute('data-testid', 'credits-dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'false');
  dialog.setAttribute('aria-labelledby', dialogTitleId);

  const dialogTitle = document.createElement('h2');
  dialogTitle.id = dialogTitleId;
  dialogTitle.textContent = 'Sources and credits';
  dialog.appendChild(dialogTitle);

  const notesTitle = document.createElement('h3');
  notesTitle.textContent = 'Product notes';
  dialog.appendChild(notesTitle);
  addList(dialog, productDisclaimers());

  const creditsTitle = document.createElement('h3');
  creditsTitle.textContent = 'Dataset credits';
  dialog.appendChild(creditsTitle);
  for (const credit of datasetCredits()) {
    const section = document.createElement('section');
    const title = document.createElement('h4');
    title.textContent = credit.title;
    section.appendChild(title);
    addLine(section, credit.creditLine);
    addLine(section, credit.licence);
    addLine(
      section,
      credit.doi === null ? 'No DOI is registered for this product.' : `DOI ${credit.doi}`,
    );
    addLine(section, credit.citation);
    for (const url of credit.urls) {
      addLine(section, url);
    }
    dialog.appendChild(section);
  }
  addLine(dialog, mineralShiftCredit());
  addLine(dialog, creditsLineEn());

  const packTitle = document.createElement('h3');
  packTitle.textContent = 'Caption pack sources';
  dialog.appendChild(packTitle);
  addList(dialog, captionSourceLines());
  addLine(dialog, coarseModeLine());

  const limitTitle = document.createElement('h3');
  limitTitle.textContent = 'Limitations';
  dialog.appendChild(limitTitle);
  addList(dialog, limitationLines());

  const legendTitle = document.createElement('h3');
  legendTitle.textContent = 'Legend';
  dialog.appendChild(legendTitle);
  addList(
    dialog,
    legendEntries().map((entry) =>
      entry.units.length > 0 ? `${entry.name} (${entry.units}): ${entry.text}` : `${entry.name}: ${entry.text}`,
    ),
  );

  const closeCredits = makeButton('credits-close', 'Close sources', onSourcesClick);
  dialog.appendChild(closeCredits);
  root.appendChild(dialog);

  container.appendChild(root);
  acquireHudStyle();

  let disposed = false;
  let current: HudSnapshot = EMPTY_SNAPSHOT;
  let wasBlocked = false;
  let arrivalDismissed = false;

  function focusTerrain(): void {
    try {
      container.focus();
    } catch {
      return;
    }
  }

  function onEscape(ev: KeyboardEvent): void {
    if (disposed || ev.key !== 'Escape' || pointerLocked()) {
      return;
    }
    if (current.creditsOpen) {
      ev.preventDefault();
      invoke(callbacks.onToggleSources);
      return;
    }
    if (current.arrivalVisible && !arrivalDismissed) {
      ev.preventDefault();
      arrivalDismissed = true;
      paint(current);
    }
  }

  root.addEventListener('keydown', onEscape);

  function paint(snapshot: HudSnapshot): void {
    const blocked = snapshot.offPathBlocked;
    setText(alert, blocked ? BLOCKED_TEXT : '');
    setText(detail, blocked ? plainCallout(snapshot.offPathMessage) : '');
    block.hidden = !blocked;
    if (blocked) {
      respawnButton.setAttribute('aria-describedby', alertId);
      if (!wasBlocked && prefersMotion()) {
        block.classList.add('is-emphasis');
      }
    } else {
      respawnButton.removeAttribute('aria-describedby');
      block.classList.remove('is-emphasis');
    }
    if (blocked && !wasBlocked) {
      exitPointerLock();
      try {
        respawnButton.focus();
      } catch {
        wasBlocked = blocked;
      }
    }
    wasBlocked = blocked;

    const calloutText = plainCallout(snapshot.rejectedCallout);
    setText(callout, calloutText);
    callout.hidden = calloutText.length === 0;

    const showArrival = snapshot.arrivalVisible && !arrivalDismissed;
    setText(arrivalSummary, showArrival ? snapshot.arrivalText : '');
    arrival.hidden = !showArrival;

    setText(layerLabel, shortLayerLabel(snapshot.layerLabel));
    mapButton.setAttribute('aria-pressed', snapshot.mapPeekOpen ? 'true' : 'false');
    wristButton.setAttribute('aria-pressed', snapshot.wristOn ? 'true' : 'false');
    const traceText = snapshot.traceNote === null ? '' : snapshot.traceNote.trim();
    traceButton.setAttribute('aria-pressed', traceText.length > 0 ? 'true' : 'false');
    setText(mapNote, snapshot.mapPeekOpen ? 'Map peek is open.' : '');
    mapNote.hidden = !snapshot.mapPeekOpen;
    setText(traceNote, traceText);
    traceNote.hidden = traceText.length === 0;
    dialog.hidden = !snapshot.creditsOpen;

    const headingDeg = snapshot.headingDeg;
    if (typeof headingDeg === 'number' && Number.isFinite(headingDeg)) {
      const wrapped = ((headingDeg % 360) + 360) % 360;
      setText(heading, `Heading ${wrapped.toFixed(0)}°`);
      heading.hidden = false;
    } else {
      setText(heading, '');
      heading.hidden = true;
    }
  }

  function update(snapshot: HudSnapshot | null): void {
    if (disposed) {
      return;
    }
    const next = snapshot ?? EMPTY_SNAPSHOT;
    if (!next.arrivalVisible) {
      arrivalDismissed = false;
    }
    current = next;
    paint(next);
  }

  function dispose(): void {
    if (disposed) {
      return;
    }
    disposed = true;
    root.removeEventListener('keydown', onEscape);
    layerButton.removeEventListener('click', onLayerClick);
    mapButton.removeEventListener('click', onMapClick);
    traceButton.removeEventListener('click', onTraceClick);
    wristButton.removeEventListener('click', onWristClick);
    sourcesButton.removeEventListener('click', onSourcesClick);
    respawnButton.removeEventListener('click', onRespawnClick);
    returnButton.removeEventListener('click', onReturnClick);
    closeCredits.removeEventListener('click', onSourcesClick);
    const active = document.activeElement;
    if (active !== null && root.contains(active)) {
      focusTerrain();
    }
    root.remove();
    if (forcedPosition) {
      container.style.position = previousPosition;
    }
    releaseHudStyle();
  }

  update(EMPTY_SNAPSHOT);

  return { update, dispose };
}
