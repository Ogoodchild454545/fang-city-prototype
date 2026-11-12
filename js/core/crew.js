// Crew rules: recruiting, stats, gear, training (timers + speed-ups).
import { SPECIES, ROLES, RARITY, GEAR, RECRUIT, NAMES, GANGS, ROSTER_BASE, SQUAD_SIZE } from './data.js';
import { rngNext, rngPick, rngWeighted } from './rng.js';

function startWeapon(role, rarity) {
  if (role === 'enforcer') return rarity === 'common' ? 'knife' : 'bat';
  if (role === 'shooter') return 'pistol9';
  if (role === 'marksman') return 'rifle';
  return 'pocket';
}
export function newId(state, prefix = 'm') {
  state.nextId = (state.nextId || 1) + 1;
  return `${prefix}${state.nextId}`;
}

export function makeMember(state, { species, role, rarity = 'common', level = 1, name } = {}) {
  const sp = species || rngPick(state, Object.keys(SPECIES));
  const rl = role || rngPick(state, Object.keys(ROLES));
  const jitter = () => Math.round((rngNext(state) - 0.5) * 10);
  const b = SPECIES[sp].base;
  const bias = ROLES[rl].statBias;
  const m = {
    id: newId(state),
    name: name || rngPick(state, NAMES.first),
    species: sp, role: rl, rarity, level,
    base: { muscle: b.muscle + bias.muscle + jitter(), aim: b.aim + bias.aim + jitter(), nerve: b.nerve + bias.nerve + jitter() },
    gear: { weapon: startWeapon(rl, rarity), armour: 'hoodie', gadget: null },
    wins: 0,
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
  const s = memberStats(m);
  return Math.round(s.hp * 0.8 + s.muscle + s.aim + s.nerve + s.weapon.dmg * 5 + s.def * 8);
}

export const squadMembers = (state) => state.squad.map((id) => state.crew.find((m) => m.id === id)).filter(Boolean);
export const squadPower = (state) => squadMembers(state).reduce((s, m) => s + memberPower(m), 0);
export const rosterCap = (state) => ROSTER_BASE + (state.rosterBonus || 0);

export function toggleSquad(state, id) {
  const i = state.squad.indexOf(id);
  if (i >= 0) { if (state.squad.length > 1) state.squad.splice(i, 1); return { ok: true }; }
  if (state.squad.length >= SQUAD_SIZE) return { ok: false, reason: 'full' };
  if (isTraining(state, id)) return { ok: false, reason: 'training' };
  state.squad.push(id);
  return { ok: true };
}

// --- recruiting -----------------------------------------------------------
export const streetRecruitCost = (state) => Math.round(300 * Math.pow(1.55, state.streetRecruits));

export function recruit(state, type) {
  if (state.crew.length >= rosterCap(state)) return { ok: false, reason: 'roster' };
  const def = RECRUIT[type];
  let rarity;
  if (type === 'street') {
    const cost = streetRecruitCost(state);
    if (state.cash < cost) return { ok: false, reason: 'cash' };
    state.cash -= cost;
    state.streetRecruits++;
    rarity = rngWeighted(state, def.odds);
  } else {
    if (state.tickets > 0) state.tickets--;
    else if (state.teeth >= def.cost) state.teeth -= def.cost;
    else return { ok: false, reason: 'teeth' };
    state.pity++;
    rarity = state.pity >= def.pity ? 'legendary' : rngWeighted(state, def.odds);
    if (rarity === 'legendary') state.pity = 0;
  }
  // bias species towards your own gang (70%), else any
  const own = GANGS[state.gang].species;
  const species = rngNext(state) < 0.7 ? rngPick(state, own) : rngPick(state, Object.keys(SPECIES));
  const m = makeMember(state, { species, rarity });
  state.crew.push(m);
  if (state.squad.length < SQUAD_SIZE) state.squad.push(m.id);
  return { ok: true, member: m };
}

export function dismiss(state, id) {
  if (state.crew.length <= 1) return { ok: false };
  const m = state.crew.find((x) => x.id === id);
  if (!m) return { ok: false };
  for (const slot of ['weapon', 'armour', 'gadget']) unequipToInventory(state, m, slot);
  state.crew = state.crew.filter((x) => x.id !== id);
  state.squad = state.squad.filter((x) => x !== id);
  state.training = state.training.filter((t) => t.memberId !== id);
  if (!state.squad.length && state.crew.length) state.squad.push(state.crew[0].id);
  const refund = 5 + m.level * 3;
  state.influence += refund;
  return { ok: true, refund };
}

// --- gear ---------------------------------------------------------------
const isFree = (gid) => GEAR[gid] && GEAR[gid].price === 0;

export function buyGear(state, gid) {
  const g = GEAR[gid];
  if (!g || g.price <= 0) return { ok: false };
  if (state.cash < g.price) return { ok: false, reason: 'cash' };
  state.cash -= g.price;
  state.inventory[gid] = (state.inventory[gid] || 0) + 1;
  return { ok: true };
}

function unequipToInventory(state, m, slot) {
  const cur = m.gear[slot];
  if (cur && !isFree(cur)) state.inventory[cur] = (state.inventory[cur] || 0) + 1;
}

export function canEquip(m, gid) {
  const g = GEAR[gid];
  if (!g) return false;
  if (g.slot !== 'weapon') return true;
  // enforcers use melee, everyone else ranged
  return m.role === 'enforcer' ? g.kind === 'melee' : g.kind === 'ranged';
}

export function equip(state, memberId, gid) {
  const m = state.crew.find((x) => x.id === memberId);
  const g = GEAR[gid];
  if (!m || !g || !canEquip(m, gid)) return { ok: false };
  if (!isFree(gid) && !(state.inventory[gid] > 0)) return { ok: false, reason: 'none' };
  unequipToInventory(state, m, g.slot);
  if (!isFree(gid)) state.inventory[gid]--;
  m.gear[g.slot] = gid;
  return { ok: true };
}

// --- training (timed level-ups; the classic "builder" bottleneck) ---------
export const levelUpCost = (m) => ({ cash: Math.round(150 * Math.pow(1.34, m.level - 1)), influence: 5 + 4 * (m.level - 1) });
export const trainingSeconds = (m) => Math.round(6 * m.level * m.level);
export const isTraining = (state, id) => state.training.some((t) => t.memberId === id);
export const benches = (state, now) => 1 + (state.extraBench || 0) + (state.vipUntil > now ? 1 : 0);

export function startTraining(state, id, now) {
  const m = state.crew.find((x) => x.id === id);
  if (!m) return { ok: false };
  if (m.level >= RARITY[m.rarity].maxLevel) return { ok: false, reason: 'max' };
  if (isTraining(state, id)) return { ok: false, reason: 'busy' };
  if (state.training.length >= benches(state, now)) return { ok: false, reason: 'bench' };
  const c = levelUpCost(m);
  if (state.cash < c.cash) return { ok: false, reason: 'cash' };
  if (state.influence < c.influence) return { ok: false, reason: 'influence' };
  state.cash -= c.cash;
  state.influence -= c.influence;
  state.training.push({ memberId: id, endsAt: now + trainingSeconds(m) * 1000 });
  state.squad = state.squad.filter((x) => x !== id);
  if (!state.squad.length) { const alt = state.crew.find((x) => x.id !== id && !isTraining(state, x.id)); if (alt) state.squad.push(alt.id); }
  state.stats.trains++;
  return { ok: true };
}

export function skipCost(t, now) {
  const rem = Math.max(0, (t.endsAt - now) / 1000);
  if (rem <= 15) return 0;
  return Math.max(1, Math.ceil(Math.sqrt(rem) * 0.9));
}

export function skipTraining(state, id, now) {
  const t = state.training.find((x) => x.memberId === id);
  if (!t) return { ok: false };
  const cost = skipCost(t, now);
  if (state.teeth < cost) return { ok: false, reason: 'teeth' };
  state.teeth -= cost;
  t.endsAt = now;
  return { ok: true, cost, done: finishTraining(state, now) };
}

export function finishTraining(state, now) {
  const done = [];
  state.training = state.training.filter((t) => {
    if (t.endsAt > now) return true;
    const m = state.crew.find((x) => x.id === t.memberId);
    if (m) { m.level++; done.push(m); }
    return false;
  });
  return done;
}
