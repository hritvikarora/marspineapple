// Helmet visor: a dark rim around the field of view with a soft inner edge and a thin highlight, as seen from inside an EVA helmet.
// Built as a ring with a hole (not a full-screen quad) so the centre of the view costs nothing to draw on a headset.
import * as THREE from 'three';
export class Helmet {
  constructor(app) {
    this.app = app; const g = new THREE.Group(); this.group = g; g.position.z = -0.3; g.renderOrder = 300; app.camera.add(g);
    const ring = (r0, r1, a0, a1, col) => { const N = 96, pos = [], colr = [], idx = [], c = new THREE.Color(col);
      for (let i = 0; i <= N; i++) { const t = i / N * Math.PI * 2, x = Math.cos(t), y = Math.sin(t); pos.push(x * r0, y * r0, 0, x * r1, y * r1, 0); colr.push(c.r, c.g, c.b, a0, c.r, c.g, c.b, a1); }
      for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(colr, 4)); geo.setIndex(idx);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, side: THREE.DoubleSide })); m.frustumCulled = false; m.renderOrder = 300; g.add(m); return m; };
    ring(0.80, 0.93, 0, 0.55, 0x0a0706);      // soft shadow cast by the rim onto the visor
    ring(0.93, 1.0, 0.55, 1, 0x14100e);       // padding
    ring(1.0, 6.0, 1, 1, 0x1b1714);           // helmet shell
    ring(0.925, 0.94, 0.0, 0.5, 0xffc9a0);    // seal highlight catching the Martian light
    ring(0.94, 0.955, 0.5, 0.0, 0xffc9a0);
    // reflections on the curved visor: faint additive glints that slide as the head turns relative to the Sun
    const glint = (r0, r1, a0, a1, peak, col) => { const N = 40, pos = [], colr = [], idx = [], c = new THREE.Color(col);
      for (let i = 0; i <= N; i++) { const f = i / N, t = a0 + (a1 - a0) * f, x = Math.cos(t), y = Math.sin(t), k = Math.sin(f * Math.PI) ** 2 * peak; pos.push(x * r0, y * r0, 0, x * (r0 + r1) / 2, y * (r0 + r1) / 2, 0, x * r1, y * r1, 0); colr.push(c.r, c.g, c.b, 0, c.r, c.g, c.b, k, c.r, c.g, c.b, 0); }
      for (let i = 0; i < N; i++) { const a = i * 3; idx.push(a, a + 1, a + 3, a + 1, a + 4, a + 3, a + 1, a + 2, a + 4, a + 2, a + 5, a + 4); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(colr, 4)); geo.setIndex(idx);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, toneMapped: false, side: THREE.DoubleSide })); m.frustumCulled = false; m.renderOrder = 301; g.add(m); return m; };
    this.glints = [glint(0.70, 0.80, 1.9, 2.9, 0.16, 0xfff0dc), glint(0.60, 0.635, 2.1, 2.7, 0.10, 0xffffff), glint(0.74, 0.79, -0.9, -0.25, 0.09, 0xffd9b8), glint(0.50, 0.52, 0.5, 1.0, 0.05, 0xffffff), glint(0.83, 0.87, 4.3, 5.0, 0.07, 0xffe6cc)];
    this.seed = this.glints.map(() => Math.random() * 6.28); this.dir = new THREE.Vector3();
  }
  update() {
    const xr = this.app.renderer.xr.isPresenting; this.group.visible = xr && !this.off; if (!this.group.visible) return;   // the visor only makes sense in the headset
    this.group.scale.set(0.318, 0.29, 1);
    this.app.camera.getWorldDirection(this.dir); const yaw = Math.atan2(this.dir.x, -this.dir.z), pitch = Math.asin(this.dir.y), sun = 0.5 + 0.5 * Math.cos(yaw - 2.4);   // Sun low in the west-south-west
    this.glints.forEach((m, i) => { m.rotation.z = (i % 2 ? -0.35 : 0.45) * yaw + 0.5 * pitch + Math.sin(this.seed[i] + yaw * 1.7) * 0.12; m.material.opacity = 0.35 + 0.65 * (i % 2 ? 1 - sun : sun); });
  }
}
