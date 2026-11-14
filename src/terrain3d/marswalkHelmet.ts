/**
 * Visor rim attached to a camera. No camera means no mesh.
 * The compass canvas is size-capped and skipped when getContext('2d') is null.
 */

import * as THREE from 'three';
import { CANVAS_MAX_PX, clampCanvasPx } from './marswalkUi';

export type MarswalkHelmet = {
  update(headingDeg: number): void;
  setVisible(visible: boolean): void;
  dispose(): void;
};

const COMPASS_PX = 256;

function prefersReducedMotion(): boolean {
  if (typeof matchMedia !== 'function') {
    return false;
  }
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches === true;
  } catch {
    return false;
  }
}

function shortestDelta(from: number, to: number): number {
  const raw = (((to - from) % 360) + 360) % 360;
  return raw > 180 ? raw - 360 : raw;
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  try {
    return canvas.getContext('2d');
  } catch {
    return null;
  }
}

function disposeQuiet(resource: { dispose(): void }): void {
  try {
    resource.dispose();
  } catch {
    return;
  }
}

function inertHelmet(): MarswalkHelmet {
  let disposed = false;
  return {
    update(): void {
      if (disposed) {
        return;
      }
    },
    setVisible(): void {
      if (disposed) {
        return;
      }
    },
    dispose(): void {
      disposed = true;
    },
  };
}

type CompassFace = {
  readonly ctx: CanvasRenderingContext2D;
  readonly texture: THREE.CanvasTexture;
  readonly mesh: THREE.Mesh;
};

function paintCompass(ctx: CanvasRenderingContext2D, headingDeg: number, texture: THREE.Texture | null): void {
  const size = ctx.canvas.width;
  if (!(size > 0)) {
    return;
  }
  const center = size / 2;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#14110e';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#f6f1e7';
  ctx.lineWidth = Math.max(2, size * 0.02);
  ctx.beginPath();
  ctx.arc(center, center, size * 0.38, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#f6f1e7';
  ctx.font = 'bold 28px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', center, size * 0.18);
  ctx.fillText('E', size * 0.82, center);
  ctx.fillText('S', center, size * 0.82);
  ctx.fillText('W', size * 0.18, center);
  const angle = (headingDeg * Math.PI) / 180 - Math.PI / 2;
  ctx.beginPath();
  ctx.moveTo(center, center);
  ctx.lineTo(center + Math.cos(angle) * size * 0.28, center + Math.sin(angle) * size * 0.28);
  ctx.stroke();
  if (texture !== null) {
    texture.needsUpdate = true;
  }
}

function makeCompass(track: <T extends { dispose(): void }>(value: T) => T): CompassFace | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const px = clampCanvasPx(COMPASS_PX, CANVAS_MAX_PX);
  if (px <= 0) {
    return null;
  }
  let canvas: HTMLCanvasElement;
  try {
    canvas = document.createElement('canvas');
    canvas.width = px;
    canvas.height = px;
  } catch {
    return null;
  }
  const ctx = context2d(canvas);
  if (ctx === null) {
    return null;
  }
  let texture: THREE.CanvasTexture | null = null;
  try {
    texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
  } catch {
    if (texture !== null) {
      disposeQuiet(texture);
    }
    return null;
  }
  if (texture === null) {
    return null;
  }
  track(texture);
  const geometry = track(new THREE.PlaneGeometry(0.12, 0.12));
  const material = track(
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: false,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'marswalk-helmet-compass';
  mesh.position.set(0, -0.12, 0.02);
  mesh.renderOrder = 1001;
  mesh.frustumCulled = false;
  paintCompass(ctx, 0, texture);
  return { ctx, texture, mesh };
}

function mountRim(camera: THREE.Camera): MarswalkHelmet {
  const disposables: Array<{ dispose(): void }> = [];
  const track = <T extends { dispose(): void }>(value: T): T => {
    disposables.push(value);
    return value;
  };
  let group: THREE.Group | null = null;
  try {
    const ringGeometry = track(new THREE.RingGeometry(0.16, 0.24, 48));
    const ringMaterial = track(
      new THREE.MeshBasicMaterial({
        color: 0x14110e,
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.name = 'marswalk-helmet-rim';
    ring.renderOrder = 1000;
    ring.frustumCulled = false;

    group = new THREE.Group();
    group.name = 'marswalk-helmet';
    group.position.set(0, 0, -0.5);
    group.add(ring);

    const compass = makeCompass(track);
    if (compass !== null) {
      group.add(compass.mesh);
    }

    const rim = group;
    camera.add(rim);

    let disposed = false;
    let shownDeg = 0;
    let targetDeg = 0;
    let rafId = 0;

    function stopSweep(): void {
      if (rafId !== 0 && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafId);
      }
      rafId = 0;
    }

    function paint(headingDeg: number): void {
      if (compass === null) {
        return;
      }
      try {
        paintCompass(compass.ctx, headingDeg, compass.texture);
      } catch {
        return;
      }
    }

    function step(): void {
      if (disposed) {
        rafId = 0;
        return;
      }
      if (prefersReducedMotion()) {
        shownDeg = targetDeg;
        rafId = 0;
        paint(shownDeg);
        return;
      }
      const delta = shortestDelta(shownDeg, targetDeg);
      if (Math.abs(delta) < 0.4) {
        shownDeg = targetDeg;
        rafId = 0;
        paint(shownDeg);
        return;
      }
      shownDeg += delta * 0.35;
      paint(shownDeg);
      rafId = requestAnimationFrame(step);
    }

    return {
      update(headingDeg: number): void {
        if (disposed) {
          return;
        }
        targetDeg = Number.isFinite(headingDeg) ? headingDeg : 0;
        if (prefersReducedMotion() || typeof requestAnimationFrame !== 'function') {
          stopSweep();
          shownDeg = targetDeg;
          paint(shownDeg);
          return;
        }
        if (rafId !== 0) {
          return;
        }
        rafId = requestAnimationFrame(step);
      },
      setVisible(visible: boolean): void {
        if (disposed) {
          return;
        }
        rim.visible = visible;
      },
      dispose(): void {
        if (disposed) {
          return;
        }
        disposed = true;
        stopSweep();
        try {
          camera.remove(rim);
        } catch {
          releaseDisposables(disposables);
          return;
        }
        releaseDisposables(disposables);
      },
    };
  } catch {
    if (group !== null) {
      try {
        camera.remove(group);
      } catch {
        releaseDisposables(disposables);
        return inertHelmet();
      }
    }
    releaseDisposables(disposables);
    return inertHelmet();
  }
}

function releaseDisposables(items: Array<{ dispose(): void }>): void {
  for (const item of items) {
    disposeQuiet(item);
  }
  items.length = 0;
}

/** Attach a visor rim only when `camera` is present. Otherwise every call is a no-op. */
export function attachMarswalkHelmet(camera: THREE.Camera | null): MarswalkHelmet {
  if (camera === null) {
    return inertHelmet();
  }
  return mountRim(camera);
}
