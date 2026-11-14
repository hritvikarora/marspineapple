import * as THREE from 'three';
import type { MarswalkSkyHandle } from './marswalkTypes';

/**
 * Linear Martian daytime horizon and zenith sky colors ported from `marswalk/app/src/sky.js`
 * (educational cosmetic sky model; not radiometrically measured at rover wheel height).
 */
export const MARS_HORIZON_COLOR = new THREE.Color(0.80, 0.63, 0.47);
export const MARS_ZENITH_COLOR = new THREE.Color(0.52, 0.38, 0.29);

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform vec3 uSun;
varying vec3 vDir;

void main() {
  vec3 d = normalize(vDir);
  float t = pow(clamp(d.y, 0.0, 1.0), 0.45);
  vec3 col = mix(uHorizon, uZenith, t);
  if (d.y < 0.0) {
    col = uHorizon * (1.0 + d.y * 0.6);
  }
  float s = max(dot(d, uSun), 0.0);
  col += vec3(0.55, 0.62, 0.75) * pow(s, 24.0) * 0.35
       + vec3(1.0) * smoothstep(0.9996, 0.99985, s);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

/**
 * Adds a camera-centered butterscotch Martian sky dome (`renderOrder = -10`, `BackSide`,
 * depth test/write disabled) to `scene` and returns an idempotently disposable handle.
 */
export function makeMarsSky(scene: THREE.Scene): MarswalkSkyHandle {
  const geometry = new THREE.SphereGeometry(1000, 32, 16);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      uHorizon: { value: MARS_HORIZON_COLOR.clone() },
      uZenith: { value: MARS_ZENITH_COLOR.clone() },
      uSun: { value: new THREE.Vector3(0.45, 0.60, -0.66).normalize() },
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
  });

  const skyMesh = new THREE.Mesh(geometry, material);
  skyMesh.name = 'marswalk-sky';
  skyMesh.renderOrder = -10;
  skyMesh.frustumCulled = false;
  scene.add(skyMesh);

  let disposed = false;
  const worldPos = new THREE.Vector3();

  return {
    skyMesh,
    updatePosition(cameraOrPos: THREE.Camera | THREE.Vector3): void {
      if (disposed) {
        return;
      }
      if (cameraOrPos instanceof THREE.Camera) {
        cameraOrPos.getWorldPosition(worldPos);
        skyMesh.position.copy(worldPos);
        if ('far' in cameraOrPos && typeof cameraOrPos.far === 'number' && Number.isFinite(cameraOrPos.far)) {
          const safeScale = Math.max(0.5, (cameraOrPos.far * 0.5) / 1000);
          skyMesh.scale.setScalar(safeScale);
        }
      } else {
        skyMesh.position.copy(cameraOrPos);
      }
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      skyMesh.parent?.remove(skyMesh);
      geometry.dispose();
      material.dispose();
    },
  };
}
