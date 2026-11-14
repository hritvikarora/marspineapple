import * as THREE from 'three';
import type { GridBundle, LocalPoint } from '../contracts';
import { localToSceneXYZ, sampleElevationBilinear } from './coordBridge';
import { disposeObject3DTree } from './marswalkTerrain';
import type { MarswalkPoisHandle, SceneOrigin, UnifiedPoi } from './marswalkTypes';

export type { MarswalkPoisHandle } from './marswalkTypes';

export interface MarswalkPoisOptions {
  readonly bundle: GridBundle;
  readonly origin: SceneOrigin;
  readonly verticalExaggeration: number;
  readonly heightAtSceneXZ: (x: number, z: number) => number;
  readonly pois?: readonly UnifiedPoi[];
  readonly start?: LocalPoint | null;
  readonly destination?: LocalPoint | null;
  readonly destinationLabel?: string;
}

const COLOR_START_BEACON = 0x22d3ee;
const COLOR_START_HALO = 0x34d399;
const COLOR_DEST_BEACON = 0xfbbf24;
const COLOR_DEST_HALO = 0xf59e0b;
const COLOR_BASE_POI = 0xfacc15;
const COLOR_DEPOT_POI = 0xc084fc;
const COLOR_SCIENCE_POI = 0x38bdf8;
const COLOR_VISITED_POI = 0x4ade80;
const MIN_EXAGGERATION = 0.25;
const MAX_EXAGGERATION = 10.0;

function clampExaggeration(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 1;
  }
  return Math.min(MAX_EXAGGERATION, Math.max(MIN_EXAGGERATION, value));
}

interface PoiVisualEntry {
  readonly poi: UnifiedPoi;
  readonly root: THREE.Group;
  readonly beacon: THREE.Mesh;
  readonly beaconMat: THREE.MeshBasicMaterial;
  readonly diamond: THREE.Mesh;
  readonly diamondMat: THREE.MeshBasicMaterial;
  readonly labelMesh: THREE.Mesh | null;
  readonly cardMesh: THREE.Mesh | null;
  readonly phase: number;
  readonly sceneX: number;
  readonly sceneZ: number;
  photoImg: HTMLImageElement | null;
  photoLoadRequested: boolean;
  photoLoaded: boolean;
  anchored: boolean;
}

interface EndpointVisualEntry {
  readonly kind: 'start' | 'destination';
  readonly root: THREE.Group;
  readonly beacon: THREE.Mesh;
  readonly halo: THREE.Mesh;
  readonly diamond: THREE.Mesh;
  labelMesh: THREE.Mesh | null;
  labelText: string;
  point: LocalPoint | null;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  fontSize: number,
  color: string,
  weight: number,
  maxLines = 8,
): number {
  ctx.font = `${weight} ${fontSize}px system-ui, -apple-system, Segoe UI, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  let line = '';
  let cy = y;
  let count = 0;

  for (const word of text.split(/\s+/)) {
    if (!word) continue;
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      ctx.fillText(line, x, cy);
      cy += lineHeight;
      line = word;
      count++;
      if (count >= maxLines - 1) break;
    } else {
      line = candidate;
    }
  }
  if (line) {
    ctx.fillText(line, x, cy);
    cy += lineHeight;
  }
  return cy;
}

function createLabelBillboard(
  label: string,
  accentHex: string,
): { mesh: THREE.Mesh; canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture } | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }

  const paint = (text: string): void => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawRoundedRect(ctx, 8, 8, canvas.width - 16, canvas.height - 16, 28);
    ctx.fillStyle = 'rgba(14, 9, 6, 0.80)';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = accentHex;
    ctx.stroke();

    ctx.font = '700 42px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const trimmed = text.length > 26 ? `${text.slice(0, 25)}…` : text;
    ctx.fillText(trimmed, canvas.width / 2, canvas.height / 2);
  };

  paint(label);

  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;

  const geo = new THREE.PlaneGeometry(4.8, 1.2);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 7;
  mesh.renderOrder = 8;
  return { mesh, canvas, ctx, tex };
}

function createPoiCardBillboard(
  poi: UnifiedPoi,
  photo: HTMLImageElement | null,
): THREE.Mesh | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 640;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }

  paintCardCanvas(ctx, canvas.width, canvas.height, poi, photo);

  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;

  const geo = new THREE.PlaneGeometry(2.6, 1.625);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.visible = false;
  mesh.renderOrder = 9;
  mesh.userData = { canvas, ctx, tex };
  return mesh;
}

function paintCardCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  poi: UnifiedPoi,
  photo: HTMLImageElement | null,
): void {
  ctx.clearRect(0, 0, width, height);
  drawRoundedRect(ctx, 6, 6, width - 12, height - 12, 28);
  ctx.fillStyle = 'rgba(16, 10, 7, 0.92)';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#ffb37a';
  ctx.stroke();

  const headerTop = wrapCanvasText(ctx, poi.name, 36, 58, width - 72, 38, 32, '#ffffff', 700, 2);
  let textX = 36;
  let textW = width - 72;
  let textY = headerTop + 26;

  if (poi.photoUrl) {
    const pw = 380;
    const ph = 240;
    if (photo && photo.complete && photo.naturalWidth > 0) {
      ctx.drawImage(photo, 36, headerTop + 8, pw, ph);
    } else {
      ctx.fillStyle = '#3a2418';
      ctx.fillRect(36, headerTop + 8, pw, ph);
    }
    ctx.font = '600 18px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.fillStyle = '#ffb37a';
    ctx.textAlign = 'left';
    const solTag = poi.sol !== null ? `sol ${poi.sol}` : 'Jezero crater';
    ctx.fillText(`Rover imagery (${solTag}) — NASA/JPL-Caltech`, 36, headerTop + ph + 36);
    textX = 36 + pw + 28;
    textW = width - textX - 36;
  }

  textY = wrapCanvasText(ctx, poi.summary, textX, textY, textW, 31, 22, '#f5ebe1', 400, 10);

  if (poi.medaTempC) {
    ctx.font = '600 20px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.fillStyle = '#7fe0ff';
    ctx.textAlign = 'left';
    ctx.fillText(
      `MEDA air temp (sol ${poi.medaTempC.sol}): ${Math.round(poi.medaTempC.min)} to ${Math.round(poi.medaTempC.max)} °C`,
      textX,
      Math.min(textY + 14, height - 38),
    );
  }
}

function resolvePointSceneY(
  point: LocalPoint,
  explicitElev_m: number | null | undefined,
  bundle: GridBundle,
  origin: SceneOrigin,
  exaggeration: number,
  heightAtSceneXZ: (x: number, z: number) => number,
): { x: number; y: number; z: number } {
  const { x: sx, z: sz } = localToSceneXYZ(
    { east_m: point.east_m, north_m: point.north_m, elevation_m: origin.elevation_m },
    origin,
    exaggeration,
  );
  const terrainY = heightAtSceneXZ(sx, sz);
  if (Number.isFinite(terrainY)) {
    return { x: sx, y: terrainY, z: sz };
  }
  const bilinear = sampleElevationBilinear(bundle.manifest.grid, bundle.elevation, point);
  const elev = bilinear ?? explicitElev_m;
  if (elev !== null && elev !== undefined && Number.isFinite(elev)) {
    return { x: sx, y: (elev - origin.elevation_m) * exaggeration, z: sz };
  }
  return { x: sx, y: 0, z: sz };
}

function poiColorHex(poi: UnifiedPoi, isVisited: boolean): number {
  if (isVisited && poi.kind !== 'base') {
    return COLOR_VISITED_POI;
  }
  switch (poi.kind) {
    case 'base':
    case 'outpost':
      return COLOR_BASE_POI;
    case 'sample-depot':
      return COLOR_DEPOT_POI;
    default:
      return COLOR_SCIENCE_POI;
  }
}

/**
 * Renders Point A (`Start` cyan/green), Point B (`Destination` amber/gold), and distinct
 * unified English Jezero / bundle POIs (`threeforks` kept strictly separate from `poi-p5`).
 */
export function createMarswalkPois(options: MarswalkPoisOptions): MarswalkPoisHandle {
  const { bundle, origin, heightAtSceneXZ } = options;
  let verticalExaggeration = clampExaggeration(options.verticalExaggeration);
  let disposed = false;

  const group = new THREE.Group();
  group.name = 'marswalk-pois-group';

  const beaconGeo = new THREE.CylinderGeometry(0.28, 0.28, 72, 10, 1, true);
  beaconGeo.translate(0, 36, 0);
  const diamondGeo = new THREE.OctahedronGeometry(0.95, 0);
  const haloGeo = new THREE.RingGeometry(1.15, 1.9, 28);
  haloGeo.rotateX(-Math.PI / 2);

  const visitedSet = new Set<string>();
  const poiMap = new Map<string, PoiVisualEntry>();

  const buildEndpointEntry = (
    kind: 'start' | 'destination',
    beaconColor: number,
    haloColor: number,
    defaultLabel: string,
    accentHex: string,
  ): EndpointVisualEntry => {
    const root = new THREE.Group();
    root.name = `poi-endpoint-${kind}`;
    root.visible = false;
    root.userData = { endpoint: kind };

    const beaconMat = new THREE.MeshBasicMaterial({
      color: beaconColor,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.userData = { endpoint: kind };
    root.add(beacon);

    const haloMat = new THREE.MeshBasicMaterial({
      color: haloColor,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.position.y = 0.18;
    root.add(halo);

    const diamondMat = new THREE.MeshBasicMaterial({
      color: beaconColor,
      toneMapped: false,
    });
    const diamond = new THREE.Mesh(diamondGeo, diamondMat);
    diamond.position.y = 2.6;
    root.add(diamond);

    const billboard = createLabelBillboard(defaultLabel, accentHex);
    if (billboard) {
      billboard.mesh.userData = {
        canvas: billboard.canvas,
        ctx: billboard.ctx,
        tex: billboard.tex,
        accentHex,
      };
      root.add(billboard.mesh);
    }

    group.add(root);
    return {
      kind,
      root,
      beacon,
      halo,
      diamond,
      labelMesh: billboard ? billboard.mesh : null,
      labelText: defaultLabel,
      point: null,
    };
  };

  const startEntry = buildEndpointEntry(
    'start',
    COLOR_START_BEACON,
    COLOR_START_HALO,
    'Start (Point A)',
    '#22d3ee',
  );
  const destEntry = buildEndpointEntry(
    'destination',
    COLOR_DEST_BEACON,
    COLOR_DEST_HALO,
    options.destinationLabel ?? 'Destination (Point B)',
    '#fbbf24',
  );

  const repaintEndpointLabel = (entry: EndpointVisualEntry, nextText: string): void => {
    if (entry.labelText === nextText || !entry.labelMesh) {
      entry.labelText = nextText;
      return;
    }
    entry.labelText = nextText;
    const data = entry.labelMesh.userData as {
      canvas?: HTMLCanvasElement;
      ctx?: CanvasRenderingContext2D;
      tex?: THREE.CanvasTexture;
      accentHex?: string;
    };
    if (!data.canvas || !data.ctx || !data.tex) {
      return;
    }
    data.ctx.clearRect(0, 0, data.canvas.width, data.canvas.height);
    drawRoundedRect(data.ctx, 8, 8, data.canvas.width - 16, data.canvas.height - 16, 28);
    data.ctx.fillStyle = 'rgba(14, 9, 6, 0.80)';
    data.ctx.fill();
    data.ctx.lineWidth = 4;
    data.ctx.strokeStyle = data.accentHex ?? '#fbbf24';
    data.ctx.stroke();
    data.ctx.font = '700 42px system-ui, -apple-system, Segoe UI, sans-serif';
    data.ctx.fillStyle = '#ffffff';
    data.ctx.textAlign = 'center';
    data.ctx.textBaseline = 'middle';
    const trimmed = nextText.length > 26 ? `${nextText.slice(0, 25)}…` : nextText;
    data.ctx.fillText(trimmed, data.canvas.width / 2, data.canvas.height / 2);
    data.tex.needsUpdate = true;
  };

  const clearPoiEntries = (): void => {
    for (const entry of poiMap.values()) {
      if (entry.photoImg) {
        entry.photoImg.onload = null;
        entry.photoImg.onerror = null;
        entry.photoImg.src = '';
        entry.photoImg = null;
      }
      entry.root.parent?.remove(entry.root);
      // Dispose per-POI geometry/materials/textures without freeing shared beacon/diamond geometry.
      entry.beaconMat.dispose();
      entry.diamondMat.dispose();
      if (entry.labelMesh) {
        disposeObject3DTree(entry.labelMesh);
      }
      if (entry.cardMesh) {
        disposeObject3DTree(entry.cardMesh);
      }
    }
    poiMap.clear();
  };

  const syncAllPositions = (): void => {
    for (const ep of [startEntry, destEntry]) {
      if (!ep.point) {
        ep.root.visible = false;
        continue;
      }
      const pos = resolvePointSceneY(
        ep.point,
        null,
        bundle,
        origin,
        verticalExaggeration,
        heightAtSceneXZ,
      );
      ep.root.position.set(pos.x, pos.y, pos.z);
      ep.root.visible = true;
    }

    for (const entry of poiMap.values()) {
      const pos = resolvePointSceneY(
        entry.poi.position,
        entry.poi.elev_m,
        bundle,
        origin,
        verticalExaggeration,
        heightAtSceneXZ,
      );
      entry.root.position.set(pos.x, pos.y, pos.z);
    }
  };

  const setEndpoints = (
    start: LocalPoint | null,
    destination: LocalPoint | null,
    destinationLabel?: string,
  ): void => {
    if (disposed) return;
    startEntry.point = start ? { ...start } : null;
    destEntry.point = destination ? { ...destination } : null;
    if (destinationLabel !== undefined) {
      repaintEndpointLabel(destEntry, destinationLabel || 'Destination (Point B)');
    }
    syncAllPositions();
  };

  const setPois = (pois: readonly UnifiedPoi[]): void => {
    if (disposed) return;
    clearPoiEntries();

    let index = 0;
    for (const poi of pois) {
      if (poiMap.has(poi.id)) {
        continue;
      }
      const visited = visitedSet.has(poi.id);
      const hex = poiColorHex(poi, visited);
      const root = new THREE.Group();
      root.name = `poi-${poi.id}`;
      root.userData = { poiId: poi.id, kind: poi.kind };

      const beaconMat = new THREE.MeshBasicMaterial({
        color: hex,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      const beacon = new THREE.Mesh(beaconGeo, beaconMat);
      beacon.userData = { poiId: poi.id };
      root.add(beacon);

      const diamondMat = new THREE.MeshBasicMaterial({
        color: hex,
        toneMapped: false,
      });
      const diamond = new THREE.Mesh(diamondGeo, diamondMat);
      diamond.position.y = 2.2;
      diamond.userData = { poiId: poi.id };
      root.add(diamond);

      const labelText = poi.shortLabel || poi.name;
      const accentStr = `#${hex.toString(16).padStart(6, '0')}`;
      const billboard = createLabelBillboard(labelText, accentStr);
      if (billboard) {
        root.add(billboard.mesh);
      }

      const cardMesh = createPoiCardBillboard(poi, null);
      if (cardMesh) {
        root.add(cardMesh);
      }

      const pos = resolvePointSceneY(
        poi.position,
        poi.elev_m,
        bundle,
        origin,
        verticalExaggeration,
        heightAtSceneXZ,
      );
      root.position.set(pos.x, pos.y, pos.z);
      group.add(root);

      poiMap.set(poi.id, {
        poi,
        root,
        beacon,
        beaconMat,
        diamond,
        diamondMat,
        labelMesh: billboard ? billboard.mesh : null,
        cardMesh,
        phase: index * 0.85,
        sceneX: pos.x,
        sceneZ: pos.z,
        photoImg: null,
        photoLoadRequested: false,
        photoLoaded: false,
        anchored: false,
      });
      index++;
    }
  };

  const setVisited = (visitedIds: ReadonlySet<string>): void => {
    if (disposed) return;
    visitedSet.clear();
    for (const id of visitedIds) {
      visitedSet.add(id);
    }
    for (const entry of poiMap.values()) {
      const col = poiColorHex(entry.poi, visitedSet.has(entry.poi.id));
      entry.beaconMat.color.setHex(col);
      entry.diamondMat.color.setHex(col);
    }
  };

  const ensureEntryPhotoLoaded = (entry: PoiVisualEntry): void => {
    if (
      disposed ||
      entry.photoLoadRequested ||
      !entry.poi.photoUrl ||
      typeof Image === 'undefined' ||
      !entry.cardMesh
    ) {
      return;
    }
    entry.photoLoadRequested = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    entry.photoImg = img;
    img.onload = () => {
      if (disposed || entry.photoImg !== img) {
        img.onload = null;
        img.onerror = null;
        img.src = '';
        return;
      }
      entry.photoLoaded = true;
      const cardData = entry.cardMesh?.userData as {
        canvas?: HTMLCanvasElement;
        ctx?: CanvasRenderingContext2D;
        tex?: THREE.CanvasTexture;
      };
      if (cardData.canvas && cardData.ctx && cardData.tex) {
        paintCardCanvas(
          cardData.ctx,
          cardData.canvas.width,
          cardData.canvas.height,
          entry.poi,
          img,
        );
        cardData.tex.needsUpdate = true;
      }
      img.onload = null;
      img.onerror = null;
    };
    img.onerror = () => {
      if (entry.photoImg === img) {
        entry.photoImg = null;
      }
      img.onload = null;
      img.onerror = null;
    };
    img.src = entry.poi.photoUrl;
  };

  setEndpoints(options.start ?? null, options.destination ?? null, options.destinationLabel);
  if (options.pois) {
    setPois(options.pois);
  }

  return {
    group,
    setEndpoints,
    setPois,
    setVisited,
    setVerticalExaggeration(exaggeration: number): void {
      if (disposed) return;
      verticalExaggeration = clampExaggeration(exaggeration);
      syncAllPositions();
    },
    findNearestPoi(
      sceneX: number,
      sceneZ: number,
      maxDistance_m = 25,
    ): { poi: UnifiedPoi; distance_m: number } | null {
      if (disposed) return null;
      let best: { poi: UnifiedPoi; distance_m: number } | null = null;
      for (const entry of poiMap.values()) {
        const d = Math.hypot(entry.sceneX - sceneX, entry.sceneZ - sceneZ);
        if (d <= maxDistance_m && (!best || d < best.distance_m)) {
          best = { poi: entry.poi, distance_m: d };
        }
      }
      return best;
    },
    update(elapsedS: number, cameraPos?: THREE.Vector3): void {
      if (disposed) return;

      for (const ep of [startEntry, destEntry]) {
        if (!ep.root.visible) continue;
        ep.diamond.rotation.y = elapsedS * 1.4;
        ep.diamond.position.y = 2.6 + Math.sin(elapsedS * 2.2) * 0.25;
        if (cameraPos) {
          const dx = ep.root.position.x - cameraPos.x;
          const dz = ep.root.position.z - cameraPos.z;
          const d = Math.hypot(dx, dz);
          const d3 = Math.hypot(d, cameraPos.y - ep.root.position.y);
          const s = Math.max(1, d3 / 110);
          ep.beacon.scale.set(s, 1, s);
          if (ep.labelMesh) {
            const ts = Math.max(1, d3 / 28);
            ep.labelMesh.scale.setScalar(ts);
            ep.labelMesh.position.y = 5.5 + 2.2 * ts;
            ep.labelMesh.rotation.set(0, Math.atan2(-dx, -dz), 0);
          }
        }
      }

      for (const entry of poiMap.values()) {
        entry.beaconMat.opacity = 0.36 + 0.14 * Math.sin(elapsedS * 2.1 + entry.phase);
        entry.diamond.rotation.y = elapsedS * 1.1 + entry.phase;
        entry.diamond.position.y = 2.2 + Math.sin(elapsedS * 1.9 + entry.phase) * 0.2;

        if (!cameraPos) continue;
        const dx = entry.root.position.x - cameraPos.x;
        const dz = entry.root.position.z - cameraPos.z;
        const d = Math.hypot(dx, dz);
        const d3 = Math.hypot(d, cameraPos.y - entry.root.position.y);
        const s = Math.max(1, d3 / 120);
        entry.beacon.scale.set(s, 1, s);

        const faceYaw = Math.atan2(-dx, -dz);
        if (entry.labelMesh) {
          const ts = Math.max(1, d3 / 28);
          entry.labelMesh.scale.setScalar(ts);
          entry.labelMesh.position.y = 5 + 2.2 * ts;
          entry.labelMesh.rotation.set(0, faceYaw, 0);
          entry.labelMesh.visible = d3 > 12;
        }

        if (d < 35) {
          ensureEntryPhotoLoaded(entry);
        }

        if (entry.cardMesh) {
          if (d < 12 && !entry.anchored) {
            entry.cardMesh.position.set(0, 3.2, 0);
            entry.cardMesh.rotation.set(0, faceYaw, 0);
            entry.anchored = true;
          } else if (d > 24) {
            entry.anchored = false;
          } else if (entry.anchored) {
            entry.cardMesh.rotation.set(0, faceYaw, 0);
          }
          entry.cardMesh.visible = entry.anchored;
        }
      }
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      clearPoiEntries();
      group.parent?.remove(group);
      disposeObject3DTree(startEntry.root);
      disposeObject3DTree(destEntry.root);
      beaconGeo.dispose();
      diamondGeo.dispose();
      haloGeo.dispose();
    },
  };
}
