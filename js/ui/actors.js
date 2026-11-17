// Cutout-style character animation for every operator and rival in battle.
// Approach: painted full-body stamps (idle) plus a lightweight JS rig that
// tweens squash, anticipation, recoil, walk bounce and falls — the same
// principles as Spine/cutout animation (interpolation, pose blending, procedural
// aiming) without a paid runtime or a build step. Facings are mirrored from a
// single 3/4 painted view, which is how many isometric tactics games cover
// left/right. Weapons aim procedurally; muzzle flashes and hit flashes are
// short frame-style effects on top of the rig.
import { defOf } from '../core/heroes.js';
import { toWorld } from './dockart.js';
import * as Rig from './rig.js';

const DEG = Math.PI / 180;

export const ACTORS = {
  anvil: {
    idle: 'assets/actors/anvil-idle.png',
    height: 84, breath: 3.0, walk: 0.62,
    origin: [0.47, 0.985], gunTip: [0.93, 0.58], colour: '#4a4a4e',
  },
  rook: {
    idle: 'assets/actors/rook-idle.png',
    height: 78, breath: 2.15, walk: 0.46,
    origin: [0.48, 0.985], gunTip: [0.84, 0.545], colour: '#6a4a32',
  },
  brick: {
    idle: 'assets/actors/brick-idle.png',
    height: 74, breath: 2.7, walk: 0.56,
    origin: [0.50, 0.985], gunTip: [0.90, 0.52], colour: '#c46a28',
  },
  lumen: {
    idle: 'assets/actors/lumen-idle.png',
    height: 82, breath: 1.9, walk: 0.40,
    origin: [0.46, 0.985], gunTip: [0.92, 0.58], colour: '#c45a28',
  },
  vesper: {
    idle: 'assets/actors/vesper-idle.png',
    height: 76, breath: 2.35, walk: 0.50,
    origin: [0.42, 0.98], gunTip: [0.22, 0.50], colour: '#1a6a62',
    imageFacing: -1,
  },
  pip: {
    idle: 'assets/actors/pip-idle.png',
    height: 62, breath: 1.7, walk: 0.38,
    origin: [0.42, 0.985], gunTip: [0.62, 0.48], colour: '#c9a227',
  },
  ivory: {
    idle: 'assets/actors/ivory-idle.png',
    height: 80, breath: 2.1, walk: 0.44,
    origin: [0.50, 0.985], gunTip: [0.92, 0.52], colour: '#c8d0d8',
  },
  nile: {
    idle: 'assets/actors/nile-idle.png',
    height: 76, breath: 2.8, walk: 0.58,
    origin: [0.40, 0.985], gunTip: [0.12, 0.68], colour: '#3a6a58',
    imageFacing: -1, melee: 1,
  },
  marlow: {
    idle: 'assets/actors/marlow-idle.png',
    height: 86, breath: 2.9, walk: 0.62,
    origin: [0.50, 0.985], gunTip: [0.95, 0.50], colour: '#8a6a3a',
  },
  hook: {
    idle: 'assets/actors/hook-idle.png',
    height: 78, breath: 2.0, walk: 0.42,
    origin: [0.50, 0.985], gunTip: [0.78, 0.50], colour: '#1a1a1a',
  },
  knack: {
    idle: 'assets/actors/knack-idle.png',
    height: 66, breath: 1.8, walk: 0.40,
    origin: [0.48, 0.985], gunTip: [0.68, 0.48], colour: '#3a3228',
  },
  slab: {
    idle: 'assets/actors/slab-idle.png',
    height: 72, breath: 2.6, walk: 0.56,
    origin: [0.50, 0.985], gunTip: [0.92, 0.55], colour: '#222',
  },
  rill: {
    idle: 'assets/actors/rill-idle.png',
    height: 76, breath: 2.8, walk: 0.58,
    origin: [0.40, 0.985], gunTip: [0.10, 0.70], colour: '#1a1a18',
    imageFacing: -1, melee: 1,
  },
  pact: {
    idle: 'assets/actors/pact-idle.png',
    height: 80, breath: 2.4, walk: 0.50,
    origin: [0.50, 0.98], gunTip: [0.72, 0.46], colour: '#0a0a0a',
  },
  bruno: {
    idle: 'assets/actors/bruno-idle.png',
    height: 86, breath: 2.9, walk: 0.62,
    origin: [0.50, 0.985], gunTip: [0.92, 0.50], colour: '#1a1410',
  },
  ash: {
    idle: 'assets/actors/ash-idle.png',
    height: 80, breath: 2.2, walk: 0.46,
    origin: [0.48, 0.985], gunTip: [0.78, 0.55], colour: '#111',
  },
  mica: {
    idle: 'assets/actors/mica-idle.png',
    height: 80, breath: 1.9, walk: 0.40,
    origin: [0.46, 0.985], gunTip: [0.98, 0.62], colour: '#141414',
  },
};

export const ACTOR_IDS = Object.keys(ACTORS);

const images = {};
export function hasActor(id) { return !!ACTORS[id]; }

export function preloadActors() {
  const srcs = ACTOR_IDS.map((id) => ACTORS[id].idle).concat(Object.values(FIGS).map((f) => f.img));
  for (const src of srcs) {
    if (images[src]) continue;
    const im = new Image();
    im.src = src;
    images[src] = im;
  }
  Rig.preloadRigs();
}

function imgOf(def) { return images[def.idle]; }

export function ensureAnim(unit) {
  if (!unit.anim) {
    unit.anim = {
      clip: unit.hp <= 0 ? 'ko' : 'idle',
      t0: performance.now(),
      t: 0,
      facing: unit.side === 'enemy' ? -1 : 1,
      recoil: 0,
      muzzle: 0,
      flash: 0,
      hold: 0,
    };
  }
  return unit.anim;
}

export function faceToward(unit, x0, y0, x1, y1) {
  const a = ensureAnim(unit);
  const A = toWorld(x0, y0), B = toWorld(x1, y1);
  const dx = B.x - A.x;
  if (Math.abs(dx) > 0.4) a.facing = dx >= 0 ? 1 : -1;
}

export function playClip(unit, clip, opts = {}) {
  if (!hasActor(unit.hero)) return;
  const a = ensureAnim(unit);
  if (clip === 'hit' && a.clip === 'ko' && unit.hp <= 0) return;
  if (clip === 'idle' && a.clip === 'ko' && unit.hp <= 0) return;
  if (clip === 'walk' && a.clip === 'walk') return;
  a.clip = clip;
  a.t0 = performance.now();
  a.t = 0;
  a.hold = opts.hold || 0;
  if (clip === 'shoot' || clip === 'ability') a.muzzle = 0;
  if (clip === 'hit') a.flash = 1;
  if (clip === 'ko') a.flash = 1;
}

export function tickAnim(unit, now, paused) {
  if (!hasActor(unit.hero) || paused) return;
  const a = ensureAnim(unit);
  const def = ACTORS[unit.hero];
  const dt = Math.min(0.05, Math.max(0, (now - (a.last || now)) / 1000));
  a.last = now;
  if (a.holdPose) return;
  a.t = (now - a.t0) / 1000;
  if (a.flash > 0) a.flash = Math.max(0, a.flash - dt * 5);
  if (a.muzzle > 0) a.muzzle = Math.max(0, a.muzzle - dt * 8);

  const dur = clipDur(a.clip, def);
  if (dur && a.t >= dur && a.clip !== 'idle' && a.clip !== 'ko' && a.clip !== 'walk') {
    a.clip = unit.hp <= 0 ? 'ko' : 'idle';
    a.t0 = now;
    a.t = 0;
  }
  if (a.clip === 'ko' && unit.hp > 0 && a.t > 0.2) {
    // got revived mid-pose — handled by playClip('revive')
  }
}

function clipDur(clip, def) {
  if (clip === 'shoot') return 0.48;
  if (clip === 'melee') return 0.42;
  if (clip === 'hit') return 0.36;
  if (clip === 'revive') return 0.7;
  if (clip === 'ability') return 0.7;
  return 0;
}

function poseOf(unit, now) {
  const def = ACTORS[unit.hero];
  const a = ensureAnim(unit);
  const t = a.t;
  let rot = 0, ox = 0, oy = 0, sx = 1, sy = 1, recoil = 0;
  if (a.clip === 'walk') {
    const cyc = def.walk || 0.46;
    const p = (t / cyc) % 1;
    const hop = Math.abs(Math.sin(p * Math.PI * 2));
    const land = Math.cos(p * Math.PI * 4); // 1 in the air, -1 on contact
    oy = -hop * 5.2;
    sy = 1 + land * 0.07;
    sx = 1 - land * 0.05;
    rot = Math.sin(p * Math.PI * 2) * 8 * DEG;
    ox = a.facing * 1.2;
  } else if (a.clip === 'shoot') {
    // anticipation, fire, follow-through recoil
    if (t < 0.10) {
      const k = t / 0.10;
      rot = -a.facing * 6 * DEG * k;
      ox = -a.facing * 1.4 * k;
      sy = 1 + 0.04 * k;
    } else if (t < 0.18) {
      if (a.muzzle === 0 && t > 0.11) a.muzzle = 1;
      const k = (t - 0.10) / 0.08;
      rot = a.facing * 5 * DEG * k;
      ox = a.facing * -4.5 * k;
      recoil = 1 - k * 0.3;
      sx = 1.06; sy = 0.94;
    } else {
      const k = Math.min(1, (t - 0.18) / 0.30);
      const e = 1 - (1 - k) * (1 - k);
      rot = a.facing * 5 * DEG * (1 - e);
      ox = a.facing * -4.5 * (1 - e);
      sx = 1.06 - 0.06 * e;
      sy = 0.94 + 0.06 * e;
    }
  } else if (a.clip === 'melee') {
    if (t < 0.12) { rot = -a.facing * 18 * DEG * (t / 0.12); oy = -2; }
    else if (t < 0.22) { rot = a.facing * 28 * DEG; ox = a.facing * 6; }
    else {
      const k = Math.min(1, (t - 0.22) / 0.2);
      rot = a.facing * 28 * DEG * (1 - k);
      ox = a.facing * 6 * (1 - k);
    }
  } else if (a.clip === 'hit') {
    const k = Math.min(1, t / 0.36);
    const punch = Math.exp(-k * 5) * (1 - k);
    ox = -a.facing * 7 * punch;
    rot = -a.facing * 10 * DEG * punch;
    sx = 1 + 0.08 * punch; sy = 1 - 0.08 * punch;
  } else if (a.clip === 'ko') {
    const k = Math.min(1, t / 0.55);
    const e = 1 - Math.pow(1 - k, 3);
    rot = a.facing * 82 * DEG * e;
    oy = 10 * e;
    ox = -a.facing * 8 * e;
    sy = 1 - 0.12 * e;
  } else if (a.clip === 'revive') {
    const k = Math.min(1, t / 0.7);
    const e = 1 - Math.pow(1 - k, 2);
    const from = 1 - e;
    rot = a.facing * 82 * DEG * from;
    oy = 10 * from - Math.sin(e * Math.PI) * 6;
    ox = -a.facing * 8 * from;
  } else if (a.clip === 'ability') {
    if (unit.hero === 'vesper') {
      const k = Math.sin(Math.min(1, t / 0.7) * Math.PI);
      oy = -3 * k; rot = 8 * DEG * k; sy = 1 + 0.05 * k;
    } else if (unit.hero === 'brick') {
      const k = Math.min(1, t / 0.25);
      sx = 1.12; sy = 0.92; oy = 2 * k;
    } else if (unit.hero === 'lumen') {
      if (t < 0.35) { rot = -a.facing * 4 * DEG; oy = -1; }
      else {
        if (a.muzzle === 0) a.muzzle = 1;
        ox = a.facing * -5; rot = a.facing * 4 * DEG;
      }
    } else {
      rot = -a.facing * 5 * DEG; oy = -2;
    }
  } else {
    // idle breathing, with a little weight in the shoulders
    const b = Math.sin((now / 1000) * Math.PI * 2 / (def.breath || 2.2));
    const b2 = Math.sin((now / 1000) * Math.PI * 2 / (def.breath || 2.2) * 0.5);
    sy = 1 + b * 0.028;
    sx = 1 - b * 0.014;
    oy = b * 1.15;
    rot = b2 * 1.6 * DEG;
    if (unit.hero === 'vesper') rot += b * 2.4 * DEG; // long neck sway
    if (unit.hero === 'brick') oy *= 0.7;
  }
  return { rot, ox, oy, sx, sy, recoil, facing: a.facing, muzzle: a.muzzle, flash: a.flash, imageFacing: def.imageFacing || 1 };
}

// In-world heights (world px) against the yard art. The `height` values above are the
// painted reference sizes; on the map a 1.8 m wolf or fox stands 21 px — about 0.7 of a
// door (31 px) and half a full room wall (40 px). Bigger species a little taller, rats shorter.
// See docs/unit-scale.md.
const SPECIES_H = { Wolf: 27, Fox: 27, Badger: 28, Bear: 32, Croc: 31, Snake: 27, Rat: 20, Rhino: 31 };
function worldHeight(id) {
  let sp = '';
  try { sp = (defOf(id) || {}).species || ''; } catch (e) { sp = ''; }
  return SPECIES_H[sp] || 21;
}
let UNIT_SCALE = 1;
export function setUnitScale(k) { UNIT_SCALE = k; SCALED.clear(); }
export function unitScale() { return UNIT_SCALE; }
const SCALED = new Map();
function scaledDef(id) {
  let d = SCALED.get(id);
  if (!d) { d = { ...ACTORS[id], height: worldHeight(id) * UNIT_SCALE, refHeight: ACTORS[id].height }; SCALED.set(id, d); }
  return d;
}
if (typeof window !== 'undefined') window.__setUnitScale = (k) => setUnitScale(k);

export function drawActor(g, unit, worldX, worldY, z, now, hl = 0) {
  if (!ACTORS[unit.hero]) return null;
  const def = scaledDef(unit.hero);
  const a = ensureAnim(unit);
  if (STYLE === 'fig') return drawFigurine(g, unit, def, a, worldX, worldY, z, now, hl);
  if (Rig.hasRig(unit.hero) && Rig.rigReady(unit.hero)) {
    const anchors = Rig.drawRig(g, unit, def, a, worldX, worldY, z, now);
    if (anchors) {
      a.gunX = anchors.gunX; a.gunY = anchors.gunY;
      a.headX = anchors.headX; a.headY = anchors.headY;
    }
    return anchors;
  }
  const im = imgOf(def);
  const pose = poseOf(unit, now);
  const h = def.height * z;
  const w = im && im.naturalWidth ? h * (im.naturalWidth / im.naturalHeight) : h * 0.42;
  const footX = worldX + pose.ox * z;
  const footY = worldY + pose.oy * z;

  // contact shadow, stretched slightly on squash
  g.save();
  g.fillStyle = 'rgba(0,0,0,0.38)';
  g.beginPath();
  g.ellipse(footX, worldY + 3 * z, 13 * z * pose.sx, 5 * z, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();

  g.save();
  g.translate(footX, footY);
  const flip = pose.facing * (def.imageFacing || 1);
  g.scale(flip, 1);
  g.rotate(pose.rot);
  g.scale(pose.sx, pose.sy);
  const oxp = def.origin[0] * w;
  const oyp = def.origin[1] * h;
  if (im && im.complete && im.naturalWidth) {
    g.drawImage(im, -oxp, -oyp, w, h);
    if (pose.flash > 0) {
      // Re-draw the sprite additively so the flash stays inside the silhouette
      // instead of painting a white rectangle over the padded frame.
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.65 * pose.flash;
      g.drawImage(im, -oxp, -oyp, w, h);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
  } else {
    g.fillStyle = def.colour;
    g.fillRect(-w * 0.25, -h, w * 0.5, h);
  }
  g.restore();

  // class-ability aura (medic glow, tank brace, etc.)
  if (a.clip === 'ability' && a.t < 0.7) {
    const k = Math.sin(Math.min(1, a.t / 0.7) * Math.PI);
    g.save();
    g.globalCompositeOperation = 'lighter';
    const rad = (16 + 10 * k) * z;
    const grd = g.createRadialGradient(footX, footY - h * 0.45, 2 * z, footX, footY - h * 0.35, rad);
    const col = def.colour || '#88ffcc';
    grd.addColorStop(0, `rgba(200,255,230,${0.55 * k})`);
    grd.addColorStop(0.45, hexRgba(col, 0.35 * k));
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.ellipse(footX, footY - h * 0.35, rad * 0.7, rad, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  // muzzle flash at the gun tip, in world space
  const tip = gunWorld(def, w, h, pose, footX, footY, z);
  if (pose.muzzle > 0 && !def.melee) drawMuzzle(g, tip.x, tip.y, z, pose.muzzle, pose.facing);

  // head anchor (for bars, bubbles, floats)
  const head = headWorld(def, w, h, pose, footX, footY);
  a.gunX = tip.x; a.gunY = tip.y;
  a.headX = head.x; a.headY = head.y;
  return { headX: head.x, headY: head.y, footX, footY, gunX: tip.x, gunY: tip.y, z, w, h };
}

function headWorld(def, w, h, pose, footX, footY) {
  // head is near the top-centre of the sprite, slightly left in 3/4 view
  const lx = (0.50 - def.origin[0]) * w;
  const ly = (0.10 - def.origin[1]) * h;
  return applyPose(lx, ly, pose, footX, footY);
}

function gunWorld(def, w, h, pose, footX, footY, z) {
  const lx = (def.gunTip[0] - def.origin[0]) * w;
  const ly = (def.gunTip[1] - def.origin[1]) * h;
  const p = applyPose(lx + (pose.recoil || 0) * -6, ly, pose, footX, footY);
  return p;
}

function applyPose(lx, ly, pose, footX, footY) {
  // local (facing-right) -> scale, rotate, flip, translate
  let x = lx * pose.sx, y = ly * pose.sy;
  const c = Math.cos(pose.rot), s = Math.sin(pose.rot);
  const rx = x * c - y * s, ry = x * s + y * c;
  const flip = pose.facing * (pose.imageFacing || 1);
  return { x: footX + rx * flip, y: footY + ry };
}

function drawMuzzle(g, x, y, z, amt, facing) {
  g.save();
  g.translate(x, y);
  g.globalCompositeOperation = 'lighter';
  const r = (7 + 10 * amt) * z;
  const grd = g.createRadialGradient(0, 0, 0, 0, 0, r);
  grd.addColorStop(0, `rgba(255,245,200,${0.95 * amt})`);
  grd.addColorStop(0.35, `rgba(255,180,60,${0.7 * amt})`);
  grd.addColorStop(1, 'rgba(255,80,0,0)');
  g.fillStyle = grd;
  g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
  g.strokeStyle = `rgba(255,230,140,${0.9 * amt})`;
  g.lineWidth = 1.4 * z;
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3 + (facing < 0 ? Math.PI : 0);
    g.beginPath();
    g.moveTo(Math.cos(a) * 3 * z, Math.sin(a) * 3 * z);
    g.lineTo(Math.cos(a) * 12 * z * amt, Math.sin(a) * 12 * z * amt);
    g.stroke();
  }
  g.restore();
}

export function actorHeight(id) {
  return (ACTORS[id] ? worldHeight(id) * (STYLE === 'fig' && FIGS[id] ? FIGS[id].h || 1 : 1) + (STYLE === 'fig' ? BASE.th : 0) : 21) * UNIT_SCALE;
}

function hexRgba(hex, a) {
  const h = (hex || '#ffffff').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

// ---------------------------------------------------------------- figurine style (v0.13 trial)
// Demeo-style board pieces: each unit is a painted miniature glued to a round tabletop base
// (dark base, team-coloured rim). Pieces move like rigid board pieces: a hop per tile with a
// landing squash, tilting on the edge of the base to lean into an attack, rocking when hit and
// tipping over flat when knocked out. Rook and Anvil have bespoke miniature paintings; every
// other unit stands its classic painted stamp on the same base. The classic look (rigs and
// stamps) stays one Settings switch away: "Unit style: Figurines / Classic".
const STYLE_KEY = 'fangcity.unitStyle';
function initialStyle() {
  try {
    const q = new URLSearchParams(location.search).get('style');
    if (q === 'classic' || q === 'fig') { localStorage.setItem(STYLE_KEY, q); return q; }
    const v = localStorage.getItem(STYLE_KEY);
    return v === 'classic' ? 'classic' : 'fig';
  } catch (e) { return 'fig'; }
}
let STYLE = typeof window !== 'undefined' ? initialStyle() : 'classic';
export function unitStyle() { return STYLE; }
export function isFig() { return STYLE === 'fig'; }
export function setUnitStyle(v) {
  STYLE = v === 'classic' ? 'classic' : 'fig';
  try { localStorage.setItem(STYLE_KEY, STYLE); } catch (e) { /* private mode */ }
  return STYLE;
}
// Hop timing per tile (ms) when moving as a board piece.
export const FIG_STEP_MS = 190;

export const FIGS = {
  rook: { img: 'assets/actors/rook-fig.png', origin: [0.45, 0.992], gunTip: [0.03, 0.62], head: [0.40, 0.08], imageFacing: -1, h: 1.04 },
  anvil: { img: 'assets/actors/anvil-fig.png', origin: [0.46, 0.992], gunTip: [0.98, 0.57], head: [0.62, 0.08], h: 1.0 },
};
// base in world px: radius across, depth (ellipse), thickness
const BASE = { rx: 9.5, ry: 4.3, th: 2.6 };

function figPose(unit, a, now) {
  const t = a.t, f = a.facing;
  let rot = 0, ox = 0, oy = 0, sx = 1, sy = 1, sway = 0, lift = 0;
  if (a.clip === 'walk') {
    const p = a.hop != null ? a.hop : (t / (FIG_STEP_MS / 1000)) % 1;
    lift = Math.sin(p * Math.PI) * 6.5;               // arc over the tile
    const land = Math.max(0, 1 - p / 0.22);           // squash just after touching down
    const take = Math.max(0, (p - 0.86) / 0.14);      // crouch before the next hop
    const sq = 0.13 * land * land + 0.07 * take;
    sx = 1 + sq; sy = 1 - sq;
    rot = f * 7 * DEG * Math.sin(p * Math.PI);        // lean into the hop
  } else if (a.clip === 'shoot') {
    if (t < 0.10) { rot = -f * 4 * DEG * (t / 0.10); }
    else if (t < 0.18) {
      if (a.muzzle === 0 && t > 0.11) a.muzzle = 1;
      rot = -f * 9 * DEG; ox = -f * 1.5;
    } else {
      const k = Math.min(1, (t - 0.18) / 0.30);
      rot = -f * 9 * DEG * Math.exp(-k * 4) * Math.cos(k * 9);
      ox = -f * 1.5 * (1 - k);
    }
  } else if (a.clip === 'melee') {
    // rock back, then pitch hard forward on the front edge of the base and settle
    if (t < 0.12) { rot = -f * 8 * DEG * (t / 0.12); }
    else if (t < 0.22) { const k = (t - 0.12) / 0.10; rot = f * (-8 + 34 * k) * DEG; ox = f * 6 * k; }
    else { const k = Math.min(1, (t - 0.22) / 0.2); rot = f * 26 * DEG * (1 - k) * Math.cos(k * 4); ox = f * 6 * (1 - k); }
  } else if (a.clip === 'hit') {
    const k = Math.min(1, t / 0.36);
    rot = -f * 16 * DEG * Math.exp(-k * 3.2) * Math.cos(k * 15);
    ox = -f * 3 * Math.exp(-k * 6);
    lift = 2.5 * Math.exp(-k * 8) * (1 - k);
  } else if (a.clip === 'ko') {
    // tips over backwards, bounces once and lies flat on the board
    const k = Math.min(1, t / 0.6);
    let ang;
    if (k < 0.62) { const e = k / 0.62; ang = 90 * e * e; }
    else { const e = (k - 0.62) / 0.38; ang = 90 - 14 * Math.sin(e * Math.PI) * (1 - e * 0.4); }
    rot = -f * ang * DEG;
    sy = 1 - 0.04 * Math.min(1, k * 2);
  } else if (a.clip === 'revive') {
    const k = Math.min(1, t / 0.7);
    const e = 1 - Math.pow(1 - k, 2);
    rot = -f * 90 * DEG * (1 - e);
    lift = Math.sin(e * Math.PI) * 5;
  } else if (a.clip === 'ability') {
    // a little jump with a spin-free stomp: hop up, slam down with a squash
    const k = Math.min(1, t / 0.6);
    lift = Math.sin(Math.min(1, k / 0.6) * Math.PI) * 7;
    if (k > 0.6) { const e = (k - 0.6) / 0.4; const sq = 0.14 * Math.exp(-e * 5); sx = 1 + sq; sy = 1 - sq; }
    if (k < 0.15) { const sq = 0.08 * k / 0.15; sx = 1 + sq; sy = 1 - sq; }
    if (a.muzzle === 0 && unit.hero === 'lumen' && k > 0.5) a.muzzle = 1;
  } else {
    // gentle idle sway: a weighted piece that never quite settles
    const ph = (now / 1000) + (unit.uid ? unit.uid.charCodeAt(unit.uid.length - 1) : 0) * 0.37;
    sway = Math.sin(ph * Math.PI * 2 / 3.1) * 1.5 * DEG;
    rot = Math.sin(ph * Math.PI * 2 / 4.3) * 0.6 * DEG;
  }
  return { rot, ox, oy, sx, sy, sway, lift, facing: f, muzzle: a.muzzle, flash: a.flash };
}

// Matrix for the whole piece: feet point on the board, then a rigid tilt that pivots on whichever
// edge of the base the piece is rocking over (that is what makes it read as a solid object).
function pieceMatrix(footX, footY, z, pose) {
  const m = new DOMMatrix();
  m.translateSelf(footX + pose.ox * z, footY - pose.lift * z);
  if (pose.rot) {
    const px = Math.sign(pose.rot) * BASE.rx * 0.92 * z;
    m.translateSelf(px, 0); m.rotateSelf(pose.rot / DEG); m.translateSelf(-px, 0);
  }
  m.scaleSelf(pose.sx, pose.sy);
  return m;
}

function drawBase(g, z, side, hl, now, flash) {
  const rx = BASE.rx * z, ry = BASE.ry * z, th = BASE.th * z;
  const rim = side === 'player' ? '#5aa8ff' : '#ff5a48';
  // side band of the cylinder
  g.fillStyle = '#121214';
  g.beginPath();
  g.ellipse(0, 0, rx, ry, 0, 0, Math.PI);
  g.lineTo(-rx, -th);
  g.ellipse(0, -th, rx, ry, 0, Math.PI, 0, true);
  g.closePath(); g.fill();
  // team-colour rim band
  g.save();
  g.globalAlpha = 0.9;
  g.strokeStyle = rim; g.lineWidth = 1.1 * z;
  g.beginPath(); g.ellipse(0, -th * 0.45, rx - 0.3 * z, ry, 0, 0, Math.PI); g.stroke();
  g.restore();
  // top face: painted tarmac with a little grit
  const grd = g.createLinearGradient(0, -th - ry, 0, -th + ry);
  grd.addColorStop(0, '#3a3834'); grd.addColorStop(1, '#22211f');
  g.fillStyle = grd;
  g.beginPath(); g.ellipse(0, -th, rx, ry, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 6; i++) { const aa = i * 2.1, rr = (0.25 + (i % 3) * 0.2); g.fillRect(Math.cos(aa) * rx * rr, -th + Math.sin(aa) * ry * rr, 0.9 * z, 0.6 * z); }
  g.strokeStyle = rim; g.lineWidth = 0.8 * z;
  g.beginPath(); g.ellipse(0, -th, rx - 0.4 * z, ry - 0.2 * z, 0, 0, Math.PI * 2); g.stroke();
  // highlight on the near lip
  g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 0.5 * z;
  g.beginPath(); g.ellipse(0, -th, rx - 0.4 * z, ry - 0.2 * z, 0, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  if (hl) {
    // selection glow ring, breathing slowly; brighter gold for the unit that is acting
    const k = 0.6 + 0.4 * Math.sin(now / 260);
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.shadowColor = hl === 2 ? '#f0d060' : rim; g.shadowBlur = 6 * z;
    g.strokeStyle = hl === 2 ? `rgba(240,208,96,${0.55 + 0.4 * k})` : hexRgba(rim, 0.45 + 0.4 * k);
    g.lineWidth = 1.4 * z;
    g.beginPath(); g.ellipse(0, -th * 0.5, rx + 1.6 * z, ry + 0.9 * z, 0, 0, Math.PI * 2); g.stroke();
    g.restore();
  }
  if (flash > 0) {
    g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.5 * flash;
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(0, -th, rx, ry, 0, 0, Math.PI * 2); g.fill(); g.restore();
  }
}

function drawFigurine(g, unit, def, a, worldX, worldY, z, now, hl) {
  const fig = FIGS[unit.hero];
  const src = fig ? fig.img : def.idle;
  const im = images[src];
  const fo = fig ? fig.origin : def.origin;
  const gt = fig ? fig.gunTip : def.gunTip;
  const imgFacing = fig ? (fig.imageFacing || 1) : (def.imageFacing || 1);
  const pose = figPose(unit, a, now);
  const h = def.height * (fig ? fig.h || 1 : 1) * z;
  const w = im && im.naturalWidth ? h * (im.naturalWidth / im.naturalHeight) : h * 0.45;
  const th = BASE.th * z;
  const ko = a.clip === 'ko' || unit.hp <= 0;

  // board shadow: stays on the ground, shrinks while the piece is in the air
  const air = Math.max(0, pose.lift) / 8;
  g.save();
  g.fillStyle = `rgba(0,0,0,${0.42 - 0.18 * air})`;
  g.beginPath();
  g.ellipse(worldX + pose.ox * z + (ko ? -pose.facing * h * 0.32 * Math.min(1, Math.abs(pose.rot) / (80 * DEG)) : 0), worldY + 0.8 * z,
    (BASE.rx + 1.5) * z * (1 - 0.25 * air) + (ko ? h * 0.28 * Math.min(1, Math.abs(pose.rot) / (80 * DEG)) : 0), (BASE.ry + 1) * z * (1 - 0.25 * air), 0, 0, Math.PI * 2);
  g.fill();
  g.restore();

  const M = pieceMatrix(worldX, worldY, z, pose);
  const T0 = g.getTransform();
  if (!g.__noShadow) { const dp = T0.transformPoint(new DOMPoint(worldX, worldY)); a.devX = dp.x; a.devY = dp.y; }
  g.save();
  g.setTransform(T0.multiply(M));
  drawBase(g, z, unit.side, ko ? 0 : hl, now, pose.flash);
  // the miniature, glued to the top of the base; idle sway pivots on its feet
  g.translate(0, -th);
  if (pose.sway) g.rotate(pose.sway);
  const flip = pose.facing * imgFacing;
  g.scale(flip, 1);
  const oxp = fo[0] * w, oyp = fo[1] * h;
  if (im && im.complete && im.naturalWidth) {
    if (ko) g.filter = 'saturate(0.55) brightness(0.8)';
    g.drawImage(im, -oxp, -oyp, w, h);
    g.filter = 'none';
    if (pose.flash > 0) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.65 * pose.flash;
      g.drawImage(im, -oxp, -oyp, w, h);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
  } else {
    g.fillStyle = def.colour;
    g.fillRect(-w * 0.25, -h, w * 0.5, h);
  }
  g.restore();

  // anchors in world space
  const local = (lx, ly) => {
    const sw = pose.sway || 0, c = Math.cos(sw), s = Math.sin(sw);
    const x0 = lx * flip, y0 = ly;
    const p = M.transformPoint(new DOMPoint(x0 * c - y0 * s, x0 * s + y0 * c - th));
    return { x: p.x, y: p.y };
  };
  const tip = local((gt[0] - fo[0]) * w + (pose.recoil || 0), (gt[1] - fo[1]) * h);
  const hd = fig && fig.head ? fig.head : [0.5, 0.10];
  const head = ko ? { x: worldX - pose.facing * h * 0.45, y: worldY - 10 * z } : local((hd[0] - fo[0]) * w, (hd[1] - fo[1]) * h);

  if (a.clip === 'ability' && a.t < 0.7) {
    const k = Math.sin(Math.min(1, a.t / 0.7) * Math.PI);
    g.save();
    g.globalCompositeOperation = 'lighter';
    const rad = (14 + 10 * k) * z;
    const grd = g.createRadialGradient(worldX, worldY - th, 2 * z, worldX, worldY - th, rad);
    grd.addColorStop(0, `rgba(255,240,200,${0.4 * k})`);
    grd.addColorStop(0.5, hexRgba(def.colour || '#88ffcc', 0.3 * k));
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.beginPath(); g.ellipse(worldX, worldY - th, rad, rad * 0.45, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  if (pose.muzzle > 0 && !def.melee) drawMuzzle(g, tip.x, tip.y, z, pose.muzzle, pose.facing);
  a.gunX = tip.x; a.gunY = tip.y;
  a.headX = head.x; a.headY = head.y;
  return { headX: head.x, headY: head.y, footX: worldX, footY: worldY, gunX: tip.x, gunY: tip.y, z, w, h };
}
if (typeof window !== 'undefined') window.__actors = { setUnitStyle, unitStyle, playClip, ensureAnim };
