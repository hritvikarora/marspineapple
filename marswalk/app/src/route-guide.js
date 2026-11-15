// The planned A* route drawn as a glowing ribbon on the ground with moving chevrons (direction of travel),
// plus tall light beacons at the start (green, A) and the destination (red, B). Only legs computed by A* get
// the ribbon; the straight approach stretches from the base are not drawn as a path to follow.
import * as THREE from 'three';

function chevronTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = 'rgba(51,230,255,0.55)'; g.fillRect(0, 0, 64, 128);
  g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(10, 84); g.lineTo(32, 44); g.lineTo(54, 84); g.lineTo(44, 84); g.lineTo(32, 62); g.lineTo(20, 84); g.closePath(); g.fill();
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}

function beacon(color, label) {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 40, 16, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  beam.position.y = 20; g.add(beam);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.2, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false }));
  ring.position.y = 0.15; g.add(ring);
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#' + new THREE.Color(color).getHexString(); x.beginPath(); x.arc(64, 64, 60, 0, 7); x.fill(); x.lineWidth = 8; x.strokeStyle = '#000'; x.stroke();
  x.fillStyle = '#000'; x.font = 'bold 80px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(label, 64, 70);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, toneMapped: false })); sp.scale.set(2.5, 2.5, 1); sp.position.y = 4; sp.renderOrder = 50; g.add(sp);
  g.userData.ring = ring; return g;
}

export class RouteGuide {
  constructor(app) {
    this.app = app; this.group = new THREE.Group(); this.mats = [];
    const site = app.site; if (!site.plannerRoute) return;
    const ground = (x, y) => (app.ground(x, -y) ?? 0) + 0.12;
    site.legs.forEach((leg, li) => {
      if (!leg.planned) return;
      const pts = site.route[li]; if (!pts || pts.length < 2) return;
      // resample every 1 m so the ribbon hugs the terrain
      const s = []; for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0))); for (let k = i > 1 ? 1 : 0; k <= n; k++) s.push([x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n]); }
      const pos = [], uv = [], idx = [], HW = 0.9; let along = 0;
      for (let i = 0; i < s.length; i++) {
        const a = s[Math.max(0, i - 1)], b = s[Math.min(s.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L * HW, ny = dx / L * HW;
        if (i) along += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
        for (const sg of [1, -1]) { const x = s[i][0] + nx * sg, y = s[i][1] + ny * sg; pos.push(x, ground(x, y), -y); uv.push(sg > 0 ? 0 : 1, along / 2.5); }
        if (i) { const o = (i - 1) * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
      const mat = new THREE.MeshBasicMaterial({ map: chevronTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4 });
      this.mats.push(mat); const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = 5; this.group.add(mesh);
    });
    const plan = site.plannerRoute, out = site.legs.findIndex(l => l.planned);
    if (out >= 0) { const p = site.route[out], A = p[0], B = p[p.length - 1];
      const a = beacon(0x5be08a, 'A'), b = beacon(0xff6b5b, 'B'); a.position.set(A[0], ground(A[0], A[1]) - 0.12, -A[1]); b.position.set(B[0], ground(B[0], B[1]) - 0.12, -B[1]);
      this.beacons = [a, b]; this.group.add(a, b); this.start = { x: A[0], y: A[1], next: p[Math.min(p.length - 1, 4)] }; }
    void plan; app.scene.add(this.group);
  }
  update(dt) {
    for (const m of this.mats) m.map.offset.y -= dt * 0.8;   // chevrons flow from A towards B
    if (this.beacons) { const s = 1 + 0.15 * Math.sin(performance.now() / 300); for (const b of this.beacons) b.userData.ring.scale.setScalar(s); }
  }
}
