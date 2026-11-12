// Canvas tactics view: bigger street maps, pan/zoom, hitchance, cover, and simple unit animations.
import * as T from '../core/tactics.js';
import { defOf, HEROES } from '../core/heroes.js';
import { tile, inB } from '../core/tmaps.js';
import { money, fmt, ico, esc } from './fmt.js';
import { formatDrop } from '../core/shards.js';
import { PERKS, rankName, xpToNext } from '../core/progress.js';
import * as Audio from './audio.js';

const TW = 58, TH = 29;
const portraits = {};
function preload(src) {
  if (!src || portraits[src]) return portraits[src];
  const im = new Image(); im.src = src; portraits[src] = im; return im;
}

function ui(ctx) {
  return ctx.sub.tactics || (ctx.sub.tactics = {
    sel: null, mode: 'shot', cam: null, dirty: 1, hover: null, busy: 0,
    floats: [], shake: 0, flash: null, pathAnim: null,
  });
}

function toWorld(x, y) {
  return { x: (x - y) * (TW / 2), y: (x + y) * (TH / 2) };
}
function fromScreen(u, sx, sy) {
  const cam = u.cam;
  const mx = (sx - cam.x) / cam.z, my = (sy - cam.y) / cam.z;
  const gx = (mx / (TW / 2) + my / (TH / 2)) / 2;
  const gy = (my / (TH / 2) - mx / (TW / 2)) / 2;
  return { x: Math.round(gx), y: Math.round(gy) };
}

function fitCam(b, cv) {
  const us = (b.units || []).filter((u) => u.hp > 0);
  const mx = us.length ? us.reduce((s, u) => s + u.x, 0) / us.length : b.map.w / 2;
  const my = us.length ? us.reduce((s, u) => s + u.y, 0) / us.length : b.map.h / 2;
  const mid = toWorld(mx, my);
  const z = Math.max(0.9, Math.min(1.55, cv.width / (15 * TW / 2)));
  return { x: cv.width / 2 - mid.x * z, y: cv.height * 0.40 - mid.y * z, z };
}

function hexPoly(g, x, y, z, fill, stroke) {
  const w = TW * z, h = TH * z;
  g.beginPath();
  g.moveTo(x, y - h / 2);
  g.lineTo(x + w / 2, y);
  g.lineTo(x, y + h / 2);
  g.lineTo(x - w / 2, y);
  g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = Math.max(1, z); g.stroke(); }
}

function drawDecor(g, t, x, y, z) {
  if (!t.decor) return;
  g.save();
  if (t.decor === 'crate') {
    g.fillStyle = '#8a6234';
    g.strokeStyle = '#3d2a14';
    g.lineWidth = 1.2 * z;
    g.beginPath();
    g.rect(x - 10 * z, y - 16 * z, 20 * z, 18 * z);
    g.fill(); g.stroke();
    g.fillStyle = '#c49a5a';
    g.fillRect(x - 10 * z, y - 16 * z, 20 * z, 4 * z);
  } else if (t.decor === 'barrier') {
    g.fillStyle = '#b9b3a6';
    g.strokeStyle = '#5c584e';
    g.lineWidth = 1.2 * z;
    g.beginPath();
    g.moveTo(x - 16 * z, y + 2 * z);
    g.lineTo(x - 12 * z, y - 10 * z);
    g.lineTo(x + 12 * z, y - 10 * z);
    g.lineTo(x + 16 * z, y + 2 * z);
    g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#d0782a';
    g.fillRect(x - 12 * z, y - 5 * z, 24 * z, 3 * z);
  } else if (t.decor === 'car' || t.decor === 'car2') {
    const col = t.decor === 'car' ? '#2c4a72' : '#253e62';
    g.fillStyle = col;
    g.strokeStyle = '#0e1722';
    g.lineWidth = 1.2 * z;
    g.beginPath();
    g.roundRect(x - 14 * z, y - 14 * z, 28 * z, 16 * z, 4 * z);
    g.fill(); g.stroke();
    g.fillStyle = '#9ad0e8';
    g.fillRect(x - 8 * z, y - 12 * z, 16 * z, 6 * z);
  } else if (t.decor === 'wall') {
    g.fillStyle = '#cfc6b8';
    g.strokeStyle = '#6e675c';
    g.lineWidth = 1 * z;
    g.beginPath();
    g.rect(x - 16 * z, y - 28 * z, 32 * z, 30 * z);
    g.fill(); g.stroke();
    g.fillStyle = '#7d9bb0';
    g.fillRect(x - 10 * z, y - 22 * z, 8 * z, 8 * z);
    g.fillRect(x + 2 * z, y - 22 * z, 8 * z, 8 * z);
    g.fillStyle = '#8a2a22';
    g.fillRect(x - 16 * z, y - 30 * z, 32 * z, 5 * z);
  }
  g.restore();
}

function chanceColor(c) {
  if (c >= 80) return '#8fd18f';
  if (c >= 50) return '#e0c15a';
  return '#e07a6a';
}

function draw(ctx) {
  const b = ctx.state.tactics, u = ui(ctx);
  const cv = document.getElementById('tacv');
  if (!b || !cv) return;
  const g = cv.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.floor(w * dpr) || cv.height !== Math.floor(h * dpr)) {
    cv.width = Math.floor(w * dpr); cv.height = Math.floor(h * dpr);
    if (!u.cam) u.cam = fitCam(b, cv);
  }
  if (!u.cam) u.cam = fitCam(b, cv);
  const cam = u.cam, z = cam.z;
  const now = performance.now();
  let shakeX = 0, shakeY = 0;
  if (u.shake > 0) {
    shakeX = (Math.random() - 0.5) * u.shake;
    shakeY = (Math.random() - 0.5) * u.shake;
    u.shake *= 0.85;
    if (u.shake < 0.4) u.shake = 0;
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, cv.width, cv.height);
  const sky = g.createLinearGradient(0, 0, 0, cv.height);
  sky.addColorStop(0, '#5a6f88'); sky.addColorStop(0.45, '#8a8b86'); sky.addColorStop(1, '#3a3a38');
  g.fillStyle = sky; g.fillRect(0, 0, cv.width, cv.height);

  g.save();
  g.translate(cam.x + shakeX, cam.y + shakeY);

  const sel = b.units.find((x) => x.uid === u.sel && x.hp > 0);
  const reach = (sel && b.side === 'player' && !u.busy) ? T.reachable(b, sel).dist : null;

  const order = [];
  for (let y = 0; y < b.map.h; y++) for (let x = 0; x < b.map.w; x++) order.push({ x, y, depth: x + y });
  order.sort((a, c) => a.depth - c.depth);

  for (const c of order) {
    const t = tile(b.map, c.x, c.y);
    const p = toWorld(c.x, c.y);
    const sx = p.x * z, sy = p.y * z;
    let fill = t.t === 'road' ? '#2a2d33' : t.t === 'side' ? '#8a8376' : t.t === 'alley' ? '#4a5248' : '#6a675c';
    if ((c.x + c.y) % 2) fill = t.t === 'road' ? '#23262c' : t.t === 'side' ? '#7e786c' : '#5e5b52';
    hexPoly(g, sx, sy, z, fill, 'rgba(0,0,0,0.25)');
    if (t.t === 'road' && c.y === (b.map.roadY || 0) && c.x % 2 === 0) {
      g.fillStyle = 'rgba(230,200,80,0.55)';
      g.fillRect(sx - 6 * z, sy - 1.5 * z, 12 * z, 3 * z);
    }
    if (reach && reach.has(`${c.x},${c.y}`) && !t.block && !(sel && sel.x === c.x && sel.y === c.y)) {
      hexPoly(g, sx, sy, z, 'rgba(80,150,255,0.38)', 'rgba(140,190,255,0.85)');
    }
    // target highlights
    if (sel && u.hover && u.hover.x === c.x && u.hover.y === c.y) {
      hexPoly(g, sx, sy, z, 'rgba(255,220,120,0.2)', '#f0d060');
    }
    drawDecor(g, t, sx, sy, z);
  }

  // units, sorted by depth
  const units = b.units.slice().sort((a, c) => (a.x + a.y) - (c.x + c.y) || a.uid.localeCompare(c.uid));
  for (const un of units) {
    let x = un.x, y = un.y;
    if (u.pathAnim && u.pathAnim.uid === un.uid) {
      const a = u.pathAnim;
      x = a.x; y = a.y;
    }
    const p = toWorld(x, y);
    const sx = p.x * z, sy = p.y * z;
    const bob = un.hp > 0 ? Math.sin(now / 380 + un.uid.charCodeAt(1)) * 1.6 * z : 0;
    const r = 16 * z;
    const dead = un.hp <= 0;
    g.save();
    if (dead) { g.globalAlpha = 0.45; g.translate(sx, sy + 6 * z); g.rotate(-0.4); g.translate(-sx, -sy); }
    // shadow
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.beginPath(); g.ellipse(sx, sy + 10 * z, 12 * z, 5 * z, 0, 0, Math.PI * 2); g.fill();
    const def = defOf(un.hero);
    const im = preload(def.portrait);
    const cx = sx, cy = sy - 10 * z + bob;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fillStyle = un.side === 'player' ? '#1d2a22' : '#2a1614';
    g.fill();
    g.save();
    g.beginPath(); g.arc(cx, cy, r - 1, 0, Math.PI * 2); g.clip();
    if (im && im.complete && im.naturalWidth) g.drawImage(im, cx - r, cy - r, r * 2, r * 2);
    else { g.fillStyle = '#888'; g.fill(); }
    if (u.flash && u.flash.uid === un.uid && now < u.flash.until) {
      g.fillStyle = 'rgba(255,255,255,0.65)';
      g.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    g.restore();
    g.lineWidth = (sel && sel.uid === un.uid ? 3 : 2) * z;
    g.strokeStyle = un.overwatch ? '#e0c15a' : un.side === 'player' ? '#8fd18f' : '#e07a6a';
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    // hp bar
    const bw = 22 * z, bh = 3.5 * z;
    g.fillStyle = 'rgba(0,0,0,0.65)';
    g.fillRect(cx - bw / 2, cy + r + 2 * z, bw, bh);
    g.fillStyle = un.hp / un.maxHp > 0.5 ? '#5dba6a' : un.hp / un.maxHp > 0.25 ? '#e0c15a' : '#d4544a';
    g.fillRect(cx - bw / 2, cy + r + 2 * z, bw * Math.max(0, un.hp / un.maxHp), bh);
    if (!dead && un.side === 'player' && b.side === 'player') {
      g.fillStyle = '#d8e8ff';
      g.font = `${Math.round(8 * z)}px sans-serif`;
      g.textAlign = 'center';
      g.fillText('●'.repeat(un.ap) + '○'.repeat(Math.max(0, un.maxAp - un.ap)), cx, cy + r + 12 * z);
    }
    if (!dead) {
      g.font = `bold ${Math.round(7.5 * z)}px Inter, sans-serif`;
      g.textAlign = 'left';
      const ammoTxt = (un.ammo || 0) > 0 ? String(un.ammo) : '×';
      const aw = g.measureText(ammoTxt).width + 6 * z;
      const ax = cx + r - 2 * z, ay = cy + r - 2 * z;
      g.fillStyle = (un.ammo || 0) > 0 ? 'rgba(20,24,16,0.85)' : 'rgba(60,18,14,0.9)';
      g.beginPath(); g.roundRect(ax, ay - 8 * z, aw, 10 * z, 2 * z); g.fill();
      g.fillStyle = (un.ammo || 0) > 0 ? '#f3e7c9' : '#e07a6a';
      g.fillText(ammoTxt, ax + 3 * z, ay);
    }
    if (un.overwatch) {
      g.fillStyle = '#e0c15a';
      g.font = `bold ${Math.round(9 * z)}px sans-serif`;
      g.textAlign = 'center';
      g.fillText('OW', cx, cy - r - 4 * z);
    }
    // hitchance label on hovered / targeted enemy
    if (sel && un.side !== sel.side && un.hp > 0 && (u.hover && u.hover.uid === un.uid || u.mode)) {
      const prev = T.previewShot(b, sel, un, u.mode === 'aimed' ? 'aimed' : u.mode === 'melee' || u.mode === 'knife' || u.mode === 'roll' ? u.mode : u.mode === 'venom' ? 'venom' : u.mode === 'suppress' ? 'suppress' : 'shot');
      if (prev && prev.ok) {
        const label = `${prev.chance}%`;
        g.font = `bold ${Math.round(11 * z)}px Oswald, sans-serif`;
        g.textAlign = 'center';
        const tw = g.measureText(label).width + 10 * z;
        g.fillStyle = 'rgba(10,8,8,0.82)';
        g.beginPath(); g.roundRect(cx - tw / 2, cy - r - 20 * z, tw, 14 * z, 4 * z); g.fill();
        g.fillStyle = chanceColor(prev.chance);
        g.fillText(label, cx, cy - r - 9 * z);
        const cov = T.coverLabel(prev.cover) + (prev.flanked ? ' · Flank' : '');
        g.font = `${Math.round(7.5 * z)}px Inter, sans-serif`;
        g.fillStyle = '#f3e7c9';
        g.fillText(cov, cx, cy - r - 22 * z);
      }
    }
    g.restore();
  }

  // muzzle flash
  if (u.flash && u.flash.muzzle && now < u.flash.until) {
    const a = u.flash;
    g.fillStyle = 'rgba(255,230,140,0.9)';
    g.beginPath(); g.arc(a.mx, a.my, 7 * z, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,180,60,0.8)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(a.ax, a.ay); g.lineTo(a.tx, a.ty); g.stroke();
  }

  // damage numbers
  u.floats = u.floats.filter((f) => now - f.t < 800);
  for (const f of u.floats) {
    const k = (now - f.t) / 800;
    g.globalAlpha = 1 - k;
    g.font = `bold ${Math.round(14 * z)}px Oswald, sans-serif`;
    g.textAlign = 'center';
    g.fillStyle = f.heal ? '#8fd18f' : f.miss ? '#bbb' : '#ffd0c8';
    g.fillText(f.text, f.x, f.y - k * 24 * z);
    g.globalAlpha = 1;
  }
  g.restore();
}

let raf = 0;
function loop(ctx) {
  raf = 0;
  const u = ui(ctx);
  if (u.pathAnim) {
    const a = u.pathAnim, now = performance.now();
    const t = Math.min(1, (now - a.t0) / a.dur);
    const pts = [a.from, ...a.path];
    const seg = Math.min(pts.length - 1, Math.max(0, (pts.length - 1) * t));
    const i = Math.min(pts.length - 2, Math.floor(seg));
    const frac = seg - i;
    const A = pts[i], B = pts[i + 1];
    a.x = A.x + (B.x - A.x) * frac;
    a.y = A.y + (B.y - A.y) * frac;
    if (t >= 1) u.pathAnim = null;
  }
  draw(ctx);
  if (u.pathAnim || u.shake || (u.flash && performance.now() < u.flash.until) || u.floats.length || !u.busy) {
    raf = requestAnimationFrame(() => loop(ctx));
  } else {
    raf = requestAnimationFrame(() => loop(ctx)); // idle bob always
  }
}

function bindCanvas(ctx) {
  const cv = document.getElementById('tacv');
  if (!cv || cv._bound) return;
  cv._bound = true;
  const u = ui(ctx);
  let drag = null, last = null;
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId);
    last = { x: e.clientX, y: e.clientY, t: Date.now(), moved: 0 };
    drag = { x: e.clientX, y: e.clientY };
  });
  cv.addEventListener('pointermove', (e) => {
    if (drag && last) {
      const dx = e.clientX - last.x, dy = e.clientY - last.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) {
        last.moved = 1;
        u.cam.x += dx * (window.devicePixelRatio || 1);
        u.cam.y += dy * (window.devicePixelRatio || 1);
        last.x = e.clientX; last.y = e.clientY;
      }
    }
    const rect = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const p = fromScreen(u, (e.clientX - rect.left) * dpr, (e.clientY - rect.top) * dpr);
    const b = ctx.state.tactics;
    if (!b) return;
    const occ = T.unitAt(b, p.x, p.y);
    u.hover = occ ? { x: p.x, y: p.y, uid: occ.uid } : { x: p.x, y: p.y };
  });
  const up = (e) => {
    if (!last) return;
    const was = last; last = null; drag = null;
    if (was.moved) return;
    const rect = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const p = fromScreen(u, (e.clientX - rect.left) * dpr, (e.clientY - rect.top) * dpr);
    clickTile(ctx, p.x, p.y);
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', () => { last = null; drag = null; });
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const dpr = window.devicePixelRatio || 1;
    const rect = cv.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * dpr, sy = (e.clientY - rect.top) * dpr;
    const before = fromScreen(u, sx, sy);
    u.cam.z = Math.max(0.45, Math.min(1.8, u.cam.z * (e.deltaY > 0 ? 0.92 : 1.08)));
    const p = toWorld(before.x, before.y);
    u.cam.x = sx - p.x * u.cam.z;
    u.cam.y = sy - p.y * u.cam.z;
  }, { passive: false });
}

function clickTile(ctx, x, y) {
  const b = ctx.state.tactics, u = ui(ctx);
  if (!b || u.busy || b.status !== 'active' || b.side !== 'player') return;
  const occ = T.unitAt(b, x, y);
  const sel = b.units.find((p) => p.uid === u.sel && p.hp > 0);
  if (occ && occ.side === 'player') { u.sel = occ.uid; u.mode = 'shot'; Audio.play('tap'); return ctx.render(); }
  if (occ && occ.side === 'player' && sel && (u.mode === 'patch' || u.mode === 'medkit' || u.mode === 'heal')) {
    const typ = u.mode === 'medkit' ? 'medkit' : 'heal';
    return doAct(ctx, { type: typ, uid: sel.uid, target: occ.uid });
  }
  if (occ && occ.side === 'enemy' && sel) {
    const mode = u.mode || 'shot';
    return doAct(ctx, { type: mode, uid: sel.uid, target: occ.uid, mode });
  }
  if (sel && u.mode === 'breach') {
    return doAct(ctx, { type: 'breach', uid: sel.uid, x, y });
  }
  if (sel && T.walkable(b, x, y, sel.uid)) {
    return doAct(ctx, { type: 'move', uid: sel.uid, x, y });
  }
}

async function playEvents(ctx, events) {
  const u = ui(ctx), b = ctx.state.tactics;
  const cv = document.getElementById('tacv');
  const dpr = window.devicePixelRatio || 1;
  const skip = ctx.fast;
  const wait = (ms) => skip ? Promise.resolve() : new Promise((r) => setTimeout(r, ms));
  for (const ev of events || []) {
    if (ev.typ === 'move' && ev.path && ev.path.length) {
      const start = ev.from || ev.path[0];
      Audio.play('move');
      u.pathAnim = { uid: ev.uid, path: ev.path, from: start, t0: performance.now(), dur: Math.max(180, ev.path.length * 140), x: start.x, y: start.y };
      await wait(u.pathAnim.dur);
      u.pathAnim = null;
    }
    if (ev.typ === 'shot' || ev.typ === 'overwatch' || ev.mode) {
      const att = b.units.find((x) => x.uid === ev.uid);
      const def = b.units.find((x) => x.uid === ev.target);
      if (att && def && cv) {
        const a = toWorld(att.x, att.y), t = toWorld(def.x, def.y);
        u.flash = {
          uid: def.uid, until: performance.now() + 220, muzzle: true,
          ax: a.x * u.cam.z + u.cam.x, ay: (a.y - 10) * u.cam.z + u.cam.y,
          tx: t.x * u.cam.z + u.cam.x, ty: (t.y - 10) * u.cam.z + u.cam.y,
          mx: (a.x + (t.x - a.x) * 0.15) * u.cam.z + u.cam.x,
          my: (a.y + (t.y - a.y) * 0.15 - 10) * u.cam.z + u.cam.y,
        };
        Audio.play('shoot');
        await wait(120);
        if (ev.hit) {
          u.shake = 7; Audio.play('hit');
          u.floats.push({ t: performance.now(), x: t.x * u.cam.z + u.cam.x, y: (t.y - 18) * u.cam.z + u.cam.y, text: ev.crit ? `${ev.dmg}!` : `${ev.dmg}`, heal: 0 });
        } else {
          u.floats.push({ t: performance.now(), x: t.x * u.cam.z + u.cam.x, y: (t.y - 18) * u.cam.z + u.cam.y, text: 'Miss', miss: 1 });
        }
        await wait(280);
      }
    }
    if (ev.typ === 'heal') {
      const def = b.units.find((x) => x.uid === ev.target);
      if (def) {
        const t = toWorld(def.x, def.y);
        u.floats.push({ t: performance.now(), x: t.x * u.cam.z + u.cam.x, y: (t.y - 18) * u.cam.z + u.cam.y, text: `+${ev.heal}`, heal: 1 });
        Audio.play('collect');
        await wait(280);
      }
    }
    if (ev.typ === 'overwatch' && !ev.target) Audio.play('overwatch');
  }
}

async function doAct(ctx, action) {
  const b = ctx.state.tactics, u = ui(ctx);
  if (!b || u.busy) return;
  u.busy = 1;
  const r = T.apply(b, action);
  if (!r.ok) { u.busy = 0; return ctx.toast(r.reason); }
  ctx.save();
  await playEvents(ctx, r.events);
  u.busy = 0;
  if (b.status !== 'active') return finish(ctx);
  if (action.type === 'endTurn' && b.side === 'enemy') return enemyTurn(ctx);
  ctx.render();
}

async function enemyTurn(ctx) {
  const b = ctx.state.tactics, u = ui(ctx);
  u.busy = 1;
  let guard = 0;
  while (b.status === 'active' && b.side === 'enemy' && guard++ < 40) {
    const act = T.think(b);
    const r = T.apply(b, act);
    if (!r.ok) { T.apply(b, { type: 'endTurn' }); break; }
    await playEvents(ctx, r.events);
    if (act.type === 'endTurn') break;
  }
  u.busy = 0;
  if (b.status !== 'active') return finish(ctx);
  ctx.render();
}

function finish(ctx) {
  const u = ui(ctx);
  if (u.closed) return;
  u.closed = 1;
  const res = T.resolveTactics(ctx.state, ctx.state.tactics);
  ctx.save();
  ctx.sub.tactics = null;
  if (!res) { ctx.go('city'); return; }
  const extra = res.shardDrop
    ? `<p class="small gold">${res.tutorial ? 'You picked up a lead after the lesson. ' : ''}${esc(formatDrop(res.shardDrop))}. Collect 30 shards to unlock an operator.</p>`
    : '';
  if (res.win) Audio.play('win'); else Audio.play('lose');
  ctx.modal(`<div class="result ${res.win ? 'win' : 'loss'} ${res.highStakes ? 'hstakes' : ''}">
    <div class="h dim">${esc(res.label)}</div>
    <div class="big">${res.win ? 'Victory' : 'Defeat'}</div>
    ${res.win ? `<div class="rewards"><span>${money(res.cash)}</span>${res.influence ? `<span>${ico('influence')} ${fmt(res.influence)} Rep</span>` : ''}</div>` : '<p class="small dim">Think about cover and flanks, then try again.</p>'}
    ${extra}
    ${xpBlock(res)}
    <div class="row" style="margin-top:10px">
      <button class="btn block" data-act="closeModal" data-then="heroes">Operators</button>
      <button class="btn red block" data-act="closeModal">${res.kind === 'tutorial' ? 'Back to the hideout' : 'Back to the city'}</button>
    </div>
  </div>`, { center: true, backdrop: false, onClose: () => ctx.go(ctx.sub.afterBattle || (res.kind === 'tutorial' ? 'base' : 'city')) });
  ctx.sub.afterBattle = null;
}

function xpBlock(res) {
  if (!res) return '';
  const hs = res.highStakes ? `<div class="tiny gold">High Stakes${res.win ? ' — rewards were tripled.' : '.'}</div>` : '';
  const rows = (res.xp || []).map((x) => {
    const lvup = (x.gained || []).length
      ? ` · Level up — ${x.gained.map((g) => esc(g.rank)).join(' → ')}`
      : '';
    const bar = x.need
      ? `<div class="xpbar"><i style="width:${Math.min(100, (x.xp / x.need) * 100)}%"></i></div><div class="tiny dim">${x.xp}/${x.need} XP to next</div>`
      : '<div class="tiny dim">Max rank</div>';
    const picks = (x.pendingChoices || []).map((id) => {
      const p = PERKS[id]; if (!p) return '';
      return `<button class="btn sm" data-act="pickPerk" data-id="${x.id}" data-perk="${id}">${esc(p.name)} — ${esc(p.text)}</button>`;
    }).join('');
    return `<div class="xprow"><b>${esc(x.name)}</b> +${x.amount} XP · Lv ${x.lv}${lvup}${x.kills ? ` · ${x.kills} KO` : ''}
      ${bar}${picks ? `<div class="perkpick">Pick a perk: ${picks}</div>` : ''}</div>`;
  }).join('');
  const lost = (res.lost || []).map((l) =>
    `<div class="xprow loss"><b>${esc(l.name)}</b> was KO'd. Level reset to Rookie (was ${esc(l.rank)}); ${l.gear ? 'carried gear was taken.' : 'no gear was carried.'}</div>`
  ).join('');
  const ret = res.returned
    ? `<div class="tiny dim">Unused loadout returned: ${res.returned.ammo || 0} ammo, ${res.returned.medkits || 0} medkits. Spent rounds and kits are gone.</div>`
    : '';
  if (!hs && !rows && !lost) return '';
  return `<div class="xpbox">${hs}${lost}${ret}${rows}</div>`;
}

function coach(b, u) {
  if (!b.tutorial || b.status !== 'active') return '';
  const rook = b.units.find((x) => x.hero === 'rook' && x.side === 'player');
  const hook = b.units.find((x) => x.hero === 'hook');
  if (!u.sel) return 'Tap <b>Rook</b> to select him. Blue tiles will show where he can walk.';
  if (rook && !rook.moved) return 'Blue tiles are his walk range (1 AP per tile). Move him <b>south around the crate</b>, then toward Hook’s side — a front-on shot is weak because of cover.';
  if (rook && hook) {
    const prev = T.previewShot(b, rook, hook, 'shot');
    if (prev && prev.ok) {
      return `Hook’s hit chance is <b style="color:${chanceColor(prev.chance)}">${prev.chance}%</b> (${T.coverLabel(prev.cover)}${prev.flanked ? ', flanked' : ''}). Flank for a better shot, then tap Hook to fire.`;
    }
  }
  if (rook && rook.ap >= 2) return 'You can <b>Overwatch</b> to shoot when Hook moves, or take another action, then <b>End turn</b>.';
  return 'End the turn when you are out of AP. Hook will take his go — Overwatch can catch him mid-stride.';
}

export function render(ctx) {
  const b = ctx.state.tactics, u = ui(ctx);
  if (!b) return `<div class="pad">No fight.</div>`;
  if (b.status !== 'active' && !u.closed) queueMicrotask(() => finish(ctx));
  if (!u.sel) {
    const first = b.units.find((x) => x.side === 'player' && x.hp > 0);
    if (first) u.sel = first.uid;
  }
  const sel = b.units.find((x) => x.uid === u.sel) || b.units.find((x) => x.side === 'player');
  const def = sel ? defOf(sel.hero) : null;
  const abs = def ? def.abilities : [];
  const coachHtml = coach(b, u);
  const log = (b.log || []).slice(-3).map((l) => esc(l)).join('<br>');
  return `
  <div class="twrap">
    <canvas id="tacv"></canvas>
    <div class="tbar">
      <div class="tturn">${b.side === 'player' ? 'Your turn' : 'Enemy turn'} · ${esc(b.label)} · T${b.turn}${b.highStakes ? ' · <b class="hsflag">HIGH STAKES</b>' : ''}</div>
      <button class="btn dim tiny" data-act="retreatFight">Retreat</button>
      <button class="btn red" data-act="endTacticsTurn" ${b.side !== 'player' || u.busy ? 'disabled' : ''}>End turn</button>
    </div>
    ${coachHtml ? `<div class="tcoach">${coachHtml}</div>` : ''}
    <div class="tunit">
      ${sel ? `
        <img class="tport" src="${def.portrait}" alt="">
        <div class="tinfo">
          <div class="tn">${esc(def.name)} <span class="tiny dim">${esc(def.role)} · ${esc(def.species)}</span></div>
          <div class="tiny">HP ${sel.hp}/${sel.maxHp} · AP ${sel.ap}/${sel.maxAp} · Move ${sel.move}${sel.overwatch ? ' · Overwatch' : ''} · ${ico('ammo')} ${sel.ammo || 0}${sel.medkits ? ` · ${ico('medkits')} ${sel.medkits}` : ''}</div>
          <div class="tiny dim">${esc(def.passive.name)}${def.passive.name ? ': ' + esc(def.passive.text) : ''}${(sel.ammo || 0) <= 0 ? ' · Out of ammo — adjacent melee only' : ''}</div>
        </div>
        <div class="tabs">
          ${abs.map((a) => `<button class="tab ${u.mode === a.id || u.mode === a.kind ? 'on' : ''}" data-act="tmode" data-mode="${a.id}" ${sel.ap < (a.ap || 2) && a.kind !== 'shot' ? '' : ''}>${esc(a.name)} <span class="tiny">${a.ap} AP</span></button>`).join('')}
          ${sel.medkits ? `<button class="tab ${u.mode === 'medkit' ? 'on' : ''}" data-act="tmode" data-mode="medkit">Medkit 2 AP · ${sel.medkits}</button>` : ''}
          <button class="tab ${u.mode === 'hunker' ? 'on' : ''}" data-act="doHunker">Hunker 1 AP</button>
        </div>` : ''}
    </div>
    <div class="tlog tiny dim">${log}</div>
  </div>`;
}

export function mount(ctx, el) {
  const cv = document.getElementById('tacv');
  if (!cv) return;
  // preload portraits
  const b = ctx.state.tactics;
  if (b) b.units.forEach((u) => preload(defOf(u.hero).portrait));
  bindCanvas(ctx);
  if (raf) cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => loop(ctx));
}

export const actions = {
  tmode(ctx, el) {
    const mode = el.dataset.mode;
    const inst = ['overwatch', 'dash', 'sprint', 'fortify', 'hunker'];
    const u = ui(ctx);
    if (!u.sel) return;
    if (inst.includes(mode)) return doAct(ctx, { type: mode, uid: u.sel });
    if (mode === 'medkit' && u.mode === 'medkit') return doAct(ctx, { type: 'medkit', uid: u.sel, target: u.sel });
    u.mode = mode; ctx.render();
  },
  doHunker(ctx) {
    const u = ui(ctx); if (!u.sel) return;
    doAct(ctx, { type: 'hunker', uid: u.sel });
  },
  endTacticsTurn(ctx) { doAct(ctx, { type: 'endTurn' }); },
  retreatFight(ctx) {
    const b = ctx.state.tactics; if (!b) return;
    b.status = 'loss'; b.reason = 'retreat';
    finish(ctx);
  },
};

export { doAct, ui as tacticsUi };
