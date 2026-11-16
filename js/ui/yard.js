// Docklands yard art: a baked, textured night-time ground (wet concrete, slab joints, cracks,
// puddles, oil, paint, drains, tyre marks), soft cast shadows, light pools, a backdrop
// (crane, far bank, stacked boxes) and detailed props: corrugated containers drawn as
// whole runs, container-panel rooms with cut-away near walls, chain-link fences, burn
// barrels, shelving. All drawn in canvas — original art, no third-party tiles.
export const TW = 58, TH = 29;
const HX = TW / 2, HY = TH / 2;
export function toWorld(x, y) { return { x: (x - y) * HX, y: (x + y) * HY }; }

// ---------- small helpers ----------
function hash(x, y, k = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(k | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hex2(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgb(c, k = 1, a) {
  const r = Math.max(0, Math.min(255, Math.round(c[0] * k)));
  const g = Math.max(0, Math.min(255, Math.round(c[1] * k)));
  const b = Math.max(0, Math.min(255, Math.round(c[2] * k)));
  return a == null ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
}
function palOf(hexc, kt = 0.95, kr = 0.62, kl = 0.44) {
  const c = hex2(hexc);
  return { c, t: rgb(c, kt), r: rgb(c, kr), l: rgb(c, kl) };
}
// tile-relative point (dx,dy) at height h → screen, around tile centre (sx,sy), zoom z
function P(sx, sy, z, dx, dy, h = 0) { return [sx + (dx - dy) * HX * z, sy + ((dx + dy) * HY - h) * z]; }
function path(g, pts) {
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
}
function fillPts(g, pts, f) { path(g, pts); g.fillStyle = f; g.fill(); }
function line(g, a, b, col, w) { g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.strokeStyle = col; g.lineWidth = w; g.stroke(); }
// Axis-aligned (tile-space) box from h0 to h1. Returns the two visible faces for texturing.
function box(g, sx, sy, z, x0, y0, x1, y1, h0, h1, pal, opt = {}) {
  const L = [P(sx, sy, z, x0, y1, h0), P(sx, sy, z, x1, y1, h0), P(sx, sy, z, x1, y1, h1), P(sx, sy, z, x0, y1, h1)];
  const R = [P(sx, sy, z, x1, y1, h0), P(sx, sy, z, x1, y0, h0), P(sx, sy, z, x1, y0, h1), P(sx, sy, z, x1, y1, h1)];
  const T = [P(sx, sy, z, x0, y0, h1), P(sx, sy, z, x1, y0, h1), P(sx, sy, z, x1, y1, h1), P(sx, sy, z, x0, y1, h1)];
  if (!opt.noL) fillPts(g, L, pal.l);
  if (!opt.noR) fillPts(g, R, pal.r);
  if (!opt.noT) fillPts(g, T, pal.t);
  const H = (h1 - h0) * z;
  return { L: { A: L[0], B: L[1], H }, R: { A: R[0], B: R[1], H }, T };
}
// Map local (u along the face 0..1, v top→bottom 0..1) onto a vertical face.
function onFace(g, F, fn) {
  g.save();
  g.transform(F.B[0] - F.A[0], F.B[1] - F.A[1], 0, F.H, F.A[0], F.A[1] - F.H);
  fn();
  g.restore();
}
function facePt(F, u, v) { return [F.A[0] + (F.B[0] - F.A[0]) * u, F.A[1] + (F.B[1] - F.A[1]) * u - F.H * (1 - v)]; }
function hull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  up.pop(); lo.pop();
  return lo.concat(up);
}

// ---------- per-map prep: tile positions, neighbour links, rooms, lights ----------
const INFO = new WeakMap();
const PREP = new WeakMap();
const isWallish = (t) => t && (t.decor === 'wall' || t.decor === 'door');
export function prepMap(m) {
  let p = PREP.get(m);
  if (p) return p;
  p = { rooms: {}, lights: [] };
  const at = (x, y) => (x >= 0 && y >= 0 && x < m.w && y < m.h ? m.tiles[y][x] : null);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const t = m.tiles[y][x];
    const info = { x, y };
    if (isWallish(t)) {
      const ok = (n) => isWallish(n) && (n.hue || '') === (t.hue || '');
      info.conn = { N: ok(at(x, y - 1)), S: ok(at(x, y + 1)), W: ok(at(x - 1, y)), E: ok(at(x + 1, y)) };
      if (t.decor === 'wall') {
        const r = p.rooms[t.hue || 'room'] ||= { x0: x, y0: y, x1: x, y1: y, hue: t.hue };
        r.x0 = Math.min(r.x0, x); r.y0 = Math.min(r.y0, y); r.x1 = Math.max(r.x1, x); r.y1 = Math.max(r.y1, y);
      }
    }
    if (t.decor === 'fence') {
      const f = (n) => n && n.decor === 'fence';
      info.conn = { N: f(at(x, y - 1)), S: f(at(x, y + 1)), W: f(at(x - 1, y)), E: f(at(x + 1, y)) };
    }
    if (t.decor === 'lamp') p.lights.push({ kind: 'lamp', x, y });
    if (t.decor === 'burn') p.lights.push({ kind: 'fire', x, y });
    INFO.set(t, info);
  }
  for (const r of Object.values(p.rooms)) {
    p.lights.push({ kind: r.hue === 'cafe' ? 'neon' : 'tube', x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 });
  }
  p.scenery = buildScenery(m, p);
  PREP.set(m, p);
  return p;
}
export function tileInfo(t) { return INFO.get(t) || { x: 0, y: 0 }; }

// ---------- palettes ----------
const HUES = {
  rust: '#8e3c24', red: '#8a2c22', teal: '#2c6a62', blue: '#30557a', mustard: '#a27c2c',
  green: '#40683f', grey: '#6a6e70', white: '#9c9a92',
};
const ALT = ['grey', 'blue', 'rust', 'teal', 'white', 'green', 'mustard'];
const BRANDS = ['KESTREL', 'NORDHAVN', 'AMBERLINE', 'ORCA LINES', 'TALLOW & CO', 'HALCYON', 'GREYWATER', 'MARROW BAY'];
const WALLHUE = { office: '#566672', cafe: '#7c3e2a' };

// ---------- props ----------
export function propHeight(t) {
  if (!t || !t.decor) return 0;
  const d = t.decor;
  if (d === 'wall') return t.cut ? 10 : 40;
  if (d === 'container') return t.stack >= 2 ? 45 : 22;
  if (d === 'van' || d === 'van2' || d === 'wreck' || d === 'wreck2' || d === 'car' || d === 'car2') return 18;
  if (d === 'barrier') return 12;
  if (d === 'crate') return 14;
  if (d === 'desk') return 10;
  if (d === 'shelf') return 22;
  if (d === 'barrel' || d === 'barrelWreck' || d === 'barrel-shelf' || d === 'burn') return 14;
  if (d === 'lamp') return 54;
  if (d === 'fence') return 30;
  if (d === 'boat') return 14;
  if (d === 'door') return t.cut ? 0 : 40;
  return 0;
}
// Tall things that should fade when a unit stands just behind them.
export function isTall(t) {
  if (!t || !t.decor) return false;
  if (t.decor === 'container') return true;
  if (t.decor === 'wall' || t.decor === 'door') return !t.cut;
  return t.decor === 'shelf' || t.decor === 'lamp';
}

function grime(g, top = 0.06, bot = 0.32) {
  const gr = g.createLinearGradient(0, 0, 0, 1);
  gr.addColorStop(0, `rgba(255,240,220,${top})`);
  gr.addColorStop(0.5, 'rgba(0,0,0,0)');
  gr.addColorStop(1, `rgba(0,0,0,${bot})`);
  g.fillStyle = gr; g.fillRect(0, 0, 1, 1);
}
function corrugate(g, n, lo = 0, hi = 1, a = 1) {
  for (let k = 0; k < n; k++) {
    const u = k / n;
    g.fillStyle = `rgba(255,236,210,${0.09 * a})`; g.fillRect(u + 0.1 / n, lo, 0.28 / n, hi - lo);
    g.fillStyle = `rgba(0,0,0,${0.3 * a})`; g.fillRect(u + 0.55 / n, lo, 0.32 / n, hi - lo);
  }
}
function rust(g, r, n = 2) {
  for (let i = 0; i < n; i++) {
    const u = r() * 0.9, w = 0.02 + r() * 0.07, v1 = 0.3 + r() * 0.65;
    const gr = g.createLinearGradient(0, 0, 0, v1);
    gr.addColorStop(0, 'rgba(120,52,22,0.6)'); gr.addColorStop(1, 'rgba(120,52,22,0)');
    g.fillStyle = gr; g.fillRect(u, 0.04, w, v1);
  }
  const gb = g.createLinearGradient(0, 0.72, 0, 1);
  gb.addColorStop(0, 'rgba(78,34,16,0)'); gb.addColorStop(1, 'rgba(78,34,16,0.55)');
  g.fillStyle = gb; g.fillRect(0, 0.72, 1, 0.28);
  if (r() < 0.6) {
    g.fillStyle = 'rgba(0,0,0,0.2)';
    g.beginPath(); g.ellipse(0.2 + r() * 0.6, 0.35 + r() * 0.4, 0.08 + r() * 0.08, 0.1 + r() * 0.1, 0, 0, Math.PI * 2); g.fill();
  }
}

function drawContainer(g, t, sx, sy, z) {
  const run = t.run || { id: (tileInfo(t).x * 7 + tileInfo(t).y) % 9, i: 0, n: 1 };
  const last = run.i === run.n - 1;
  const stack = t.stack >= 2 ? 2 : 1;
  const H1 = 21.5;
  const x0 = run.i === 0 ? -0.47 : -0.5, x1 = last ? 0.47 : 0.5, y0 = -0.44, y1 = 0.44;
  const info = tileInfo(t);
  for (let s = 0; s < stack; s++) {
    const hue = s === 0 ? (t.hue === 'red' ? 'rust' : t.hue) : ALT[(run.id * 3 + 1) % ALT.length];
    const pal = palOf(HUES[hue] || HUES.rust);
    const h0 = s * (H1 + 0.8), h1 = h0 + H1;
    const f = box(g, sx, sy, z, x0, y0, x1, y1, h0, h1, pal, { noR: !last });
    const r = rng(hash(info.x, info.y, s + 5) * 1e9);
    onFace(g, f.L, () => {
      corrugate(g, 8, 0.07, 0.93);
      g.fillStyle = 'rgba(255,240,220,0.10)'; g.fillRect(0, 0, 1, 0.06);
      g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(0, 0.93, 1, 0.07);
      if (run.i === 0) { g.fillStyle = 'rgba(0,0,0,0.38)'; g.fillRect(0, 0, 0.05, 1); }
      if (last) { g.fillStyle = 'rgba(255,230,200,0.12)'; g.fillRect(0.95, 0, 0.05, 1); }
      rust(g, r, 2);
      grime(g);
    });
    if (last) {
      onFace(g, f.R, () => {
        g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0.05, 0.06, 0.9, 0.88);
        g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0.495, 0.06, 0.012, 0.88);
        for (const u of [0.13, 0.36, 0.64, 0.87]) {
          g.fillStyle = 'rgba(210,205,195,0.45)'; g.fillRect(u, 0.08, 0.022, 0.84);
          g.fillStyle = 'rgba(30,30,30,0.7)'; g.fillRect(u - 0.03, 0.56, 0.08, 0.05);
        }
        g.fillStyle = 'rgba(0,0,0,0.55)';
        for (const [u, v] of [[0, 0], [0.92, 0], [0, 0.92], [0.92, 0.92]]) g.fillRect(u, v, 0.08, 0.08);
        rust(g, r, 1);
        grime(g, 0.04, 0.3);
      });
    }
    // roof ribs + wet sheen
    for (let k = 1; k < 4; k++) {
      const u = x0 + (x1 - x0) * (k / 4);
      line(g, P(sx, sy, z, u, y0, h1), P(sx, sy, z, u, y1, h1), 'rgba(0,0,0,0.22)', 0.8 * z);
    }
    // rim light on the near top edges
    line(g, P(sx, sy, z, x0, y1, h1), P(sx, sy, z, x1, y1, h1), 'rgba(255,214,170,0.28)', 0.9 * z);
    if (last) line(g, P(sx, sy, z, x1, y1, h1), P(sx, sy, z, x1, y0, h1), 'rgba(255,214,170,0.22)', 0.9 * z);
    if (s === 0 && last) {
      // brand + number painted along the run's long side, centred on the whole run
      const uc = 0.5 - (run.n - 1) / 2 + (run.n === 1 ? 0 : 0);
      const pt = facePt(f.L, uc, 0.42);
      const dx = f.L.B[0] - f.L.A[0], dy = f.L.B[1] - f.L.A[1], len = Math.hypot(dx, dy);
      g.save();
      g.translate(pt[0], pt[1]);
      g.transform(dx / len, dy / len, 0, 1, 0, 0);
      g.textAlign = 'center';
      g.fillStyle = 'rgba(232,226,210,0.5)';
      g.font = `700 ${(run.n >= 2 ? 6.4 : 4.2) * z}px Oswald, sans-serif`;
      g.fillText(BRANDS[run.id % BRANDS.length], 0, 0);
      g.font = `600 ${2.6 * z}px Inter, sans-serif`;
      g.fillStyle = 'rgba(232,226,210,0.38)';
      g.fillText(`FCX${String(100000 + Math.floor(hash(run.id, 3) * 899999)).slice(0, 6)}`, 0, 4.2 * z);
      g.restore();
    }
  }
  // contact darkening at the base
  line(g, P(sx, sy, z, x0, y1, 0), P(sx, sy, z, x1, y1, 0), 'rgba(0,0,0,0.55)', 1.2 * z);
}

function wallDecor(g, F, kind, z) {
  onFace(g, F, () => {
    if (kind === 'lockers') {
      for (let i = 0; i < 3; i++) {
        const u = 0.16 + i * 0.23;
        g.fillStyle = '#4e5a52'; g.fillRect(u, 0.28, 0.21, 0.72);
        g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(u, 0.28, 0.02, 0.72);
        g.fillStyle = 'rgba(0,0,0,0.45)';
        for (let k = 0; k < 3; k++) g.fillRect(u + 0.05, 0.34 + k * 0.035, 0.11, 0.015);
        g.fillStyle = '#c8c0a0'; g.fillRect(u + 0.16, 0.6, 0.02, 0.06);
      }
    } else if (kind === 'fridge') {
      g.fillStyle = '#a9a69a'; g.fillRect(0.3, 0.22, 0.32, 0.78);
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0.3, 0.5, 0.32, 0.012); g.fillRect(0.58, 0.3, 0.02, 0.14);
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0.3, 0.22, 0.03, 0.78);
      g.fillStyle = '#b8402e'; g.fillRect(0.38, 0.6, 0.06, 0.08);
    } else if (kind === 'window') {
      g.fillStyle = '#20262c'; g.fillRect(0.18, 0.18, 0.64, 0.36);
      const gl = g.createLinearGradient(0, 0.2, 0, 0.54);
      gl.addColorStop(0, 'rgba(150,190,220,0.45)'); gl.addColorStop(1, 'rgba(60,90,120,0.15)');
      g.fillStyle = gl; g.fillRect(0.2, 0.2, 0.6, 0.32);
      g.fillStyle = 'rgba(20,20,20,0.9)'; g.fillRect(0.495, 0.2, 0.012, 0.32);
      for (let k = 0; k < 4; k++) { g.fillStyle = 'rgba(30,30,30,0.6)'; g.fillRect(0.2, 0.24 + k * 0.08, 0.6, 0.012); }
    } else if (kind === 'poster') {
      g.fillStyle = '#a8492e'; g.fillRect(0.38, 0.24, 0.24, 0.3);
      g.fillStyle = 'rgba(20,10,8,0.7)';
      g.beginPath(); g.ellipse(0.5, 0.36, 0.06, 0.07, 0, 0, Math.PI * 2); g.fill();
      g.fillRect(0.42, 0.46, 0.16, 0.04);
      g.fillStyle = 'rgba(240,220,190,0.25)'; g.fillRect(0.38, 0.24, 0.24, 0.02);
    } else if (kind === 'rack') {
      for (let k = 0; k < 3; k++) {
        g.fillStyle = '#3a3430'; g.fillRect(0.12, 0.34 + k * 0.22, 0.76, 0.03);
        for (let i = 0; i < 4; i++) {
          g.fillStyle = ['#8a6a40', '#6a5a48', '#9a7a50', '#5a4a3a'][(i + k) % 4];
          g.fillRect(0.16 + i * 0.18, 0.22 + k * 0.22, 0.13, 0.12);
        }
      }
    } else if (kind === 'neon') {
      g.fillStyle = 'rgba(255,80,150,0.9)'; g.fillRect(0.25, 0.26, 0.5, 0.025);
      g.fillStyle = 'rgba(255,80,150,0.35)'; g.fillRect(0.22, 0.22, 0.56, 0.11);
      g.fillStyle = 'rgba(120,230,255,0.85)'; g.fillRect(0.3, 0.38, 0.4, 0.02);
    }
  });
}

function drawWall(g, t, sx, sy, z) {
  const info = tileInfo(t);
  const c = info.conn || { E: true, W: true };
  const cut = !!t.cut;
  const H = cut ? 10 : 40;
  const base = palOf(WALLHUE[t.hue] || WALLHUE.office, 0.95, 0.66, 0.5);
  const pal = cut ? { ...base, t: '#9a9084' } : base;
  const th = 0.09;
  const arms = [];
  const vert = c.N || c.S, horiz = c.E || c.W || !vert;
  if (c.N) arms.push([-th, -0.5, th, -th]);
  if (c.W || (horiz && !c.E)) arms.push([-0.5, -th, -th, th]);
  arms.push([-th, -th, th, th]);
  if (c.E || (horiz && !c.W)) arms.push([th, -th, 0.5, th]);
  if (c.S) arms.push([-th, th, th, 0.5]);
  const r = rng(hash(info.x, info.y, 9) * 1e9);
  for (const [x0, y0, x1, y1] of arms) {
    const f = box(g, sx, sy, z, x0, y0, x1, y1, 0, H, pal);
    const long = (x1 - x0) > (y1 - y0) ? f.L : f.R;
    const len = Math.max(x1 - x0, y1 - y0);
    if (len > 0.3) {
      onFace(g, long, () => {
        corrugate(g, Math.max(2, Math.round(len * 9)), 0.06, 0.95, 0.9);
        g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(0, 0.94, 1, 0.06);
        if (!cut) rust(g, r, 1);
        grime(g, 0.05, 0.35);
      });
    }
    if (cut) {
      // section line on the cut top so you read it as a sliced wall
      const T = f.T;
      path(g, T); g.strokeStyle = 'rgba(30,24,20,0.85)'; g.lineWidth = 0.8 * z; g.stroke();
    }
  }
  if (!cut) {
    // interior dressing on the face that looks into the room
    const kinds = t.hue === 'cafe' ? ['rack', 'neon', 'fridge', 'poster', 'rack'] : ['lockers', 'window', 'poster', 'fridge', 'lockers'];
    const kind = kinds[Math.floor(hash(info.x, info.y, 4) * kinds.length)];
    const straightX = (c.E && c.W) && !c.N && !c.S;
    const straightY = (c.N && c.S) && !c.E && !c.W;
    if (straightX) wallDecor(g, { A: P(sx, sy, z, -0.5, th, 0), B: P(sx, sy, z, 0.5, th, 0), H: H * z }, kind, z);
    else if (straightY) wallDecor(g, { A: P(sx, sy, z, th, 0.5, 0), B: P(sx, sy, z, th, -0.5, 0), H: H * z }, kind, z);
    line(g, P(sx, sy, z, -0.5, th, H), P(sx, sy, z, 0.5, th, H), 'rgba(0,0,0,0)', 0);
  }
}

function drawDoor(g, t, sx, sy, z) {
  const c = tileInfo(t).conn || { E: true, W: true };
  const alongY = (c.N || c.S) && !(c.E || c.W);
  const base = palOf(WALLHUE[t.hue] || WALLHUE.office, 0.9, 0.62, 0.46);
  if (t.cut) {
    // threshold plate only
    const pts = alongY
      ? [P(sx, sy, z, -0.12, -0.5), P(sx, sy, z, 0.12, -0.5), P(sx, sy, z, 0.12, 0.5), P(sx, sy, z, -0.12, 0.5)]
      : [P(sx, sy, z, -0.5, -0.12), P(sx, sy, z, 0.5, -0.12), P(sx, sy, z, 0.5, 0.12), P(sx, sy, z, -0.5, 0.12)];
    fillPts(g, pts, 'rgba(150,140,120,0.35)');
    return;
  }
  const th = 0.09;
  if (alongY) {
    box(g, sx, sy, z, -th, -0.5, th, -0.4, 0, 40, base);
    box(g, sx, sy, z, -th, -0.4, th, 0.4, 31, 40, base);
    box(g, sx, sy, z, -th, 0.4, th, 0.5, 0, 40, base);
  } else {
    box(g, sx, sy, z, -0.5, -th, -0.4, th, 0, 40, base);
    box(g, sx, sy, z, -0.4, -th, 0.4, th, 31, 40, base);
    box(g, sx, sy, z, 0.4, -th, 0.5, th, 0, 40, base);
  }
  // warm spill through the doorway
  const p = P(sx, sy, z, 0, 0, 0);
  const gl = g.createRadialGradient(p[0], p[1], 0, p[0], p[1], 20 * z);
  gl.addColorStop(0, t.hue === 'cafe' ? 'rgba(255,120,160,0.18)' : 'rgba(170,210,255,0.14)');
  gl.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gl; g.beginPath(); g.ellipse(p[0], p[1], 20 * z, 9 * z, 0, 0, Math.PI * 2); g.fill();
}

function drawFence(g, t, sx, sy, z, alongY) {
  const c = (t && tileInfo(t).conn) || {};
  const ay = alongY != null ? alongY : ((c.N || c.S) && !(c.E || c.W));
  const H = 30;
  const A = ay ? P(sx, sy, z, 0, 0.5) : P(sx, sy, z, -0.5, 0);
  const B = ay ? P(sx, sy, z, 0, -0.5) : P(sx, sy, z, 0.5, 0);
  const F = { A, B, H: H * z };
  // mesh
  g.save();
  g.lineWidth = 0.55 * z;
  g.strokeStyle = 'rgba(176,182,186,0.32)';
  const n = 9;
  g.beginPath();
  for (let k = -n; k <= n; k++) {
    const u0 = k / n;
    const a = facePt(F, u0, 0.05), b = facePt(F, u0 + 0.5, 1);
    const a2 = facePt(F, u0 + 0.5, 0.05), b2 = facePt(F, u0, 1);
    // clip to 0..1 by drawing then masking with the face polygon
    g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
    g.moveTo(a2[0], a2[1]); g.lineTo(b2[0], b2[1]);
  }
  const poly = [facePt(F, 0, 0.05), facePt(F, 1, 0.05), facePt(F, 1, 1), facePt(F, 0, 1)];
  g.save(); path(g, poly); g.clip(); g.stroke(); g.restore();
  g.restore();
  // rails + posts
  line(g, facePt(F, 0, 0.05), facePt(F, 1, 0.05), 'rgba(150,156,160,0.85)', 1.1 * z);
  line(g, facePt(F, 0, 0.98), facePt(F, 1, 0.98), 'rgba(90,94,98,0.7)', 0.8 * z);
  for (const u of [0, 1]) {
    line(g, facePt(F, u, 0), facePt(F, u, 1), '#6f767a', 1.6 * z);
    line(g, facePt(F, u, 0), facePt(F, u, 0.5), 'rgba(255,220,180,0.25)', 0.6 * z);
  }
  // barbed wire on top
  g.strokeStyle = 'rgba(130,130,130,0.55)'; g.lineWidth = 0.5 * z;
  g.beginPath();
  for (let k = 0; k <= 12; k++) {
    const p = facePt(F, k / 12, 0.05);
    const y = p[1] - (k % 2 ? 2.2 : 0.6) * z;
    if (k === 0) g.moveTo(p[0], y); else g.lineTo(p[0], y);
  }
  g.stroke();
}

function crateBox(g, sx, sy, z, x0, y0, x1, y1, h0, h1, col) {
  const pal = palOf(col, 0.95, 0.7, 0.52);
  const f = box(g, sx, sy, z, x0, y0, x1, y1, h0, h1, pal);
  for (const F of [f.L, f.R]) onFace(g, F, () => {
    g.fillStyle = 'rgba(0,0,0,0.3)';
    for (let k = 1; k < 4; k++) g.fillRect(0, k / 4 - 0.015, 1, 0.03);
    g.fillStyle = 'rgba(40,24,10,0.55)'; g.fillRect(0, 0, 0.08, 1); g.fillRect(0.92, 0, 0.08, 1);
    grime(g, 0.08, 0.3);
  });
  line(g, P(sx, sy, z, x0, y1, h1), P(sx, sy, z, x1, y1, h1), 'rgba(255,220,170,0.3)', 0.7 * z);
  return f;
}
function tyre(g, x, y, z, rx) {
  g.fillStyle = '#16171a';
  g.beginPath(); g.ellipse(x, y + 1.5 * z, rx, rx * 0.5, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#26282c';
  g.beginPath(); g.ellipse(x, y, rx, rx * 0.5, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#0a0b0c';
  g.beginPath(); g.ellipse(x, y, rx * 0.45, rx * 0.22, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 0.6 * z;
  g.beginPath(); g.ellipse(x, y, rx * 0.75, rx * 0.37, 0, Math.PI, Math.PI * 2); g.stroke();
}
function drawCrate(g, t, sx, sy, z) {
  const info = tileInfo(t);
  const v = Math.floor(hash(info.x, info.y, 2) * 3);
  // pallet base
  const pal = palOf('#6a5236', 0.9, 0.65, 0.5);
  if (v === 1) {
    // tyre stacks
    for (const [dx, dy, n] of [[-0.18, -0.12, 4], [0.2, 0.08, 3], [-0.14, 0.24, 2]]) {
      const p = P(sx, sy, z, dx, dy);
      for (let k = 0; k < n; k++) tyre(g, p[0], p[1] - k * 3.4 * z, z, 7.5 * z);
    }
    return;
  }
  box(g, sx, sy, z, -0.38, -0.34, 0.38, 0.34, 0, 2.4, pal);
  if (v === 0) {
    crateBox(g, sx, sy, z, -0.34, -0.3, 0.06, 0.3, 2.4, 13, '#8a6a3e');
    crateBox(g, sx, sy, z, 0.08, -0.3, 0.34, 0.02, 2.4, 10, '#7a5c36');
    crateBox(g, sx, sy, z, 0.08, 0.06, 0.34, 0.3, 2.4, 9, '#93734a');
  } else {
    // shrink-wrapped sacks
    const w = palOf('#7c7a70', 0.95, 0.7, 0.52);
    const f = box(g, sx, sy, z, -0.34, -0.3, 0.34, 0.3, 2.4, 14, w);
    for (const F of [f.L, f.R]) onFace(g, F, () => {
      g.fillStyle = 'rgba(255,255,255,0.12)';
      for (let k = 0; k < 3; k++) g.fillRect(0, 0.1 + k * 0.3, 1, 0.08);
      g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(0.48, 0, 0.04, 1);
    });
    line(g, P(sx, sy, z, -0.34, 0.3, 14), P(sx, sy, z, 0.34, 0.3, 14), 'rgba(255,255,255,0.25)', 0.7 * z);
  }
}

function drawBarrier(g, sx, sy, z) {
  const pal = palOf('#8a8780', 0.95, 0.7, 0.52);
  box(g, sx, sy, z, -0.44, -0.2, 0.44, 0.2, 0, 4, pal);
  const f = box(g, sx, sy, z, -0.44, -0.11, 0.44, 0.11, 4, 12, pal);
  onFace(g, f.L, () => {
    for (let k = 0; k < 6; k++) { g.fillStyle = k % 2 ? 'rgba(20,20,20,0.6)' : 'rgba(210,170,40,0.65)'; g.fillRect(k / 6, 0.15, 1 / 6, 0.25); }
    grime(g, 0.04, 0.4);
  });
  onFace(g, f.R, () => grime(g, 0.04, 0.4));
}

function drawBarrel(g, sx, sy, z, kind, now) {
  const p = P(sx, sy, z, 0, 0);
  const rx = 7.2 * z, ry = 3.6 * z, H = 15 * z;
  const wreck = kind === 'wreck';
  const col = kind === 'burn' ? '#5a3a26' : kind === 'drum' ? '#44525a' : wreck ? '#2a2420' : '#a2281e';
  const c = hex2(col);
  const gr = g.createLinearGradient(p[0] - rx, 0, p[0] + rx, 0);
  gr.addColorStop(0, rgb(c, 0.45)); gr.addColorStop(0.45, rgb(c, 1.05)); gr.addColorStop(1, rgb(c, 0.55));
  g.fillStyle = gr;
  const top = wreck ? H * 0.55 : H;
  g.beginPath();
  g.moveTo(p[0] - rx, p[1]); g.lineTo(p[0] - rx, p[1] - top);
  g.ellipse(p[0], p[1] - top, rx, ry, 0, Math.PI, 0);
  g.lineTo(p[0] + rx, p[1]);
  g.ellipse(p[0], p[1], rx, ry, 0, 0, Math.PI);
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 0.9 * z;
  for (const k of [0.3, 0.68]) {
    if (k * H > top) continue;
    g.beginPath(); g.ellipse(p[0], p[1] - k * H, rx, ry, 0, 0, Math.PI); g.stroke();
  }
  if (kind === 'barrel') {
    // hazard diamond
    g.fillStyle = '#e8c23a';
    g.beginPath(); g.moveTo(p[0], p[1] - 10 * z); g.lineTo(p[0] + 3 * z, p[1] - 7 * z); g.lineTo(p[0], p[1] - 4 * z); g.lineTo(p[0] - 3 * z, p[1] - 7 * z); g.closePath(); g.fill();
    g.fillStyle = '#1a1a1a'; g.fillRect(p[0] - 0.5 * z, p[1] - 8.5 * z, 1 * z, 2.4 * z);
  }
  // lid
  g.fillStyle = wreck ? '#0e0c0a' : kind === 'burn' ? '#1a1210' : rgb(c, 0.75);
  g.beginPath(); g.ellipse(p[0], p[1] - top, rx, ry, 0, 0, Math.PI * 2); g.fill();
  if (wreck) {
    g.fillStyle = 'rgba(255,120,40,0.35)';
    g.beginPath(); g.ellipse(p[0], p[1] - top, rx * 0.5, ry * 0.5, 0, 0, Math.PI * 2); g.fill();
    return;
  }
  if (kind === 'burn') {
    const t = (now || 0) / 1000;
    const glow = g.createRadialGradient(p[0], p[1] - top - 4 * z, 0, p[0], p[1] - top - 4 * z, 22 * z);
    glow.addColorStop(0, 'rgba(255,170,60,0.55)'); glow.addColorStop(1, 'rgba(255,90,20,0)');
    g.fillStyle = glow; g.beginPath(); g.arc(p[0], p[1] - top - 4 * z, 22 * z, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 5; i++) {
      const ph = t * (3.2 + i * 0.7) + i * 1.7;
      const fx = p[0] + (i - 2) * 2.2 * z + Math.sin(ph) * 1.2 * z;
      const fh = (9 + 5 * Math.sin(ph * 1.3) + (i === 2 ? 5 : 0)) * z;
      const fw = (3.2 - Math.abs(i - 2) * 0.5) * z;
      const fg = g.createLinearGradient(0, p[1] - top, 0, p[1] - top - fh);
      fg.addColorStop(0, 'rgba(255,230,140,0.95)'); fg.addColorStop(0.5, 'rgba(255,140,40,0.85)'); fg.addColorStop(1, 'rgba(200,40,10,0)');
      g.fillStyle = fg;
      g.beginPath();
      g.moveTo(fx - fw, p[1] - top);
      g.quadraticCurveTo(fx - fw * 0.6, p[1] - top - fh * 0.6, fx + Math.sin(ph * 2) * 1.5 * z, p[1] - top - fh);
      g.quadraticCurveTo(fx + fw * 0.6, p[1] - top - fh * 0.6, fx + fw, p[1] - top);
      g.closePath(); g.fill();
    }
    // embers
    for (let i = 0; i < 4; i++) {
      const k = ((t * 0.6 + i * 0.27) % 1);
      g.fillStyle = `rgba(255,${150 + i * 20},60,${1 - k})`;
      g.fillRect(p[0] + Math.sin(t * 2 + i * 2) * 5 * z, p[1] - top - 8 * z - k * 26 * z, 1.1 * z, 1.1 * z);
    }
  }
}

function drawDesk(g, t, sx, sy, z) {
  if (t.hue === 'cafe') {
    // bar counter with bottles
    const pal = palOf('#5a2e22', 0.95, 0.7, 0.5);
    const f = box(g, sx, sy, z, -0.44, -0.2, 0.44, 0.2, 0, 11, pal);
    onFace(g, f.L, () => { g.fillStyle = 'rgba(255,200,150,0.08)'; for (let k = 0; k < 6; k++) g.fillRect(k / 6 + 0.02, 0.15, 0.06, 0.85); grime(g); });
    fillPts(g, f.T, '#2a1a14');
    const cols = ['#3a6a3a', '#7a4a1a', '#c8c0a0', '#2a4a6a'];
    for (let i = 0; i < 4; i++) {
      const p = P(sx, sy, z, -0.3 + i * 0.18, 0, 11);
      g.fillStyle = cols[i]; g.fillRect(p[0] - 0.9 * z, p[1] - 5 * z, 1.8 * z, 5 * z);
      g.fillRect(p[0] - 0.4 * z, p[1] - 7 * z, 0.8 * z, 2 * z);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(p[0] - 0.7 * z, p[1] - 4.5 * z, 0.4 * z, 3 * z);
    }
    return;
  }
  // office desk: worktop on legs + monitor glow + papers
  const top = palOf('#6a5a44', 0.95, 0.7, 0.5);
  const leg = palOf('#2c2a28');
  for (const [x, y] of [[-0.38, -0.22], [0.34, -0.22], [-0.38, 0.18], [0.34, 0.18]]) box(g, sx, sy, z, x, y, x + 0.04, y + 0.04, 0, 9, leg);
  box(g, sx, sy, z, -0.4, -0.24, 0.4, 0.24, 9, 11, top);
  const m = P(sx, sy, z, -0.05, -0.1, 11);
  g.fillStyle = '#16181a'; g.fillRect(m[0] - 5 * z, m[1] - 8 * z, 10 * z, 7 * z);
  g.fillStyle = 'rgba(120,200,255,0.55)'; g.fillRect(m[0] - 4.2 * z, m[1] - 7.3 * z, 8.4 * z, 5.6 * z);
  const pp = P(sx, sy, z, 0.18, 0.1, 11);
  g.fillStyle = 'rgba(230,225,210,0.7)'; g.fillRect(pp[0] - 3 * z, pp[1] - 1 * z, 5 * z, 2 * z);
}

function drawShelf(g, t, sx, sy, z) {
  const frame = palOf('#4a4c4e', 0.95, 0.7, 0.5);
  const H = 22;
  for (const [x, y] of [[-0.4, -0.16], [0.36, -0.16], [-0.4, 0.12], [0.36, 0.12]]) box(g, sx, sy, z, x, y, x + 0.04, y + 0.04, 0, H, frame);
  const cols = ['#8a6a40', '#6a5a48', '#9a7a50', '#4a5a6a', '#7a3a2a'];
  for (let k = 0; k < 3; k++) {
    const h = 1 + k * 7.5;
    box(g, sx, sy, z, -0.4, -0.16, 0.4, 0.16, h, h + 1, frame);
    for (let i = 0; i < 3; i++) {
      if (hash(i, k, tileInfo(t).x) < 0.25) continue;
      const x0 = -0.36 + i * 0.26;
      box(g, sx, sy, z, x0, -0.12, x0 + 0.2, 0.12, h + 1, h + 1 + 4 + hash(i, k) * 2, palOf(cols[(i + k + tileInfo(t).y) % cols.length], 0.9, 0.68, 0.5));
    }
  }
}

function drawLamp(g, sx, sy, z, now) {
  const H = 54;
  const pole = palOf('#3a3c3e', 1.1, 0.8, 0.6);
  box(g, sx, sy, z, -0.07, -0.07, 0.07, 0.07, 0, 3, pole);
  box(g, sx, sy, z, -0.03, -0.03, 0.03, 0.03, 3, H, pole);
  const a = P(sx, sy, z, 0, 0, H), b = P(sx, sy, z, 0.3, 0.05, H + 1);
  line(g, a, b, '#3a3c3e', 1.6 * z);
  g.fillStyle = '#222'; g.fillRect(b[0] - 3.5 * z, b[1] - 1.5 * z, 7 * z, 2.6 * z);
  const flick = 0.92 + 0.08 * Math.sin((now || 0) / 140 + sx);
  const glow = g.createRadialGradient(b[0], b[1] + 2 * z, 0, b[0], b[1] + 2 * z, 18 * z);
  glow.addColorStop(0, `rgba(255,214,140,${0.85 * flick})`); glow.addColorStop(0.3, 'rgba(255,170,80,0.25)'); glow.addColorStop(1, 'rgba(255,150,60,0)');
  g.fillStyle = glow; g.beginPath(); g.arc(b[0], b[1] + 2 * z, 18 * z, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffe2a0'; g.fillRect(b[0] - 2.6 * z, b[1] + 0.6 * z, 5.2 * z, 1.2 * z);
  // cone of light down to the ground
  const gnd = P(sx, sy, z, 0.3, 0.05, 0);
  const cg = g.createLinearGradient(0, b[1], 0, gnd[1]);
  cg.addColorStop(0, 'rgba(255,200,120,0.14)'); cg.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = cg;
  g.beginPath(); g.moveTo(b[0] - 2.5 * z, b[1] + 1 * z); g.lineTo(b[0] + 2.5 * z, b[1] + 1 * z); g.lineTo(gnd[0] + 22 * z, gnd[1]); g.lineTo(gnd[0] - 22 * z, gnd[1]); g.closePath(); g.fill();
}

function drawRackShed(g, sx, sy, z) {
  // grey oil drums against the workshop back wall (scenery, not explosive)
  for (const [dx, dy] of [[-0.2, -0.2], [0.15, -0.25], [0.2, 0.12]]) {
    const p = P(sx, sy, z, dx, dy);
    drawBarrel(g, p[0], p[1], z * 0.85, 'drum');
  }
}

function drawVan(g, t, sx, sy, z, wreck) {
  const base = wreck ? '#2b2522' : t.hue === 'grey' ? '#5c6067' : '#c4beb2';
  const pal = palOf(base, 0.95, 0.68, 0.5);
  const y0 = -0.32, y1 = 0.32;
  // wheels first (under the body)
  for (const x of [-0.12, 1.12]) {
    const w = P(sx, sy, z, x, y1, 3);
    g.fillStyle = '#0c0c0e'; g.beginPath(); g.ellipse(w[0], w[1], 4.2 * z, 4.2 * z, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = wreck ? '#2a1a12' : '#4a4c50'; g.beginPath(); g.ellipse(w[0], w[1], 1.8 * z, 1.8 * z, 0, 0, Math.PI * 2); g.fill();
  }
  // cargo box
  const f = box(g, sx, sy, z, -0.42, y0, 0.98, y1, 3, wreck ? 17 : 21, pal);
  onFace(g, f.L, () => {
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0.85, 1, 0.15);
    if (!wreck) {
      g.fillStyle = t.hue === 'grey' ? 'rgba(220,180,60,0.6)' : 'rgba(170,40,30,0.75)'; g.fillRect(0.08, 0.38, 0.84, 0.08);
      g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(0.55, 0.08, 0.008, 0.8);
    } else {
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0.2, 0.1, 0.3, 0.5); g.fillStyle = 'rgba(255,110,40,0.25)'; g.fillRect(0.25, 0.4, 0.2, 0.2);
    }
    grime(g, 0.08, 0.4);
  });
  onFace(g, f.R, () => grime(g, 0.05, 0.4));
  // cab
  const c = box(g, sx, sy, z, 0.98, y0 + 0.02, 1.42, y1 - 0.02, 3, wreck ? 12 : 15, pal);
  const glass = wreck ? 'rgba(10,8,6,0.9)' : 'rgba(40,60,80,0.9)';
  onFace(g, c.R, () => {
    g.fillStyle = glass; g.fillRect(0.1, 0.08, 0.8, 0.4);
    if (!wreck) {
      g.fillStyle = 'rgba(200,220,240,0.25)'; g.fillRect(0.15, 0.1, 0.2, 0.36);
      g.fillStyle = 'rgba(255,240,200,0.9)'; g.fillRect(0.05, 0.62, 0.14, 0.1); g.fillRect(0.81, 0.62, 0.14, 0.1);
    }
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, 0.82, 1, 0.18);
  });
  onFace(g, c.L, () => { g.fillStyle = glass; g.fillRect(0.12, 0.08, 0.7, 0.36); grime(g, 0.05, 0.4); });
  fillPts(g, c.T, wreck ? '#1a1614' : rgb(pal.c, 0.8));
  if (!wreck) {
    line(g, P(sx, sy, z, -0.42, y1, 21), P(sx, sy, z, 0.98, y1, 21), 'rgba(255,220,180,0.3)', 0.8 * z);
    // headlight beams onto the ground
    const h = P(sx, sy, z, 1.45, 0, 4);
    g.save(); g.globalCompositeOperation = 'lighter';
    const gr = g.createRadialGradient(h[0] + 14 * z, h[1] - 4 * z, 0, h[0] + 14 * z, h[1] - 4 * z, 22 * z);
    gr.addColorStop(0, 'rgba(255,240,200,0.12)'); gr.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(h[0] + 14 * z, h[1] - 4 * z, 22 * z, 10 * z, -0.45, 0, Math.PI * 2); g.fill();
    g.restore();
  }
}

function drawBoat(g, t, sx, sy, z, now) {
  const kind = t.hue || 'tug';
  const bob = Math.sin((now || 0) / 900 + sy) * 0.8 * z;
  sy += 5 * z + bob; // the canal sits below the quay
  const hull = palOf(kind === 'tug' ? '#3a2a26' : kind === 'work' ? '#2a3a3c' : '#4a3a2c', 0.95, 0.7, 0.5);
  const L = kind === 'small' ? 0.45 : 0.85, W = kind === 'small' ? 0.22 : 0.34;
  // bow point toward -y
  const bow = [P(sx, sy, z, -W, -L, 0), P(sx, sy, z, 0, -L - 0.35, 5), P(sx, sy, z, W, -L, 0), P(sx, sy, z, W, -L, 6), P(sx, sy, z, -W, -L, 6)];
  fillPts(g, [bow[0], bow[1], bow[2], bow[3], bow[1], bow[4]], hull.r);
  const f = box(g, sx, sy, z, -W, -L, W, L, 0, 6, hull);
  onFace(g, f.R, () => { g.fillStyle = kind === 'tug' ? 'rgba(170,40,30,0.8)' : 'rgba(210,190,90,0.6)'; g.fillRect(0, 0.1, 1, 0.18); });
  onFace(g, f.L, () => { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, 0.6, 1, 0.4); });
  fillPts(g, f.T, '#2a2622');
  if (kind !== 'small') {
    const cab = palOf('#a8a296', 0.95, 0.7, 0.5);
    const c = box(g, sx, sy, z, -W + 0.08, 0.0, W - 0.08, 0.5, 6, 17, cab);
    onFace(g, c.R, () => { g.fillStyle = 'rgba(255,210,130,0.75)'; g.fillRect(0.12, 0.2, 0.25, 0.25); g.fillRect(0.6, 0.2, 0.25, 0.25); });
    onFace(g, c.L, () => { g.fillStyle = 'rgba(30,40,50,0.9)'; g.fillRect(0.1, 0.2, 0.8, 0.25); });
    box(g, sx, sy, z, -0.06, 0.25, 0.06, 0.37, 17, 27, palOf(kind === 'tug' ? '#9a3020' : '#3a3a3a'));
    const lt = P(sx, sy, z, 0, -0.2, 22);
    line(g, P(sx, sy, z, 0, -0.2, 6), lt, '#555', 0.8 * z);
    g.fillStyle = 'rgba(255,255,230,0.95)'; g.beginPath(); g.arc(lt[0], lt[1], 1.3 * z, 0, Math.PI * 2); g.fill();
  }
  // wake ripples
  g.strokeStyle = 'rgba(160,200,210,0.18)'; g.lineWidth = 0.8 * z;
  const w0 = P(sx, sy - bob, z, 0, L + 0.2, -2);
  g.beginPath(); g.ellipse(w0[0], w0[1], 14 * z, 5 * z, -0.46, 0, Math.PI * 2); g.stroke();
}

// ---------- sprite cache: static props are painted once at a fixed scale and blitted ----------
const SPR = new WeakMap();
let SPRV = 1;
if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) document.fonts.ready.then(() => { SPRV++; });
const CS = 2.2;
function cached(g, obj, key, sx, sy, z, ox, oy, w0, h0, paint) {
  let c = SPR.get(obj);
  if (!c || c.key !== key || c.v !== SPRV) {
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(w0 * CS); cv.height = Math.ceil(h0 * CS);
    paint(cv.getContext('2d'), ox * CS, oy * CS, CS);
    c = { key, cv, v: SPRV };
    SPR.set(obj, c);
  }
  g.drawImage(c.cv, sx - ox * z, sy - oy * z, w0 * z, h0 * z);
}
const DYNAMIC = new Set(['burn', 'lamp', 'boat']);
export function drawYardProp(g, t, sx, sy, z, now) {
  if (!DYNAMIC.has(t.decor) && !t.__nocache) {
    const d = t.decor;
    const H = propHeight(t);
    let ox = HX + 8, w0 = TW + 16;
    if (d === 'van' || d === 'wreck' || d === 'car') { ox = 34; w0 = 130; }
    if (d === 'container' && t.run) { ox += 24 + (t.run.n - 1) * HX * 0.5; w0 += 24 + (t.run.n - 1) * HX * 0.5; }
    const oy = HY + H + 14, h0 = oy + HY + 12;
    const key = `${d}|${t.hue}|${t.cut}|${t.stack}`;
    cached(g, t, key, sx, sy, z, ox, oy, w0, h0, (cg, x, y, k) => paintProp(cg, t, x, y, k, now));
    return true;
  }
  return paintProp(g, t, sx, sy, z, now);
}
function paintProp(g, t, sx, sy, z, now) {
  const d = t.decor;
  if (d === 'van' || d === 'car') { drawVan(g, t, sx, sy, z, false); return true; }
  if (d === 'wreck') { drawVan(g, t, sx, sy, z, true); return true; }
  if (d === 'boat') { drawBoat(g, t, sx, sy, z, now); return true; }
  if (d === 'container') { drawContainer(g, t, sx, sy, z); return true; }
  if (d === 'wall') { drawWall(g, t, sx, sy, z); return true; }
  if (d === 'door') { drawDoor(g, t, sx, sy, z); return true; }
  if (d === 'fence') { drawFence(g, t, sx, sy, z); return true; }
  if (d === 'crate') { drawCrate(g, t, sx, sy, z); return true; }
  if (d === 'barrier') { drawBarrier(g, sx, sy, z); return true; }
  if (d === 'barrel') { drawBarrel(g, sx, sy, z, 'barrel', now); return true; }
  if (d === 'barrelWreck') { drawBarrel(g, sx, sy, z, 'wreck', now); return true; }
  if (d === 'burn') { drawBarrel(g, sx, sy, z, 'burn', now); return true; }
  if (d === 'desk') { drawDesk(g, t, sx, sy, z); return true; }
  if (d === 'shelf') { drawShelf(g, t, sx, sy, z); return true; }
  if (d === 'lamp') { drawLamp(g, sx, sy, z, now); return true; }
  if (d === 'barrel-shelf') { drawRackShed(g, sx, sy, z); return true; }
  return false;
}

// ---------- scenery (not gameplay): border fences, bollards, backdrop ----------
function buildScenery(m, p) {
  const s = [];
  const office = p.rooms.office, cafe = p.rooms.cafe;
  for (let x = 4; x < m.w; x++) {
    if (office && x >= office.x0 && x <= office.x1) continue;
    s.push({ kind: 'fence', x, y: -0.6, alongY: false, depth: -10 });
  }
  for (let y = 0; y < m.h; y++) {
    if (cafe && y >= cafe.y0 && y <= cafe.y1 && cafe.x1 >= m.w - 1) continue;
    s.push({ kind: 'fence', x: m.w - 0.4, y, alongY: true, depth: m.w + y + 0.06 });
  }
  for (let x = 4; x < m.w; x++) {
    if (cafe && x >= cafe.x0 && x <= cafe.x1 && cafe.y1 >= m.h - 1) continue;
    if (x === 6 || x === 7) continue; // open gate
    s.push({ kind: 'fence', x, y: m.h - 0.4, alongY: false, depth: x + m.h + 0.06 });
  }
  for (let y = 1; y < m.h; y += 3) s.push({ kind: 'bollard', x: 2.78, y: y + 0.2, depth: 2.78 + y });
  return s;
}

export function drawScenery(g, sp, z, now) {
  const p = toWorld(sp.x, sp.y);
  const sx = p.x * z, sy = p.y * z;
  if (sp.kind === 'fence') cached(g, sp, 'f', sx, sy, z, HX + 6, 30 + HY + 8, TW + 12, 30 + 2 * HY + 14, (cg, x, y, k) => drawFence(cg, null, x, y, k, sp.alongY));
  else if (sp.kind === 'bollard') {
    const pal = palOf('#3a3a3c', 1, 0.75, 0.55);
    box(g, sx, sy, z, -0.08, -0.08, 0.08, 0.08, 0, 5, pal);
    const c = P(sx, sy, z, 0, 0, 5);
    g.fillStyle = '#2a2a2c'; g.beginPath(); g.ellipse(c[0], c[1], 5 * z, 2.5 * z, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#c8a030'; g.fillRect(c[0] - 4 * z, c[1] + 2 * z, 8 * z, 1.1 * z);
  }
}
export function sceneryOf(m) { return prepMap(m).scenery; }

// Distant crane, stacked boxes and the far canal bank. Drawn behind everything.
const BACK = new WeakMap();
export function drawBackdrop(g, m, z, now) {
  let bc = BACK.get(m);
  if (!bc) {
    const bk = bakeYard(m);
    const K = 1.0, minX = bk.minX, minY = bk.minY - 240, w = bk.w, h = bk.h * 0.75 + 240;
    const cv = document.createElement('canvas'); cv.width = Math.ceil(w * K); cv.height = Math.ceil(h * K);
    const cg = cv.getContext('2d');
    paintBackdrop(cg, m, K, -minX * K, -minY * K);
    bc = { cv, minX, minY, w, h };
    BACK.set(m, bc);
  }
  g.drawImage(bc.cv, bc.minX * z, bc.minY * z, bc.w * z, bc.h * z);
  // crane warning lights blink
  const blink = (Math.floor((now || 0) / 700) % 2) ? 0.95 : 0.2;
  const p = toWorld(4, -3.55);
  g.fillStyle = `rgba(255,50,40,${blink})`;
  for (const dx of [6.5, -4.8]) {
    const lp = P(p.x * z, p.y * z, z, dx, 0, 172);
    g.beginPath(); g.arc(lp[0], lp[1], 2.2 * z, 0, Math.PI * 2); g.fill();
  }
}
function paintBackdrop(g, m, z, offX, offY) {
  g.translate(offX, offY);
  const now = 0;
  const dark = (k) => palOf('#2c3036', 0.9 * k, 0.65 * k, 0.5 * k);
  // far stacks beyond the north fence
  const r = rng(4242);
  for (let x = 3; x < m.w + 2; x++) {
    const n = 1 + Math.floor(r() * 3);
    const hueKeys = Object.keys(HUES);
    for (const dy of [-4.4, -3.3]) {
      if (r() < 0.4) continue;
      const p = toWorld(x, dy);
      for (let k = 0; k < n; k++) {
        const c = hex2(HUES[hueKeys[Math.floor(r() * hueKeys.length)]]);
        const pal = { t: rgb(c, 0.3), r: rgb(c, 0.2), l: rgb(c, 0.14) };
        box(g, p.x * z, p.y * z, z, -0.5, -0.45, 0.5, 0.45, k * 22, k * 22 + 21.4, pal);
      }
    }
  }
  // gantry crane
  const legs = [[5, -4.5], [5, -2.6], [9, -4.5], [9, -2.6]];
  const steel = { t: '#3a3230', r: '#2a2422', l: '#1e1a18' };
  for (const [x, y] of legs) {
    const p = toWorld(x, y);
    box(g, p.x * z, p.y * z, z, -0.12, -0.12, 0.12, 0.12, 0, 150, steel);
  }
  for (const y of [-4.5, -2.6]) {
    const p = toWorld(7, y);
    box(g, p.x * z, p.y * z, z, -2.2, -0.15, 2.2, 0.15, 150, 160, steel);
  }
  {
    const p = toWorld(4, -3.55);
    box(g, p.x * z, p.y * z, z, -5, -1.05, 6.6, 1.05, 160, 170, { t: '#4a3630', r: '#3a2a24', l: '#2a1e1a' });
    const blink = (Math.floor((now || 0) / 700) % 2) ? 0.95 : 0.25;
    const lp = P(p.x * z, p.y * z, z, 6.5, 0, 172);
    g.fillStyle = `rgba(255,50,40,${blink})`; g.beginPath(); g.arc(lp[0], lp[1], 2.2 * z, 0, Math.PI * 2); g.fill();
    const lp2 = P(p.x * z, p.y * z, z, -4.8, 0, 172);
    g.beginPath(); g.arc(lp2[0], lp2[1], 2.2 * z, 0, Math.PI * 2); g.fill();
  }
  // far canal bank warehouses with a few lit windows
  for (let y = -3; y < m.h + 3; y += 4) {
    const p = toWorld(-5.3, y + 1.5);
    const f = box(g, p.x * z, p.y * z, z, -0.6, -2, 0.6, 2, 0, 46 + hash(y, 1) * 22, dark(1));
    onFace(g, f.R, () => {
      for (let i = 0; i < 6; i++) for (let k = 0; k < 2; k++) {
        if (hash(i, k, y) < 0.7) continue;
        g.fillStyle = 'rgba(255,200,110,0.55)'; g.fillRect(0.08 + i * 0.15, 0.25 + k * 0.3, 0.07, 0.1);
      }
      corrugate(g, 16, 0, 1, 0.5);
    });
  }
}

// ---------- baked ground ----------
const BAKE = new WeakMap();
const S = 1.6, MARGIN = 5;

function footprints(t) {
  const d = t.decor;
  const out = [];
  if (d === 'container') out.push([-0.5, -0.44, 0.5, 0.44, t.stack >= 2 ? 45 : 22]);
  else if (d === 'wall') {
    const c = tileInfo(t).conn || {}; const H = t.cut ? 10 : 40, th = 0.09;
    out.push([-th, -th, th, th, H]);
    if (c.N) out.push([-th, -0.5, th, 0, H]); if (c.S) out.push([-th, 0, th, 0.5, H]);
    if (c.W) out.push([-0.5, -th, 0, th, H]); if (c.E) out.push([0, -th, 0.5, th, H]);
  } else if (d === 'van' || d === 'wreck' || d === 'car') out.push([-0.42, -0.34, 1.42, 0.34, 18]);
  else if (d === 'barrier') out.push([-0.44, -0.18, 0.44, 0.18, 12]);
  else if (d === 'crate') out.push([-0.36, -0.32, 0.36, 0.32, 13]);
  else if (d === 'barrel' || d === 'burn' || d === 'barrelWreck') out.push([-0.15, -0.15, 0.15, 0.15, 14]);
  else if (d === 'desk') out.push([-0.4, -0.24, 0.4, 0.24, 8]);
  else if (d === 'shelf') out.push([-0.4, -0.16, 0.4, 0.16, 22]);
  else if (d === 'lamp') out.push([-0.04, -0.04, 0.04, 0.04, 54]);
  else if (d === 'fence') out.push([-0.04, -0.04, 0.04, 0.04, 30]);
  return out;
}

function noiseTile(n = 160) {
  const c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d');
  const im = g.createImageData(n, n);
  const r = rng(99);
  for (let i = 0; i < n * n; i++) {
    const v = r();
    const k = v < 0.5 ? 0 : 255;
    im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = k;
    im.data[i * 4 + 3] = Math.floor(Math.pow(Math.abs(v - 0.5) * 2, 3) * 70);
  }
  g.putImageData(im, 0, 0);
  return c;
}

export function bakeYard(m) {
  let bk = BAKE.get(m);
  if (bk) return bk;
  const p = prepMap(m);
  const M = MARGIN;
  const minX = toWorld(-M, m.h - 1 + M).x - HX, maxX = toWorld(m.w - 1 + M, -M).x + HX;
  const minY = toWorld(-M, -M).y - HY, maxY = toWorld(m.w - 1 + M, m.h - 1 + M).y + HY;
  const W = Math.ceil((maxX - minX) * S), H = Math.ceil((maxY - minY) * S);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const GT = () => g.setTransform(HX * S, HY * S, -HX * S, HY * S, -minX * S, -minY * S);
  const SC = () => g.setTransform(S, 0, 0, S, -minX * S, -minY * S); // world coords
  const inMap = (x, y) => x >= 0 && y >= 0 && x < m.w && y < m.h;
  const r = rng(7331);
  const QX = 2.5; // canal / quay boundary

  g.fillStyle = '#101113'; g.fillRect(0, 0, W, H);
  GT();
  // --- water ---
  {
    const wg = g.createLinearGradient(-M, 0, QX, 0);
    wg.addColorStop(0, '#0a171c'); wg.addColorStop(0.6, '#0d2129'); wg.addColorStop(1, '#0a1a20');
    g.fillStyle = wg; g.fillRect(-M - 1, -M - 1, QX + M + 1, m.h + 2 * M + 2);
    g.lineCap = 'round';
    for (let i = 0; i < 260; i++) {
      const x = -M + 1 + r() * (QX + M - 1), y = -M + r() * (m.h + 2 * M);
      g.strokeStyle = r() < 0.7 ? `rgba(110,160,175,${0.04 + r() * 0.07})` : `rgba(220,130,80,${0.03 + r() * 0.05})`;
      g.lineWidth = 0.02 + r() * 0.03;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 0.1, y + 0.3 + r() * 0.8); g.stroke();
    }
    // quay shadow on the water
    const sh = g.createLinearGradient(QX - 0.6, 0, QX, 0);
    sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.6)');
    g.fillStyle = sh; g.fillRect(QX - 0.6, -M - 1, 0.6, m.h + 2 * M + 2);
  }
  // --- land tiles ---
  for (let ty = -M; ty < m.h + M; ty++) for (let tx = 3; tx < m.w + M; tx++) {
    const t = inMap(tx, ty) ? m.tiles[ty][tx] : null;
    const kind = t ? t.t : (tx === 3 ? 'edge' : 'out');
    let c;
    if (kind === 'edge') c = [74, 72, 67];
    else if (kind === 'shed') c = [48, 50, 49];
    else if (kind === 'out') c = [44, 44, 46];
    else c = [64, 62, 58];
    const k = 0.9 + 0.14 * hash(Math.floor(tx / 2), Math.floor(ty / 2), 1) + 0.04 * hash(tx, ty, 2);
    g.fillStyle = rgb(c, k);
    g.fillRect(tx - 0.5, ty - 0.5, 1.02, 1.02);
  }
  // --- far bank strip ---
  g.fillStyle = '#26262a'; g.fillRect(-M - 1, -M - 1, 1.7, m.h + 2 * M + 2);
  // --- texture noise (world space so it is not sheared) ---
  {
    g.save();
    GT(); g.beginPath(); g.rect(QX, -M - 1, m.w + M, m.h + 2 * M + 2); g.rect(-M - 1, -M - 1, 1.7, m.h + 2 * M + 2);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clip();
    const pat = g.createPattern(noiseTile(), 'repeat');
    g.globalAlpha = 0.55; g.fillStyle = pat; g.fillRect(0, 0, W, H);
    g.restore();
  }
  GT();
  // blotches: damp patches and dirt
  for (let i = 0; i < 220; i++) {
    const x = QX + 0.3 + r() * (m.w + M - QX), y = -M + r() * (m.h + 2 * M), rad = 0.3 + r() * 1.6;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, r() < 0.65 ? `rgba(0,0,0,${0.08 + r() * 0.12})` : `rgba(96,80,58,${0.06 + r() * 0.08})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
  // --- room floors ---
  for (const room of Object.values(p.rooms)) {
    const x0 = room.x0, y0 = room.y0, w = room.x1 - room.x0, h = room.y1 - room.y0;
    if (room.hue === 'cafe') {
      for (let yy = 0; yy < h * 2; yy++) for (let xx = 0; xx < w * 2; xx++) {
        g.fillStyle = (xx + yy) % 2 ? '#3a2d27' : '#7a6c5c';
        g.fillRect(x0 + xx * 0.5, y0 + yy * 0.5, 0.5, 0.5);
      }
      g.fillStyle = 'rgba(20,12,10,0.45)'; g.fillRect(x0, y0, w, h);
    } else {
      g.fillStyle = '#3e4448'; g.fillRect(x0, y0, w, h);
      g.lineWidth = 0.025;
      for (let yy = 0; yy < h * 6; yy++) for (let xx = 0; xx < w * 6; xx++) {
        const cx = x0 + (xx + 0.5) / 6, cy = y0 + (yy + 0.5) / 6, d = (xx + yy) % 2 ? 0.05 : -0.05;
        g.strokeStyle = 'rgba(200,210,220,0.13)';
        g.beginPath(); g.moveTo(cx - 0.04, cy - d); g.lineTo(cx + 0.04, cy + d); g.stroke();
      }
      g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 0.03;
      for (let xx = 1; xx < w; xx++) { g.beginPath(); g.moveTo(x0 + xx, y0); g.lineTo(x0 + xx, y0 + h); g.stroke(); }
      for (let yy = 1; yy < h; yy++) { g.beginPath(); g.moveTo(x0, y0 + yy); g.lineTo(x0 + w, y0 + yy); g.stroke(); }
    }
    // worn grime around the room edges
    const gr = g.createRadialGradient(x0 + w / 2, y0 + h / 2, 0.2, x0 + w / 2, y0 + h / 2, Math.max(w, h) * 0.75);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.4)');
    g.fillStyle = gr; g.fillRect(x0, y0, w, h);
  }
  // workshop canopy floor: oily concrete with a hazard edge
  {
    let sx0 = 99, sx1 = -1, sy0 = 99, sy1 = -1;
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.tiles[y][x].t === 'shed') { sx0 = Math.min(sx0, x); sx1 = Math.max(sx1, x); sy0 = Math.min(sy0, y); sy1 = Math.max(sy1, y); }
    if (sx1 >= 0) {
      for (let i = 0; i < 6; i++) {
        const x = sx0 - 0.3 + r() * (sx1 - sx0 + 0.6), y = sy0 - 0.3 + r() * (sy1 - sy0 + 0.6), rad = 0.2 + r() * 0.4;
        const gr = g.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, 'rgba(6,6,8,0.7)'); gr.addColorStop(0.7, 'rgba(40,30,60,0.15)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
      }
      for (let k = 0; k < (sx1 - sx0 + 1) * 4; k++) {
        g.fillStyle = k % 2 ? 'rgba(20,20,20,0.7)' : 'rgba(200,160,40,0.7)';
        g.fillRect(sx0 - 0.5 + k * 0.25, sy1 + 0.38, 0.25, 0.12);
      }
    }
  }
  // --- slab joints + faint grid ---
  g.lineWidth = 0.028;
  for (let x = 3.5; x < m.w + M; x += 2) {
    g.strokeStyle = 'rgba(0,0,0,0.38)'; g.beginPath(); g.moveTo(x, -M); g.lineTo(x, m.h + M); g.stroke();
  }
  for (let y = -M + 0.5; y < m.h + M; y += 2) {
    g.strokeStyle = 'rgba(0,0,0,0.38)'; g.beginPath(); g.moveTo(QX, y); g.lineTo(m.w + M, y); g.stroke();
  }
  g.lineWidth = 0.012; g.strokeStyle = 'rgba(255,240,220,0.055)';
  for (let x = 3; x <= m.w; x++) { g.beginPath(); g.moveTo(x - 0.5, -0.5); g.lineTo(x - 0.5, m.h - 0.5); g.stroke(); }
  for (let y = 0; y <= m.h; y++) { g.beginPath(); g.moveTo(QX, y - 0.5); g.lineTo(m.w - 0.5, y - 0.5); g.stroke(); }
  // --- quay coping with hazard paint ---
  g.fillStyle = '#7a766c'; g.fillRect(QX, -M - 1, 0.3, m.h + 2 * M + 2);
  for (let y = -M; y < m.h + M; y += 0.5) {
    g.fillStyle = 'rgba(200,160,44,0.75)'; g.fillRect(QX + 0.02, y, 0.14, 0.25);
    g.fillStyle = 'rgba(20,20,20,0.75)'; g.fillRect(QX + 0.02, y + 0.25, 0.14, 0.25);
  }
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(QX + 0.28, -M - 1, 0.04, m.h + 2 * M + 2);
  // --- painted yard markings ---
  const paint = (x0, y0, x1, y1, col, w = 0.07, dash) => {
    g.strokeStyle = col; g.lineWidth = w; g.setLineDash(dash || []);
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.setLineDash([]);
  };
  paint(4, 9.5, 12.4, 9.5, 'rgba(206,168,58,0.55)', 0.08, [0.7, 0.35]);
  paint(4, 3.6, 9.4, 3.6, 'rgba(206,168,58,0.5)', 0.08);
  paint(9.5, 10.5, 9.5, 15.5, 'rgba(206,168,58,0.45)', 0.08);
  paint(15.5, 3.5, 15.5, 9.4, 'rgba(206,168,58,0.4)', 0.07, [0.5, 0.3]);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const t = m.tiles[y][x];
    if (t.decor === 'van') {
      g.strokeStyle = 'rgba(230,226,214,0.35)'; g.lineWidth = 0.06;
      g.strokeRect(x - 0.6, y - 0.55, 2.2, 1.1);
    }
  }
  // stencils
  const stencil = (txt, x, y, size, col, rot = 0) => {
    g.save(); g.translate(x, y); g.rotate(rot);
    g.font = `700 ${size}px Oswald, sans-serif`; g.textAlign = 'center'; g.fillStyle = col;
    g.fillText(txt, 0, 0); g.restore();
  };
  stencil('BAY 07', 5.5, 13.4, 0.55, 'rgba(220,214,200,0.28)');
  stencil('NO STACKING', 12.5, 10.5, 0.42, 'rgba(206,168,58,0.4)');
  stencil('KEEP CLEAR', 7.2, 1.5, 0.45, 'rgba(206,168,58,0.38)', Math.PI / 2);
  // cracks
  g.lineCap = 'round';
  for (let i = 0; i < 90; i++) {
    let x = QX + 0.5 + r() * (m.w + 2 - QX), y = -2 + r() * (m.h + 4);
    let a = r() * Math.PI * 2;
    g.strokeStyle = `rgba(8,8,8,${0.35 + r() * 0.35})`; g.lineWidth = 0.015 + r() * 0.02;
    g.beginPath(); g.moveTo(x, y);
    const n = 4 + Math.floor(r() * 9);
    for (let k = 0; k < n; k++) {
      a += (r() - 0.5) * 1.3; x += Math.cos(a) * (0.08 + r() * 0.18); y += Math.sin(a) * (0.08 + r() * 0.18);
      g.lineTo(x, y);
      if (r() < 0.15) { g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 0.3, y + (r() - 0.5) * 0.3); g.moveTo(x, y); }
    }
    g.stroke();
  }
  // tyre marks
  for (let i = 0; i < 9; i++) {
    const x = 4 + r() * (m.w - 6), y = r() * m.h, a = r() * Math.PI * 2, L = 1.5 + r() * 3, bend = (r() - 0.5) * 2;
    const dx = Math.cos(a), dy = Math.sin(a), nx = -dy * 0.22, ny = dx * 0.22;
    for (const s of [-1, 1]) {
      g.strokeStyle = 'rgba(10,10,10,0.22)'; g.lineWidth = 0.09;
      g.beginPath(); g.moveTo(x + nx * s, y + ny * s);
      g.quadraticCurveTo(x + dx * L / 2 + nx * s - dy * bend, y + dy * L / 2 + ny * s + dx * bend, x + dx * L + nx * s, y + dy * L + ny * s);
      g.stroke();
    }
  }
  // oil stains
  for (let i = 0; i < 16; i++) {
    const x = 4 + r() * (m.w - 5), y = r() * m.h, rad = 0.2 + r() * 0.45;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, 'rgba(6,6,8,0.55)'); gr.addColorStop(0.6, 'rgba(10,10,14,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
  // puddles reflecting the dusk sky
  const puddle = (x, y, s) => {
    const parts = [];
    for (let k = 0; k < 4; k++) parts.push([x + (r() - 0.5) * s, y + (r() - 0.5) * s * 0.8, s * (0.35 + r() * 0.35)]);
    g.save();
    g.beginPath(); for (const [px, py, pr] of parts) { g.moveTo(px + pr, py); g.arc(px, py, pr, 0, Math.PI * 2); }
    g.fillStyle = 'rgba(30,36,44,0.75)'; g.fill('nonzero');
    g.clip('nonzero');
    const sky = g.createLinearGradient(x - s, y - s, x + s, y + s);
    sky.addColorStop(0, 'rgba(200,120,90,0.32)'); sky.addColorStop(0.45, 'rgba(90,80,100,0.18)'); sky.addColorStop(1, 'rgba(40,48,60,0.12)');
    g.fillStyle = sky; g.fillRect(x - 2 * s, y - 2 * s, 4 * s, 4 * s);
    g.restore();
  };
  for (const [x, y, s] of [[5.2, 2.2, 0.9], [7.6, 10.8, 1.1], [12.3, 13.6, 0.8], [18.8, 9.8, 1.0], [14.2, 2.0, 0.6], [4.6, 14.3, 0.7], [11.6, 7.4, 0.5], [20.5, 2.6, 0.7]]) {
    if (x < m.w && y < m.h) puddle(x, y, s);
  }
  // steel road plates laid over trench work
  for (const [x, y, w, h] of [[6.2, 6.6, 1.2, 0.8], [12.6, 11.2, 0.9, 1.3], [19.6, 4.8, 1.0, 0.9]]) {
    if (x >= m.w || y >= m.h) continue;
    g.fillStyle = 'rgba(70,74,78,0.9)'; g.fillRect(x - w / 2, y - h / 2, w, h);
    g.strokeStyle = 'rgba(10,10,10,0.6)'; g.lineWidth = 0.03; g.strokeRect(x - w / 2, y - h / 2, w, h);
    g.lineWidth = 0.02;
    for (let i = 0; i < w * 7; i++) for (let k = 0; k < h * 7; k++) {
      const cx = x - w / 2 + (i + 0.5) / 7, cy = y - h / 2 + (k + 0.5) / 7, d = (i + k) % 2 ? 0.04 : -0.04;
      g.strokeStyle = 'rgba(210,215,220,0.12)'; g.beginPath(); g.moveTo(cx - 0.035, cy - d); g.lineTo(cx + 0.035, cy + d); g.stroke();
    }
    const sheen = g.createLinearGradient(x - w / 2, y - h / 2, x + w / 2, y + h / 2);
    sheen.addColorStop(0, 'rgba(255,200,150,0.1)'); sheen.addColorStop(1, 'rgba(0,0,0,0.15)');
    g.fillStyle = sheen; g.fillRect(x - w / 2, y - h / 2, w, h);
  }
  // drains
  for (const [x, y] of [[6, 11], [12, 10], [18, 3], [9, 2], [14, 14]]) {
    if (x >= m.w || y >= m.h) continue;
    g.fillStyle = '#121212'; g.fillRect(x - 0.22, y - 0.14, 0.44, 0.28);
    g.strokeStyle = 'rgba(120,120,120,0.45)'; g.lineWidth = 0.025;
    for (let k = 1; k < 6; k++) { g.beginPath(); g.moveTo(x - 0.22 + k * 0.073, y - 0.14); g.lineTo(x - 0.22 + k * 0.073, y + 0.14); g.stroke(); }
    g.strokeRect(x - 0.22, y - 0.14, 0.44, 0.28);
    const gr = g.createRadialGradient(x, y, 0, x, y, 0.6);
    gr.addColorStop(0, 'rgba(0,0,0,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, 0.6, 0, Math.PI * 2); g.fill();
  }
  // blood
  for (const [x, y] of [[11.8, 2.4], [7.2, 12.6], [15.4, 13.1], [19.2, 1.4]]) {
    if (x >= m.w || y >= m.h) continue;
    g.fillStyle = 'rgba(80,8,8,0.6)';
    g.beginPath(); g.arc(x, y, 0.16, 0, Math.PI * 2); g.fill();
    for (let k = 0; k < 9; k++) {
      const a = r() * Math.PI * 2, d = 0.12 + r() * 0.35;
      g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 0.02 + r() * 0.06, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = 'rgba(60,4,4,0.35)';
    g.beginPath(); g.ellipse(x + 0.25, y + 0.1, 0.35, 0.12, 0.4, 0, Math.PI * 2); g.fill();
  }
  // litter: paper and cans
  for (let i = 0; i < 40; i++) {
    const x = 3.5 + r() * (m.w - 3.5), y = r() * m.h;
    g.fillStyle = r() < 0.6 ? 'rgba(200,190,170,0.35)' : 'rgba(150,60,40,0.5)';
    g.save(); g.translate(x, y); g.rotate(r() * 3); g.fillRect(-0.05, -0.03, 0.1, 0.06); g.restore();
  }
  // outside the playable yard: darker and dirtier
  g.fillStyle = 'rgba(0,0,0,0.38)';
  g.beginPath();
  g.rect(QX + 0.32, -M - 1, m.w + M + 2, m.h + 2 * M + 2);
  g.rect(m.w - 0.5, -0.5, -(m.w - 0.5 - QX - 0.32), m.h);
  g.fill('evenodd');

  // --- soft cast shadows + contact occlusion ---
  {
    const sc = document.createElement('canvas');
    const k = 0.25;
    sc.width = Math.ceil(W * k); sc.height = Math.ceil(H * k);
    const sg = sc.getContext('2d');
    sg.setTransform(S * k, 0, 0, S * k, -minX * S * k, -minY * S * k);
    sg.fillStyle = '#000';
    const ao = document.createElement('canvas'); ao.width = Math.ceil(W * 0.5); ao.height = Math.ceil(H * 0.5);
    const ag = ao.getContext('2d');
    ag.setTransform(S * 0.5, 0, 0, S * 0.5, -minX * S * 0.5, -minY * S * 0.5);
    ag.fillStyle = '#000';
    const SV = [0.32, 1].map((v) => v * 0.03);
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      const t = m.tiles[y][x];
      if (!t.decor) continue;
      for (const [x0, y0, x1, y1, h] of footprints(t)) {
        const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
        const pts = [];
        for (const [cx, cy] of corners) {
          const a = toWorld(x + cx, y + cy); pts.push([a.x, a.y]);
          const b = toWorld(x + cx + SV[0] * h, y + cy + SV[1] * h); pts.push([b.x, b.y]);
        }
        path(sg, hull(pts)); sg.fill();
        const e = 0.07;
        const ap = [[x0 - e, y0 - e], [x1 + e, y0 - e], [x1 + e, y1 + e], [x0 - e, y1 + e]].map(([cx, cy]) => { const a = toWorld(x + cx, y + cy); return [a.x, a.y]; });
        path(ag, ap); ag.fill();
      }
    }
    for (const sp of p.scenery) {
      if (sp.kind !== 'fence') continue;
      for (const u of [-0.5, 0.5]) {
        const cx = sp.x + (sp.alongY ? 0 : u), cy = sp.y + (sp.alongY ? u : 0);
        const a = toWorld(cx, cy), b = toWorld(cx + SV[0] * 30, cy + SV[1] * 30);
        sg.lineWidth = 2; sg.strokeStyle = '#000'; sg.beginPath(); sg.moveTo(a.x, a.y); sg.lineTo(b.x, b.y); sg.stroke();
      }
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.globalAlpha = 0.55; g.drawImage(sc, 0, 0, W, H);
    g.globalAlpha = 0.4; g.drawImage(ao, 0, 0, W, H);
    g.globalAlpha = 1;
  }
  // --- edge fade into the night ---
  g.setTransform(1, 0, 0, 1, 0, 0);
  const fade = (x0, y0, x1, y1) => {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, 'rgba(14,15,18,1)'); gr.addColorStop(1, 'rgba(14,15,18,0)');
    g.fillStyle = gr; g.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0) || W, Math.abs(y1 - y0) || H);
  };
  const fw = W * 0.12, fh = H * 0.14;
  { const gr = g.createLinearGradient(0, 0, fw, 0); gr.addColorStop(0, 'rgba(14,15,18,1)'); gr.addColorStop(1, 'rgba(14,15,18,0)'); g.fillStyle = gr; g.fillRect(0, 0, fw, H); }
  { const gr = g.createLinearGradient(W, 0, W - fw, 0); gr.addColorStop(0, 'rgba(14,15,18,1)'); gr.addColorStop(1, 'rgba(14,15,18,0)'); g.fillStyle = gr; g.fillRect(W - fw, 0, fw, H); }
  { const gr = g.createLinearGradient(0, H, 0, H - fh); gr.addColorStop(0, 'rgba(14,15,18,1)'); gr.addColorStop(1, 'rgba(14,15,18,0)'); g.fillStyle = gr; g.fillRect(0, H - fh, W, fh); }
  void fade;
  bk = { cv, minX, minY, w: W / S, h: H / S };
  BAKE.set(m, bk);
  return bk;
}

// Ground pass for the tactics view: baked yard, scorch under wrecks, living water, light pools.
export function drawYard(g, m, z, now) {
  const bk = bakeYard(m);
  g.drawImage(bk.cv, bk.minX * z, bk.minY * z, bk.w * z, bk.h * z);
  const p = prepMap(m);
  // scorch marks under anything that has blown up
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const t = m.tiles[y][x];
    if (t.decor !== 'barrelWreck' && t.decor !== 'wreck') continue;
    const c = toWorld(x + (t.decor === 'wreck' ? 0.5 : 0), y);
    const rx = (t.decor === 'wreck' ? 2.2 : 1.3) * HX * z;
    g.save(); g.translate(c.x * z, c.y * z); g.scale(1, 0.5);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
    gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(0.6, 'rgba(20,10,5,0.4)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  // shimmering canal (batched into a few alpha buckets)
  const t = now / 1000;
  g.save();
  g.lineCap = 'round';
  g.lineWidth = 1.1 * z;
  const buckets = [[], [], []];
  for (let ty = -4; ty < m.h + 4; ty++) for (let tx = -3; tx <= 2; tx++) {
    const ph = hash(tx, ty, 3) * 6.28;
    const k = 0.5 + 0.5 * Math.sin(t * 1.3 + ph);
    const a = toWorld(tx + 0.2 * Math.sin(ph), ty - 0.3 + 0.25 * Math.sin(t * 0.5 + ph));
    const b = toWorld(tx + 0.2 * Math.sin(ph) + 0.02, ty + 0.15 + 0.25 * Math.sin(t * 0.5 + ph));
    buckets[Math.min(2, Math.floor(k * 3))].push(a.x * z, a.y * z, b.x * z, b.y * z);
  }
  buckets.forEach((bk2, i) => {
    g.strokeStyle = `rgba(150,190,200,${0.06 + 0.05 * i})`;
    g.beginPath();
    for (let j = 0; j < bk2.length; j += 4) { g.moveTo(bk2[j], bk2[j + 1]); g.lineTo(bk2[j + 2], bk2[j + 3]); }
    g.stroke();
  });
  g.restore();
  // light pools (additive)
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (const L of p.lights) {
    let R, col, a;
    if (L.kind === 'lamp') { R = 2.6; col = '255,170,80'; a = 0.26; }
    else if (L.kind === 'fire') { R = 2.0; col = '255,120,40'; a = 0.24 + 0.05 * Math.sin(t * 9 + L.x) + 0.04 * Math.sin(t * 23 + L.y); }
    else if (L.kind === 'neon') { R = 2.2; col = '255,80,150'; a = 0.16; }
    else { R = 2.0; col = '160,200,255'; a = 0.15; }
    const c = toWorld(L.x + (L.kind === 'lamp' ? 0.3 : 0), L.y + (L.kind === 'lamp' ? 0.05 : 0));
    const rx = R * HX * 1.41 * z;
    g.save(); g.translate(c.x * z, c.y * z); g.scale(1, 0.5);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
    gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(0.5, `rgba(${col},${a * 0.45})`); gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, Math.PI * 2); g.fill();
    g.restore();
    if (L.kind === 'lamp' && L.x <= 4) {
      // reflection streak on the canal
      const w0 = toWorld(1.6, L.y);
      const gr2 = g.createLinearGradient(w0.x * z, (w0.y - 10) * z, w0.x * z, (w0.y + 30) * z);
      gr2.addColorStop(0, 'rgba(255,170,80,0)'); gr2.addColorStop(0.4, `rgba(255,170,80,${0.12 + 0.05 * Math.sin(t * 3 + L.y)})`); gr2.addColorStop(1, 'rgba(255,170,80,0)');
      g.fillStyle = gr2; g.fillRect((w0.x - 4) * z, (w0.y - 10) * z, 8 * z, 40 * z);
    }
  }
  g.restore();
}

export function drawNightSky(g, w, h) {
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#0c0b12');
  sky.addColorStop(0.35, '#2a1a24');
  sky.addColorStop(0.6, '#4a2a26');
  sky.addColorStop(1, '#0e0f12');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
}

export function drawVignette(g, w, h) {
  const gr = g.createRadialGradient(w / 2, h * 0.52, Math.min(w, h) * 0.35, w / 2, h * 0.52, Math.max(w, h) * 0.72);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.5)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
}
