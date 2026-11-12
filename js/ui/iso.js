// Isometric canvas renderer for the base: pre-rendered ground, depth-sorted sprites, pan / pinch-zoom,
// tap hit-testing and a drag-to-place ghost. Knows nothing about rules; hideout.js feeds it state.
import { MAP_N, BUILDINGS, OBSTACLES, spriteFor } from '../core/buildings.js';
import { groundMap, roadsFor, lotsFor, decalsFor } from '../core/base.js';

export const TW = 64, TH = 32;
const N = MAP_N;
const GS = 0.75; // ground pre-render scale

// per-sprite drawing tweaks: width multiplier relative to footprint, vertical nudge (in tile heights)
export const SPR = {
  hq1: { w: 1.02, dy: 0.05 }, hq2: { w: 1.08, dy: 0.05 }, hq3: { w: 1.1, dy: 0.05 },
  stall: { w: 1.08 }, carwash: { w: 1.12 }, phone: { w: 1.0 }, pawn: { w: 0.98 }, chop: { w: 1.08 }, club: { w: 1.08 },
  casino: { w: 1.12 }, crypto: { w: 1.04 }, docks: { w: 1.05 }, radio: { w: 1.02 }, pit: { w: 1.05 }, strongbox: { w: 0.98 },
  ledger: { w: 1.02 }, gym: { w: 1.04 }, bunk: { w: 0.96 }, armoury: { w: 1.02 }, family: { w: 1.06 }, sniper: { w: 0.95 },
  turret: { w: 1.0 }, wall: { w: 1.0, dy: 0.08 },
  bush: { w: 1.25, dy: 0.15 }, tyres: { w: 0.9, dy: 0.2 }, scrap: { w: 1.1, dy: 0.15 }, rubble: { w: 1.1, dy: 0.15 },
  deadtree: { w: 1.7, dy: 0.25 }, tree: { w: 1.25, dy: 0.12 }, wreck: { w: 0.98, dy: 0.25 }, ruin2: { w: 1.04 }, ruin3: { w: 1.04 },
};
const ALL_SPRITES = ['hq1', 'hq2', 'hq3', ...Object.keys(BUILDINGS).filter((k) => k !== 'den' && k !== 'cannon'), 'turret', ...Object.keys(OBSTACLES)];

const imgs = {};
let loaded = 0;
export function preload(onAll) {
  const list = [...new Set(ALL_SPRITES)];
  const tex = ['ground', 'grass', 'asphalt'];
  let need = list.length + tex.length;
  const done = () => { loaded++; if (--need === 0) onAll?.(); };
  for (const n of list) { if (imgs[n]) { done(); continue; } const im = new Image(); im.onload = done; im.onerror = done; im.src = `assets/base/${n}.webp`; imgs[n] = im; }
  for (const n of tex) { if (imgs[n]) { done(); continue; } const im = new Image(); im.onload = done; im.onerror = done; im.src = `assets/base/${n}.jpg`; imgs[n] = im; }
}
export const spriteImg = (n) => imgs[n];

// tile (top corner) -> world px
export const tileToWorld = (i, j) => ({ x: (i - j) * TW / 2, y: (i + j) * TH / 2 });
export function worldToTile(x, y) {
  const a = y / (TH / 2), b = x / (TW / 2);
  return { i: (a + b) / 2, j: (a - b) / 2 };
}

let groundCache = { seed: null, canvas: null };
function buildGround(seed) {
  if (groundCache.seed === seed && groundCache.canvas) return groundCache.canvas;
  const W = N * TW * GS, H = N * TH * GS;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H + 40;
  const g = cv.getContext('2d');
  const gm = groundMap(seed);
  // iso transform: tile units -> canvas px
  const iso = () => g.setTransform(TW / 2 * GS, TH / 2 * GS, -TW / 2 * GS, TH / 2 * GS, W / 2, 0);
  const pat = (name, tiles) => {
    const im = imgs[name];
    if (!im || !im.complete || !im.naturalWidth) return '#2a241f';
    const p = g.createPattern(im, 'repeat');
    p.setTransform(new DOMMatrix().scale(tiles / im.naturalWidth));
    return p;
  };
  iso();
  // dirt base
  g.fillStyle = pat('ground', 5); g.fillRect(0, 0, N, N);
  // grass blobs
  g.save(); g.fillStyle = pat('grass', 4.5);
  g.beginPath();
  let seedv = seed;
  const rnd = () => ((seedv = (seedv * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (gm[j * N + i] === 1) { const r = 0.55 + rnd() * 0.45; g.moveTo(i + 0.5 + r, j + 0.5); g.arc(i + 0.5, j + 0.5, r, 0, Math.PI * 2); }
  g.globalAlpha = 0.92; g.fill(); g.restore();
  // concrete lots (slabs) and roads (asphalt)
  g.fillStyle = pat('asphalt', 4);
  for (const lot of lotsFor(seed)) {
    for (let y = lot.y; y < lot.y + lot.h; y++) for (let x = lot.x; x < lot.x + lot.w; x++) {
      if (x < 0 || y < 0 || x >= N || y >= N || rnd() < 0.1) continue;
      g.globalAlpha = 0.75 + rnd() * 0.25; g.fillRect(x + 0.04, y + 0.04, 0.92, 0.92);
    }
  }
  g.globalAlpha = 1;
  const roads = roadsFor(seed);
  for (const r of roads) for (const [x, y] of r.cells) { g.globalAlpha = 0.85 + rnd() * 0.15; g.fillRect(x - 0.02, y - 0.02, 1.04, 1.04); }
  g.globalAlpha = 1;
  // weather the concrete down: darker, dustier
  g.fillStyle = 'rgba(18,14,11,0.42)';
  for (const r of roads) for (const [x, y] of r.cells) g.fillRect(x - 0.02, y - 0.02, 1.04, 1.04);
  for (const lot of lotsFor(seed)) g.fillRect(lot.x, lot.y, lot.w, lot.h);
  // faded centre lines on the two long roads
  g.strokeStyle = 'rgba(220,210,180,0.22)'; g.lineWidth = 0.08; g.setLineDash([0.6, 0.8]);
  const ry = Math.min(...roads[0].cells.map((c) => c[1])) + 1, rx = Math.min(...roads[1].cells.map((c) => c[0])) + 1;
  g.beginPath(); g.moveTo(0, ry); g.lineTo(N, ry); g.moveTo(rx, 0); g.lineTo(rx, N); g.stroke(); g.setLineDash([]);
  // cracks
  g.strokeStyle = 'rgba(10,8,6,0.45)'; g.lineWidth = 0.035;
  for (let k = 0; k < 160; k++) {
    let x = rnd() * N, y = rnd() * N; g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 5; s++) { x += (rnd() - 0.5) * 0.9; y += (rnd() - 0.5) * 0.9; g.lineTo(x, y); }
    g.stroke();
  }
  // gravel specks
  for (let k = 0; k < 2200; k++) { g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.25)' : 'rgba(200,180,150,0.12)'; g.fillRect(rnd() * N, rnd() * N, 0.05, 0.05); }
  // puddles reflecting the dusk sky, oil stains
  for (const d of decalsFor(seed)) {
    g.save(); g.translate(d.x, d.y); g.scale(d.r, d.r * (0.6 + (d.x % 1) * 0.5));
    const gr = g.createRadialGradient(0, 0, 0.05, 0, 0, 1);
    if (d.k === 'puddle') { gr.addColorStop(0, 'rgba(150,100,90,0.45)'); gr.addColorStop(0.55, 'rgba(50,46,58,0.55)'); gr.addColorStop(1, 'rgba(20,20,26,0)'); }
    else { gr.addColorStop(0, 'rgba(5,5,8,0.6)'); gr.addColorStop(1, 'rgba(5,5,8,0)'); }
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, Math.PI * 2); g.fill(); g.restore();
  }
  // edge fade into darkness
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'destination-in';
  const fade = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.52);
  fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(1, 'rgba(0,0,0,0.0)');
  g.fillStyle = fade; g.fillRect(0, 0, W, H + 40);
  g.globalCompositeOperation = 'source-over';
  // only cache once the textures are in, otherwise the first frame's flat fallback would stick
  const ready = ['ground', 'grass', 'asphalt'].every((n) => imgs[n] && imgs[n].complete && imgs[n].naturalWidth);
  if (ready) groundCache = { seed, canvas: cv };
  return cv;
}
export function invalidateGround() { groundCache = { seed: null, canvas: null }; }

export class BaseView {
  constructor(canvas, hooks) {
    this.cv = canvas; this.g = canvas.getContext('2d');
    this.hooks = hooks; // { getState, onTap(hit), onPlaceMove(x,y), bubbles(state) }
    this.cam = hooks.cam || { x: 0, y: N * TH / 2, z: 0.9 };
    this.ptrs = new Map(); this.drag = null; this.dirty = true; this.anim = 0;
    this.ghost = null; // {type, x, y, ok}
    this.sel = null; // id
    this.hidden = null; // id hidden while moving
    this.hitBubbles = [];
    this.resize();
    this.bind();
    this.raf = requestAnimationFrame(this.frame.bind(this));
  }
  destroy() { cancelAnimationFrame(this.raf); this.dead = true; this.ro?.disconnect(); }
  resize() {
    const r = this.cv.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr; this.w = r.width; this.h = r.height;
    this.cv.width = Math.max(1, Math.round(r.width * dpr)); this.cv.height = Math.max(1, Math.round(r.height * dpr));
    this.dirty = true;
  }
  bind() {
    const cv = this.cv;
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(cv);
    cv.addEventListener('pointerdown', (e) => this.down(e));
    cv.addEventListener('pointermove', (e) => this.move(e));
    cv.addEventListener('pointerup', (e) => this.up(e));
    cv.addEventListener('pointercancel', (e) => this.up(e, true));
    cv.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  }
  // ----- coordinate helpers
  toScreen(wx, wy) { return { x: (wx - this.cam.x) * this.cam.z + this.w / 2, y: (wy - this.cam.y) * this.cam.z + this.h / 2 }; }
  toWorld(sx, sy) { return { x: (sx - this.w / 2) / this.cam.z + this.cam.x, y: (sy - this.h / 2) / this.cam.z + this.cam.y }; }
  tileAtScreen(sx, sy) { const w = this.toWorld(sx, sy); const t = worldToTile(w.x, w.y); return { i: Math.floor(t.i), j: Math.floor(t.j), fi: t.i, fj: t.j }; }
  centerOfFootprint(x, y, s) { const w = tileToWorld(x + s / 2, y + s / 2); return this.toScreen(w.x, w.y); }
  clamp() {
    const z = this.cam.z;
    this.cam.z = Math.max(0.35, Math.min(1.8, z));
    const halfW = N * TW / 2, H = N * TH;
    this.cam.x = Math.max(-halfW * 0.85, Math.min(halfW * 0.85, this.cam.x));
    this.cam.y = Math.max(H * 0.08, Math.min(H * 0.92, this.cam.y));
  }
  zoomAt(sx, sy, f) {
    const before = this.toWorld(sx, sy);
    this.cam.z *= f; this.clamp();
    const after = this.toWorld(sx, sy);
    this.cam.x += before.x - after.x; this.cam.y += before.y - after.y; this.clamp();
    this.dirty = true;
  }
  centerOn(i, j, s = 1) { const w = tileToWorld(i + s / 2, j + s / 2); this.cam.x = w.x; this.cam.y = w.y; this.clamp(); this.dirty = true; }
  // ----- input
  local(e) { const r = this.cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  down(e) {
    this.cv.setPointerCapture?.(e.pointerId);
    const p = this.local(e);
    this.ptrs.set(e.pointerId, p);
    if (this.ptrs.size === 1) {
      let mode = 'pan';
      if (this.ghost) { const t = this.tileAtScreen(p.x, p.y); const s = BUILDINGS[this.ghost.type].size; if (t.fi >= this.ghost.x - 1 && t.fi < this.ghost.x + s + 1 && t.fj >= this.ghost.y - 1 && t.fj < this.ghost.y + s + 1) mode = 'ghost'; }
      this.drag = { mode, start: p, last: p, t0: performance.now(), moved: 0, gOff: this.ghost ? { di: this.ghost.x - this.tileAtScreen(p.x, p.y).fi, dj: this.ghost.y - this.tileAtScreen(p.x, p.y).fj } : null };
    } else if (this.ptrs.size === 2) {
      const [a, b] = [...this.ptrs.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: this.cam.z };
      if (this.drag) this.drag.moved = 99; // a pinch is never a tap
    }
  }
  move(e) {
    if (!this.ptrs.has(e.pointerId)) return;
    const p = this.local(e);
    this.ptrs.set(e.pointerId, p);
    if (this.ptrs.size >= 2 && this.pinch) {
      const [a, b] = [...this.ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      this.zoomAt(mid.x, mid.y, (this.pinch.z * d / this.pinch.d) / this.cam.z);
      return;
    }
    const d = this.drag;
    if (!d) return;
    d.moved = Math.max(d.moved, Math.hypot(p.x - d.start.x, p.y - d.start.y));
    if (d.mode === 'ghost') {
      const t = this.tileAtScreen(p.x, p.y);
      const nx = Math.round(t.fi + d.gOff.di), ny = Math.round(t.fj + d.gOff.dj);
      if (nx !== this.ghost.x || ny !== this.ghost.y) { this.hooks.onGhostMove?.(nx, ny); this.dirty = true; }
    } else if (d.moved > 6) {
      this.cam.x -= (p.x - d.last.x) / this.cam.z; this.cam.y -= (p.y - d.last.y) / this.cam.z; this.clamp(); this.dirty = true;
    }
    d.last = p;
  }
  up(e, cancel) {
    const p = this.ptrs.get(e.pointerId);
    this.ptrs.delete(e.pointerId);
    if (this.ptrs.size < 2) this.pinch = null;
    const d = this.drag;
    if (this.ptrs.size === 0) this.drag = null;
    if (cancel || !d || !p || this.ptrs.size > 0) return;
    if (d.moved < 10 && performance.now() - d.t0 < 600) this.tap(p.x, p.y);
  }
  tap(sx, sy) {
    for (const b of this.hitBubbles) if (Math.hypot(sx - b.x, sy - b.y) < b.r + 6) return this.hooks.onTap({ kind: 'bubble', id: b.id, sx, sy });
    if (this.ghost) return this.hooks.onTap({ kind: 'ghostTap', sx, sy, ...this.tileAtScreen(sx, sy) });
    const t = this.tileAtScreen(sx, sy);
    const st = this.hooks.getState();
    // footprint hit first, then tall sprite boxes (front-most first)
    const fp = this.items(st).find((it) => it.id !== this.hidden && t.i >= it.x && t.i < it.x + it.s && t.j >= it.y && t.j < it.y + it.s);
    if (fp) return this.hooks.onTap({ kind: fp.kind, id: fp.id, sx, sy });
    const boxes = this.lastBoxes || [];
    for (let k = boxes.length - 1; k >= 0; k--) { const bx = boxes[k]; if (sx >= bx.x && sx <= bx.x + bx.w && sy >= bx.y && sy <= bx.y + bx.h * 0.8) return this.hooks.onTap({ kind: bx.kind, id: bx.id, sx, sy }); }
    this.hooks.onTap({ kind: 'ground', i: t.i, j: t.j, sx, sy });
  }
  items(st) {
    const out = [];
    for (const b of st.base.buildings) out.push({ kind: 'building', id: b.id, x: b.x, y: b.y, s: BUILDINGS[b.t].size, ref: b });
    for (const o of st.base.obstacles) out.push({ kind: 'obstacle', id: o.id, x: o.x, y: o.y, s: OBSTACLES[o.t].size, ref: o });
    return out;
  }
  // ----- drawing
  frame(ts) {
    if (this.dead) return;
    this.raf = requestAnimationFrame(this.frame.bind(this));
    if (!this.dirty && !this.anim) return;
    if (!this.dirty && ts - (this.lastDraw || 0) < 40) return; // idle animation (bubbles, timers) capped ~25fps
    this.lastDraw = ts;
    this.dirty = false;
    this.draw(ts);
  }
  draw(ts = performance.now()) {
    const st = this.hooks.getState();
    if (!st) return;
    const g = this.g, dpr = this.dpr, z = this.cam.z;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#0a0908'; g.fillRect(0, 0, this.w, this.h);
    // world transform
    g.setTransform(dpr * z, 0, 0, dpr * z, dpr * (this.w / 2 - this.cam.x * z), dpr * (this.h / 2 - this.cam.y * z));
    const ground = buildGround(st.base.seed);
    g.imageSmoothingEnabled = true;
    g.drawImage(ground, -N * TW / 2, 0, N * TW, (N * TH) + 40 / GS);
    // footprint highlights
    if (this.sel && !this.ghost) { const it = this.items(st).find((x) => x.id === this.sel); if (it) this.diamond(it.x, it.y, it.s, 'rgba(255,214,120,0.18)', 'rgba(255,214,120,0.9)'); }
    if (this.ghost) {
      const s = BUILDINGS[this.ghost.type].size;
      this.diamond(this.ghost.x, this.ghost.y, s, this.ghost.ok ? 'rgba(95,200,90,0.35)' : 'rgba(220,60,50,0.4)', this.ghost.ok ? '#7fe06a' : '#ff5a4e');
    }
    // sprites (painter's order: back to front)
    const list = this.items(st).filter((it) => it.id !== this.hidden);
    if (this.ghost) list.push({ kind: 'ghost', id: '__ghost', x: this.ghost.x, y: this.ghost.y, s: BUILDINGS[this.ghost.type].size, ref: { t: this.ghost.type, lv: this.ghost.lv || 1 } });
    list.sort((a, b) => (a.x + a.y + a.s * 2) - (b.x + b.y + b.s * 2) || (a.x - a.y) - (b.x - b.y));
    const boxes = [];
    const over = []; // bars, bubbles, labels drawn after sprites
    const now = this.hooks.now();
    for (const it of list) {
      const isB = it.kind === 'building' || it.kind === 'ghost';
      const type = it.ref.t;
      const lv = isB ? Math.max(1, it.ref.lv) : 1;
      const name = isB ? spriteFor(type, lv) : type;
      const im = imgs[name];
      const tw = SPR[name] || { w: 1 };
      const bottom = tileToWorld(it.x + it.s, it.y + it.s);
      const w = it.s * TW * tw.w * (isB ? 1 + Math.min(0.08, 0.01 * (lv - 1)) : 1);
      const h = im && im.naturalWidth ? im.naturalHeight * w / im.naturalWidth : w;
      const x = bottom.x - w / 2, y = bottom.y - h + (tw.dy || 0) * TH * it.s;
      { const sc = this.toScreen(x, y); if (sc.x > this.w + 20 || sc.y > this.h + 30 || sc.x + w * z < -20 || sc.y + h * z < -60) continue; } // off screen
      // contact shadow
      g.save();
      g.globalAlpha = 0.35; g.fillStyle = '#000';
      g.beginPath(); g.ellipse(bottom.x + 4, bottom.y - it.s * TH * 0.5, it.s * TW * 0.42, it.s * TH * 0.4, 0, 0, Math.PI * 2); g.fill();
      g.restore();
      g.save();
      if (it.kind === 'ghost') g.globalAlpha = 0.8;
      else if (isB && it.ref.lv === 0) g.globalAlpha = 0.5;
      if (isB && lv >= 7 && it.kind !== 'ghost') { g.shadowColor = 'rgba(255,190,70,0.75)'; g.shadowBlur = 16; }
      else if (isB && lv >= 4 && it.kind !== 'ghost') { g.shadowColor = 'rgba(255,120,60,0.45)'; g.shadowBlur = 10; }
      if (im && im.complete && im.naturalWidth) g.drawImage(im, x, y, w, h);
      else { g.fillStyle = '#3a2e26'; g.fillRect(x, y + h * 0.4, w, h * 0.6); }
      g.restore();
      if (it.kind !== 'ghost') {
        const sc = this.toScreen(x, y);
        boxes.push({ kind: it.kind, id: it.id, x: sc.x, y: sc.y, w: w * z, h: h * z });
      }
      const top = { x: bottom.x, y };
      over.push({ it, top, bottom, isB, lv });
    }
    this.lastBoxes = boxes;
    // overlays in screen space
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // dusk grade: warm from the top-left, cold in the shadows
    const grd = g.createLinearGradient(0, 0, this.w, this.h);
    grd.addColorStop(0, 'rgba(255,140,60,0.10)'); grd.addColorStop(0.5, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(30,40,90,0.22)');
    g.fillStyle = grd; g.fillRect(0, 0, this.w, this.h);
    const vg = g.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.45, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = vg; g.fillRect(0, 0, this.w, this.h);
    this.hitBubbles = [];
    let animating = false;
    for (const o of over) {
      const { it, top, bottom, isB, lv } = o;
      const ref = it.ref;
      const sTop = this.toScreen(top.x, top.y);
      const sBot = this.toScreen(bottom.x, bottom.y - it.s * TH * 0.5);
      const job = ref.job || ref.clr;
      if (job && it.kind !== 'ghost') {
        animating = true;
        const p = Math.max(0, Math.min(1, 1 - (job.endsAt - now) / (job.total * 1000)));
        const bw = Math.max(46, it.s * 26 * Math.min(1.2, z + 0.2)), bx = sBot.x - bw / 2, by = sBot.y + 6;
        g.fillStyle = 'rgba(0,0,0,0.75)'; this.rr(bx - 2, by - 2, bw + 4, 12, 4); g.fill();
        g.fillStyle = it.kind === 'obstacle' ? '#c9a24a' : '#e0a526'; this.rr(bx, by, bw * p, 8, 3); g.fill();
        g.font = '600 11px Oswald, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#fff';
        g.fillText(`${it.kind === 'obstacle' ? '🪓' : '🔨'} ${fmtDur((job.endsAt - now) / 1000)}`, sBot.x, by + 22);
      }
      if (isB && it.kind !== 'ghost' && ref.lv > 0 && ((z > 0.95 && ref.t !== 'wall') || it.id === this.sel)) {
        // level plate
        g.font = '700 10px Oswald, sans-serif'; g.textAlign = 'center';
        const lx = sBot.x + it.s * 14 * z, ly = sBot.y - 2;
        g.fillStyle = lv >= 7 ? '#e0a526' : lv >= 4 ? '#b52a26' : 'rgba(20,16,14,0.9)';
        this.rr(lx - 9, ly - 8, 18, 14, 3); g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 1; g.stroke();
        g.fillStyle = lv >= 7 ? '#1a1200' : '#fff'; g.fillText(String(ref.lv), lx, ly + 3);
      }
      if (it.id === this.sel && it.kind !== 'ghost') {
        g.font = '600 13px Oswald, sans-serif'; g.textAlign = 'center';
        const label = isB ? `${BUILDINGS[ref.t].name}${ref.lv ? ' · Lv ' + ref.lv : ''}` : OBSTACLES[ref.t].name;
        const tw2 = g.measureText(label).width + 14;
        g.fillStyle = 'rgba(10,8,8,0.85)'; this.rr(sTop.x - tw2 / 2, sTop.y - 24, tw2, 20, 5); g.fill();
        g.fillStyle = '#ffd98a'; g.fillText(label, sTop.x, sTop.y - 10);
      }
      // collect bubbles
      const bub = isB && it.kind !== 'ghost' ? this.hooks.bubble?.(ref) : null;
      if (bub) {
        const bob = Math.sin(now / 300 + it.x) * 3;
        const r = Math.round(10 + 5 * Math.min(1, z)), bx = sTop.x, by = Math.max(18, sTop.y + 4 + bob);
        animating = true;
        g.save();
        g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 6;
        g.fillStyle = bub.full ? '#7a1d18' : '#f3e7c9';
        g.beginPath(); g.arc(bx, by, r, 0, Math.PI * 2); g.fill();
        g.restore();
        g.strokeStyle = bub.res === 'cash' ? '#e0a526' : '#ff8a7a'; g.lineWidth = 2.5; g.beginPath(); g.arc(bx, by, r, 0, Math.PI * 2); g.stroke();
        g.font = `${Math.round(r * 1.05)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(bub.res === 'cash' ? '💰' : '🐾', bx, by + 1);
        g.textBaseline = 'alphabetic';
        this.hitBubbles.push({ id: it.id, x: bx, y: by, r: Math.max(r, 15) });
      }
    }
    this.anim = animating ? 1 : 0;
  }
  diamond(x, y, s, fill, stroke) {
    const g = this.g;
    const a = tileToWorld(x, y), b = tileToWorld(x + s, y), c = tileToWorld(x + s, y + s), d = tileToWorld(x, y + s);
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c.x, c.y); g.lineTo(d.x, d.y); g.closePath();
    g.fillStyle = fill; g.fill(); g.lineWidth = 2 / this.cam.z; g.strokeStyle = stroke; g.stroke();
  }
  rr(x, y, w, h, r) { const g = this.g; g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
}

function fmtDur(sec) {
  sec = Math.max(0, Math.ceil(sec));
  if (sec < 60) return sec + 's';
  const m = Math.floor(sec / 60);
  if (m < 60) return m + 'm ' + (sec % 60) + 's';
  return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
}
