// Player rig: desktop (mouse + WASD) and VR (thumbstick walk, snap turn, teleport arc).
import * as THREE from 'three';
import { makeGlove } from './gloves.js';
const MARS_G = 3.71; // m/s^2 — the teleport arc is a ballistic throw under Martian gravity
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), q1 = new THREE.Quaternion();

export class Player {
  constructor(renderer, camera, scene, ground, dom) {
    this.renderer = renderer; this.camera = camera; this.ground = ground;   // ground(x,z) -> world y, or null outside data
    this.rig = new THREE.Group(); this.rig.add(camera); scene.add(this.rig);
    camera.position.set(0, 1.7, 0); camera.rotation.order = 'YXZ';
    this.yaw = 0; this.pitch = 0; this.keys = {}; this.walkSpeed = 1.6; this.sprint = false; this.fastSpeed = 14; this.followGround = true;
    this.onButton = null; this._btn = {}; this.onMove = null;        // (fromVec3, toVec3, kind) -> void, for mission accounting
    this.canStandAt = null;    // (x,z) -> bool
    this.lift = 0; this.hands = {}; this.snapLatch = false; this.aiming = false; this.target = null;
    for (let i = 0; i < 2; i++) {
      const c = renderer.xr.getController(i); this.rig.add(c);
      c.addEventListener('connected', e => { c.userData.hand = e.data.handedness; c.userData.src = e.data; this.hands[e.data.handedness] = c; this._ray(c); c.add(makeGlove(e.data.handedness)); });
      c.addEventListener('disconnected', () => { if (this.hands[c.userData.hand] === c) delete this.hands[c.userData.hand]; c.clear(); });
    }
    renderer.xr.addEventListener('sessionstart', () => { this.rig.rotation.y = this.yaw; this.camera.rotation.set(0, 0, 0); });
    renderer.xr.addEventListener('sessionend', () => { this.yaw = this.headYaw(); this.pitch = 0; this.rig.rotation.y = 0; });
    // teleport visuals
    this.arcN = 48; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(this.arcN * 3), 3));
    this.arc = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x7fe0ff, transparent: true, opacity: 0.9, depthTest: false })); this.arc.frustumCulled = false; this.arc.visible = false; this.arc.renderOrder = 50; scene.add(this.arc);
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.5, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x7fe0ff, transparent: true, opacity: 0.95, depthTest: false, side: THREE.DoubleSide }));
    this.marker.visible = false; this.marker.renderOrder = 51; scene.add(this.marker);
    // desktop input
    document.addEventListener('pointerlockchange', () => document.body.classList.toggle('locked', document.pointerLockElement === dom));
    dom.addEventListener('click', () => { if (this.onClick?.()) return; if (!renderer.xr.isPresenting && document.pointerLockElement !== dom) dom.requestPointerLock?.(); });
    document.addEventListener('mousemove', e => { if (document.pointerLockElement === dom) { this.yaw -= e.movementX * 0.0022; this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - e.movementY * 0.0022)); } });
    addEventListener('keydown', e => { this.keys[e.code] = true; }); addEventListener('keyup', e => { this.keys[e.code] = false; });
  }
  _ray(c) { // short pointer line on each controller
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 })); l.scale.z = 0.25; l.name = 'ray'; c.add(l);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffb37a })); c.add(tip);
  }
  head(out = new THREE.Vector3()) { return this.camera.getWorldPosition(out); }
  headYaw() { this.camera.getWorldDirection(v1); return Math.atan2(-v1.x, -v1.z); }
  placeAt(x, z, yaw) { // put the user's head above (x,z)
    const h = this.head(v1); this.rig.position.x += x - h.x; this.rig.position.z += z - h.z;
    if (yaw !== undefined) { if (this.renderer.xr.isPresenting) this._turn(yaw - this.headYaw()); else this.yaw = yaw; }
    const y = this.ground && this.ground(x, z); if (y != null && this.followGround) this.rig.position.y = y;
    this.rig.updateMatrixWorld(true);
  }
  // planning view: rise straight up to look at the whole site, then come back down to the same spot (no free travel)
  toggleOverview(h = 600) {
    if (!this.lift) { this._saved = this.head(new THREE.Vector3()); this.lift = h; this.rig.position.y += h; this.aiming = false; this.arc.visible = this.marker.visible = false; this.target = null; }
    else { this.lift = 0; this.placeAt(this._saved.x, this._saved.z); const y = this.ground(this._saved.x, this._saved.z); if (y != null) this.rig.position.y = y; }
    this.rig.updateMatrixWorld(true); this.onOverview?.(this.lift > 0);
  }
  _turn(a) { const before = this.head(new THREE.Vector3()); this.rig.rotation.y += a; this.rig.updateMatrixWorld(true); const after = this.head(v2); this.rig.position.x += before.x - after.x; this.rig.position.z += before.z - after.z; }
  _pad(hand) { const c = this.hands[hand]; const gp = c && c.userData.src && c.userData.src.gamepad; if (!gp) return null;
    const a = gp.axes; return { x: a.length >= 4 ? a[2] : a[0] || 0, y: a.length >= 4 ? a[3] : a[1] || 0, trigger: gp.buttons[0]?.pressed, grip: gp.buttons[1]?.pressed, a: gp.buttons[4]?.pressed, b: gp.buttons[5]?.pressed, stick: gp.buttons[3]?.pressed, c }; }
  update(dt) {
    const xr = this.renderer.xr.isPresenting; let mx = 0, mz = 0, fast = false;
    const from = this.head(new THREE.Vector3());
    if (!xr) {
      this.camera.rotation.set(this.pitch, this.yaw, 0); this.camera.position.set(0, 1.7, 0);
      const k = this.keys; mz = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0); mx = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0); fast = k.ShiftLeft || k.ShiftRight; this.sprint = !!(k.ControlLeft || k.KeyQ);
    } else {
      const L = this._pad('left'), Rr = this._pad('right');
      for (const [hand, pad] of [['left', L], ['right', Rr]]) if (pad) for (const [i, on] of [[0, pad.trigger], [1, pad.grip], [4, pad.a], [5, pad.b]]) { const k = hand + i; if (on && !this._btn[k]) this.onButton?.(hand, i); this._btn[k] = !!on; }
      if (L) { if (Math.hypot(L.x, L.y) > 0.15) { mx = L.x; mz = -L.y; } else this.sprint = false; fast = L.grip; if (L.stick && !this._stick) this.sprint = !this.sprint; this._stick = L.stick; }   // click the stick to sprint, until you let go of it
      if (Rr) {
        if (Math.abs(Rr.x) > 0.65 && Math.abs(Rr.y) < 0.5) { if (!this.snapLatch) { this._turn(-Math.sign(Rr.x) * Math.PI / 6); this.snapLatch = true; } } else if (Math.abs(Rr.x) < 0.3) this.snapLatch = false;
        const aim = !this.lift && Rr.y < -0.6 && Math.abs(Rr.x) < 0.6;
        if (aim) { this.aiming = true; this._aim(Rr.c); }
        else if (this.aiming) { this.aiming = false; this.arc.visible = this.marker.visible = false;
          if (this.target) { const t = this.target; this.placeAt(t.x, t.z); this.onMove?.(from, this.head(new THREE.Vector3()), 'teleport'); this.target = null; return; } }
      }
    }
    if (mx || mz) {
      const yaw = this.headYaw(), sp = (this.lift ? (fast ? 400 : 120) : (fast ? this.fastSpeed : this.walkSpeed * (this.sprint ? 2.2 : 1)) * (this.pace = this.speedFactor ? this.speedFactor(from.x, from.z) : 1)) * dt, len = Math.max(1, Math.hypot(mx, mz));
      const dx = (Math.cos(yaw) * mx - Math.sin(yaw) * mz) * sp / len, dz = (-Math.sin(yaw) * mx - Math.cos(yaw) * mz) * sp / len;
      const nx = from.x + dx, nz = from.z + dz;
      if (!this.canStandAt || this.canStandAt(nx, nz)) { this.rig.position.x += dx; this.rig.position.z += dz; }
    }
    if (this.followGround && this.ground && !this.lift) { const h = this.head(v1); const y = this.ground(h.x, h.z); if (y != null) this.rig.position.y += (y - this.rig.position.y) * Math.min(1, dt * 12); }
    this.rig.updateMatrixWorld(true);
    if ((mx || mz) && !this.lift) this.onMove?.(from, this.head(new THREE.Vector3()), fast ? 'fast' : 'walk');
  }
  _aim(c) {
    c.getWorldPosition(v1); c.getWorldQuaternion(q1); const dir = v2.set(0, 0, -1).applyQuaternion(q1); const speed = 15;
    const p = this.arc.geometry.attributes.position; let hit = null; let px = v1.x, py = v1.y, pz = v1.z; const dt = 0.09;
    for (let i = 0; i < this.arcN; i++) {
      const t = i * dt, x = v1.x + dir.x * speed * t, y = v1.y + dir.y * speed * t - 0.5 * MARS_G * t * t, z = v1.z + dir.z * speed * t;
      if (!hit) { const gy = this.ground(x, z);
        if (gy != null && y <= gy && i > 0) { let lo = 0, hi = 1; for (let k = 0; k < 8; k++) { const m = (lo + hi) / 2, gx = px + (x - px) * m, gz = pz + (z - pz) * m; if (py + (y - py) * m > this.ground(gx, gz)) lo = m; else hi = m; }
          hit = new THREE.Vector3(px + (x - px) * hi, 0, pz + (z - pz) * hi); hit.y = this.ground(hit.x, hit.z); }
        px = x; py = y; pz = z; }
      if (hit) p.setXYZ(i, hit.x, hit.y + 0.03, hit.z); else p.setXYZ(i, x, y, z);
    }
    p.needsUpdate = true; this.arc.visible = true;
    const ok = hit && (!this.canStandAt || this.canStandAt(hit.x, hit.z)) && (!this.canTeleportTo || this.canTeleportTo(hit.x, hit.z));
    this.target = ok ? hit : null; this.marker.visible = !!hit;
    if (hit) { this.marker.position.set(hit.x, hit.y + 0.05, hit.z); const col = ok ? 0x7fe0ff : 0xff4040; this.marker.material.color.setHex(col); this.arc.material.color.setHex(col); }
  }
}
