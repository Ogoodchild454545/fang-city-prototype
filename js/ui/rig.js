// Layered cutout rig for every operator and rival.
// Parts are isolated PNGs parented into a bone tree. Every child pivot is
// tucked inside its parent (joint caps + overlap) so rotation never opens a gap.
const DEG = Math.PI / 180;
const PART_DIR = 'assets/actors/parts/';
const JOINT_TUCK = 0.22; // child starts this fraction back along the parent bone

const BIPED_PARTS = ['head','torso','armR','forearmR','armL','forearmL','thighR','shinR','thighL','shinL','weapon'];
const SNAKE_PARTS = ['head','torso','armR','forearmR','armL','forearmL','coil','mid','tip','weapon','bag'];
const SNAKE_CORE  = ['head','torso','armR','forearmR','armL','forearmL','coil','weapon'];

// Bone lengths in rig-units. Assembled biped is ~100 units tall (feet to ear).
const RU = {
  thigh: 26, shin: 28, torso: 32, head: 22, arm: 16, forearm: 18,
  rifle: 36, pistol: 16,
  coil: 30, mid: 18, tip: 16,
};

export const RIGS = {
  rook:   { kind: 'biped', parts: BIPED_PARTS, weapon: 'rifle', height: 78 },
  brick:  { kind: 'biped', parts: BIPED_PARTS, weapon: 'rifle', height: 74 },
  lumen:  { kind: 'biped', parts: BIPED_PARTS, weapon: 'rifle', height: 82 },
  vesper: { kind: 'snake', parts: SNAKE_PARTS, weapon: 'pistol', height: 76, imageFacing: -1 },
  pip:    { kind: 'biped', parts: BIPED_PARTS, weapon: 'pistolR', height: 62, imageFacing: 1 },
  ivory:  { kind: 'biped', parts: BIPED_PARTS, weapon: 'shotgun', height: 80, imageFacing: 1 },
  nile:   { kind: 'biped', parts: BIPED_PARTS, weapon: 'melee', height: 76, imageFacing: 1 },
  marlow: { kind: 'biped', parts: BIPED_PARTS, weapon: 'shotgun', height: 86, imageFacing: 1 },
  hook:   { kind: 'biped', parts: BIPED_PARTS, weapon: 'pistolR', height: 78, imageFacing: 1 },
  knack:  { kind: 'biped', parts: BIPED_PARTS, weapon: 'pistolR', height: 66, imageFacing: 1 },
  slab:   { kind: 'biped', parts: BIPED_PARTS, weapon: 'rifle', height: 72, imageFacing: 1 },
  rill:   { kind: 'biped', parts: BIPED_PARTS, weapon: 'melee', height: 76, imageFacing: 1 },
  pact:   { kind: 'snake', parts: SNAKE_CORE, weapon: 'pistolR', height: 80, imageFacing: 1 },
  bruno:  { kind: 'biped', parts: BIPED_PARTS, weapon: 'shotgun', height: 86, imageFacing: 1 },
  ash:    { kind: 'biped', parts: BIPED_PARTS, weapon: 'rifle', height: 80, imageFacing: 1 },
  mica:   { kind: 'biped', parts: BIPED_PARTS, weapon: 'rifle', height: 80, imageFacing: 1 },
};

// Per-hero pivot UVs measured from the part sheets, plus stance / scale tweaks.
// Torso pivots sit ABOVE the hem (and well above any hanging tail) so the
// jacket or coat skirt overlaps the pelvis. Shoulders sit INSIDE the armholes.
const FITS = {
  rook: {
    torsoPivot: [0.38, 0.70], neck: [0.36, 0.15],
    shL: [0.18, 0.28], shR: [0.54, 0.28],
    headPivot: [0.50, 0.86], headMul: 1.0,
    stance: 7.5, hipTuck: -6, thighSx: 1,
    jointArm: '#6a4a32', jointLeg: '#3a3a42', jointNeck: '#8a7a68',
  },
  lumen: {
    torsoPivot: [0.54, 0.56], neck: [0.54, 0.09],
    shL: [0.34, 0.22], shR: [0.72, 0.22],
    headPivot: [0.50, 0.86], headMul: 1.02,
    stance: 6.5, hipTuck: -8, thighSx: 0.92,
    jointArm: '#c45a28', jointLeg: '#2a2a32', jointNeck: '#e8b070',
  },
  brick: {
    torsoPivot: [0.50, 0.82], neck: [0.50, 0.09],
    shL: [0.20, 0.30], shR: [0.80, 0.30],
    headPivot: [0.50, 0.86], headMul: 0.98,
    stance: 9.0, hipTuck: -6, thighSx: 0.82,
    thighMul: 1.14, shinMul: 1.20,
    jointArm: '#c46a28', jointLeg: '#7a5a38', jointNeck: '#f0e8dc',
  },
  vesper: {
    torsoPivot: [0.50, 0.86], neck: [0.50, 0.24],
    shL: [0.22, 0.24], shR: [0.78, 0.24],
    headPivot: [0.48, 0.60], headMul: 1.27,
    stance: 0, hipTuck: 0, coilLift: 0.78, thighSx: 1,
    jointArm: '#1a6a62', jointLeg: '#3a8a62', jointNeck: '#3a8a62',
  },
  pip: {
    torsoPivot: [0.50, 0.80], neck: [0.50, 0.12],
    shL: [0.20, 0.28], shR: [0.80, 0.28],
    headPivot: [0.50, 0.86], headMul: 1.04,
    stance: 6.0, hipTuck: -5, thighSx: 0.95,
    jointArm: '#c9a227', jointLeg: '#2a2a32', jointNeck: '#8a6a50',
    weaponGrip: [0.28, 0.62], weaponTip: [0.96, 0.42],
  },
  ivory: {
    torsoPivot: [0.50, 0.70], neck: [0.50, 0.12],
    shL: [0.20, 0.26], shR: [0.80, 0.26],
    headPivot: [0.50, 0.86], headMul: 1.0,
    stance: 7.5, hipTuck: -6, thighSx: 0.95,
    jointArm: '#c8d0d8', jointLeg: '#2a2a32', jointNeck: '#e8e8e8',
  },
  nile: {
    torsoPivot: [0.36, 0.56], neck: [0.36, 0.10],
    shL: [0.12, 0.24], shR: [0.56, 0.22],
    headPivot: [0.42, 0.80], headMul: 1.02,
    stance: 8.0, hipTuck: -6, thighSx: 1,
    jointArm: '#3a6a58', jointLeg: '#3a3a28', jointNeck: '#4a6a40',
    weaponGrip: [0.50, 0.42], weaponTip: [0.08, 0.92],
  },
  marlow: {
    torsoPivot: [0.50, 0.82], neck: [0.50, 0.11],
    shL: [0.22, 0.26], shR: [0.76, 0.26],
    headPivot: [0.50, 0.86], headMul: 0.98,
    stance: 10.0, hipTuck: -5, thighSx: 0.90, thighMul: 1.08, shinMul: 1.10,
    jointArm: '#8a6a3a', jointLeg: '#5a3a20', jointNeck: '#5a3a20',
  },
  hook: {
    torsoPivot: [0.50, 0.80], neck: [0.50, 0.14],
    shL: [0.20, 0.24], shR: [0.80, 0.24],
    headPivot: [0.50, 0.78], headMul: 1.02,
    stance: 7.0, hipTuck: -6, thighSx: 0.95,
    jointArm: '#1a1a1a', jointLeg: '#1a1a1a', jointNeck: '#c45a20',
    weaponGrip: [0.28, 0.62], weaponTip: [0.96, 0.42],
    rim: 'rgba(130, 190, 220, 0.72)',
  },
  knack: {
    torsoPivot: [0.50, 0.80], neck: [0.50, 0.12],
    shL: [0.20, 0.28], shR: [0.80, 0.28],
    headPivot: [0.50, 0.86], headMul: 1.02,
    stance: 6.2, hipTuck: -5, thighSx: 0.95,
    jointArm: '#3a3228', jointLeg: '#2a2a28', jointNeck: '#4a3a30',
    weaponGrip: [0.28, 0.62], weaponTip: [0.96, 0.42],
    rim: 'rgba(130, 190, 220, 0.72)',
  },
  slab: {
    torsoPivot: [0.50, 0.80], neck: [0.50, 0.12],
    shL: [0.20, 0.28], shR: [0.80, 0.28],
    headPivot: [0.50, 0.86], headMul: 0.98,
    stance: 9.2, hipTuck: -6, thighSx: 0.82, thighMul: 1.08, shinMul: 1.12,
    jointArm: '#1a1a1a', jointLeg: '#111', jointNeck: '#e8e8e8',
    rim: 'rgba(130, 190, 220, 0.72)',
  },
  rill: {
    torsoPivot: [0.36, 0.56], neck: [0.38, 0.08],
    shL: [0.10, 0.26], shR: [0.56, 0.20],
    headPivot: [0.42, 0.80], headMul: 1.0,
    stance: 8.0, hipTuck: -6, thighSx: 1,
    jointArm: '#1a1a18', jointLeg: '#111', jointNeck: '#3a4a30',
    weaponGrip: [0.48, 0.48], weaponTip: [0.18, 0.90],
    rim: 'rgba(130, 190, 220, 0.72)',
  },
  pact: {
    torsoPivot: [0.50, 0.88], neck: [0.50, 0.14],
    shL: [0.22, 0.22], shR: [0.78, 0.22],
    headPivot: [0.50, 0.82], headMul: 1.05,
    stance: 0, hipTuck: 0, coilLift: 0.90, thighSx: 1,
    jointArm: '#0a0a0a', jointLeg: '#0a0a0a', jointNeck: '#1a1a1a',
    weaponGrip: [0.28, 0.62], weaponTip: [0.96, 0.42],
    rim: 'rgba(130, 190, 220, 0.72)',
    coilPivot: [0.50, 0.84],
  },
  bruno: {
    torsoPivot: [0.50, 0.80], neck: [0.50, 0.10],
    shL: [0.18, 0.28], shR: [0.82, 0.28],
    headPivot: [0.50, 0.86], headMul: 0.98,
    stance: 10.0, hipTuck: -5, thighSx: 0.90, thighMul: 1.08, shinMul: 1.10,
    jointArm: '#1a1410', jointLeg: '#1a1410', jointNeck: '#3a2a18',
    rim: 'rgba(130, 190, 220, 0.72)',
  },
  ash: {
    torsoPivot: [0.50, 0.68], neck: [0.50, 0.12],
    shL: [0.20, 0.24], shR: [0.80, 0.24],
    headPivot: [0.50, 0.86], headMul: 1.0,
    stance: 7.5, hipTuck: -6, thighSx: 0.95,
    jointArm: '#111', jointLeg: '#111', jointNeck: '#4a4a50',
    rim: 'rgba(130, 190, 220, 0.72)',
  },
  mica: {
    torsoPivot: [0.50, 0.66], neck: [0.50, 0.10],
    shL: [0.22, 0.22], shR: [0.78, 0.22],
    headPivot: [0.50, 0.86], headMul: 1.02,
    stance: 6.5, hipTuck: -8, thighSx: 0.92,
    jointArm: '#141414', jointLeg: '#111', jointNeck: '#c45a28',
    rim: 'rgba(130, 190, 220, 0.72)',
  },
};

const images = {};
const meta = {};

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

function fitOf(id) { return FITS[id] || FITS.rook; }

function pivotsFor(id, part) {
  const fit = fitOf(id);
  const rig = RIGS[id];
  if (part === 'head') return fit.headPivot || [0.50, 0.86];
  if (part === 'torso') return fit.torsoPivot || [0.50, 0.80];
  if (part === 'weapon') return weaponGrip(rig.weapon, fit);
  if (part === 'bag') return [0.50, 0.12];
  if (part === 'coil') return fit.coilPivot || [0.50, 0.90];
  if (part === 'mid') return [0.45, 0.18];
  if (part === 'tip') return [0.22, 0.30];
  // Limbs: pivot is well inside the painted cap so the joint stays covered.
  return [0.50, 0.20];
}

function weaponGrip(kind, fit) {
  if (fit && fit.weaponGrip) return fit.weaponGrip;
  if (kind === 'pistol') return [0.62, 0.62];
  if (kind === 'pistolR') return [0.28, 0.62];
  if (kind === 'melee') return [0.52, 0.28];
  return [0.30, 0.58];
}
function weaponTip(kind, fit) {
  if (fit && fit.weaponTip) return fit.weaponTip;
  if (kind === 'pistol') return [0.08, 0.42];
  if (kind === 'pistolR') return [0.96, 0.42];
  if (kind === 'melee') return [0.42, 0.92];
  return [0.97, 0.42];
}

function ensureMeta(id, part) {
  const key = id + ':' + part;
  if (meta[key]) return meta[key];
  const im = images[srcOf(id, part)];
  if (!im || !im.naturalWidth) return null;
  const rig = RIGS[id];
  const [ux, uy] = pivotsFor(id, part);
  const pw = im.naturalWidth, ph = im.naturalHeight;
  const pvtX = ux * pw, pvtY = uy * ph;
  let ax, ay;
  if (part === 'head') { ax = 0.5 * pw - pvtX; ay = 0.10 * ph - pvtY; }
  else if (part === 'torso') { ax = 0.5 * pw - pvtX; ay = (fitOf(id).neck[1]) * ph - pvtY; }
  else if (part === 'weapon') {
    const tip = weaponTip(rig.weapon, fitOf(id));
    ax = tip[0] * pw - pvtX; ay = tip[1] * ph - pvtY;
  } else if (part === 'coil') { ax = 0.50 * pw - pvtX; ay = 0.12 * ph - pvtY; }
  else if (part === 'mid' || part === 'tip') { ax = 0.80 * pw - pvtX; ay = 0.80 * ph - pvtY; }
  else { ax = 0.50 * pw - pvtX; ay = 0.88 * ph - pvtY; }
  const axis = Math.atan2(ay, ax);
  // Rival art is near-black ink; bake a lifted copy once so it reads on the dark docks.
  const img = fitOf(id).rim ? liftDark(im) : im;
  meta[key] = { img, pw, ph, pvtX, pvtY, axis, part, id };
  return meta[key];
}

// Luminance gamma lift (about 0.52) with a faint warm/red cast: keeps the rivals' dark,
// gritty look but separates leather, fur and kit from the asphalt. Falls back to the raw image.
function liftDark(im) {
  try {
    const c = document.createElement('canvas');
    c.width = im.naturalWidth; c.height = im.naturalHeight;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(im, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height);
    const a = d.data;
    for (let i = 0; i < a.length; i += 4) {
      if (!a[i + 3]) continue;
      const r = a[i] / 255, gg = a[i + 1] / 255, bb = a[i + 2] / 255;
      const L = 0.3 * r + 0.59 * gg + 0.11 * bb + 1e-4;
      const L2 = Math.pow(L, 0.52);
      const k = Math.min(L2 / L, 6);
      a[i] = Math.min(255, (r * k * 0.7 + L2 * 0.3) * 255 * 1.07);
      a[i + 1] = Math.min(255, (gg * k * 0.7 + L2 * 0.3) * 255 * 0.98);
      a[i + 2] = Math.min(255, (bb * k * 0.7 + L2 * 0.3) * 255 * 0.98);
    }
    x.putImageData(d, 0, 0);
    c.naturalWidth = c.width; c.naturalHeight = c.height;
    return c;
  } catch (e) {
    return im;
  }
}

const TEAM_RIM = { enemy: 'rgba(255, 80, 60, 0.78)', player: 'rgba(110, 200, 255, 0.85)' };
let curSide = 'enemy';

function legSpan(fit) {
  const f = fit || {};
  return RU.thigh * (f.thighMul || 1) + RU.shin * (f.shinMul || 1);
}

function boneLen(part, kind, weap, fit) {
  const f = fit || {};
  if (part === 'thighR' || part === 'thighL') return RU.thigh * (f.thighMul || 1);
  if (part === 'shinR' || part === 'shinL') return RU.shin * (f.shinMul || 1);
  if (part === 'armR' || part === 'armL') return RU.arm;
  if (part === 'forearmR' || part === 'forearmL') return RU.forearm;
  if (part === 'torso') return RU.torso;
  if (part === 'head') return RU.head;
  if (part === 'weapon') return (weap === 'pistol' || weap === 'pistolR') ? RU.pistol : weap === 'melee' ? 32 : RU.rifle;
  if (part === 'coil') return RU.coil;
  if (part === 'mid') return RU.mid;
  if (part === 'tip') return RU.tip;
  return 16;
}

function partScale(m, part, kind, weap) {
  const fit = fitOf(m.id);
  const target = boneLen(part, kind, weap, fit);
  if (part === 'torso') {
    const pix = Math.max(8, Math.abs((fit.neck[1] - fit.torsoPivot[1]) * m.ph));
    return target / pix;
  }
  if (part === 'head') {
    const pix = Math.max(8, Math.abs((0.10 - (fit.headPivot[1])) * m.ph));
    return (target * (fit.headMul || 1)) / pix;
  }
  const tip = weaponTip(weap, fit);
  const dx = (part === 'weapon' ? tip[0] * m.pw : 0.50 * m.pw) - m.pvtX;
  const dy = (part === 'coil'
    ? 0.12 * m.ph : part === 'weapon' ? tip[1] * m.ph : 0.88 * m.ph) - m.pvtY;
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
    // Gun held ready, stock tucked toward the ribcage, off-hand on the guard.
    armR: -62 * DEG, forearmR: -38 * DEG,
    armL: -48 * DEG, forearmL: -22 * DEG,
    thighR: 10 * DEG, shinR: 6 * DEG,
    thighL: -10 * DEG, shinL: 8 * DEG,
    weapon: -12 * DEG,
    coil: b * 4 * DEG, mid: -b * 6 * DEG, tip: b * 8 * DEG,
    bag: 0, muzzle: 0,
  };
  if (kind === 'snake') {
    pose.armR = -42 * DEG;
    pose.forearmR = -18 * DEG;
    pose.armL = 6 * DEG;
    pose.forearmL = 8 * DEG;
    pose.weapon = 4 * DEG;
    pose.hipY = b * 0.8;
  }
  return pose;
}

function walkPose(kind, t, cadence) {
  const idle = idlePose(kind, t, 2.2);
  if (kind === 'snake') {
    const p = (t / (cadence || 0.50)) * Math.PI * 2;
    return {
      ...idle,
      hipX: Math.sin(p) * 1.4,
      hipY: -Math.abs(Math.sin(p)) * 2.4,
      hipRot: Math.sin(p) * 5 * DEG,
      torso: Math.sin(p) * 4 * DEG,
      head: -Math.sin(p) * 3 * DEG,
      coil: Math.sin(p) * 10 * DEG,
      bag: Math.sin(p) * 4 * DEG,
    };
  }
  const cyc = cadence || 0.48;
  const p = (t / cyc) % 1;
  // Heel-toe: R contact, R mid-stance, L contact, L mid-stance.
  const keys = [
    { thighR: 22 * DEG, shinR: 10 * DEG, thighL: -22 * DEG, shinL: 42 * DEG, hipRot: 5 * DEG, torso: 3 * DEG, head: -2 * DEG },
    { thighR: 2 * DEG, shinR: 6 * DEG, thighL: 6 * DEG, shinL: 30 * DEG, hipRot: 1 * DEG, torso: 0, head: 0 },
    { thighR: -22 * DEG, shinR: 42 * DEG, thighL: 22 * DEG, shinL: 10 * DEG, hipRot: -5 * DEG, torso: -3 * DEG, head: 2 * DEG },
    { thighR: 6 * DEG, shinR: 30 * DEG, thighL: 2 * DEG, shinL: 6 * DEG, hipRot: -1 * DEG, torso: 0, head: 0 },
  ];
  const u = p * 4;
  const i = Math.floor(u) % 4;
  const j = (i + 1) % 4;
  const pose = lerpPose(keys[i], keys[j], easeInOut(u - i));
  // Two bobs per cycle: drop at mid-stance, rise at passing/contact.
  pose.hipY = 0.5 + Math.pow(Math.sin(p * Math.PI * 2), 2) * 2.0;
  pose.hipX = Math.sin(p * Math.PI * 2) * 0.5;
  // Weapon stays in the idle ready hold — no dropped rifle.
  pose.armR = idle.armR + Math.sin(p * Math.PI * 2) * 5 * DEG;
  pose.forearmR = idle.forearmR;
  pose.armL = idle.armL - Math.sin(p * Math.PI * 2) * 5 * DEG;
  pose.forearmL = idle.forearmL;
  pose.weapon = idle.weapon;
  pose.bag = 0; pose.coil = 0; pose.mid = 0; pose.tip = 0; pose.muzzle = 0;
  return pose;
}

function shootPose(kind, t, anim) {
  const idle = idlePose(kind, 0, 2);
  const antic = {
    ...idle,
    torso: 8 * DEG, head: 4 * DEG, hipY: 1.2,
    armR: -46 * DEG, forearmR: -24 * DEG,
    armL: -28 * DEG, forearmL: -12 * DEG,
    weapon: 4 * DEG, thighR: 10 * DEG, shinR: 6 * DEG, thighL: -8 * DEG, shinL: 8 * DEG,
  };
  const aim = {
    ...idle,
    torso: -4 * DEG, head: -6 * DEG, hipY: -0.4,
    armR: -80 * DEG, forearmR: -55 * DEG,
    armL: -70 * DEG, forearmL: -40 * DEG,
    weapon: -6 * DEG, thighR: 10 * DEG, shinR: 6 * DEG, thighL: -8 * DEG, shinL: 8 * DEG,
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
  if (t < 0.22) return lerpPose(wind, swing, easeIn((t - 0.12) / 0.10));
  return lerpPose(swing, idle, easeInOut(Math.min(1, (t - 0.22) / 0.20)));
}

function hitPose(kind, t) {
  // Impact snap back, knees give, then a damped wobble back to ready (reads as weight, not a slide).
  const idle = idlePose(kind, 0, 2);
  const k = Math.min(1, t / 0.36);
  const punch = Math.exp(-t * 7) * (1 - k);
  const wob = Math.sin(t * 34) * Math.exp(-t * 9) * (1 - k);
  return {
    ...idle,
    hipX: -6 * punch, hipY: idle.hipY + 3.2 * punch, hipRot: 10 * DEG * punch,
    torso: 14 * DEG * punch + 3 * DEG * wob, head: 12 * DEG * punch - 6 * DEG * wob,
    armR: idle.armR + 20 * DEG * punch, armL: idle.armL - 15 * DEG * punch,
    forearmR: idle.forearmR + 10 * DEG * punch,
    weapon: idle.weapon + 14 * DEG * punch,
    thighR: idle.thighR + 14 * DEG * punch, shinR: idle.shinR + 18 * DEG * punch,
    thighL: idle.thighL + 10 * DEG * punch, shinL: idle.shinL + 14 * DEG * punch,
    coil: idle.coil + 14 * DEG * punch, mid: idle.mid - 10 * DEG * wob, tip: idle.tip + 16 * DEG * wob,
  };
}

function koPose(kind, t, legs) {
  const idle = idlePose(kind, 0, 2);
  const ground = legs != null ? legs : (RU.thigh + RU.shin);
  const buckle = {
    ...idle,
    hipY: 24, hipRot: 10 * DEG, hipX: -2,
    thighR: 58 * DEG, shinR: 72 * DEG,
    thighL: 52 * DEG, shinL: 76 * DEG,
    torso: 22 * DEG, head: 12 * DEG,
    armR: 25 * DEG, forearmR: 20 * DEG,
    armL: -30 * DEG, forearmL: 15 * DEG,
    weapon: 20 * DEG,
    coil: 18 * DEG, mid: 25 * DEG, tip: 20 * DEG,
  };
  const fall = {
    hipX: -12, hipY: ground - 4, hipRot: 80 * DEG,
    torso: 12 * DEG, head: 16 * DEG,
    thighR: 28 * DEG, shinR: 18 * DEG,
    thighL: 55 * DEG, shinL: 28 * DEG,
    armR: 50 * DEG, forearmR: 30 * DEG,
    armL: -20 * DEG, forearmL: 25 * DEG,
    weapon: 36 * DEG,
    coil: 36 * DEG, mid: 30 * DEG, tip: 24 * DEG,
    bag: 12 * DEG, muzzle: 0,
  };
  const k = Math.min(1, t / 0.75);
  if (k < 0.28) return lerpPose(idle, buckle, easeIn(k / 0.28));
  if (k < 0.72) return lerpPose(buckle, fall, easeInOut((k - 0.28) / 0.44));
  const settle = { ...fall, hipY: ground - 2, head: 12 * DEG };
  return lerpPose(fall, settle, easeOut((k - 0.72) / 0.28));
}

function revivePose(kind, t, legs) {
  const down = koPose(kind, 1, legs);
  const ground = legs != null ? legs : (RU.thigh + RU.shin);
  const push = {
    ...down,
    hipY: ground - 16, hipRot: 48 * DEG, hipX: -8,
    torso: 8 * DEG, head: -6 * DEG,
    armR: -40 * DEG, forearmR: -10 * DEG,
    thighR: 60 * DEG, shinR: 80 * DEG,
    thighL: 55 * DEG, shinL: 75 * DEG,
    coil: 10 * DEG, mid: 12 * DEG,
  };
  const crouch = {
    hipX: -2, hipY: 16, hipRot: 8 * DEG,
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

function abilityPose(kind, t, anim, hero) {
  if (kind === 'snake') {
    const idle = idlePose(kind, 0, 2);
    const bow = { ...idle, torso: 16 * DEG, head: 10 * DEG, hipY: 3, armR: 20 * DEG, armL: 20 * DEG };
    const rise = { ...idle, torso: -6 * DEG, head: -4 * DEG, hipY: -2, armR: -80 * DEG, armL: -80 * DEG, forearmR: -20 * DEG, forearmL: -20 * DEG };
    if (t < 0.22) return lerpPose(idle, bow, easeOut(t / 0.22));
    if (t < 0.5) return lerpPose(bow, rise, easeInOut((t - 0.22) / 0.28));
    return lerpPose(rise, idle, easeInOut((t - 0.5) / 0.2));
  }
  const idle = idlePose(kind, 0, 2);
  if (hero === 'brick') {
    // Tank brace (Fortify / Hunker): drop the hips, plant wide, gun across the chest, hold, rise.
    const brace = {
      ...idle,
      hipY: 9, hipX: 1, hipRot: 4 * DEG, torso: 14 * DEG, head: 6 * DEG,
      thighR: 34 * DEG, shinR: 40 * DEG, thighL: -30 * DEG, shinL: 44 * DEG,
      armR: -30 * DEG, forearmR: -78 * DEG, armL: -10 * DEG, forearmL: -96 * DEG,
      weapon: -48 * DEG,
    };
    if (t < 0.16) return lerpPose(idle, brace, easeOut(t / 0.16));
    if (t < 0.5) {
      const thud = Math.exp(-(t - 0.16) * 18) * 2.2;
      return { ...brace, hipY: brace.hipY + thud };
    }
    return lerpPose(brace, idle, easeInOut(Math.min(1, (t - 0.5) / 0.2)));
  }
  if (hero === 'lumen') {
    // Aimed Shot: settle, long steady breath on the scope, one clean shot, slow follow-through.
    const steady = shootPose(kind, 0.159, null);
    const still = { ...steady, torso: steady.torso - 2 * DEG, head: steady.head - 3 * DEG, hipY: (steady.hipY || 0) + 0.6 };
    if (t < 0.12) return lerpPose(idle, still, easeOut(t / 0.12));
    if (t < 0.36) return still;
    return shootPose(kind, 0.16 + (t - 0.36) * 1.1, anim);
  }
  if (hero === 'rook') {
    // Overwatch: shoulder the carbine and sweep the lane left-right before locking on.
    const aim = shootPose(kind, 0.159, null);
    const k = Math.min(1, t / 0.7);
    if (t < 0.14) return lerpPose(idle, aim, easeOut(t / 0.14));
    const sweep = Math.sin((k - 0.2) * Math.PI * 2.2) * (1 - k);
    return { ...aim, torso: aim.torso + 6 * DEG * sweep, head: aim.head + 8 * DEG * sweep, weapon: aim.weapon + 4 * DEG * sweep, hipX: (aim.hipX || 0) + 1.5 * sweep };
  }
  return shootPose(kind, t * 0.7, anim);
}

function meleeHold(pose, rig) {
  if (!rig || rig.weapon !== 'melee' || !pose) return pose;
  // Boarding gaff held forward-up from the near hand, shaft along the forearm.
  return {
    ...pose,
    armR: -74 * DEG,
    forearmR: -16 * DEG,
    weapon: 8 * DEG,
    armL: -28 * DEG,
    forearmL: -14 * DEG,
  };
}

export function poseOf(unit, def, anim, now) {

  const rig = RIGS[unit.hero];
  if (!rig) return idlePose('biped', 0, 2);
  const t = anim.t || 0;
  const kind = rig.kind;
  if (anim.clip === 'walk') {
    const pose = walkPose(kind, t, def.walk);
    return meleeHold(pose, rig);
  }
  if (anim.clip === 'shoot') return shootPose(kind, t, anim);
  if (anim.clip === 'melee') return meleePose(kind, t);
  if (anim.clip === 'hit') return hitPose(kind, t);
  const legs = legSpan(fitOf(unit.hero));
  if (anim.clip === 'ko') return koPose(kind, t, legs);
  if (anim.clip === 'revive') return revivePose(kind, t, legs);
  if (anim.clip === 'ability') return abilityPose(kind, t, anim, unit.hero);
  const idle = idlePose(kind, (now || 0) / 1000 + (anim.t0 || 0) / 10000, def.breath);
  return meleeHold(idle, rig);
}

function alignOf(m) {
  if (!m) return 0;
  if (m.part === 'head' || m.part === 'torso' || m.part === 'coil' || m.part === 'bag') return 0;
  return Math.PI / 2 - m.axis;
}

function drawPart(g, id, part, ang, s, weap, kind, opt) {
  const m = ensureMeta(id, part);
  if (!m) return null;
  const sc = partScale(m, part, kind, weap) * s;
  const fit = fitOf(id);
  g.save();
  g.rotate(ang + alignOf(m));
  if (opt && opt.sx && opt.sx !== 1) g.scale(opt.sx, 1);
  if (fit.rim) {
    g.save();
    g.shadowColor = TEAM_RIM[curSide] || fit.rim;
    g.shadowOffsetX = -1.8 * Math.max(0.7, s);
    g.shadowOffsetY = -1.4 * Math.max(0.7, s);
    g.shadowBlur = 2.4 * Math.max(0.7, s);
    g.drawImage(m.img, -m.pvtX * sc, -m.pvtY * sc, m.pw * sc, m.ph * sc);
    g.restore();
  }
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

function jointCap(g, color, r) {
  g.save();
  g.fillStyle = color;
  g.beginPath();
  g.ellipse(0, 0, r, r * 0.85, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

export function drawRig(g, unit, def, anim, footX, footY, z, now) {
  const rig = RIGS[unit.hero];
  if (!rig || !rigReady(unit.hero)) return null;
  const pose = poseOf(unit, def, anim, now);
  const fit = fitOf(unit.hero);
  curSide = unit.side === 'player' ? 'player' : 'enemy';
  const flip = (anim.facing || 1) * (rig.imageFacing || def.imageFacing || 1);
  const s = (def.height * z) / 100;
  const weap = rig.weapon;
  const kind = rig.kind;
  const capR = 4.8 * s;

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

  // Darker contact shadow, widening if the body is down.
  const legs = legSpan(fit);
  const down = Math.max(0, (pose.hipY || 0) / legs);
  g.save();
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.beginPath();
  g.ellipse((pose.hipX || 0) * 0.35, 2 * z, (14 + down * 10) * z, (5.5 + down * 2) * z, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();

  const hipY = kind === 'snake' ? (pose.hipY || 0) : -legs + pose.hipY;
  g.translate(pose.hipX, hipY);
  g.rotate(pose.hipRot || 0);

  const tuck = 1 - JOINT_TUCK;
  const drawLimb = (upper, lower, uAng, lAng, attach, col, sx) => {
    g.save();
    g.translate(attach.x, attach.y);
    jointCap(g, col, capR);
    g.rotate(uAng);
    drawPart(g, unit.hero, upper, 0, s, weap, kind, { sx });
    g.translate(0, boneLen(upper, kind, weap, fit) * s * tuck);
    jointCap(g, col, capR * 0.85);
    g.rotate(lAng);
    drawPart(g, unit.hero, lower, 0, s, weap, kind, { sx });
    g.restore();
  };

  const stance = fit.stance || 7;
  const hipTuck = fit.hipTuck || 0;
  const tSx = fit.thighSx || 1;

  // Both legs first so the jacket / coat skirt covers the pelvis.
  if (kind === 'biped') {
    drawLimb('thighL', 'shinL', pose.thighL, pose.shinL, { x: -stance * s, y: hipTuck * s }, fit.jointLeg, tSx);
    drawLimb('thighR', 'shinR', pose.thighR, pose.shinR, { x: stance * s, y: hipTuck * s }, fit.jointLeg, tSx);
  } else {
    g.save();
    drawPart(g, unit.hero, 'coil', pose.coil, s, weap, kind);
    g.restore();
  }

  // Torso, head, arms, weapon — shoulders follow the torso.
  g.save();
  if (kind === 'snake') {
    g.rotate(pose.coil || 0);
    g.translate(0, -RU.coil * s * (fit.coilLift || 0.82));
  }
  g.rotate(pose.torso);
  const tm = ensureMeta(unit.hero, 'torso');
  const shL = tm ? childOffset(tm, fit.shL[0], fit.shL[1], 'torso', kind, weap, s)
    : { x: -9 * s, y: -RU.torso * s * 0.72 };
  const shR = tm ? childOffset(tm, fit.shR[0], fit.shR[1], 'torso', kind, weap, s)
    : { x: 9 * s, y: -RU.torso * s * 0.72 };

  // Far arm under the jacket, with the shoulder cap seated in the armhole.
  drawLimb('armL', 'forearmL', pose.armL, pose.forearmL, shL, fit.jointArm, 1);

  drawPart(g, unit.hero, 'torso', 0, s, weap, kind);
  if (tm) {
    const neck = childOffset(tm, fit.neck[0], fit.neck[1], 'torso', kind, weap, s);
    g.save();
    g.translate(neck.x, neck.y);
    jointCap(g, fit.jointNeck, capR * 1.05);
    g.rotate(pose.head);
    drawPart(g, unit.hero, 'head', 0, s, weap, kind);
    {
      const hp = toWorldZ(0, -RU.head * s * (fit.headMul || 1) * 0.35);
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

  // Near arm + weapon, stock held in toward the ribs.
  g.save();
  g.translate(shR.x, shR.y);
  jointCap(g, fit.jointArm, capR);
  g.rotate(pose.armR);
  drawPart(g, unit.hero, 'armR', 0, s, weap, kind);
  g.translate(0, RU.arm * s * tuck);
  jointCap(g, fit.jointArm, capR * 0.85);
  g.rotate(pose.forearmR);
  drawPart(g, unit.hero, 'forearmR', 0, s, weap, kind);
  g.translate(0, RU.forearm * s * 0.80);
  g.rotate(pose.weapon || 0);
  drawPart(g, unit.hero, 'weapon', 0, s, weap, kind);
  {
    const wm = ensureMeta(unit.hero, 'weapon');
    if (wm) {
      const tip = weaponTip(weap, fit);
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

  g.restore(); // flip / feet

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
