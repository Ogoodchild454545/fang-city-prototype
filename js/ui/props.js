// Location-pack prop art (Docklands extras, Velvet Den, Swamp Syndicate bayou, Iron Claw industrial,
// Grey Pack estate). Procedural canvas drawing in the same kit and lighting as the original yard
// (js/ui/yard.js), so every prop sits at the established scale (wolf 27 px, container 38 px) and
// works with the sprite cache, cutaway (t.__cut), fade and x-ray. Original art, no third-party assets.
import { Kit, CUT } from './yard.js';
import { propDef, isWreckId } from '../core/catalog.js';

const box = (...a) => Kit.box(...a);
const P = (...a) => Kit.P(...a);
const onFace = (...a) => Kit.onFace(...a);
const palOf = (...a) => Kit.palOf(...a);
const fillPts = (...a) => Kit.fillPts(...a);
const line = (...a) => Kit.line(...a);
const grime = (...a) => Kit.grime(...a);
const corrugate = (...a) => Kit.corrugate(...a);
const hash = (...a) => Kit.hash(...a);
const rng = (...a) => Kit.rng(...a);
const info = (t) => Kit.tileInfo(t);
const TAU = Math.PI * 2;

// ---------- cutaway-aware solid block ----------
function cutOf(t, H) {
  const ck = Math.max(0, Math.min(1, t.__cut || 0)), ce = ck * ck * (3 - 2 * ck);
  const Hc = ck > 0 ? H + (Math.min(CUT.STUBMAX, H * CUT.STUB) - H) * ce : H;
  return { Hc, ce, cut: ck > 0.02 };
}
// Draws a box that drops to a stub when cut, with a sliced top and a dashed ghost of the full shape.
// `deco(f)` paints the faces; it only runs when the block is (nearly) whole.
function solid(g, t, sx, sy, z, x0, y0, x1, y1, H, pal, deco, opt = {}) {
  const c = cutOf(t, H);
  const f = box(g, sx, sy, z, x0, y0, x1, y1, opt.h0 || 0, c.Hc, pal);
  if (c.cut) {
    fillPts(g, f.T, 'rgba(10,12,14,0.55)');
    g.strokeStyle = 'rgba(255,214,170,0.45)'; g.lineWidth = 0.9 * z;
    Kit.path(g, f.T); g.stroke();
    g.save(); g.globalAlpha *= 0.32 * c.ce; g.setLineDash([3 * z, 3 * z]); g.strokeStyle = '#f0e2c0'; g.lineWidth = 0.7 * z;
    const A = P(sx, sy, z, x0, y1, H), B = P(sx, sy, z, x1, y1, H), C = P(sx, sy, z, x1, y0, H), D = P(sx, sy, z, x0, y0, H);
    g.beginPath(); g.moveTo(D[0], D[1]); g.lineTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.lineTo(C[0], C[1]); g.lineTo(D[0], D[1]);
    for (const [xx, yy] of [[x0, y1], [x1, y1], [x1, y0]]) { const a = P(sx, sy, z, xx, yy, c.Hc), b = P(sx, sy, z, xx, yy, H); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }
    g.stroke(); g.restore();
  } else if (deco) deco(f);
  line(g, P(sx, sy, z, x0, y1, 0), P(sx, sy, z, x1, y1, 0), 'rgba(0,0,0,0.5)', 1.1 * z);
  return { f, cut: c.cut, Hc: c.Hc };
}
const rim = (g, sx, sy, z, x0, y1, x1, h, a = 0.28) => line(g, P(sx, sy, z, x0, y1, h), P(sx, sy, z, x1, y1, h), `rgba(255,214,170,${a})`, 0.8 * z);
function glow(g, x, y, r, col, a) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`);
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}
const NEON = { pink: '255,70,160', cyan: '70,220,255', amber: '255,170,60' };
export function neonCol(t) { return NEON[t.hue] || NEON.pink; }
const burnt = (wr, col) => (wr ? '#2a2420' : col);
function cylinder(g, sx, sy, z, dx, dy, rx, H, col, top, h0 = 0) {
  const p = P(sx, sy, z, dx, dy, h0), r = rx * z, ry = r * 0.5;
  const gr = g.createLinearGradient(p[0] - r, 0, p[0] + r, 0);
  const c = Kit.hex2(col);
  gr.addColorStop(0, Kit.rgb(c, 0.55)); gr.addColorStop(0.45, Kit.rgb(c, 1)); gr.addColorStop(1, Kit.rgb(c, 0.42));
  g.fillStyle = gr;
  g.beginPath(); g.ellipse(p[0], p[1], r, ry, 0, 0, Math.PI); g.lineTo(p[0] - r, p[1] - H * z); g.ellipse(p[0], p[1] - H * z, r, ry, 0, Math.PI, 0, true); g.closePath(); g.fill();
  g.fillStyle = top || Kit.rgb(c, 0.8); g.beginPath(); g.ellipse(p[0], p[1] - H * z, r, ry, 0, 0, TAU); g.fill();
  return p;
}

// ---------- Docklands extras ----------
function crane_base(g, t, sx, sy, z) {
  const pal = palOf('#b08a24', 0.95, 0.66, 0.48);
  box(g, sx, sy, z, -0.46, -0.46, 0.46, 0.46, 0, 4, palOf('#55524c'));
  solid(g, t, sx, sy, z, -0.3, -0.3, 0.3, 0.3, 48, pal, (f) => {
    for (const F of [f.L, f.R]) onFace(g, F, () => {
      g.strokeStyle = 'rgba(30,22,10,0.55)'; g.lineWidth = 0.03;
      for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(0, k / 4); g.lineTo(1, (k + 1) / 4); g.moveTo(1, k / 4); g.lineTo(0, (k + 1) / 4); g.stroke(); }
      for (let k = 0; k < 6; k++) { g.fillStyle = k % 2 ? 'rgba(20,20,20,0.75)' : 'rgba(220,180,40,0.8)'; g.fillRect(k / 6, 0.9, 1 / 6, 0.1); }
      grime(g, 0.05, 0.4);
    });
    rim(g, sx, sy, z, -0.3, 0.3, 0.3, 48);
  });
}
function forklift(g, t, sx, sy, z) {
  const pal = palOf(t.hue === 'orange' ? '#b8562a' : '#c49a24', 0.95, 0.68, 0.5);
  for (const [dx, dy] of [[-0.24, 0.2], [0.2, 0.2]]) { const w = P(sx, sy, z, dx, dy, 3); g.fillStyle = '#0d0d0f'; g.beginPath(); g.ellipse(w[0], w[1], 3.6 * z, 3.6 * z, 0, 0, TAU); g.fill(); }
  const f = box(g, sx, sy, z, -0.32, -0.22, 0.2, 0.22, 3, 12, pal);
  onFace(g, f.L, () => { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, 0.7, 1, 0.3); grime(g, 0.06, 0.4); });
  box(g, sx, sy, z, -0.34, -0.22, -0.2, 0.22, 3, 16, palOf('#3a3a3c'));
  // cage
  for (const [dx, dy] of [[-0.18, -0.2], [-0.18, 0.2], [0.14, -0.2], [0.14, 0.2]]) line(g, P(sx, sy, z, dx, dy, 12), P(sx, sy, z, dx, dy, 22), '#26262a', 1.2 * z);
  fillPts(g, [P(sx, sy, z, -0.2, -0.22, 22), P(sx, sy, z, 0.16, -0.22, 22), P(sx, sy, z, 0.16, 0.22, 22), P(sx, sy, z, -0.2, 0.22, 22)], 'rgba(30,30,32,0.9)');
  // mast + forks
  box(g, sx, sy, z, 0.22, -0.2, 0.28, 0.2, 2, 24, palOf('#3a3c3e'));
  box(g, sx, sy, z, 0.28, -0.16, 0.48, -0.1, 3, 4.5, palOf('#55575a'));
  box(g, sx, sy, z, 0.28, 0.1, 0.48, 0.16, 3, 4.5, palOf('#55575a'));
  const hl = P(sx, sy, z, 0.28, 0, 18); glow(g, hl[0], hl[1], 5 * z, '255,220,150', 0.7);
}
function warehouse(g, t, sx, sy, z) {
  const col = { blue: '#3a5068', rust: '#7a3e28', grey: '#5c6064' }[t.hue] || '#3a5068';
  const pal = palOf(col, 0.9, 0.66, 0.48);
  solid(g, t, sx, sy, z, -0.48, -0.42, 1.48, 0.42, 44, pal, (f) => {
    onFace(g, f.L, () => {
      corrugate(g, 22, 0.08, 0.95, 0.9);
      g.fillStyle = '#26282a'; g.fillRect(0.2, 0.35, 0.36, 0.65); // roller door
      for (let k = 0; k < 9; k++) { g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(0.2, 0.37 + k * 0.07, 0.36, 0.015); }
      g.fillStyle = 'rgba(210,170,40,0.75)'; g.fillRect(0.2, 0.32, 0.36, 0.03);
      g.fillStyle = 'rgba(255,200,120,0.55)'; g.fillRect(0.7, 0.25, 0.16, 0.14);
      Kit.rust(g, rng(hash(info(t).x, info(t).y, 3) * 1e9), 2);
      grime(g, 0.05, 0.4);
    });
    onFace(g, f.R, () => { corrugate(g, 8, 0.08, 0.95, 0.9); grime(g, 0.05, 0.4); });
    // roof lip + bay lamp
    rim(g, sx, sy, z, -0.48, 0.42, 1.48, 44, 0.3);
    const lp = P(sx, sy, z, 0.25, 0.42, 34); g.fillStyle = '#222'; g.fillRect(lp[0] - 3 * z, lp[1] - 1.5 * z, 6 * z, 2.5 * z);
    glow(g, lp[0], lp[1] + 2 * z, 14 * z, '255,210,140', 0.5);
  });
}
function fish_stall(g, t, sx, sy, z) {
  const aw = { red: '#9a2a24', blue: '#2a4a7a', green: '#2a6a42' }[t.hue] || '#9a2a24';
  const tbl = palOf('#6a6660', 0.95, 0.7, 0.5);
  box(g, sx, sy, z, -0.4, -0.3, 0.4, 0.3, 0, 10, tbl);
  // ice + fish on top
  fillPts(g, [P(sx, sy, z, -0.36, -0.26, 10.2), P(sx, sy, z, 0.36, -0.26, 10.2), P(sx, sy, z, 0.36, 0.26, 10.2), P(sx, sy, z, -0.36, 0.26, 10.2)], '#b8c8cc');
  for (let i = 0; i < 6; i++) { const p = P(sx, sy, z, -0.25 + (i % 3) * 0.24, -0.12 + Math.floor(i / 3) * 0.22, 11); g.fillStyle = i % 2 ? '#7a8a96' : '#a49070'; g.beginPath(); g.ellipse(p[0], p[1], 4 * z, 1.4 * z, -0.45, 0, TAU); g.fill(); }
  for (const [dx, dy] of [[-0.42, -0.32], [0.42, -0.32], [-0.42, 0.32], [0.42, 0.32]]) line(g, P(sx, sy, z, dx, dy, 0), P(sx, sy, z, dx, dy, 24), '#2a2a2c', 1 * z);
  // striped awning
  const A = [P(sx, sy, z, -0.46, -0.38, 25), P(sx, sy, z, 0.46, -0.38, 25), P(sx, sy, z, 0.46, 0.4, 21), P(sx, sy, z, -0.46, 0.4, 21)];
  fillPts(g, A, aw);
  g.save(); Kit.path(g, A); g.clip();
  for (let k = 0; k < 5; k++) { const a = P(sx, sy, z, -0.46 + k * 0.2 + 0.05, -0.38, 25), b = P(sx, sy, z, -0.46 + k * 0.2 + 0.05, 0.4, 21); line(g, a, b, 'rgba(230,226,214,0.55)', 4 * z); }
  g.restore();
  const bl = P(sx, sy, z, 0, 0.1, 19); glow(g, bl[0], bl[1], 12 * z, '255,240,210', 0.35);
}
function ice_box(g, t, sx, sy, z) {
  const cols = ['#d8d8d0', '#3a6a9a', '#c8c2b0'];
  for (const [dx, dy, k] of [[-0.18, -0.14, 0], [0.18, -0.14, 1], [-0.18, 0.16, 2], [0.18, 0.16, 0]]) {
    const pal = palOf(cols[(k + info(t).x) % 3], 0.95, 0.72, 0.55);
    const f = box(g, sx, sy, z, dx - 0.16, dy - 0.13, dx + 0.16, dy + 0.13, 0, 6, pal);
    onFace(g, f.L, () => { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0.3, 0.2, 0.4, 0.2); });
    if (k === 0) box(g, sx, sy, z, dx - 0.15, dy - 0.12, dx + 0.15, dy + 0.12, 6, 11.5, palOf(cols[1], 0.95, 0.72, 0.55));
  }
}
function bollard(g, t, sx, sy, z) {
  const pal = palOf('#3a3a3c', 1, 0.75, 0.55);
  box(g, sx, sy, z, -0.1, -0.1, 0.1, 0.1, 0, 7, pal);
  const c = P(sx, sy, z, 0, 0, 7);
  g.fillStyle = '#2a2a2c'; g.beginPath(); g.ellipse(c[0], c[1], 6 * z, 3 * z, 0, 0, TAU); g.fill();
  g.fillStyle = '#c8a030'; g.fillRect(c[0] - 4.5 * z, c[1] + 2.5 * z, 9 * z, 1.2 * z);
}

// ---------- Velvet Den ----------
function neon_shop(g, t, sx, sy, z) {
  const nc = neonCol(t);
  const pal = palOf('#3a3440', 0.9, 0.66, 0.48);
  solid(g, t, sx, sy, z, -0.48, -0.4, 1.48, 0.4, 42, pal, (f) => {
    onFace(g, f.L, () => {
      // brick-ish upper storey, shop window below
      g.fillStyle = 'rgba(0,0,0,0.18)';
      for (let k = 0; k < 8; k++) g.fillRect(0, 0.05 + k * 0.055, 1, 0.008);
      g.fillStyle = '#141018'; g.fillRect(0.05, 0.5, 0.9, 0.5);
      const gl = g.createLinearGradient(0, 0.5, 0, 1);
      gl.addColorStop(0, `rgba(${nc},0.35)`); gl.addColorStop(1, `rgba(${nc},0.08)`);
      g.fillStyle = gl; g.fillRect(0.08, 0.53, 0.55, 0.42);
      g.fillStyle = '#0a080c'; g.fillRect(0.68, 0.55, 0.22, 0.45); // door
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0.355, 0.53, 0.01, 0.42);
      // fascia sign
      g.fillStyle = '#100c14'; g.fillRect(0.05, 0.38, 0.9, 0.1);
      g.fillStyle = `rgba(${nc},0.95)`; g.fillRect(0.12, 0.415, 0.76, 0.03);
      g.fillStyle = `rgba(${nc},0.35)`; g.fillRect(0.09, 0.39, 0.82, 0.08);
      // lit flat windows above
      for (const u of [0.15, 0.45, 0.75]) { g.fillStyle = hash(info(t).x, u * 10) > 0.4 ? 'rgba(255,200,120,0.5)' : 'rgba(20,24,30,0.9)'; g.fillRect(u, 0.12, 0.12, 0.14); }
      grime(g, 0.04, 0.35);
    });
    onFace(g, f.R, () => { g.fillStyle = 'rgba(0,0,0,0.15)'; for (let k = 0; k < 8; k++) g.fillRect(0, 0.05 + k * 0.055, 1, 0.008); grime(g, 0.04, 0.4); });
    const s = P(sx, sy, z, 0.5, 0.42, 24); glow(g, s[0], s[1], 26 * z, nc, 0.28);
    rim(g, sx, sy, z, -0.48, 0.4, 1.48, 42, 0.22);
  });
}
function sedan(g, t, sx, sy, z) {
  const wr = isWreckId(t.decor);
  const col = burnt(wr, { red: '#8a2a26', black: '#26262c', taxi: '#c49a24', blue: '#2c4a72' }[t.hue] || '#8a2a26');
  const pal = palOf(col, 1.0, 0.7, 0.5);
  const y0 = -0.3, y1 = 0.3;
  for (const x of [-0.05, 1.05]) { const w = P(sx, sy, z, x, y1, 3); g.fillStyle = '#0c0c0e'; g.beginPath(); g.ellipse(w[0], w[1], 3.8 * z, 3.8 * z, 0, 0, TAU); g.fill(); g.fillStyle = wr ? '#2a1a12' : '#5a5c60'; g.beginPath(); g.ellipse(w[0], w[1], 1.5 * z, 1.5 * z, 0, 0, TAU); g.fill(); }
  const f = box(g, sx, sy, z, -0.36, y0, 1.36, y1, 3, wr ? 9 : 10, pal);
  onFace(g, f.L, () => { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, 0.75, 1, 0.25); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, 0.1, 1, 0.08); if (t.hue === 'taxi' && !wr) { g.fillStyle = 'rgba(20,20,20,0.7)'; for (let k = 0; k < 8; k++) if (k % 2) g.fillRect(k / 8, 0.35, 1 / 8, 0.12); } grime(g, 0.05, 0.4); });
  // cabin
  const c = box(g, sx, sy, z, 0.0, y0 + 0.04, 0.95, y1 - 0.04, wr ? 9 : 10, wr ? 13 : 16, palOf(wr ? '#1c1816' : col, 0.95, 0.7, 0.5));
  const glass = wr ? 'rgba(8,6,6,0.95)' : 'rgba(40,58,78,0.92)';
  onFace(g, c.L, () => { g.fillStyle = glass; g.fillRect(0.06, 0.1, 0.4, 0.75); g.fillRect(0.52, 0.1, 0.42, 0.75); });
  onFace(g, c.R, () => { g.fillStyle = glass; g.fillRect(0.08, 0.1, 0.84, 0.75); });
  if (wr) { const p = P(sx, sy, z, 0.5, 0, 12); glow(g, p[0], p[1], 10 * z, '255,110,40', 0.25); return; }
  if (t.hue === 'taxi') box(g, sx, sy, z, 0.4, -0.06, 0.55, 0.06, 16, 18.5, palOf('#e8d8a0'));
  line(g, P(sx, sy, z, -0.36, y1, 10), P(sx, sy, z, 1.36, y1, 10), 'rgba(255,220,180,0.35)', 0.8 * z);
  const hl = P(sx, sy, z, 1.38, 0, 6); glow(g, hl[0], hl[1], 7 * z, '255,240,200', 0.55);
  const tl = P(sx, sy, z, -0.38, 0.2, 7); glow(g, tl[0], tl[1], 4 * z, '255,40,30', 0.6);
}
function dumpster(g, t, sx, sy, z) {
  const pal = palOf(t.hue === 'blue' ? '#2a4a6a' : '#2e5a3a', 0.9, 0.66, 0.48);
  const f = box(g, sx, sy, z, -0.42, -0.3, 0.42, 0.3, 1, 16, pal);
  onFace(g, f.L, () => { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, 0, 1, 0.12); g.fillStyle = 'rgba(230,226,214,0.35)'; g.fillRect(0.3, 0.4, 0.4, 0.12); Kit.rust(g, rng(hash(info(t).x, info(t).y) * 1e9), 2); grime(g, 0.05, 0.45); });
  onFace(g, f.R, () => grime(g, 0.05, 0.45));
  // lids, one propped open
  fillPts(g, [P(sx, sy, z, -0.44, -0.32, 16), P(sx, sy, z, 0, -0.32, 16), P(sx, sy, z, 0, 0.32, 17), P(sx, sy, z, -0.44, 0.32, 17)], '#1c1e20');
  fillPts(g, [P(sx, sy, z, 0, -0.32, 16), P(sx, sy, z, 0.44, -0.32, 22), P(sx, sy, z, 0.44, 0.32, 22), P(sx, sy, z, 0, 0.32, 16)], '#26282a');
  for (const [dx, dy, c] of [[0.2, -0.05, '#3a3a2e'], [0.28, 0.12, '#2a2a30']]) { const p = P(sx, sy, z, dx, dy, 17); g.fillStyle = c; g.beginPath(); g.arc(p[0], p[1], 3 * z, 0, TAU); g.fill(); }
}
function bin(g, t, sx, sy, z) {
  const col = { black: '#2a2a2e', green: '#2e5a34', blue: '#2a4a7a' }[t.hue] || '#2a2a2e';
  for (const [dx, dy, c] of [[-0.18, -0.08, col], [0.16, 0.1, t.hue === 'black' ? '#5a4a2a' : '#2a2a2e']]) {
    const pal = palOf(c, 1, 0.7, 0.5);
    const f = box(g, sx, sy, z, dx - 0.14, dy - 0.15, dx + 0.14, dy + 0.15, 0, 14, pal);
    onFace(g, f.L, () => { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, 0, 1, 0.1); grime(g, 0.05, 0.4); });
    box(g, sx, sy, z, dx - 0.16, dy - 0.17, dx + 0.16, dy + 0.17, 14, 15.5, palOf(c, 0.85, 0.6, 0.45));
  }
  const p = P(sx, sy, z, 0.36, 0.3, 0); g.fillStyle = '#1a1a1c'; g.beginPath(); g.ellipse(p[0], p[1] - 2 * z, 4 * z, 2.5 * z, 0.3, 0, TAU); g.fill();
}
function booth(g, t, sx, sy, z) {
  const pal = palOf(t.hue === 'purple' ? '#4a2a5a' : '#6a1a24', 1, 0.7, 0.5);
  box(g, sx, sy, z, -0.42, -0.4, 0.42, 0.22, 0, 6, pal);
  const back = box(g, sx, sy, z, -0.42, -0.42, 0.42, -0.24, 6, 13, pal);
  onFace(g, back.L, () => { g.fillStyle = 'rgba(255,255,255,0.08)'; for (let k = 0; k < 5; k++) g.fillRect(k / 5 + 0.02, 0.1, 0.01, 0.8); });
  box(g, sx, sy, z, -0.2, 0.0, 0.2, 0.34, 0, 9, palOf('#2a2420'));
  const p = P(sx, sy, z, 0, 0.17, 10); glow(g, p[0], p[1], 6 * z, '255,190,120', 0.45);
}
function speakers(g, t, sx, sy, z) {
  const pal = palOf('#1c1c20', 1.3, 1, 0.8);
  for (const [h0, h1] of [[0, 12], [12, 25]]) {
    const f = box(g, sx, sy, z, -0.28, -0.24, 0.28, 0.24, h0, h1, pal);
    onFace(g, f.R, () => { g.fillStyle = '#08080a'; for (const v of [0.3, 0.72]) { g.beginPath(); g.ellipse(0.5, v, 0.26, 0.2, 0, 0, TAU); g.fill(); } g.fillStyle = 'rgba(160,160,170,0.25)'; g.beginPath(); g.ellipse(0.5, 0.3, 0.08, 0.06, 0, 0, TAU); g.fill(); });
  }
  const p = P(sx, sy, z, 0.28, 0, 27); glow(g, p[0], p[1], 4 * z, '80,220,255', 0.7);
}
function neon_sign(g, t, sx, sy, z) {
  const nc = neonCol(t);
  box(g, sx, sy, z, -0.05, -0.05, 0.05, 0.05, 0, 30, palOf('#2a2a2e', 1.2, 0.9, 0.7));
  const f = box(g, sx, sy, z, -0.04, -0.3, 0.04, 0.3, 28, 46, palOf('#141018', 1.2, 1, 0.8));
  onFace(g, f.R, () => {
    g.strokeStyle = `rgba(${nc},0.95)`; g.lineWidth = 0.05; g.strokeRect(0.12, 0.15, 0.76, 0.7);
    g.fillStyle = `rgba(${nc},0.9)`; g.fillRect(0.25, 0.4, 0.5, 0.08); g.fillRect(0.3, 0.58, 0.4, 0.06);
  });
  const c = P(sx, sy, z, 0, 0, 38); glow(g, c[0], c[1], 22 * z, nc, 0.35);
}
function phone_box(g, t, sx, sy, z) {
  const pal = palOf('#8a1e1a', 0.95, 0.66, 0.48);
  const f = box(g, sx, sy, z, -0.24, -0.24, 0.24, 0.24, 0, 38, pal);
  for (const F of [f.L, f.R]) onFace(g, F, () => {
    g.fillStyle = 'rgba(255,230,180,0.28)';
    for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) g.fillRect(0.18 + c * 0.34, 0.2 + r * 0.17, 0.28, 0.13);
    g.fillStyle = 'rgba(230,226,214,0.7)'; g.fillRect(0.15, 0.06, 0.7, 0.06);
    grime(g, 0.04, 0.3);
  });
  box(g, sx, sy, z, -0.27, -0.27, 0.27, 0.27, 38, 41, palOf('#7a1a16'));
  const c = P(sx, sy, z, 0, 0, 25); glow(g, c[0], c[1], 12 * z, '255,220,160', 0.3);
}
function planter(g, t, sx, sy, z) {
  const f = box(g, sx, sy, z, -0.4, -0.3, 0.4, 0.3, 0, 9, palOf('#6a6660', 0.95, 0.7, 0.5));
  onFace(g, f.L, () => grime(g, 0.04, 0.4));
  for (let i = 0; i < 7; i++) { const p = P(sx, sy, z, -0.3 + (i % 4) * 0.2, -0.14 + Math.floor(i / 4) * 0.26, 11); g.fillStyle = i % 2 ? '#2a4a26' : '#36582e'; g.beginPath(); g.arc(p[0], p[1], 4.2 * z, 0, TAU); g.fill(); }
}
function rope(g, t, sx, sy, z) {
  for (const dx of [-0.38, 0.38]) {
    box(g, sx, sy, z, dx - 0.04, -0.04, dx + 0.04, 0.04, 0, 13, palOf('#b8a060', 1.1, 0.8, 0.6));
    const p = P(sx, sy, z, dx, 0, 14); g.fillStyle = '#e0c870'; g.beginPath(); g.arc(p[0], p[1], 1.6 * z, 0, TAU); g.fill();
  }
  const a = P(sx, sy, z, -0.38, 0, 12), b = P(sx, sy, z, 0.38, 0, 12);
  g.strokeStyle = '#8a1a2a'; g.lineWidth = 1.6 * z; g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 5 * z, b[0], b[1]); g.stroke();
}

// ---------- Swamp Syndicate bayou ----------
function stilt_shack(g, t, sx, sy, z) {
  const tin = t.hue !== 'plank';
  const pal = palOf(tin ? '#5a5048' : '#5e4630', 0.9, 0.64, 0.46);
  // stilts (visible under the floor)
  for (const [dx, dy] of [[-0.42, -0.36], [1.42, -0.36], [-0.42, 0.36], [1.42, 0.36], [0.5, 0.36]]) box(g, sx, sy, z, dx - 0.04, dy - 0.04, dx + 0.04, dy + 0.04, -4, 8, palOf('#3a2c1e'));
  box(g, sx, sy, z, -0.48, -0.42, 1.48, 0.42, 8, 10, palOf('#4a3826'));
  const c = cutOf(t, 44);
  solid(g, t, sx, sy, z, -0.42, -0.36, 1.42, 0.36, 44, pal, (f) => {
    onFace(g, f.L, () => {
      if (tin) corrugate(g, 18, 0.25, 0.95, 0.8); else { g.fillStyle = 'rgba(0,0,0,0.25)'; for (let k = 0; k < 14; k++) g.fillRect(k / 14, 0.25, 0.006, 0.75); }
      g.fillStyle = '#16120e'; g.fillRect(0.12, 0.45, 0.16, 0.55); // door
      g.fillStyle = 'rgba(255,190,90,0.6)'; g.fillRect(0.55, 0.45, 0.14, 0.16); // lit window
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0.615, 0.45, 0.01, 0.16);
      Kit.rust(g, rng(hash(info(t).x, info(t).y, 7) * 1e9), 3);
      grime(g, 0.04, 0.5);
    });
    onFace(g, f.R, () => { if (tin) corrugate(g, 7, 0.25, 0.95, 0.8); grime(g, 0.04, 0.5); });
    // pitched tin roof
    const R = [P(sx, sy, z, -0.5, -0.44, 44), P(sx, sy, z, 1.5, -0.44, 44), P(sx, sy, z, 1.5, 0, 52), P(sx, sy, z, -0.5, 0, 52)];
    const R2 = [P(sx, sy, z, -0.5, 0, 52), P(sx, sy, z, 1.5, 0, 52), P(sx, sy, z, 1.5, 0.44, 44), P(sx, sy, z, -0.5, 0.44, 44)];
    fillPts(g, R, '#4a3a30'); fillPts(g, R2, '#6a4a34');
    const lp = P(sx, sy, z, 0.6, 0.42, 30); glow(g, lp[0], lp[1], 16 * z, '255,180,80', 0.35);
  }, { h0: 10 });
  void c;
}
function rusty_boat(g, t, sx, sy, z) {
  const pal = palOf(t.hue === 'green' ? '#2e4a36' : '#6a3a24', 0.95, 0.68, 0.5);
  const hullL = [P(sx, sy, z, -0.4, 0.3, 0), P(sx, sy, z, 1.2, 0.3, 0), P(sx, sy, z, 1.5, 0, 6), P(sx, sy, z, 1.2, 0.34, 12), P(sx, sy, z, -0.42, 0.34, 12)];
  const f = box(g, sx, sy, z, -0.42, -0.3, 1.2, 0.3, 0, 12, pal);
  fillPts(g, [P(sx, sy, z, 1.2, -0.3, 0), P(sx, sy, z, 1.55, 0, 3), P(sx, sy, z, 1.2, 0.3, 0), P(sx, sy, z, 1.2, 0.3, 12), P(sx, sy, z, 1.6, 0, 13), P(sx, sy, z, 1.2, -0.3, 12)], Kit.rgb(pal.c, 0.6));
  onFace(g, f.L, () => { Kit.rust(g, rng(hash(info(t).x, 4) * 1e9), 4); g.fillStyle = 'rgba(230,220,190,0.3)'; g.fillRect(0.1, 0.25, 0.25, 0.1); grime(g, 0.05, 0.5); });
  fillPts(g, f.T, '#1e1a16');
  box(g, sx, sy, z, -0.1, -0.2, 0.4, 0.2, 12, 20, palOf('#7a756a', 0.95, 0.7, 0.5));
  const o = P(sx, sy, z, -0.42, 0, 10); g.fillStyle = '#222'; g.fillRect(o[0] - 3 * z, o[1] - 3 * z, 4 * z, 8 * z);
  void hullL;
}
function linkArms(t) { const c = info(t).conn || {}; const any = c.N || c.S || c.E || c.W; return any ? c : { E: 1, W: 1 }; }
function gator_fence(g, t, sx, sy, z) {
  const c = linkArms(t), H = 24;
  const post = palOf('#4a3a28', 1, 0.75, 0.55);
  box(g, sx, sy, z, -0.05, -0.05, 0.05, 0.05, 0, H, post);
  const arms = [];
  if (c.E) arms.push([0.5, 0]); if (c.W) arms.push([-0.5, 0]); if (c.N) arms.push([0, -0.5]); if (c.S) arms.push([0, 0.5]);
  for (const [ax, ay] of arms) {
    for (const h of [6, 13, 20]) line(g, P(sx, sy, z, 0, 0, h), P(sx, sy, z, ax, ay, h), 'rgba(150,150,140,0.75)', 0.7 * z);
    line(g, P(sx, sy, z, ax * 0.5, ay * 0.5, 0), P(sx, sy, z, ax * 0.5, ay * 0.5, H - 3), '#3a2c1e', 1.4 * z);
  }
  if (hash(info(t).x, info(t).y, 5) < 0.3) { const p = P(sx, sy, z, 0.04, 0.04, 16); g.fillStyle = '#c8b030'; g.fillRect(p[0] - 3 * z, p[1] - 2 * z, 6 * z, 4 * z); }
}
function reeds(g, t, sx, sy, z) {
  const r = rng(hash(info(t).x, info(t).y, 11) * 1e9);
  for (let i = 0; i < 26; i++) {
    const dx = (r() - 0.5) * 0.8, dy = (r() - 0.5) * 0.8, h = 12 + r() * 13;
    const a = P(sx, sy, z, dx, dy, 0), b = P(sx, sy, z, dx + (r() - 0.5) * 0.12, dy, h);
    line(g, a, b, r() < 0.5 ? '#4a5a2a' : '#6a6a34', (0.8 + r() * 0.6) * z);
    if (r() < 0.25) { g.fillStyle = '#3a2a1a'; g.fillRect(b[0] - 0.9 * z, b[1], 1.8 * z, 4 * z); }
  }
}
function stump(g, t, sx, sy, z) {
  const p = cylinder(g, sx, sy, z, 0, 0, 11, 13, '#4a3a2a', '#6a5640');
  g.strokeStyle = 'rgba(40,28,18,0.7)'; g.lineWidth = 0.6 * z; for (const k of [0.3, 0.6]) { g.beginPath(); g.ellipse(p[0], p[1] - 13 * z, 11 * z * k, 5.5 * z * k, 0, 0, TAU); g.stroke(); }
  for (const a of [0.4, 2.6, 4.4]) { const q = [p[0] + Math.cos(a) * 12 * z, p[1] + Math.sin(a) * 5 * z]; line(g, [p[0] + Math.cos(a) * 8 * z, p[1] + Math.sin(a) * 3 * z - 3 * z], q, '#3a2c1e', 2.4 * z); }
}
function still(g, t, sx, sy, z) {
  const wr = isWreckId(t.decor);
  const p = cylinder(g, sx, sy, z, -0.08, 0, 9, wr ? 9 : 16, wr ? '#2a2420' : '#8a5a2a', wr ? '#120e0c' : '#a87040');
  if (wr) { glow(g, p[0], p[1] - 8 * z, 10 * z, '255,110,40', 0.3); return; }
  box(g, sx, sy, z, -0.12, -0.12, -0.04, -0.04, 16, 22, palOf('#9a6a34'));
  const a = P(sx, sy, z, -0.08, -0.08, 22), b = P(sx, sy, z, 0.3, 0.1, 14);
  g.strokeStyle = '#b07a40'; g.lineWidth = 1.4 * z; g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo(b[0], a[1] - 4 * z, b[0], b[1]); g.stroke();
  cylinder(g, sx, sy, z, 0.3, 0.2, 4.5, 9, '#6a3a1e');
  const fire = P(sx, sy, z, -0.08, 0, 1); glow(g, fire[0], fire[1], 9 * z, '255,130,40', 0.5);
  g.fillStyle = '#c8302a'; g.font = `700 ${4 * z}px Oswald, sans-serif`; g.textAlign = 'center'; g.fillText('XXX', p[0], p[1] - 7 * z);
}
function traps(g, t, sx, sy, z) {
  for (const [dx, dy, h0] of [[-0.16, -0.1, 0], [0.18, 0.06, 0], [-0.02, -0.02, 6.5]]) {
    const f = box(g, sx, sy, z, dx - 0.17, dy - 0.15, dx + 0.17, dy + 0.15, h0, h0 + 6.5, { t: 'rgba(90,80,60,0.6)', r: 'rgba(60,54,40,0.7)', l: 'rgba(48,44,34,0.75)' });
    for (const F of [f.L, f.R]) onFace(g, F, () => { g.strokeStyle = 'rgba(180,170,130,0.55)'; g.lineWidth = 0.04; for (let k = 1; k < 5; k++) { g.beginPath(); g.moveTo(k / 5, 0); g.lineTo(k / 5, 1); g.stroke(); } g.strokeRect(0, 0, 1, 1); });
  }
  const b = P(sx, sy, z, 0.3, -0.25, 0); g.fillStyle = '#c84a20'; g.beginPath(); g.arc(b[0], b[1] - 3 * z, 3 * z, 0, TAU); g.fill();
}
function tyres(g, t, sx, sy, z) {
  for (const [dx, dy, n] of [[-0.18, -0.12, 4], [0.2, 0.06, 3], [-0.1, 0.24, 2], [0.24, -0.24, 1]]) {
    const p = P(sx, sy, z, dx, dy);
    for (let k = 0; k < n; k++) Kit.tyre(g, p[0], p[1] - k * 3.4 * z, z, 7.5 * z);
  }
}
function lantern(g, t, sx, sy, z) {
  box(g, sx, sy, z, -0.04, -0.04, 0.04, 0.04, 0, 34, palOf('#3a2c1e', 1.1, 0.8, 0.6));
  const a = P(sx, sy, z, 0, 0, 33), b = P(sx, sy, z, 0.2, 0, 33);
  line(g, a, b, '#3a2c1e', 1.4 * z);
  const l = [b[0], b[1] + 4 * z];
  glow(g, l[0], l[1], 20 * z, '255,180,80', 0.5);
  g.fillStyle = '#ffcf80'; g.fillRect(l[0] - 1.8 * z, l[1] - 2.5 * z, 3.6 * z, 4.5 * z);
  g.strokeStyle = '#2a2018'; g.lineWidth = 0.6 * z; g.strokeRect(l[0] - 1.8 * z, l[1] - 2.5 * z, 3.6 * z, 4.5 * z);
}

// ---------- Iron Claw industrial ----------
function press(g, t, sx, sy, z) {
  const pal = palOf(t.hue === 'orange' ? '#9a5222' : '#3e5a46', 0.92, 0.66, 0.48);
  box(g, sx, sy, z, -0.46, -0.4, 1.46, 0.4, 0, 6, palOf('#3a3a3c'));
  solid(g, t, sx, sy, z, -0.36, -0.32, 1.36, 0.32, 34, pal, (f) => {
    onFace(g, f.L, () => {
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0.3, 0.35, 0.4, 0.35); // press bed opening
      g.fillStyle = 'rgba(255,140,40,0.35)'; g.fillRect(0.32, 0.6, 0.36, 0.08);
      for (let k = 0; k < 8; k++) { g.fillStyle = k % 2 ? 'rgba(20,20,20,0.7)' : 'rgba(220,180,40,0.75)'; g.fillRect(0.3 + k * 0.05, 0.32, 0.05, 0.03); }
      g.fillStyle = 'rgba(200,40,30,0.85)'; g.fillRect(0.82, 0.4, 0.06, 0.08);
      grime(g, 0.05, 0.45);
    });
    onFace(g, f.R, () => { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0.2, 0.2, 0.6, 0.5); grime(g, 0.05, 0.45); });
    // hydraulic cylinders on top
    for (const dx of [0.1, 0.9]) cylinder(g, sx, sy, z, dx, 0, 5, 10, '#6a6e72', null, 34);
    rim(g, sx, sy, z, -0.36, 0.32, 1.36, 34, 0.25);
  });
}
function pipes(g, t, sx, sy, z) {
  const st = palOf('#5a5e62', 1.05, 0.75, 0.55);
  for (const dx of [-0.25, 0.25]) box(g, sx, sy, z, dx - 0.05, -0.18, dx + 0.05, 0.18, 0, 6, palOf('#3a3a3c'));
  for (const [dy, h, col] of [[-0.1, 6, '#5a5e62'], [0.12, 6, '#7a4a2a']]) {
    const f = box(g, sx, sy, z, -0.5, dy - 0.08, 0.5, dy + 0.08, h, h + 7, palOf(col, 1.05, 0.75, 0.55));
    onFace(g, f.L, () => { g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, 0.15, 1, 0.15); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0.47, 0, 0.06, 1); });
  }
  void st;
  const v = P(sx, sy, z, 0, 0.12, 14); g.fillStyle = '#b8302a'; g.beginPath(); g.ellipse(v[0], v[1], 3.2 * z, 1.6 * z, 0, 0, TAU); g.fill();
}
function scrap(g, t, sx, sy, z) {
  const r = rng(hash(info(t).x, info(t).y, 13) * 1e9);
  const pile = [P(sx, sy, z, -0.42, 0.1), P(sx, sy, z, 0, -0.42), P(sx, sy, z, 0.42, -0.05), P(sx, sy, z, 0.1, 0.42)];
  const top = P(sx, sy, z, 0, 0, 18);
  fillPts(g, [pile[0], [top[0] - 6 * z, top[1]], pile[1]], '#3a3632');
  fillPts(g, [pile[1], [top[0] - 6 * z, top[1]], [top[0] + 5 * z, top[1] + 2 * z], pile[2]], '#4a4640');
  fillPts(g, [pile[0], [top[0] - 6 * z, top[1]], [top[0] + 5 * z, top[1] + 2 * z], pile[2], pile[3]], '#2e2a26');
  for (let i = 0; i < 9; i++) {
    const a = P(sx, sy, z, (r() - 0.5) * 0.6, (r() - 0.5) * 0.6, 4 + r() * 12);
    const L = (6 + r() * 8) * z, ang = r() * Math.PI;
    line(g, a, [a[0] + Math.cos(ang) * L, a[1] - Math.sin(ang) * L * 0.4], ['#6a4a2a', '#5a5e62', '#8a6a3a', '#3a3a3c'][i % 4], (1.2 + r() * 1.6) * z);
  }
  const d = P(sx, sy, z, 0.18, 0.12, 0); Kit.drawBarrel(g, d[0], d[1], z * 0.7, 'drum');
}
function wagon(g, t, sx, sy, z) {
  const col = { rust: '#6a3220', black: '#26262a', blue: '#2a4058' }[t.hue] || '#6a3220';
  const pal = palOf(col, 0.92, 0.66, 0.48);
  for (const x of [-0.25, 0.1, 0.9, 1.25]) { const w = P(sx, sy, z, x, 0.28, 3); g.fillStyle = '#0c0c0e'; g.beginPath(); g.ellipse(w[0], w[1], 3.4 * z, 3.4 * z, 0, 0, TAU); g.fill(); }
  box(g, sx, sy, z, -0.45, -0.3, 1.45, 0.3, 3, 7, palOf('#1e1e20'));
  solid(g, t, sx, sy, z, -0.45, -0.36, 1.45, 0.36, 34, pal, (f) => {
    onFace(g, f.L, () => {
      for (let k = 1; k < 10; k++) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(k / 10, 0.18, 0.012, 0.82); }
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0.38, 0.2, 0.24, 0.8);
      g.fillStyle = 'rgba(230,226,214,0.45)'; g.fillRect(0.08, 0.35, 0.18, 0.06);
      Kit.rust(g, rng(hash(info(t).x, info(t).y, 21) * 1e9), 3);
      grime(g, 0.05, 0.4);
    });
    onFace(g, f.R, () => { Kit.rust(g, rng(9), 1); grime(g, 0.05, 0.4); });
    rim(g, sx, sy, z, -0.45, 0.36, 1.45, 34, 0.24);
  }, { h0: 7 });
}
function gas_tank(g, t, sx, sy, z) {
  const wr = isWreckId(t.decor);
  for (const dx of [-0.2, 0.2]) box(g, sx, sy, z, dx - 0.05, -0.05, dx + 0.05, 0.05, 0, 6, palOf('#3a3a3c'));
  const p = P(sx, sy, z, 0, 0, 0);
  // horizontal tank: a capsule along x
  const r = 10 * z, cx = p[0], cy = p[1] - 16 * z;
  const col = wr ? '#2a2420' : '#c8c2b4';
  const gr = g.createLinearGradient(0, cy - r, 0, cy + r);
  const c = Kit.hex2(col);
  gr.addColorStop(0, Kit.rgb(c, 1)); gr.addColorStop(0.6, Kit.rgb(c, 0.7)); gr.addColorStop(1, Kit.rgb(c, 0.4));
  g.fillStyle = gr;
  g.beginPath(); g.ellipse(cx - 12 * z, cy + 5 * z, r, r, 0, Math.PI * 0.5, Math.PI * 1.5); g.lineTo(cx + 12 * z, cy - 5 * z - r); g.ellipse(cx + 12 * z, cy - 5 * z, r, r, 0, -Math.PI * 0.5, Math.PI * 0.5); g.closePath(); g.fill();
  if (wr) { g.fillStyle = '#0c0a08'; g.beginPath(); g.ellipse(cx, cy, 6 * z, 4 * z, 0.3, 0, TAU); g.fill(); glow(g, cx, cy, 12 * z, '255,110,40', 0.3); return; }
  g.fillStyle = 'rgba(200,40,30,0.85)'; g.fillRect(cx - 9 * z, cy - 3 * z, 18 * z, 3 * z);
  g.fillStyle = '#e8e2d0'; g.font = `700 ${3.2 * z}px Oswald, sans-serif`; g.textAlign = 'center'; g.fillText('FLAMMABLE', cx, cy + 5 * z);
  box(g, sx, sy, z, -0.04, -0.04, 0.04, 0.04, 26, 30, palOf('#5a5e62'));
}
function beams(g, t, sx, sy, z) {
  const pal = palOf('#5a4a40', 1, 0.72, 0.52);
  for (const [dy, h0] of [[-0.16, 0], [0.16, 0], [0, 4], [-0.16, 8], [0.16, 8]]) {
    const f = box(g, sx, sy, z, -0.48, dy - 0.1, 0.48, dy + 0.1, h0, h0 + 4, pal);
    onFace(g, f.R, () => { g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0.15, 0.25, 0.7, 0.5); });
  }
}
function conveyor(g, t, sx, sy, z) {
  for (const x of [-0.3, 0.5, 1.3]) box(g, sx, sy, z, x - 0.04, -0.2, x + 0.04, 0.2, 0, 8, palOf('#3a3a3c'));
  const f = box(g, sx, sy, z, -0.48, -0.22, 1.48, 0.22, 8, 12, palOf('#4a4e52', 1, 0.75, 0.55));
  onFace(g, f.L, () => { for (let k = 0; k < 12; k++) { g.fillStyle = k % 2 ? 'rgba(20,20,20,0.7)' : 'rgba(220,180,40,0.7)'; g.fillRect(k / 12, 0, 1 / 12, 0.4); } });
  fillPts(g, f.T, '#1c1c1e');
  for (const [dx, c] of [[0.1, '#7a5a3a'], [0.8, '#5a5e62']]) box(g, sx, sy, z, dx - 0.12, -0.12, dx + 0.12, 0.12, 12, 18, palOf(c));
}
function workbench(g, t, sx, sy, z) {
  for (const [dx, dy] of [[-0.38, -0.2], [0.38, -0.2], [-0.38, 0.2], [0.38, 0.2]]) box(g, sx, sy, z, dx - 0.03, dy - 0.03, dx + 0.03, dy + 0.03, 0, 10, palOf('#3a3a3c'));
  box(g, sx, sy, z, -0.42, -0.24, 0.42, 0.24, 10, 12, palOf('#6a5236', 1, 0.7, 0.5));
  box(g, sx, sy, z, -0.3, -0.12, -0.08, 0.06, 12, 15, palOf('#8a2a22'));
  const v = P(sx, sy, z, 0.24, 0.0, 14); g.fillStyle = '#5a5e62'; g.fillRect(v[0] - 3 * z, v[1] - 2 * z, 6 * z, 3 * z);
}

// ---------- Grey Pack estate ----------
function garage(g, t, sx, sy, z) {
  const door = { grey: '#6a6e70', green: '#2e4a36', blue: '#2a4058' }[t.hue] || '#6a6e70';
  const pal = palOf('#6a5c54', 0.9, 0.66, 0.48);
  solid(g, t, sx, sy, z, -0.46, -0.42, 1.46, 0.42, 34, pal, (f) => {
    onFace(g, f.L, () => {
      g.fillStyle = 'rgba(0,0,0,0.15)'; for (let k = 0; k < 9; k++) g.fillRect(0, 0.06 + k * 0.1, 1, 0.01);
      for (const u of [0.06, 0.53]) {
        g.fillStyle = door; g.fillRect(u, 0.3, 0.41, 0.7);
        g.fillStyle = 'rgba(255,255,255,0.08)'; for (let k = 0; k < 7; k++) g.fillRect(u, 0.33 + k * 0.1, 0.41, 0.02);
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(u, 0.95, 0.41, 0.05);
      }
      grime(g, 0.04, 0.4);
    });
    onFace(g, f.R, () => { g.fillStyle = 'rgba(0,0,0,0.15)'; for (let k = 0; k < 9; k++) g.fillRect(0, 0.06 + k * 0.1, 1, 0.01); grime(g, 0.04, 0.4); });
    fillPts(g, f.T, '#2a2a2c');
    rim(g, sx, sy, z, -0.46, 0.42, 1.46, 34, 0.22);
  });
}
function garden_fence(g, t, sx, sy, z) {
  const c = linkArms(t), H = 18;
  const wood = palOf('#5a4632', 1, 0.75, 0.55);
  box(g, sx, sy, z, -0.05, -0.05, 0.05, 0.05, 0, H + 1, wood);
  if (c.E) { const f = box(g, sx, sy, z, 0, -0.03, 0.5, 0.03, 0, H, wood); onFace(g, f.L, () => { g.fillStyle = 'rgba(0,0,0,0.25)'; for (let k = 1; k < 6; k++) g.fillRect(k / 6, 0, 0.02, 1); }); }
  if (c.W) { const f = box(g, sx, sy, z, -0.5, -0.03, 0, 0.03, 0, H, wood); onFace(g, f.L, () => { g.fillStyle = 'rgba(0,0,0,0.25)'; for (let k = 1; k < 6; k++) g.fillRect(k / 6, 0, 0.02, 1); }); }
  if (c.N) { const f = box(g, sx, sy, z, -0.03, -0.5, 0.03, 0, 0, H, wood); onFace(g, f.R, () => { g.fillStyle = 'rgba(0,0,0,0.25)'; for (let k = 1; k < 6; k++) g.fillRect(k / 6, 0, 0.02, 1); }); }
  if (c.S) { const f = box(g, sx, sy, z, -0.03, 0, 0.03, 0.5, 0, H, wood); onFace(g, f.R, () => { g.fillStyle = 'rgba(0,0,0,0.25)'; for (let k = 1; k < 6; k++) g.fillRect(k / 6, 0, 0.02, 1); }); }
}
function hedge(g, t, sx, sy, z) {
  const c = linkArms(t);
  const x0 = c.W ? -0.5 : -0.32, x1 = c.E ? 0.5 : 0.32, y0 = c.N ? -0.5 : -0.3, y1 = c.S ? 0.5 : 0.3;
  const pal = palOf('#2e4a28', 1, 0.72, 0.52);
  const f = box(g, sx, sy, z, x0, y0, x1, y1, 0, 16, pal);
  const r = rng(hash(info(t).x, info(t).y, 17) * 1e9);
  for (const F of [f.L, f.R]) onFace(g, F, () => { for (let i = 0; i < 18; i++) { g.fillStyle = r() < 0.5 ? 'rgba(80,120,60,0.35)' : 'rgba(0,0,0,0.25)'; g.beginPath(); g.arc(r(), r(), 0.05 + r() * 0.05, 0, TAU); g.fill(); } grime(g, 0.0, 0.35); });
  for (let i = 0; i < 8; i++) { const p = P(sx, sy, z, x0 + r() * (x1 - x0), y0 + r() * (y1 - y0), 16); g.fillStyle = r() < 0.5 ? '#3a5a30' : '#26401e'; g.beginPath(); g.arc(p[0], p[1], 3 * z, 0, TAU); g.fill(); }
}
function tree(g, t, sx, sy, z) {
  box(g, sx, sy, z, -0.06, -0.06, 0.06, 0.06, 0, 30, palOf('#3a2c20', 1.1, 0.8, 0.6));
  const c = P(sx, sy, z, 0, 0, 42);
  const r = rng(hash(info(t).x, info(t).y, 19) * 1e9);
  for (let i = 0; i < 9; i++) {
    const a = r() * TAU, d = r() * 12 * z;
    const x = c[0] + Math.cos(a) * d, y = c[1] + Math.sin(a) * d * 0.6 - r() * 6 * z;
    const rr = (7 + r() * 6) * z;
    const gr = g.createRadialGradient(x - rr * 0.3, y - rr * 0.3, 0, x, y, rr);
    gr.addColorStop(0, '#4a6a3a'); gr.addColorStop(1, '#1a2a16');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill();
  }
}
function bench(g, t, sx, sy, z) {
  for (const dx of [-0.32, 0.32]) box(g, sx, sy, z, dx - 0.04, -0.14, dx + 0.04, 0.14, 0, 6, palOf('#2a2a2c'));
  const f = box(g, sx, sy, z, -0.42, -0.16, 0.42, 0.14, 6, 7.5, palOf('#6a4a30', 1, 0.7, 0.5));
  void f;
  const b = box(g, sx, sy, z, -0.42, -0.18, 0.42, -0.12, 7.5, 13, palOf('#5a3e28', 1, 0.7, 0.5));
  onFace(g, b.L, () => { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, 0.45, 1, 0.1); });
}
function bus_shelter(g, t, sx, sy, z) {
  for (const [dx, dy] of [[-0.44, -0.3], [0.44, -0.3]]) box(g, sx, sy, z, dx - 0.03, dy - 0.03, dx + 0.03, dy + 0.03, 0, 30, palOf('#3a3c3e'));
  // glass back panel
  fillPts(g, [P(sx, sy, z, -0.44, -0.3, 2), P(sx, sy, z, 0.44, -0.3, 2), P(sx, sy, z, 0.44, -0.3, 27), P(sx, sy, z, -0.44, -0.3, 27)], 'rgba(150,180,200,0.22)');
  // ad panel at the end
  const ad = box(g, sx, sy, z, 0.42, -0.3, 0.48, 0.2, 2, 26, palOf('#2a2a2e'));
  onFace(g, ad.R, () => { const gr = g.createLinearGradient(0, 0, 0, 1); gr.addColorStop(0, 'rgba(255,230,190,0.75)'); gr.addColorStop(1, 'rgba(200,120,90,0.55)'); g.fillStyle = gr; g.fillRect(0.1, 0.1, 0.8, 0.8); });
  box(g, sx, sy, z, -0.48, -0.36, 0.5, 0.26, 28, 30, palOf('#3a3c3e', 1, 0.75, 0.55));
  box(g, sx, sy, z, -0.36, -0.28, 0.3, -0.14, 6, 7.5, palOf('#4a4c50'));
  const c = P(sx, sy, z, 0.45, 0, 14); glow(g, c[0], c[1], 14 * z, '255,220,170', 0.3);
}
function postbox(g, t, sx, sy, z) {
  const p = cylinder(g, sx, sy, z, 0, 0, 5.5, 15, '#a01e1a', '#7a1612');
  g.fillStyle = '#120c0a'; g.fillRect(p[0] - 3 * z, p[1] - 11 * z, 6 * z, 1.2 * z);
  g.fillStyle = 'rgba(230,200,120,0.6)'; g.fillRect(p[0] - 1.5 * z, p[1] - 7.5 * z, 3 * z, 1.6 * z);
}
function skip(g, t, sx, sy, z) {
  const pal = palOf(t.hue === 'blue' ? '#2a4a7a' : '#b8901e', 0.95, 0.68, 0.5);
  const T = [P(sx, sy, z, -0.48, -0.36, 14), P(sx, sy, z, 0.48, -0.36, 14), P(sx, sy, z, 0.48, 0.36, 14), P(sx, sy, z, -0.48, 0.36, 14)];
  const B = [P(sx, sy, z, -0.36, -0.28, 0), P(sx, sy, z, 0.36, -0.28, 0), P(sx, sy, z, 0.36, 0.28, 0), P(sx, sy, z, -0.36, 0.28, 0)];
  fillPts(g, [B[3], B[2], T[2], T[3]], pal.l);
  fillPts(g, [B[2], B[1], T[1], T[2]], pal.r);
  fillPts(g, T, '#1a1816');
  const r = rng(hash(info(t).x, info(t).y, 23) * 1e9);
  for (let i = 0; i < 7; i++) { const p = P(sx, sy, z, (r() - 0.5) * 0.7, (r() - 0.5) * 0.5, 13 + r() * 3); g.fillStyle = ['#6a5a48', '#8a8478', '#4a3a2a', '#a0a098'][i % 4]; g.fillRect(p[0] - 3 * z, p[1] - 1.5 * z, 6 * z * (0.5 + r()), 3 * z); }
  line(g, T[3], T[2], 'rgba(255,220,170,0.3)', 0.8 * z);
}

const ART = {
  crane_base, forklift, warehouse, fish_stall, ice_box, bollard,
  neon_shop, sedan, dumpster, bin, booth, speakers, neon_sign, phone_box, planter, rope,
  stilt_shack, rusty_boat, gator_fence, reeds, stump, still, traps, tyres, lantern,
  press, pipes, scrap, wagon, gas_tank, beams, conveyor, workbench,
  garage, garden_fence, hedge, tree, bench, bus_shelter, postbox, skip,
};
export function hasPackArt(id) { const d = propDef(id); return !!(d && ART[d.art || d.id]); }
export function drawPackProp(g, t, sx, sy, z) {
  const d = propDef(t.decor);
  const fn = d && ART[d.art || d.id];
  if (!fn) return false;
  fn(g, t, sx, sy, z);
  return true;
}
// Shadow footprints [x0,y0,x1,y1,h] in tile space (E-facing; the caller swaps for dir S).
export function packFootprint(t) {
  const d = propDef(t.decor);
  if (!d) return [];
  const H = d.h;
  if (d.size === 2) return [[-0.45, -0.36, 1.45, 0.36, H]];
  if (['lamp', 'lantern', 'neon_sign', 'reeds', 'gator_fence', 'garden_fence', 'rope'].includes(d.id)) return [[-0.05, -0.05, 0.05, 0.05, H]];
  if (d.id === 'tree') return [[-0.3, -0.3, 0.3, 0.3, 40]];
  return [[-0.36, -0.3, 0.36, 0.3, H]];
}
