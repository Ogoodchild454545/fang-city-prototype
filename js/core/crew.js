// Crew rules. The player's army is a pool of troop types (counts per type, one level per type),
// trained in a timed queue at the Training Yard, upgraded in the Armoury, plus collectable bosses.
// Enemy crews are still generated as individual members (makeMember) for variety.
import { SPECIES, ROLES, RARITY, GEAR, NAMES, TROOPS, TROOP_ORDER, TROOP_MAX_LV, DEPLOY_CAP, BOSSES, BOSS_ORDER, BOSS_REST_MIN } from './data.js';
import { rngNext, rngPick } from './rng.js';
import { housing, trainingYards, armouryLevel, denLevel } from './base.js';

export function newId(state, prefix = 'm') {
  state.nextId = (state.nextId || 1) + 1;
  return `${prefix}${state.nextId}`;
}

// ---------------------------------------------------------------- generic fighters (enemies)
function startWeapon(role, rarity) {
  if (role === 'enforcer') return rarity === 'common' ? 'knife' : 'bat';
  if (role === 'shooter') return 'pistol9';
  if (role === 'marksman') return 'rifle';
  return 'pocket';
}
export function makeMember(state, { species, role, rarity = 'common', level = 1, name } = {}) {
  const sp = species || rngPick(state, Object.keys(SPECIES));
  const rl = role || rngPick(state, Object.keys(ROLES));
  const jitter = () => Math.round((rngNext(state) - 0.5) * 10);
  const b = SPECIES[sp].base;
  const bias = ROLES[rl].statBias;
  const m = {
    id: newId(state), name: name || rngPick(state, NAMES.first), species: sp, role: rl, rarity, level,
    base: { muscle: b.muscle + bias.muscle + jitter(), aim: b.aim + bias.aim + jitter(), nerve: b.nerve + bias.nerve + jitter() },
    gear: { weapon: startWeapon(rl, rarity), armour: 'hoodie', gadget: null },
  };
  if (rl === 'doc') m.gear.gadget = 'medkit';
  return m;
}

export function memberStats(m) {
  const r = RARITY[m.rarity].mult;
  const lv = 1 + 0.03 * (m.level - 1);
  const stat = (k) => Math.round(m.base[k] * r * lv);
  const muscle = stat('muscle'), aim = stat('aim'), nerve = stat('nerve');
  const sp = SPECIES[m.species];
  let hp = Math.round(22 + muscle * 0.22 + m.level * 1.2);
  if (sp.trait === 'bulk') hp = Math.round(hp * 1.3);
  if (m.hpMult) hp = Math.round(hp * m.hpMult);
  const weapon = GEAR[m.gear.weapon];
  const armour = m.gear.armour ? GEAR[m.gear.armour] : null;
  const def = (armour ? armour.def : 0) + (sp.trait === 'hide' ? 1 : 0);
  return {
    muscle, aim, nerve, hp, def,
    move: ROLES[m.role].move,
    ap: 4 + (sp.trait === 'scurry' ? 1 : 0),
    weapon, armour,
    gadget: m.gear.gadget ? GEAR[m.gear.gadget] : null,
    crit: Math.round(nerve / 10 + (sp.trait === 'cold' ? 10 : 0)),
  };
}
export function memberPower(m) {
  const s = m.stats || memberStats(m);
  return Math.round(s.hp * 0.8 + s.muscle + s.aim + s.nerve + s.weapon.dmg * 5 + s.def * 8);
}

// ---------------------------------------------------------------- troops
export const troopLevel = (state, t) => (state.troopLv && state.troopLv[t]) || 1;
export const yardLevel = (state) => trainingYards(state).reduce((m, b) => Math.max(m, b.lv), 0);
export const troopUnlocked = (state, t) => yardLevel(state) >= TROOPS[t].yard;
export const unlockedTroops = (state) => TROOP_ORDER.filter((t) => troopUnlocked(state, t));

// A troop of type t at level lv, as a fighter the battle engine understands.
export function troopFighter(t, lv, i = 0) {
  const d = TROOPS[t];
  const tier = lv >= 7 ? 2 : lv >= 4 ? 1 : 0;
  const m = {
    id: `${t}${i}`, name: `${d.name.split(' ')[0]} ${i + 1}`, species: d.species, role: d.role, rarity: 'common',
    level: 1 + (lv - 1) * 2, base: d.base, hpMult: d.hp * (1 + 0.06 * (lv - 1)),
    gear: { weapon: d.weapons[tier], armour: d.armour[tier], gadget: d.gadget },
  };
  m.stats = memberStats(m);
  m.troop = t; m.troopLv = lv;
  return m;
}
export const troopStats = (t, lv) => troopFighter(t, lv).stats;
export const troopPower = (t, lv) => memberPower(troopFighter(t, lv));

export const armyCap = (state) => housing(state);
export const spaceOf = (counts) => Object.entries(counts || {}).reduce((s, [t, n]) => s + (TROOPS[t] ? TROOPS[t].space * n : 0), 0);
export const armyUsed = (state) => spaceOf(state.army);
export const queuedSpace = (state) => state.queue.reduce((s, q) => s + TROOPS[q.t].space, 0);
export const armyCount = (state) => Object.values(state.army).reduce((a, b) => a + b, 0);

export function trainCost(state, t) {
  return Math.round(TROOPS[t].cost * (1 + 0.15 * (troopLevel(state, t) - 1)));
}
export function trainSeconds(state, t, now = 0) {
  const yard = Math.max(1, yardLevel(state));
  let sec = TROOPS[t].time * (1 - 0.05 * (yard - 1));
  if (state.extraBench) sec *= 0.75;
  if (state.vipUntil > now) sec *= 0.75;
  return Math.max(2, Math.round(sec));
}

export function enqueue(state, t, now) {
  if (!TROOPS[t]) return { ok: false };
  if (!trainingYards(state).length) return { ok: false, reason: 'yard' };
  if (!troopUnlocked(state, t)) return { ok: false, reason: 'locked', need: TROOPS[t].yard };
  if (armyUsed(state) + queuedSpace(state) + TROOPS[t].space > armyCap(state)) return { ok: false, reason: 'housing' };
  if (state.queue.length >= 40) return { ok: false, reason: 'queue' };
  const cost = trainCost(state, t);
  if (state.cash < cost) return { ok: false, reason: 'cash' };
  state.cash -= cost;
  if (!state.queue.length) state.queueAt = now;
  state.queue.push({ t, dur: trainSeconds(state, t, now), paid: cost });
  return { ok: true };
}

export function unqueue(state, i, now) {
  const q = state.queue[i];
  if (!q) return { ok: false };
  state.queue.splice(i, 1);
  state.cash += q.paid || 0;
  if (i === 0) state.queueAt = now; // the next one starts fresh
  if (!state.queue.length) state.queueAt = 0;
  return { ok: true };
}

export function finishQueue(state, now) {
  const done = [];
  while (state.queue.length && state.queueAt + state.queue[0].dur * 1000 <= now) {
    const q = state.queue.shift();
    state.queueAt += q.dur * 1000;
    state.army[q.t] = (state.army[q.t] || 0) + 1;
    state.stats.trains++;
    done.push(q.t);
  }
  if (!state.queue.length) state.queueAt = 0;
  return done;
}
export function queueRemaining(state, now) {
  if (!state.queue.length) return 0;
  const total = state.queue.reduce((s, q) => s + q.dur, 0) * 1000;
  return Math.max(0, (state.queueAt + total - now) / 1000);
}
export const headRemaining = (state, now) => (state.queue.length ? Math.max(0, (state.queueAt + state.queue[0].dur * 1000 - now) / 1000) : 0);

export function skipCostSec(sec) {
  if (sec <= 15) return 0;
  return Math.max(1, Math.ceil(Math.sqrt(sec) * 0.9));
}
export function skipQueue(state, now) {
  if (!state.queue.length) return { ok: false };
  const cost = skipCostSec(queueRemaining(state, now));
  let ticket = false;
  if (cost > 0 && state.tickets > 0) { state.tickets--; ticket = true; }
  else if (state.teeth < cost) return { ok: false, reason: 'teeth', cost };
  else state.teeth -= cost;
  state.queueAt = now - state.queue.reduce((s, q) => s + q.dur, 0) * 1000;
  return { ok: true, cost: ticket ? 0 : cost, ticket, done: finishQueue(state, now) };
}

// ---------------------------------------------------------------- troop upgrades (Armoury research)
export const maxTroopLv = (state) => Math.min(TROOP_MAX_LV, armouryLevel(state) + 1);
export const researchCost = (t, lv) => Math.round(30 * Math.pow(2.1, lv - 1) * (1 + TROOPS[t].space / 6));
export const researchSeconds = (t, lv) => Math.round(20 * Math.pow(2.2, lv - 1));
export function startResearch(state, t, now) {
  if (!TROOPS[t]) return { ok: false };
  if (state.research) return { ok: false, reason: 'busy' };
  if (!armouryLevel(state)) return { ok: false, reason: 'armoury' };
  if (!troopUnlocked(state, t)) return { ok: false, reason: 'locked' };
  const lv = troopLevel(state, t);
  if (lv >= maxTroopLv(state)) return { ok: false, reason: 'max' };
  const cost = researchCost(t, lv);
  if (state.influence < cost) return { ok: false, reason: 'influence', cost };
  state.influence -= cost;
  state.research = { t, endsAt: now + researchSeconds(t, lv) * 1000 };
  return { ok: true };
}
export function finishResearch(state, now) {
  const r = state.research;
  if (!r || r.endsAt > now) return null;
  state.troopLv[r.t] = troopLevel(state, r.t) + 1;
  state.research = null;
  return { t: r.t, lv: state.troopLv[r.t] };
}
export function skipResearch(state, now) {
  const r = state.research;
  if (!r) return { ok: false };
  const cost = skipCostSec((r.endsAt - now) / 1000);
  if (state.teeth < cost) return { ok: false, reason: 'teeth' };
  state.teeth -= cost; r.endsAt = now;
  return { ok: true, cost, done: finishResearch(state, now) };
}

// ---------------------------------------------------------------- bosses
export const bossUnlocked = (state, id) => denLevel(state) >= BOSSES[id].den;
export const bossMaxLv = (state) => Math.max(1, denLevel(state) * 2);
export const bossUpgradeCost = (id, lv) => Math.round(80 * Math.pow(1.9, lv - 1) * (id === 'scales' ? 2 : 1));
export function hireBoss(state, id, free = false) {
  const d = BOSSES[id];
  if (!d || state.bosses[id]) return { ok: false };
  if (!free) {
    if (!bossUnlocked(state, id)) return { ok: false, reason: 'den', need: d.den };
    if (state.cash < d.cost) return { ok: false, reason: 'cash' };
    state.cash -= d.cost;
  }
  state.bosses[id] = { lv: 1, restUntil: 0 };
  return { ok: true };
}
export function upgradeBoss(state, id) {
  const b = state.bosses[id];
  if (!b) return { ok: false };
  if (b.lv >= bossMaxLv(state)) return { ok: false, reason: 'max' };
  const cost = bossUpgradeCost(id, b.lv);
  if (state.influence < cost) return { ok: false, reason: 'influence', cost };
  state.influence -= cost;
  b.lv++;
  return { ok: true, lv: b.lv };
}
export const bossReady = (state, id, now) => !!state.bosses[id] && state.bosses[id].restUntil <= now;
export function bossFighter(id, lv) {
  const d = BOSSES[id];
  const m = {
    id: `boss_${id}`, name: d.name, species: d.species, role: d.role, rarity: 'legendary', level: 2 + lv * 2,
    base: d.base, hpMult: d.hp, gear: { weapon: d.weapon, armour: d.armour, gadget: null },
  };
  m.stats = memberStats(m);
  m.boss = true; m.bossId = id; m.skill = d.skill; m.img = d.img;
  return m;
}
export function reviveBoss(state, id, now) {
  const b = state.bosses[id];
  if (!b || b.restUntil <= now) return { ok: false };
  const cost = skipCostSec((b.restUntil - now) / 1000);
  if (state.teeth < cost) return { ok: false, reason: 'teeth' };
  state.teeth -= cost; b.restUntil = 0;
  return { ok: true, cost };
}

// ---------------------------------------------------------------- battle line-up
// Up to DEPLOY_CAP troops, picked round-robin from the biggest types down so the line-up is mixed,
// plus every boss who is rested. Troops knocked out in battle are lost; survivors come home.
export function lineup(state, now) {
  const left = { ...state.army };
  const types = TROOP_ORDER.filter((t) => left[t] > 0).sort((a, b) => TROOPS[b].space - TROOPS[a].space);
  const out = [];
  const idx = {};
  while (out.length < DEPLOY_CAP && types.some((t) => left[t] > 0)) {
    for (const t of types) {
      if (out.length >= DEPLOY_CAP) break;
      if (left[t] > 0) { left[t]--; idx[t] = (idx[t] || 0) + 1; out.push(troopFighter(t, troopLevel(state, t), idx[t] - 1)); }
    }
  }
  const bosses = BOSS_ORDER.filter((id) => bossReady(state, id, now)).map((id) => bossFighter(id, state.bosses[id].lv));
  return [...bosses, ...out];
}
export const lineupPower = (state, now) => lineup(state, now).reduce((s, m) => s + memberPower(m), 0);
export const armyLevelAvg = (state, now) => {
  const l = lineup(state, now).filter((m) => m.troop);
  return l.length ? l.reduce((s, m) => s + m.level, 0) / l.length : 1;
};

// After a battle: remove fallen troops from the army, send knocked-out bosses to rest.
export function applyLosses(state, b, now) {
  const lost = {};
  for (const u of b.units) {
    if (u.side !== 'player') continue;
    if (u.troop && !u.alive) { state.army[u.troop] = Math.max(0, (state.army[u.troop] || 0) - 1); lost[u.troop] = (lost[u.troop] || 0) + 1; }
    if (u.bossId && !u.alive && state.bosses[u.bossId]) state.bosses[u.bossId].restUntil = now + BOSS_REST_MIN * 60000;
  }
  return lost;
}

// Converts an old individual crew member into a troop type (save migration).
export const SPECIES_TO_TROOP = { rat: 'rat', fox: 'fox', wolf: 'wolf', snake: 'snake', badger: 'badger', croc: 'croc', bear: 'bear' };
