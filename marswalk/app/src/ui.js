// Canvas-backed panels: the same drawing code feeds the helmet HUD, the wrist panel and the info cards.
import * as THREE from 'three';
import { num } from './i18n.js';
export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif';
export class Panel {
  constructor(w, h, pxPerM = 1000, opts = {}) {
    this.w = w; this.h = h; this.canvas = document.createElement('canvas'); this.canvas.width = Math.round(w * pxPerM); this.canvas.height = Math.round(h * pxPerM);
    this.ctx = this.canvas.getContext('2d'); this.tex = new THREE.CanvasTexture(this.canvas); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 4;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: opts.depthTest ?? false, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    this.mesh.renderOrder = opts.renderOrder ?? 100; this.mesh.frustumCulled = false;
  }
  draw(fn) { const c = this.ctx; c.save(); c.clearRect(0, 0, this.canvas.width, this.canvas.height); fn(c, this.canvas.width, this.canvas.height); c.restore(); this.tex.needsUpdate = true; }
}
export function rrect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
export function text(c, s, x, y, size, color = '#fff', weight = 500, align = 'left') { c.font = `${weight} ${size}px ${FONT}`; c.fillStyle = color; c.textAlign = align; c.textBaseline = 'alphabetic'; c.fillText(s, x, y); return c.measureText(s).width; }
export function wrap(c, s, x, y, maxW, size, lh, color = '#fff', weight = 400) {
  c.font = `${weight} ${size}px ${FONT}`; c.fillStyle = color; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  let line = ''; for (const w of s.split(/\s+/)) { const t = line ? line + ' ' + w : w; if (c.measureText(t).width > maxW && line) { c.fillText(line, x, y); y += lh; line = w; } else line = t; }
  if (line) { c.fillText(line, x, y); y += lh; } return y;
}
export const fmtHM = s => { s = Math.max(0, s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return `${h}h${String(m).padStart(2, '0')}`; };
export const fmtDist = m => m >= 1000 ? num(m / 1000, 2) + ' km' : Math.round(m) + ' m';
