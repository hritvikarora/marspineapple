// Route hand-off from MARS PATHFINDER (the team's 2D planner, src/ui/marswalkHandoff.ts).
// When the page is opened with ?planner=1, the A* route the user picked in the planner replaces the
// built-in EVA-1 route: same base, then base -> start, the planned outbound leg, the planned return leg
// (only if the planner computed one) and back to base. Approach legs to/from the base are NOT planned by
// the A* engine; they are straight segments and are labelled as such.
const KEY = 'marswalk:planner-route';
const NEAR_M = 15;   // a planner endpoint this close to a Marswalk stop reuses that stop (photos, text)

export function readPlannerRoute(params) {
  if (params.get('planner') !== '1') return null;
  let raw = null;
  const h = location.hash.slice(1);
  if (h.startsWith(KEY + '=')) raw = decodeURIComponent(h.slice(KEY.length + 1));
  if (!raw) { try { raw = localStorage.getItem(KEY); } catch { raw = null; } }
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    if (p?.schema !== 'marswalk/planner-route@1' || !(p.outbound?.points?.length >= 2)) return null;
    return p;
  } catch { return null; }
}

const plen = pts => pts.reduce((a, q, i) => i ? a + Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) : 0, 0);

export function applyPlannerRoute(site, plan) {
  const base = site.pois.find(p => p.kind === 'base');
  const stops = site.pois.filter(p => p.kind !== 'base');
  const endpoint = (id, e, role) => {
    const near = stops.find(p => Math.hypot(p.x - e.x, p.y - e.y) < NEAR_M);
    if (near) return near;
    const it = role === 'start' ? 'Partenza del percorso pianificato' : 'Destinazione del percorso pianificato';
    const en = role === 'start' ? 'Planned route start' : 'Planned route destination';
    return { id, name: e.name, kind: 'science', sol: null, photo: null, photos: [], x: e.x, y: e.y, elev: null,
      title: `${it}: ${e.name}`, title_en: `${en}: ${e.name}`,
      text: `Punto scelto in MARS PATHFINDER. Percorso calcolato con A* (${plan.modelVersion}, politica ${plan.policies.join(' + ')}) sul modello HiRISE a 1 m.`,
      text_en: `Point chosen in MARS PATHFINDER. Route computed by A* (${plan.modelVersion}, policy ${plan.policies.join(' + ')}) on the 1 m HiRISE elevation model.` };
  };
  const s = endpoint('pf-start', plan.start, 'start'), d = endpoint('pf-dest', plan.destination, 'destination');
  const out = plan.outbound.points, ret = plan.returnLeg?.points ?? null;
  const straight = (a, b) => [[a.x, a.y], [b.x, b.y]];
  const legs = [], route = [];
  const add = (frm, to, pts, planned, m) => { route.push(pts); legs.push({ frm: frm.id, to: to.id, length: Math.round(m?.length_m ?? plen(pts)), climb: m?.ascent_m ?? 0, maxSlope: m?.maxSlope_deg ?? 0, blocked: false, planned }); };
  add(base, s, straight(base, s), false);
  add(s, d, out, true, plan.outbound);
  if (ret) { add(d, s, ret, true, plan.returnLeg); add(s, base, straight(s, base), false); }
  else add(d, base, straight(d, base), false);
  const km = (legs.reduce((a, l) => a + l.length, 0) / 1000).toFixed(1);
  const b2 = { ...base, title: `EVA: ${s.name} → ${d.name}`, title_en: `EVA: ${s.name} → ${d.name}`,
    text: `Percorso scelto in MARS PATHFINDER: ${s.name} → ${d.name}${ret ? ' e ritorno' : ''}, ${km} km in tutto. La linea azzurra è il percorso A*; i tratti tra la base e il percorso sono segmenti diretti, non pianificati.`,
    text_en: `Route chosen in MARS PATHFINDER: ${s.name} → ${d.name}${ret ? ' and back' : ''}, ${km} km in total. The cyan line is the A* route; the stretches between the base and the route are direct segments, not planned.` };
  site.pois = [b2, ...new Map([[s.id, s], [d.id, d]]).values()];
  site.route = route; site.legs = legs; site.plannerRoute = plan;
  return site;
}

// Rebuilds the navigation texture (R = distance to the route in 0.1 m steps, G = rover track kept) so the
// cyan line on the ground follows the planned route. Texture covers the inner ring: pixel (c, r) =
// world (x = c - half, z = r - half), z = -north.
export async function plannerNavTexture(url, site, THREE) {
  const bmp = await createImageBitmap(await (await fetch(url)).blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const W = bmp.width, H = bmp.height, half = (W - 1) / 2, ctx = new OffscreenCanvas(W, H).getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0); const img = ctx.getImageData(0, 0, W, H), px = img.data;
  for (let i = 0; i < px.length; i += 4) { px[i] = 255; px[i + 3] = 255; }
  const RAD = 25;
  const stamp = (x, y) => {
    const c0 = Math.round(x + half), r0 = Math.round(-y + half);
    for (let r = Math.max(0, r0 - RAD); r <= Math.min(H - 1, r0 + RAD); r++)
      for (let c = Math.max(0, c0 - RAD); c <= Math.min(W - 1, c0 + RAD); c++) {
        const dd = Math.hypot(c - half - x, -(r - half) - y), v = Math.min(255, Math.round(dd * 10)), k = (r * W + c) * 4;
        if (v < px[k]) px[k] = v;
      }
  };
  site.legs.forEach((leg, li) => {
    if (!leg.planned) return;
    const pts = site.route[li];
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.5));
      for (let k = 0; k <= n; k++) stamp(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n);
    }
  });
  ctx.putImageData(img, 0, 0);
  const t = new THREE.Texture(await createImageBitmap(ctx.getImageData(0, 0, W, H), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }));
  t.flipY = false; t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = false; t.minFilter = t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}
