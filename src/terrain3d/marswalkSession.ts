import * as THREE from 'three';
import type { GridBundle, RouteCandidate } from '../contracts';
import { createMarswalkPlayer, type MarswalkPlayerHandle } from './marswalkPlayer';
import { createMarswalkPois } from './marswalkPois';
import { makeMarsSky } from './marswalkSky';
import {
  createProceduralTerrainFromBundle,
  createRouteOverlaysGroup,
  disposeObject3DTree,
} from './marswalkTerrain';

export interface MarswalkSessionOptions {
  bundle: GridBundle;
  container: HTMLElement;
  candidates: readonly RouteCandidate[];
  selectedCandidateId: string | null;
  verticalExaggeration: number;
  onBlocked: (message: string) => void;
  onCleared: () => void;
}

export interface MarswalkSession {
  player: MarswalkPlayerHandle;
  dispose: () => void;
}

export function startMarswalkSession(options: MarswalkSessionOptions): MarswalkSession {
  const { bundle, container, verticalExaggeration } = options;
  const canvas = document.createElement('canvas');
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  container.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 80000);
  const terrain = createProceduralTerrainFromBundle(bundle, { verticalExaggeration });
  const sky = makeMarsSky(scene);
  const pois = createMarswalkPois({
    bundle,
    origin: terrain.origin,
    verticalExaggeration,
    heightAtSceneXZ: (x, z) => terrain.heightAtSceneXZ(x, z),
  });
  const overlays = createRouteOverlaysGroup(
    bundle,
    terrain.origin,
    verticalExaggeration,
    options.candidates,
    options.selectedCandidateId,
    [],
    false,
    (x, z) => terrain.heightAtSceneXZ(x, z),
  );
  scene.add(terrain.group);
  scene.add(pois.group);
  scene.add(overlays);

  const selected = options.candidates.find((c) => c.candidateId === options.selectedCandidateId) ?? null;
  const player = createMarswalkPlayer({
    camera,
    domElement: canvas,
    terrain,
    bundle,
    origin: terrain.origin,
    verticalExaggeration,
    getActivePath: () => selected?.outbound.path ?? [],
    getActivePathCells: () => selected?.outbound.cells ?? [],
    onBlocked: (detail) => options.onBlocked(detail.message),
    onCleared: options.onCleared,
    getRouteBundleVersion: () => bundle.bundleVersion,
  });
  scene.add(player.root);

  const pose = player.readPose();
  camera.position.set(pose.sceneX + 8, pose.sceneY + 6, pose.sceneZ + 8);
  camera.lookAt(pose.sceneX, pose.sceneY, pose.sceneZ);

  const clock = new THREE.Clock();
  let frame = 0;
  let stopped = false;
  const resize = () => {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight || 360);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  };
  resize();
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  observer?.observe(container);

  const tick = () => {
    if (stopped) return;
    frame = window.requestAnimationFrame(tick);
    const dt = Math.min(0.05, clock.getDelta());
    player.update(dt);
    sky.updatePosition(camera);
    renderer.render(scene, camera);
  };
  tick();

  return {
    player,
    dispose: () => {
      stopped = true;
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      player.dispose();
      pois.dispose();
      overlays.dispose();
      sky.dispose();
      terrain.dispose();
      disposeObject3DTree(scene);
      renderer.dispose();
      canvas.remove();
    },
  };
}
