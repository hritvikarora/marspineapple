import * as THREE from 'three';
// Dusty Martian daytime sky: tan/butterscotch, brighter towards the horizon (colour cosmetic, not measured).
export const HORIZON = new THREE.Color(0.80, 0.63, 0.47), ZENITH = new THREE.Color(0.52, 0.38, 0.29);
export function makeSky() {
  const m = new THREE.ShaderMaterial({ side: THREE.BackSide, depthTest: false, depthWrite: false,
    uniforms: { uH: { value: HORIZON }, uZ: { value: ZENITH }, uSun: { value: new THREE.Vector3(0.45, 0.6, -0.66).normalize() } },
    vertexShader: `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uH, uZ, uSun; varying vec3 vD;
      void main(){ vec3 d = normalize(vD); float t = pow(clamp(d.y, 0.0, 1.0), 0.45);
        vec3 c = mix(uH, uZ, t); if (d.y < 0.0) c = uH * (1.0 + d.y * 0.6);
        float s = max(dot(d, uSun), 0.0); c += vec3(0.55, 0.62, 0.75) * pow(s, 24.0) * 0.35 + vec3(1.0) * smoothstep(0.9996, 0.99985, s);
        gl_FragColor = vec4(c, 1.0); }` });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), m); mesh.renderOrder = -10; mesh.frustumCulled = false;
  return mesh;
}
