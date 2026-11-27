// Canvas tactics view: docklands yard, pan/zoom, hitchance, cover, speed queue and PvP timer.
import { runSteps, learn, learned } from './tutor.js';
import { INTRO_BATTLE_STEPS, onFightEnd as introFightEnd } from './intro.js';
import { ITEMS, QUALITY } from '../core/items.js';
import { itemImg } from './character.js';
import * as T from '../core/tactics.js';
import { defOf, classOf, speciesPerk } from '../core/heroes.js';
import { tile, inB, DIRS4 } from '../core/tmaps.js';
import { money, fmt, ico, esc } from './fmt.js';
import { formatDrop } from '../core/shards.js';
import { PERKS, rankName, xpToNext } from '../core/progress.js';
import * as Audio from './audio.js';
import * as Dock from './dockart.js';
import { chooseAction, opponentLabel, leagueOf } from '../core/pvp.js';
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

// v0.15 battle speed (1x / 2x), remembered between sessions. Scales waits, hops and piece clips.
const SPEED_KEY = 'fangcity.battleSpeed';
let SPEED = (() => { try { return localStorage.getItem(SPEED_KEY) === '2' ? 2 : 1; } catch (e) { return 1; } })();
Actors.setTimeScale(SPEED);
export function battleSpeed() { return SPEED; }
function setSpeed(v) { SPEED = v === 2 ? 2 : 1; Actors.setTimeScale(SPEED); try { localStorage.setItem(SPEED_KEY, String(SPEED)); } catch (e) { /* private mode */ } }

// Cheap fingerprint of everything that changes reach / threat (positions, HP, AP, turn).
function boardKey(b) {
  let k = b.turn + '|' + b.acting + '|';
  for (const un of b.units) k += un.x + ',' + un.y + ',' + un.hp + ',' + un.ap + ';';
  return k;
}
function cachedReach(u, b, sel) {
  const key = sel.uid + '#' + boardKey(b);
  if (u._reachKey !== key) { u._reachKey = key; u._reach = T.reachable(b, sel); }
  return u._reach;
}
// v0.15 move preview (XCOM / Invisible Inc): exact path, AP cost, cover at the destination, and every
// rival who could hit you there (Fire Emblem / Into the Breach threat). Pure: restores everything it touches.
function movePreview(u, b, sel, x, y) {
  const key = `${sel.uid}@${x},${y}#${boardKey(b)}`;
  if (u._pvKey === key) return u._pv;
  const info = T.pathTo(b, sel, x, y);
  let pv = null;
  if (info && info.path.length) {
    const ox = sel.x, oy = sel.y;
    const threats = [];
    sel.x = x; sel.y = y;
    try {
      for (const en of b.units) {
        if (en.side === sel.side || en.hp <= 0) continue;
        const gun = T.gunOf(en);
        if (gun) {
          const sv = en.ammo; if ((en.ammo || 0) <= 0) en.ammo = 1;
          const pr = T.previewShot(b, en, sel, 'shot');
          en.ammo = sv;
          if (pr && pr.ok && pr.chance > 0) threats.push({ uid: en.uid, chance: pr.chance, flank: !pr.cover, melee: 0 });
        } else {
          const ap0 = en.ap; en.ap = en.maxAp;
          const r = T.reachable(b, en).dist;
          en.ap = ap0;
          const budget = Math.min(en.maxAp, (en.move || defOf(en.hero).move)) - 1;
          let near = MANH(en.x, en.y, x, y) === 1;
          for (const [dx, dy] of DIRS4) { const d = r.get(`${x + dx},${y + dy}`); if (d != null && d <= budget) near = true; }
          if (near) threats.push({ uid: en.uid, chance: null, flank: 1, melee: 1 });
        }
      }
    } finally { sel.x = ox; sel.y = oy; }
    let cover = 0;
    for (const [dx, dy] of DIRS4) { const t = tile(b.map, x + dx, y + dy); if (t && t.cover) cover = Math.max(cover, t.cover); }
    // v0.17: which rival overwatchers this route walks into (they fire at the first tile they see)
    const zones = overwatchZones(b), owBy = new Set();
    for (const st of info.path) { const e = zones.get(`${st.x},${st.y}`); if (e) for (const id of e.foe) owBy.add(id); }
    pv = { x, y, path: info.path, cost: info.cost, threats, cover, overwatch: [...owBy] };
  }
  u._pvKey = key; u._pv = pv;
  return pv;
}
function MANH(ax, ay, bx, by) { return Math.abs(ax - bx) + Math.abs(ay - by); }

// v0.17 Overwatch zones (XCOM / Invisible Inc): every open tile a watching piece can see and reach
// with its gun. Stepping into one triggers a reaction shot, so the board shows it as a hatched tile.
// Returns Map "x,y" -> { foe: [uids watching for the rivals], mine: [uids watching for your crew] }.
export function overwatchZones(b) {
  const out = new Map();
  for (const o of b.units) {
    if (o.hp <= 0 || !o.overwatch) continue;
    const gun = T.gunOf(o);
    if (!gun || (o.ammo || 0) <= 0) continue;
    const R = gun.range + (o.rangeBonus || 0);
    for (let y = Math.max(0, o.y - R); y <= Math.min(b.map.h - 1, o.y + R); y++) {
      for (let x = Math.max(0, o.x - R); x <= Math.min(b.map.w - 1, o.x + R); x++) {
        const d = MANH(o.x, o.y, x, y);
        if (d < 1 || d > R) continue;
        const t = tile(b.map, x, y);
        if (!t || t.block) continue;
        if (!T.hasLOS(b, o.x, o.y, x, y)) continue;
        const k = `${x},${y}`;
        let e = out.get(k); if (!e) { e = { foe: [], mine: [] }; out.set(k, e); }
        (o.side === 'enemy' ? e.foe : e.mine).push(o.uid);
      }
    }
  }
  return out;
}
function cachedZones(u, b) {
  let key = boardKey(b);
  for (const o of b.units) if (o.overwatch) key += '|ow' + o.uid + (o.ammo || 0);
  if (u._owKey !== key) { u._owKey = key; u._ow = overwatchZones(b); }
  return u._ow;
}

// Path ribbon on the board: dark outline + bright core, step dots, arrow head at the end.
function drawPathRibbon(g, sel, pv, z, now) {
  const pts = [{ x: sel.x, y: sel.y }, ...pv.path].map((q) => { const w = toWorld(q.x, q.y); return { x: w.x * z, y: w.y * z }; });
  g.save();
  g.lineCap = 'round'; g.lineJoin = 'round';
  const trace = () => { g.beginPath(); g.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y); };
  g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 5 * z; trace(); g.stroke();
  const danger = pv.threats.length > 0 || (pv.overwatch || []).length > 0;
  g.strokeStyle = danger ? 'rgba(255,190,90,.95)' : 'rgba(150,215,255,.95)'; g.lineWidth = 2.2 * z;
  g.setLineDash([5 * z, 3 * z]); g.lineDashOffset = -now / 40; trace(); g.stroke(); g.setLineDash([]);
  for (let i = 1; i < pts.length - 1; i++) { g.fillStyle = '#f3e7c9'; g.beginPath(); g.arc(pts[i].x, pts[i].y, 1.5 * z, 0, Math.PI * 2); g.fill(); }
  const A = pts[pts.length - 2], B = pts[pts.length - 1];
  const ang = Math.atan2(B.y - A.y, B.x - A.x);
  g.translate(B.x, B.y); g.rotate(ang);
  g.fillStyle = danger ? '#ffbe5a' : '#96d7ff';
  g.beginPath(); g.moveTo(3 * z, 0); g.lineTo(-4 * z, -3.6 * z); g.lineTo(-4 * z, 3.6 * z); g.closePath(); g.fill();
  g.restore();
}
// Threat lines from each rival who could hit the destination, with their % (or MELEE), drawn late.
function drawThreats(g, b, pv, z, now) {
  const d = toWorld(pv.x, pv.y);
  const dx = d.x * z, dy = (d.y - 12) * z;
  for (const th of pv.threats) {
    const en = b.units.find((q) => q.uid === th.uid); if (!en) continue;
    const a = en.anim && en.anim.headX != null ? { x: en.anim.headX, y: en.anim.headY } : (() => { const w = toWorld(en.x, en.y); return { x: w.x * z, y: (w.y - 18) * z }; })();
    g.save();
    g.strokeStyle = 'rgba(255,70,50,.85)'; g.lineWidth = 1.4 * z; g.setLineDash([3 * z, 2.4 * z]); g.lineDashOffset = now / 50;
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(dx, dy); g.stroke(); g.setLineDash([]);
    const txt = th.melee ? 'MELEE' : `${th.chance}%${th.flank ? ' FLANK' : ''}`;
    g.font = `bold ${Math.round(6.5 * z)}px Oswald, sans-serif`;
    const tw = g.measureText(txt).width + 6 * z;
    const mx = a.x + (dx - a.x) * 0.35, my = a.y + (dy - a.y) * 0.35;
    g.fillStyle = 'rgba(70,8,6,.92)'; g.beginPath(); g.roundRect(mx - tw / 2, my - 5.5 * z, tw, 10 * z, 2.5 * z); g.fill();
    g.fillStyle = '#ffd0c8'; g.textAlign = 'center'; g.fillText(txt, mx, my + 2 * z); g.textAlign = 'left';
    g.restore();
  }
  // AP cost chip at the destination
  const txt = `${pv.cost} AP`;
  g.save();
  g.font = `bold ${Math.round(7.5 * z)}px Oswald, sans-serif`;
  const tw = g.measureText(txt).width + 8 * z;
  g.fillStyle = 'rgba(12,30,52,.94)'; g.strokeStyle = 'rgba(150,215,255,.9)'; g.lineWidth = 0.8 * z;
  g.beginPath(); g.roundRect(dx - tw / 2, dy - 26 * z, tw, 11 * z, 3 * z); g.fill(); g.stroke();
  g.fillStyle = '#e8f4ff'; g.textAlign = 'center'; g.fillText(txt, dx, dy - 17.6 * z); g.textAlign = 'left';
  g.restore();
}
// Keep the moving piece inside the safe view (camera follow), without fighting the player's zoom.
function followCam(u, cv, wx, wy) {
  if (!u.cam || !cv) return;
  const S = safeRect(cv);
  const mx = (S.r - S.l) * 0.16, my = (S.b - S.t) * 0.16;
  const sx = u.cam.x + wx * u.cam.z, sy = u.cam.y + wy * u.cam.z;
  let ddx = 0, ddy = 0;
  if (sx < S.l + mx) ddx = S.l + mx - sx; else if (sx > S.r - mx) ddx = S.r - mx - sx;
  if (sy < S.t + my) ddy = S.t + my - sy; else if (sy > S.b - my) ddy = S.b - my - sy;
  if (ddx || ddy) { u.glide = null; u.cam.x += ddx * 0.12; u.cam.y += ddy * 0.12; }
}
function fromScreen(u, sx, sy) {
  const cam = u.cam;
  const mx = (sx - cam.x) / cam.z, my = (sy - cam.y) / cam.z;
  const gx = (mx / (TW / 2) + my / (TH / 2)) / 2;
  const gy = (my / (TH / 2) - mx / (TW / 2)) / 2;
  return { x: Math.round(gx), y: Math.round(gy) };
}

// Tap target for units: the whole floor tile (58x29 world px, far larger than the 21 px body)
// plus the body itself, so tapping a head that overlaps the tile behind still picks the unit.
function pickAt(u, b, sx, sy) {
  const base = fromScreen(u, sx, sy);
  if (!b || T.unitAt(b, base.x, base.y)) return base;
  const cam = u.cam, z = cam.z;
  const mx = (sx - cam.x) / z, my = (sy - cam.y) / z;
  let best = null, bd = 1e9;
  for (const un of b.units) {
    if (un.hp <= 0) continue;
    const p = toWorld(un.x, un.y);
    const h = Actors.actorHeight(un.hero) + 12;
    if (mx > p.x - 14 && mx < p.x + 14 && my > p.y - h && my < p.y + 4) {
      const d = Math.abs(mx - p.x) + Math.abs(my - (p.y - h / 2));
      if (d < bd) { bd = d; best = { x: un.x, y: un.y }; }
    }
  }
  return best || base;
}

// Screen-space safe rect (device px) that the HUD never covers: top bar + turn-order strip
// above, battle dock below. Units are framed inside this, never under the chrome.
function safeRect(cv) {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.width, h = cv.height;
  return { l: 10 * dpr, r: w - 10 * dpr, t: 54 * dpr, b: h - 76 * dpr };
}
// World-space box of a unit: feet tile plus head/HP bar above (actors are ~16-25 tall).
function unitBox(un) {
  const p = toWorld(un.x, un.y);
  return { minX: p.x - 30, maxX: p.x + 30, minY: p.y - 46, maxY: p.y + 16 };
}
function boxOf(list) {
  const B = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (const un of list) {
    const q = unitBox(un);
    B.minX = Math.min(B.minX, q.minX); B.maxX = Math.max(B.maxX, q.maxX);
    B.minY = Math.min(B.minY, q.minY); B.maxY = Math.max(B.maxY, q.maxY);
  }
  return B;
}
// Fit every living unit into the safe rect; if that would make operators too small, keep a
// readable zoom and slide the view so the focus unit (and its nearest foe when it fits) stays
// fully clear of the HUD.
function fitCam(b, cv, focus, userZ) {
  const us = (b.units || []).filter((un) => un.hp > 0);
  const pts = us.length ? us : [{ x: Math.floor((b.map.w || 12) / 2), y: Math.floor((b.map.h || 10) / 2) }];
  const dpr = window.devicePixelRatio || 1;
  const S = safeRect(cv);
  const sw = S.r - S.l, sh = S.b - S.t;
  const B = boxOf(pts);
  const fitZ = Math.min(sw / (B.maxX - B.minX), sh / (B.maxY - B.minY));
  const z = userZ ? userZ * dpr : Math.max(1.2 * dpr, Math.min(1.55 * dpr, fitZ));
  let x = (S.l + S.r) / 2 - ((B.minX + B.maxX) / 2) * z;
  let y = (S.t + S.b) / 2 - ((B.minY + B.maxY) / 2) * z;
  if (focus && focus.hp > 0) {
    // Priority: the acting unit, then its whole squad, then its nearest foe.
    const fits = (Q) => (Q.maxX - Q.minX) * z <= sw && (Q.maxY - Q.minY) * z <= sh;
    const mates = us.filter((o) => o.side === focus.side);
    let F = boxOf([focus]);
    const FS = boxOf(mates.length ? mates : [focus]);
    if (fits(FS)) F = FS;
    const foes = us.filter((o) => o.side !== focus.side);
    if (foes.length) {
      foes.sort((p, q) => (Math.abs(p.x - focus.x) + Math.abs(p.y - focus.y)) - (Math.abs(q.x - focus.x) + Math.abs(q.y - focus.y)));
      const F2 = boxOf([...(F === FS ? mates : [focus]), foes[0]]);
      if (fits(F2)) F = F2;
    }
    const clamp = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v)));
    x = clamp(x, S.l - F.minX * z, S.r - F.maxX * z);
    y = clamp(y, S.t - F.minY * z, S.b - F.maxY * z);
  }
  return { x, y, z };
}
// Smooth camera glide to a new framing (turn hand-offs). Cancelled by a manual drag/zoom.
function glideTo(u, to, dur = 520) {
  if (!u.cam) { u.cam = to; return; }
  u.glide = { t0: performance.now(), dur, from: { ...u.cam }, to };
}
function applyGlide(u) {
  const gl = u.glide;
  if (!gl || !u.cam) return;
  const k = Math.min(1, (performance.now() - gl.t0) / gl.dur);
  const e = k * k * (3 - 2 * k);
  u.cam.x = gl.from.x + (gl.to.x - gl.from.x) * e;
  u.cam.y = gl.from.y + (gl.to.y - gl.from.y) * e;
  u.cam.z = gl.from.z + (gl.to.z - gl.from.z) * e;
  if (k >= 1) u.glide = null;
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

// v0.17 overwatch zone tile: a light amber wash with a bold marching outline round the edge of the
// zone (rival watchers), or a faint gold wash for your own. `has(x,y)` says if a neighbour is in the zone.
function drawOwTile(g, x, y, z, now, foe, mine, tx, ty, has) {
  const w = TW * z, h = TH * z;
  const T = [x, y - h / 2], R = [x + w / 2, y], B = [x, y + h / 2], L = [x - w / 2, y];
  g.save();
  g.beginPath(); g.moveTo(...T); g.lineTo(...R); g.lineTo(...B); g.lineTo(...L); g.closePath();
  if (foe) {
    const pulse = 0.5 + 0.5 * Math.sin(now / 420);
    g.fillStyle = `rgba(255,150,40,${0.07 + 0.04 * pulse})`; g.fill();
    // outline only where the zone ends, so the danger area reads as one shape
    const edges = [];
    if (!has(tx + 1, ty)) edges.push([R, B]);
    if (!has(tx - 1, ty)) edges.push([L, T]);
    if (!has(tx, ty + 1)) edges.push([B, L]);
    if (!has(tx, ty - 1)) edges.push([T, R]);
    if (edges.length) {
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(20,10,0,0.55)'; g.lineWidth = 2.6 * z;
      g.beginPath(); for (const [a, c] of edges) { g.moveTo(...a); g.lineTo(...c); } g.stroke();
      g.strokeStyle = `rgba(255,190,70,${0.75 + 0.2 * pulse})`; g.lineWidth = 1.3 * z;
      g.setLineDash([3 * z, 2 * z]); g.lineDashOffset = -now / 60;
      g.beginPath(); for (const [a, c] of edges) { g.moveTo(...a); g.lineTo(...c); } g.stroke();
    }
  } else if (mine) {
    g.fillStyle = 'rgba(224,193,90,0.07)'; g.fill();
  }
  g.restore();
}

// v0.17 stance cue under a piece: Overwatch (gold, eye), Brace (steel blue, shield), Taunt (orange).
function drawStanceRing(g, x, y, z, now, kind) {
  const col = kind === 'ow' ? '224,193,90' : kind === 'brace' ? '140,190,240' : kind === 'mark' ? '255,70,60' : kind === 'guard' ? '120,200,255' : kind === 'exposed' ? '255,200,120' : '255,150,60';
  const pulse = 0.5 + 0.5 * Math.sin(now / 300);
  g.save();
  g.strokeStyle = `rgba(${col},${0.65 + 0.3 * pulse})`;
  g.lineWidth = 1.3 * z;
  g.setLineDash(kind === 'ow' ? [3 * z, 2 * z] : kind === 'brace' ? [] : [1.5 * z, 1.5 * z]);
  g.lineDashOffset = -now / (kind === 'ow' ? 45 : 90);
  g.beginPath(); g.ellipse(x, y, (10.5 + pulse) * z, (4.8 + pulse * 0.45) * z, 0, 0, Math.PI * 2); g.stroke();
  if (kind === 'mark') {
    // v0.19 Marked: crosshair ticks on the ring
    g.setLineDash([]); g.lineWidth = 1.1 * z;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      g.beginPath(); g.moveTo(x + dx * 8.5 * z, y + dy * 3.6 * z); g.lineTo(x + dx * 13.5 * z, y + dy * 6.2 * z); g.stroke();
    }
  }
  g.restore();
}

// v0.20.2 lesson marker: a pulsing gold tile outline and a bobbing arrow over what the tip says to tap
function drawSpot(g, sp, z, now, un) {
  const p = toWorld(sp.x, sp.y), x = p.x * z, y = p.y * z, k = 0.5 + 0.5 * Math.sin(now / 220);
  const hx = TW / 2 * z * (0.92 + 0.08 * k), hy = TH / 2 * z * (0.92 + 0.08 * k);
  g.save();
  g.beginPath(); g.moveTo(x, y - hy); g.lineTo(x + hx, y); g.lineTo(x, y + hy); g.lineTo(x - hx, y); g.closePath();
  g.fillStyle = `rgba(240,190,60,${0.14 + 0.14 * k})`; g.fill();
  g.lineJoin = 'round';
  g.strokeStyle = `rgba(255,210,90,${0.65 + 0.35 * k})`; g.lineWidth = 2.2 * z; g.stroke();
  const top = y - (un ? Actors.actorHeight(un.hero) + 14 : 18) * z - k * 5 * z, s = 6 * z;
  g.beginPath(); g.moveTo(x - s, top - s); g.lineTo(x + s, top - s); g.lineTo(x, top + s * 0.6); g.closePath();
  g.fillStyle = '#ffd25a'; g.strokeStyle = 'rgba(20,14,6,.85)'; g.lineWidth = 1.4 * z; g.fill(); g.stroke();
  g.restore();
}

// v0.19 Jinx's tripwire on the board (only her own side sees it): two posts and a taut wire.
function drawTrap(g, x, y, z, now) {
  const glint = 0.5 + 0.5 * Math.sin(now / 260);
  g.save();
  g.strokeStyle = 'rgba(30,24,18,0.9)'; g.lineWidth = 1.4 * z;
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(x + s * 6 * z, y + s * 1.5 * z); g.lineTo(x + s * 6 * z, y + s * 1.5 * z - 3.5 * z); g.stroke(); }
  g.strokeStyle = `rgba(220,230,240,${0.55 + 0.4 * glint})`; g.lineWidth = 0.6 * z;
  g.beginPath(); g.moveTo(x - 6 * z, y - 1.5 * z - 2.8 * z); g.lineTo(x + 6 * z, y + 1.5 * z - 2.8 * z); g.stroke();
  g.fillStyle = 'rgba(200,60,40,0.9)'; g.beginPath(); g.arc(x, y - 2.8 * z, 0.9 * z, 0, Math.PI * 2); g.fill();
  g.restore();
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

function drawOverwatchCone(g, x, y, z, facing, now) {
  const fac = facing || 1;
  const ang = fac > 0 ? -0.45 : Math.PI + 0.45;
  const r = 58 * z;
  const pulse = 0.5 + 0.5 * Math.sin((now || 0) / 280);
  g.save();
  // Dark underlay so the cone reads on blue move tiles and crate tops.
  g.fillStyle = `rgba(8, 6, 2, ${0.32 + 0.08 * pulse})`;
  g.beginPath();
  g.moveTo(x, y);
  g.arc(x, y, r, ang - 0.58, ang + 0.58);
  g.closePath();
  g.fill();
  g.fillStyle = `rgba(232, 196, 70, ${0.30 + 0.10 * pulse})`;
  g.strokeStyle = 'rgba(255, 230, 120, 0.95)';
  g.lineWidth = 1.8 * z;
  g.beginPath();
  g.moveTo(x, y);
  g.arc(x, y, r, ang - 0.58, ang + 0.58);
  g.closePath();
  g.fill();
  g.stroke();
  // Inner chevron ticks along the arc for XCOM-style readability.
  g.strokeStyle = 'rgba(255, 245, 180, 0.85)';
  g.lineWidth = 1.2 * z;
  const inner = r * 0.62;
  for (let i = -2; i <= 2; i++) {
    const a = ang + i * 0.22;
    g.beginPath();
    g.moveTo(x + Math.cos(a) * inner, y + Math.sin(a) * inner);
    g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    g.stroke();
  }
  g.restore();
}

// ---------- occlusion: cutaway, fade and x-ray ----------
// Adapted from the mafia game's v0.7 cutaway: (1) containers in front of the acting/selected
// unit, its move, its target or your finger drop to a knee-high stub (held 700 ms, eased 150 ms);
// (2) other tall props covering any unit ease to 0.4 alpha; (3) a unit still covered by
// something drawn after it is re-drawn on top as a team-coloured silhouette. Purely visual:
// cover, line of sight and hit chance come from the map tiles and are untouched.
const HY_ = 14.5;
function occH(t) {
  if (!t || !t.decor || t.decor === 'lamp') return 0; // a lamp post is too thin to hide anyone
  if (t.decor === 'container' || Dock.isTall(t)) return Dock.propHeight(t);
  const h = Dock.propHeight(t);
  return h >= 16 && t.decor !== 'lamp' ? h : 0;
}
// Does a prop of height H standing on (px,py) cover a figure of height bodyH standing on (fx,fy)?
function covers(px, py, H, fx, fy, bodyH) {
  const dd = (px + py) - (fx + fy);
  if (dd <= 0.01) return 0;
  const lat = Math.abs((px - py) - (fx - fy));
  if (lat > 1.2) return 0;
  // how far the prop's top edge rises above the figure's feet, in world px
  const rise = H + HY_ * (1 - Math.min(1, lat)) - dd * HY_;
  if (rise <= 4) return 0;
  return Math.min(1, rise / Math.max(8, bodyH));
}
function runKey(t, x, y) { return t.decor === 'container' && t.run ? `r${t.run.id}` : `t${x},${y}`; }
// The far tile of a two-tile prop (van, parked car, wagon...) is drawn by its anchor, but it still hides units.
function partTiles(m) {
  const out = [];
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const t = m.tiles[y][x];
    if (!Dock.skipPairedEast(t) || !t.partner) continue;
    const a = m.tiles[t.partner.y] && m.tiles[t.partner.y][t.partner.x];
    if (a) out.push({ x, y, a, ax: t.partner.x, ay: t.partner.y });
  }
  return out;
}
function occlusionPass(u, b, sprites, sel, actor, now) {
  const st = u.occ || (u.occ = { cut: new Map(), fa: new Map(), xa: new Map(), last: now });
  const dt = Math.min(100, Math.max(0, now - st.last)); st.last = now;
  const props = [];
  for (const sp of sprites) if (sp.typ === 'prop') { const H = occH(sp.t); if (H) props.push({ x: sp.x, y: sp.y, fx: sp.x, fy: sp.y, t: sp.t, H, key: runKey(sp.t, sp.x, sp.y) }); }
  if (!st.parts || st.partsMap !== b.map) { st.parts = partTiles(b.map); st.partsMap = b.map; }
  for (const q of st.parts) { const H = occH(q.a); if (H) props.push({ x: q.x, y: q.y, fx: q.ax, fy: q.ay, t: q.a, H, key: runKey(q.a, q.ax, q.ay), part: 1 }); }
  const units = sprites.filter((sp) => sp.typ === 'unit' && (sp.un.hp > 0 || sp.un.ko));
  // 1) cut points
  const pts = [];
  const add = (x, y, h) => pts.push({ x, y, h });
  for (const s2 of units) {
    const un = s2.un;
    const focusU = (actor && actor.uid === un.uid) || (sel && sel.uid === un.uid) || (u.pathAnim && u.pathAnim.uid === un.uid)
      || (u.cutFocus && now < u.cutFocus.until && u.cutFocus.uids.includes(un.uid)) || (u.hover && u.hover.uid === un.uid);
    if (focusU) add(s2.x, s2.y, Actors.actorHeight(un.hero));
  }
  if (sel && u.hover) add(u.hover.x, u.hover.y, 12);
  const hit = new Set();
  for (const pr of props) {
    if (!Dock.canCut(pr.t)) continue;
    for (const q of pts) if (covers(pr.x, pr.y, pr.H, q.x, q.y, q.h) > 0.25) { hit.add(pr.key); break; }
  }
  for (const k of hit) { const c = st.cut.get(k) || { k: 0, t: 0 }; c.t = now; st.cut.set(k, c); }
  for (const [k, c] of st.cut) {
    const tg = now - c.t < Dock.CUT.HOLD ? 1 : 0;
    c.k = tg ? Math.min(1, c.k + dt / Dock.CUT.ANIM) : Math.max(0, c.k - dt / Dock.CUT.ANIM);
    if (!tg && c.k <= 0) st.cut.delete(k);
  }
  const cutOf = (pr) => (st.cut.get(pr.key) || { k: 0 }).k;
  // 2) fade + 3) x-ray, for every standing unit
  const fadeT = new Map();
  const xray = [];
  const kf = 1 - Math.exp(-dt / 70), kx = 1 - Math.exp(-dt / 80);
  for (const s2 of units) {
    if (s2.un.hp <= 0) continue;
    const bh = Actors.actorHeight(s2.un.hero);
    let hidden = 0;
    for (const pr of props) {
      const c = covers(pr.x, pr.y, pr.H, s2.x, s2.y, bh);
      if (!c) continue;
      const ck = cutOf(pr);
      if (ck > 0.5) continue; // cut to a stub: no longer hides anyone
      fadeT.set(`${pr.fx},${pr.fy}`, 0.4);
      hidden = Math.max(hidden, c);
    }
    const prev = st.xa.get(s2.un.uid) || 0;
    const tgt = hidden > 0.3 ? 0.62 : 0;
    let v = prev + (tgt - prev) * kx; if (v < 0.01) v = 0;
    st.xa.set(s2.un.uid, v);
    if (v > 0) xray.push({ un: s2.un, x: s2.x, y: s2.y, a: v });
  }
  for (const pr of props) {
    if (pr.part) continue;
    const k = `${pr.x},${pr.y}`;
    const tg = fadeT.get(k) || 1;
    const prev = st.fa.has(k) ? st.fa.get(k) : 1;
    let v = prev + (tg - prev) * kf; if (Math.abs(v - tg) < 0.01) v = tg;
    if (v >= 1) st.fa.delete(k); else st.fa.set(k, v);
  }
  return {
    alpha: (x, y) => st.fa.get(`${x},${y}`) ?? 1,
    cut: (t) => { if (!Dock.canCut(t)) return 0; const pr = props.find((p) => p.t === t); return pr ? cutOf(pr) : 0; },
    xray,
  };
}
let XCV = null;
function drawXray(g, list, z, now) {
  if (!list.length) return;
  const W = g.canvas.width, H = g.canvas.height;
  if (!XCV) XCV = document.createElement('canvas');
  if (XCV.width !== W || XCV.height !== H) { XCV.width = W; XCV.height = H; }
  const x = XCV.getContext('2d');
  x.__noShadow = true;
  const T = g.getTransform();
  for (const it of list) {
    const p = toWorld(it.x, it.y);
    const sx = p.x * z, sy = p.y * z;
    const hh = (Actors.actorHeight(it.un.hero) + 14) * z;
    // device-space box around the figure
    const bx = Math.floor(T.a * (sx - 24 * z) + T.e), by = Math.floor(T.d * (sy - hh) + T.f);
    const bw = Math.ceil(T.a * 48 * z) + 2, bhh = Math.ceil(T.d * (hh + 6 * z)) + 2;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(bx, by, bw, bhh);
    x.save();
    x.beginPath(); x.rect(bx, by, bw, bhh); x.clip();
    x.setTransform(T);
    Actors.drawActor(x, it.un, sx, sy, z, now);
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = it.un.side === 'player' ? '#5aa8ff' : '#ff5a48';
    x.fillRect(bx, by, bw, bhh);
    x.restore();
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = it.a;
    g.drawImage(XCV, bx, by, bw, bhh, bx, by, bw, bhh);
    g.restore();
  }
}

function drawChanceTag(g, cx, ly, z, tw, prev, showParts) {
  const label = `${prev.chance}%`;
  g.font = `bold ${Math.round(7.5 * z)}px Oswald, sans-serif`;
  g.textAlign = 'center';
  g.fillStyle = 'rgba(10,8,8,0.82)';
  g.beginPath(); g.roundRect(cx - tw / 2, ly - 7.5 * z, tw, 9.5 * z, 2.5 * z); g.fill();
  g.fillStyle = chanceColor(prev.chance);
  g.fillText(label, cx, ly);
  const badgeY = ly - 3 * z;
  drawShieldBadge(g, cx - tw / 2 - 5 * z, badgeY, z * 0.7, prev.cover);
  if (prev.flanked) drawFlankBadge(g, cx + tw / 2 + 5 * z, badgeY, z * 0.7);
  const cov = prev.flanked ? 'FLANK' : prev.cover >= 2 ? 'FULL' : prev.cover === 1 ? 'HALF' : 'OPEN';
  g.font = `bold ${Math.round(4.8 * z)}px Inter, sans-serif`;
  g.fillStyle = prev.flanked ? '#f0c040' : prev.cover >= 1 ? '#c8e4ff' : '#a0a0a8';
  g.fillText(cov, cx, ly - 9.5 * z);
  if (showParts) drawChanceBreakdown(g, cx, ly - 16 * z, z, prev);
  g.textAlign = 'left';
}
const overlaps = (a, b, gap = 0) => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
// Hit-chance tags: nudge each one up past any HP bar (other than its own unit's) or earlier tag it would cover.
function drawTags(g, q, bars, z) {
  const placed = [];
  for (const t of q.sort((a, c) => c.y - a.y)) {
    let dy = 0;
    for (let k = 0; k < 10; k++) {
      const r = { x: t.x, y: t.y + dy, w: t.w, h: t.h };
      const hit = bars.filter((o) => o.uid !== t.uid).concat(placed).find((o) => overlaps(r, o, z));
      if (!hit) break;
      dy = hit.y - t.h - z - t.y;
    }
    t.y += dy; placed.push(t);
    g.save();
    if (dy < -3 * z) {
      g.strokeStyle = 'rgba(240,230,210,0.55)'; g.lineWidth = 0.7 * z;
      g.beginPath(); g.moveTo(t.cx, t.y + t.h); g.lineTo(t.cx, t.by - 0.5 * z); g.stroke();
    }
    t.draw(dy); g.restore();
  }
}

// Speech bubbles for small units: compact, and laid out greedily so bunched quips stack
// upward instead of overprinting each other (or the HP bars beneath them).
function drawBubbles(g, q, z, now, avoid = []) {
  if (!q.length) return;
  const dpr = window.devicePixelRatio || 1;
  const fs = Math.max(9 * dpr, 5.8 * z);
  const pad = fs * 0.55, th = fs * 1.6, gap = 2 * dpr;
  g.save();
  g.font = `600 ${Math.round(fs)}px Inter, sans-serif`;
  g.textAlign = 'center';
  const boxes = q.map((it) => {
    const tw = Math.min(170 * dpr, g.measureText(it.bub.text).width + pad * 2);
    return { ...it, tw, bx: it.x - tw / 2, by: it.y - 5 * dpr - th };
  }).sort((a, c) => c.y - a.y); // nearest (lowest on screen) first keeps its spot
  const placed = [];
  for (const bx of boxes) {
    for (let k = 0; k < 8; k++) {
      const r = { x: bx.bx, y: bx.by, w: bx.tw, h: th };
      const hit = placed.map((o) => ({ x: o.bx, y: o.by, w: o.tw, h: th })).concat(avoid).find((o) => overlaps(r, o, gap));
      if (!hit) break;
      bx.by = hit.y - th - gap;
    }
    placed.push(bx);
  }
  for (const it of placed) {
    const age = now - it.bub.t;
    const enter = Math.min(1, age / 160);
    const pop = enter < 1 ? 1.12 * (1 - Math.pow(1 - enter, 3)) : 1;
    const fade = Math.min(1, (it.bub.until - now) / 280);
    const cxp = it.bx + it.tw / 2, base = it.by + th;
    g.save();
    g.globalAlpha = fade;
    // leader from the bubble down to the speaker (tail when unshifted)
    g.strokeStyle = it.side === 'player' ? 'rgba(111,168,255,0.7)' : 'rgba(255,90,72,0.7)';
    g.lineWidth = 1 * dpr;
    if (base < it.y - 6 * dpr) { g.beginPath(); g.moveTo(cxp, base); g.lineTo(it.x, it.y - 1 * dpr); g.stroke(); }
    g.translate(cxp, base); g.scale(pop, pop);
    g.fillStyle = 'rgba(14,12,10,0.94)';
    g.lineWidth = 1.2 * dpr;
    g.beginPath(); g.roundRect(-it.tw / 2, -th, it.tw, th, 4 * dpr); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(-3 * dpr, 0); g.lineTo(3 * dpr, 0); g.lineTo(0, 4.5 * dpr); g.closePath(); g.fill();
    g.fillStyle = '#f3e7c9';
    g.fillText(it.bub.text, 0, -th * 0.3, it.tw - pad);
    g.restore();
  }
  g.restore();
}

function drawApPips(g, cx, y, z, cur, max, cost) {
  const n = Math.max(1, max || 1);
  const r = 1.5 * z, gap = 4.2 * z;
  const totalW = (n - 1) * gap;
  for (let i = 0; i < n; i++) {
    const x = cx - totalW / 2 + i * gap;
    const filled = i < cur;
    const spent = cost > 0 && i >= cur - cost && i < cur;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    if (spent) {
      g.fillStyle = '#e0c15a';
      g.fill();
      g.strokeStyle = '#f8e89a';
      g.lineWidth = 1 * z;
      g.stroke();
    } else if (filled) {
      g.fillStyle = '#d8e8ff';
      g.fill();
    } else {
      g.strokeStyle = '#8a8580';
      g.lineWidth = 1 * z;
      g.stroke();
    }
  }
}

function modeApCost(mode, def) {
  if (!mode) return 0;
  if (mode === 'aimed') return 3;
  if (mode === 'hunker' || mode === 'fortify') return 1;
  if (mode === 'medkit') return 2;
  if (mode === 'overwatch' || mode === 'dash' || mode === 'sprint') return 2;
  const a = (def && def.abilities || []).find((x) => x.id === mode || x.kind === mode);
  return a && a.ap || (mode === 'shot' || mode === 'breach' ? 2 : 0);
}

function drawDestCover(g, b, x, y, sx, sy, z) {
  let best = 0;
  for (const [dx, dy] of DIRS4) {
    const t = tile(b.map, x + dx, y + dy);
    if (!t || !t.cover) continue;
    best = Math.max(best, t.cover);
    const n = toWorld(x + dx, y + dy);
    const ex = sx + (n.x * z - sx) * 0.42;
    const ey = sy + (n.y * z - sy) * 0.42;
    drawShieldBadge(g, ex, ey, z * 0.92, t.cover);
  }
  const label = best >= 2 ? 'FULL' : best === 1 ? 'HALF' : 'OPEN';
  g.font = `bold ${Math.round(8 * z)}px Inter, sans-serif`;
  g.textAlign = 'center';
  const tw = g.measureText(label).width + 8 * z;
  g.fillStyle = 'rgba(10,8,8,0.78)';
  g.beginPath(); g.roundRect(sx - tw / 2, sy + 6 * z, tw, 12 * z, 3 * z); g.fill();
  g.fillStyle = best >= 1 ? '#c8e4ff' : '#a0a0a8';
  g.fillText(label, sx, sy + 15.5 * z);
}

function drawChanceBreakdown(g, cx, y, z, prev) {
  const parts = prev.parts || [];
  if (!parts.length) return;
  const lines = parts.filter((p) => p.label !== 'Aim' || parts.length <= 4);
  const rows = ['Aim ' + (parts[0] && parts[0].val != null ? parts[0].val : '')]
    .concat(lines.slice(1).map((p) => `${p.val > 0 ? '+' : ''}${p.val} ${p.label}`))
    .concat([`= ${prev.chance}%`]);
  // Don't repeat Aim if we already list it
  const body = lines.map((p, i) => {
    if (i === 0 && p.label === 'Aim') return `${p.val}  Aim`;
    const sign = p.val > 0 ? '+' : '';
    return `${sign}${p.val}  ${p.label}`;
  });
  body.push(`=  ${prev.chance}%`);
  const fs = Math.round(5.6 * z);
  g.font = `${fs}px Inter, sans-serif`;
  let maxW = 0;
  for (const s of body) maxW = Math.max(maxW, g.measureText(s).width);
  const pad = 3.5 * z, lh = 7.4 * z;
  const w = maxW + pad * 2, h = body.length * lh + pad * 0.6;
  const x = cx - w / 2, top = y - h;
  g.fillStyle = 'rgba(8,7,8,0.88)';
  g.beginPath(); g.roundRect(x, top, w, h, 3 * z); g.fill();
  g.strokeStyle = 'rgba(240, 193, 90, 0.35)';
  g.lineWidth = 1;
  g.stroke();
  g.textAlign = 'left';
  body.forEach((s, i) => {
    const last = i === body.length - 1;
    g.fillStyle = last ? chanceColor(prev.chance) : s.startsWith('+') ? '#8fd18f' : s.startsWith('-') ? '#e07a6a' : '#f3e7c9';
    g.font = `${last ? 'bold ' : ''}${fs}px Inter, sans-serif`;
    g.fillText(s, x + pad, top + pad + (i + 0.75) * lh);
  });
}

function drawShieldIcon(g, x, y, z) {
  const s = 5 * z;
  g.save(); g.translate(x, y);
  g.fillStyle = 'rgba(10,18,30,0.9)'; g.beginPath(); g.arc(0, 0, s * 1.15, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#a9cdf0';
  g.beginPath(); g.moveTo(0, -s * 0.75); g.lineTo(s * 0.62, -s * 0.48); g.lineTo(s * 0.55, s * 0.15); g.quadraticCurveTo(s * 0.3, s * 0.62, 0, s * 0.8); g.quadraticCurveTo(-s * 0.3, s * 0.62, -s * 0.55, s * 0.15); g.lineTo(-s * 0.62, -s * 0.48); g.closePath(); g.fill();
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
    // Re-renders recreate the canvas at the same size: keep the camera. Only refit when the
    // viewport really changed (rotation, resize).
    if (!u.cam || u.camW !== cv.width || u.camH !== cv.height) {
      u.cam = fitCam(b, cv, T.actingUnit(b), u.userZ);
      u.glide = null;
    }
    u.camW = cv.width; u.camH = cv.height;
  }
  if (!u.cam) u.cam = fitCam(b, cv, T.actingUnit(b), u.userZ);
  const fx0 = Vfx.ensure(u);
  {
    const act = T.actingUnit(b);
    if (act && act.hp > 0 && u.camFor !== act.uid && !fx0.pan) {
      const first = !u.camFor;
      u.camFor = act.uid;
      if (!first) glideTo(u, fitCam(b, cv, act, u.userZ));
    }
    if (!fx0.pan) applyGlide(u);
  }
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
  {
    // night tint + vignette live in a CSS layer over the canvas: composited, never re-rasterised
    const tv = cv.nextElementSibling;
    if (tv && tv.classList.contains('tvig')) {
      const k = `${w}x${h}|${b.map.env && b.map.env.time}`;
      if (tv.dataset.k !== k) { tv.style.background = Dock.screenTint(w, h, b.map); tv.dataset.k = k; }
    }
  }

  const fx = Vfx.ensure(u);
  const dt = Math.min(0.05, Math.max(0, (now - (u.lastFx || now)) / 1000));
  u.lastFx = now;
  Vfx.tick(fx, dt);
  Vfx.applyPan(fx, cam);
  const nudge = Vfx.nudgeOffset(fx, cam, cv);
  const offX = cam.x + shakeX + nudge.x, offY = cam.y + shakeY + nudge.y;
  // Static ground layer (v0.18): sky + baked yard + close-zoom detail + scorch marks. While the camera
  // holds still it is painted once into a layer and the frame starts with a single copy of it; while
  // the camera moves it is drawn directly (a layer is only built once the same view repeats).
  {
    const sky = Dock.skyCanvas(cv.width, cv.height, b.map);
    g.setTransform(1, 0, 0, 1, offX, offY);
    const gk = `${offX},${offY},${z},${cv.width}x${cv.height},${Dock.groundSig(g, b.map, z)},${b.map.theme},${b.map.env && b.map.env.time}`;
    g.setTransform(1, 0, 0, 1, 0, 0);
    const paintGround = (gg) => {
      gg.setTransform(1, 0, 0, 1, 0, 0);
      gg.globalCompositeOperation = 'copy'; gg.drawImage(sky, 0, 0); gg.globalCompositeOperation = 'source-over';
      gg.setTransform(1, 0, 0, 1, offX, offY);
      Dock.drawYardStatic(gg, b.map, z);
      gg.setTransform(1, 0, 0, 1, 0, 0);
    };
    if (u._gk !== gk && u._gkPrev === gk) {
      const L = u._gcv || (u._gcv = document.createElement('canvas'));
      if (L.width !== cv.width || L.height !== cv.height) { L.width = cv.width; L.height = cv.height; }
      paintGround(L.getContext('2d'));
      u._gk = gk;
    }
    if (u._gk === gk && u._gcv) { g.globalCompositeOperation = 'copy'; g.drawImage(u._gcv, 0, 0); g.globalCompositeOperation = 'source-over'; }
    else paintGround(g);
    u._gkPrev = gk;
  }
  g.save();
  g.translate(offX, offY);

  const actor = T.actingUnit(b);
  const sel = (actor && actor.side === 'player' && actor.hp > 0)
    ? actor
    : b.units.find((x) => x.uid === u.sel && x.hp > 0);
  const reach = (sel && b.side === 'player' && !u.busy && !(actor && u.deselFor === actor.uid)) ? cachedReach(u, b, sel).dist : null;
  // v0.15: the destination being previewed (tap on touch, hover with a mouse)
  let pv = null;
  if (reach && sel && sel.side === 'player') {
    if (u.preview) pv = movePreview(u, b, sel, u.preview.x, u.preview.y);
    else if (u.ptr === 'mouse' && u.hover && !u.hover.uid && reach.has(`${u.hover.x},${u.hover.y}`) && !(sel.x === u.hover.x && sel.y === u.hover.y) && !u.mode?.match?.(/breach/)) pv = movePreview(u, b, sel, u.hover.x, u.hover.y);
    if (u.preview && !pv) u.preview = null;
  }
  // inspected rival: its reach this turn in red (Fire Emblem danger zone)
  const insp = u.inspect && b.units.find((q) => q.uid === u.inspect && q.hp > 0 && q.side === 'enemy');
  let danger = null;
  if (insp) {
    const dk = insp.uid + '#' + boardKey(b);
    if (u._dangerKey !== dk) { const ap0 = insp.ap; insp.ap = insp.maxAp; u._danger = T.reachable(b, insp).dist; insp.ap = ap0; u._dangerKey = dk; }
    danger = u._danger;
  }

  // tile draw order + key strings are fixed per map: built once, not every frame
  if (u._orderMap !== b.map || !u._order) {
    const o = [];
    for (let y = 0; y < b.map.h; y++) for (let x = 0; x < b.map.w; x++) { const p = toWorld(x, y); o.push({ x, y, depth: x + y, k: `${x},${y}`, wx: p.x, wy: p.y }); }
    o.sort((a, c) => a.depth - c.depth);
    u._order = o; u._orderMap = b.map;
  }
  const order = u._order;

  Dock.prepMap(b.map);
  Dock.drawYardLive(g, b.map, z, now);
  Dock.drawBackdrop(g, b.map, z, now);
  for (const sp of Dock.sceneryOf(b.map)) if (sp.depth < 0) Dock.drawScenery(g, sp, z, now);
  const owz = cachedZones(u, b);
  for (const c of order) {
    const t = tile(b.map, c.x, c.y);
    const sx = c.wx * z, sy = c.wy * z;
    const oz = owz.size ? owz.get(c.k) : null;
    if (oz) drawOwTile(g, sx, sy, z, now, oz.foe.length > 0, oz.mine.length > 0, c.x, c.y, (qx, qy) => { const e = owz.get(`${qx},${qy}`); if (e && e.foe.length) return true; const tt = tile(b.map, qx, qy); return !!(tt && tt.block); });
    if (reach && reach.has(c.k) && !t.block && !(sel && sel.x === c.x && sel.y === c.y)) {
      hexPoly(g, sx, sy, z, 'rgba(70,140,255,0.22)', 'rgba(140,190,255,0.55)');
    }
    if (danger && danger.has(c.k) && !t.block) hexPoly(g, sx, sy, z, 'rgba(255,60,40,0.16)', 'rgba(255,110,90,0.45)');
    if (pv && pv.x === c.x && pv.y === c.y) {
      hexPoly(g, sx, sy, z, pv.threats.length ? 'rgba(255,170,60,0.28)' : 'rgba(120,200,255,0.30)', pv.threats.length ? '#ffbe5a' : '#9fdcff');
      drawDestCover(g, b, c.x, c.y, sx, sy, z);
    }
    if (sel && u.hover && u.hover.x === c.x && u.hover.y === c.y && !(pv && pv.x === c.x && pv.y === c.y)) {
      hexPoly(g, sx, sy, z, 'rgba(255,220,120,0.16)', '#f0d060');
      if (!u.hover.uid && reach && reach.has(c.k) && !t.block && !(sel.x === c.x && sel.y === c.y)) {
        drawDestCover(g, b, c.x, c.y, sx, sy, z);
      }
    }
    if (sel && u.mode === 'breach' && sel.side === 'player') {
      const cp = T.previewCharge(b, sel, c.x, c.y);
      if (cp.ok) hexPoly(g, sx, sy, z, 'rgba(255,140,40,0.20)', 'rgba(255,170,70,0.85)');
      if (cp.ok && u.hover && u.hover.x === c.x && u.hover.y === c.y) Dock.drawBlastPreview(g, sx, sy, z, cp.radius);
    }
    if (sel && sel.side === 'player' && T.TILE_KINDS.includes(u.mode)) {
      const tp = T.previewTile(b, sel, u.mode, c.x, c.y);
      if (tp.ok) hexPoly(g, sx, sy, z, u.mode === 'flash' ? 'rgba(235,240,255,0.16)' : u.mode === 'flare' ? 'rgba(255,90,60,0.14)' : 'rgba(200,210,220,0.14)', u.mode === 'flash' ? 'rgba(240,245,255,0.8)' : u.mode === 'flare' ? 'rgba(255,120,90,0.8)' : 'rgba(210,220,230,0.7)');
      if (tp.ok && tp.radius && u.hover && u.hover.x === c.x && u.hover.y === c.y) Dock.drawBlastPreview(g, sx, sy, z, tp.radius);
    }
    if ((b.traps || []).some((tr) => tr.x === c.x && tr.y === c.y && tr.side === 'player')) drawTrap(g, sx, sy, z, now);
    if (u.mode !== 'breach' && sel && u.hover && u.hover.x === c.x && u.hover.y === c.y && T.isExplosiveAt(b, c.x, c.y)) {
      const prev = T.previewProp(b, sel, c.x, c.y);
      if (prev && prev.ok) Dock.drawBlastPreview(g, sx, sy, z, prev.radius || 1);
    }
  }

  if (pv && sel) drawPathRibbon(g, sel, pv, z, now);
  const sprites = [];
  for (const c of order) {
    const t = tile(b.map, c.x, c.y);
    if (!t || !t.decor || Dock.skipPairedEast(t)) continue;
    const depth = c.x + c.y + (Dock.isPairedWest(t) ? 0.5 : 0);
    sprites.push({ depth, typ: 'prop', x: c.x, y: c.y, t });
  }
  for (const sp of Dock.sceneryOf(b.map)) if (sp.depth >= 0) sprites.push({ depth: sp.depth, typ: 'scen', sp });
  const focus = [];
  for (const un of b.units) {
    let x = un.x, y = un.y;
    if (u.pathAnim && u.pathAnim.uid === un.uid) { x = u.pathAnim.x; y = u.pathAnim.y; }
    sprites.push({ depth: x + y, typ: 'unit', un, x, y });
    if (un.hp > 0 || un.ko) focus.push({ x, y });
  }
  const occ = occlusionPass(u, b, sprites, sel, actor, now);
  sprites.sort((a, c) => a.depth - c.depth || (a.typ === 'unit' ? 1 : 0) - (c.typ === 'unit' ? 1 : 0));

  const bubQ = [], tagQ = [], barR = [], lateQ = [];
  for (const sp of sprites) {
    if (sp.typ === 'prop') {
      const p = toWorld(sp.x, sp.y);
      const a = occ.alpha(sp.x, sp.y);
      g.save(); g.globalAlpha = a;
      sp.t.__cut = occ.cut(sp.t);
      Dock.drawProp(g, sp.t, p.x * z, p.y * z, z, now);
      g.restore();
      continue;
    }
    if (sp.typ === 'scen') { Dock.drawScenery(g, sp.sp, z, now); continue; }
    const un = sp.un;
    const p = toWorld(sp.x, sp.y);
    const sx = p.x * z, sy = p.y * z;
    const dead = un.hp <= 0;
    const acting = actor && actor.uid === un.uid;
    const def = defOf(un.hero);
    Actors.tickAnim(un, now, !!(u.hitstop && now < u.hitstop));
    if (un.hp > 0) {
      // v0.17: stance rings replace the old decorative cone; the real Overwatch reach is the hatched zone
      if (un.overwatch) drawStanceRing(g, sx, sy, z, now, 'ow');
      if (un.brace) drawStanceRing(g, sx, sy, z, now, 'brace');
      if (b.units.some((o) => o.hp > 0 && o.taunt === un.uid)) drawStanceRing(g, sx, sy, z, now, 'taunt');
      if (un.marked > 0) drawStanceRing(g, sx, sy, z, now, 'mark');
      if (un.guardedBy || un.guarding) drawStanceRing(g, sx, sy, z, now, 'guard');
      if (un.exposed) drawStanceRing(g, sx, sy, z, now, 'exposed');
    }
    let cx = sx, cy = sy - 10 * z, r = 16 * z;
    g.save();
    // v0.19 Hidden pieces fade into the dark (the rival sees an even fainter outline)
    if (un.hidden > 0 && un.hp > 0) g.globalAlpha = un.side === 'player' ? 0.5 : 0.28;
    if (Actors.hasActor(un.hero)) {
      if (u.flash && u.flash.uid === un.uid && now < u.flash.until && !Actors.isFig()) {
        const a = Actors.ensureAnim(un); a.flash = Math.max(a.flash, 0.7);
      }
      const pose = Actors.drawActor(g, un, sx, sy, z, now, acting ? 2 : (sel && sel.uid === un.uid) ? 1 : 0);
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
    if (Actors.hasActor(un.hero) && !dead && !Actors.isFig()) {
      // XCOM-style team disc under the feet: blue for your crew, red for the rivals.
      g.fillStyle = un.side === 'player' ? 'rgba(77,143,224,0.18)' : 'rgba(224,64,52,0.2)';
      g.beginPath(); g.ellipse(sx, sy, 8 * z, 3.5 * z, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = un.overwatch ? '#e0c15a' : acting ? '#f0d060' : un.side === 'player' ? 'rgba(120,186,255,0.9)' : 'rgba(255,92,72,0.9)';
      g.lineWidth = (acting ? 1.3 : 0.75) * z;
      g.beginPath(); g.ellipse(sx, sy, 8 * z, 3.5 * z, 0, 0, Math.PI * 2); g.stroke();
    }
    const bw = 12 * z, bh = 1.8 * z;
    const barY = Actors.hasActor(un.hero) ? cy - 8 * z : cy + r + 2 * z;
    // HP bar, AP pips, ammo chip, overwatch eye and blast preview are drawn after every prop and
    // the x-ray pass, so a unit behind a container never loses its bar.
    lateQ.push(() => { g.save();
    g.fillStyle = un.side === 'player' ? 'rgba(10,20,34,0.8)' : 'rgba(40,8,6,0.8)';
    g.fillRect(cx - bw / 2 - 0.6 * z, barY - 0.6 * z, bw + 1.2 * z, bh + 1.2 * z);
    g.fillStyle = un.side === 'player'
      ? (un.hp / un.maxHp > 0.5 ? '#5dba6a' : un.hp / un.maxHp > 0.25 ? '#e0c15a' : '#d4544a')
      : (un.hp / un.maxHp > 0.25 ? '#ff5a48' : '#ff9a3a');
    g.fillRect(cx - bw / 2, barY, bw * Math.max(0, un.hp / un.maxHp), bh);
    if (!dead && un.side === 'player' && b.side === 'player' && (acting || (sel && sel.uid === un.uid))) {
      const defn = def || defOf(un.hero);
      const cost = (u.abilityHover && u.abilityHover.ap) || modeApCost(u.mode, defn);
      drawApPips(g, cx, barY - 3.5 * z, z, un.ap, un.maxAp, acting || (sel && sel.uid === un.uid) ? cost : 0);
    }
    if (!dead) {
      g.font = `bold ${Math.round(4.2 * z)}px Inter, sans-serif`;
      g.textAlign = 'left';
      const ammoTxt = (un.ammo || 0) > 0 ? String(un.ammo) : '×';
      const aw = g.measureText(ammoTxt).width + 2.4 * z;
      const ax = cx + (Actors.hasActor(un.hero) ? bw / 2 + 1.4 * z : r - 2 * z);
      const ay = barY + 2.2 * z;
      g.fillStyle = (un.ammo || 0) > 0 ? 'rgba(20,24,16,0.85)' : 'rgba(60,18,14,0.9)';
      g.beginPath(); g.roundRect(ax, ay - 4 * z, aw, 5 * z, 1.1 * z); g.fill();
      g.fillStyle = (un.ammo || 0) > 0 ? '#f3e7c9' : '#e07a6a';
      g.fillText(ammoTxt, ax + 1.2 * z, ay - 0.3 * z);
    }
    if (un.overwatch && un.hp > 0) {
      drawOverwatchEye(g, cx, barY - 6 * z, z * 0.7);
    }
    if (un.brace && un.hp > 0) drawShieldIcon(g, cx + (un.overwatch ? 7 * z : 0), barY - 6 * z, z * 0.7);
    // v0.14: small status chips to the left of the HP bar (XCOM style), and a marker on the inspected piece
    if (!dead) drawStatusChips(g, T.statusesOf(b, un), cx - bw / 2 - 1.6 * z, barY + 0.9 * z, z);
    if (u.inspect === un.uid) {
      g.strokeStyle = un.side === 'player' ? 'rgba(140,200,255,.95)' : 'rgba(255,200,90,.95)';
      g.lineWidth = 1 * z; g.setLineDash([2.2 * z, 1.6 * z]);
      g.lineDashOffset = -now / 60;
      g.beginPath(); g.ellipse(sx, sy, 9.5 * z, 4.3 * z, 0, 0, Math.PI * 2); g.stroke();
      g.setLineDash([]);
    }
    if (sel && u.mode === 'breach' && u.hover && un.hp > 0 && Math.abs(un.x - u.hover.x) + Math.abs(un.y - u.hover.y) <= T.CHARGE.radius && T.previewCharge(b, sel, u.hover.x, u.hover.y).ok) {
      // Into-the-Breach style damage preview on everyone in the blast, friend or foe.
      const txt = `-${T.CHARGE.dmg}`;
      g.font = `600 ${Math.round(8 * z)}px Oswald, sans-serif`;
      const tw = g.measureText(txt).width + 5 * z;
      g.fillStyle = un.side === 'player' ? 'rgba(201,48,44,.95)' : 'rgba(255,140,40,.95)';
      g.beginPath(); g.roundRect(cx - tw / 2, barY - 13 * z, tw, 10 * z, 2.5 * z); g.fill();
      g.fillStyle = '#fff'; g.textAlign = 'center';
      g.fillText(txt, cx, barY - 5.5 * z); g.textAlign = 'left';
    }
    g.restore(); });
    if (sel && u.mode !== 'breach' && un.side !== sel.side && un.hp > 0 && (u.hover && u.hover.uid === un.uid || u.mode)) {
      const prev = T.previewShot(b, sel, un, ['aimed', 'melee', 'knife', 'roll', 'venom', 'suppress', 'pounce', 'maul', 'smash', 'backstab', 'hamstring', 'mark', 'bribe'].includes(u.mode) ? u.mode : defaultMode(sel, un));
      if (prev && prev.ok) {
        // queued: laid out after all units so it never sits on a neighbour's HP bar
        const showParts = !!(u.hover && u.hover.uid === un.uid && prev.parts && prev.parts.length);
        g.font = `bold ${Math.round(7.5 * z)}px Oswald, sans-serif`;
        const tw = g.measureText(`${prev.chance}%`).width + 6 * z;
        const ly0 = barY - 3.5 * z;
        tagQ.push({ uid: un.uid, cx, by: barY, x: cx - tw / 2 - 10 * z, y: ly0 - 13 * z, w: tw + 20 * z, h: 15 * z, hover: showParts, draw: (dy) => drawChanceTag(g, cx, ly0 + dy, z, tw, prev, showParts) });
      }
    }
    // speech bubble: queued, laid out after all units so bunched quips never overprint
    const bub = (u.bubbles || []).find((bb) => bb.uid === un.uid && now < bb.until);
    if (bub) bubQ.push({ bub, x: cx, y: barY - 4 * z, side: un.side });
    if (!dead) barR.push({ uid: un.uid, x: cx - bw / 2 - z, y: barY - 4.5 * z, w: bw + 9 * z, h: 7 * z });
    g.restore();
  }
  drawXray(g, occ.xray, z, now);
  for (const f of lateQ) f();
  if (pv) drawThreats(g, b, pv, z, now);
  drawTags(g, tagQ, barR, z);
  drawBubbles(g, bubQ, z, now, barR.concat(tagQ));

  if (u.spot && b.status === 'active') drawSpot(g, u.spot, z, now, T.unitAt(b, u.spot.x, u.spot.y));
  Vfx.draw(g, fx, z);

  // Howl: a shock ring out to the ability radius (a Manhattan diamond, exactly the tiles it reaches)
  if (u.howlRing) {
    const k = (now - u.howlRing.t0) / 900;
    if (k >= 1) u.howlRing = null;
    else {
      const { x: hx, y: hy, r } = u.howlRing, rr = r * Math.min(1, k * 1.6);
      const pts = [toWorld(hx + rr, hy), toWorld(hx, hy + rr), toWorld(hx - rr, hy), toWorld(hx, hy - rr)];
      g.save();
      g.globalAlpha = Math.max(0, 1 - k);
      g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x * z, p.y * z) : g.moveTo(p.x * z, p.y * z))); g.closePath();
      const rc = u.howlRing.col || '224,165,38';
      g.fillStyle = `rgba(${rc},0.08)`; g.fill();
      // glow as soft layered strokes (no shadowBlur: that was a full blur pass every frame of the ring)
      g.lineJoin = 'round';
      for (const [lw, a] of [[15, 0.10], [9, 0.18], [5.5, 0.3]]) { g.strokeStyle = `rgba(${rc},${a})`; g.lineWidth = lw * z; g.stroke(); }
      g.strokeStyle = `rgb(${rc})`; g.lineWidth = 3 * z; g.stroke();
      g.restore();
    }
  }
  // v0.19 flashbang: a brief white-out of the whole board
  if (u.whiteout) {
    const k = (now - u.whiteout.t0) / (u.whiteout.until - u.whiteout.t0);
    if (k >= 1) u.whiteout = null;
    else { g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = `rgba(255,255,250,${0.55 * (1 - k) * (1 - k)})`; g.fillRect(0, 0, g.canvas.width, g.canvas.height); g.restore(); }
  }
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

  u.floats = u.floats.filter((f) => now - f.t < (f.pill ? 1250 : 900));
  for (const f of u.floats) {
    const age = now - f.t;
    if (age < 0) continue; // delayed pop not due yet
    const k = age / (f.pill ? 1250 : 900);
    const pop = age < 100 ? 0.5 + 0.9 * (age / 100) : age < 180 ? 1.4 - 0.4 * ((age - 100) / 80) : 1;
    g.save();
    g.globalAlpha = 1 - k * k;
    // Floats are stored at the zoom they were spawned at; rescale if a camera pan zoomed since.
    const rs = f.z0 ? z / f.z0 : 1;
    // stack numbers that land on the same spot at nearly the same time
    const n = u.floats.filter((o) => o !== f && o.t < f.t && f.t - o.t < 500 && Math.abs(o.x - f.x) < 16 * z && Math.abs(o.y - f.y) < 12 * z).length;
    const fy = f.y * rs - k * 16 * z - n * 10 * z;
    g.translate(f.x * rs, fy);
    g.scale(pop, pop);
    g.font = `bold ${Math.round((f.crit ? 13 : f.dmg ? 11.5 : 10) * z)}px Oswald, sans-serif`;
    g.textAlign = 'center';
    g.lineJoin = 'round';
    g.lineWidth = 2.2 * z;
    g.strokeStyle = 'rgba(10,8,8,0.8)';
    if (f.pill) {
      // v0.17 status popup: a small coloured tag with the status name
      g.font = `bold ${Math.round(8.5 * z)}px Oswald, sans-serif`;
      const tw2 = g.measureText(f.text).width, ph = 11 * z, pw = tw2 + 12 * z;
      g.fillStyle = 'rgba(12,10,10,0.82)';
      g.beginPath(); g.roundRect(-pw / 2, -ph * 0.78, pw, ph, ph / 2); g.fill();
      g.lineWidth = 1.2 * z; g.strokeStyle = f.pill; g.stroke();
      g.fillStyle = f.pill;
      g.fillText(f.text, 0, ph * 0.02);
    } else {
    g.fillStyle = f.heal ? '#8fe08f' : f.miss ? '#d0d0d0' : (f.crit ? '#ffd23a' : '#ff6a52');
    g.strokeText(f.text, 0, 0);
    g.fillText(f.text, 0, 0);
    }
    g.restore();
  }
  g.restore();
  Dock.drawWeather(g, cv.width, cv.height, b.map, now, true);

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
    let frac = seg - i;
    if (Actors.isFig() && !a.leap) {
      // board-piece hop: ease each tile so the piece lands and settles before the next hop
      const mv = b && b.units.find((x) => x.uid === a.uid);
      if (mv && mv.anim) mv.anim.hop = t >= 1 ? 0 : frac;
      frac = frac * frac * (3 - 2 * frac);
    }
    const A = pts[i], B = pts[i + 1];
    a.x = A.x + (B.x - A.x) * frac;
    a.y = A.y + (B.y - A.y) * frac;
    if (a.leap) { const lift = Math.sin(Math.PI * t) * 0.7; a.x -= lift; a.y -= lift; }
    if (a.stepI !== i) {
      if (a.stepI != null && Actors.isFig() && !a.leap && u.cam) { const lp = toWorld(pts[i].x, pts[i].y); Vfx.spawnDust(Vfx.ensure(u), lp.x * u.cam.z, lp.y * u.cam.z, u.cam.z, 3); }
      a.stepI = i; Audio.play('footstep');
      // v0.17: turn to face each hop's direction (crisp pivot), not just the final tile
      { const mv = b && b.units.find((x) => x.uid === a.uid); if (mv && !a.leap) Actors.faceToward(mv, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y); }
    }
    if (!a.noFollow && !(u.fx && u.fx.pan)) { const w = toWorld(a.x, a.y); followCam(u, document.getElementById('tacv'), w.x, w.y - 16); }
    if (t >= 1) u.pathAnim = null;
  }
  if (b && !u.busy) syncTimer(u, b);
  { const t0 = performance.now(); draw(ctx); const dt = performance.now() - t0; // v0.18: draw-time ring buffer for the perf tests
    const pf = u.perf || (u.perf = { ms: new Float32Array(120), i: 0, n: 0 }); pf.ms[pf.i] = dt; pf.i = (pf.i + 1) % 120; pf.n++; }
  if (b && !u.busy && pvpTimerOn(b) && b.side === 'player' && u.deadline && remainMs(u) <= 0) {
    u.deadline = 0;
    doAct(ctx, { type: 'timeout' });
  }
  raf = requestAnimationFrame(() => loop(ctx));
}

// Zoom about a screen point (device px). Zoom is stored relative to dpr so it behaves the same on
// every screen, and remembered (u.userZ) so turn hand-offs keep the player's zoom.
const ZMIN = 0.6, ZMAX = 4.2;
function zoomAt(u, sx, sy, f) {
  if (!u.cam) return;
  const dpr = window.devicePixelRatio || 1;
  const before = fromScreen(u, sx, sy);
  u.glide = null;
  u.cam.z = Math.max(ZMIN * dpr, Math.min(ZMAX * dpr, u.cam.z * f));
  u.userZ = u.cam.z / dpr;
  const p = toWorld(before.x, before.y);
  u.cam.x = sx - p.x * u.cam.z;
  u.cam.y = sy - p.y * u.cam.z;
}

function bindCanvas(ctx) {
  const cv = document.getElementById('tacv');
  if (!cv || cv._bound) return;
  cv._bound = true;
  const u = ui(ctx);
  let drag = null, last = null;
  const pts = new Map();
  let pinch = null;
  const pinchDist = () => { const [a, c] = [...pts.values()]; return Math.hypot(a.x - c.x, a.y - c.y) || 1; };
  const pinchMid = () => { const [a, c] = [...pts.values()]; return { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 }; };
  cv.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const b = ctx.state.tactics; if (!b) return;
    const rect = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    const p = pickAt(u, b, (e.clientX - rect.left) * dpr, (e.clientY - rect.top) * dpr);
    const t = T.unitAt(b, p.x, p.y) || koAt(b, p.x, p.y);
    u.inspect = t ? t.uid : null; ctx.render();
  });
  cv.addEventListener('pointerdown', (e) => {
    u.ptr = e.pointerType || 'mouse';
    cv.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) { pinch = { d: pinchDist() }; last = null; drag = null; return; }
    last = { x: e.clientX, y: e.clientY, t: Date.now(), moved: 0 };
    drag = { x: e.clientX, y: e.clientY };
  });
  const lift = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
  cv.addEventListener('pointerup', lift);
  cv.addEventListener('pointercancel', lift);
  cv.addEventListener('pointermove', (e) => {
    if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size === 2) {
      const d = pinchDist(), m = pinchMid();
      const rect = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      zoomAt(u, (m.x - rect.left) * dpr, (m.y - rect.top) * dpr, d / pinch.d);
      pinch.d = d;
      return;
    }
    if (drag && last) {
      const dx = e.clientX - last.x, dy = e.clientY - last.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) {
        last.moved = 1;
        u.glide = null;
        u.cam.x += dx * (window.devicePixelRatio || 1);
        u.cam.y += dy * (window.devicePixelRatio || 1);
        last.x = e.clientX; last.y = e.clientY;
      }
    }
    const rect = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const b = ctx.state.tactics;
    if (!b) return;
    const p = pickAt(u, b, (e.clientX - rect.left) * dpr, (e.clientY - rect.top) * dpr);
    const occ = T.unitAt(b, p.x, p.y);
    u.hover = occ ? { x: p.x, y: p.y, uid: occ.uid } : { x: p.x, y: p.y };
  });
  const up = (e) => {
    if (!last) return;
    const was = last; last = null; drag = null;
    if (was.moved) return;
    const rect = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const p = pickAt(u, ctx.state.tactics, (e.clientX - rect.left) * dpr, (e.clientY - rect.top) * dpr);
    clickTile(ctx, p.x, p.y);
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', () => { last = null; drag = null; });
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const dpr = window.devicePixelRatio || 1;
    const rect = cv.getBoundingClientRect();
    zoomAt(u, (e.clientX - rect.left) * dpr, (e.clientY - rect.top) * dpr, e.deltaY > 0 ? 0.9 : 1.11);
  }, { passive: false });
}

// Tapping a foe with no ability picked: bruisers swing when adjacent (or have no gun), others shoot.
function defaultMode(sel, foe) {
  const adj = Math.abs(sel.x - foe.x) + Math.abs(sel.y - foe.y) === 1;
  if (defOf(sel.hero).template && sel.mel && (adj || !T.gunOf(sel))) return 'melee';
  return 'shot';
}

// XCOM-style inspect: any piece can be tapped at any time to open its status panel.
function setInspect(ctx, uid) {
  const u = ui(ctx);
  if (u.inspect === uid) return;
  u.inspect = uid || null; u.preview = null;
  ctx.render();
}
const EXPLICIT_ATTACK = ['shot', 'aimed', 'melee', 'knife', 'roll', 'venom', 'suppress', 'pounce', 'maul', 'lunge', 'smash', 'backstab', 'hamstring', 'mark', 'bribe'];
// v0.19 targeting families for the new kits
const ALLY_MODES = ['patch', 'medkit', 'heal', 'revive', 'guard', 'stim', 'resupply'];
const MELEE_MODES = ['melee', 'knife', 'lunge', 'roll', 'pounce', 'maul', 'smash', 'cleave', 'backstab', 'hamstring'];

function clickTile(ctx, x, y) {
  const b = ctx.state.tactics, u = ui(ctx);
  if (!b || b.status !== 'active') return;
  const occ = T.unitAt(b, x, y);
  const down = koAt(b, x, y);
  const myTurn = !u.busy && b.side === 'player';
  const sel = T.actingUnit(b);
  const canAct = myTurn && sel && sel.side === 'player' && sel.hp > 0;
  const heal = ALLY_MODES.includes(u.mode);
  // v0.19 tile-targeted kit (Flare, Flashbang, Tripwire) fires on the tapped tile, even under a rival
  if (canAct && T.TILE_KINDS.includes(u.mode)) {
    const tp = T.previewTile(b, sel, u.mode, x, y);
    if (tp.ok) return doAct(ctx, { type: u.mode, uid: sel.uid, x, y });
    ctx.toast(tp.reason || 'Pick another tile'); return;
  }
  // Pure inspection: rival turn, tapping an ally (unless healing) or a knocked-out piece.
  if (!canAct) { const t = occ || down; setInspect(ctx, t ? t.uid : null); return; }
  // v0.19.1 deselect: tapping the selected operator again puts them down (and shows their own buffs)
  const desel = u.deselFor === sel.uid;
  if (!desel && occ && occ.uid === sel.uid && !heal && !(u.modePicked && u.mode && !EXPLICIT_ATTACK.includes(u.mode))) return deselect(ctx, sel.uid);
  if (desel) {
    // nothing selected: any piece opens its status panel; a reachable tile is a deliberate move, so pick the
    // operator back up and preview it; empty ground just closes the panel
    if (occ && occ.uid === sel.uid) { u.deselFor = null; u.inspect = null; ctx.render(); return; }
    if (occ || down) { setInspect(ctx, (occ || down).uid); return; }
    if (T.walkable(b, x, y, sel.uid) && cachedReach(u, b, sel).dist.has(`${x},${y}`)) {
      u.deselFor = null; u.inspect = null;
      if (u.ptr === 'mouse') return doAct(ctx, { type: 'move', uid: sel.uid, x, y }, { undoable: true });
      u.preview = { x, y }; ctx.render(); return;
    }
    if (u.inspect) { u.inspect = null; ctx.render(); }
    return;
  }
  if ((occ && occ.side === 'player' && !heal) || (!occ && down && !heal)) { setInspect(ctx, (occ || down).uid); return; }
  // Enemy: on touch the first tap inspects and shows the attack button (hit % and damage); a second tap or the
  // button fires. A mouse click fires straight away when the shot is possible (hovering already shows the odds);
  // right-click inspects.
  const mouseFire = u.ptr === 'mouse' && occ && occ.side === 'enemy' && (() => { const pr = T.previewShot(b, sel, occ, EXPLICIT_ATTACK.includes(u.mode) ? u.mode : defaultMode(sel, occ)); return pr && pr.ok; })();
  if (occ && occ.side === 'enemy' && u.inspect !== occ.uid && !mouseFire && !(u.modePicked && EXPLICIT_ATTACK.includes(u.mode) && b.intro !== 1)) {
    u.hover = { x, y, uid: occ.uid };
    setInspect(ctx, occ.uid); return;
  }
  if (u.inspect) { u.inspect = null; }
  u.sel = sel.uid;
  if (['guard', 'stim', 'resupply'].includes(u.mode) && occ && occ.side === 'player') {
    return doAct(ctx, { type: u.mode, uid: sel.uid, target: occ.uid });
  }
  if ((u.mode === 'patch' || u.mode === 'medkit' || u.mode === 'heal' || u.mode === 'revive') && (occ || down)) {
    const t = occ || down;
    if (t.side === 'player') {
      const typ = (u.mode === 'heal' || u.mode === 'patch') ? 'heal' : 'medkit';
      return doAct(ctx, { type: typ, uid: sel.uid, target: t.uid });
    }
  }
  if (u.mode === 'breach') {
    const cp = T.previewCharge(b, sel, x, y);
    if (cp.ok) return doAct(ctx, { type: 'breach', uid: sel.uid, x, y });
  }
  if (occ && occ.side === 'player' && occ.uid !== sel.uid) return;
  if (occ && occ.side === 'enemy') {
    const mode = u.mode || defaultMode(sel, occ);
    return doAct(ctx, { type: mode, uid: sel.uid, target: occ.uid, mode });
  }
  if (T.isExplosiveAt(b, x, y)) {
    return doAct(ctx, { type: 'shootProp', uid: sel.uid, x, y, mode: 'shot' });
  }
  if (sel && T.walkable(b, x, y, sel.uid)) {
    // v0.15: on touch the first tap previews the path, cost and danger; tap the same tile again (or Move) to go.
    const reachable = cachedReach(u, b, sel).dist.has(`${x},${y}`);
    if (u.ptr !== 'mouse' && reachable && !(u.preview && u.preview.x === x && u.preview.y === y)) {
      u.preview = { x, y }; u.inspect = null; ctx.render(); return;
    }
    if (reachable) return doAct(ctx, { type: 'move', uid: sel.uid, x, y }, { undoable: true });
  }
  // v0.19.1: empty ground out of reach first clears whatever is open (preview, picked ability, panel);
  // with nothing open it deselects the operator
  if (u.preview || u.inspect || u.modePicked) { u.preview = null; u.inspect = null; u.mode = null; u.modePicked = false; ctx.render(); return; }
  if (occ || down) { ctx.render(); return; }
  deselect(ctx);
}
function deselect(ctx, show = null) {
  const u = ui(ctx), b = ctx.state.tactics, a = b && T.actingUnit(b);
  if (!a || a.side !== 'player') return;
  u.deselFor = a.uid; u.preview = null; u.inspect = show; u.mode = null; u.modePicked = false; u.hover = null;
  ctx.render();
}

// v0.17 hit-chance breakdown (XCOM): group previewShot parts into base aim, cover, range/flank,
// status and other, so the player sees at a glance why a shot is 45% and not 80%.
const ODDS_GROUP = {
  'Half cover': 'Cover', 'Full cover': 'Cover', Fortify: 'Cover',
  Range: 'Range', 'Close range': 'Range', 'Long shot': 'Range', Flank: 'Flank', 'Knife flank': 'Flank', Sneak: 'Flank',
  Shaken: 'Status', Taunted: 'Status', Suppressed: 'Status', Rallied: 'Status', Dodge: 'Status', 'Moved rat': 'Status', Overwatch: 'Status',
};
export function oddsGroups(prev) {
  const parts = (prev && prev.parts) || [];
  const order = ['Aim', 'Cover', 'Range', 'Flank', 'Status', 'Bonus'];
  const sum = new Map(order.map((k) => [k, { key: k, val: 0, items: [] }]));
  for (const p of parts) {
    const k = p.label === 'Aim' ? 'Aim' : (ODDS_GROUP[p.label] || 'Bonus');
    const g = sum.get(k); g.val += p.val; g.items.push(p);
  }
  const rows = order.map((k) => sum.get(k)).filter((g) => g.key === 'Aim' || g.items.length);
  const total = rows.reduce((a, g) => a + g.val, 0);
  return { rows, total, chance: prev ? prev.chance : 0, capped: prev && total !== prev.chance };
}
const ODDS_LABEL = { Aim: 'Base aim', Cover: 'Cover', Range: 'Range', Flank: 'Flank', Status: 'Status', Bonus: 'Perks & kit' };
function oddsBreakdownHtml(prev, compact) {
  const og = oddsGroups(prev);
  if (!og.rows.length) return '';
  const sgn = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v);
  if (compact) {
    return `<div class="tabodds" id="tabodds">${og.rows.map((g) => `<span class="${g.key === 'Aim' ? 'base' : g.val >= 0 ? 'up' : 'dn'}" title="${esc(g.items.map((q) => q.label + ' ' + q.val).join(', '))}"><em>${ODDS_LABEL[g.key]}</em>${g.key === 'Aim' ? g.val : sgn(g.val)}</span>`).join('')}</div>`;
  }
  return `<div class="tibrk" id="tibrk">${og.rows.map((g) => `<div class="${g.key === 'Aim' ? 'base' : g.val >= 0 ? 'up' : 'dn'}"><span>${ODDS_LABEL[g.key]}${g.key !== 'Aim' && g.items.length && !(g.items.length === 1 && ODDS_LABEL[g.key] === g.items[0].label) ? `<small>${g.items.map((q) => esc(q.label)).join(', ')}</small>` : ''}</span><b>${g.key === 'Aim' ? g.val : sgn(g.val)}</b></div>`).join('')}<div class="tot"><span>Hit chance${og.capped ? ' <small>(5–95% cap)</small>' : ''}</span><b>${og.chance}%</b></div></div>`;
}

// v0.15 action bar (bottom centre): move preview confirm, undo, and the big attack button with hit % and damage.
function actionBarHtml(b, u, canAct, actor) {
  if (!canAct || !actor) return '';
  const out = [];
  const pv = u.preview ? movePreview(u, b, actor, u.preview.x, u.preview.y) : null;
  if (pv) {
    const flank = pv.threats.filter((t) => t.flank).length;
    const owN = (pv.overwatch || []).map((id) => b.units.find((q) => q.uid === id)).filter(Boolean);
    const owWarn = owN.length ? `<span class="tabwarn ow">◉ Walks into Overwatch (${owN.map((q) => esc(defOf(q.hero).name)).join(', ')})</span>` : '';
    const warn = owWarn + (pv.threats.length
      ? `<span class="tabwarn">⚠ ${pv.threats.length} rival${pv.threats.length > 1 ? 's' : ''} can hit you here${flank ? ` · ${flank} flanking` : ''}</span>`
      : `<span class="tabok">${pv.cover >= 2 ? 'Full cover' : pv.cover ? 'Half cover' : 'No cover'} · safe from rival fire</span>`);
    out.push(`<button class="btn red tabgo" data-act="tmoveGo">Move here · ${pv.cost} AP</button><div class="tabwarns">${warn}</div><button class="btn dim tabx" data-act="tmoveCancel" aria-label="Cancel">✕</button>`);
  } else if (u.inspect) {
    const en = b.units.find((q) => q.uid === u.inspect && q.side === 'enemy' && q.hp > 0);
    if (en) {
      const mode = EXPLICIT_ATTACK.includes(u.mode) ? u.mode : defaultMode(actor, en);
      const pr = T.previewShot(b, actor, en, mode);
      const nm = (defOf(actor.hero).abilities.find((a) => a.id === mode) || {}).name || (mode === 'melee' ? 'Strike' : 'Shoot');
      if (pr && pr.ok) {
        const band = pr.chance >= 75 ? 'hi' : pr.chance >= 50 ? 'mid' : 'lo';
        const dmg = pr.dmg ? `${pr.dmg[0]}–${pr.dmg[1]} dmg` : '';
        out.push(`<button class="btn red tabatk" data-act="tconfirm" data-uid="${en.uid}"><span class="tabico">${abilityIcon(ICONS[mode] ? mode : 'shot')}</span><b>${esc(nm)}</b><span class="tabpct ${band}">${pr.chance}%</span><span class="tabdmg">${dmg}</span></button><span class="tabwarn dim">on ${esc(defOf(en.hero).name)}</span>${oddsBreakdownHtml(pr, true)}`);
      } else {
        out.push(`<span class="tabwarn">${esc((pr && pr.reason) || 'Out of reach')}: move closer or pick another target</span>`);
      }
    }
  }
  if (!pv && u.undo && u.undo.uid === actor.uid) out.push(`<button class="btn dim tabundo" data-act="tundo">↶ Undo move</button>`);
  if (!out.length) return '';
  return `<div class="tabar">${out.join('')}</div>`;
}

// The XCOM-style panel for the inspected piece: vitals, every buff and debuff in plain words.
function inspectHtml(b, u) {
  const un = u.inspect && b.units.find((x) => x.uid === u.inspect);
  if (!un) return '';
  const d = defOf(un.hero), cls = classOf(d);
  const sts = T.statusesOf(b, un);
  const gun = T.gunOf(un), mel = un.mel;
  const foe = un.side === 'enemy';
  const sel = T.actingUnit(b);
  let atk = '';
  if (foe && un.hp > 0 && sel && sel.side === 'player' && b.side === 'player' && !u.busy && u.deselFor !== sel.uid) {
    const mode = EXPLICIT_ATTACK.includes(u.mode) ? u.mode : defaultMode(sel, un);
    const prev = T.previewShot(b, sel, un, mode);
    const nm = (defOf(sel.hero).abilities.find((a) => a.id === mode) || {}).name || (mode === 'melee' ? 'Strike' : 'Shoot');
    // v0.15: the attack button lives in the action bar (bottom left); the panel lists the odds
    atk = prev && prev.ok
      ? `<div class="tiodds">${esc(nm)}: <b>${prev.chance}%</b>${prev.dmg ? ` · ${prev.dmg[0]}–${prev.dmg[1]} dmg` : ''}</div>${oddsBreakdownHtml(prev, false)}`
      : `<div class="tinone">${esc((prev && prev.reason) || 'Out of reach')}</div>`;
  }
  const pct = Math.max(0, Math.round(100 * un.hp / un.maxHp));
  return `<div class="tinsp ${foe ? 'foe' : ''}" id="tinsp">
    <div class="tihead"><img loading="lazy" decoding="async" src="${d.thumb || d.portrait}" alt=""><div><b>${esc(d.name)}</b><span>${foe ? 'Rival' : 'Your crew'} · ${esc(d.roleTag || (cls && cls.name) || d.role || '')} · ${esc(d.species || '')}</span></div><button class="tix" data-act="closeInspect" aria-label="Close">×</button></div>
    <div class="tihp"><i style="width:${pct}%"></i><span>${Math.max(0, un.hp)}/${un.maxHp} HP</span></div>
    <div class="tistats"><span><em>Armour</em>${un.armor || 0}</span><span><em>AP</em>${un.ap}/${un.maxAp}</span><span><em>Move</em>${un.move}</span><span><em>Aim</em>${d.aim + (un.aimMod || 0)}</span><span><em>Ammo</em>${gun ? (un.ammo || 0) : '–'}</span>${un.dodge ? `<span><em>Dodge</em>${un.dodge}%</span>` : ''}</div>
    <div class="tiwep">${gun ? `${esc(gun.name)} ${gun.dmg[0]}–${gun.dmg[1]} · rng ${gun.range + (un.rangeBonus || 0)}` : 'No gun'}${mel ? ` · ${esc(mel.name)} ${mel.dmg[0] + (un.mdmg || 0)}–${mel.dmg[1] + (un.mdmg || 0)}` : ''}</div>
    <div class="tists">${sts.length ? sts.map((st) => `<div class="tist ${st.kind}"><i>${statusSvg(st.id)}</i><div><b>${esc(st.name)}${st.turns != null ? `<small>${st.id === 'bleed' || st.id === 'venom' ? `${st.turns} left` : `${st.turns} turn${st.turns > 1 ? 's' : ''}`}</small>` : ''}</b><span>${esc(st.text)}</span></div></div>`).join('') : '<div class="tinone">No buffs or debuffs.</div>'}</div>
    ${atk}
  </div>`;
}

// v0.17 floating status popups (Bleeding, Shaken, Taunted...) drawn as coloured tags over the piece.
const STATUS_POP = { BLINDED: '#f4f4ff', MARKED: '#ff5a48', EXPOSED: '#ffc878', JAMMED: '#7aa8ff', 'PAID OFF': '#e0c15a', SLOWED: '#c89a6a', HIDDEN: '#9aa0b8', REVEALED: '#c8ccd8', STIMMED: '#7fe0ff', GUARDED: '#8ac8ff', 'ON THE RADIO': '#8fe0a8', BLEEDING: '#ff5a4a', SHAKEN: '#d9a3ff', TAUNTED: '#ff9f43', SUPPRESSED: '#9fb4c8', RALLIED: '#8fe08f', STUBBORN: '#e0c15a', POISONED: '#9be36a', BRACED: '#a9cdf0', OVERWATCH: '#e0c15a' };
function statusPop(u, unit, text, delay = 0) {
  if (!unit || !u.cam) return;
  const q = toWorld(unit.x, unit.y), z = u.cam.z;
  u.floats.push({ t: performance.now() + delay, x: q.x * z, y: (q.y - Actors.actorHeight(unit.hero) - 7) * z, z0: z, text, pill: STATUS_POP[text] || '#f4f0e4' });
}

async function playEvents(ctx, events) {
  const u = ui(ctx), b = ctx.state.tactics;
  const cv = document.getElementById('tacv');
  const dpr = window.devicePixelRatio || 1;
  const skip = ctx.fast;
  const wait = (ms) => skip ? Promise.resolve() : new Promise((r) => setTimeout(r, ms / SPEED));
  for (const ev of events || []) {
    if (ev.typ === 'move' && ev.path && ev.path.length) {
      const start = ev.from || ev.path[0];
      Audio.play('move');
      say(u, b, ev.uid, 'move');
      const mover = b.units.find((x) => x.uid === ev.uid);
      if (mover && ev.path.length) {
        const dest = ev.path[ev.path.length - 1];
        u.cutFocus = { uids: [mover.uid], until: performance.now() + ev.path.length * 320 + 600 };
        Actors.faceToward(mover, start.x, start.y, ev.path[0].x, ev.path[0].y);
        Actors.playClip(mover, 'walk');
      }
      // v0.17 pacing: rivals hop a little quicker so their turn stays snappy but readable
      const rival = mover && mover.side === 'enemy' ? 0.8 : 1;
      u.pathAnim = { uid: ev.uid, path: ev.path, from: start, t0: performance.now(), dur: Math.max(180, ev.path.length * (Actors.isFig() ? Actors.FIG_STEP_MS : 140) * rival) / SPEED, x: start.x, y: start.y, noFollow: !!ev.noFollow };
      await wait(u.pathAnim.dur);
      u.pathAnim = null;
      if (mover) { if (mover.anim) mover.anim.hop = null; Actors.playClip(mover, 'idle'); }
    }
    if (ev.typ === 'shot' || ev.typ === 'overwatch' || ev.mode) {
      const att = b.units.find((x) => x.uid === ev.uid);
      const def = b.units.find((x) => x.uid === ev.target);
      if (att && def && cv && u.cam) {
        const a = toWorld(att.x, att.y), tw = toWorld(def.x, def.y);
        const zz = u.cam.z;
        const melee = MELEE_MODES.includes(ev.mode) || (ev.typ === 'shot' && !T.gunOf(att));
        u.flash = { uid: def.uid, until: performance.now() + 220, muzzle: !melee };
        u.cutFocus = { uids: [att.uid, def.uid], until: performance.now() + 1600 };
        Actors.faceToward(att, att.x, att.y, def.x, def.y);
        Actors.playClip(att, melee ? 'melee' : 'shoot', melee ? { lunge: { x: tw.x - a.x, y: tw.y - a.y } } : {});
        if (ev.typ === 'overwatch' && ev.target) {
          Vfx.spawnCallout(Vfx.ensure(u), a.x * zz, (a.y - 30) * zz, 'OVERWATCH', 'overwatch');
          Audio.play('overwatch');
        }
        Audio.playShoot(att.hero, melee);
        if (ev.mode === 'maul') { Audio.play('maul'); Vfx.spawnCallout(Vfx.ensure(u), a.x * zz, (a.y - Actors.actorHeight(att.hero) - 22) * zz, 'MAUL', 'crit'); }
        if (SIGNATURE[ev.mode]) { Audio.play(SIGNATURE[ev.mode].sfx); Vfx.spawnCallout(Vfx.ensure(u), a.x * zz, (a.y - Actors.actorHeight(att.hero) - 22) * zz, SIGNATURE[ev.mode].word, 'crit'); }
        say(u, b, ev.uid, 'shoot');
        const midX = ((a.x + tw.x) / 2) * zz, midY = ((a.y + tw.y) / 2) * zz;
        Vfx.panCam(Vfx.ensure(u), u.cam, (a.x + tw.x) / 2, (a.y + tw.y) / 2, cv, {
          zoom: ev.crit ? 1.20 : ev.typ === 'overwatch' ? 1.14 : 1.16,
          durIn: ev.typ === 'overwatch' ? 200 : 260,
          hold: 500,
          durOut: 420,
        });
        Vfx.nudgeToward(Vfx.ensure(u), midX, midY, ev.crit ? 1.2 : 0.9);
        await wait(melee ? 170 : 110);
        const an = Actors.ensureAnim(att);
        const gx = an.gunX != null ? an.gunX : (a.x * zz);
        const gy = an.gunY != null ? an.gunY : ((a.y - 16) * zz);
        const tH = Actors.actorHeight((b.units.find((x) => x.uid === ev.target) || {}).hero);
        const tx = tw.x * zz, ty = (tw.y - tH * 0.55) * zz;
        const fac = an.facing || 1;
        if (!melee) {
          // v0.14 gunshot: muzzle flash, tracer to the target, sparks on a hit or a ricochet behind on a miss
          const gun = T.gunOf(att);
          Vfx.spawnShot(u.fx, gx, gy, tx, ty, zz, { hit: ev.hit, pellets: gun && gun.typ === 'shotgun' ? 5 : 1, missSide: ev.roll % 2 ? 1 : -1 });
          Vfx.spawnCasings(u.fx, gx, gy, fac, 1);
        }
        await wait(melee ? 20 : 120);
        if (ev.hit) {
          u.shake = ev.crit ? 12 : 8; Audio.play('hit');
          // v0.17: a crisper freeze-frame on contact (longer on crits and finishing blows) and a star flash
          u.hitstop = performance.now() + (ev.ko ? 150 : ev.crit ? 130 : 85);
          Vfx.spawnHitPop(Vfx.ensure(u), tx, ty, zz, ev.crit || ev.ko);
          // knock-back along the line of the attack, red flash for blows, white for bullets
          const dl = Math.hypot(tw.x - a.x, tw.y - a.y) || 1;
          const kb = melee ? 6 : 3.5;
          Actors.playClip(def, ev.ko ? 'ko' : 'hit', { push: { x: (tw.x - a.x) / dl * kb, y: (tw.y - a.y) / dl * kb }, flashCol: melee ? '#ff2a2a' : '#ffffff' });
          const special = ev.mode === 'pounce' || ev.mode === 'maul' || ev.mode === 'roll' || ev.mode === 'lunge';
          const ahero = att.hero, fz = Vfx.ensure(u);
          if (ev.mode === 'smash' || ev.mode === 'cleave') {
            // v0.19 Sledge: the hammer lands on the target — overhead arc, shockwave and splinters
            Vfx.spawnHammer(fz, tw.x * zz, tw.y * zz, tx, ty, zz, fac, ev.mode === 'smash' ? 1.25 : 1);
            u.shake = Math.max(u.shake || 0, ev.mode === 'smash' ? 15 : 12);
          } else if (ev.mode === 'backstab' || ev.mode === 'hamstring') {
            // v0.19 Sable: a cold silver slash across the target (low for a hamstring)
            Vfx.spawnSlash(fz, tx, ev.mode === 'hamstring' ? (tw.y - tH * 0.18) * zz : ty, zz, fac, ev.crit ? 1.25 : 1);
          } else if (melee && special && (ahero === 'rook' || defOf(ahero).species === 'Wolf')) {
            Vfx.spawnClaws(fz, tx, ty, zz, fac, ev.mode === 'maul' ? 1.25 : 1);
          } else if (melee && special && (ahero === 'anvil' || defOf(ahero).species === 'Rhino' || ev.mode === 'roll')) {
            Vfx.spawnImpact(fz, tw.x * zz, tw.y * zz, zz, ev.mode === 'maul' ? 1.3 : 1);
            u.shake = Math.max(u.shake || 0, ev.mode === 'maul' ? 14 : 11);
          } else if (melee) {
            Vfx.spawnSparks(fz, tx, ty, ev.crit ? 10 : 6);
          }
          // Callout word above the head, damage number lower and off to the side so they never overprint.
          Vfx.spawnCallout(u.fx, tx, (tw.y - tH - 22) * zz, ev.crit ? 'CRIT' : 'HIT', ev.crit ? 'crit' : 'hit');
          u.floats.push({ t: performance.now(), x: tx + fac * 13 * zz, y: (tw.y - tH * 0.7) * zz, z0: zz, text: ev.crit ? `-${ev.dmg}!` : `-${ev.dmg}`, heal: 0, crit: ev.crit, dmg: 1 });
          if (ev.ko) say(u, b, ev.target, 'ko');
          if (ev.unhide) statusPop(u, att, 'REVEALED', 100);
          // v0.17: say when armour (or a shield, hide or a bodyguard) soaked part of the blow
          if (ev.blocked) Vfx.spawnCallout(u.fx, tx - fac * 18 * zz, (tw.y - tH * 0.35) * zz, `ARMOUR −${ev.blocked}`, 'armour');
          if (ev.bleed && !ev.ko) statusPop(u, def, 'BLEEDING', 250);
          if (ev.mode === 'suppress' && def.suppressed && !ev.ko) statusPop(u, def, 'SUPPRESSED', 300);
          if (ev.stubborn) statusPop(u, def, 'STUBBORN', 200);
          if (ev.exposed && !ev.ko) statusPop(u, def, 'EXPOSED', 260);
          if (ev.slowed && !ev.ko) statusPop(u, def, 'SLOWED', 300);
          if (ev.guard) {
            const gu = b.units.find((x) => x.uid === ev.guard.uid);
            if (gu) { const gp = toWorld(gu.x, gu.y); u.floats.push({ t: performance.now() + 120, x: gp.x * zz, y: (gp.y - Actors.actorHeight(gu.hero) * 0.7) * zz, z0: zz, text: `-${ev.guard.dmg}`, heal: 0, dmg: 1 }); Vfx.spawnCallout(u.fx, gp.x * zz, (gp.y - Actors.actorHeight(gu.hero) - 22) * zz, 'SHOULDERED', 'armour'); Actors.playClip(gu, ev.guard.ko ? 'ko' : 'hit'); }
          }
          if (ev.knock) {
            // knocked a tile back out of their spot
            u.pathAnim = { uid: def.uid, path: [ev.knock.to], from: ev.knock.from, t0: performance.now(), dur: 220 / SPEED, x: ev.knock.from.x, y: ev.knock.from.y, noFollow: true };
            await wait(230);
            u.pathAnim = null;
            const kp = toWorld(ev.knock.to.x, ev.knock.to.y);
            Vfx.spawnDust(Vfx.ensure(u), kp.x * zz, kp.y * zz, zz, 4);
          }
          if (ev.leech) u.floats.push({ t: performance.now() + 150, x: a.x * zz, y: (a.y - Actors.actorHeight(att.hero) * 0.7) * zz, z0: zz, text: '+1 Grit', heal: 1 });
          await wait(Math.max(0, u.hitstop - performance.now() + 40));
        } else {
          Vfx.spawnCallout(u.fx, tx, (tw.y - tH - 22) * zz, 'MISS', 'miss');
        }
        await wait(att.side === 'enemy' ? 190 : 240);
      }
    }
    if (ev.typ === 'pounce') {
      const pu = b.units.find((x) => x.uid === ev.uid);
      const tg = b.units.find((x) => x.uid === ev.target);
      if (pu) {
        Audio.play('pounce');
        if (tg) Actors.faceToward(pu, ev.from.x, ev.from.y, tg.x, tg.y);
        Actors.playClip(pu, 'ability');
        const p = toWorld(ev.from.x, ev.from.y);
        const pName = ((defOf(pu.hero).abilities || []).find((a) => a.id === 'pounce') || {}).name || 'Pounce';
        Vfx.spawnCallout(Vfx.ensure(u), p.x * u.cam.z, (p.y - Actors.actorHeight(pu.hero) - 22) * u.cam.z, pName.toUpperCase(), 'crit');
        u.pathAnim = { uid: ev.uid, path: [ev.to], from: ev.from, t0: performance.now(), dur: 300 / SPEED, x: ev.from.x, y: ev.from.y, leap: 1 };
        await wait(300);
        u.pathAnim = null;
        u.shake = Math.max(u.shake || 0, 5);
      }
    }
    if (ev.typ === 'howl') {
      const hu = b.units.find((x) => x.uid === ev.uid);
      if (hu) {
        Audio.play('howl');
        Actors.playClip(hu, 'ability');
        const p = toWorld(hu.x, hu.y), fx = Vfx.ensure(u);
        Vfx.spawnCallout(fx, p.x * u.cam.z, (p.y - Actors.actorHeight(hu.hero) - 22) * u.cam.z, 'HOWL', 'crit');
        u.howlRing = { x: hu.x, y: hu.y, r: ev.radius || 5, t0: performance.now() };
        for (const id of ev.shaken || []) {
          const f = b.units.find((x) => x.uid === id); if (!f) continue;
          const q = toWorld(f.x, f.y);
          statusPop(u, f, 'SHAKEN', 200);
        }
        for (const id of ev.rallied || []) {
          const f = b.units.find((x) => x.uid === id); if (!f) continue;
          const q = toWorld(f.x, f.y);
          statusPop(u, f, 'RALLIED', 200);
        }
        await wait(700);
      }
    }
    if (ev.typ === 'brace') {
      const bu = b.units.find((x) => x.uid === ev.uid);
      if (bu) {
        Audio.play('secondwind');
        Actors.playClip(bu, 'ability');
        const p = toWorld(bu.x, bu.y);
        Vfx.spawnCallout(Vfx.ensure(u), p.x * u.cam.z, (p.y - Actors.actorHeight(bu.hero) - 22) * u.cam.z, 'BRACE', 'overwatch');
        u.floats.push({ t: performance.now() + 150, x: p.x * u.cam.z, y: (p.y - Actors.actorHeight(bu.hero) * 0.8) * u.cam.z, z0: u.cam.z, text: '+2 ARMOUR', heal: 1 });
        await wait(420);
      }
    }
    if (ev.typ === 'taunt') {
      const tu = b.units.find((x) => x.uid === ev.uid);
      if (tu) {
        Audio.play('howl');
        Actors.playClip(tu, 'ability');
        const p = toWorld(tu.x, tu.y);
        Vfx.spawnCallout(Vfx.ensure(u), p.x * u.cam.z, (p.y - Actors.actorHeight(tu.hero) - 22) * u.cam.z, 'TAUNT', 'crit');
        u.howlRing = { x: tu.x, y: tu.y, r: ev.radius || 5, t0: performance.now() };
        u.shake = Math.max(u.shake || 0, 4);
        for (const id of ev.taunted || []) {
          const f = b.units.find((x) => x.uid === id); if (!f) continue;
          const q = toWorld(f.x, f.y);
          statusPop(u, f, 'TAUNTED', 200);
        }
        await wait(650);
      }
    }
    if (ev.typ === 'bleed') {
      const bu = b.units.find((x) => x.uid === ev.uid);
      if (bu) {
        const q = toWorld(bu.x, bu.y);
        Audio.play('bleed');
        u.floats.push({ t: performance.now(), x: q.x * u.cam.z, y: (q.y - Actors.actorHeight(bu.hero) * 0.7) * u.cam.z, z0: u.cam.z, text: '-1 bleed', heal: 0, dmg: 1 });
        Actors.playClip(bu, bu.hp <= 0 ? 'ko' : 'hit');
        await wait(260);
      }
    }
    if (ev.typ === 'heal' && ev.ability === 'secondwind') {
      const su = b.units.find((x) => x.uid === ev.uid);
      if (su) {
        Audio.play('secondwind');
        Actors.playClip(su, 'ability');
        const p = toWorld(su.x, su.y);
        Vfx.spawnCallout(Vfx.ensure(u), p.x * u.cam.z, (p.y - Actors.actorHeight(su.hero) - 22) * u.cam.z, 'SECOND WIND', 'overwatch');
        await wait(260);
      }
    }
    if (ev.typ === 'heal') {
      const def = b.units.find((x) => x.uid === ev.target);
      if (def) {
        const t = toWorld(def.x, def.y);
        u.floats.push({ t: performance.now(), x: t.x * u.cam.z, y: (t.y - Actors.actorHeight(def.hero) * 0.7) * u.cam.z, text: `+${ev.heal}`, heal: 1, z0: u.cam.z });
        Audio.play('collect');
        await wait(280);
      }
    }
    if (ev.typ === 'revive') {
      const def = b.units.find((x) => x.uid === ev.target);
      if (def) {
        const t = toWorld(def.x, def.y);
        u.floats.push({ t: performance.now(), x: t.x * u.cam.z, y: (t.y - Actors.actorHeight(def.hero) * 0.7) * u.cam.z, text: `+${ev.heal}`, heal: 1, z0: u.cam.z });
        say(u, b, ev.uid, 'revive');
        Actors.playClip(def, 'revive');
        const medic = b.units.find((x) => x.uid === ev.uid);
        if (medic) Actors.playClip(medic, 'ability');
        Audio.play('collect');
        await wait(280);
      }
    }
    if (ev.typ === 'throw') {
      const th = b.units.find((x) => x.uid === ev.uid);
      if (th) Actors.playClip(th, 'ability');
      u.mode = null; u.modePicked = false;
      await wait(320);
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
        Vfx.panCam(fx, u.cam, p.x, p.y, cv, { zoom: 1.20, durIn: 220, hold: 520, durOut: 460 });
        Vfx.nudgeToward(fx, p.x * u.cam.z, p.y * u.cam.z, 1.3);
      }
      // Chain reactions get a counter so a barrel-into-van cascade reads as one big payoff.
      const nowB = performance.now();
      u.chainN = (u.lastBoom && nowB - u.lastBoom < 1200) ? (u.chainN || 1) + 1 : 1;
      u.lastBoom = nowB;
      if (u.chainN > 1) {
        const p0 = toWorld(spots[0].x, spots[0].y);
        Vfx.spawnCallout(fx, p0.x * u.cam.z, (p0.y - 70) * u.cam.z, `CHAIN ×${u.chainN}`, 'crit');
      }
      Audio.play('explosion');
      await wait(u.chainN > 1 ? 380 : 280);
    }
    if (ev.typ === 'boomhit') {
      const un = b.units.find((x) => x.uid === ev.uid);
      if (un) {
        const t = toWorld(un.x, un.y);
        u.floats.push({ t: performance.now(), x: t.x * u.cam.z, y: (t.y - Actors.actorHeight(un.hero) * 0.7) * u.cam.z, text: `-${ev.dmg}`, heal: 0, dmg: 1, z0: u.cam.z });
        Actors.playClip(un, un.hp <= 0 ? 'ko' : 'hit');
        if (un.hp <= 0) say(u, b, ev.uid, 'ko');
        u.hitstop = performance.now() + 70;
        u.shake = Math.max(u.shake, 10);
      }
    }
    if (ev.typ === 'overwatch' && !ev.target) {
      Audio.play('overwatch');
      const ow = b.units.find((x) => x.uid === ev.uid);
      if (ow) { Actors.playClip(ow, 'ability'); await wait(260); }
    }
    if (ev.typ === 'fortify') {
      const fu = b.units.find((x) => x.uid === ev.uid);
      if (fu) { Actors.playClip(fu, 'ability'); await wait(260); }
    }
    if (V019_EVENTS.includes(ev.typ)) await playV019(ctx, u, b, ev, wait, cv);
  }
}

// ---------------------------------------------------------------- v0.19 new operator kits on the board
const SIGNATURE = {
  smash: { word: 'COVER BREAKER', sfx: 'maul' }, cleave: { word: 'CLEAVE', sfx: 'maul' },
  backstab: { word: 'BACKSTAB', sfx: 'pounce' }, hamstring: { word: 'HAMSTRING', sfx: 'pounce' },
};
const V019_EVENTS = ['guard', 'cleave', 'yell', 'mark', 'flare', 'flashbang', 'trapset', 'trap', 'jam', 'hide', 'stim', 'resupply', 'comms', 'bribe'];
async function playV019(ctx, u, b, ev, wait, cv) {
  const fx = Vfx.ensure(u), z = u.cam ? u.cam.z : 1;
  const by = b.units.find((x) => x.uid === ev.uid);
  const tg = ev.target ? b.units.find((x) => x.uid === ev.target) : null;
  const head = (un) => { const p = toWorld(un.x, un.y); return { x: p.x * z, y: (p.y - Actors.actorHeight(un.hero) - 22) * z, fx: p.x * z, fy: p.y * z, body: (p.y - Actors.actorHeight(un.hero) * 0.55) * z }; };
  const call = (un, word, kind = 'crit') => { if (un) { const h = head(un); Vfx.spawnCallout(fx, h.x, h.y, word, kind); } };
  const pops = (ids, word) => { for (const id of ids || []) { const f = b.units.find((x) => x.uid === id); if (f) statusPop(u, f, word, 180); } };
  if (by && ev.typ !== 'trap') { Actors.playClip(by, 'ability'); if (tg) Actors.faceToward(by, by.x, by.y, tg.x, tg.y); }
  if (ev.typ === 'cleave') { call(by, 'SWEEPING CLEAVE'); Audio.play('maul'); if (by) { const h = head(by); Vfx.spawnSweep(fx, h.fx, h.fy - 10 * z, z); } await wait(240); return; }
  if (ev.typ === 'guard') {
    call(by, 'SHOULDER UP', 'overwatch'); Audio.play('secondwind');
    if (tg) { const h = head(tg); Vfx.spawnShieldPulse(fx, h.fx, h.body, z); statusPop(u, tg, 'GUARDED', 200); }
    await wait(420); return;
  }
  if (ev.typ === 'yell') { call(by, 'REBEL YELL'); Audio.play('howl'); u.howlRing = { x: by.x, y: by.y, r: ev.radius || 3, t0: performance.now(), col: '200,40,40' }; u.shake = Math.max(u.shake || 0, 5); pops(ev.rallied, 'RALLIED'); await wait(650); return; }
  if (ev.typ === 'comms') { call(by, 'CALL IT IN', 'overwatch'); Audio.play('overwatch'); u.howlRing = { x: by.x, y: by.y, r: ev.radius || 6, t0: performance.now(), col: '90,200,140' }; pops(ev.rallied, 'ON THE RADIO'); await wait(600); return; }
  if (ev.typ === 'jam') { call(by, 'JAMMER', 'overwatch'); Audio.play('overwatch'); u.howlRing = { x: by.x, y: by.y, r: ev.radius || 5, t0: performance.now(), col: '90,160,255' }; for (const id of ev.targets || []) { const f = b.units.find((x) => x.uid === id); if (f) { const h = head(f); Vfx.spawnStatic(fx, h.fx, h.body, z); } } pops(ev.targets, 'JAMMED'); await wait(620); return; }
  if (ev.typ === 'hide') { call(by, 'SHADOW STEP', 'overwatch'); Audio.play('move'); if (by) { const h = head(by); Vfx.spawnSmokePuff(fx, h.fx, h.fy, z); } if (by) statusPop(u, by, 'HIDDEN', 150); await wait(420); return; }
  if (ev.typ === 'mark' || ev.typ === 'flare') {
    if (ev.typ === 'flare' && by) {
      call(by, 'FLARE'); Audio.play('overwatch');
      const p = toWorld(ev.x, ev.y);
      const h = head(by);
      Vfx.spawnFlare(fx, h.fx, h.body, p.x * z, p.y * z, z, ev.radius || 2);
      Vfx.panCam(fx, u.cam, p.x, p.y, cv, { zoom: 1.12, durIn: 240, hold: 520, durOut: 420 });
      await wait(420);
    } else { call(by, 'MARK TARGET', 'overwatch'); Audio.play('overwatch'); }
    for (const id of ev.targets || []) {
      const f = b.units.find((x) => x.uid === id); if (!f) continue;
      const h = head(f);
      Vfx.spawnReticle(fx, h.fx, h.body, z);
      statusPop(u, f, 'MARKED', 260);
    }
    u.cutFocus = { uids: [ev.uid, ...(ev.targets || [])], until: performance.now() + 1100 };
    await wait(650); return;
  }
  if (ev.typ === 'flashbang') {
    if (by) Actors.faceToward(by, by.x, by.y, ev.x, ev.y);
    call(by, 'FLASHBANG');
    const p = toWorld(ev.x, ev.y), h = by ? head(by) : null;
    if (h) Vfx.spawnLob(fx, h.fx, h.body, p.x * z, (p.y - 4) * z, z);
    await wait(300);
    Audio.play('explosion');
    Vfx.spawnFlashbang(fx, p.x * z, (p.y - 6) * z, z, ev.radius || 1);
    u.whiteout = { t0: performance.now(), until: performance.now() + 380 };
    u.shake = Math.max(u.shake || 0, 7);
    Vfx.panCam(fx, u.cam, p.x, p.y, cv, { zoom: 1.16, durIn: 200, hold: 480, durOut: 420 });
    for (const id of ev.targets || []) { const f = b.units.find((x) => x.uid === id); if (f) { Actors.playClip(f, 'hit', { flashCol: '#ffffff' }); const fh = head(f); Vfx.spawnDazed(fx, fh.fx, fh.y + 14 * z, z); } }
    pops(ev.targets, 'BLINDED');
    await wait(560); return;
  }
  if (ev.typ === 'trapset') { call(by, 'TRIPWIRE', 'overwatch'); Audio.play('move'); await wait(320); return; }
  if (ev.typ === 'trap') {
    const v = by; if (!v) return;
    const h = head(v);
    Audio.play('hit'); u.shake = Math.max(u.shake || 0, 8);
    Vfx.spawnSnap(fx, h.fx, h.fy, z);
    Vfx.spawnCallout(fx, h.x, h.y, 'TRIPWIRE', 'crit');
    u.floats.push({ t: performance.now(), x: h.fx, y: h.body, z0: z, text: `-${ev.dmg}`, heal: 0, dmg: 1 });
    Actors.playClip(v, ev.ko ? 'ko' : 'hit');
    if (!ev.ko) statusPop(u, v, 'SLOWED', 260);
    await wait(480); return;
  }
  if (ev.typ === 'stim' || ev.typ === 'resupply') {
    call(by, ev.typ === 'stim' ? 'STIM SHOT' : 'RESUPPLY', 'overwatch'); Audio.play(ev.typ === 'stim' ? 'secondwind' : 'collect');
    if (tg) {
      const h = head(tg);
      if (ev.typ === 'stim') { Vfx.spawnStim(fx, h.fx, h.body, z); if (ev.heal) u.floats.push({ t: performance.now() + 120, x: h.fx, y: h.body, z0: z, text: `+${ev.heal}`, heal: 1 }); statusPop(u, tg, 'STIMMED', 260); }
      else { Vfx.spawnCasings(fx, h.fx, h.body, 1, 3); u.floats.push({ t: performance.now() + 120, x: h.fx, y: h.body, z0: z, text: `+${ev.ammo} ammo`, heal: 1 }); }
    }
    await wait(460); return;
  }
  if (ev.typ === 'bribe') {
    call(by, 'PAY OFF', 'overwatch'); Audio.play('collect');
    if (tg && by) { const h0 = head(by), h1 = head(tg); Vfx.spawnEnvelope(fx, h0.fx, h0.body, h1.fx, h1.body, z); }
    await wait(420);
    if (tg) statusPop(u, tg, 'PAID OFF', 0);
    await wait(320); return;
  }
}

async function doAct(ctx, action, opts = {}) {
  const b = ctx.state.tactics, u = ui(ctx);
  if (!b || u.busy) return null;
  u.busy = 1;
  u.preview = null; u.undo = null;
  const snap = opts.undoable ? JSON.stringify(b, (k, v) => (k === 'anim' ? undefined : v)) : null;
  const r = T.apply(b, action);
  if (!r.ok) { u.busy = 0; ctx.toast(r.reason); return r; }
  lessonNote(b, action);
  ctx.save();
  await playEvents(ctx, r.events);
  u.busy = 0;
  // v0.15 undo: a plain move that triggered nothing (no overwatch, no pickups) can be taken back
  if (snap && b.status === 'active' && r.events.every((e) => e.typ === 'move' || e.typ === 'step') && T.actingUnit(b)?.uid === action.uid) {
    const mv = r.events[0];
    u.undo = { uid: action.uid, snap, path: mv.path, from: mv.from };
  }
  if (b.status !== 'active') { finish(ctx); return r; }
  if (b.side === 'enemy') { enemyTurn(ctx); return r; }
  ctx.render();
  return r;
}

function undoMove(ctx) {
  const b = ctx.state.tactics, u = ui(ctx);
  const un = u.undo; if (!b || !un || u.busy) return;
  const snap = JSON.parse(un.snap);
  for (const k of Object.keys(snap)) if (k !== 'units') b[k] = snap[k];
  for (const su of snap.units) {
    const cur = b.units.find((q) => q.uid === su.uid); if (!cur) continue;
    for (const k of Object.keys(cur)) if (k !== 'anim' && !(k in su)) delete cur[k];
    Object.assign(cur, su);
  }
  u.undo = null; u.preview = null;
  const mover = b.units.find((q) => q.uid === un.uid);
  if (mover && un.path && un.path.length) {
    const back = [...un.path].reverse().slice(1).concat([un.from]);
    const from = un.path[un.path.length - 1];
    Actors.faceToward(mover, from.x, from.y, un.from.x, un.from.y);
    Actors.playClip(mover, 'walk');
    u.pathAnim = { uid: mover.uid, path: back, from, t0: performance.now(), dur: Math.max(180, back.length * (Actors.isFig() ? Actors.FIG_STEP_MS : 140)) / SPEED, x: from.x, y: from.y };
    setTimeout(() => { if (mover.anim) mover.anim.hop = null; Actors.playClip(mover, 'idle'); }, u.pathAnim.dur + 30);
  }
  ctx.save(); ctx.render();
}

async function enemyTurn(ctx) {
  const b = ctx.state.tactics, u = ui(ctx);
  u.busy = 1;
  let guard = 0;
  let lastUid = null;
  while (b.status === 'active' && b.side === 'enemy' && guard++ < 40) {
    // Pacing: when a new rival steps up, refresh the HUD (queue + banner) and give the camera
    // glide and the banner a beat before they act, so the player can follow whose go it is.
    const up = T.actingUnit(b);
    if (up && up.uid !== lastUid) {
      lastUid = up.uid;
      // v0.17: a shorter beat (was 620ms); the camera glide still lands before they act
      // v0.20.2: the docks lesson's first rival turn holds a moment longer so its note can be read
      const lessonBeat = b.intro === 1 && b.lesson && !b.lesson.enemy ? 1600 : 0;
      if (!ctx.fast) { ctx.render(); await new Promise((r) => setTimeout(r, ((guard === 1 ? 520 : 400) + lessonBeat) / SPEED)); }
      else if (lessonBeat) ctx.render();
      if (u.closed || ctx.state.tactics !== b) return;
    }
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
  const fight = ctx.state.tactics;
  const squad = fight ? fight.units.filter((x) => x.side === 'player').map((x) => ({ hero: x.hero, hp: x.hp, kills: x.kills || 0 })) : [];
  const res = T.resolveTactics(ctx.state, fight);
  introFightEnd(ctx, fight, res);
  ctx.save();
  ctx.sub.tactics = null;
  if (!res) { ctx.go('base'); return; }
  if (res.win) Audio.play('win'); else Audio.play('lose');
  const back = ctx.sub.afterBattle;
  ctx.sub.afterBattle = null;
  const el = ctx.modal(resultHtml(res, squad), { center: true, backdrop: false, cls: 'resultov', onClose: () => { const to = ctx.sub.afterBattle || back || (res.kind === 'tutorial' ? 'base' : res.opId ? 'missions' : 'city'); ctx.sub.afterBattle = null; ctx.go(to); } });
  if (el) animateResult(el);
}

// End-of-fight screen: landscape two-column card. Left: banner + squad with MVP and KO states.
// Right: reward tiles (Cash, Rep, trophies, shards) that count up, then the league bar.
export function resultHtml(res, squad) {
  const mvp = squad.length ? squad.reduce((a, x) => (x.kills > a.kills || (x.kills === a.kills && x.hp > a.hp) ? x : a), squad[0]) : null;
  const sq = squad.map((x) => {
    const d = defOf(x.hero);
    const tag = x === mvp && res.win && x.kills ? '<em class="mvp">MVP</em>' : (x.hp <= 0 ? '<em class="ko">KO</em>' : '');
    return `<div class="rsq ${x.hp <= 0 ? 'down' : ''} ${x === mvp && res.win && x.kills ? 'star' : ''}"><img loading="lazy" decoding="async" src="${d.thumb || d.portrait}" alt=""><b>${esc(d.name)}</b><span>${x.kills ? x.kills + ' KO' : (x.hp > 0 ? 'Standing' : 'Down')}</span>${tag}</div>`;
  }).join('');
  const quipHero = mvp && defOf(mvp.hero);
  const qset = quipHero && quipHero.quips && (res.win ? (quipHero.quips.win || quipHero.quips.shoot) : (quipHero.quips.ko || quipHero.quips.hit));
  const quip = qset && qset.length ? `<div class="rquip">“${esc(qset[0])}” <span>— ${esc(quipHero.name)}</span></div>` : '';
  const tiles = [];
  if (res.cash) tiles.push(`<div class="rt cash">${ico('cash')}<b data-count="${res.cash}">0</b><span>Cash</span></div>`);
  if (res.influence) tiles.push(`<div class="rt rep">${ico('influence')}<b data-count="${res.influence}">0</b><span>Rep</span></div>`);
  if (res.trophies) tiles.push(`<div class="rt troph ${res.trophies < 0 ? 'neg' : ''}"><i class="trico">🏆</i><b data-count="${res.trophies}" data-sign="1">0</b><span>Trophies</span></div>`);
  if (res.shardDrop && res.shardDrop.added) {
    const sd = res.shardDrop, d = sd.id ? defOf(sd.id) : null;
    tiles.push(`<div class="rt shard">${d ? `<img loading="lazy" decoding="async" src="${d.thumb || d.portrait}" alt="">` : '<i class="trico">◆</i>'}<b data-count="${sd.added}" data-sign="1">0</b><span>${esc(sd.name)} shards${sd.unlocked ? ' · UNLOCKED' : ''}</span></div>`);
  }
  if (res.item && ITEMS[res.item]) {
    const it = ITEMS[res.item];
    tiles.push(`<div class="rt loot q-${it.q}" title="${esc(it.text || '')}"><span class="iframe q-${it.q}">${itemImg(res.item)}</span><b style="color:${QUALITY[it.q].col}">${esc(it.name)}</b><span>New gear · ${esc(QUALITY[it.q].name)}</span></div>`);
  }
  if (res.bp && ITEMS[res.bp]) {
    const it = ITEMS[res.bp];
    tiles.push(`<div class="rt loot bpt q-${it.q}" title="Craft it at the Factory"><span class="iframe q-${it.q} bpf">${itemImg('blueprint')}<i class="bpmini">${itemImg(res.bp)}</i></span><b style="color:${QUALITY[it.q].col}">${esc(it.name)}</b><span>Blueprint · ${esc(QUALITY[it.q].name)}</span></div>`);
  }
  for (const l of res.lost || []) if (l.items && l.items.length) tiles.push(`<div class="rt troph neg"><i class="trico">🎒</i><b>${l.items.length}</b><span>${esc(l.name)}'s gear taken: ${esc(l.items.map((x) => ITEMS[x]?.name).join(', '))}</span></div>`);
  let league = '';
  if (res.trophiesNow != null) {
    const lg = leagueOf(res.trophiesNow);
    const before = Math.max(0, res.trophiesNow - (res.trophies || 0));
    const lgBefore = leagueOf(before);
    const span = lg.next ? lg.next.min - lg.min : 1;
    const pct = (t) => lg.next ? Math.max(0, Math.min(100, ((t - lg.min) / span) * 100)) : 100;
    const moved = lgBefore.id !== lg.id ? `<div class="rlgup ${lg.idx > lgBefore.idx ? 'up' : 'down'}">${lg.idx > lgBefore.idx ? 'PROMOTED' : 'RELEGATED'} · ${esc(lg.name)}</div>` : '';
    league = `<div class="rleague">${moved}
      <div class="rlgrow"><b>${esc(lg.name)}</b><span>${res.trophiesNow} 🏆${lg.next ? ` · ${lg.next.min - res.trophiesNow} to ${esc(lg.next.name)}` : ' · top league'}</span></div>
      <div class="rlgbar"><i style="width:${pct(lgBefore.id === lg.id ? before : lg.min)}%" data-to="${pct(res.trophiesNow)}"></i></div>
      ${res.opponent ? `<div class="tiny dim">vs ${esc(res.opponent.name)}</div>` : ''}</div>`;
  }
  const lossTip = !res.win ? '<p class="small dim">Use cover, flank for better hit chances, and keep the medic close to revive.</p>' : '';
  return `<div class="result r2 ${res.win ? 'win' : 'loss'} ${res.highStakes ? 'hstakes' : ''}">
    <div class="rleft">
      <div class="h dim rlabel">${esc(res.label)}</div>
      <div class="big">${res.win ? 'Victory' : 'Defeat'}</div>
      <div class="rsquad">${sq}</div>
      ${quip}
      <div class="row rbtns">
        <button class="btn block" data-act="closeModal" data-then="crew">${res.item ? 'Equip new gear' : 'My Crew'}</button>
        ${res.practice ? '<button class="btn red block" data-act="closeModal" data-then="editor">Back to editor</button>' : `<button class="btn red block" data-act="closeModal">${res.kind === 'tutorial' ? 'Back to the hideout' : 'Continue'}</button>`}
      </div>
    </div>
    <div class="rright">
      ${tiles.length ? `<div class="rtiles">${tiles.join('')}</div>` : ''}
      ${res.practice ? '<p class="small dim">Practice match on a custom map: no rewards, XP or ammo spent.</p>' : ''}
      ${lossTip}
      ${league}
      ${res.tutorial && res.shardDrop ? '<p class="small gold">Collect 30 shards to unlock an operator.</p>' : ''}
      ${playerXpBlock(res)}
      ${xpBlock(res)}
    </div>
  </div>`;
}

function animateResult(root) {
  const nums = [...root.querySelectorAll('[data-count]')];
  const t0 = performance.now(), dur = 900;
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    for (const n of nums) {
      const v = Math.round(+n.dataset.count * e);
      n.textContent = (n.dataset.sign && v > 0 ? '+' : '') + fmt(v);
    }
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  const bar = root.querySelector('.rlgbar i[data-to]');
  if (bar) setTimeout(() => { bar.style.width = bar.dataset.to + '%'; }, 450);
}

// v0.10 account XP + level-up banner + clinic note.
function playerXpBlock(res) {
  const px = res.playerXp;
  if (!px) return '';
  const pct = px.need ? Math.min(100, (px.xp / px.need) * 100) : 100;
  const up = px.levels && px.levels.length;
  const unl = up ? px.unlocks.filter((u) => !/^squad[23]$/.test(u.id)) : [];
  return `<div class="pxbox ${up ? 'up' : ''}">
    ${up ? `<div class="lvup"><div class="h">Level up! · Player Lv ${px.lv}</div>${unl.length ? `<div class="tiny">Unlocked: ${unl.map((u) => `${u.ico} <b>${esc(u.name)}</b>`).join(' · ')}</div>` : ''}</div>` : ''}
    <div class="tiny"><b>Player</b> +${px.amount} XP · Lv ${px.lv}${res.firstClear ? ' · <span class="gold">first clear</span>' : ''}</div>
    <div class="xpbar"><i style="width:${pct}%"></i></div>
    ${res.joined && res.joined.length ? res.joined.map((j) => `<div class="joinrow"><img loading="lazy" decoding="async" src="${defOf(j.id).thumb}" alt=""><span><b class="gold">${esc(j.name)} joins your crew!</b><span class="tiny">${esc(defOf(j.id).species)} · ${esc(defOf(j.id).roleTag || defOf(j.id).role)} — find them on the Crew tab.</span></span></div>`).join('') : ''}
    ${res.clinic && res.clinic.length ? `<div class="tiny red">🏥 ${res.clinic.map((id) => esc(defOf(id).name)).join(', ')} went to the Clinic to patch up (tap the Clinic in your base).</div>` : ''}
  </div>`;
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
  const ret = res.returned && !res.opId
    ? `<div class="tiny dim">Unused loadout returned: ${res.returned.ammo || 0} ammo, ${res.returned.medkits || 0} medkits. Spent rounds and kits are gone.</div>`
    : '';
  if (!hs && !rows && !lost) return '';
  return `<div class="xpbox">${hs}${lost}${ret}${rows}</div>`;
}

// v0.19.1 battle teaching steps (see js/ui/tutor.js). One mechanic at a time, each only when it applies to
// the acting operator right now: whose turn, AP, moving, cover, attacking and odds, specials, looking around,
// ending the turn. Learned once per device; every step is checked against AP, cooldown and range.
const nm = (un) => esc(defOf(un.hero).name);
const BASIC = ['shot', 'melee'];
function usableSpecial(b, a) {
  for (const ab of T.abilitiesOf(a)) {
    if (BASIC.includes(ab.kind) || ab.gear || T.cooldownLeft(a, ab.id) > 0 || a.ap < (ab.ap || 0)) continue;
    if (EXPLICIT_ATTACK.includes(ab.id) || EXPLICIT_ATTACK.includes(ab.kind)) {
      const f = b.units.find((q) => q.side === 'enemy' && q.hp > 0 && (() => { const pr = T.previewShot(b, a, q, ab.id); return pr && pr.ok; })());
      if (f) return { ab, f };
    }
  }
  return null;
}
function firstShot(b, a) {
  if (a.ap < 2) return null;
  return b.units.find((q) => q.side === 'enemy' && q.hp > 0 && (() => { const pr = T.previewShot(b, a, q, defaultMode(a, q)); return pr && pr.ok; })()) || null;
}
// v0.20.1 plain-words descriptions for the first time an ability is named (tips, tray tip, long-press).
export const PLAIN = {
  pounce: 'Rook’s leap attack: he jumps up to 4 tiles onto an enemy and hits hard.',
  secondwind: 'Rook catches his breath and heals about a third of his HP.',
  maul: 'A savage bite: extra damage, and the target keeps bleeding.',
  howl: 'Rook howls: nearby enemies aim worse, his crew aims better.',
  melee: 'Hit an enemy next to you with your melee weapon.',
  shot: 'Fire your gun at an enemy in range (uses ammo).',
};
const plainOf = (ab) => PLAIN[ab.id] || ab.text || '';
const shortText = (t) => { const x = String(t || '').split(/[.(;:]/)[0].trim(); return x.length > 70 ? x.slice(0, 68) + '…' : x; };
// Street lesson: how far Rook should walk this turn so he still has the AP to Pounce (or Strike) after.
function lessonWalk(b, a) {
  if (!b.tutorial || a.hero !== 'rook') return '';
  const hook = b.units.find((x) => x.hero === 'hook' && x.hp > 0); if (!hook) return '';
  const dist = Math.abs(a.x - hook.x) + Math.abs(a.y - hook.y);
  const pn = T.abilitiesOf(a).find((x) => x.id === 'pounce' && !T.cooldownLeft(a, 'pounce'));
  if (dist <= 1) return '';
  const walk = Math.max(1, dist - (pn ? pn.range || 4 : 1));
  if (pn && walk + pn.ap <= a.ap) return `Rook hits hardest up close. Walk him <b>${walk} tile${walk > 1 ? 's' : ''}</b> toward Hook (1 AP each) and keep ${pn.ap} AP to <b>Pounce</b> (his leap attack).`;
  if (walk + 2 <= a.ap) return `Rook hits hardest up close. Walk him <b>${walk} tile${walk > 1 ? 's' : ''}</b> toward Hook (1 AP each) and keep 2 AP to Strike.`;
  return 'Rook hits hardest up close. Walk him toward Hook — blue tiles cost 1 AP each.';
}
export const BATTLE_STEPS = [
  { id: 'turn', // whose go it is, and that their bar shows AP
    when: ({ a }) => !a.moved && !a.acted,
    done: ({ u, a }) => !!(u.preview || a.moved || a.acted),
    html: ({ a }) => `It’s <b>${nm(a)}</b>’s turn. Each turn ${nm(a)} gets <b>${a.maxAp} Action Points (AP)</b>: the pips on the bar. Walking costs <b>1 AP</b> a tile; attacks and abilities cost the pips on their buttons.` },
  { id: 'move',
    when: ({ a }) => a.ap >= 1 && !a.moved && !a.acted,
    done: ({ u, a }) => !!(u.preview || a.moved),
    html: ({ b, a }) => lessonWalk(b, a) || 'Blue tiles show where they can walk, <b>1 AP</b> a tile. Tap one to see the route.' },
  { id: 'cover',
    when: ({ u }) => !!u.preview,
    done: ({ a }) => !!a.moved,
    html: () => 'The bar shows the cost, the <b>cover</b> there and who could hit you. Behind a wall, rivals miss more. Tap <b>Move here</b>.' },
  { id: 'special', // only when the special is ready, affordable and has a target in range right now
    when: ({ b, a }) => !!usableSpecial(b, a),
    done: ({ u }) => !!(u.modePicked && u.mode && !BASIC.includes(u.mode) && u.mode !== 'shot' && u.mode !== 'melee'),
    html: ({ b, a }) => { const { ab, f } = usableSpecial(b, a); return `<b>${esc(ab.name)}</b> (${ab.ap} AP) is ready. ${esc(plainOf(ab))} Tap it, then tap ${nm(f)}.`; } },
  { id: 'target',
    when: ({ b, a, u }) => !u.inspect && !!firstShot(b, a),
    done: ({ b, u }) => !!(u.inspect && b.units.some((q) => q.uid === u.inspect && q.side === 'enemy')),
    html: ({ b, a }) => { const f = firstShot(b, a); const melee = defaultMode(a, f) !== 'shot'; return `${nm(f)} is in reach. Tap ${nm(f)} to see your odds${melee ? '' : ' before you shoot'}.`; } },
  { id: 'odds',
    when: ({ b, a, u }) => { const f = u.inspect && b.units.find((q) => q.uid === u.inspect && q.side === 'enemy' && q.hp > 0); if (!f || a.ap < 2) return false; const pr = T.previewShot(b, a, f, EXPLICIT_ATTACK.includes(u.mode) ? u.mode : defaultMode(a, f)); return !!(pr && pr.ok); },
    done: ({ a }) => !!a.acted,
    html: () => 'That % is your <b>hit chance</b>. Cover, range and flanking change it. Tap the red button to attack.' },
  { id: 'end',
    when: ({ a }) => a.ap <= 0,
    done: ({ b, u }) => !!(u.endTaught && T.actingUnit(b) && T.actingUnit(b).uid !== u.endTaught),
    html: ({ u, a }) => { u.endTaught = a.uid; return 'Out of AP. Tap <b>End turn</b> — the next fastest piece goes.'; } },
  { id: 'look', // later turn, before he does anything: put him down and inspect the board
    when: ({ b, a }) => b.turn >= 2 && !a.moved && !a.acted,
    done: ({ u }) => !!(u.deselFor || u.inspect),
    html: ({ a }) => `Tap <b>${nm(a)}</b> again (or ✕ on the bar) to deselect, then tap any piece to check its buffs and debuffs.` },
];
// v0.20.1 first-battle UI tour: the fight waits while a spotlight walks through the screen, one element at a
// time (AP, the unit bar, the action buttons, End turn, the enemy, deselect). Tap to advance; Skip any time.
// Shown once per device (learned 'tour'); the guided intro re-arms it.
export const TOUR = [
  { sel: '.taplbl', extra: '.tstats .tpips.big', text: 'These are Rook’s <b>AP: Action Points</b>. He gets 4 every turn. Moving costs <b>1 AP per tile</b>; attacks and abilities cost more.' },
  { sel: '.thero', text: 'The <b>unit bar</b>: the piece you have selected, with its HP, AP, move and speed.' },
  { sel: '.ttray', text: 'Rook’s <b>actions</b>. The pips under each button are its AP cost. Tap one to pick it; press and hold to read what it does.' },
  { sel: '[data-act="endTacticsTurn"]', text: 'Tap <b>End turn</b> when you’re done or out of AP. Then the next piece moves.' },
  { enemy: true, text: 'That’s <b>Hook</b>, the enemy. Tap any piece, enemies too, to see its HP, buffs and debuffs.' },
  { sel: '.tdesel', text: 'Tap <b>✕</b> (or Rook again) to deselect and look around the board. Tap Rook to pick him back up.' },
];
function maybeTour(ctx) {
  const b = ctx.state.tactics, u = ui(ctx);
  if (!b || u.touring || u.tourQueued || b.status !== 'active' || !b.tutorial || b.turn !== 1 || b.side !== 'player') return;
  const a = T.actingUnit(b);
  if (!a || a.side !== 'player' || a.moved || a.acted || learned().tour) return;
  if (!(b.intro === 1 || !ctx.fast)) return;
  u.tourQueued = 1;
  setTimeout(() => { if (ctx.tab === 'tactics' && ctx.state.tactics === b && document.querySelector('.thero')) startTour(ctx); }, ctx.fast ? 60 : 900);
}
export function startTour(ctx) {
  const u = ui(ctx);
  if (u.touring) return;
  u.touring = 1; u.inspect = null;
  ctx.render();
  let i = 0;
  const el = document.createElement('div');
  el.className = 'ttour';
  const W = () => window.innerWidth, H = () => window.innerHeight;
  const rectOf = (st) => {
    if (st.enemy) {
      const b = ctx.state.tactics, f = b && b.units.find((q) => q.side === 'enemy' && q.hp > 0);
      const p = f && window.__tfx && window.__tfx.tileXY(f.x, f.y);
      return p ? { left: p.x - 32, top: p.y - 74, width: 64, height: 90 } : null;
    }
    const n = document.querySelector(st.sel); if (!n) return null;
    const a = n.getBoundingClientRect(); if (!a.width) return null;
    let r = { left: a.left, top: a.top, right: a.right, bottom: a.bottom };
    const m = st.extra && document.querySelector(st.extra);
    if (m) { const c = m.getBoundingClientRect(); r = { left: Math.min(r.left, c.left), top: Math.min(r.top, c.top), right: Math.max(r.right, c.right), bottom: Math.max(r.bottom, c.bottom) }; }
    return { left: r.left, top: r.top, width: r.right - r.left, height: r.bottom - r.top };
  };
  const done = () => {
    el.remove(); u.touring = 0; learn('tour'); learn('look');
    const b = ctx.state.tactics, a = b && T.actingUnit(b);
    if (b && b.intro === 1 && a && a.side === 'player' && !a.moved && !a.acted) { u.deselFor = a.uid; u.inspect = null; u.preview = null; }
    ctx.render();
  };
  const draw = () => {
    while (i < TOUR.length && !rectOf(TOUR[i])) i++;
    if (i >= TOUR.length) return done();
    const st = TOUR[i], r = rectOf(st), pad = 5;
    const hole = { l: Math.max(2, r.left - pad), t: Math.max(2, r.top - pad), w: r.width + pad * 2, h: r.height + pad * 2 };
    const capW = Math.min(300, W() - 24);
    const below = hole.t + hole.h / 2 < H() / 2;
    let x = Math.min(Math.max(12, hole.l + hole.w / 2 - capW / 2), W() - capW - 12);
    const pos = below ? `top:${Math.min(hole.t + hole.h + 10, H() - 120)}px` : `bottom:${Math.min(H() - hole.t + 10, H() - 60)}px`;
    const last = i === TOUR.length - 1;
    el.innerHTML = `<div class="ttourhole" style="left:${hole.l}px;top:${hole.t}px;width:${hole.w}px;height:${hole.h}px"></div>
      <div class="ttourcap" style="left:${x}px;${pos};width:${capW}px" data-step="${i}"><div class="tiny dim">Quick tour · ${i + 1}/${TOUR.length}</div><div class="small">${st.text}</div>
      <div class="ttourbtns"><button class="linkbtn tiny" data-tour="skip">Skip tour</button><button class="btn sm red" data-tour="next">${last ? 'Got it' : 'Next ›'}</button></div></div>`;
  };
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    const t = e.target.closest('[data-tour]');
    if (t && t.dataset.tour === 'skip') return done();
    i++; draw();
  });
  document.getElementById('app').appendChild(el);
  draw();
}

// v0.20.2 Mission 1 lesson (the docks job). After the UI tour, the fight teaches the basics one step at a time,
// in order, and each step waits for the player to actually do it, with the thing to tap highlighted (a gold
// ring on the board, or a pulsing button): pick Rook up, the blue tiles and AP, the move preview and cover,
// Move here, attacking (Shoot / Strike, the hit %), Pounce, End turn and the enemy's turn. Progress lives on
// the battle (b.lesson), so a replayed intro teaches again. The matching v0.19.1 steps are learned as it goes.
const LESSON_LEARNS = { tiles: ['turn', 'move'], preview: ['cover'], 'atk-shot': ['target', 'odds'], 'atk-melee': ['target', 'odds'], 'atk-pounce': ['special', 'target', 'odds'], end: ['end'] };
function lessonDone(b, id) { const L = (b.lesson ||= {}); if (L[id]) return; L[id] = 1; for (const k of LESSON_LEARNS[id] || []) learn(k); }
const foeOf = (b) => b.units.find((q) => q.side === 'enemy' && q.hp > 0) || null;
// the tile the lesson points at on turn 1: behind cover from Hook, with a decent shot, leaving 2 AP to attack
function recTile(b, a, f) {
  const L = (b.lesson ||= {});
  if (L.rec && L.rec.turn === b.turn && L.rec.uid === a.uid) return L.rec;
  const reach = T.reachable(b, a).dist, max = a.ap >= 3 ? a.ap - 2 : a.ap;
  let best = null, bs = -1e9;
  for (const [k, d] of reach) {
    if (d < 1 || d > max) continue;
    const [x, y] = k.split(',').map(Number);
    const c = T.coverFrom(b, f.x, f.y, x, y), pr = T.previewShot(b, { ...a, x, y }, f, 'shot');
    const sc = c * 40 + (pr && pr.ok ? pr.chance : 0) - MANH(x, y, f.x, f.y) * 2 - d;
    if (sc > bs) { bs = sc; best = { x, y }; }
  }
  L.rec = best ? { ...best, turn: b.turn, uid: a.uid } : null;
  return L.rec;
}
const ATK_NAME = { shot: 'Shoot', melee: 'Strike', pounce: 'Pounce' };
// which attack to teach next: Shoot (or Strike) first, then Pounce; each kind once
function nextAttack(b, a, f) {
  if (!f || a.ap < 2) return null;
  const L = b.lesson || {}, dist = MANH(a.x, a.y, f.x, f.y);
  const order = dist <= 1 ? ['melee', 'pounce', 'shot'] : b.turn === 1 ? ['shot', 'pounce'] : ['pounce', 'shot'];
  for (const k of order) {
    if (L['atk-' + k] || (k === 'pounce' && T.cooldownLeft(a, 'pounce'))) continue;
    const pr = T.previewShot(b, a, f, k);
    if (pr && pr.ok) return k;
  }
  return null;
}
function lesson1(b, u, a) {
  if (b.intro !== 1 || b.status !== 'active' || u.touring) return null;
  const L = (b.lesson ||= {}), f = foeOf(b);
  if (!f) return null;
  const actor = T.actingUnit(b);
  if (u.busy && !(actor && actor.side === 'enemy')) return null;
  // the rival's turn: what is happening (once)
  if (actor && actor.side === 'enemy') {
    if (L.enemy) return null;
    L.enemyShown = 1;
    return { id: 'l-enemy', lesson: 1, spot: { x: actor.x, y: actor.y }, html: `<b>${nm(actor)}’s turn.</b> Rivals move and shoot on their own turn; you just watch. Cover makes them miss Rook more.` };
  }
  if (!a || a.side !== 'player' || b.side !== 'player') return null;
  if (L.enemyShown && !L.enemy) L.enemy = 1;
  const desel = u.deselFor === a.uid;
  // 1. pick Rook up (the tour ends with him put down)
  if (!L.select) {
    if (desel) { L.selShown = 1; return { id: 'l-select', lesson: 1, spot: { x: a.x, y: a.y }, html: `<b>Docks, midnight.</b> Hook’s guarding the Helix shipment. Tap <b>${nm(a)}</b> to pick him up.` }; }
    if (L.selShown || a.moved || a.acted || b.turn > 1 || learned().tour) lessonDone(b, 'select');
  }
  if (desel) return null;
  // 2. the blue tiles and what a step costs
  if (!L.tiles) {
    if (u.preview || a.moved) lessonDone(b, 'tiles');
    else if (b.turn === 1 && !a.acted && a.ap >= 1) {
      const r = recTile(b, a, f);
      return { id: 'l-tiles', lesson: 1, spot: r, html: `The <b>blue tiles</b> are where ${nm(a)} can walk. Each tile costs <b>1 AP</b>. Tap the glowing tile${r && T.coverFrom(b, f.x, f.y, r.x, r.y) ? ': it’s behind cover' : ''}.` };
    }
  }
  // 3. the move preview, cover, Move here
  if (!L.preview) {
    if (a.moved) lessonDone(b, 'preview');
    else if (u.preview) {
      const pv = movePreview(u, b, a, u.preview.x, u.preview.y);
      if (pv) {
        const r = recTile(b, a, f), off = r && (r.x !== u.preview.x || r.y !== u.preview.y);
        const cov = pv.cover >= 2 ? '<b>Full cover</b> there: Hook will miss Rook a lot more.' : pv.cover ? '<b>Half cover</b> there: Hook will miss Rook more.' : 'No cover there' + (off ? ': the glowing tile has some.' : '.');
        return { id: 'l-preview', lesson: 1, glow: '.tabgo', spot: off ? r : null, html: `The <b>move preview</b>: the route and its cost (<b>${pv.cost} AP</b>). ${cov} Tap <b>Move here</b>.` };
      }
    } else if (b.turn === 1 && !a.acted && a.ap >= 1 && L.tiles) {
      const r = recTile(b, a, f);
      return { id: 'l-tiles2', lesson: 1, spot: r, html: `Tap a blue tile to preview the move. The glowing one is behind cover.` };
    }
  }
  // 4. attacks: Shoot / Strike, the hit %, then Pounce
  const k = nextAttack(b, a, f);
  if (k) {
    const mode = EXPLICIT_ATTACK.includes(u.mode) ? u.mode : null;
    const insp = u.inspect === f.uid;
    const eff = mode || defaultMode(a, f);
    if (insp && eff === k) {
      const pr = T.previewShot(b, a, f, k);
      if (pr && pr.ok) {
        const why = pr.cover ? `${nm(f)}’s cover lowers it.` : `${nm(f)} has no cover from here: a flank bonus.`;
        return { id: 'l-odds-' + k, lesson: 1, glow: '.tabatk', html: `<b>${pr.chance}%</b> is your <b>hit chance</b>. Aim, cover and range change it; ${why} Tap the red <b>${ATK_NAME[k]}</b> button.` };
      }
    }
    if (mode === k && u.modePicked) return { id: 'l-aim-' + k, lesson: 1, spot: { x: f.x, y: f.y }, html: `Now tap <b>${nm(f)}</b> to aim at him and see your odds.` };
    const what = k === 'shot' ? `<b>Shoot</b> (2 AP) fires ${nm(a)}’s revolver from range. Uses a bullet.`
      : k === 'melee' ? `He’s right next to you. <b>Strike</b> (2 AP) hits with ${nm(a)}’s melee weapon, and each hit heals him 1 HP.`
        : `<b>Pounce</b> (2 AP) is ready. ${PLAIN.pounce}`;
    return { id: 'l-atk-' + k, lesson: 1, glow: `.tabl[data-mode="${k}"]`, html: `${what} Tap <b>${ATK_NAME[k]}</b>.` };
  }
  // 5. End turn
  if (!L.end && (a.ap <= 0 || (a.ap < 2 && (a.moved || a.acted)))) {
    return { id: 'l-end', lesson: 1, glow: '[data-act="endTacticsTurn"]', html: `${a.ap > 0 ? `${a.ap} AP left: not enough to attack.` : 'Out of AP.'} Tap <b>End turn</b>. Leftover AP is lost, and the next piece in the turn order goes.` };
  }
  return null;
}
// called from doAct with every successful player action
function lessonNote(b, action) {
  if (!b || b.intro !== 1) return;
  if (action.type === 'endTurn') lessonDone(b, 'end');
  const m = action.mode || action.type;
  if (['shot', 'melee', 'pounce'].includes(m) && action.target) lessonDone(b, 'atk-' + m);
}

// v0.20.2 Mission 2 (Helix strikes back): the advanced mechanics, each explained once, the first time it
// matters. Lighter touch than the docks job: tap-to-dismiss notes, and they never block a move.
const DEBUFFS = ['bleed', 'venom', 'shaken', 'suppressed', 'marked', 'exposed', 'blinded', 'taunted', 'slowed', 'jammed'];
function pvOf(b, u, a) { return u.preview && a ? movePreview(u, b, a, u.preview.x, u.preview.y) : null; }
function barrelNearFoe(b, a) {
  if (!T.gunOf(a)) return null;
  for (let y = 0; y < b.map.h; y++) for (let x = 0; x < b.map.w; x++) {
    if (!T.isExplosiveAt(b, x, y)) continue;
    const near = b.units.find((q) => q.side === 'enemy' && q.hp > 0 && MANH(q.x, q.y, x, y) <= Math.max(1, T.blastRadiusOf(tile(b.map, x, y))));
    if (!near) continue;
    const pr = T.previewProp(b, a, x, y);
    if (pr && pr.ok) return { x, y, f: near };
  }
  return null;
}
export const ADV_STEPS = [
  { id: 'adv-order',
    when: ({ b, a }) => b.intro === 2 && !a.moved && !a.acted && b.units.filter((q) => q.side === 'enemy' && q.hp > 0).length > 1,
    done: ({ a }) => !!(a.moved || a.acted),
    glow: '.tqueue',
    html: () => 'Two of them now. The faces up top are the <b>turn order</b>: pieces with higher <b>Speed (Spd)</b> act first.' },
  { id: 'adv-overwatch',
    when: ({ b, u, a }) => b.intro === 2 && (b.units.some((q) => q.side === 'enemy' && q.hp > 0 && q.overwatch) || !!((pvOf(b, u, a) || {}).overwatch || []).length),
    spot: ({ b }) => { const o = b.units.find((q) => q.side === 'enemy' && q.hp > 0 && q.overwatch); return o ? { x: o.x, y: o.y } : null; },
    html: ({ b }) => { const o = b.units.find((q) => q.side === 'enemy' && q.hp > 0 && q.overwatch); return `<b>Overwatch</b> (the eye): ${o ? nm(o) : 'a rival'} skipped his attack to watch. He shoots the first piece that moves in his sight (−15% aim). Stay out of view, or make him waste it.`; } },
  { id: 'adv-cover',
    when: ({ b, u, a }) => b.intro === 2 && ((pvOf(b, u, a) || {}).cover || 0) > 0,
    html: () => '<b>Cover:</b> crates, barrels and cars are <b>half cover</b> (−20% to hit you). Containers and walls are <b>full cover</b> (−40%) and block line of sight.' },
  { id: 'adv-threat',
    when: ({ b, u, a }) => b.intro === 2 && !!((pvOf(b, u, a) || {}).threats || []).length,
    html: () => '<b>Threat zone:</b> the red warning means rivals could hit Rook on that tile next turn; the red lines show who. Tiles marked safe can’t be shot.' },
  { id: 'adv-flank',
    when: ({ b, u, a }) => {
      if (b.intro !== 2) return false;
      const f = u.inspect && b.units.find((q) => q.uid === u.inspect && q.side === 'enemy' && q.hp > 0);
      if (f) { const pr = T.previewShot(b, a, f, EXPLICIT_ATTACK.includes(u.mode) ? u.mode : defaultMode(a, f)); if (pr && pr.ok && pr.flanked && !pr.melee) return true; }
      return !!((pvOf(b, u, a) || {}).threats || []).some((t) => t.flank && !t.melee);
    },
    html: ({ b, u }) => { const f = u.inspect && b.units.find((q) => q.uid === u.inspect && q.side === 'enemy'); return f ? `<b>Flanked:</b> nothing between Rook and ${nm(f)}, so no cover: <b>+10%</b> to hit. Get round the side of cover to flank.` : '<b>Flanked:</b> a rival has no cover between him and that tile, so he gets <b>+10%</b> on Rook there. Keep cover between you.'; } },
  { id: 'adv-status',
    when: ({ b }) => b.intro === 2 && b.units.some((q) => q.hp > 0 && T.statusesOf(b, q).some((s) => DEBUFFS.includes(s.id))),
    spot: ({ b }) => { const q = b.units.find((x) => x.hp > 0 && T.statusesOf(b, x).some((s) => DEBUFFS.includes(s.id))); return q ? { x: q.x, y: q.y } : null; },
    html: ({ b }) => { const q = b.units.find((x) => x.hp > 0 && T.statusesOf(b, x).some((s) => DEBUFFS.includes(s.id))); const s = T.statusesOf(b, q).find((x) => DEBUFFS.includes(x.id)); return `<b>${nm(q)} is ${esc(s.name)}:</b> ${esc(shortText(s.text))}. Statuses float over a piece; tap it to read them all.`; } },
  { id: 'adv-barrel',
    when: ({ b, a }) => b.intro === 2 && a.ap >= 2 && !!barrelNearFoe(b, a),
    spot: ({ b, a }) => { const r = barrelNearFoe(b, a); return r && { x: r.x, y: r.y }; },
    html: ({ b, a }) => { const r = barrelNearFoe(b, a); return `<b>Red barrels explode</b> when shot, hurting everyone next to them. ${nm(r.f)}’s standing by one: tap the barrel to shoot it (2 AP).`; } },
  { id: 'adv-hunker',
    when: ({ b, a }) => { if (b.intro !== 2 || !a.moved || a.ap !== 1 || a.fortify) return false; for (const [dx, dy] of DIRS4) { const t = tile(b.map, a.x + dx, a.y + dy); if (t && t.cover) return true; } return false; },
    glow: '.tabl[data-mode="hunker"]',
    html: () => '1 AP left. <b>Hunker</b> (1 AP) braces Rook in cover: it counts one step better (half becomes full) until his next turn.' },
  { id: 'adv-cooldown',
    when: ({ b, a }) => b.intro === 2 && T.abilitiesOf(a).some((x) => x.cd && T.cooldownLeft(a, x.id) > 0),
    glow: '.tabl.cool',
    html: ({ a }) => { const x = T.abilitiesOf(a).find((q) => q.cd && T.cooldownLeft(a, q.id) > 0); return `<b>${esc(x.name)}</b> is recharging. The number on its button is how many turns until he can use it again.`; } },
  { id: 'adv-heal',
    when: ({ b, a }) => b.intro === 2 && a.hp <= a.maxHp * 0.6 && ((T.abilitiesOf(a).some((x) => x.id === 'secondwind') && !T.cooldownLeft(a, 'secondwind') && a.ap >= 1) || (a.medkits && a.ap >= 2)),
    glow: '.tabl[data-mode="secondwind"], .tabl[data-mode="medkit"]',
    html: () => 'Rook’s hurt. <b>Second Wind</b> (1 AP) heals about a third of his HP; a <b>Medkit</b> (2 AP) patches him up too.' },
  { id: 'adv-ammo',
    when: ({ b, a }) => b.intro === 2 && !!T.gunOf(a) && (a.ammo || 0) <= 2,
    html: ({ a }) => `${a.ammo || 0} bullet${a.ammo === 1 ? '' : 's'} left (the count on Rook’s bar). Out of <b>ammo</b> means no shooting: Strike and Pounce still work.` },
];
export const ADV_IDS = ADV_STEPS.map((s) => s.id);

function battleHint(b, u, actor) {
  if (b.pvp || b.status !== 'active' || !actor || actor.side !== 'player' || b.side !== 'player' || u.busy) return null;
  return runSteps(b.intro ? [...INTRO_BATTLE_STEPS, ...BATTLE_STEPS] : BATTLE_STEPS, { b, u, a: actor }, u.hintOff || {});
}

// which tip shows now: the docks lesson in Mission 1, the advanced notes in Mission 2, else the usual steps
function pickHint(b, u, actor) {
  if (u.touring) return null;
  if (b.intro === 1) return lesson1(b, u, actor) || coach(b, u);
  const h = battleHint(b, u, actor);
  if (h) return h;
  if (b.intro === 2 && actor && actor.side === 'player' && b.side === 'player' && !u.busy && b.status === 'active') { const a = runSteps(ADV_STEPS, { b, u, a: actor }, u.hintOff || {}); if (a) return a; }
  return coach(b, u);
}

function coach(b, u) {
  if (!b.tutorial || b.status !== 'active' || u.busy) return null;
  const rook = b.units.find((x) => x.hero === 'rook' && x.side === 'player');
  const hook = b.units.find((x) => x.hero === 'hook' && x.hp > 0);
  const actor = T.actingUnit(b);
  if (!rook || !hook) return null;
  const T0 = `t${b.turn}`;
  if (actor && actor.hero !== 'rook') return { id: `wait-${T0}`, html: 'Hook’s turn. Rook goes again after him.' };
  const ap = rook.ap;
  const dist = Math.abs(rook.x - hook.x) + Math.abs(rook.y - hook.y);
  const ab = (id) => T.abilitiesOf(rook).find((a) => a.id === id);
  const ready = (id) => { const a = ab(id); return a && !T.cooldownLeft(rook, id) && ap >= (a.ap || 0) ? a : null; };
  const pct = (prev) => `<b style="color:${chanceColor(prev.chance)}">${prev.chance}%</b>`;
  const fresh = !rook.moved && !rook.acted;
  // adjacent: strike (or pounce is pointless)
  if (dist === 1 && ap >= 2) {
    const prev = T.previewShot(b, rook, hook, 'melee');
    return { id: `strike-${T0}-${ap}`, html: `He’s right there. Tap Hook to <b>Strike</b>${prev && prev.ok ? ` (${pct(prev)})` : ''}. Each melee hit heals Rook 1 HP.` };
  }
  // Pounce: only when Rook has the AP, it's off cooldown and Hook is actually in range right now
  const pn = ready('pounce');
  if (pn && dist > 1) {
    const prev = T.previewShot(b, rook, hook, 'pounce');
    if (prev && prev.ok) return { id: `pounce-${T0}-${ap}`, html: `Hook’s in range. Pick <b>Pounce</b> to leap onto him, then tap him (${pct(prev)}).` };
  }
  // start of the turn, too far: walk, leaving 2 AP for an action
  if (fresh && dist > 1 && !(u.hintOff && u.hintOff.move)) { // (skipped if the player just waved the same advice away)
    const range = (ab('pounce') || {}).range || 4;
    const walk = Math.max(1, dist - (pn ? range : 1));
    if (pn && walk <= ap - pn.ap) return { id: `walk-${T0}`, html: `Rook hits hardest up close. Walk him <b>${walk} tile${walk > 1 ? 's' : ''}</b> toward Hook, then <b>Pounce</b> (leap onto him).` };
    if (walk <= ap - 2) return { id: `walk-${T0}`, html: `Rook hits hardest up close. Walk him <b>${walk} tile${walk > 1 ? 's' : ''}</b> toward Hook, then Strike.` };
    return { id: `walk-${T0}`, html: 'Rook hits hardest up close. Get him next to Hook — blue tiles cost 1 AP each.' };
  }
  const sw = ready('secondwind');
  if (sw && rook.hp <= rook.maxHp * 0.5) return { id: `sw-${T0}-${ap}`, html: 'Hurt? <b>Second Wind</b> heals him for 1 AP.' };
  if (ap >= 2 && dist > 1) {
    const prev = T.previewShot(b, rook, hook, 'shot');
    if (prev && prev.ok) return { id: `shoot-${T0}-${ap}`, html: `Can’t get to him this turn. <b>Shoot</b> Hook instead (${pct(prev)}).` };
  }
  if (ap >= 1 && dist > 1) return { id: `close-${T0}-${ap}`, html: 'Walk him closer, then end the turn.' };
  if (ap <= 0) return { id: `end-${T0}`, html: 'No AP left. Tap <b>End turn</b>.' };
  return null;
}

// Where the hint sits: the top-right or top-left edge, whichever is clear of the acting piece, its target and
// any open panel. Falls back to the bottom-right corner above the dock.
function hintSide(b, u) {
  if (!u.cam) return 'r';
  const W = window.innerWidth || 844, H = window.innerHeight || 390;
  const hard = [], soft = [];
  const dpr = window.devicePixelRatio || 1; // the camera works in device pixels, the hint boxes in CSS pixels
  const add = (arr, un) => { if (!un) return; const q = toWorld(un.x, un.y); const sx = (u.cam.x + q.x * u.cam.z) / dpr, sy = (u.cam.y + q.y * u.cam.z) / dpr; arr.push([sx, sy], [sx, sy - Actors.actorHeight(un.hero) * u.cam.z / dpr]); };
  // hard: the acting piece, the inspected piece, the lesson target and the previewed tile must stay visible
  const actor = T.actingUnit(b);
  add(hard, actor);
  if (u.inspect) add(hard, b.units.find((q) => q.uid === u.inspect));
  if (b.tutorial) add(hard, b.units.find((q) => q.hero === 'hook' && q.hp > 0));
  if (u.spot) { const q = toWorld(u.spot.x, u.spot.y); hard.push([(u.cam.x + q.x * u.cam.z) / dpr, (u.cam.y + q.y * u.cam.z) / dpr]); }
  if (u.preview) { const q = toWorld(u.preview.x, u.preview.y); hard.push([(u.cam.x + q.x * u.cam.z) / dpr, (u.cam.y + q.y * u.cam.z) / dpr]); }
  // soft: every other piece (prefer the side that hides fewer of them)
  for (const q of b.units) if (q.hp > 0 && q !== actor && q.uid !== u.inspect) add(soft, q);
  const boxes = { r: [W - 320, 30, W - 50, 140], l: [8, 30, 280, 140], b: [W - 270, H - 170, W - 8, H - 90] };
  const hits = (k, pts) => pts.filter(([x, y]) => x > boxes[k][0] - 24 && x < boxes[k][2] + 24 && y > boxes[k][1] - 24 && y < boxes[k][3] + 24).length;
  const order = u.inspect ? ['l'] : ['r', 'l', 'b'];
  const ok = order.filter((k) => !hits(k, hard));
  // the status panel fills the right and the attack bar the bottom: a tip about the inspected piece goes top left
  if (!ok.length) return u.inspect && /^adv-/.test(u.hintId || '') ? 'l' : '';
  return ok.sort((x, y) => hits(x, soft) - hits(y, soft))[0];
}

function queueHtml(b) {
  const q = T.queueUnits(b);
  if (!q.length) return '';
  return `<div class="tqueue">${q.map((un) => {
    const d = defOf(un.hero);
    const on = un.uid === b.acting ? 'on' : '';
    const foe = un.side === 'enemy' ? 'foe' : '';
    const dead = un.hp <= 0 ? 'dead' : '';
    const hp = Math.max(0, Math.min(1, un.hp / (un.maxHp || 1)));
    return `<div class="tq ${on} ${foe} ${dead}" title="${esc(d.name)}"><img loading="lazy" decoding="async" src="${d.thumb || d.portrait}" alt="">`
      + `<i class="tqhp"><i style="width:${Math.round(hp * 100)}%"></i></i>${dead ? '<b class="tqko">KO</b>' : ''}</div>`;
  }).join('')}</div>`;
}

// v0.14 status icons (24x24 stroke paths), shared by the board chips and the inspect panel.
export const STATUS_ICON = {
  bleed: { d: 'M12 3c3 5 6 8 6 12a6 6 0 01-12 0c0-4 3-7 6-12z', col: '#d83a32', fill: 1 },
  venom: { d: 'M12 3c3 5 6 8 6 12a6 6 0 01-12 0c0-4 3-7 6-12zM9 14a3 3 0 003 3', col: '#5fbf3a', fill: 1 },
  shaken: { d: 'M3 12l3-5 3 10 3-10 3 10 3-10 3 5', col: '#d8a23a' },
  suppressed: { d: 'M3 7h13M3 12h16M3 17h13M18 5l3 2-3 2M20 15l2 2-2 2', col: '#c8763a' },
  taunted: { d: 'M12 4v10M12 18v2', col: '#e05a48' },
  rallied: { d: 'M5 14l7-7 7 7M5 20l7-7 7 7', col: '#e0c15a' },
  braced: { d: 'M12 3l8 3v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z', col: '#6aa0e0' },
  hunkered: { d: 'M12 3l8 3v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6zM8 12l3 3 5-6', col: '#6aa0e0' },
  overwatch: { d: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 110 6 3 3 0 010-6', col: '#e0c15a' },
  sprint: { d: 'M4 6l6 6-6 6M12 6l6 6-6 6', col: '#7ad08a' },
  bulwark: { d: 'M4 4h16v7c0 5-4 8-8 10-4-2-8-5-8-10zM12 8v9M8 12h8', col: '#9ab0c8' },
  stubborn: { d: 'M7 20V9l5-5 5 5v11M7 13h10', col: '#b49a7a' },
  noammo: { d: 'M6 6l12 12M18 6L6 18', col: '#e07a6a' },
  blinded: { d: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM4 4l16 16', col: '#f0f0ff' },
  marked: { d: 'M12 3v5M12 16v5M3 12h5M16 12h5M12 8a4 4 0 110 8 4 4 0 010-8', col: '#ff5a48' },
  exposed: { d: 'M4 20l4-9 3 4 3-7 3 5 3-3M4 4h16', col: '#ffc878' },
  jammed: { d: 'M5 12a7 7 0 0114 0M8 12a4 4 0 018 0M4 4l16 16', col: '#7aa8ff' },
  paid: { d: 'M3 7h18v10H3zM3 7l9 6 9-6', col: '#e0c15a' },
  slowed: { d: 'M6 18l6-6-6-6M3 21h18', col: '#c89a6a' },
  hidden: { d: 'M4 14c2-4 5-6 8-6s6 2 8 6M7 17l-2 2M17 17l2 2M12 18v3', col: '#9aa0b8' },
  stim: { d: 'M14 3l7 7M9 8l7 7M4 20l6-6M12 6l6 6-8 8-6-6z', col: '#7fe0ff' },
  coord: { d: 'M12 18v3M8 21h8M6 10a6 6 0 0112 0M9 10a3 3 0 016 0M12 10v8', col: '#8fe0a8' },
  blur: { d: 'M3 8h10M5 12h12M3 16h10M17 8l3 4-3 4', col: '#b8b0d8' },
  guarding: { d: 'M12 3l8 3v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6zM9 11h6', col: '#8ac8ff' },
  guarded: { d: 'M12 3l8 3v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6zM12 8v8', col: '#8ac8ff' },
  grit: { d: 'M5 20V10l7-6 7 6v10M9 20v-6h6v6', col: '#d84a3a' },
  ko: { d: 'M5 5l14 14M19 5L5 19', col: '#999' },
};
const _sPath = {};
function statusPath(id) { const ic = STATUS_ICON[id]; if (!ic) return null; return _sPath[id] || (_sPath[id] = new Path2D(ic.d)); }
export function statusSvg(id) {
  const ic = STATUS_ICON[id] || STATUS_ICON.ko;
  return `<svg viewBox="0 0 24 24" fill="${ic.fill ? ic.col : 'none'}" stroke="${ic.col}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ic.d}"/></svg>`;
}
// Draws up to three status chips right-to-left ending at (x1, y). Overwatch has its own eye; skip it.
function drawStatusChips(g, sts, x1, y, z) {
  const list = sts.filter((s) => s.id !== 'overwatch' && s.id !== 'ko' && s.id !== 'stubborn');
  if (!list.length) return;
  list.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'debuff' ? -1 : 1));
  const sz = 4.6 * z, gap = 0.7 * z;
  const shown = list.slice(0, 3);
  shown.forEach((st, i) => {
    const x = x1 - (i + 1) * sz - i * gap, yy = y - sz / 2;
    g.fillStyle = st.kind === 'debuff' ? 'rgba(52,10,8,.92)' : 'rgba(10,22,36,.92)';
    g.beginPath(); g.roundRect(x, yy, sz, sz, 1 * z); g.fill();
    g.strokeStyle = st.kind === 'debuff' ? 'rgba(255,90,70,.9)' : 'rgba(120,186,255,.9)';
    g.lineWidth = 0.35 * z; g.stroke();
    const p = statusPath(st.id); const ic = STATUS_ICON[st.id];
    if (p) {
      g.save(); g.translate(x + 0.6 * z, yy + 0.6 * z); g.scale((sz - 1.2 * z) / 24, (sz - 1.2 * z) / 24);
      g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round';
      if (ic.fill) { g.fillStyle = ic.col; g.fill(p); } else { g.strokeStyle = ic.col; g.stroke(p); }
      g.restore();
    }
  });
  if (list.length > 3) {
    g.fillStyle = '#f3e7c9'; g.font = `bold ${Math.round(3.6 * z)}px Inter, sans-serif`; g.textAlign = 'right';
    g.fillText(`+${list.length - 3}`, x1 - 3 * sz - 3 * gap, y + 1.3 * z); g.textAlign = 'left';
  }
}

const ICONS = {
  shot: '<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
  aimed: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>',
  overwatch: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3" fill="currentColor"/>',
  hunker: '<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/><path d="M8 12l3 3 5-6"/>',
  fortify: '<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/><path d="M12 7v10M7 12h10"/>',
  heal: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 7v10M7 12h10"/>',
  melee: '<path d="M5 19L17 4M9 20L20 8M3 14L13 3"/>',
  lunge: '<path d="M4 18L18 4M18 4h-7M18 4v7"/><path d="M4 12l4 4"/>',
  dash: '<path d="M4 6l6 6-6 6M12 6l6 6-6 6"/>',
  sprint: '<path d="M3 6l6 6-6 6M10 6l6 6-6 6M17 6l4 6-4 6"/>',
  breach: '<path d="M12 2l2 6 6-3-3 6 6 2-6 2 3 6-6-3-2 6-2-6-6 3 3-6-6-2 6-2-3-6 6 3z"/>',
  suppress: '<path d="M3 7h12M3 12h15M3 17h12"/><path d="M17 5l4 2-4 2M19 10l3 2-3 2M17 15l4 2-4 2"/>',
  venom: '<path d="M12 2c3 5 7 9 7 13a7 7 0 01-14 0c0-4 4-8 7-13z"/><path d="M9 15a3 3 0 003 3"/>',
  pounce: '<path d="M3 19c3-9 9-13 18-14"/><path d="M15 4h6v6"/><path d="M5 21l3-3M9 21l2-2"/>',
  maul: '<path d="M4 4l5 7M9 3l4 8M14 3l3 8M19 4l1 7"/><path d="M4 15c3 4 13 4 16 0"/>',
  secondwind: '<path d="M12 21s-8-5-8-11a4.5 4.5 0 018-3 4.5 4.5 0 018 3c0 6-8 11-8 11z"/><path d="M9 12h6M12 9v6"/>',
  howl: '<path d="M4 14l5-1 3-6 2 4 6-1-4 5 2 6-5-3-5 3 1-5z"/><path d="M19 3c1 1 2 3 2 5M16 4c1 1 1.5 2 1.5 3"/>',
  brace: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M9 6h6v3H9z"/><path d="M9 13h6M9 16h6"/>',
  taunt: '<path d="M4 9v6h4l6 5V4L8 9z"/><path d="M17 8c1.5 1 1.5 7 0 8M20 5c3 3 3 11 0 14"/>',
  // v0.19 new kits
  smash: '<rect x="3" y="3" width="10" height="6" rx="1"/><path d="M8 9l9 12"/><path d="M15 14l3-1M17 17l4 0M14 18l1 3"/>',
  guard: '<path d="M9 3l7 3v5c0 4-3 7-7 9-4-2-7-5-7-9V6z"/><path d="M18 8l4 2v4c0 2-1 4-3 5"/>',
  cleave: '<path d="M3 15c4-8 14-8 18 0"/><path d="M17 11l4 4-5 1"/><rect x="2" y="17" width="6" height="4" rx="1"/>',
  yell: '<path d="M4 10v4h3l5 4V6L7 10z"/><path d="M15 9l3-2M15 12h4M15 15l3 2"/><path d="M20 4l1 2-1 2"/>',
  mark: '<circle cx="12" cy="12" r="6"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/><path d="M10 12h4M12 10v4"/>',
  flare: '<path d="M12 21V11"/><path d="M12 11c-3-2-3-6 0-8 3 2 3 6 0 8z"/><path d="M5 8l2 1M19 8l-2 1M6 14l2-1M18 14l-2-1"/>',
  flash: '<rect x="8" y="9" width="8" height="12" rx="2"/><path d="M10 9V6h4v3M14 6l3-3"/><path d="M3 4l3 2M2 10h3M21 10h-3M21 4l-3 2"/>',
  jam: '<path d="M5 13a7 7 0 0114 0M8 13a4 4 0 018 0"/><circle cx="12" cy="14" r="1.5" fill="currentColor"/><path d="M3 3l18 18"/>',
  trap: '<path d="M4 18V12M20 18V10"/><path d="M4 13l16-2"/><path d="M2 20h20"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/>',
  hide: '<path d="M3 15c3-5 6-7 9-7s6 2 9 7"/><path d="M8 18l-2 3M16 18l2 3M12 19v3"/><path d="M5 5c2 1 3 2 4 4M19 5c-2 1-3 2-4 4"/>',
  backstab: '<path d="M4 20l9-9"/><path d="M13 11c2-5 5-7 8-8-1 3-3 6-8 8z"/><path d="M6 14l4 4"/>',
  hamstring: '<path d="M8 3v8l-3 10M16 3v8l3 10"/><path d="M3 15l18-3"/>',
  stim: '<path d="M15 3l6 6M10 8l6 6M18 6l-9 9-4 1 1-4 9-9z"/><path d="M5 19l-2 2"/>',
  resupply: '<rect x="3" y="9" width="18" height="11" rx="1"/><path d="M3 13h18M9 9V6h6v3"/><path d="M8 16h2M14 16h2"/>',
  comms: '<rect x="8" y="9" width="8" height="12" rx="2"/><path d="M12 9V4"/><path d="M6 6a8 8 0 0112 0M8 8a5 5 0 018 0"/>',
  bribe: '<rect x="3" y="6" width="18" height="12" rx="1"/><path d="M3 6l9 7 9-7"/><path d="M12 15v3"/>',
};
export function abilityIcon(kind) {
  const d = ICONS[kind] || ICONS.shot;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}
function apPips(n, max, cls = '') {
  let h = '';
  for (let i = 0; i < max; i++) h += `<i class="${i < n ? 'f' : ''}"></i>`;
  return `<span class="tpips ${cls}">${h}</span>`;
}
// Fight feed: newest line on top, older lines fade. Turn-hand-off lines live in the top banner, not here,
// and consecutive duplicates collapse.
function feedHtml(b) {
  const out = [];
  for (const l of (b.log || [])) {
    if (/ is up\.$/.test(l)) continue;
    if (out.length && out[out.length - 1] === l) continue;
    out.push(l);
  }
  const last = out.slice(-3).reverse();
  if (!last.length) return '';
  return `<div class="tfeed">${last.map((l, i) => `<div class="tf tf${i} ${feedTone(l)}">${esc(l)}</div>`).join('')}</div>`;
}
function feedTone(l) {
  if (/miss/i.test(l)) return 'miss';
  if (/KO|knocked|down/i.test(l)) return 'ko';
  if (/revive|medkit|heal/i.test(l)) return 'heal';
  if (/hit|damage|explod|boom/i.test(l)) return 'hit';
  return '';
}

export function render(ctx) {
  const b = ctx.state.tactics, u = ui(ctx);
  if (!b) return `<div class="twrap"></div>`;
  if (b.status !== 'active' && !u.closed) queueMicrotask(() => finish(ctx));
  const actor = T.actingUnit(b);
  if (actor && actor.side === 'player' && actor.hp > 0) u.sel = actor.uid;
  else if (!u.sel) {
    const first = b.units.find((x) => x.side === 'player');
    if (first) u.sel = first.uid;
  }
  const sel = b.units.find((x) => x.uid === u.sel) || actor || b.units.find((x) => x.side === 'player');
  const def = sel ? defOf(sel.hero) : null;
  const abs = sel ? T.abilitiesOf(sel) : [];
  const cls = def ? classOf(def) : null;
  const perk = def ? speciesPerk(def.species) : null;
  u.hintOff ||= {};
  let hint = pickHint(b, u, actor);
  if (hint && !hint.lesson && u.hintOff[hint.id]) hint = null;
  // v0.20.2: what the tip points at (a gold ring on a tile or piece, and/or a pulsing button)
  u.spot = (hint && hint.spot) || null; u.glowSel = (hint && hint.glow) || null;
  // v0.20.1: the tip's button pulses (the ability it names, or End turn)
  const glowMode = hint && !u.inspect ? (hint.id === 'special' ? ((usableSpecial(b, actor) || {}).ab || {}).id : /^pounce-/.test(hint.id) ? 'pounce' : /^sw-/.test(hint.id) ? 'secondwind' : null) : null;
  const glowEnd = !!(hint && (hint.id === 'end' || /^end-/.test(hint.id)));
  u.hintId = hint ? hint.id : null;
  if (u.hintId && (!u.hintAt || u.hintAt.id !== u.hintId)) u.hintAt = { id: u.hintId, t: performance.now() };
  const hside = hint ? (hintSide(b, u) || (hint.lesson ? 'r' : '')) : '';
  // v0.19.1 deselect: the acting operator stays in charge, but the board stops showing their range and every
  // piece you tap just opens its status panel. Tap them (or Select) to pick them back up.
  if (actor && u.lastActing !== actor.uid) u.deselFor = null;
  const desel = !!(actor && actor.side === 'player' && u.deselFor === actor.uid);
  const actName = actor ? defOf(actor.hero).name : '';
  const turnLbl = actor ? `${actName} is up` : (b.side === 'player' ? 'Your turn' : 'Enemy turn');
  const canAct = b.side === 'player' && actor && actor.side === 'player' && !u.busy;
  const mine = sel && sel.side === 'player';
  const trayItems = sel && mine ? [
    ...abs.map((a) => ({
      id: a.id, kind: a.kind, name: a.name, ap: a.ap, act: 'tmode', cd: a.cd ? T.cooldownLeft(sel, a.id) : 0, count: a.gear ? sel.charges : 0,
      text: (PLAIN[a.id] && !BASIC.includes(a.id) ? PLAIN[a.id] + ' ' : '') + (a.text || '') + (a.id === 'melee' && sel.mel && def.template ? ` (${sel.mel.name} ${sel.mel.dmg[0] + (sel.mdmg || 0)}–${sel.mel.dmg[1] + (sel.mdmg || 0)})` : '')
        + (a.gun && T.gunOf(sel) ? ` (${T.gunOf(sel).name} ${T.gunOf(sel).dmg[0]}–${T.gunOf(sel).dmg[1]}, range ${T.gunOf(sel).range})` : '') + (a.cd ? ` Cooldown ${a.cd} turns.` : ''),
    })),
    ...(sel.medkits ? [{ id: 'medkit', kind: 'heal', name: 'Medkit', ap: 2, text: `Heal yourself or an adjacent ally. ${sel.medkits} left.`, act: 'tmode', count: sel.medkits }] : []),
    { id: 'hunker', kind: 'hunker', name: 'Hunker', ap: 1, text: 'Brace in cover: harder to hit until your next turn.', act: 'doHunker' },
  ] : [];
  const trayBtns = trayItems.map((a) => {
    const on = u.mode === a.id || u.mode === a.kind || (a.id === 'hunker' && sel.fortify);
    const why = !canAct ? 'Not this operator\u2019s turn' : a.cd ? `Recharging: ${a.cd} turn${a.cd > 1 ? 's' : ''}` : (sel.ap < a.ap ? `Needs ${a.ap} AP` : '');
    return `<button class="tabl ${on ? 'on' : ''} ${why ? 'off' : ''} ${a.cd ? 'cool' : ''} ${glowMode && a.id === glowMode && !on && !why ? 'tglow' : ''}" data-act="${a.act}" data-mode="${a.id}" data-apcost="${a.ap}" title="${esc(a.name + ' \u2014 ' + a.text + (why ? ' (' + why + ')' : ''))}" ${why ? 'disabled' : ''}>
      <span class="tico">${abilityIcon(a.kind)}${a.count ? `<em>${a.count}</em>` : ''}${a.cd ? `<b class="tcd">${a.cd}</b>` : ''}</span>
      <span class="tlbl ${a.name.length > 10 ? 'long' : ''}">${esc(a.name)}</span>
      ${apPips(a.ap, a.ap)}
    </button>`;
  });
  const hoverMode = (u.abilityHover && u.abilityHover.mode) || (u.modePicked ? u.mode : null);
  const tip = trayItems.find((a) => a.id === hoverMode || a.kind === hoverMode) || null;
  const feed = feedHtml(b);
  // Turn hand-off banner (Marvel Snap / XCOM style). Survives re-renders via a negative animation delay.
  const nowMs = performance.now();
  if (actor && u.lastActing !== actor.uid && b.status === 'active') {
    u.lastActing = actor.uid; u.bannerAt = nowMs;
    if (!u.bannerTimer) u.bannerTimer = setTimeout(() => { u.bannerTimer = null; if (ctx.tab === 'tactics') ctx.render(); }, 1300);
  }
  let banner = '';
  if (actor && u.bannerAt && nowMs - u.bannerAt < 1250) {
    const ad = defOf(actor.hero), ac = classOf(ad);
    const foe = actor.side === 'enemy';
    banner = `<div class="tbanner ${foe ? 'foe' : ''}" style="animation-delay:-${Math.round(nowMs - u.bannerAt)}ms"><img loading="lazy" decoding="async" src="${ad.thumb || ad.portrait}" alt=""><div><b>${esc(ad.name)}</b><span>${foe ? 'Rival turn' : 'Your move'} · ${esc(ad.roleTag || (ac && ac.name) || ad.role)}</span></div></div>`;
  }
  return `
  <div class="twrap ${hside === 'l' ? 'hintl' : ''} ${desel ? 'desel' : ''}">
    <canvas id="tacv"></canvas><div class="tvig"></div>
    <div class="tbar">
      <div class="tturn">${esc(turnLbl)} · ${esc(b.label)} · T${b.turn}${b.highStakes ? ' · <b class="hsflag">HIGH STAKES</b>' : ''}</div>
      <div class="ttimer" id="ttimer"></div>
      <button class="btn dim tiny" data-act="retreatFight">Retreat</button>
      <button class="btn dim tiny tspeed" data-act="tspeed" title="Battle speed">${SPEED}×</button>
      <button class="btn red ${canAct && actor.ap <= 0 ? 'pulse' : ''} ${glowEnd ? 'tglow' : ''}" data-act="endTacticsTurn" ${canAct ? '' : 'disabled'}>${canAct && actor.ap <= 0 ? 'End turn · 0 AP' : 'End turn'}</button>
    </div>
    ${queueHtml(b)}
    ${banner}
    <div class="tzoom"><button data-act="tzoom" data-z="in" aria-label="Zoom in">+</button><button data-act="tzoom" data-z="out" aria-label="Zoom out">−</button><button data-act="tzoom" data-z="fit" aria-label="Fit board">⤢</button></div>
    ${inspectHtml(b, u)}
    ${desel ? '' : actionBarHtml(b, u, canAct, actor)}
    ${hint && hside && hint.lesson ? `<div class="thint lsn ${hside}" data-id="${esc(hint.id)}" role="status"><span>${hint.html}</span></div>` : hint && hside ? `<button class="thint ${hside}" data-act="dismissHint" data-id="${esc(hint.id)}" ${hint.once ? 'data-once="1"' : ''} aria-label="Hint, tap to dismiss"><span>${hint.html}</span><i aria-hidden="true">✕</i></button>` : ''}
    ${desel ? `<div class="tdock desel"><button class="btn tselect" data-act="tselect"><img loading="lazy" decoding="async" src="${defOf(actor.hero).thumb || defOf(actor.hero).portrait}" alt=""><span><b>${esc(defOf(actor.hero).name)}</b> is up · tap to select</span></button><span class="tiny dim">Tap any piece to see its buffs and debuffs</span></div>` : sel ? `
    <div class="tdock">
      <div class="thero ${sel.side === 'enemy' ? 'foe' : ''}">
        <img loading="lazy" decoding="async" class="tport" src="${def.portrait}" alt="">
        <div class="tinfo">
          ${canAct && sel.uid === actor.uid ? '<button class="tdesel" data-act="tdeselect" aria-label="Deselect" title="Deselect: look around the board">✕</button>' : ''}<div class="tuname">${esc(def.name)} <span class="tcls">${esc(def.roleTag || (cls && cls.name) || def.role)} · ${esc(def.species)}</span></div>
          <div class="thp"><i style="width:${Math.max(0, Math.round(100 * sel.hp / sel.maxHp))}%"></i><span>${sel.hp}/${sel.maxHp}</span></div>
          <div class="tstats"><span class="taplbl" title="Action Points: spent on moving, attacks and abilities">AP ${sel.ap}/${sel.maxAp}</span>${apPips(sel.ap, sel.maxAp, 'big')}<span>Mv ${sel.move}</span><span>Spd ${sel.speed || def.speed}</span><span>${ico('ammo')} ${sel.ammo || 0}</span>${sel.medkits ? `<span>${ico('medkits')} ${sel.medkits}</span>` : ''}${sel.overwatch ? '<span class="tow">OW</span>' : ''}${sel.bleed ? `<span class="tst bleed">Bleed ${sel.bleed}</span>` : ''}${sel.shaken ? '<span class="tst shaken">Shaken</span>' : ''}${sel.rallied ? '<span class="tst rallied">Rallied</span>' : ''}${sel.dodge ? `<span title="Dodge">Dg ${sel.dodge}%</span>` : ''}</div>
        </div>
      </div>
      <div class="ttray">
        ${tip && !u.inspect ? `<div class="ttip"><b>${esc(tip.name)}</b> ${esc(tip.text)}</div>` : ''}
        ${trayBtns.join('')}
      </div>
    </div>` : ''}
    ${feed}
  </div>`;
}

export function mount(ctx, el) {
  const cv = document.getElementById('tacv');
  if (!cv) return;
  const b = ctx.state.tactics;
  const u = ui(ctx);
  if (b) {
    Actors.preloadActors(b.units.map((un) => un.hero));
    b.units.forEach((un) => { preload(defOf(un.hero).portrait); Actors.ensureAnim(un); });
    const act = T.actingUnit(b);
    if (act && act.side === 'player') u.sel = act.uid;
  }
  bindCanvas(ctx);
  if (u.glowSel) document.querySelectorAll(u.glowSel).forEach((n) => { if (!n.disabled) n.classList.add('tglow'); });
  maybeTour(ctx);
  // test/debug hook: replay a list of battle events (used by the v0.14 visual tests)
  window.__tfx = {
    play: (evs) => playEvents(ctx, evs),
    bits: () => ui(ctx).fx.bits.map((q) => q.typ),
    // CSS client position of a tile centre (v0.19.1 tests tap empty ground / pieces with it)
    tileXY(x, y) { const uu = ui(ctx), cv = document.getElementById('tacv'); if (!uu.cam || !cv) return null; const r = cv.getBoundingClientRect(), d = window.devicePixelRatio || 1, q = toWorld(x, y); return { x: r.left + (uu.cam.x + q.x * uu.cam.z) / d, y: r.top + (uu.cam.y + q.y * uu.cam.z) / d }; },
    hint: () => { const el = document.querySelector('.thint'); return el ? { id: el.dataset.id, text: el.innerText, side: el.className, rect: el.getBoundingClientRect().toJSON() } : null; },
    state: () => { const uu = ui(ctx); return { sel: uu.sel, desel: uu.deselFor || null, inspect: uu.inspect || null, preview: uu.preview || null }; },
    perf() { const pf = ui(ctx).perf; if (!pf) return null; const a = [...pf.ms.slice(0, Math.min(120, pf.n))].sort((x, y) => x - y); return { avg: a.reduce((s2, v) => s2 + v, 0) / a.length, p95: a[Math.floor(a.length * 0.95)], n: pf.n }; },
    move(uid, x, y) {
      const bb = ctx.state.tactics, un = bb && bb.units.find((q) => q.uid === uid);
      const r = un && T.pathTo(bb, un, x, y);
      const path = r && (r.path || r);
      if (!path || path.length < 2) return null;
      const ev = { typ: 'move', uid, path, from: { x: un.x, y: un.y } };
      un.x = x; un.y = y;
      return ev;
    },
  };
  if (raf) cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => loop(ctx));
  if (b && b.status === 'active' && b.side === 'enemy' && !u.busy && !u.closed) {
    queueMicrotask(() => enemyTurn(ctx));
  }
}

export const actions = {
  tmode(ctx, el) {
    const mode = el.dataset.mode;
    const inst = ['overwatch', 'dash', 'sprint', 'fortify', 'hunker', 'secondwind', 'howl', 'brace', 'taunt', 'cleave', 'yell', 'jam', 'hide', 'comms'];
    const u = ui(ctx);
    if (!u.sel) return;
    if (inst.includes(mode)) return doAct(ctx, { type: mode, uid: u.sel });
    if (mode === 'medkit' && u.mode === 'medkit') return doAct(ctx, { type: 'medkit', uid: u.sel, target: u.sel });
    u.mode = mode; u.modePicked = true; ctx.render();
  },
  doHunker(ctx) {
    const u = ui(ctx); if (!u.sel) return;
    doAct(ctx, { type: 'hunker', uid: u.sel });
  },
  endTacticsTurn(ctx) { ui(ctx).inspect = null; doAct(ctx, { type: 'endTurn' }); },
  closeInspect(ctx) { ui(ctx).inspect = null; ctx.render(); },
  dismissHint(ctx, el) {
    const u = ui(ctx);
    // a tip that popped up under the finger (the tap that opened it) must not be dismissed by that same tap
    if (u.hintAt && u.hintAt.id === el.dataset.id && performance.now() - u.hintAt.t < 250) return;
    u.hintOff ||= {}; u.hintOff[el.dataset.id] = 1;
    if (el.dataset.once) learn(el.dataset.id);
    ctx.render();
  },
  tdeselect(ctx) { deselect(ctx); },
  tselect(ctx) { const u = ui(ctx); u.deselFor = null; u.inspect = null; ctx.render(); },
  tmoveGo(ctx) {
    const b = ctx.state.tactics, u = ui(ctx), sel = b && T.actingUnit(b);
    if (!sel || !u.preview) return;
    const { x, y } = u.preview;
    doAct(ctx, { type: 'move', uid: sel.uid, x, y }, { undoable: true });
  },
  tmoveCancel(ctx) { ui(ctx).preview = null; ctx.render(); },
  tundo(ctx) { undoMove(ctx); },
  tspeed(ctx) { setSpeed(SPEED === 2 ? 1 : 2); ctx.toast(`Battle speed ${SPEED}×`); ctx.render(); },
  tconfirm(ctx, el) {
    const b = ctx.state.tactics, u = ui(ctx);
    const t = b && b.units.find((x) => x.uid === el.dataset.uid);
    if (!t) return;
    u.inspect = t.uid;
    clickTile(ctx, t.x, t.y);
  },
  tzoom(ctx, el) {
    const u = ui(ctx), cv = document.getElementById('tacv');
    if (!u.cam || !cv) return;
    const how = el.dataset.z;
    if (how === 'fit') { u.userZ = null; glideTo(u, fitCam(ctx.state.tactics, cv, T.actingUnit(ctx.state.tactics))); return; }
    zoomAt(u, cv.width / 2, cv.height / 2, how === 'in' ? 1.25 : 0.8);
  },
  retreatFight(ctx) {
    const b = ctx.state.tactics; if (!b) return;
    b.status = 'loss'; b.reason = 'retreat';
    finish(ctx);
  },
};

export { doAct, ui as tacticsUi };
