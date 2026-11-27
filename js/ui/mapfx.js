// v0.21 Map beauty pass. Per-map looks (ambient light, colour grade, haze, particles), baked lighting where
// every light throws a soft pool and props block it (shadows fall away from the lamp), props lit by the
// lights around them, ground decals, and a light live layer: light bloom, flicker, steam, drifting haze,
// dust / embers / fireflies / moths, club spot beams, a parallax skyline. All canvas, original art.
// Rules are untouched: nothing here reads or writes the battle state, it only paints.
// Readability: the board grid, move tiles, threat zones and cover shields are all drawn after the ground
// (so after the lighting), and the over-layer stays below ~10% opacity so pieces never get hard to see.
import { toWorld } from './yard.js';

const HX = 29, HY = 14.5, TAU = Math.PI * 2;
function hash(x, y, k = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(k | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };

// ---------- per-map looks ----------
// amb: ground/prop light far from any lamp (multiplied in), glow: how much light colour is added on top,
// grade: [cool top tint rgb, alpha, warm bottom tint rgb, alpha] (CSS layer), haze: drifting haze colour/alpha,
// parts: ambient particles, steam: vent density, sky: horizon glow / cloud colour, stars (clear nights).
export const LOOKS = {
  docklands: { amb: [0.62, 0.58, 0.68], glow: 0.42, grade: ['24,64,96', 0.13, '255,120,52', 0.10], haze: '190,150,150', hazeA: 0.020, parts: 'dust', steam: 0.5, sky: { glow: '255,112,64', cloud: '80,44,54', stars: 0 } },
  fish_wharf: { amb: [0.48, 0.54, 0.66], glow: 0.40, grade: ['28,72,116', 0.16, '120,170,210', 0.05], haze: '150,172,196', hazeA: 0.032, parts: 'none', steam: 0.8, sky: { glow: '90,130,180', cloud: '40,52,70', stars: 0 } },
  neon_strip: { amb: [0.46, 0.42, 0.60], glow: 0.48, grade: ['70,24,110', 0.14, '20,110,140', 0.09], haze: '170,110,180', hazeA: 0.020, parts: 'none', steam: 1, sky: { glow: '255,70,170', cloud: '70,30,80', stars: 0 } },
  club_velvet: { amb: [0.50, 0.42, 0.58], glow: 0.48, grade: ['110,24,96', 0.12, '255,120,70', 0.07], haze: '170,120,190', hazeA: 0.028, parts: 'motes', steam: 0, beams: 1, sky: { glow: '200,60,180', cloud: '60,24,70', stars: 0 } },
  gator_farm: { amb: [0.46, 0.55, 0.50], glow: 0.42, grade: ['20,70,50', 0.14, '120,140,60', 0.07], haze: '150,176,160', hazeA: 0.036, groundFog: 1, parts: 'flies', steam: 0, sky: { glow: '110,150,110', cloud: '30,46,36', stars: 1 } },
  foundry: { amb: [0.58, 0.52, 0.50], glow: 0.46, grade: ['20,44,70', 0.10, '255,104,28', 0.12], haze: '180,130,110', hazeA: 0.024, parts: 'embers', steam: 0.6, sky: { glow: '255,100,30', cloud: '80,42,30', stars: 0 } },
  rail_sidings: { amb: [0.58, 0.56, 0.62], glow: 0.42, grade: ['30,54,90', 0.12, '255,150,70', 0.09], haze: '170,150,150', hazeA: 0.020, parts: 'dust', steam: 0.4, sky: { glow: '255,140,70', cloud: '70,46,44', stars: 0 } },
  back_streets: { amb: [0.50, 0.54, 0.70], glow: 0.42, grade: ['22,44,100', 0.15, '255,140,60', 0.07], haze: '150,160,190', hazeA: 0.020, parts: 'leaves', steam: 0.8, sky: { glow: '255,150,80', cloud: '40,46,70', stars: 1 } },
  corner_shop: { amb: [0.52, 0.55, 0.70], glow: 0.42, grade: ['22,44,100', 0.14, '255,150,70', 0.08], haze: '150,160,190', hazeA: 0.020, parts: 'moths', steam: 0.6, sky: { glow: '255,150,80', cloud: '40,46,70', stars: 1 } },
};
const BY_THEME = { docklands: 'docklands', velvet: 'neon_strip', bayou: 'gator_farm', ironclaw: 'foundry', estate: 'back_streets' };
const LOOKC = new WeakMap();
export function lookOf(m) {
  if (!m) return LOOKS.docklands;
  let L = LOOKC.get(m);
  if (L) return L;
  const id = m.id === 'tutorial' ? 'docklands' : m.id;
  L = LOOKS[id] || LOOKS[BY_THEME[m.theme] || 'docklands'] || LOOKS.docklands;
  const env = m.env || {};
  if (!LOOKS[id]) {
    // editor maps: start from their theme and follow their own time / weather / indoor flags
    L = { ...L };
    if (env.indoor) { L.parts = 'motes'; L.steam = 0; }
    if (env.weather === 'fog') { L.hazeA = 0.09; L.groundFog = 1; }
    if (env.weather === 'rain') { L.parts = 'none'; L.steam = Math.max(L.steam || 0, 0.6); }
    if (env.time === 'dusk') L.amb = L.amb.map((v) => Math.min(0.8, v + 0.06));
  }
  L.key = id;
  LOOKC.set(m, L);
  return L;
}

// ---------- light sources ----------
// Every light: position (tile space), height (px, for shadows), radius (tiles), colour, intensity, flicker.
const KIND = {
  lamp: { R: 4.6, col: '255,172,88', I: 1.15, h: 54, fl: 0 },
  fire: { R: 3.0, col: '255,118,40', I: 0.95, h: 16, fl: 1 },
  neon: { R: 3.4, col: '255,80,150', I: 0.9, h: 30, fl: 2 },
  lantern: { R: 2.8, col: '255,170,80', I: 0.8, h: 34, fl: 1 },
  warm: { R: 3.2, col: '255,188,120', I: 0.75, h: 36, fl: 0 },
  tube: { R: 3.2, col: '176,206,255', I: 0.8, h: 36, fl: 0 },
  wall: { R: 1.8, col: '210,226,255', I: 0.55, h: 32, fl: 0 },
};
// Props that glow without being a gameplay light (window spill, signs, fridges, furnaces, floodlights).
const PROP_LIGHT = {
  phone_box: { R: 1.7, col: '255,236,190', I: 0.7, h: 34 },
  bus_shelter: { R: 1.9, col: '200,228,255', I: 0.65, h: 24 },
  fish_stall: { R: 2.0, col: '255,206,140', I: 0.7, h: 22 },
  ice_box: { R: 1.2, col: '150,200,255', I: 0.35, h: 8 },
  still: { R: 1.8, col: '255,120,40', I: 0.7, h: 8, fl: 1 },
  press: { R: 2.9, col: '255,120,40', I: 0.95, h: 12, fl: 1 },
  crane_base: { R: 3.4, col: '226,236,255', I: 0.75, h: 48 },
  warehouse: { R: 2.4, col: '255,196,124', I: 0.65, h: 40 },
  garage: { R: 1.9, col: '255,206,150', I: 0.55, h: 30 },
  stilt_shack: { R: 2.4, col: '255,176,88', I: 0.65, h: 30, fl: 1 },
  speakers: { R: 1.3, col: '120,90,255', I: 0.4, h: 20, fl: 2 },
  forklift: { R: 1.4, col: '255,214,150', I: 0.45, h: 10 },
  postbox: null,
};
const LIGHTS = new WeakMap();
export function lightsOf(m, prep) {
  let out = LIGHTS.get(m);
  if (out) return out;
  out = [];
  for (const L of prep.lights) {
    const k = KIND[L.kind] || KIND.tube;
    let col = L.col || k.col;
    if (L.kind === 'wall' && (L.hue === 'cafe' || L.hue === 'house' || L.hue === 'shack' || L.hue === 'club')) col = '255,182,112';
    if (L.kind === 'neon' && !L.col && L.x != null && m.id === 'club_velvet') col = '170,80,255';
    const ox = L.kind === 'lamp' ? 0.3 : 0, oy = L.kind === 'lamp' ? 0.05 : 0;
    out.push({ x: L.x + ox, y: L.y + oy, src: L, h: k.h, R: k.R, col, I: k.I, fl: k.fl, kind: L.kind, self: [L.x, L.y] });
  }
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const t = m.tiles[y][x];
    const d = PROP_LIGHT[t.decor];
    if (!d || t.sub) continue;
    const two = t.partner ? (t.dir === 'S' ? [0, 0.5] : [0.5, 0]) : [0, 0];
    out.push({ x: x + two[0], y: y + two[1], h: d.h, R: d.R, col: d.col, I: d.I, fl: d.fl || 0, kind: t.decor, self: [x, y], prop: 1 });
  }
  // a porch / bulkhead light over every outside door, on the side away from the room
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const t = m.tiles[y][x];
    if (t.decor !== 'door') continue;
    const inT = (xx, yy) => { const n = m.tiles[yy] && m.tiles[yy][xx]; return n && n.t === 'interior'; };
    const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]].filter(([dx, dy]) => !inT(x + dx, y + dy) && inT(x - dx, y - dy));
    if (!dirs.length) continue;
    const [dx, dy] = dirs[0];
    const club = t.hue === 'club' || m.id === 'club_velvet', cold = t.hue === 'office' || t.hue === 'works';
    out.push({ x: x + dx * 0.55, y: y + dy * 0.55, h: 34, R: 2.4, col: club ? '200,90,255' : cold ? '200,222,255' : '255,196,120', I: 0.7, fl: club ? 2 : 0, kind: 'porch', self: [x, y], prop: 1 });
  }
  LIGHTS.set(m, out);
  return out;
}

// ---------- baked lighting ----------
// lum = ambient + light (multiplied into the ground), glow = light only (added on top for the colour).
// Each light is painted into a scratch layer, then every prop footprint near it cuts a shadow that runs
// away from the light (long behind tall boxes, short behind crates), then the layer is added in.
const LIGHTMAP = new WeakMap();
// the same pick as yard.js drawWall makes for a wall's dressing (windows let light out in patches)
const WALL_KINDS = { office: ['lockers', 'window', 'poster', 'fridge', 'lockers'], cafe: ['rack', 'neon', 'fridge', 'poster', 'rack'], club: ['neon', 'poster', 'neon', 'rack'], shop: ['rack', 'rack', 'poster', 'fridge'], house: ['window', 'poster', 'window', 'rack'], shack: ['window', 'rack', 'poster'], works: ['lockers', 'rack', 'window', 'lockers'] };
const WINDOWY = new Set(['window']);
function wallKind(t, x, y) { const k = WALL_KINDS[t.hue] || WALL_KINDS.office; return k[Math.floor(hash(x, y, 4) * k.length)]; }
const LK = 0.3; // light map scale relative to the ground bake: soft by construction, cheap to build
function shadowPoly(fx0, fy0, fx1, fy1, h, L) {
  const pts = [];
  const lh = L.h;
  const k = h >= lh * 0.92 ? 7 : h / (lh - h);
  for (const [cx, cy] of [[fx0, fy0], [fx1, fy0], [fx1, fy1], [fx0, fy1]]) {
    pts.push([cx, cy]);
    let dx = cx - L.x, dy = cy - L.y;
    const d = Math.hypot(dx, dy) || 0.01;
    let s = Math.min(k, (L.R + 1.5) / d);
    pts.push([cx + dx * s, cy + dy * s]);
  }
  return pts;
}
function hull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  up.pop(); lo.pop();
  return lo.concat(up);
}
const POOL = new Map();
function poolSprite(col) {
  let c = POOL.get(col);
  if (c) return c;
  c = mkCanvas(256, 256);
  const g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  // a hot centre with a long soft falloff (inverse-square-ish), so pools read as real light
  gr.addColorStop(0, `rgba(${col},1)`); gr.addColorStop(0.18, `rgba(${col},0.78)`); gr.addColorStop(0.45, `rgba(${col},0.36)`);
  gr.addColorStop(0.75, `rgba(${col},0.1)`); gr.addColorStop(1, `rgba(${col},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  POOL.set(col, c);
  return c;
}
export function lightMap(m, prep, B, footprints) {
  let lm = LIGHTMAP.get(m);
  if (lm) return lm;
  const look = lookOf(m);
  const W = B.W * LK, H = B.H * LK, sc = B.S * LK;
  const lum = mkCanvas(W, H), glow = mkCanvas(W, H), tmp = mkCanvas(W, H);
  const lg = lum.getContext('2d'), gg = glow.getContext('2d'), tg = tmp.getContext('2d');
  // ambient with a gentle sky gradient: a touch brighter toward the back (north-west) of the board, a
  // touch darker toward the front, so the board has depth even far from any lamp
  {
    const a = toWorld(0, 0), b = toWorld(m.w, m.h);
    const p0 = [(a.x - B.minX) * sc, (a.y - B.minY) * sc], p1 = [(b.x - B.minX) * sc, (b.y - B.minY) * sc];
    const gr = lg.createLinearGradient(p0[0], p0[1], p1[0], p1[1]);
    const c = (k) => `rgb(${look.amb.map((v) => Math.round(clamp(v * k) * 255)).join(',')})`;
    gr.addColorStop(0, c(1.12)); gr.addColorStop(1, c(0.9));
    lg.fillStyle = gr; lg.fillRect(0, 0, lum.width, lum.height);
  }
  const world = (c) => c.setTransform(sc, 0, 0, sc, -B.minX * sc, -B.minY * sc);
  const occl = [];
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const t = m.tiles[y][x];
    if (!t.decor || t.decor === 'lamp' || t.decor === 'fence') continue;
    const leak = t.decor === 'wall' && WINDOWY.has(wallKind(t, x, y)) ? 0.45 : 1;
    for (const [x0, y0, x1, y1, h] of footprints(t)) if (h >= 6) occl.push([x + x0, y + y0, x + x1, y + y1, h, x, y, leak]);
  }
  for (const L of lightsOf(m, prep)) {
    tg.setTransform(1, 0, 0, 1, 0, 0); tg.globalCompositeOperation = 'source-over'; tg.clearRect(0, 0, tmp.width, tmp.height);
    world(tg);
    const c = toWorld(L.x, L.y), rx = L.R * HX * 1.41;
    tg.drawImage(poolSprite(L.col), c.x - rx, c.y - rx * 0.5, rx * 2, rx);
    tg.globalCompositeOperation = 'destination-out';
    tg.fillStyle = 'rgba(0,0,0,0.82)';
    for (const o of occl) {
      const [x0, y0, x1, y1, h, ox, oy, leak] = o;
      tg.fillStyle = `rgba(0,0,0,${0.82 * leak})`;
      if (Math.abs(ox - L.self[0]) + Math.abs(oy - L.self[1]) < 0.6) continue;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      if (Math.hypot(cx - L.x, cy - L.y) > L.R + 1) continue;
      if (L.x >= x0 && L.x <= x1 && L.y >= y0 && L.y <= y1) continue;
      const poly = hull(shadowPoly(x0, y0, x1, y1, h, L)).map(([px, py]) => toWorld(px, py));
      tg.beginPath(); tg.moveTo(poly[0].x, poly[0].y); for (let i = 1; i < poly.length; i++) tg.lineTo(poly[i].x, poly[i].y); tg.closePath(); tg.fill();
    }
    lg.globalCompositeOperation = 'lighter'; lg.globalAlpha = clamp(L.I * 0.68); lg.drawImage(tmp, 0, 0);
    gg.globalCompositeOperation = 'lighter'; gg.globalAlpha = clamp(L.I); gg.drawImage(tmp, 0, 0);
  }
  lg.globalAlpha = gg.globalAlpha = 1;
  lm = { lum, glow, look };
  LIGHTMAP.set(m, lm);
  return lm;
}
// Applied by the ground bake (any transform: it draws in bake pixels, the region proxy maps it).
export function applyLight(g, m, prep, B, footprints) {
  const lm = lightMap(m, prep, B, footprints);
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.globalCompositeOperation = 'multiply'; g.drawImage(lm.lum, 0, 0, B.W, B.H);
  g.globalCompositeOperation = 'lighter'; g.globalAlpha = lm.look.glow; g.drawImage(lm.glow, 0, 0, B.W, B.H);
  g.restore();
}

// ---------- lit props ----------
// Sprites are painted once into a cache, so lighting them is free per frame: multiply by the light at the
// prop (brighter on the side facing the strongest light), add a little light colour, restore the alpha.
let CUR = null;
export function setCurrent(m) { CUR = m; }
function lightAtTile(m, prep, x, y) {
  const look = lookOf(m);
  let r = look.amb[0], g = look.amb[1], b = look.amb[2], ar = 0, ag = 0, ab = 0, dx = 0, dy = 0;
  for (const L of lightsOf(m, prep)) {
    const d = Math.hypot(x - L.x, y - L.y);
    if (d > L.R + 0.5) continue;
    const f = clamp(1 - d / (L.R + 0.5)) ** 1.6 * L.I;
    const [cr, cg, cb] = L.col.split(',').map((v) => +v / 255);
    r += cr * f * 0.8; g += cg * f * 0.8; b += cb * f * 0.8;
    ar += cr * f; ag += cg * f; ab += cb * f;
    const w = toWorld(L.x - x, L.y - y); dx += w.x * f; dy += w.y * f;
  }
  const n = Math.hypot(dx, dy) || 1;
  return { lum: [clamp(r), clamp(g), clamp(b)], add: [ar, ag, ab], dir: [dx / n, dy / n], k: clamp(Math.hypot(dx, dy) / 40) };
}
export function litKey() { return CUR ? `|L${lookOf(CUR).key}` : ''; }
export function current() { return CUR; }
export function lightSprite(cv, m, prep, x, y, ox, oy, kx) {
  const L = lightAtTile(m, prep, x, y);
  const g = cv.getContext('2d');
  const mask = mkCanvas(cv.width, cv.height);
  mask.getContext('2d').drawImage(cv, 0, 0);
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  const W = cv.width, Hh = cv.height;
  // multiply: darker on the side away from the light
  const lo = L.lum.map((v) => Math.round(255 * clamp(v * (1 - 0.18 * L.k)))), hi = L.lum.map((v) => Math.round(255 * clamp(v * (1 + 0.22 * L.k) + 0.04)));
  const gx = ox + L.dir[0] * W * 0.5, gy = oy + L.dir[1] * Hh * 0.3;
  const gr = g.createLinearGradient(ox - L.dir[0] * W * 0.5, oy - L.dir[1] * Hh * 0.3, gx, gy);
  gr.addColorStop(0, `rgb(${lo.join(',')})`); gr.addColorStop(1, `rgb(${hi.join(',')})`);
  g.globalCompositeOperation = 'multiply'; g.fillStyle = gr; g.fillRect(0, 0, W, Hh);
  // light colour spill, strongest low down near the pool on the ground
  const a = clamp(Math.max(...L.add) * 0.22, 0, 0.3);
  if (a > 0.01) {
    const s = Math.max(...L.add) || 1, col = L.add.map((v) => Math.round(255 * v / s)).join(',');
    const vg = g.createLinearGradient(0, oy + 6 * kx, 0, 0);
    vg.addColorStop(0, `rgba(${col},${a})`); vg.addColorStop(1, `rgba(${col},${a * 0.25})`);
    g.globalCompositeOperation = 'lighter'; g.fillStyle = vg; g.fillRect(0, 0, W, Hh);
  }
  g.globalCompositeOperation = 'destination-in'; g.drawImage(mask, 0, 0);
  g.restore();
}
// ---------- ground decals (baked, tile space) ----------
// Manholes (and the steam that rises from them), road paint, leaves, litter, rust, slag, moss, lily pads.
const DEC = new WeakMap();
export function ventsOf(m) { return (DEC.get(m) || {}).vents || []; }
export function paintDecals(g, m, prep) {
  const look = lookOf(m), r = rng(9001 + m.w * 7 + m.h * 13), th = m.theme || 'docklands';
  const at = (x, y) => (x >= 0 && y >= 0 && x < m.w && y < m.h ? m.tiles[y][x] : null);
  const free = (x, y) => { const t = at(x, y); return t && !t.decor && !t.block; };
  const kind = (x, y) => (at(x, y) || {}).t;
  const vents = [];
  const cells = [];
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (free(x, y)) cells.push([x, y]);
  const pick = (pred) => { for (let i = 0; i < 40; i++) { const c = cells[Math.floor(r() * cells.length)]; if (c && pred(kind(c[0], c[1]), c[0], c[1])) return c; } return null; };
  const hardK = new Set(['yard', 'asphalt', 'pavement', 'factory', 'edge']);
  // manhole covers (a few vent steam)
  const nMan = th === 'bayou' ? 0 : th === 'velvet' || th === 'estate' ? 4 : 3;
  for (let i = 0; i < nMan; i++) {
    const c = pick((k) => hardK.has(k));
    if (!c) continue;
    const x = c[0] + (r() - 0.5) * 0.3, y = c[1] + (r() - 0.5) * 0.3, R = 0.26;
    g.fillStyle = 'rgba(10,10,12,0.75)'; g.beginPath(); g.arc(x, y, R + 0.04, 0, TAU); g.fill();
    g.fillStyle = '#2c2c2e'; g.beginPath(); g.arc(x, y, R, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(150,150,150,0.35)'; g.lineWidth = 0.02;
    for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(x - R * 0.8, y + k * 0.08); g.lineTo(x + R * 0.8, y + k * 0.08); g.stroke(); }
    g.beginPath(); g.arc(x, y, R * 0.92, 0, TAU); g.stroke();
    g.fillStyle = 'rgba(255,240,220,0.08)'; g.beginPath(); g.arc(x - 0.06, y - 0.06, R * 0.5, 0, TAU); g.fill();
    if (i < Math.round(nMan * (look.steam || 0))) vents.push({ x, y, s: 0.8 + r() * 0.5, ph: r() * 10 });
  }
  // extra vents: foundry pipes / presses, wharf ice boxes (cold vapour), stills
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const t = m.tiles[y][x];
    if (t.sub) continue;
    if (t.decor === 'pipes' || t.decor === 'press') vents.push({ x: x + 0.2, y: y - 0.1, s: 1.1, ph: hash(x, y, 3) * 10, h: t.decor === 'pipes' ? 22 : 30 });
    else if (t.decor === 'ice_box') vents.push({ x, y, s: 0.7, ph: hash(x, y, 4) * 10, h: 10, cold: 1 });
    else if (t.decor === 'still') vents.push({ x, y, s: 0.8, ph: hash(x, y, 5) * 10, h: 22 });
  }
  // road paint on wide asphalt: zebra crossings, give-way lines, double yellow kerb lines
  if (th === 'velvet' || th === 'estate') {
    let done = 0;
    for (let y = 1; y < m.h - 1 && done < 2; y++) for (let x = 2; x < m.w - 2 && done < 2; x++) {
      if (kind(x, y) !== 'asphalt' || kind(x, y - 1) !== 'asphalt' || kind(x, y + 1) !== 'asphalt' || hash(x, y, 71) > 0.06) continue;
      if (kind(x - 2, y) === 'asphalt' && kind(x + 2, y) === 'asphalt') continue; // crossings run across a road, not along it
      for (let k = -1; k <= 1; k++) for (let s = 0; s < 4; s++) {
        if (!free(x, y + k)) continue;
        g.fillStyle = 'rgba(226,222,206,0.34)'; g.fillRect(x - 0.42 + s * 0.24, y + k - 0.48, 0.13, 0.96);
      }
      done++;
    }
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      if (kind(x, y) !== 'asphalt') continue;
      const kerbN = kind(x, y - 1) === 'pavement', kerbW = kind(x - 1, y) === 'pavement';
      g.fillStyle = 'rgba(214,170,40,0.38)';
      if (kerbN) { g.fillRect(x - 0.5, y - 0.4, 1, 0.035); g.fillRect(x - 0.5, y - 0.33, 1, 0.035); }
      if (kerbW) { g.fillRect(x - 0.4, y - 0.5, 0.035, 1); g.fillRect(x - 0.33, y - 0.5, 0.035, 1); }
      // gutter grime along the kerb
      if (kerbN || kerbW) { g.fillStyle = 'rgba(0,0,0,0.18)'; if (kerbN) g.fillRect(x - 0.5, y - 0.5, 1, 0.12); if (kerbW) g.fillRect(x - 0.5, y - 0.5, 0.12, 1); }
    }
  }
  // wet tarmac sheen streaks (rain maps)
  if (m.env && m.env.weather === 'rain') {
    for (let i = 0; i < 70; i++) {
      const c = pick((k) => hardK.has(k));
      if (!c) continue;
      const x = c[0] + r() - 0.5, y = c[1] + r() - 0.5;
      g.fillStyle = `rgba(170,190,220,${0.04 + r() * 0.05})`;
      g.beginPath(); g.ellipse(x, y, 0.2 + r() * 0.5, 0.06 + r() * 0.1, r() * 3, 0, TAU); g.fill();
    }
  }
  // fallen leaves on the estate, cigarette ends and bottle caps on the streets
  if (th === 'estate') {
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      const t = m.tiles[y][x];
      if (t.decor !== 'tree' && t.decor !== 'hedge') continue;
      for (let i = 0; i < 26; i++) {
        const a = r() * TAU, d = 0.3 + r() * 1.6, lx = x + Math.cos(a) * d, ly = y + Math.sin(a) * d;
        g.fillStyle = ['rgba(150,90,30,0.55)', 'rgba(120,60,24,0.5)', 'rgba(170,130,50,0.45)', 'rgba(80,60,30,0.5)'][Math.floor(r() * 4)];
        g.save(); g.translate(lx, ly); g.rotate(r() * TAU); g.beginPath(); g.ellipse(0, 0, 0.05, 0.025, 0, 0, TAU); g.fill(); g.restore();
      }
    }
  }
  if (th !== 'bayou') {
    for (let i = 0; i < 60; i++) {
      const c = pick((k) => hardK.has(k));
      if (!c) continue;
      const x = c[0] + r() - 0.5, y = c[1] + r() - 0.5;
      g.fillStyle = r() < 0.6 ? 'rgba(230,220,200,0.45)' : 'rgba(190,120,60,0.5)';
      g.save(); g.translate(x, y); g.rotate(r() * TAU); g.fillRect(-0.025, -0.008, 0.05, 0.016); g.restore();
    }
  }
  // docks: rust bleed around containers and salt-white specks on the quay
  if (th === 'docklands' || th === 'ironclaw') {
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      const t = m.tiles[y][x];
      if (t.decor !== 'container' && t.decor !== 'wagon' && t.decor !== 'scrap' && t.decor !== 'skip') continue;
      if (r() < 0.5) continue;
      const lx = x + (r() - 0.5) * 0.8, ly = y + 0.5 + r() * 0.3;
      const gr = g.createRadialGradient(lx, ly, 0, lx, ly, 0.45);
      gr.addColorStop(0, 'rgba(120,52,20,0.32)'); gr.addColorStop(1, 'rgba(120,52,20,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(lx, ly, 0.45, 0, TAU); g.fill();
    }
  }
  // foundry: metal filings and hazard chevrons in front of the presses
  if (th === 'ironclaw') {
    for (let i = 0; i < 260; i++) {
      const c = pick((k) => k === 'factory' || k === 'yard' || k === 'interior');
      if (!c) continue;
      g.fillStyle = r() < 0.5 ? 'rgba(200,205,210,0.25)' : 'rgba(20,20,20,0.35)';
      g.fillRect(c[0] + r() - 0.5, c[1] + r() - 0.5, 0.03, 0.012);
    }
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      const t = m.tiles[y][x];
      if (t.decor !== 'press' || t.sub) continue;
      const fy = y + 0.62;
      g.save(); g.beginPath(); g.rect(x - 0.5, fy, t.partner ? 2 : 1, 0.16); g.clip();
      for (let k = 0; k < 12; k++) { g.fillStyle = k % 2 ? 'rgba(20,20,20,0.6)' : 'rgba(214,170,40,0.55)'; g.beginPath(); g.moveTo(x - 0.6 + k * 0.2, fy); g.lineTo(x - 0.5 + k * 0.2, fy); g.lineTo(x - 0.6 + k * 0.2, fy + 0.16); g.lineTo(x - 0.7 + k * 0.2, fy + 0.16); g.fill(); }
      g.restore();
    }
  }
  // bayou: duckweed and lily pads on the black water, moss on the mud
  if (th === 'bayou') {
    for (let y = -2; y < m.h + 2; y++) for (let x = -3; x < m.w; x++) {
      const t = at(x, y);
      if ((t && t.t !== 'water') || (!t && x >= 0)) continue;
      for (let i = 0; i < 3; i++) {
        if (r() < 0.45) continue;
        const lx = x + r() - 0.5, ly = y + r() - 0.5, R = 0.06 + r() * 0.08;
        g.fillStyle = `rgba(${60 + Math.floor(r() * 30)},${90 + Math.floor(r() * 30)},40,0.55)`;
        g.beginPath(); g.moveTo(lx, ly); g.arc(lx, ly, R, 0.3, TAU - 0.2); g.closePath(); g.fill();
      }
      if (r() < 0.3) { g.fillStyle = 'rgba(70,96,40,0.18)'; g.beginPath(); g.ellipse(x + r() - 0.5, y + r() - 0.5, 0.4, 0.2, r() * 3, 0, TAU); g.fill(); }
    }
    for (let i = 0; i < 90; i++) {
      const c = pick((k) => k === 'mud' || k === 'dirt' || k === 'grass');
      if (!c) continue;
      g.fillStyle = 'rgba(60,84,36,0.22)'; g.beginPath(); g.ellipse(c[0] + r() - 0.5, c[1] + r() - 0.5, 0.12 + r() * 0.2, 0.06 + r() * 0.1, r() * 3, 0, TAU); g.fill();
    }
  }
  // club: spilled drinks with a coloured sheen, a polished dance floor sparkle
  if (m.id === 'club_velvet' || (m.env && m.env.indoor)) {
    for (let i = 0; i < 14; i++) {
      const c = pick((k) => k === 'interior');
      if (!c) continue;
      const x = c[0] + r() - 0.5, y = c[1] + r() - 0.5;
      g.fillStyle = 'rgba(20,10,24,0.5)'; g.beginPath(); g.ellipse(x, y, 0.12 + r() * 0.12, 0.08 + r() * 0.06, r() * 3, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,140,220,0.12)'; g.beginPath(); g.ellipse(x - 0.03, y - 0.02, 0.06, 0.03, 0, 0, TAU); g.fill();
    }
  }
  DEC.set(m, { vents });
}

// ---------- graffiti (on exterior wall faces, containers, garages) ----------
// Real words only, sprayed loose with drips, plus a fang sigil. Painted into the cached sprite.
const TAGS = ['HELIX LIES', 'WAKE UP', 'NO MORE RATIONS', 'ICE IS A LEASH', 'VALE LIES', 'FANG CITY', 'RUN'];
const SPRAY = ['230,60,70', '90,200,230', '240,200,60', '230,230,220', '150,230,90', '230,110,200'];
export function graffiti(g, onFace, F, seed, z) {
  const r = rng(seed * 997 + 3);
  if (r() < 0.5) return;
  const col = SPRAY[Math.floor(r() * SPRAY.length)];
  const sigil = r() < 0.35;
  onFace(g, F, () => {
    const u0 = 0.15 + r() * 0.2, v0 = 0.45 + r() * 0.18;
    if (sigil) {
      // the fang mark: a ring with two teeth, dripping
      g.strokeStyle = `rgba(${col},0.55)`; g.lineWidth = 0.025;
      g.beginPath(); g.ellipse(u0 + 0.15, v0, 0.1, 0.22, 0, 0, TAU); g.stroke();
      g.fillStyle = `rgba(${col},0.55)`;
      for (const du of [0.1, 0.2]) { g.beginPath(); g.moveTo(u0 + du - 0.03, v0 - 0.12); g.lineTo(u0 + du + 0.03, v0 - 0.12); g.lineTo(u0 + du, v0 + 0.12); g.closePath(); g.fill(); }
      for (let k = 0; k < 3; k++) g.fillRect(u0 + 0.07 + r() * 0.16, v0 + 0.18, 0.008, 0.05 + r() * 0.12);
      return;
    }
  });
  if (sigil) return;
  // words: drawn upright on the face (sheared with it), so they read as painted on the wall
  const word = TAGS[Math.floor(r() * TAGS.length)];
  const A = F.A, B = F.B, len = Math.hypot(B[0] - A[0], B[1] - A[1]);
  if (len < 20 * z * 0.6) return;
  g.save();
  const u = 0.5, px = A[0] + (B[0] - A[0]) * u, py = A[1] + (B[1] - A[1]) * u - F.H * (0.5 + r() * 0.12);
  g.translate(px, py);
  g.transform((B[0] - A[0]) / len, (B[1] - A[1]) / len, 0, 1, 0, 0);
  const size = Math.min(F.H * 0.26, len * 1.5 / word.length);
  g.font = `700 ${size.toFixed(2)}px Oswald, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.rotate((r() - 0.5) * 0.12);
  g.lineJoin = 'round'; g.lineWidth = size * 0.16; g.strokeStyle = 'rgba(12,12,14,0.5)'; g.strokeText(word, 0, 0);
  g.fillStyle = `rgba(${col},0.62)`; g.fillText(word, 0, 0);
  const w = g.measureText(word).width;
  for (let k = 0; k < 4; k++) g.fillRect(-w / 2 + r() * w, size * 0.3, size * 0.06, size * (0.2 + r() * 0.7));
  g.restore();
}

// ---------- shared sprites ----------
const SPR = new Map();
function soft(key, col, n = 64) {
  let c = SPR.get(key); if (c) return c;
  c = mkCanvas(n * 2, n * 2);
  const g = c.getContext('2d'), gr = g.createRadialGradient(n, n, 0, n, n, n);
  gr.addColorStop(0, `rgba(${col},1)`); gr.addColorStop(0.4, `rgba(${col},0.55)`); gr.addColorStop(1, `rgba(${col},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, n * 2, n * 2);
  SPR.set(key, c); return c;
}
function beamSprite(col) {
  const key = 'beam:' + col; let c = SPR.get(key); if (c) return c;
  c = mkCanvas(128, 256);
  const g = c.getContext('2d');
  const vg = g.createLinearGradient(0, 0, 0, 256); vg.addColorStop(0, `rgba(${col},0.9)`); vg.addColorStop(1, `rgba(${col},0.15)`);
  g.fillStyle = vg; g.beginPath(); g.moveTo(58, 0); g.lineTo(70, 0); g.lineTo(128, 256); g.lineTo(0, 256); g.closePath(); g.fill();
  // soften the edges
  g.globalCompositeOperation = 'destination-in';
  const hg = g.createLinearGradient(0, 0, 128, 0); hg.addColorStop(0, 'rgba(0,0,0,0)'); hg.addColorStop(0.35, 'rgba(0,0,0,1)'); hg.addColorStop(0.65, 'rgba(0,0,0,1)'); hg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = hg; g.fillRect(0, 0, 128, 256);
  SPR.set(key, c); return c;
}

// Where each light lands in water (searched toward the viewer, the way a reflection falls in iso)
const REFL = new WeakMap();
function reflOf(m, prep) {
  let r = REFL.get(m); if (r) return r;
  r = [];
  const water = (x, y) => { if (x < 0 && y >= -3 && y < m.h + 3) { let all = true; for (let yy = 0; yy < m.h; yy++) if (m.tiles[yy][0].t !== 'water') { all = false; break; } return all; } const t = m.tiles[Math.round(y)] && m.tiles[Math.round(y)][Math.round(x)]; return !!(t && t.t === 'water'); };
  for (const L of lightsOf(m, prep)) {
    for (const d of [0.8, 1.4, 2.0, 2.6]) {
      for (const [dx, dy] of [[d, d * 0.2], [d * 0.2, d], [-d, 0], [0, -d]]) {
        const x = L.x + dx, y = L.y + dy;
        if (water(x, y)) { r.push({ x, y, col: L.col, I: L.I * (1 - d / 3.2) }); break; }
      }
      if (r.length && r[r.length - 1].col === L.col && Math.abs(r[r.length - 1].x - L.x) < 3) break;
    }
  }
  REFL.set(m, r);
  return r;
}

// ---------- live layer, under the pieces (world space; g is in camera space, z = zoom) ----------
export function drawUnder(g, m, prep, z, now) {
  const look = lookOf(m), t = now / 1000;
  g.save();
  g.globalCompositeOperation = 'lighter';
  // flicker on top of the baked pools: fire breathes, neon buzzes and now and then drops out
  // (only fires and a couple of 'faulty' neons per map, kept small: additive fills are the costly part)
  let neon = 0;
  for (const L of lightsOf(m, prep)) {
    if (!L.fl) continue;
    if (L.fl === 2 && (neon++ % 5 !== 1)) continue;
    let a;
    if (L.fl === 1) a = 0.10 + 0.06 * Math.sin(t * 9 + L.x * 3) + 0.04 * Math.sin(t * 23 + L.y * 5);
    else { const s = Math.floor(t * 12 + L.x * 7); a = hash(s, L.y | 0, 9) < 0.06 ? 0 : 0.09 + 0.02 * Math.sin(t * 40 + L.x); }
    if (a <= 0.005) continue;
    const c = toWorld(L.x, L.y), rx = L.R * 0.5 * HX * 1.41 * z;
    g.globalAlpha = clamp(a * 1.4);
    g.drawImage(poolSprite(L.col), c.x * z - rx, c.y * z - rx * 0.5, rx * 2, rx);
  }
  // lights reflected in nearby water: a broken, shimmering column below each light
  for (const R of reflOf(m, prep)) {
    const c = toWorld(R.x, R.y), X = c.x * z, Y = c.y * z;
    const sp = soft('bl:' + R.col, R.col);
    for (let i = 0; i < 4; i++) {
      const wob = Math.sin(t * 2.1 + i * 1.9 + R.x) * 2.2 * z, yy = Y + (i - 1) * 4 * z;
      g.globalAlpha = (0.16 - i * 0.03) * (0.75 + 0.25 * Math.sin(t * 3 + i + R.y)) * R.I;
      g.drawImage(sp, X + wob - 7 * z, yy - 1.6 * z, 14 * z, 3.2 * z);
    }
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  // ground fog (bayou): slow low banks that hug the board, under the pieces
  if (look.groundFog) {
    const T0 = g.getTransform();
    const fs = soft('fog:gf', '96,118,106');
    for (let i = 0; i < 5; i++) {
      const bx = (hash(i, 1, 77) * (m.w + 6) - 3 + t * (0.05 + 0.03 * (i % 3))) % (m.w + 6) - 3;
      const by = hash(i, 2, 77) * m.h;
      const c = toWorld(bx, by), R = (70 + hash(i, 3, 77) * 40) * z;
      if (c.x * z + R < -T0.e || c.x * z - R > -T0.e + g.canvas.width || c.y * z + R < -T0.f || c.y * z - R > -T0.f + g.canvas.height) continue;
      g.globalAlpha = 0.035 + 0.015 * Math.sin(t * 0.3 + i);
      g.drawImage(fs, c.x * z - R, c.y * z - R * 0.4, R * 2, R * 0.8);
    }
    g.globalAlpha = 1;
  }
  g.restore();
}

// ---------- live layer, over everything (screen space; camera transform passed in) ----------
const PARTS = new WeakMap();
function partsOf(m, look) {
  let p = PARTS.get(m); if (p) return p;
  const r = rng(4040 + m.w), n = { dust: 46, embers: 56, flies: 34, motes: 60, leaves: 18, moths: 14 }[look.parts] || 0;
  p = [];
  for (let i = 0; i < n; i++) p.push({ x: r() * (m.w + 2) - 1, y: r() * (m.h + 2) - 1, h: r() * 60, s: 0.4 + r(), ph: r() * TAU, k: r() });
  if (look.parts === 'moths') {
    // moths gather round the lamps
    const ls = (m.__fxLights || []).filter((L) => L.kind === 'lamp' || L.kind === 'phone_box' || L.kind === 'bus_shelter');
    p.forEach((q, i) => { const L = ls[i % Math.max(1, ls.length)]; if (L) { q.ax = L.x; q.ay = L.y; q.ah = L.h; } });
  }
  PARTS.set(m, p); return p;
}
export function drawOver(g, m, prep, T, z, now, w, h) {
  if (!T) return;
  const look = lookOf(m), t = now / 1000;
  const lights = lightsOf(m, prep);
  m.__fxLights = lights;
  g.save();
  g.setTransform(T);
  const vx0 = -T.e - 60 * z, vy0 = -T.f - 120 * z, vx1 = vx0 + w + 120 * z, vy1 = vy0 + h + 240 * z;
  const vis = (x, y) => x > vx0 && x < vx1 && y > vy0 && y < vy1;
  // bloom round every light head (cheap: one additive sprite each)
  g.globalCompositeOperation = 'lighter';
  for (const L of lights) {
    const c = toWorld(L.x, L.y), X = c.x * z, Y = (c.y - L.h * 0.92) * z;
    if (!vis(X, Y)) continue;
    const R = (L.kind === 'lamp' ? 26 : L.prop ? 14 : 18) * z;
    let a = L.kind === 'lamp' ? 0.22 : 0.12;
    if (L.fl === 1) a *= 0.85 + 0.15 * Math.sin(t * 11 + L.x);
    g.globalAlpha = a;
    g.drawImage(soft('bl:' + L.col, L.col), X - R, Y - R, R * 2, R * 2);
  }
  // club: three coloured spot beams sweeping the floor, with a pool where they land
  if (look.beams) {
    const cols = ['255,70,180', '90,160,255', '200,90,255'];
    const cx = m.w / 2, cy = m.h / 2;
    for (let i = 0; i < 3; i++) {
      const a = t * (0.35 + i * 0.12) + i * 2.1;
      const fx = cx + Math.cos(a) * (3 + i), fy = cy + Math.sin(a * 1.3) * 2.6;
      const src = toWorld(cx - 2 + i * 2, 4.5), dst = toWorld(fx, fy);
      const X0 = src.x * z, Y0 = (src.y - 120) * z, X1 = dst.x * z, Y1 = dst.y * z;
      const dx = X1 - X0, dy = Y1 - Y0, L = Math.hypot(dx, dy);
      g.save(); g.translate(X0, Y0); g.rotate(Math.atan2(dy, dx) - Math.PI / 2);
      g.globalAlpha = 0.09; g.drawImage(beamSprite(cols[i]), -22 * z, 0, 44 * z, L);
      g.restore();
      g.globalAlpha = 0.22; const R = 30 * z; g.drawImage(soft('bl:' + cols[i], cols[i]), X1 - R, Y1 - R * 0.5, R * 2, R);
    }
  }
  // steam from manholes, pipes, presses; cold vapour off the fish boxes
  g.globalCompositeOperation = 'source-over';
  const vents = ventsOf(m);
  if (vents.length) {
    const st = soft('steam', '200,205,215'), cold = soft('cold', '200,225,255');
    for (const v of vents) {
      const c = toWorld(v.x, v.y);
      if (!vis(c.x * z, c.y * z)) continue;
      for (let k = 0; k < 4; k++) {
        const f = ((t * 0.32 * v.s + v.ph + k / 4) % 1);
        const rise = (v.h || 0) + f * (v.cold ? 14 : 46), R = (5 + f * (v.cold ? 10 : 18)) * z;
        const drift = Math.sin(f * 3 + v.ph) * 4 + f * 8;
        g.globalAlpha = (v.cold ? 0.10 : 0.12) * Math.sin(Math.PI * f) * (look.steam || 0.6);
        g.drawImage(v.cold ? cold : st, (c.x + drift) * z - R, (c.y - rise) * z - R, R * 2, R * 2);
      }
    }
  }
  // drifting haze banks (very faint; colour per map)
  if (look.hazeA >= 0.03) {
    const hs = soft('haze:' + look.haze, look.haze);
    for (let i = 0; i < 3; i++) {
      const bx = ((hash(i, 5, 31) * (m.w + 10) + t * (0.08 + 0.04 * (i % 3))) % (m.w + 10)) - 5;
      const by = hash(i, 6, 31) * (m.h + 4) - 2;
      const c = toWorld(bx, by), R = (90 + hash(i, 7, 31) * 50) * z;
      g.globalAlpha = look.hazeA * (0.6 + 0.4 * Math.sin(t * 0.2 + i * 1.7));
      g.drawImage(hs, c.x * z - R, (c.y - 20) * z - R * 0.45, R * 2, R * 0.9);
    }
  }
  // ambient particles
  const ps = partsOf(m, look);
  if (ps.length) {
    const kind = look.parts;
    g.globalCompositeOperation = kind === 'embers' || kind === 'flies' || kind === 'motes' ? 'lighter' : 'source-over';
    const buckets = [[], []];
    for (const q of ps) {
      let x, y, hh, a;
      if (kind === 'embers') {
        const f = (t * 0.12 * q.s + q.k) % 1;
        x = q.x + Math.sin(t * 1.3 + q.ph) * 0.3 + f * 0.8; y = q.y - f * 0.4; hh = f * 90;
        a = Math.sin(Math.PI * f) * (0.6 + 0.4 * Math.sin(t * 13 + q.ph));
      } else if (kind === 'flies') {
        x = q.x + Math.sin(t * 0.4 * q.s + q.ph) * 0.7; y = q.y + Math.cos(t * 0.33 * q.s + q.ph * 2) * 0.5; hh = 6 + q.h * 0.4 + Math.sin(t + q.ph) * 4;
        a = Math.pow(clamp(Math.sin(t * 0.9 * q.s + q.ph)), 3);
      } else if (kind === 'moths' && q.ax != null) {
        x = q.ax + Math.sin(t * 2.6 * q.s + q.ph) * 0.35; y = q.ay + Math.cos(t * 2.1 * q.s + q.ph) * 0.25; hh = q.ah - 4 + Math.sin(t * 3 + q.ph) * 6;
        a = 0.7;
      } else if (kind === 'leaves') {
        const f = (t * 0.05 * q.s + q.k) % 1;
        x = q.x + f * 4 - 2; y = q.y + Math.sin(t * 0.8 + q.ph) * 0.3; hh = 30 * (1 - f) + Math.sin(t * 2 + q.ph) * 3;
        a = Math.sin(Math.PI * f) * 0.8;
      } else { // dust, motes
        x = q.x + Math.sin(t * 0.15 * q.s + q.ph) * 0.8; y = q.y + Math.cos(t * 0.12 * q.s + q.ph) * 0.6; hh = 8 + q.h + Math.sin(t * 0.5 + q.ph) * 6;
        a = 0.5 + 0.5 * Math.sin(t * 0.7 + q.ph);
      }
      const c = toWorld(x, y), X = c.x * z, Y = (c.y - hh) * z;
      if (!vis(X, Y) || a < 0.05) continue;
      buckets[a > 0.5 ? 1 : 0].push(X, Y);
    }
    const col = { embers: '255,150,60', flies: '210,240,120', motes: '255,210,240', dust: '220,210,200', leaves: '150,96,40', moths: '240,230,210' }[kind];
    const sz = { embers: 1.0, flies: 1.1, motes: 0.7, dust: 0.6, leaves: 1.4, moths: 0.9 }[kind] * z;
    const base = { embers: 0.8, flies: 0.85, motes: 0.35, dust: 0.25, leaves: 0.7, moths: 0.6 }[kind];
    buckets.forEach((bk, i) => {
      if (!bk.length) return;
      g.globalAlpha = base * (i ? 1 : 0.5);
      g.fillStyle = `rgb(${col})`;
      g.beginPath();
      for (let j = 0; j < bk.length; j += 2) { if (kind === 'leaves') g.rect(bk[j] - sz, bk[j + 1] - sz * 0.4, sz * 2, sz * 0.8); else { g.moveTo(bk[j] + sz, bk[j + 1]); g.arc(bk[j], bk[j + 1], sz, 0, TAU); } }
      g.fill();
      if (kind === 'flies' || kind === 'embers') {
        // soft glow round the bright ones
        g.globalAlpha = 0.16 * (i ? 1 : 0.5);
        const gs = soft('bl:' + col, col);
        for (let j = 0; j < bk.length; j += 2) g.drawImage(gs, bk[j] - sz * 5, bk[j + 1] - sz * 5, sz * 10, sz * 10);
      }
    });
  }
  g.restore();
}

// ---------- sky ----------
export function paintSky(g, w, h, m) {
  const look = lookOf(m), s = look.sky || {};
  const r = rng(77 + (m && m.w || 0));
  // light pollution / last light on the horizon
  if (s.glow) {
    const gr = g.createLinearGradient(0, h * 0.05, 0, h * 0.6);
    gr.addColorStop(0, `rgba(${s.glow},0)`); gr.addColorStop(0.7, `rgba(${s.glow},0.16)`); gr.addColorStop(1, `rgba(${s.glow},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }
  if (s.stars) {
    g.fillStyle = 'rgba(230,236,255,0.7)';
    for (let i = 0; i < 70; i++) { const x = r() * w, y = r() * h * 0.4, k = r(); g.globalAlpha = 0.2 + k * 0.6; g.fillRect(x, y, k < 0.9 ? 1 : 2, k < 0.9 ? 1 : 2); }
    g.globalAlpha = 1;
    // a hazy moon behind the clouds
    const mx = w * 0.78, my = h * 0.12, R = Math.min(w, h) * 0.05;
    const mg = g.createRadialGradient(mx, my, 0, mx, my, R * 5);
    mg.addColorStop(0, 'rgba(230,236,255,0.22)'); mg.addColorStop(1, 'rgba(230,236,255,0)');
    g.fillStyle = mg; g.fillRect(mx - R * 5, my - R * 5, R * 10, R * 10);
    g.fillStyle = 'rgba(236,238,248,0.75)'; g.beginPath(); g.arc(mx, my, R, 0, TAU); g.fill();
  }
  // long cloud bands lit from below
  if (s.cloud) {
    for (let i = 0; i < 16; i++) {
      const x = r() * w, y = h * (0.04 + r() * 0.36), rx = w * (0.12 + r() * 0.25), ry = h * (0.012 + r() * 0.03);
      const gr = g.createRadialGradient(x, y, 0, x, y, rx);
      gr.addColorStop(0, `rgba(${s.cloud},${0.25 + r() * 0.2})`); gr.addColorStop(1, `rgba(${s.cloud},0)`);
      g.save(); g.translate(x, y); g.scale(1, ry / rx); g.translate(-x, -y);
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, rx, 0, TAU); g.fill(); g.restore();
    }
  }
}
// ---------- colour grade (CSS layer over the canvas) ----------
export function gradeCss(m) {
  // lerp toward a *dark* tinted colour: it darkens and tints at once (a lighter tint would just flatten
  // the blacks into haze). Cool from the top, warm from the bottom, clear in the middle of the board.
  const look = lookOf(m), gr = look.grade;
  if (!gr) return '';
  const dk = (c) => c.split(',').map((v) => Math.round(+v * 0.32)).join(',');
  const a = dk(gr[0]), b = dk(gr[2]);
  return `linear-gradient(180deg, rgba(${a},${(gr[1] * 1.6).toFixed(3)}) 0%, rgba(${a},0) 42%, rgba(${b},0) 62%, rgba(${b},${(gr[3] * 1.6).toFixed(3)}) 100%)`;
}
