// Perseverance as a companion: NASA's own 3D model (simplified for the headset) follows the astronaut along the route.
// It keeps a few metres behind, tilts with the real terrain, waits outside the habitat and never drives onto forbidden slopes.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const KEEP = 4.2, START = 5.6, SPEED = 2.4, FAR = 45;
export class Rover {
  constructor(app, url, x, z, yaw) {
    this.app = app; this.g = new THREE.Group(); this.g.rotation.order = 'YXZ'; this.x = x; this.z = z; this.yaw = yaw; this.moving = false; this.ready = false; this.off = false;
    app.world.add(this.g); this._place(1);
    // one soft sun and sky light: the rover is the only lit object in the scene
    const sun = new THREE.DirectionalLight(0xfff0dc, 2.2); sun.position.set(-0.5, 0.8, 0.3); const amb = new THREE.HemisphereLight(0xf2c9a4, 0x6b4630, 1.5); app.scene.add(sun, amb);
    new GLTFLoader().load(url, gltf => {
      gltf.scene.traverse(o => { if (!o.isMesh) return; const m = o.material; o.material = new THREE.MeshLambertMaterial({ map: m.map || null, color: m.color, side: m.side, transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest }); m.dispose(); o.frustumCulled = true; });
      this.g.add(gltf.scene); this.ready = true;
    }, undefined, e => console.warn('rover model', e));
  }
  _place(k) {
    const { app, g } = this, gy = app.ground(this.x, this.z) ?? 0, c = Math.cos(this.yaw), s = Math.sin(this.yaw), fx = s, fz = c;   // model front is +z
    const hf = app.ground(this.x + fx * 1.2, this.z + fz * 1.2) ?? gy, hb = app.ground(this.x - fx * 1.2, this.z - fz * 1.2) ?? gy, hl = app.ground(this.x + fz * 1.1, this.z - fx * 1.1) ?? gy, hr = app.ground(this.x - fz * 1.1, this.z + fx * 1.1) ?? gy;
    const y = (hf + hb + hl + hr) / 4, pitch = -Math.atan2(hf - hb, 2.4), roll = Math.atan2(hr - hl, 2.2);
    g.position.set(this.x, g.position.y + (y - g.position.y) * k, this.z); g.rotation.y = this.yaw; g.rotation.x += (pitch - g.rotation.x) * k; g.rotation.z += (roll - g.rotation.z) * k;
  }
  update(dt, cam) {
    const { app } = this; this.g.visible = !this.off; if (this.off || app.player.lift) return;
    const inHab = app.habitat.groundY(cam.x, cam.z) != null; let dx = cam.x - this.x, dz = cam.z - this.z, d = Math.hypot(dx, dz);
    if (d > FAR && !inHab) { // the astronaut teleported far away: catch up just behind them
      const a = app.player.headYaw(), bx = cam.x + Math.sin(a) * 7, bz = cam.z + Math.cos(a) * 7; if (app.slope(bx, bz) < 28 && app.habitat.groundY(bx, bz) == null) { this.x = bx; this.z = bz; this.yaw = Math.atan2(cam.x - bx, cam.z - bz); this._place(1); } return; }
    if (inHab) { this.moving = false; return; }
    if (d > START) this.moving = true; else if (d < KEEP) this.moving = false;
    if (this.moving) {
      const want = Math.atan2(dx, dz); let da = ((want - this.yaw + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; this.yaw += Math.sign(da) * Math.min(Math.abs(da), dt * 1.6);
      const sp = Math.min(SPEED, 0.6 + (d - KEEP) * 0.9) * Math.max(0, Math.cos(da)) * dt, nx = this.x + Math.sin(this.yaw) * sp, nz = this.z + Math.cos(this.yaw) * sp;
      if (app.slope(nx, nz) < 30 && app.habitat.canPass(nx, nz) && app.habitat.groundY(nx, nz) == null) { this.x = nx; this.z = nz; }
    }
    this._place(Math.min(1, dt * 6));
  }
}
