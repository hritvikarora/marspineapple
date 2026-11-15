// The astronaut's own arms in the headset: EVA gloves and suit sleeves built from simple shapes, attached to each controller.
// The controller's pointing ray starts at the fingertips, so the hand sits just behind it and the forearm runs back towards the elbow.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
const fabric = new THREE.MeshLambertMaterial({ color: 0xeceae4, emissive: 0x3a3a3a }), palm = new THREE.MeshLambertMaterial({ color: 0x5d6168 }), metal = new THREE.MeshLambertMaterial({ color: 0x9aa3ad }),
  ring = new THREE.MeshLambertMaterial({ color: 0xd7dde3 }), stripe = new THREE.MeshLambertMaterial({ color: 0xc8352b });
const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; };
const tube = (r1, r2, len, m, seg = 14) => new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, seg).rotateX(Math.PI / 2), m);   // along z

export function makeGlove(hand) {
  const s = hand === 'left' ? -1 : 1, g = new THREE.Group(); g.name = 'glove';
  const h = new THREE.Group(); h.position.set(0, -0.035, 0.07); h.rotation.x = 0.35; g.add(h);   // the hand, tilted like a hand holding a controller
  h.add(box(0.085, 0.034, 0.1, fabric, 0, 0, 0)); h.add(box(0.08, 0.006, 0.09, palm, 0, -0.019, 0));   // back of the hand and grippy palm
  for (let i = 0; i < 4; i++) { const f = new THREE.Group(); f.position.set(-0.03 + i * 0.02, -0.004, -0.05); f.rotation.x = -1.1; f.add(box(0.018, 0.02, 0.045, fabric, 0, 0, -0.022)); f.add(box(0.017, 0.019, 0.03, palm, 0, -0.012, -0.06)); h.add(f); }
  const th = new THREE.Group(); th.position.set(-s * 0.045, -0.006, -0.01); th.rotation.set(-0.4, s * 0.6, 0); th.add(box(0.02, 0.02, 0.05, fabric, 0, 0, -0.025)); h.add(th);
  const cuff = tube(0.048, 0.05, 0.05, ring); cuff.position.set(0, 0, 0.075); h.add(cuff);
  const bear = tube(0.053, 0.053, 0.022, metal); bear.position.set(0, 0, 0.105); h.add(bear);   // wrist bearing that joins glove and sleeve
  const arm = tube(0.056, 0.068, 0.34, fabric); arm.position.set(0, 0, 0.29); h.add(arm);
  const band = tube(0.059, 0.06, 0.03, stripe); band.position.set(0, 0, 0.2); h.add(band);
  // one mesh per material, so each hand costs only a few draw calls
  g.updateMatrixWorld(true); const by = new Map(); g.traverse(o => { if (!o.isMesh) return; const geo = o.geometry.clone().applyMatrix4(o.matrixWorld); geo.deleteAttribute('uv'); (by.get(o.material) || by.set(o.material, []).get(o.material)).push(geo); });
  const out = new THREE.Group(); out.name = 'glove'; for (const [m, list] of by) out.add(new THREE.Mesh(mergeGeometries(list), m)); return out;
}
