// Canvas tactics view: docklands yard, pan/zoom, hitchance, cover, speed queue and PvP timer.
import * as T from '../core/tactics.js';
import { defOf, classOf, speciesPerk } from '../core/heroes.js';
import { tile, inB } from '../core/tmaps.js';
import { money, fmt, ico, esc } from './fmt.js';
import { formatDrop } from '../core/shards.js';
import { PERKS, rankName, xpToNext } from '../core/progress.js';
import * as Audio from './audio.js';
import * as Dock from './dockart.js';
import { chooseAction, opponentLabel } from '../core/pvp.js';
import * as Actors from './actors.js';
import * as Vfx from './vfx.js';

const TW = Dock.TW, TH = Dock.TH;
const portraits = {};
function preload(src) {
  if (!src || portraits[src]) return portraits[src];
  const im = new Image(); im.src = src; portraits[src] = im; return im;
}

function ui(ctx) {
  return ctx.sub.tactics || (ctx.sub.tactics = {
    sel: null, mode: 'shot', cam: null, dirty: 1, hover: null, busy: 0,
    floats: [], shake: 0, flash: null, pathAnim: null,
    bubbles: [], deadline: 0, timerUid: null, booms: [],
    fx: Vfx.create(), lastFx: performance.now(),
  });
}

function toWorld(x, y) { return Dock.toWorld(x, y); }
function fromScreen(u, sx, sy) {
  const cam = u.cam;
  const mx = (sx - cam.x) / cam.z, my = (sy - cam.y) / cam.z;
  const gx = (mx / (TW / 2) + my / (TH / 2)) / 2;
  const gy = (my / (TH / 2) - mx / (TW / 2)) / 2;
  return { x: Math.round(gx), y: Math.round(gy) };
}

function fitCam(b, cv) {
  const us = (b.units || []).filter((un) => un.hp > 0);
  const pts = us.length ? us : [{ x: Math.floor((b.map.w || 12) / 2), y: Math.floor((b.map.h || 10) / 2) }];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const pad = 2;
  for (const un of pts) {
    for (const [dx, dy] of [[-pad, -pad], [pad, pad], [-pad, pad], [pad, -pad], [0, 0]]) {
      const p = toWorld(un.x + dx, un.y + dy);
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
  }
  let bw = Math.max(TW * 4, maxX - minX);
  let bh = Math.max(TH * 5, maxY - minY);
  // Don't zoom out far enough that operators become specks on empty concrete.
  bw = Math.min(bw, TW * 11);
  bh = Math.min(bh, TH * 12);
  const z = Math.max(cv.width / (13 * TW), Math.min(cv.width / (7 * TW), Math.min(cv.width / (bw + TW), cv.height / (bh + TH * 3))));
  const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2;
  return { x: cv.width / 2 - midX * z, y: cv.height * 0.58 - midY * z, z };
}

function pvpTimerOn(b) {
  return !!(b && b.pvp && !b.tutorial && b.status === 'active');
}
function syncTimer(u, b) {
  if (!pvpTimerOn(b) || b.side !== 'player') { u.deadline = 0; u.timerUid = null; return; }
  const act = T.actingUnit(b);
  if (!act || act.side !== 'player') { u.deadline = 0; u.timerUid = null; return; }
  if (u.timerUid !== act.uid) {
    u.timerUid = act.uid;
    u.deadline = performance.now() + (b.turnSec || 30) * 1000;
  }
}
function remainMs(u) { return u.deadline ? Math.max(0, u.deadline - performance.now()) : 0; }

function say(u, b, uid, kind) {
  const un = b.units.find((x) => x.uid === uid);
  if (!un) return;
  const list = defOf(un.hero).quips && defOf(un.hero).quips[kind];
  if (!list || !list.length) return;
  const text = list[Math.floor(Math.random() * list.length)];
  u.bubbles = (u.bubbles || []).filter((bb) => bb.uid !== uid || kind === 'ko');
  u.bubbles.push({ uid, text, t: performance.now(), until: performance.now() + 1700, kind });
}

function koAt(b, x, y) {
  return (b.units || []).find((un) => un.x === x && un.y === y && un.hp <= 0) || null;
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


function drawShieldBadge(g, x, y, z, cover) {
  const s = 6.5 * z;
  g.save();
  g.translate(x, y);
  const path = () => {
    g.beginPath();
    g.moveTo(0, -s);
    g.lineTo(s * 0.72, -s * 0.32);
    g.lineTo(s * 0.60, s * 0.28);
    g.lineTo(0, s);
    g.lineTo(-s * 0.60, s * 0.28);
    g.lineTo(-s * 0.72, -s * 0.32);
    g.closePath();
  };
  path();
  g.fillStyle = 'rgba(12,12,16,0.78)';
  g.fill();
  if (cover >= 2) {
    path();
    g.fillStyle = 'rgba(90, 168, 230, 0.95)';
    g.fill();
  } else if (cover === 1) {
    g.save();
    g.beginPath();
    g.rect(-s * 1.1, -s * 1.2, s * 1.1, s * 2.4);
    g.clip();
    path();
    g.fillStyle = 'rgba(90, 168, 230, 0.95)';
    g.fill();
    g.restore();
  }
  path();
  g.strokeStyle = cover >= 1 ? '#d4ecff' : '#6a6a72';
  g.lineWidth = 1.15 * z;
  g.stroke();
  g.restore();
}

function drawFlankBadge(g, x, y, z) {
  const s = 4.8 * z;
  g.save();
  g.translate(x, y);
  g.strokeStyle = '#f0c040';
  g.lineWidth = 1.7 * z;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(-s, -s); g.lineTo(0, 0); g.lineTo(-s, s);
  g.moveTo(-s * 0.15, -s); g.lineTo(s * 0.85, 0); g.lineTo(-s * 0.15, s);
  g.stroke();
  g.restore();
}

function drawOverwatchCone(g, x, y, z, facing) {
  const fac = facing || 1;
  const ang = fac > 0 ? -0.45 : Math.PI + 0.45;
  const r = 52 * z;
  g.save();
  g.fillStyle = 'rgba(224, 193, 90, 0.22)';
  g.strokeStyle = 'rgba(224, 193, 90, 0.65)';
  g.lineWidth = 1.1 * z;
  g.beginPath();
  g.moveTo(x, y);
  g.arc(x, y, r, ang - 0.55, ang + 0.55);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
}

function drawOverwatchEye(g, x, y, z) {
  const s = 5.5 * z;
  g.save();
  g.translate(x, y);
  g.fillStyle = 'rgba(12,10,8,0.72)';
  g.beginPath(); g.ellipse(0, 0, s * 1.35, s * 0.95, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#e0c15a';
  g.lineWidth = 1.15 * z;
  g.beginPath();
  g.moveTo(-s * 1.15, 0);
  g.quadraticCurveTo(0, -s * 0.85, s * 1.15, 0);
  g.quadraticCurveTo(0, s * 0.85, -s * 1.15, 0);
  g.closePath();
  g.stroke();
  g.fillStyle = '#e0c15a';
  g.beginPath(); g.arc(0, 0, s * 0.38, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#1a1208';
  g.beginPath(); g.arc(0, 0, s * 0.16, 0, Math.PI * 2); g.fill();
  g.restore();
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
  Dock.drawSky(g, cv.width, cv.height);

  const fx = Vfx.ensure(u);
  const dt = Math.min(0.05, Math.max(0, (now - (u.lastFx || now)) / 1000));
  u.lastFx = now;
  Vfx.tick(fx, dt);
  Vfx.applyPan(fx, cam);
  const nudge = Vfx.nudgeOffset(fx, cam, cv);
  g.save();
  g.translate(cam.x + shakeX + nudge.x, cam.y + shakeY + nudge.y);

  const actor = T.actingUnit(b);
  const sel = (actor && actor.side === 'player' && actor.hp > 0)
    ? actor
    : b.units.find((x) => x.uid === u.sel && x.hp > 0);
  const reach = (sel && b.side === 'player' && !u.busy) ? T.reachable(b, sel).dist : null;

  const order = [];
  for (let y = 0; y < b.map.h; y++) for (let x = 0; x < b.map.w; x++) order.push({ x, y, depth: x + y });
  order.sort((a, c) => a.depth - c.depth);

  for (const c of order) {
    const t = tile(b.map, c.x, c.y);
    const p = toWorld(c.x, c.y);
    const sx = p.x * z, sy = p.y * z;
    Dock.drawGround(g, t, sx, sy, z, (c.x + c.y) % 2);
    if (reach && reach.has(`${c.x},${c.y}`) && !t.block && !(sel && sel.x === c.x && sel.y === c.y)) {
      hexPoly(g, sx, sy, z, 'rgba(80,150,255,0.34)', 'rgba(140,190,255,0.8)');
    }
    if (sel && u.hover && u.hover.x === c.x && u.hover.y === c.y) {
      hexPoly(g, sx, sy, z, 'rgba(255,220,120,0.16)', '#f0d060');
    }
    if (sel && u.hover && u.hover.x === c.x && u.hover.y === c.y && T.isExplosiveAt(b, c.x, c.y)) {
      const prev = T.previewProp(b, sel, c.x, c.y);
      if (prev && prev.ok) Dock.drawBlastPreview(g, sx, sy, z, prev.radius || 1);
    }
  }

  const sprites = [];
  for (const c of order) {
    const t = tile(b.map, c.x, c.y);
    if (!t || !t.decor || Dock.skipPairedEast(t)) continue;
    const depth = c.x + c.y + (Dock.isPairedWest(t) ? 0.5 : 0);
    sprites.push({ depth, typ: 'prop', x: c.x, y: c.y, t });
  }
  for (const un of b.units) {
    let x = un.x, y = un.y;
    if (u.pathAnim && u.pathAnim.uid === un.uid) { x = u.pathAnim.x; y = u.pathAnim.y; }
    sprites.push({ depth: x + y, typ: 'unit', un, x, y });
  }
  sprites.sort((a, c) => a.depth - c.depth || (a.typ === 'prop' ? -1 : 1) || 0);

  for (const sp of sprites) {
    if (sp.typ === 'prop') {
      const p = toWorld(sp.x, sp.y);
      Dock.drawProp(g, sp.t, p.x * z, p.y * z, z);
      continue;
    }
    const un = sp.un;
    const p = toWorld(sp.x, sp.y);
    const sx = p.x * z, sy = p.y * z;
    const dead = un.hp <= 0;
    const acting = actor && actor.uid === un.uid;
    const def = defOf(un.hero);
    Actors.tickAnim(un, now, !!(u.hitstop && now < u.hitstop));
    if (un.overwatch && un.hp > 0) {
      const fac = (Actors.ensureAnim(un).facing) || 1;
      drawOverwatchCone(g, sx, sy, z, fac);
    }
    let cx = sx, cy = sy - 10 * z, r = 16 * z;
    g.save();
    if (Actors.hasActor(un.hero)) {
      if (u.flash && u.flash.uid === un.uid && now < u.flash.until) {
        const a = Actors.ensureAnim(un); a.flash = Math.max(a.flash, 0.7);
      }
      const pose = Actors.drawActor(g, un, sx, sy, z, now);
      if (pose) { cx = pose.headX; cy = pose.headY; r = 12 * z; }
    } else {
      const bob = un.hp > 0 ? Math.sin(now / 380 + un.uid.charCodeAt(1)) * 1.6 * z : 0;
      if (dead) { g.globalAlpha = 0.45; g.translate(sx, sy + 6 * z); g.rotate(-0.4); g.translate(-sx, -sy); }
      g.fillStyle = 'rgba(0,0,0,0.4)';
      g.beginPath(); g.ellipse(sx, sy + 10 * z, 12 * z, 5 * z, 0, 0, Math.PI * 2); g.fill();
      const im = preload(def.portrait);
      cx = sx; cy = sy - 10 * z + bob;
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
      g.lineWidth = ((sel && sel.uid === un.uid) || acting ? 3 : 2) * z;
      g.strokeStyle = un.overwatch ? '#e0c15a' : acting ? '#f0d060' : un.side === 'player' ? '#8fd18f' : '#e07a6a';
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    }
    // rings for actors (feet/head hint of who is up)
    if (Actors.hasActor(un.hero) && !dead) {
      g.strokeStyle = un.overwatch ? '#e0c15a' : acting ? '#f0d060' : un.side === 'player' ? 'rgba(143,209,143,0.85)' : 'rgba(224,122,106,0.85)';
      g.lineWidth = (acting ? 2.4 : 1.4) * z;
      g.beginPath(); g.ellipse(sx, sy + 3 * z, 12 * z, 5 * z, 0, 0, Math.PI * 2); g.stroke();
    }
    const bw = 22 * z, bh = 3.5 * z;
    const barY = Actors.hasActor(un.hero) ? cy - 8 * z : cy + r + 2 * z;
    g.fillStyle = 'rgba(0,0,0,0.65)';
    g.fillRect(cx - bw / 2, barY, bw, bh);
    g.fillStyle = un.hp / un.maxHp > 0.5 ? '#5dba6a' : un.hp / un.maxHp > 0.25 ? '#e0c15a' : '#d4544a';
    g.fillRect(cx - bw / 2, barY, bw * Math.max(0, un.hp / un.maxHp), bh);
    if (!dead && un.side === 'player' && b.side === 'player' && acting) {
      g.fillStyle = '#d8e8ff';
      g.font = `${Math.round(8 * z)}px sans-serif`;
      g.textAlign = 'center';
      g.fillText('●'.repeat(un.ap) + '○'.repeat(Math.max(0, un.maxAp - un.ap)), cx, barY + 12 * z);
    }
    if (!dead) {
      g.font = `bold ${Math.round(7.5 * z)}px Inter, sans-serif`;
      g.textAlign = 'left';
      const ammoTxt = (un.ammo || 0) > 0 ? String(un.ammo) : '×';
      const aw = g.measureText(ammoTxt).width + 6 * z;
      const ax = cx + (Actors.hasActor(un.hero) ? 10 * z : r - 2 * z);
      const ay = barY + 10 * z;
      g.fillStyle = (un.ammo || 0) > 0 ? 'rgba(20,24,16,0.85)' : 'rgba(60,18,14,0.9)';
      g.beginPath(); g.roundRect(ax, ay - 8 * z, aw, 10 * z, 2 * z); g.fill();
      g.fillStyle = (un.ammo || 0) > 0 ? '#f3e7c9' : '#e07a6a';
      g.fillText(ammoTxt, ax + 3 * z, ay);
    }
    if (un.overwatch && un.hp > 0) {
      drawOverwatchEye(g, cx, barY - 8 * z, z);
    }
    if (sel && un.side !== sel.side && un.hp > 0 && (u.hover && u.hover.uid === un.uid || u.mode)) {
      const prev = T.previewShot(b, sel, un, u.mode === 'aimed' ? 'aimed' : u.mode === 'melee' || u.mode === 'knife' || u.mode === 'roll' ? u.mode : u.mode === 'venom' ? 'venom' : u.mode === 'suppress' ? 'suppress' : 'shot');
      if (prev && prev.ok) {
        const label = `${prev.chance}%`;
        g.font = `bold ${Math.round(11 * z)}px Oswald, sans-serif`;
        g.textAlign = 'center';
        const tw = g.measureText(label).width + 10 * z;
        const ly = barY - 16 * z;
        g.fillStyle = 'rgba(10,8,8,0.82)';
        g.beginPath(); g.roundRect(cx - tw / 2, ly - 11 * z, tw, 14 * z, 4 * z); g.fill();
        g.fillStyle = chanceColor(prev.chance);
        g.fillText(label, cx, ly);
        const badgeY = ly - 16 * z;
        drawShieldBadge(g, cx - tw / 2 - 8 * z, badgeY, z, prev.cover);
        if (prev.flanked) drawFlankBadge(g, cx + tw / 2 + 8 * z, badgeY, z);
        const cov = prev.flanked ? 'FLANK' : prev.cover >= 2 ? 'FULL' : prev.cover === 1 ? 'HALF' : 'OPEN';
        g.font = `bold ${Math.round(7 * z)}px Inter, sans-serif`;
        g.fillStyle = prev.flanked ? '#f0c040' : prev.cover >= 1 ? '#c8e4ff' : '#a0a0a8';
        g.fillText(cov, cx, ly - 22 * z);
      }
    }
    // speech bubble with pop and a tail
    const bub = (u.bubbles || []).find((bb) => bb.uid === un.uid && now < bb.until);
    if (bub) {
      const age = now - bub.t;
      const enter = Math.min(1, age / 160);
      const pop = enter < 1 ? 1.15 * (1 - Math.pow(1 - enter, 3)) : 1;
      const fade = Math.min(1, (bub.until - now) / 280);
      g.save();
      g.translate(cx, cy - r - 16 * z);
      g.scale(pop, pop);
      g.globalAlpha = fade;
      g.font = `${Math.round(8.5 * z)}px Inter, sans-serif`;
      g.textAlign = 'center';
      const tw = Math.min(130 * z, g.measureText(bub.text).width + 12 * z);
      const th = 15 * z;
      g.fillStyle = 'rgba(14,12,10,0.92)';
      g.beginPath(); g.roundRect(-tw / 2, -th, tw, th, 4 * z); g.fill();
      g.beginPath();
      g.moveTo(-3 * z, 0); g.lineTo(3 * z, 0); g.lineTo(0, 5 * z); g.closePath(); g.fill();
      g.fillStyle = '#f3e7c9';
      g.fillText(bub.text, 0, -4 * z);
      g.restore();
    }
    g.restore();
  }

  Vfx.draw(g, fx, z);

  // boom flashes
  u.booms = (u.booms || []).filter((bm) => now < bm.until);
  for (const bm of u.booms) {
    const k = (bm.until - now) / 420;
    const p = toWorld(bm.x, bm.y);
    g.save();
    g.globalAlpha = Math.max(0, k);
    const rad = (18 + (1 - k) * 22) * z;
    const grd = g.createRadialGradient(p.x * z, p.y * z, 2, p.x * z, p.y * z, rad);
    grd.addColorStop(0, 'rgba(255,230,140,0.9)');
    grd.addColorStop(0.4, 'rgba(230,90,30,0.55)');
    grd.addColorStop(1, 'rgba(80,20,10,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(p.x * z, p.y * z, rad, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  u.floats = u.floats.filter((f) => now - f.t < 900);
  for (const f of u.floats) {
    const age = now - f.t;
    const k = age / 900;
    const pop = age < 100 ? 0.5 + 0.9 * (age / 100) : age < 180 ? 1.4 - 0.4 * ((age - 100) / 80) : 1;
    g.save();
    g.globalAlpha = 1 - k * k;
    const fy = f.y - k * 28 * z;
    g.translate(f.x, fy);
    g.scale(pop, pop);
    g.font = `bold ${Math.round(15 * z)}px Oswald, sans-serif`;
    g.textAlign = 'center';
    g.lineJoin = 'round';
    g.lineWidth = 3 * z;
    g.strokeStyle = 'rgba(10,8,8,0.8)';
    g.fillStyle = f.heal ? '#8fd18f' : f.miss ? '#d0d0d0' : (f.crit ? '#ffe080' : '#ffd0c8');
    g.strokeText(f.text, 0, 0);
    g.fillText(f.text, 0, 0);
    g.restore();
  }
  g.restore();

  // live PvP countdown in the HUD chip
  const tel = document.getElementById('ttimer');
  if (tel) {
    const show = pvpTimerOn(b) && b.side === 'player' && u.deadline && !u.busy;
    const sec = show ? Math.ceil(remainMs(u) / 1000) : 0;
    tel.textContent = show ? String(sec) : '';
    tel.classList.toggle('low', show && sec <= 10);
  }
}

let raf = 0;
function loop(ctx) {
  raf = 0;
  const u = ui(ctx);
  const b = ctx.state.tactics;
  const now = performance.now();
  const frozen = u.hitstop && now < u.hitstop;
  if (u.pathAnim && !frozen) {
    const a = u.pathAnim;
    const t = Math.min(1, (now - a.t0) / a.dur);
    const pts = [a.from, ...a.path];
    const seg = Math.min(pts.length - 1, Math.max(0, (pts.length - 1) * t));
    const i = Math.min(pts.length - 2, Math.floor(seg));
    const frac = seg - i;
    const A = pts[i], B = pts[i + 1];
    a.x = A.x + (B.x - A.x) * frac;
    a.y = A.y + (B.y - A.y) * frac;
    if (a.stepI !== i) { a.stepI = i; Audio.play('footstep'); }
    if (t >= 1) u.pathAnim = null;
  }
  if (b && !u.busy) syncTimer(u, b);
  draw(ctx);
  if (b && !u.busy && pvpTimerOn(b) && b.side === 'player' && u.deadline && remainMs(u) <= 0) {
    u.deadline = 0;
    doAct(ctx, { type: 'timeout' });
  }
  raf = requestAnimationFrame(() => loop(ctx));
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
  const sel = T.actingUnit(b);
  if (!sel || sel.side !== 'player' || sel.hp <= 0) return;
  u.sel = sel.uid;
  const occ = T.unitAt(b, x, y);
  const down = koAt(b, x, y);
  if ((u.mode === 'patch' || u.mode === 'medkit' || u.mode === 'heal' || u.mode === 'revive') && (occ || down)) {
    const t = occ || down;
    if (t.side === 'player') {
      const typ = (u.mode === 'heal' || u.mode === 'patch') ? 'heal' : 'medkit';
      return doAct(ctx, { type: typ, uid: sel.uid, target: t.uid });
    }
  }
  if (occ && occ.side === 'player' && occ.uid !== sel.uid) return;
  if (occ && occ.side === 'enemy') {
    const mode = u.mode || 'shot';
    return doAct(ctx, { type: mode, uid: sel.uid, target: occ.uid, mode });
  }
  if (T.isExplosiveAt(b, x, y)) {
    return doAct(ctx, { type: 'shootProp', uid: sel.uid, x, y, mode: 'shot' });
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
      say(u, b, ev.uid, 'move');
      const mover = b.units.find((x) => x.uid === ev.uid);
      if (mover && ev.path.length) {
        const dest = ev.path[ev.path.length - 1];
        Actors.faceToward(mover, start.x, start.y, dest.x, dest.y);
        Actors.playClip(mover, 'walk');
      }
      u.pathAnim = { uid: ev.uid, path: ev.path, from: start, t0: performance.now(), dur: Math.max(180, ev.path.length * 140), x: start.x, y: start.y };
      await wait(u.pathAnim.dur);
      u.pathAnim = null;
      if (mover) Actors.playClip(mover, 'idle');
    }
    if (ev.typ === 'shot' || ev.typ === 'overwatch' || ev.mode) {
      const att = b.units.find((x) => x.uid === ev.uid);
      const def = b.units.find((x) => x.uid === ev.target);
      if (att && def && cv) {
        const a = toWorld(att.x, att.y), tw = toWorld(def.x, def.y);
        const zz = u.cam.z;
        const melee = ev.mode === 'melee' || ev.mode === 'knife' || ev.mode === 'lunge' || ev.mode === 'roll';
        u.flash = { uid: def.uid, until: performance.now() + 220, muzzle: !melee };
        Actors.faceToward(att, att.x, att.y, def.x, def.y);
        Actors.playClip(att, melee ? 'melee' : 'shoot');
        if (ev.typ === 'overwatch' && ev.target) {
          Vfx.spawnCallout(Vfx.ensure(u), a.x * zz, (a.y - 30) * zz, 'OVERWATCH', 'overwatch');
          Audio.play('overwatch');
        }
        Audio.playShoot(att.hero);
        say(u, b, ev.uid, 'shoot');
        const midX = ((a.x + tw.x) / 2) * zz, midY = ((a.y + tw.y) / 2) * zz;
        Vfx.panCam(Vfx.ensure(u), u.cam, midX, midY, cv, ev.typ === 'overwatch' ? 280 : 360);
        Vfx.nudgeToward(Vfx.ensure(u), midX, midY, ev.crit ? 1.2 : 0.9);
        await wait(melee ? 80 : 110);
        const an = Actors.ensureAnim(att);
        const gx = an.gunX != null ? an.gunX : (a.x * zz);
        const gy = an.gunY != null ? an.gunY : ((a.y - 16) * zz);
        const tx = tw.x * zz, ty = (tw.y - 14) * zz;
        const fac = an.facing || 1;
        if (!melee) {
          Vfx.spawnTracer(u.fx, gx, gy, ev.hit ? tx : tx + fac * 18 * zz, ev.hit ? ty : ty - 8 * zz, { miss: !ev.hit });
          Vfx.spawnCasings(u.fx, gx, gy, fac, ev.mode === 'aimed' ? 1 : 1);
        }
        await wait(melee ? 60 : 90);
        if (ev.hit) {
          u.shake = ev.crit ? 11 : 7; Audio.play('hit');
          u.hitstop = performance.now() + (ev.crit ? 120 : 80);
          Actors.playClip(def, ev.ko ? 'ko' : 'hit');
          Vfx.spawnSparks(u.fx, tx, ty, ev.crit ? 16 : 10);
          Vfx.spawnCallout(u.fx, tx, ty - 8 * zz, ev.crit ? 'CRIT' : 'HIT', ev.crit ? 'crit' : 'hit');
          u.floats.push({ t: performance.now(), x: tx, y: (tw.y - 22) * zz, text: ev.crit ? `${ev.dmg}!` : `${ev.dmg}`, heal: 0, crit: ev.crit });
          if (ev.ko) say(u, b, ev.target, 'ko');
          await wait(Math.max(0, u.hitstop - performance.now() + 40));
        } else {
          Vfx.spawnCallout(u.fx, tx, ty - 8 * zz, 'MISS', 'miss');
          u.floats.push({ t: performance.now(), x: tx, y: (tw.y - 22) * zz, text: 'Miss', miss: 1 });
        }
        await wait(240);
      }
    }
    if (ev.typ === 'heal') {
      const def = b.units.find((x) => x.uid === ev.target);
      if (def) {
        const t = toWorld(def.x, def.y);
        u.floats.push({ t: performance.now(), x: t.x * u.cam.z, y: (t.y - 18) * u.cam.z, text: `+${ev.heal}`, heal: 1 });
        Audio.play('collect');
        await wait(280);
      }
    }
    if (ev.typ === 'revive') {
      const def = b.units.find((x) => x.uid === ev.target);
      if (def) {
        const t = toWorld(def.x, def.y);
        u.floats.push({ t: performance.now(), x: t.x * u.cam.z, y: (t.y - 18) * u.cam.z, text: `+${ev.heal}`, heal: 1 });
        say(u, b, ev.uid, 'revive');
        Actors.playClip(def, 'revive');
        const medic = b.units.find((x) => x.uid === ev.uid);
        if (medic) Actors.playClip(medic, 'ability');
        Audio.play('collect');
        await wait(280);
      }
    }
    if (ev.typ === 'boom') {
      u.shake = 14;
      u.booms = u.booms || [];
      const spots = ev.spots || [{ x: ev.x, y: ev.y }];
      const fx = Vfx.ensure(u);
      for (const s of spots) {
        u.booms.push({ x: s.x, y: s.y, until: performance.now() + 420 });
        const p = toWorld(s.x, s.y);
        Vfx.spawnExplosion(fx, p.x * u.cam.z, p.y * u.cam.z, 1.15);
        Vfx.panCam(fx, u.cam, p.x * u.cam.z, p.y * u.cam.z, cv, 320);
        Vfx.nudgeToward(fx, p.x * u.cam.z, p.y * u.cam.z, 1.3);
      }
      Audio.play('explosion');
      await wait(280);
    }
    if (ev.typ === 'boomhit') {
      const un = b.units.find((x) => x.uid === ev.uid);
      if (un) {
        const t = toWorld(un.x, un.y);
        u.floats.push({ t: performance.now(), x: t.x * u.cam.z, y: (t.y - 18) * u.cam.z, text: `${ev.dmg}`, heal: 0 });
        Actors.playClip(un, un.hp <= 0 ? 'ko' : 'hit');
        if (un.hp <= 0) say(u, b, ev.uid, 'ko');
        u.hitstop = performance.now() + 70;
        u.shake = Math.max(u.shake, 10);
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
  if (b.side === 'enemy') return enemyTurn(ctx);
  ctx.render();
}

async function enemyTurn(ctx) {
  const b = ctx.state.tactics, u = ui(ctx);
  u.busy = 1;
  let guard = 0;
  while (b.status === 'active' && b.side === 'enemy' && guard++ < 40) {
    const act = chooseAction(b, T.think);
    const r = T.apply(b, act);
    if (!r.ok) { T.apply(b, { type: 'endTurn' }); continue; }
    await playEvents(ctx, r.events);
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
    ${res.win ? `<div class="rewards"><span>${money(res.cash)}</span>${res.influence ? `<span>${ico('influence')} ${fmt(res.influence)} Rep</span>` : ''}${res.trophies ? `<span class="gold">+${res.trophies} trophies</span>` : ''}</div>` : `<p class="small dim">Think about cover and flanks, then try again.${res.trophies ? ` ${res.trophies} trophies.` : ''}</p>`}
    ${res.trophiesNow != null ? `<p class="small dim">${res.league ? esc(res.league.name) + ' · ' : ''}${res.trophiesNow} trophies${res.opponent ? ' · vs ' + esc(res.opponent.name) : ''}</p>` : ''}
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
  const actor = T.actingUnit(b);
  if (actor && actor.hero !== 'rook') return 'Turns go one operator at a time, fastest first. Hook is up now — wait for Rook’s next go, or finish him if you can.';
  if (rook && !rook.moved) return 'Turns go one operator at a time, fastest first — Rook is up. Blue tiles are his walk range (1 AP per tile). Move him <b>south around the crate</b>, then toward Hook’s side — a front-on shot is weak because of cover.';
  if (rook && hook) {
    const prev = T.previewShot(b, rook, hook, 'shot');
    if (prev && prev.ok) {
      return `Hook’s hit chance is <b style="color:${chanceColor(prev.chance)}">${prev.chance}%</b> (${T.coverLabel(prev.cover)}${prev.flanked ? ', flanked' : ''}). Flank for a better shot, then tap Hook to fire.`;
    }
  }
  if (rook && rook.ap >= 2) return 'You can <b>Overwatch</b> to shoot when Hook moves, or take another action, then <b>End turn</b>.';
  return 'End the turn when you are out of AP. The next fastest operator goes next — Overwatch can catch Hook mid-stride.';
}

function queueHtml(b) {
  const q = T.queueUnits(b);
  if (!q.length) return '';
  return `<div class="tqueue">${q.map((un) => {
    const d = defOf(un.hero);
    const on = un.uid === b.acting ? 'on' : '';
    const foe = un.side === 'enemy' ? 'foe' : '';
    const dead = un.hp <= 0 ? 'dead' : '';
    return `<div class="tq ${on} ${foe} ${dead}" title="${esc(d.name)}"><img src="${d.thumb || d.portrait}" alt=""></div>`;
  }).join('')}</div>`;
}

export function render(ctx) {
  const b = ctx.state.tactics, u = ui(ctx);
  if (!b) return `<div class="pad">No fight.</div>`;
  if (b.status !== 'active' && !u.closed) queueMicrotask(() => finish(ctx));
  const actor = T.actingUnit(b);
  if (actor && actor.side === 'player' && actor.hp > 0) u.sel = actor.uid;
  else if (!u.sel) {
    const first = b.units.find((x) => x.side === 'player');
    if (first) u.sel = first.uid;
  }
  const sel = b.units.find((x) => x.uid === u.sel) || actor || b.units.find((x) => x.side === 'player');
  const def = sel ? defOf(sel.hero) : null;
  const abs = def ? def.abilities : [];
  const cls = def ? classOf(def) : null;
  const perk = def ? speciesPerk(def.species) : null;
  const coachHtml = coach(b, u);
  const log = (b.log || []).slice(-3).map((l) => esc(l)).join('<br>');
  const actName = actor ? defOf(actor.hero).name : '';
  const turnLbl = actor ? `${actName} is up` : (b.side === 'player' ? 'Your turn' : 'Enemy turn');
  const canAct = b.side === 'player' && actor && actor.side === 'player' && !u.busy;
  return `
  <div class="twrap">
    <canvas id="tacv"></canvas>
    <div class="tbar">
      <div class="tturn">${esc(turnLbl)} · ${esc(b.label)} · T${b.turn}${b.highStakes ? ' · <b class="hsflag">HIGH STAKES</b>' : ''}</div>
      <div class="ttimer" id="ttimer"></div>
      <button class="btn dim tiny" data-act="retreatFight">Retreat</button>
      <button class="btn red" data-act="endTacticsTurn" ${canAct ? '' : 'disabled'}>End turn</button>
    </div>
    ${queueHtml(b)}
    ${coachHtml ? `<div class="tcoach">${coachHtml}</div>` : ''}
    <div class="tunit">
      ${sel ? `
        <img class="tport" src="${def.portrait}" alt="">
        <div class="tinfo">
          <div class="tn">${esc(def.name)} <span class="tiny dim">${esc((cls && cls.name) || def.role)} · ${esc(def.species)}</span></div>
          <div class="tiny">HP ${sel.hp}/${sel.maxHp} · AP ${sel.ap}/${sel.maxAp} · Move ${sel.move} · Spd ${sel.speed || def.speed}${sel.overwatch ? ' · Overwatch' : ''} · ${ico('ammo')} ${sel.ammo || 0}${sel.medkits ? ` · ${ico('medkits')} ${sel.medkits}` : ''}</div>
          <div class="tiny dim">${perk ? `${esc(perk.name)}: ${esc(perk.text)}` : (def.passive && def.passive.name ? `${esc(def.passive.name)}: ${esc(def.passive.text)}` : '')}${(sel.ammo || 0) <= 0 ? ' · Out of ammo — adjacent melee only' : ''}</div>
        </div>
        <div class="tabs">
          ${abs.map((a) => `<button class="tab ${u.mode === a.id || u.mode === a.kind ? 'on' : ''}" data-act="tmode" data-mode="${a.id}">${esc(a.name)} <span class="tiny">${a.ap} AP</span></button>`).join('')}
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
  const b = ctx.state.tactics;
  const u = ui(ctx);
  if (b) {
    Actors.preloadActors();
    b.units.forEach((un) => { preload(defOf(un.hero).portrait); Actors.ensureAnim(un); });
    const act = T.actingUnit(b);
    if (act && act.side === 'player') u.sel = act.uid;
  }
  bindCanvas(ctx);
  if (raf) cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => loop(ctx));
  if (b && b.status === 'active' && b.side === 'enemy' && !u.busy && !u.closed) {
    queueMicrotask(() => enemyTurn(ctx));
  }
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
