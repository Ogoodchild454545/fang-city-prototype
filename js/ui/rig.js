// Layered cutout rig for the four lead operators.
// Parts are isolated PNGs (head, torso, upper/lower arms, legs or coil, weapon)
// parented into a bone tree and posed with JS tweens: independent leg walk,
// aimed arms with recoil, a knees-buckle-then-fall KO, and a get-up revive.
const DEG = Math.PI / 180;
const PART_DIR = 'assets/actors/parts/';

const BIPED_PARTS = ['head','torso','armR','forearmR','armL','forearmL','thighR','shinR','thighL','shinL','weapon'];
const SNAKE_PARTS = ['head','torso','armR','forearmR','armL','forearmL','coil','mid','tip','weapon','bag'];

// Bone lengths in rig-units. Assembled biped is ~100 units tall (feet to ear).
const RU = {
  thigh: 26, shin: 28, torso: 32, head: 22, arm: 16, forearm: 18,
  rifle: 36, pistol: 16,
  coil: 30, mid: 18, tip: 16,
};

export const RIGS = {
  rook:   { kind: 'biped', parts: BIPED_PARTS, weapon: 'rifle', height: 78 },
  brick:  { kind: 'biped', parts: BIPED_PARTS, weapon: 'rifle', height: 70 },
  lumen:  { kind: 'biped', parts: BIPED_PARTS, weapon: 'rifle', height: 82 },
  vesper: { kind: 'snake', parts: SNAKE_PARTS, weapon: 'pistol', height: 76, imageFacing: -1 },
};

const images = {};
const meta = {}; // per-hero-part: {img, axis, pw, ph, pvtX, pvtY}

function srcOf(id, part) { return `${PART_DIR}${id}-${part}.png`; }

export function hasRig(id) { return !!RIGS[id]; }

export function preloadRigs() {
  for (const id of Object.keys(RIGS)) {
    for (const part of RIGS[id].parts) {
      const src = srcOf(id, part);
      if (images[src]) continue;
      const im = new Image();
      im.src = src;
      images[src] = im;
    }
  }
}

export function rigReady(id) {
  const def = RIGS[id];
  if (!def) return false;
  for (const part of def.parts) {
    const im = images[srcOf(id, part)];
    if (!im || !im.complete || !im.naturalWidth) return false;
  }
  return true;
}

function pivotsFor(kind, part) {
  // UV of the joint on the part image.
  if (part === 'head') return [0.50, 0.90];
  if (part === 'torso') return [0.50, 0.90];
  if (part === 'weapon') return [0.30, 0.58];
  if (part === 'bag') return [0.50, 0.12];
  if (part === 'coil') return [0.50, 0.90];
  if (part === 'mid') return [0.45, 0.18];
  if (part === 'tip') return [0.22, 0.30];
  // limbs: joint at the top of the painted bone
  return [0.50, 0.12];
}

function weaponGrip(kind) {
  return kind === 'pistol' ? [0.62, 0.62] : [0.30, 0.58];
}
function weaponTip(kind) {
  return kind === 'pistol' ? [0.08, 0.42] : [0.97, 0.42];
}

function ensureMeta(id, part) {
  const key = id + ':' + part;
  if (meta[key]) return meta[key];
  const im = images[srcOf(id, part)];
  if (!im || !im.naturalWidth) return null;
  const rig = RIGS[id];
  let [ux, uy] = pivotsFor(rig.kind, part);
  if (part === 'weapon') [ux, uy] = weaponGrip(rig.weapon);
  const pw = im.naturalWidth, ph = im.naturalHeight;
  const pvtX = ux * pw, pvtY = uy * ph;
  // Bone axis: vector from pivot toward the far end of the sprite.
  let ax, ay;
  if (part === 'head') { ax = 0.5 * pw - pvtX; ay = 0.12 * ph - pvtY; }
  else if (part === 'torso') { ax = 0.5 * pw - pvtX; ay = 0.12 * ph - pvtY; }
  else if (part === 'weapon') {
    const tip = weaponTip(rig.weapon);
    ax = tip[0] * pw - pvtX; ay = tip[1] * ph - pvtY;
  } else if (part === 'coil') { ax = 0.50 * pw - pvtX; ay = 0.12 * ph - pvtY; }
  else if (part === 'mid' || part === 'tip') { ax = 0.80 * pw - pvtX; ay = 0.80 * ph - pvtY; }
  else { ax = 0.50 * pw - pvtX; ay = 0.88 * ph - pvtY; }
  const axis = Math.atan2(ay, ax);
  meta[key] = { img: im, pw, ph, pvtX, pvtY, axis, part };
  return meta[key];
}

function boneLen(part, kind, weap) {
  if (part === 'thighR' || part === 'thighL') return RU.thigh;
  if (part === 'shinR' || part === 'shinL') return RU.shin;
  if (part === 'armR' || part === 'armL') return RU.arm;
  if (part === 'forearmR' || part === 'forearmL') return RU.forearm;
  if (part === 'torso') return RU.torso;
  if (part === 'head') return RU.head;
  if (part === 'weapon') return weap === 'pistol' ? RU.pistol : RU.rifle;
  if (part === 'coil') return RU.coil;
  if (part === 'mid') return RU.mid;
  if (part === 'tip') return RU.tip;
  return 16;
}

function partScale(m, part, kind, weap) {
  // Map the painted bone (pivot -> far end) onto the rig-unit length.
  const target = boneLen(part, kind, weap);
  const dx = (part === 'weapon' ? (weap === 'pistol' ? 0.08 : 0.97) * m.pw : 0.50 * m.pw) - m.pvtX;
  const dy = (part === 'head' || part === 'torso' || part === 'coil'
    ? 0.12 * m.ph : part === 'weapon' ? (weap === 'pistol' ? 0.42 : 0.42) * m.ph : 0.88 * m.ph) - m.pvtY;
  const pix = Math.max(8, Math.hypot(dx, dy));
  return target / pix;
}

function lerp(a, b, t) { return a + (b - a) * t; }
function lerpPose(A, B, t) {
  const out = {};
  const keys = new Set([...Object.keys(A), ...Object.keys(B)]);
  for (const k of keys) out[k] = lerp(A[k] || 0, B[k] || 0, t);
  return out;
}
function easeInOut(t) { return t * t * (3 - 2 * t); }
function easeOut(t) { return 1 - (1 - t) * (1 - t); }
function easeIn(t) { return t * t; }

function idlePose(kind, t, breath) {
  const b = Math.sin(t * (breath || 2.1) * Math.PI * 2);
  const pose = {
    hipX: 0, hipY: b * 0.6, hipRot: 0,
    torso: b * 2 * DEG, head: -b * 2 * DEG,
    armR: -55 * DEG, forearmR: -35 * DEG,
    armL: -20 * DEG, forearmL: -15 * DEG,
    thighR: 6 * DEG, shinR: 4 * DEG,
    thighL: -6 * DEG, shinL: 6 * DEG,
    weapon: -8 * DEG,
    coil: b * 4 * DEG, mid: -b * 6 * DEG, tip: b * 8 * DEG,
    bag: 0, muzzle: 0,
  };
  if (kind === 'snake') {
    pose.armR = -60 * DEG;
    pose.forearmR = -25 * DEG;
    pose.armL = 8 * DEG;
    pose.forearmL = 10 * DEG;
    pose.weapon = 8 * DEG;
    pose.hipY = b * 0.8;
  }
  return pose;
}

function walkPose(kind, t, cadence) {
  if (kind === 'snake') {
    const p = (t / (cadence || 0.50)) * Math.PI * 2;
    return {
      hipX: Math.sin(p) * 1.2, hipY: -Math.abs(Math.sin(p)) * 2.2, hipRot: Math.sin(p) * 6 * DEG,
      torso: Math.sin(p) * 5 * DEG, head: -Math.sin(p) * 4 * DEG,
      armR: -50 * DEG + Math.sin(p) * 8 * DEG, forearmR: -20 * DEG,
      armL: 8 * DEG - Math.sin(p) * 8 * DEG, forearmL: 10 * DEG,
      weapon: 6 * DEG,
      coil: Math.sin(p) * 14 * DEG,
      mid: Math.sin(p + 0.9) * 18 * DEG,
      tip: Math.sin(p + 1.8) * 22 * DEG,
      bag: Math.sin(p) * 6 * DEG, muzzle: 0,
    };
  }
  const cyc = cadence || 0.46;
  const p = (t / cyc) % 1;
  // Four walk keys, then wrap.
  const keys = [
    { hipY: 0, hipRot: 4 * DEG, thighR: 22 * DEG, shinR: 4 * DEG, thighL: -28 * DEG, shinL: 38 * DEG, armR: 18 * DEG, forearmR: 10 * DEG, armL: -30 * DEG, forearmL: -20 * DEG, torso: 3 * DEG, head: -2 * DEG, weapon: -6 * DEG },
    { hipY: -3.2, hipRot: 0, thighR: -4 * DEG, shinR: 10 * DEG, thighL: 8 * DEG, shinL: 22 * DEG, armR: -6 * DEG, forearmR: -8 * DEG, armL: 6 * DEG, forearmL: 6 * DEG, torso: 0, head: 0, weapon: -8 * DEG },
    { hipY: 0, hipRot: -4 * DEG, thighR: -28 * DEG, shinR: 38 * DEG, thighL: 22 * DEG, shinL: 4 * DEG, armR: -30 * DEG, forearmR: -20 * DEG, armL: 18 * DEG, forearmL: 10 * DEG, torso: -3 * DEG, head: 2 * DEG, weapon: -6 * DEG },
    { hipY: -3.2, hipRot: 0, thighR: 8 * DEG, shinR: 22 * DEG, thighL: -4 * DEG, shinL: 10 * DEG, armR: 6 * DEG, forearmR: 6 * DEG, armL: -6 * DEG, forearmL: -8 * DEG, torso: 0, head: 0, weapon: -8 * DEG },
  ];
  const u = p * 4;
  const i = Math.floor(u) % 4;
  const j = (i + 1) % 4;
  const pose = lerpPose(keys[i], keys[j], easeInOut(u - i));
  pose.hipX = 0;
  pose.bag = 0; pose.coil = 0; pose.mid = 0; pose.tip = 0; pose.muzzle = 0;
  return pose;
}

function shootPose(kind, t, anim) {
  const idle = idlePose(kind, 0, 2);
  const antic = {
    ...idle,
    torso: 8 * DEG, head: 4 * DEG, hipY: 1.2,
    armR: -40 * DEG, forearmR: -20 * DEG,
    armL: -10 * DEG, forearmL: -5 * DEG,
    weapon: 6 * DEG, thighR: 10 * DEG, shinR: 6 * DEG, thighL: -4 * DEG, shinL: 8 * DEG,
  };
  const aim = {
    ...idle,
    torso: -4 * DEG, head: -6 * DEG, hipY: -0.4,
    armR: -80 * DEG, forearmR: -55 * DEG,
    armL: -70 * DEG, forearmL: -40 * DEG,
    weapon: -6 * DEG, thighR: 8 * DEG, shinR: 4 * DEG, thighL: -4 * DEG, shinL: 6 * DEG,
  };
  const fire = {
    ...aim,
    torso: 10 * DEG, head: 4 * DEG, hipY: 1.5, hipX: -2.5, hipRot: 6 * DEG,
    armR: -70 * DEG, forearmR: -40 * DEG,
    armL: -60 * DEG, forearmL: -28 * DEG,
    weapon: 10 * DEG, muzzle: 1,
  };
  const recover = { ...aim, torso: -2 * DEG, weapon: -4 * DEG, muzzle: 0 };
  let pose;
  if (t < 0.10) pose = lerpPose(idle, antic, easeOut(t / 0.10));
  else if (t < 0.16) pose = lerpPose(antic, aim, easeOut((t - 0.10) / 0.06));
  else if (t < 0.22) {
    pose = lerpPose(aim, fire, easeOut((t - 0.16) / 0.06));
    if (anim && anim.muzzle === 0 && t > 0.17) anim.muzzle = 1;
  } else pose = lerpPose(fire, recover, easeInOut(Math.min(1, (t - 0.22) / 0.26)));
  return pose;
}

function meleePose(kind, t) {
  const idle = idlePose(kind, 0, 2);
  const wind = { ...idle, torso: 12 * DEG, armR: 30 * DEG, forearmR: 20 * DEG, hipRot: 8 * DEG };
  const swing = { ...idle, torso: -14 * DEG, armR: -100 * DEG, forearmR: -20 * DEG, hipX: 4, hipRot: -8 * DEG };
  if (t < 0.12) return lerpPose(idle, wind, easeOut(t / 0.12));
  if (t < 0.22) return lerpPose(wind, swing, easeIn( (t - 0.12) / 0.10));
  return lerpPose(swing, idle, easeInOut(Math.min(1, (t - 0.22) / 0.20)));
}

function hitPose(kind, t) {
  const idle = idlePose(kind, 0, 2);
  const punch = Math.exp(-t * 7) * (1 - Math.min(1, t / 0.36));
  return {
    ...idle,
    hipX: -6 * punch, hipRot: 10 * DEG * punch,
    torso: 12 * DEG * punch, head: 8 * DEG * punch,
    armR: idle.armR + 20 * DEG * punch, armL: idle.armL - 15 * DEG * punch,
  };
}

function koPose(kind, t) {
  const idle = idlePose(kind, 0, 2);
  // Phase 1: knees buckle, hip drops.
  const buckle = {
    ...idle,
    hipY: 16, hipRot: 8 * DEG, hipX: -2,
    thighR: 55 * DEG, shinR: 70 * DEG,
    thighL: 48 * DEG, shinL: 75 * DEG,
    torso: 22 * DEG, head: 12 * DEG,
    armR: 25 * DEG, forearmR: 20 * DEG,
    armL: -30 * DEG, forearmL: 15 * DEG,
    weapon: 20 * DEG,
    coil: 18 * DEG, mid: 25 * DEG, tip: 20 * DEG,
  };
  // Phase 2: sideways collapse, body rot comes from hipRot going large.
  const fall = {
    hipX: -18, hipY: 36, hipRot: 82 * DEG,
    torso: 18 * DEG, head: 20 * DEG,
    thighR: 30 * DEG, shinR: 20 * DEG,
    thighL: 60 * DEG, shinL: 30 * DEG,
    armR: 50 * DEG, forearmR: 30 * DEG,
    armL: -20 * DEG, forearmL: 25 * DEG,
    weapon: 40 * DEG,
    coil: 40 * DEG, mid: 35 * DEG, tip: 30 * DEG,
    bag: 15 * DEG, muzzle: 0,
  };
  const k = Math.min(1, t / 0.75);
  if (k < 0.28) return lerpPose(idle, buckle, easeIn(k / 0.28));
  if (k < 0.72) return lerpPose(buckle, fall, easeInOut((k - 0.28) / 0.44));
  // settle
  const settle = { ...fall, hipY: 34, head: 16 * DEG };
  return lerpPose(fall, settle, easeOut((k - 0.72) / 0.28));
}

function revivePose(kind, t) {
  const down = koPose(kind, 1);
  const push = {
    ...down,
    hipY: 24, hipRot: 50 * DEG, hipX: -10,
    torso: 8 * DEG, head: -6 * DEG,
    armR: -40 * DEG, forearmR: -10 * DEG,
    thighR: 60 * DEG, shinR: 80 * DEG,
    thighL: 55 * DEG, shinL: 75 * DEG,
    coil: 10 * DEG, mid: 12 * DEG,
  };
  const crouch = {
    hipX: -2, hipY: 14, hipRot: 8 * DEG,
    torso: 10 * DEG, head: 0,
    thighR: 50 * DEG, shinR: 70 * DEG,
    thighL: 45 * DEG, shinL: 68 * DEG,
    armR: -30 * DEG, forearmR: -15 * DEG,
    armL: -10 * DEG, forearmL: 5 * DEG,
    weapon: 0, coil: 6 * DEG, mid: 4 * DEG, tip: 4 * DEG, bag: 0, muzzle: 0,
  };
  const stand = idlePose(kind, 0, 2);
  const k = Math.min(1, t / 0.7);
  if (k < 0.3) return lerpPose(down, push, easeOut(k / 0.3));
  if (k < 0.6) return lerpPose(push, crouch, easeInOut((k - 0.3) / 0.3));
  return lerpPose(crouch, stand, easeOut((k - 0.6) / 0.4));
}

function abilityPose(kind, t, anim) {
  if (kind === 'snake') {
    // bow / glow — torso dips, then rises with arms open
    const idle = idlePose(kind, 0, 2);
    const bow = { ...idle, torso: 16 * DEG, head: 10 * DEG, hipY: 3, armR: 20 * DEG, armL: 20 * DEG };
    const rise = { ...idle, torso: -6 * DEG, head: -4 * DEG, hipY: -2, armR: -80 * DEG, armL: -80 * DEG, forearmR: -20 * DEG, forearmL: -20 * DEG };
    if (t < 0.22) return lerpPose(idle, bow, easeOut(t / 0.22));
    if (t < 0.5) return lerpPose(bow, rise, easeInOut((t - 0.22) / 0.28));
    return lerpPose(rise, idle, easeInOut((t - 0.5) / 0.2));
  }
  // others: long aim then shot
  return shootPose(kind, t * 0.7, anim);
}

export function poseOf(unit, def, anim, now) {
  const rig = RIGS[unit.hero];
  if (!rig) return idlePose('biped', 0, 2);
  const t = anim.t || 0;
  const kind = rig.kind;
  if (anim.clip === 'walk') return walkPose(kind, t, def.walk);
  if (anim.clip === 'shoot') return shootPose(kind, t, anim);
  if (anim.clip === 'melee') return meleePose(kind, t);
  if (anim.clip === 'hit') return hitPose(kind, t);
  if (anim.clip === 'ko') return koPose(kind, t);
  if (anim.clip === 'revive') return revivePose(kind, t);
  if (anim.clip === 'ability') return abilityPose(kind, t, anim);
  return idlePose(kind, (now || 0) / 1000 + (anim.t0 || 0) / 10000, def.breath);
}

function alignOf(m) {
  // Head, torso and coil are authored upright; keep them as painted.
  // Limbs and weapons are aligned so the bone/barrel points +Y at angle 0.
  if (!m) return 0;
  if (m.part === 'head' || m.part === 'torso' || m.part === 'coil' || m.part === 'bag') return 0;
  return Math.PI / 2 - m.axis;
}

function drawPart(g, id, part, ang, s, weap, kind) {
  const m = ensureMeta(id, part);
  if (!m) return null;
  const sc = partScale(m, part, kind, weap) * s;
  g.save();
  g.rotate(ang + alignOf(m));
  g.drawImage(m.img, -m.pvtX * sc, -m.pvtY * sc, m.pw * sc, m.ph * sc);
  g.restore();
  return m;
}

function childOffset(m, ux, uy, part, kind, weap, s) {
  const sc = partScale(m, part, kind, weap) * s;
  const angAlign = alignOf(m);
  const lx = (ux * m.pw - m.pvtX) * sc;
  const ly = (uy * m.ph - m.pvtY) * sc;
  const c = Math.cos(angAlign), sn = Math.sin(angAlign);
  return { x: lx * c - ly * sn, y: lx * sn + ly * c };
}

export function drawRig(g, unit, def, anim, footX, footY, z, now) {
  const rig = RIGS[unit.hero];
  if (!rig || !rigReady(unit.hero)) return null;
  const pose = poseOf(unit, def, anim, now);
  const flip = (anim.facing || 1) * (rig.imageFacing || def.imageFacing || 1);
  // Scale: 100 rig-units ~ def.height world pixels, times camera z.
  const s = (def.height * z) / 100;
  const weap = rig.weapon;
  const kind = rig.kind;

  const anchors = { headX: footX, headY: footY - def.height * z * 0.8, gunX: footX, gunY: footY - def.height * z * 0.5 };
  const parentT = (typeof g.getTransform === 'function') ? g.getTransform() : null;

  function toWorldZ(lx, ly) {
    if (!parentT || typeof g.getTransform !== 'function') return { x: footX + lx, y: footY + ly };
    const T = g.getTransform();
    const canvas = { x: T.a * lx + T.c * ly + T.e, y: T.b * lx + T.d * ly + T.f };
    const inv = parentT.inverse();
    return { x: inv.a * canvas.x + inv.c * canvas.y + inv.e, y: inv.b * canvas.x + inv.d * canvas.y + inv.f };
  }

  g.save();
  g.translate(footX, footY);
  g.scale(flip, 1);

  // Contact shadow
  g.save();
  g.fillStyle = 'rgba(0,0,0,0.38)';
  const shadowW = 13 * z * (1 + Math.max(0, pose.hipY) * 0.01);
  g.beginPath(); g.ellipse(0, 2 * z, shadowW, 5 * z, 0, 0, Math.PI * 2); g.fill();
  g.restore();

  const hipY = kind === 'snake' ? (pose.hipY || 0) : -(RU.thigh + RU.shin) + pose.hipY;
  g.translate(pose.hipX, hipY);
  g.rotate(pose.hipRot || 0);

  const drawLimb = (upper, lower, uAng, lAng, attach) => {
    g.save();
    g.translate(attach.x, attach.y);
    g.rotate(uAng);
    drawPart(g, unit.hero, upper, 0, s, weap, kind);
    g.translate(0, boneLen(upper, kind, weap) * s);
    g.rotate(lAng);
    drawPart(g, unit.hero, lower, 0, s, weap, kind);
    g.restore();
  };

  // Far leg (behind the torso).
  if (kind === 'biped') {
    drawLimb('thighL', 'shinL', pose.thighL, pose.shinL, { x: -5 * s, y: 2 * s });
  } else {
    g.save();
    drawPart(g, unit.hero, 'coil', pose.coil, s, weap, kind);
    const cm = ensureMeta(unit.hero, 'coil');
    // The painted coil is already a full standing tail; extra mid/tip segments
    // splayed on the floor and hid the character. Keep them for a later pass.
    if (cm) { /* coil only */ }
    g.restore();
  }

  // Torso, head, far arm, near arm + weapon (shoulders follow the torso).
  g.save();
  if (kind === 'snake') {
    // Sit the blouse on top of the standing coil. A UV socket was landing
    // the torso back at the feet, so use a fixed lift along the coil.
    g.rotate(pose.coil || 0);
    g.translate(0, -RU.coil * s * 0.92);
  }
  g.rotate(pose.torso);
  const tm = ensureMeta(unit.hero, 'torso');
  const shL = tm ? childOffset(tm, 0.20, 0.26, 'torso', kind, weap, s) : { x: -9 * s, y: -RU.torso * s * 0.72 };
  const shR = tm ? childOffset(tm, 0.80, 0.24, 'torso', kind, weap, s) : { x: 9 * s, y: -RU.torso * s * 0.72 };

  // Far arm first, under the jacket.
  drawLimb('armL', 'forearmL', pose.armL, pose.forearmL, shL);

  drawPart(g, unit.hero, 'torso', 0, s, weap, kind);
  if (tm) {
    const neck = childOffset(tm, 0.50, 0.10, 'torso', kind, weap, s);
    g.save();
    g.translate(neck.x, neck.y);
    g.rotate(pose.head);
    drawPart(g, unit.hero, 'head', 0, s, weap, kind);
    {
      const hp = toWorldZ(0, -RU.head * s * 0.45);
      anchors.headX = hp.x; anchors.headY = hp.y;
    }
    g.restore();
    if (kind === 'snake' && ensureMeta(unit.hero, 'bag')) {
      const bo = childOffset(tm, 0.30, 0.70, 'torso', kind, weap, s);
      g.save();
      g.translate(bo.x, bo.y);
      g.rotate(pose.bag || 0);
      drawPart(g, unit.hero, 'bag', 0, s, weap, kind);
      g.restore();
    }
  }

  // Near arm + weapon.
  g.save();
  g.translate(shR.x, shR.y);
  g.rotate(pose.armR);
  drawPart(g, unit.hero, 'armR', 0, s, weap, kind);
  g.translate(0, RU.arm * s);
  g.rotate(pose.forearmR);
  drawPart(g, unit.hero, 'forearmR', 0, s, weap, kind);
  g.translate(0, RU.forearm * s * 0.88);
  g.rotate(pose.weapon || 0);
  drawPart(g, unit.hero, 'weapon', 0, s, weap, kind);
  {
    const wm = ensureMeta(unit.hero, 'weapon');
    if (wm) {
      const tip = weaponTip(weap);
      const sc = partScale(wm, 'weapon', kind, weap) * s;
      const align = alignOf(wm);
      const lx = (tip[0] * wm.pw - wm.pvtX) * sc;
      const ly = (tip[1] * wm.ph - wm.pvtY) * sc;
      const c = Math.cos(align), sn = Math.sin(align);
      const px = lx * c - ly * sn, py = lx * sn + ly * c;
      const gp = toWorldZ(px, py);
      anchors.gunX = gp.x; anchors.gunY = gp.y;
    }
  }
  g.restore(); // arm
  g.restore(); // torso

  if (kind === 'biped') {
    drawLimb('thighR', 'shinR', pose.thighR, pose.shinR, { x: 5 * s, y: 2 * s });
  }

  g.restore(); // flip / feet

  // Hit flash: additive redraw of the silhouette is hard with many parts;
  // a short lighter halo around the torso is enough and won't paint a card.
  if (anim.flash > 0.05) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = Math.min(1, anim.flash) * 0.55;
    g.fillStyle = 'rgba(255,220,180,0.8)';
    g.beginPath();
    g.ellipse(footX, footY - def.height * z * 0.45, 10 * z, def.height * z * 0.4, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  // Class-ability aura (same language as the stamp actors)
  if (anim.clip === 'ability') {
    const k = Math.min(1, (anim.t || 0) / 0.7);
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = hexRgba(def.colour, 0.18 * (1 - k));
    g.beginPath();
    g.arc(footX, footY - def.height * z * 0.45, (14 + 18 * k) * z, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  // Muzzle at the computed gun tip
  const muz = Math.max(anim.muzzle || 0, pose.muzzle || 0);
  if (muz > 0.05 && !def.melee) {
    drawMuzzle(g, anchors.gunX, anchors.gunY, z, muz, anim.facing || 1);
  }

  anchors.muzzle = muz;
  return anchors;
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

function hexRgba(hex, a) {
  const h = (hex || '#ffffff').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const r = (n >> 16) & 255, gv = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${gv},${b},${a})`;
}
