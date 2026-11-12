// Pre-battle loadout: carry ammo and medkits from base stock, and assign Workshop gear.
import { defOf, HEROES } from './heroes.js';
import { perkMods } from './progress.js';
import { caps, gain } from './base.js';

export const KIT = {
  vest:     { id: 'vest',     name: 'Padded Vest',    cost: 8,  hp: 2,              blurb: '+2 HP' },
  grip:     { id: 'grip',     name: 'Taped Grip',     cost: 8,  aim: 6,             blurb: '+6 aim' },
  pouch:    { id: 'pouch',    name: 'Loose Pouch',    cost: 6,  carry: 2,           blurb: '+2 ammo carry' },
  plates:   { id: 'plates',   name: 'Steel Plates',   cost: 12, armor: 1,           blurb: 'Ignore 1 damage' },
  lens:     { id: 'lens',     name: 'Spotting Lens',  cost: 12, aim: 8, range: 1,   blurb: '+8 aim, +1 range' },
  wraps:    { id: 'wraps',    name: 'Hand Wraps',     cost: 6,  mdmg: 1,            blurb: '+1 melee damage' },
  // Class kits tweak a fixed class's style. Anyone can craft them; only that class can wear them.
  brace:    { id: 'brace',    name: 'Brace Plate',    cost: 10, hp: 2,    class: 'tank',     blurb: '+2 HP. Extra lining for a tank.' },
  silencer: { id: 'silencer', name: 'Silencer',       cost: 10, aim: 6,   class: 'sniper',   blurb: '+6 aim. A quieter rifle.' },
  heavy:    { id: 'heavy',    name: 'Heavier Rifle',  cost: 12, range: 1, rdmg: 1, move: -1, class: 'sniper', blurb: '+1 range and damage, −1 Move.' },
  slug:     { id: 'slug',     name: 'Heavy Slug',     cost: 10, rdmg: 1,  class: 'assault',  blurb: 'A heavier round. +1 damage.' },
  stim:     { id: 'stim',     name: 'Stimulant',      cost: 10,           class: 'medic',    blurb: 'Revives at 50% HP instead of 40%.' },
  charges:  { id: 'charges',  name: 'Hot Charges',    cost: 10,           class: 'demo',     blurb: '+1 blast damage when you shoot a barrel or van.' },
  slippers: { id: 'slippers', name: 'Soft Soles',     cost: 8,  move: 1,  class: 'scout',    blurb: '+1 Move.' },
};
export const KIT_ORDER = Object.keys(KIT);

export function kitMods(id) {
  return KIT[id] || { hp: 0, aim: 0, carry: 0, armor: 0, range: 0, mdmg: 0, rdmg: 0, move: 0 };
}

export function kitFits(heroId, kitId) {
  const k = KIT[kitId];
  if (!k) return false;
  if (!k.class) return true;
  const d = defOf(heroId);
  return !!(d && d.classId === k.class);
}

export function baseCarry(heroId) {
  const d = defOf(heroId);
  if (!d) return 6;
  const typ = d.weapon?.typ;
  if (typ === 'melee') return 2;
  if (typ === 'shotgun') return 5;
  if (typ === 'rifle') return 8;
  if (typ === 'smg') return 7;
  return 6;
}

export function carryOf(s, heroId) {
  let c = baseCarry(heroId);
  const rec = s.heroes.owned[heroId] || {};
  c += perkMods(rec.perks).carry;
  if (rec.gear === 'pouch') c += 2;
  return c;
}

export function medCarry(s, heroId) {
  const d = defOf(heroId);
  return d && (d.classId === 'medic' || d.role === 'Medic' || d.role === 'Support') ? 2 : 1;
}

export function inventoryCount(s, kitId) {
  return (s.kit && s.kit[kitId]) || 0;
}

export function craftKit(s, kitId) {
  const k = KIT[kitId];
  if (!k) return { ok: false, reason: 'Unknown gear' };
  if ((s.parts || 0) < k.cost) return { ok: false, reason: `Need ${k.cost} parts` };
  s.parts -= k.cost;
  s.kit = s.kit || {};
  s.kit[kitId] = (s.kit[kitId] || 0) + 1;
  return { ok: true, name: k.name };
}

export function equipGear(s, heroId, kitId) {
  const rec = s.heroes.owned[heroId];
  if (!rec) return { ok: false, reason: 'Not in the crew' };
  if (kitId && !KIT[kitId]) return { ok: false, reason: 'Unknown gear' };
  if (kitId && !kitFits(heroId, kitId)) return { ok: false, reason: 'That gear is for a different class' };
  if (kitId && inventoryCount(s, kitId) < 1 && rec.gear !== kitId) return { ok: false, reason: 'You do not have that gear' };
  // return previous
  if (rec.gear && rec.gear !== kitId) {
    s.kit[rec.gear] = (s.kit[rec.gear] || 0) + 1;
  }
  if (kitId && rec.gear !== kitId) {
    s.kit[kitId] -= 1;
    rec.gear = kitId;
  } else if (!kitId) {
    rec.gear = null;
  }
  return { ok: true };
}

export function defaultLoadout(s, ids) {
  const squad = (ids || s.heroes.squad || []).filter((id) => s.heroes.owned[id]).slice(0, 4);
  const ammo = {}, medkits = {};
  let stockA = Math.floor(s.ammo || 0);
  let stockM = Math.floor(s.medkits || 0);
  for (const id of squad) {
    const cap = carryOf(s, id);
    const take = Math.min(cap, stockA);
    ammo[id] = take;
    stockA -= take;
    const mc = medCarry(s, id);
    const tm = Math.min(mc, stockM);
    medkits[id] = tm;
    stockM -= tm;
  }
  return { squad, ammo, medkits, highStakes: false };
}

// Take ammo and medkits out of base stock. Gear stays assigned on the hero record.
export function commitLoadout(s, load) {
  const squad = (load.squad || []).filter((id) => s.heroes.owned[id]).slice(0, 4);
  if (!squad.length) return { ok: false, reason: 'Pick at least one operator' };
  let ammoNeed = 0, medNeed = 0;
  const ammo = {}, medkits = {};
  for (const id of squad) {
    const a = Math.max(0, Math.min(carryOf(s, id), load.ammo?.[id] | 0));
    const m = Math.max(0, Math.min(medCarry(s, id), load.medkits?.[id] | 0));
    ammo[id] = a; medkits[id] = m;
    ammoNeed += a; medNeed += m;
  }
  if ((s.ammo || 0) < ammoNeed) return { ok: false, reason: 'Not enough ammo in the Armoury' };
  if ((s.medkits || 0) < medNeed) return { ok: false, reason: 'Not enough medkits in the Clinic' };
  s.ammo -= ammoNeed;
  s.medkits -= medNeed;
  s.heroes.squad = squad;
  return { ok: true, squad, ammo, medkits, highStakes: !!load.highStakes, spent: { ammo: ammoNeed, medkits: medNeed } };
}

// After the fight, unused carried ammo and medkits return to base (up to the cap).
export function returnUnused(s, units) {
  const back = { ammo: 0, medkits: 0 };
  for (const u of units || []) {
    if (u.side !== 'player') continue;
    if ((u.ammo || 0) > 0) back.ammo += gain(s, 'ammo', u.ammo);
    if ((u.medkits || 0) > 0) back.medkits += gain(s, 'medkits', u.medkits);
  }
  return back;
}
