// Meta systems: daily rewards, jobs, turf battles, async raids on rival players, rewards, mock shop.
import { DISTRICTS, DAILY_REWARDS, JOB_TEMPLATES, REP_TIERS, GANGS, NAMES, SHOP, GEAR, RARITY, ROLES, MISSIONS, TROOPS } from './data.js';
import { makeMember, memberPower, lineup, lineupPower, armyLevelAvg, applyLosses, hireBoss, armyCap, armyUsed } from './crew.js';
import { totalIncome } from './economy.js';
import { createBattle, raidStars } from './battle.js';
import { gain, denLevel } from './base.js';
import { generateRivalBase, baseToRaidLayout, rivalLoot, RAID_W, RAID_H } from './raid.js';
import { turretOf } from './buildings.js';
import { rngNext, rngPick, rngInt } from './rng.js';

export const dayKey = (now) => new Date(now).toISOString().slice(0, 10);
const prevDay = (now) => dayKey(now - 86400000);

export const repTier = (rep) => [...REP_TIERS].reverse().find((t) => rep >= t.min);
export const nextRepTier = (rep) => REP_TIERS.find((t) => t.min > rep) || null;

export function grant(state, g) {
  const got = { cash: 0, influence: 0 };
  if (g.cash) got.cash = gain(state, 'cash', g.cash);
  if (g.teeth) state.teeth += g.teeth;
  if (g.influence) got.influence = gain(state, 'influence', g.influence);
  if (g.ticket) state.tickets += g.ticket;
  return got;
}

// ---------------------------------------------------------------- daily login
export function dailyStatus(state, now) {
  const today = dayKey(now);
  const claimedToday = state.daily.lastClaim === today;
  const continuing = state.daily.lastClaim === prevDay(now);
  const streak = claimedToday ? state.daily.streak : continuing ? state.daily.streak : 0;
  return { claimedToday, index: claimedToday ? (streak - 1) % 7 : streak % 7, streak };
}
export function claimDaily(state, now) {
  const st = dailyStatus(state, now);
  if (st.claimedToday) return { ok: false };
  const reward = DAILY_REWARDS[st.streak % 7];
  grant(state, reward);
  if (state.vipUntil > now) state.teeth += 50;
  state.daily = { lastClaim: dayKey(now), streak: st.streak + 1 };
  return { ok: true, reward };
}

// ---------------------------------------------------------------- jobs
export function ensureJobs(state, now) {
  const today = dayKey(now);
  if (state.jobs.day === today) return;
  const h = { rng: [...today].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) };
  const pool = [...JOB_TEMPLATES];
  const list = [];
  while (list.length < 3 && pool.length) list.push(pool.splice(Math.floor(rngNext(h) * pool.length), 1)[0]);
  state.jobs = { day: today, list: list.map((j) => ({ id: j.id, start: state.stats[j.stat] || 0, claimed: false })) };
}
export function jobProgress(state, job) {
  const t = JOB_TEMPLATES.find((x) => x.id === job.id);
  return { t, progress: Math.min(t.goal, (state.stats[t.stat] || 0) - job.start), done: (state.stats[t.stat] || 0) - job.start >= t.goal };
}
export function claimJob(state, id) {
  const job = state.jobs.list.find((j) => j.id === id);
  if (!job || job.claimed) return { ok: false };
  const p = jobProgress(state, job);
  if (!p.done) return { ok: false };
  job.claimed = true;
  grant(state, p.t.reward);
  state.passXp += 40;
  return { ok: true, reward: p.t.reward };
}

// ---------------------------------------------------------------- enemies
function rarityForLevel(h, lvl) {
  const r = rngNext(h);
  if (lvl >= 20 && r < 0.25) return 'legendary';
  if (lvl >= 12 && r < 0.4) return 'epic';
  if (lvl >= 5 && r < 0.5) return 'rare';
  return lvl >= 16 ? 'epic' : lvl >= 8 ? 'rare' : 'common';
}

const GEAR_BY_TIER = {
  melee: ['knife', 'bat', 'bat', 'machete', 'machete', 'sledge'],
  ranged: ['pocket', 'pistol9', 'pistol9', 'smg', 'smg', 'smg'],
  marks: ['rifle', 'rifle', 'rifle', 'rifle', 'marksman', 'marksman'],
  armour: ['hoodie', 'hoodie', 'leather', 'leather', 'ironhide', 'kevlar'],
  gadget: [null, null, 'spikes', 'medkit', 'spikes', 'smoke'],
};

export function makeEnemyCrew(seed, gangId, count, level, tier, boss = false) {
  const h = { rng: seed >>> 0, nextId: 1000 };
  const sp = GANGS[gangId].species;
  const roles = ['enforcer', 'shooter', 'shooter', 'marksman', 'doc', 'enforcer'];
  const out = [];
  for (let i = 0; i < count; i++) {
    const lvl = Math.max(1, level + rngInt(h, -1, 1));
    const role = roles[i % roles.length];
    const m = makeMember(h, { species: rngPick(h, sp), role, rarity: rarityForLevel(h, lvl), level: lvl });
    const t = Math.max(0, Math.min(5, tier));
    m.gear.weapon = role === 'enforcer' ? GEAR_BY_TIER.melee[t] : role === 'marksman' ? GEAR_BY_TIER.marks[t] : GEAR_BY_TIER.ranged[t];
    m.gear.armour = GEAR_BY_TIER.armour[t];
    if (role !== 'doc') m.gear.gadget = GEAR_BY_TIER.gadget[t];
    out.push(m);
  }
  if (boss && out.length) {
    const b = out[0];
    b.name = 'Deacon Mire'; b.species = 'croc'; b.rarity = 'legendary'; b.level = level + 2; b.boss = true;
    b.base = { muscle: 88, aim: 50, nerve: 70 };
  }
  return out;
}

// Every player is an independent crew now, so each district is defended by the gang that owns it.
export const districtRival = (state, d) => d.rival;

export function districtEnemy(d, state) {
  // Fixed difficulty curve per district: forces crew upgrades between turf wars.
  return { gang: districtRival(state, d), count: d.tier <= 1 ? 3 : d.tier >= 5 ? 5 : 4, level: 1 + (d.tier - 1) * 4, tier: d.tier, boss: d.tier >= 5 };
}

export function districtReward(state, d, now) {
  return {
    cash: Math.round(300 * Math.pow(3, d.tier) + totalIncome(state, now) * 120),
    influence: 20 + 15 * d.tier, teeth: 15 + 5 * d.tier, rep: 40 + 20 * d.tier, gearChance: 0.6,
  };
}

// ---------------------------------------------------------------- rival players (async PvP, mocked)
export function refreshRivals(state, now, force = false) {
  if (!force && state.rivals.length && state.rivals[0].base && now - state.rivalsAt < 15 * 60 * 1000) return;
  const h = { rng: (state.rng ^ Math.floor(now / 1000)) >>> 0 };
  const myPow = Math.max(300, lineupPower(state, now));
  const avgLvl = Math.max(1, Math.round(armyLevelAvg(state, now)));
  const myDen = denLevel(state);
  const gangs = Object.keys(GANGS);
  state.rivals = [-1, 0, 1].map((delta, i) => {
    const level = Math.max(1, avgLvl + delta * 2 + rngInt(h, -1, 0));
    const gang = rngPick(h, gangs);
    const tier = Math.min(5, Math.floor(level / 5));
    const seed = (h.rng = (h.rng * 1664525 + 1013904223) >>> 0);
    const denLv = Math.max(1, Math.min(6, myDen + (delta > 0 ? 1 : delta < 0 ? -1 : 0)));
    const count = Math.min(4, 2 + Math.floor((denLv + (delta >= 0 ? 1 : 0)) / 2));
    const base = generateRivalBase(seed ^ 0xb5297a4d, denLv);
    const loot = rivalLoot(h, denLv);
    const preview = makeEnemyCrew(seed, gang, count, level, tier);
    const turrets = base.filter((b) => turretOf(b.t, b.lv)).map((b) => turretOf(b.t, b.lv));
    const power = preview.reduce((s, m) => s + memberPower(m), 0) + turrets.reduce((s, t) => s + t.hp * 0.8 + t.dmg * 5 + 40, 0);
    return {
      id: `r${now}${i}`, name: `${rngPick(h, NAMES.rivalTags)}_${rngInt(h, 10, 99)}`, gang, level, count, tier, seed, power, denLv, base, loot,
      rep: Math.max(0, state.rep + delta * 60 + rngInt(h, -20, 20)),
      odds: power < myPow * 1.05 ? 'Easy' : power > myPow * 1.45 ? 'Risky' : 'Even',
    };
  });
  state.rivalsAt = now;
}

export function rivalLayout(r) {
  return baseToRaidLayout(r.base, 0, 0, RAID_W, RAID_H, r.loot);
}

// ---------------------------------------------------------------- battle setup / resolution
function battleSeed(state) { state.rng = (state.rng * 1664525 + 1013904223) >>> 0; return state.rng; }

export function startDistrictBattle(state, districtId, now = Date.now()) {
  const d = DISTRICTS.find((x) => x.id === districtId);
  if (!d || state.districts[d.id].owner === 'player' || state.battle) return { ok: false };
  const prev = DISTRICTS.find((x) => x.tier === d.tier - 1);
  if (prev && state.districts[prev.id].owner !== 'player') return { ok: false, reason: 'locked' };
  const sq = lineup(state, now);
  if (!sq.length) return { ok: false, reason: 'squad' };
  const e = districtEnemy(d, state);
  const seed = battleSeed(state);
  state.battle = createBattle({
    seed, kind: 'district', label: `Turf war: ${d.name}`, enemyGang: e.gang,
    playerMembers: sq, enemyMembers: makeEnemyCrew(seed ^ 0x9e37, e.gang, e.count, e.level, e.tier, e.boss),
    reward: districtReward(state, d, now), meta: { districtId: d.id },
  });
  state.stats.battles++;
  return { ok: true };
}

export function startRaid(state, rivalId, now = Date.now()) {
  const r = state.rivals.find((x) => x.id === rivalId);
  if (!r || state.battle || !r.base) return { ok: false };
  const sq = lineup(state, now);
  if (!sq.length) return { ok: false, reason: 'squad' };
  const seed = battleSeed(state);
  state.battle = createBattle({
    seed, kind: 'raid', label: `Raid: ${r.name}`, enemyGang: r.gang, layout: rivalLayout(r),
    playerMembers: sq, enemyMembers: makeEnemyCrew(r.seed, r.gang, r.count, r.level, r.tier),
    reward: { cash: 0, influence: 6 + r.tier * 3, teeth: 0, rep: 25 + Math.max(0, r.rep - state.rep) / 10 | 0, gearChance: 0.25 },
    meta: { rivalId: r.id, rivalName: r.name, denLv: r.denLv },
  });
  state.stats.battles++;
  return { ok: true };
}

// ---------------------------------------------------------------- PvE missions
export const missionCleared = (state, gang) => (state.missions && state.missions[gang]) || 0;
export function missionStatus(state, gi, si) {
  const m = MISSIONS[gi];
  if (!m || !m.stages[si]) return { ok: false };
  const cleared = missionCleared(state, m.gang);
  if (denLevel(state) < m.den) return { locked: true, reason: `Den level ${m.den}` };
  if (si > cleared) return { locked: true, reason: `Clear "${m.stages[si - 1].name}" first` };
  return { locked: false, done: si < cleared };
}
export function missionReward(gi, si, replay) {
  const tier = gi * 3 + si;
  const r = { cash: Math.round(250 * Math.pow(1.75, tier)), influence: 15 + 10 * tier, teeth: replay ? 0 : 10 + 5 * tier, rep: replay ? 5 : 20 + 8 * tier };
  if (replay) { r.cash = Math.round(r.cash * 0.3); r.influence = Math.round(r.influence * 0.3); }
  return r;
}
export function startMission(state, gi, si, now = Date.now()) {
  const m = MISSIONS[gi];
  const st = missionStatus(state, gi, si);
  if (!m || st.locked || state.battle) return { ok: false, reason: st.locked ? 'locked' : 'busy' };
  const sq = lineup(state, now);
  if (!sq.length) return { ok: false, reason: 'squad' };
  const stage = m.stages[si];
  const seed = battleSeed(state);
  state.battle = createBattle({
    seed, kind: 'mission', label: `${m.name}: ${stage.name}`, enemyGang: m.gang,
    playerMembers: sq, enemyMembers: makeEnemyCrew((gi * 977 + si * 131 + 7) >>> 0, m.gang, stage.count, stage.level, stage.tier, !!stage.boss),
    reward: missionReward(gi, si, st.done), meta: { gi, si, gang: m.gang, bg: m.img },
  });
  state.stats.battles++;
  return { ok: true };
}

export function resolveBattle(state, now) {
  const b = state.battle;
  if (!b || b.status !== 'done') return null;
  const win = b.result === 'win';
  const r = b.reward;
  const out = { win, kind: b.kind, label: b.label, cash: 0, influence: 0, teeth: 0, rep: 0, gear: null, district: null, reason: b.endReason || null, lost: { cash: 0, influence: 0 } };
  out.fallen = applyLosses(state, b, now);
  out.bossesDown = b.units.filter((u) => u.side === 'player' && u.bossId && !u.alive).map((u) => u.name);
  if (b.kind === 'raid') { const st = raidStars(b); out.stars = st.stars; out.pct = st.pct; out.looted = { ...b.looted }; }
  if (win) {
    out.cash = r.cash; out.influence = r.influence; out.teeth = r.teeth; out.rep = r.rep;
    if (b.kind === 'mission') {
      const g = b.meta.gang;
      if (missionCleared(state, g) === b.meta.si) { state.missions[g] = b.meta.si + 1; out.missionFirst = true; }
      state.stats.missionWins = (state.stats.missionWins || 0) + 1;
    }
    if (b.kind === 'district') { state.districts[b.meta.districtId].owner = 'player'; out.district = b.meta.districtId; }
    if (b.kind === 'raid') { state.rivals = state.rivals.filter((x) => x.id !== b.meta.rivalId); state.stats.raidWins = (state.stats.raidWins || 0) + 1; }
    state.stats.wins++;
  } else {
    out.influence = 3;
    out.rep = b.kind === 'raid' ? -15 : 0;
  }
  if (b.kind === 'raid') { out.cash += b.looted.cash; out.influence += b.looted.influence; if (out.stars >= 3) out.teeth += 5; }
  const got = grant(state, { cash: out.cash, influence: out.influence, teeth: out.teeth });
  out.lost = { cash: Math.max(0, Math.round(out.cash - got.cash)), influence: Math.max(0, Math.round(out.influence - got.influence)) };
  state.rep = Math.max(0, state.rep + out.rep);
  state.passXp += win ? 60 : 15;
  state.lastResult = out;
  state.battle = null;
  return out;
}

// ---------------------------------------------------------------- mock shop (no payments)
export function mockPurchase(state, kind, id, now) {
  if (kind === 'teeth') {
    const p = SHOP.teeth.find((x) => x.id === id);
    const first = !state.purchases[`first_${id}`];
    state.teeth += p.teeth * (first ? 2 : 1); // first purchase of each pack doubled (common pattern)
    state.purchases[`first_${id}`] = true;
    return { ok: true, text: `+${p.teeth * (first ? 2 : 1)} Ice${first ? ' (first-buy bonus x2)' : ''}` };
  }
  if (kind === 'offer') {
    const o = SHOP.offers.find((x) => x.id === id);
    if (o.once && state.purchases[id]) return { ok: false, text: 'Already owned' };
    const g = o.grant;
    if (g.teeth) state.teeth += g.teeth;
    if (g.boss) hireBoss(state, g.boss, true);
    if (g.housing) state.extraHousing = (state.extraHousing || 0) + g.housing;
    if (g.troops) for (const [t, n] of Object.entries(g.troops)) for (let i = 0; i < n; i++) if (armyUsed(state) + TROOPS[t].space <= armyCap(state)) state.army[t] = (state.army[t] || 0) + 1;
    if (g.vip) state.vipUntil = Math.max(now, state.vipUntil) + g.vip * 86400000;
    if (g.pass) state.pass = true;
    if (g.bench) state.extraBench += g.bench;
    if (g.builder) state.base.builders = Math.min(5, state.base.builders + g.builder);
    if (g.noads) state.noads = true;
    state.purchases[id] = true;
    return { ok: true, text: `${o.name} unlocked` };
  }
  if (kind === 'cosmetic') { state.purchases[id] = true; return { ok: true, text: 'Cosmetic unlocked' }; }
  return { ok: false };
}

export const PASS_TIERS = Array.from({ length: 30 }, (_, i) => ({
  tier: i + 1, xp: (i + 1) * 100,
  free: i % 3 === 0 ? { teeth: 10 } : i % 3 === 1 ? { cash: 1000 * (i + 1) } : { influence: 10 + i },
  premium: i === 29 ? { skin: 'Neon Rain' } : i % 5 === 4 ? { ticket: 1 } : { teeth: 35 },
}));

// ---------------------------------------------------------------- guided objectives (first-session flow)
const has = (s, t, lv = 1) => s.base.buildings.some((b) => b.t === t && b.lv >= lv);
export const OBJECTIVES = [
  { text: 'Build a Knock-off Stall (BUILD button)', check: (s) => has(s, 'stall'), reward: { cash: 100 } },
  { text: 'Collect cash from your stall when the bubble appears', check: (s) => s.stats.collects >= 1, reward: { cash: 100 } },
  { text: 'Clear 3 pieces of junk to free up land', check: (s) => (s.stats.cleared || 0) >= 3, reward: { teeth: 10 } },
  { text: 'Build a Pirate Radio to earn Rep', check: (s) => has(s, 'radio'), reward: { influence: 50 } },
  { text: 'Build a Strongbox to hold more cash', check: (s) => has(s, 'strongbox'), reward: { cash: 200 } },
  { text: 'Build a Training Yard', check: (s) => has(s, 'gym'), reward: { influence: 40 } },
  { text: 'Train troops in the Crew tab', check: (s) => s.stats.trains >= 1, reward: { teeth: 10 } },
  { text: 'Win the first Grey Pack mission (Missions tab)', check: (s) => (s.missions?.grey || 0) >= 1, reward: { cash: 400 } },
  { text: 'Upgrade the Knock-off Stall to level 3', check: (s) => has(s, 'stall', 3), reward: { cash: 300 } },
  { text: 'Upgrade The Den to level 2', check: (s) => has(s, 'den', 2), reward: { teeth: 20 } },
  { text: 'Put up a Sniper Nest to defend the base', check: (s) => has(s, 'sniper'), reward: { influence: 60 } },
  { text: 'Raid a rival base (City tab)', check: (s) => (s.stats.raidWins || 0) >= 1, reward: { teeth: 20 } },
  { text: 'Take the Rail Yards in a turf war (City tab)', check: (s) => s.districts.rail.owner === 'player', reward: { teeth: 20 } },
  { text: 'Hire a lieutenant so a building collects by itself', check: (s) => s.base.buildings.some((b) => b.lt), reward: { influence: 40 } },
  { text: 'Upgrade The Den to level 3 (unlocks Barricades)', check: (s) => has(s, 'den', 3), reward: { teeth: 30 } },
  { text: 'Upgrade the Training Yard to level 2 (unlocks Wolf Bruisers)', check: (s) => has(s, 'gym', 2), reward: { influence: 50 } },
  { text: 'Hire Ma Grey, your first boss (Crew tab)', check: (s) => !!s.bosses?.magrey, reward: { teeth: 20 } },
  { text: 'Take the Neon Strip', check: (s) => s.districts.neon.owner === 'player', reward: { teeth: 30 } },
  { text: 'Take the Night Market', check: (s) => s.districts.market.owner === 'player', reward: { teeth: 40 } },
  { text: 'Take Glass Uptown', check: (s) => s.districts.uptown.owner === 'player', reward: { teeth: 50 } },
  { text: 'Take the Swamp Docks and topple Deacon Mire', check: (s) => s.districts.docks.owner === 'player', reward: { teeth: 100 } },
];
export function currentObjective(state) {
  const o = OBJECTIVES[state.tutorial];
  return o ? { ...o, index: state.tutorial, done: o.check(state) } : null;
}
export function claimObjective(state) {
  const o = currentObjective(state);
  if (!o || !o.done) return { ok: false };
  grant(state, o.reward);
  state.tutorial++;
  return { ok: true, reward: o.reward };
}
