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
  for (const id of ACTOR_IDS) {
    const src = ACTORS[id].idle;
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

export function drawActor(g, unit, worldX, worldY, z, now) {
  const def = ACTORS[unit.hero];
  if (!def) return null;
  const a = ensureAnim(unit);
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
  return (ACTORS[id] && ACTORS[id].height) || 28;
}

function hexRgba(hex, a) {
  const h = (hex || '#ffffff').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}
