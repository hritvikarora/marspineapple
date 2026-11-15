// Points of interest: a light beacon visible from afar, a name tag, and an info card with a real rover photo.
import * as THREE from 'three';
import { Panel, rrect, text, wrap, fmtDist } from './ui.js';
import { T, P } from './i18n.js';
const COL = { base: 0xffd166, science: 0x58d6ff, done: 0x5be08a };
export class Pois {
  constructor(app, base) {
    this.app = app; this.group = new THREE.Group(); this.items = [];
    const beaconGeo = new THREE.CylinderGeometry(0.3, 0.3, 90, 10, 1, true).translate(0, 45, 0), legs = Object.fromEntries((app.site.legs || []).map(l => [l.frm, l]));
    for (const p of app.site.pois) {
      const g = new THREE.Group(); g.position.set(p.x, app.ground(p.x, -p.y), -p.y);
      const beacon = new THREE.Mesh(beaconGeo, new THREE.MeshBasicMaterial({ color: COL[p.kind] || COL.science, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide })); if (p.kind === 'base') beacon.position.y = 4.6; g.add(beacon);
      const tag = new Panel(4, 1, 128, { depthTest: true }); tag.draw((c, W, H) => { rrect(c, 2, 2, W - 4, H - 4, 30); c.fillStyle = 'rgba(14,9,6,0.72)'; c.fill(); text(c, p.name, W / 2, H * 0.68, 64, '#fff', 700, 'center'); });
      tag.mesh.position.y = 7; tag.mesh.rotation.order = 'YXZ'; g.add(tag.mesh);
      const card = new Panel(2.4, 1.5, 1024 / 2.4, { depthTest: true }); card.mesh.visible = false; g.add(card.mesh);
      const it = { p, g, beacon, tag, card, leg: legs[p.id], img: null }; this.items.push(it); this.group.add(g); this.drawCard(it);
      const load = (f, cb) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => cb(im); im.src = base + f; };
      if (p.photo) load(p.photo.file, im => { it.img = im; this.drawCard(it); });
      // more real photos taken by the rover at this stop, on a second board beside the card
      if (p.photos?.length > 1) { it.gal = new Panel(2.0, 1.66, 512, { depthTest: true }); it.gal.mesh.visible = false; g.add(it.gal.mesh); it.imgs = []; this.drawGal(it); p.photos.forEach((ph, i) => load(ph.file, im => { it.imgs[i] = im; this.drawGal(it); })); }
    }
  }
  redraw() { for (const it of this.items) { this.drawCard(it); if (it.gal) this.drawGal(it); } }
  drawGal(it) {
    it.gal.draw((c, W, H) => { rrect(c, 4, 4, W - 8, H - 8, 28); c.fillStyle = 'rgba(16,10,7,0.9)'; c.fill(); c.lineWidth = 4; c.strokeStyle = '#ffb37a'; c.stroke();
      text(c, T('Foto reali di Perseverance da questo punto'), 28, 50, 28, '#fff', 700); const cw = (W - 28 * 3) / 2, ch = Math.round(cw * 0.75);
      it.p.photos.slice(0, 4).forEach((ph, i) => { const x = 28 + (i % 2) * (cw + 28), y = 70 + (i >> 1) * (ch + 34), im = it.imgs[i];
        if (im) { const k = Math.max(cw / im.width, ch / im.height), sw = cw / k, sh = ch / k; c.drawImage(im, (im.width - sw) / 2, (im.height - sh) / 2, sw, sh, x, y, cw, ch); } else { c.fillStyle = '#3a2418'; c.fillRect(x, y, cw, ch); }
        text(c, `${ph.camera} · sol ${ph.sol} · ${ph.credit}`, x, y + ch + 22, 17, '#ffb37a', 600); });
    });
  }
  drawCard(it) {
    const { p, leg, img } = it; it.card.draw((c, W, H) => {
      rrect(c, 4, 4, W - 8, H - 8, 28); c.fillStyle = 'rgba(16,10,7,0.9)'; c.fill(); c.lineWidth = 4; c.strokeStyle = '#ffb37a'; c.stroke();
      const top = wrap(c, P(p, 'title'), 36, 64, W - 72, 38, 44, '#fff', 700) - 14;
      let tx = 36, tw = W - 72, ty = top + 32;
      if (p.photo) { const pw = 440, ph = Math.round(pw * p.photo.h / p.photo.w); if (img) c.drawImage(img, 36, top, pw, ph); else { c.fillStyle = '#3a2418'; c.fillRect(36, top, pw, ph); }
        text(c, T`Foto reale: Perseverance, ${p.photo.camera}, sol ${p.photo.sol}`, 36, top + ph + 28, 19, '#ffb37a', 600); text(c, p.photo.credit, 36, top + ph + 52, 17, '#d9c4b2'); tx = 36 + pw + 30; tw = W - tx - 36; }
      ty = wrap(c, P(p, 'text'), tx, ty, tw, p.photo ? 29 : 31, p.photo ? 38 : 42, '#fff', 400);
      if (p.meda) text(c, T`Aria nel sol ${p.meda.sol} (MEDA): da ${Math.round(p.meda.min)} a ${Math.round(p.meda.max)} °C`, tx, Math.min(ty + 8, H - 110), 22, '#7fe0ff', 600);
      if (leg) { const y = H - 42; c.fillStyle = 'rgba(255,255,255,0.14)'; c.fillRect(36, y - 42, W - 72, 2);
        text(c, T`Prossimo tratto verso ${this.app.mission.pois[leg.to].name}: ${fmtDist(leg.length)}, salita ${Math.round(leg.climb)} m, pendenza massima ${Math.round(leg.maxSlope)}°`, 36, y, 23, '#7fe0ff', 600); }
    });
  }
  update(cam, yaw) {
    const m = this.app.mission, tgt = m.target;
    for (const it of this.items) {
      const dx = it.g.position.x - cam.x, dz = it.g.position.z - cam.z, d = Math.hypot(dx, dz), face = Math.atan2(-dx, -dz);
      const d3 = Math.hypot(d, cam.y - it.g.position.y), s = Math.max(1, d3 / 120); it.beacon.scale.set(s, 1, s);
      const col = it.p.kind === 'base' ? COL.base : m.visited.has(it.p.id) ? COL.done : COL.science; it.beacon.material.color.setHex(col); it.beacon.material.opacity = tgt && tgt.id === it.p.id ? 0.8 : 0.4;
      const ts = Math.max(1, d3 / 28); it.tag.mesh.scale.setScalar(ts); it.tag.mesh.position.y = 5 + 2.2 * ts; it.tag.mesh.rotation.set(0, face, 0); it.tag.mesh.visible = d3 > 14; if (this.app.player.lift) this.app.camera.getWorldQuaternion(it.tag.mesh.quaternion); else it.tag.mesh.rotation.x = 0;
      // the info card appears beside the astronaut on arrival (at reading distance, slightly to the right so it never blocks the way) and stays put
      const ind = this.app.habitat?.indoors(cam.x, cam.z);   // no mission cards inside the base
      if (d < 11 && !ind && !it.anchored && it.p.title && !this.app.player.lift && this.app.started) { const a = this.app.player.headYaw() - 0.42, ux = -Math.sin(a), uz = -Math.cos(a), r = 2.9;
        it.card.mesh.position.set(cam.x + ux * r - it.g.position.x, cam.y + 0.3 - it.g.position.y, cam.z + uz * r - it.g.position.z); it.card.mesh.rotation.y = Math.atan2(-ux, -uz); it.anchored = true;
        if (it.gal) { const a2 = a - 0.8, vx = -Math.sin(a2), vz = -Math.cos(a2); it.gal.mesh.position.set(cam.x + vx * r - it.g.position.x, cam.y + 0.3 - it.g.position.y, cam.z + vz * r - it.g.position.z); it.gal.mesh.rotation.y = Math.atan2(-vx, -vz); } }
      if (d > 24) it.anchored = false;
      it.card.mesh.visible = !!it.anchored && !ind; if (it.gal) it.gal.mesh.visible = !!it.anchored && !ind;
    }
  }
}
