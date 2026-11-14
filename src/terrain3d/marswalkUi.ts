/**
 * English canvas helpers for the wrist and other low-rate panels.
 * Clamps the backing store before getContext so an oversized card cannot blank the view.
 * This module does not import three and does not read site.json.
 */

export const CANVAS_MAX_PX = 1024;

export type MarswalkPanel = {
  readonly canvas: HTMLCanvasElement | null;
  readonly context: CanvasRenderingContext2D | null;
  readonly widthPx: number;
  readonly heightPx: number;
  dispose(): void;
};

/** Clamp a pixel length into 1..maxPx. Non-finite or non-positive input returns 0. */
export function clampCanvasPx(px: number, maxPx: number = CANVAS_MAX_PX): number {
  if (!Number.isFinite(px) || px <= 0 || !Number.isFinite(maxPx) || maxPx <= 0) {
    return 0;
  }
  const rounded = Math.round(px);
  if (!Number.isFinite(rounded) || rounded <= 0) {
    return 0;
  }
  return Math.min(Math.round(maxPx), rounded);
}

function panelPixels(metres: number, pxPerM: number): number {
  if (!Number.isFinite(metres) || metres <= 0 || !Number.isFinite(pxPerM) || pxPerM <= 0) {
    return 0;
  }
  const raw = metres * pxPerM;
  if (!Number.isFinite(raw) || raw <= 0) {
    return 0;
  }
  return clampCanvasPx(raw, CANVAS_MAX_PX);
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  try {
    return canvas.getContext('2d');
  } catch {
    return null;
  }
}

function inertPanel(): MarswalkPanel {
  let disposed = false;
  return {
    canvas: null,
    context: null,
    widthPx: 0,
    heightPx: 0,
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
    },
  };
}

/**
 * Create one reusable canvas. Non-finite or non-positive metres yield a disposable
 * handle and do not throw. A null 2D context is returned as `context: null`.
 */
export function makePanel(widthM: number, heightM: number, pxPerM: number): MarswalkPanel {
  const widthPx = panelPixels(widthM, pxPerM);
  const heightPx = panelPixels(heightM, pxPerM);
  if (widthPx === 0 || heightPx === 0 || typeof document === 'undefined') {
    return inertPanel();
  }

  let canvas: HTMLCanvasElement;
  try {
    canvas = document.createElement('canvas');
    canvas.width = widthPx;
    canvas.height = heightPx;
  } catch {
    return inertPanel();
  }

  const context = context2d(canvas);
  let disposed = false;

  return {
    canvas,
    context,
    widthPx,
    heightPx,
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      const parent = canvas.parentNode;
      if (parent !== null) {
        parent.removeChild(canvas);
      }
      try {
        canvas.width = 1;
        canvas.height = 1;
      } catch {
        return;
      }
    },
  };
}

/** Append a rounded rectangle path. A null context returns without drawing. */
export function roundRect(
  ctx: CanvasRenderingContext2D | null,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  if (ctx === null) {
    return;
  }
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
    return;
  }
  if (width <= 0 || height <= 0) {
    return;
  }
  const safeRadius = Number.isFinite(radius) ? Math.max(0, radius) : 0;
  const r = Math.min(safeRadius, width / 2, height / 2);
  try {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  } catch {
    return;
  }
}

/** Draw one English string. A null context returns without drawing. */
export function drawText(
  ctx: CanvasRenderingContext2D | null,
  text: string,
  x: number,
  y: number,
  maxWidth?: number,
): void {
  if (ctx === null || !Number.isFinite(x) || !Number.isFinite(y)) {
    return;
  }
  try {
    if (maxWidth !== undefined && Number.isFinite(maxWidth) && maxWidth > 0) {
      ctx.fillText(text, x, y, maxWidth);
      return;
    }
    ctx.fillText(text, x, y);
  } catch {
    return;
  }
}

function measureWidth(ctx: CanvasRenderingContext2D | null, text: string): number {
  if (ctx === null) {
    return text.length * 8;
  }
  try {
    return ctx.measureText(text).width;
  } catch {
    return text.length * 8;
  }
}

/** Wrap English text to `maxWidth` pixels. A null context uses a rough character width. */
export function wrapText(
  ctx: CanvasRenderingContext2D | null,
  text: string,
  maxWidth: number,
): readonly string[] {
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0) {
    return [];
  }
  const limit = Number.isFinite(maxWidth) && maxWidth > 0 ? maxWidth : 280;
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current.length === 0 ? word : `${current} ${word}`;
    if (current.length === 0 || measureWidth(ctx, next) <= limit) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current.length > 0) {
    lines.push(current);
  }
  return lines;
}

/**
 * Format a horizontal length. Values under 1000 m stay in metres (`207 m`).
 * 1000 m and above use kilometres with a decimal point (`1.24 km`).
 */
export function formatDistance(metres: number): string {
  if (!Number.isFinite(metres)) {
    return '—';
  }
  const sign = metres < 0 ? '-' : '';
  const abs = Math.abs(metres);
  if (abs >= 1000) {
    return `${sign}${(abs / 1000).toFixed(2)} km`;
  }
  return `${sign}${Math.round(abs).toString()} m`;
}

function unitWord(count: number, singular: string, plural: string): string {
  return `${count.toString()} ${count === 1 ? singular : plural}`;
}

/**
 * Format a simulated duration as hours and minutes.
 * Non-finite and negative values are not shown as a countdown.
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '—';
  }
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) {
    return unitWord(minutes, 'minute', 'minutes');
  }
  return `${unitWord(hours, 'hour', 'hours')} ${unitWord(minutes, 'minute', 'minutes')}`;
}

/** Alias used by the merge-plan signature. Same hours-and-minutes formatting. */
export function formatHoursMinutes(seconds: number): string {
  return formatDuration(seconds);
}
