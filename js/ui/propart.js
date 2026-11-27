// v0.22: painted prop art. Per map, the code-drawn props are swapped for painted WebP sprites (same
// footprints and cover heights; only the look changes). Sprites load lazily the first time the map is
// drawn; until then (or if a file fails) the code-drawn prop stays. Original art, cut by tools/cut_props.py.
const DIR = 'assets/props/';
// fp = footprint in tile-local units [x0, y0, x1, y1] (as the code-drawn prop); kw = sprite width as a share
// of the footprint's screen width; dy = nudge down in world px (wheels / feet onto the ground)
export const SETS = {
  docklands: {
    dir: 'docklands/',
    art: {
      'truck-grey': { fp: [-0.42, -0.32, 1.42, 0.32], kw: 1.02, dy: 3, lights: [[0.777, 0.865], [0.964, 0.744]], col: '255,236,200' },
      'van-dark': { fp: [-0.42, -0.32, 1.42, 0.32], kw: 1.0, dy: 3, lights: [[0.755, 0.814], [0.969, 0.669]], col: '225,238,255' },
      'van-white': { fp: [-0.42, -0.32, 1.42, 0.32], kw: 1.0, dy: 3, lights: [[0.801, 0.862], [0.973, 0.754]], col: '255,236,200' },
      'truck-wreck': { fp: [-0.42, -0.32, 1.42, 0.32], kw: 1.02, dy: 3, embers: [[0.42, 0.42], [0.36, 0.55]] },
      'crate-wood': { fp: [-0.38, -0.34, 0.38, 0.34], kw: 1.0, dy: 1 },
      'crate-wrap': { fp: [-0.38, -0.34, 0.38, 0.34], kw: 1.0, dy: 1 },
      'crate-steel': { fp: [-0.38, -0.34, 0.38, 0.34], kw: 1.0, dy: 1 },
      'tyres': { fp: [-0.34, -0.3, 0.34, 0.3], kw: 0.95, dy: 1 },
      'barrier-yellow': { fp: [-0.44, -0.2, 0.44, 0.2], kw: 0.98, dy: 1 },
      'barrier-red': { fp: [-0.44, -0.2, 0.44, 0.2], kw: 0.98, dy: 1 },
      'barrel-red': { fp: [-0.1, -0.1, 0.1, 0.1], kw: 1.08, dy: 1.5 },
      'barrel-burn': { fp: [-0.1, -0.1, 0.1, 0.1], kw: 1.08, dy: 1.5 },
      'barrel-wreck': { fp: [-0.1, -0.1, 0.1, 0.1], kw: 1.3, dy: 1.5 },
      'lamp': { h: 58, base: 0.25, head: [0.813, 0.041] },
      'tug': { fp: [-0.34, -1.2, 0.34, 0.85], kw: 1.0, dy: 2 },
      'desk': { fp: [-0.4, -0.24, 0.4, 0.24], kw: 1.12, dy: 2 },
      'shelf': { fp: [-0.4, -0.16, 0.4, 0.16], kw: 0.9, dy: 1 },
      'bollard': { w: 10, dy: 1 },
      'container-tex': {},
    },
  },
};
const IMG = new Map();
let VER = 0;
export const ver = () => VER;
// start loading a map's art (once); returns true when it is all ready
export function ensure(m) {
  const set = m && SETS[m.id];
  if (!set || typeof Image === 'undefined') return false;
  if (set.ready) return true;
  if (set.loading) return false;
  set.loading = true;
  const names = Object.keys(set.art);
  let left = names.length;
  for (const n of names) {
    const im = new Image();
    im.decoding = 'async';
    const done = () => { if (--left === 0) { set.ready = true; VER++; } };
    im.onload = () => { IMG.set(set.dir + n, im); done(); };
    im.onerror = done;
    im.src = set.art[n].src || DIR + set.dir + n + '.webp';
  }
  return false;
}
export function has(m) { const s = m && SETS[m.id]; return !!(s && s.ready); }
export function img(m, n) { const s = SETS[m.id]; return s && IMG.get(s.dir + n); }
export function def(m, n) { const s = SETS[m.id]; return s && s.art[n]; }

const HX = 29, HY = 14.5;
// sprite rect for a footprint-fitted prop at tile anchor (sx, sy)
export function rect(d, im, sx, sy, z) {
  const [x0, y0, x1, y1] = d.fp;
  const L = sx + (x0 - y1) * HX * z, R = sx + (x1 - y0) * HX * z, B = sy + (x1 + y1) * HY * z;
  const w = (R - L) * d.kw, h = w * im.height / im.width;
  return { x: (L + R) / 2 - w / 2, y: B + (d.dy || 0) * z - h, w, h };
}
// soft contact shadow: the footprint, slightly grown, blurred and dark (ambient occlusion under the prop)
export function contact(g, d, sx, sy, z, a = 0.55) {
  const [x0, y0, x1, y1] = d.fp, e = 0.05;
  const pt = (x, y) => [sx + (x - y) * HX * z, sy + (x + y) * HY * z];
  const q = [pt(x0 - e, y0 - e), pt(x1 + e, y0 - e), pt(x1 + e, y1 + e), pt(x0 - e, y1 + e)];
  g.save();
  g.filter = `blur(${Math.max(1, 2.2 * z).toFixed(1)}px)`;
  g.fillStyle = `rgba(4,4,6,${a})`;
  g.beginPath(); g.moveTo(q[0][0], q[0][1]); for (let i = 1; i < 4; i++) g.lineTo(q[i][0], q[i][1]); g.closePath(); g.fill();
  g.filter = 'none';
  // tighter, darker core where the prop meets the ground
  const c = pt((x0 + x1) / 2, (y0 + y1) / 2);
  const rx = ((x1 - x0) + (y1 - y0)) * HX * 0.5 * z, ry = rx * 0.5;
  const gr = g.createRadialGradient(c[0], c[1], 0, c[0], c[1], rx);
  gr.addColorStop(0, `rgba(0,0,0,${a * 0.6})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.beginPath(); g.ellipse(c[0], c[1], rx, ry, 0, 0, Math.PI * 2); g.fill();
  g.restore();
}
export function blit(g, m, n, sx, sy, z, shadow = 0.55) {
  const d = def(m, n), im = img(m, n);
  if (!d || !im) return false;
  if (shadow) contact(g, d, sx, sy, z, shadow);
  const r = rect(d, im, sx, sy, z);
  g.drawImage(im, r.x, r.y, r.w, r.h);
  return true;
}
// vehicle pick: grey vans are a box truck or a dark panel van; white ones the Luton van
export function vehicleArt(t, h) { return t.hue === 'grey' ? (h < 0.5 ? 'truck-grey' : 'van-dark') : 'van-white'; }
export function crateArt(v, h) { return v === 1 ? 'tyres' : ['crate-wood', 'crate-steel', 'crate-wrap'][Math.floor(h * 3) % 3]; }

// ---------- live emissive parts (drawn every frame over the lit, cached sprite) ----------
const GLOW = new Map();
function glowSprite(col) {
  let c = GLOW.get(col); if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, `rgba(${col},1)`); gr.addColorStop(0.18, `rgba(${col},0.7)`); gr.addColorStop(1, `rgba(${col},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); GLOW.set(col, c); return c;
}
// headlights: a hot core and halo on each lamp, plus the beams spilling onto the ground ahead of the cab
export function headlights(g, m, n, sx, sy, z, mir, now) {
  const d = def(m, n), im = img(m, n);
  if (!d || !im || !d.lights) return;
  const r = rect(d, im, sx, sy, z);
  const X = (fx) => (mir ? 2 * sx - (r.x + fx * r.w) : r.x + fx * r.w);
  g.save();
  g.globalCompositeOperation = 'lighter';
  const gs = glowSprite(d.col);
  for (const [fx, fy] of d.lights) {
    const x = X(fx), y = r.y + fy * r.h;
    g.globalAlpha = 0.85; g.drawImage(gs, x - 3.2 * z, y - 3.2 * z, 6.4 * z, 6.4 * z);
    g.globalAlpha = 0.35; g.drawImage(gs, x - 10 * z, y - 7 * z, 20 * z, 14 * z);
  }
  // beams on the ground: two soft ellipses ahead of the cab, along the van's axis (+x, or +y mirrored)
  const dir = mir ? [-1, 1] : [1, 1];
  const ax = sx + dir[0] * 2.2 * HX * z, ay = sy + 2.2 * HY * z;
  g.globalAlpha = 0.16;
  g.save(); g.translate(ax, ay); g.rotate(dir[0] * 0.4636);
  g.drawImage(gs, -26 * z, -9 * z, 52 * z, 18 * z);
  g.restore();
  g.restore();
}
export function embers(g, m, n, sx, sy, z, mir, now) {
  const d = def(m, n), im = img(m, n);
  if (!d || !im || !d.embers) return;
  const r = rect(d, im, sx, sy, z), t = (now || 0) / 1000;
  g.save(); g.globalCompositeOperation = 'lighter';
  const gs = glowSprite('255,120,40');
  d.embers.forEach(([fx, fy], i) => {
    const x = mir ? 2 * sx - (r.x + fx * r.w) : r.x + fx * r.w, y = r.y + fy * r.h;
    g.globalAlpha = 0.35 + 0.25 * Math.sin(t * 5 + i * 2.3) * Math.sin(t * 1.7 + i);
    g.drawImage(gs, x - 9 * z, y - 7 * z, 18 * z, 14 * z);
  });
  g.restore();
}
