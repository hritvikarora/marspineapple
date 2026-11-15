// Surface habitat at the base: a small pressurised module with an airlock tunnel. The EVA starts and ends inside it.
// Scenario element (not NASA data): its position is the "base" point of the site file.
import * as THREE from 'three';
import { T, num } from './i18n.js';
import { hullTex, domeTex, ceilTex, innerTex } from './base-deco.js';
export const R = 4.2, H = 2.6, DOOR_W = 1.5, DOOR_H = 2.1, TUN = 2.4, RAMP = 2.2, TUN2 = 1.6, R2 = 7.0, XC = R + TUN2 + R2 - 0.3, R3 = 4.0, ZC = R + TUN2 + R3 - 0.3;   // R3/ZC: crew quarters behind the base (local +z)   // TUN2/R2/XC: corridor and research room
function tex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
const panels = (base, line, cols, rows, extra) => tex(1024, 256, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, base[0]); g.addColorStop(1, base[1]); c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.strokeStyle = line; c.lineWidth = 3; for (let i = 0; i <= cols; i++) { c.beginPath(); c.moveTo(i * w / cols, 0); c.lineTo(i * w / cols, h); c.stroke(); } for (let j = 1; j < rows; j++) { c.beginPath(); c.moveTo(0, j * h / rows); c.lineTo(w, j * h / rows); c.stroke(); } extra?.(c, w, h); });
export class Habitat {
  constructor(app, cx, cz, yaw) {
    this.app = app; this.cx = cx; this.cz = cz; this.yaw = yaw; this.cos = Math.cos(yaw); this.sin = Math.sin(yaw);
    const gl = (lx, lz) => app.ground(...this.world(lx, lz)) ?? -Infinity, ring = (ox, rr) => { let t = -Infinity; for (let a = 0; a < 24; a++) for (const f of [0, 0.5, 1]) t = Math.max(t, gl(ox + Math.sin(a * 0.2618) * rr * f, Math.cos(a * 0.2618) * rr * f)); return t; };
    // the research room goes on the side (local +x or -x) where the ground is lower, so the terrain never pokes through its floor
    const tp = ring(XC, R2 + 0.3), tm = ring(-XC, R2 + 0.3); this.side = tp <= tm ? 1 : -1; const ringZ = rr => { let t = -Infinity; for (let a = 0; a < 24; a++) for (const f of [0, 0.5, 1]) t = Math.max(t, gl(Math.sin(a * 0.2618) * rr * f, ZC + Math.cos(a * 0.2618) * rr * f)); return t; };
    const top = Math.max(ring(0, R + 0.3), tp, tm, ringZ(R3 + 0.3));   // both side rooms share the base floor, so it clears the ground under all three modules
    this.floorY = top + 0.12; const g = this.group = new THREE.Group(); g.position.set(cx, this.floorY, cz); g.rotation.y = yaw;
    const mat = (map, side = THREE.DoubleSide) => new THREE.MeshBasicMaterial({ map, side }), col = (c, side = THREE.DoubleSide) => new THREE.MeshBasicMaterial({ color: c, side });
    const a = Math.asin(DOOR_W / 2 / R), add = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
    const inT = innerTex();
    const P2 = Math.PI / 2, arcs = [[a, P2 - a], [P2 + a, 2 * P2 - a], [2 * P2 + a, 3 * P2 - a], [3 * P2 + a, 4 * P2 - a]];   // openings: crew quarters (+z), the side rooms (±x), door (-z)
    const hullT = hullTex(1); for (const [t0, t1] of arcs) { add(new THREE.CylinderGeometry(R + 0.06, R + 0.06, H, 24, 1, true, t0, t1 - t0), mat(hullT, THREE.FrontSide), 0, H / 2); add(new THREE.CylinderGeometry(R, R, H, 24, 1, true, t0, t1 - t0), mat(inT, THREE.BackSide), 0, H / 2); }
    for (const t of [0, Math.PI, P2, 3 * P2]) add(new THREE.CylinderGeometry(R + 0.03, R + 0.03, H - DOOR_H, 6, 1, true, t - a, 2 * a), col(0xbfb2a2), 0, DOOR_H + (H - DOOR_H) / 2);
    const dome = add(new THREE.SphereGeometry(R + 0.06, 40, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(domeTex(), THREE.FrontSide), 0, H); dome.scale.y = 0.42;
    const ceil = add(new THREE.SphereGeometry(R, 40, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(ceilTex(), THREE.BackSide), 0, H); ceil.scale.y = 0.4;
    add(new THREE.CircleGeometry(R * 0.35, 32).rotateX(Math.PI / 2), col(0xfff6e0), 0, H + R * 0.4 * 0.93);                         // ceiling light
    const floorT = tex(1024, 1024, (c, w, h) => { c.fillStyle = '#2b3036'; c.fillRect(0, 0, w, h); const n = 10, d = w / n;   // raised-floor tiles with bevels, vent grilles and cyan inlays
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const x = i * d, y = j * d, gr = c.createLinearGradient(x, y, x + d, y + d); gr.addColorStop(0, '#4d545c'); gr.addColorStop(1, '#3a4047'); c.fillStyle = gr; c.fillRect(x + 4, y + 4, d - 8, d - 8);
        c.strokeStyle = 'rgba(255,255,255,0.08)'; c.lineWidth = 2; c.strokeRect(x + 6, y + 6, d - 12, d - 12); if ((i * 7 + j * 3) % 5 === 0) { c.fillStyle = '#23272c'; for (let k = 0; k < 6; k++) c.fillRect(x + 18, y + 20 + k * 12, d - 36, 5); } }
      c.fillStyle = 'rgba(61,240,255,0.55)'; c.fillRect(w / 2 - 2, 0, 4, h); c.fillRect(0, h / 2 - 2, w, 4); });
    add(new THREE.CircleGeometry(R, 48).rotateX(-Math.PI / 2), mat(floorT), 0, 0.005);
    add(new THREE.CylinderGeometry(R + 0.25, R + 0.4, 1.6, 48, 1, true), col(0x6b5a4c), 0, -0.8);
    // airlock tunnel (towards local -z), ramp down to the ground
    const z0 = -R + 0.25, z1 = -R - TUN, zm = (z0 + z1) / 2, L = z0 - z1, grey = col(0xcfd4d8), dark = col(0x555b62), shell = col(0xc8bcae);
    add(new THREE.PlaneGeometry(L, DOOR_H).rotateY(Math.PI / 2), grey, -DOOR_W / 2, DOOR_H / 2, zm); add(new THREE.PlaneGeometry(L, DOOR_H).rotateY(Math.PI / 2), grey, DOOR_W / 2, DOOR_H / 2, zm);
    add(new THREE.PlaneGeometry(DOOR_W, L).rotateX(Math.PI / 2), grey, 0, DOOR_H, zm); add(new THREE.PlaneGeometry(DOOR_W, L).rotateX(-Math.PI / 2), dark, 0, 0.004, zm);
    for (const sx of [-1, 1]) add(new THREE.PlaneGeometry(L, DOOR_H + 0.15).rotateY(Math.PI / 2), shell, sx * (DOOR_W / 2 + 0.12), DOOR_H / 2 + 0.07, zm); add(new THREE.PlaneGeometry(DOOR_W + 0.24, L).rotateX(Math.PI / 2), shell, 0, DOOR_H + 0.15, zm);
    const endY = (app.ground(...this.world(0, z1 - RAMP)) ?? this.floorY) - this.floorY; this.rampEnd = endY;
    const ramp = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W + 0.3, Math.hypot(RAMP, endY)), col(0x666c73)); ramp.position.set(0, endY / 2, z1 - RAMP / 2); ramp.rotation.x = -Math.PI / 2 - Math.atan2(endY, RAMP); g.add(ramp);
    this.door = add(new THREE.PlaneGeometry(DOOR_W, DOOR_H), mat(tex(256, 360, (c, w, h) => { c.fillStyle = '#8f979f'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffb300'; for (let i = -4; i < 8; i++) { c.beginPath(); c.moveTo(i * 60, h); c.lineTo(i * 60 + 30, h); c.lineTo(i * 60 + 90, h - 60); c.lineTo(i * 60 + 60, h - 60); c.fill(); } c.fillStyle = '#20252b'; c.font = '700 40px system-ui'; c.textAlign = 'center'; c.fillText('AIRLOCK', w / 2, 90); c.fillRect(w / 2 - 50, 130, 100, 70); })), 0, DOOR_H / 2, z1 + 0.02); this.door.rotation.y = Math.PI; this.door.material.side = THREE.FrontSide; { const d2 = new THREE.Mesh(this.door.geometry, this.door.material); d2.rotation.y = Math.PI; this.door.add(d2); }
    // interior: two wall screens and a workbench
    const screen = (colr, ang) => { const cv = document.createElement('canvas'); cv.width = 512; cv.height = 320; const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
      const m = add(new THREE.PlaneGeometry(1.5, 0.94), mat(t, THREE.FrontSide), Math.sin(ang) * (R - 0.08), 1.55, Math.cos(ang) * (R - 0.08)); m.rotation.y = ang + Math.PI;
      return lines => { const c = cv.getContext('2d'), w = 512, h = 320; c.fillStyle = '#0c1418'; c.fillRect(0, 0, w, h); c.strokeStyle = colr; c.lineWidth = 6; c.strokeRect(6, 6, w - 12, h - 12); lines.forEach((s, i) => { c.fillStyle = i ? '#e8f4ff' : colr; c.font = `${i ? 500 : 700} ${i ? 34 : 40}px system-ui`; c.fillText(s, 30, 70 + i * 54); }); t.needsUpdate = true; }; };
    const scr = [screen('#5be08a', 0.9), screen('#7fe0ff', -0.9)], ms = app.site.mission, km = app.site.legs.reduce((a, l) => a + l.length, 0) / 1000;
    this.redraw = () => { scr[0](['JEZERO BASE', T('Cabina 101 kPa · 21 °C'), 'O₂ 21% · CO₂ ' + num(0.04, 2) + '%', T('Tuta: pronta'), T(app.started ? 'Airlock: libero' : 'Airlock: chiuso')]);
      scr[1](['EVA-1', T`${app.site.legs.length - 1} tappe · ${num(km, 1)} km`, T('Rientro prima del tramonto'), T`Riserva O₂ ${Math.round(ms.oxygen.reserveFraction * 100)}%`, T('Segui la linea azzurra')]); }; this.redraw();
    { const wa = 0.9, wr = R - 0.6, wx = Math.sin(wa) * wr, wz = Math.cos(wa) * wr; add(new THREE.BoxGeometry(2.0, 0.9, 0.6), col(0x7d858d), wx, 0.45, wz).rotation.y = wa; add(new THREE.BoxGeometry(2.0, 0.06, 0.7), col(0xdfe4e8), wx, 0.93, wz).rotation.y = wa; }   // workbench under the right-hand screen
    const sign = tex(512, 128, (c, w, h) => { c.fillStyle = '#1b1714'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffb37a'; c.font = '700 64px system-ui'; c.textAlign = 'center'; c.fillText('JEZERO BASE', w / 2, 86); });
    add(new THREE.PlaneGeometry(1.5, 0.38), mat(sign), 0, DOOR_H + 0.45, z1 - 0.02).rotation.y = Math.PI;
    app.world.add(g);
  }
  world(lx, lz) { return [this.cx + lx * this.cos + lz * this.sin, this.cz - lx * this.sin + lz * this.cos]; }
  local(x, z) { const dx = x - this.cx, dz = z - this.cz; return [dx * this.cos - dz * this.sin, dx * this.sin + dz * this.cos]; }
  inside(x, z) { const [lx, lz] = this.local(x, z); return Math.hypot(lx, lz) < R - 0.2; }
  _uv(x, z) { const [lx, lz] = this.local(x, z); return [lx * this.side, lz]; }                       // u: along the corridor towards the research room
  inRoom(x, z) { const [u, v] = this._uv(x, z); return Math.hypot(u - XC, v) < R2 - 0.2; }
  inRoom2(x, z) { const [u, v] = this._uv(x, z); return Math.hypot(u + XC, v) < R2 - 0.2; }   // mission room, opposite the research room
  inCabin(x, z) { const [lx, lz] = this.local(x, z); return Math.hypot(lx, lz - ZC) < R3 - 0.2; }
  indoors(x, z) { const [u, v] = this._uv(x, z), au = Math.abs(u); const [lx0, lz0] = this.local(x, z); if (this.inCabin(x, z) || (Math.abs(lx0) < DOOR_W / 2 && lz0 > R - 0.4 && lz0 < ZC - R3 + 0.6)) return true;
    return this.inside(x, z) || this.inRoom(x, z) || this.inRoom2(x, z) || (au > R - 0.4 && au < XC - R2 + 0.6 && Math.abs(v) < DOOR_W / 2); }
  roomPos(f = 1.6) { return this.world(this.side * (XC - R2 + f), 0); }   // just inside the research room, facing its centre
  roomYaw() { return this.yaw + (this.side > 0 ? -Math.PI / 2 : Math.PI / 2); }
  startPos() { return this.world(0, 1.0); }
  groundY(x, z) { const [lx, lz] = this.local(x, z), r = Math.hypot(lx, lz), z1 = -R - TUN;
    if (r < R + 0.05) return this.floorY; if (Math.hypot(lx, lz - ZC) < R3 + 0.05 || (Math.abs(lx) < DOOR_W / 2 + 0.15 && lz > 0 && lz < ZC)) return this.floorY; { const [u, v] = this._uv(x, z); if (Math.hypot(Math.abs(u) - XC, v) < R2 + 0.05 || (Math.abs(u) < XC && Math.abs(v) < DOOR_W / 2 + 0.15)) return this.floorY; } if (Math.abs(lx) < DOOR_W / 2 + 0.15) { if (lz <= 0 && lz >= z1) return this.floorY; if (lz < z1 && lz > z1 - RAMP) return this.floorY + this.rampEnd * (z1 - lz) / RAMP; } return null; }
  canPass(x, z) { const [lx, lz] = this.local(x, z), r = Math.hypot(lx, lz), [u, v] = this._uv(x, z), side = Math.abs(v) < DOOR_W / 2 - 0.2, inDoor = Math.abs(lx) < DOOR_W / 2 - 0.2 || side, au = Math.abs(u), rr = Math.hypot(au - XC, v);
    if (Math.abs(r - R) < 0.4 && !inDoor) return false; if (Math.abs(rr - R2) < 0.4 && !(side && au < XC)) return false; if (rr < (u > 0 ? 1.25 : 2.35)) return false;   // central kiosk / railing round the big globe   // research room wall and central kiosk
    if (au > R - 0.2 && au < XC - R2 + 0.2 && Math.abs(v) >= DOOR_W / 2 - 0.2 && Math.abs(v) < DOOR_W / 2 + 0.5) return false; if (lz < -R + 0.2 && lz > -R - TUN - 0.2 && Math.abs(lx) >= DOOR_W / 2 - 0.2 && Math.abs(lx) < DOOR_W / 2 + 0.5) return false; { const rc = Math.hypot(lx, lz - ZC), cd = Math.abs(lx) < DOOR_W / 2 - 0.2 && lz < ZC;   // crew quarters: wall, corridor walls, furniture
      if (Math.abs(rc - R3) < 0.4 && !cd) return false; if (lz > R - 0.2 && lz < ZC - R3 + 0.2 && Math.abs(lx) >= DOOR_W / 2 - 0.2 && Math.abs(lx) < DOOR_W / 2 + 0.5) return false; if (rc < R3 && this.cabinBlock && !this.cabinBlock(lx, lz - ZC)) return false; }
    return true; }
  update(dt, pos) { const [lx, lz] = this.local(pos.x, pos.z), near = this.app.started && Math.abs(lx) < 2.5 && lz < -R + 2.5 && lz > -R - TUN - 3.5, y = this.door.position.y, ty = near ? DOOR_H * 1.5 - 0.05 : DOOR_H / 2; this.door.position.y += (ty - y) * Math.min(1, dt * 4); }
}
