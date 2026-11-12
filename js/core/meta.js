// Meta systems: daily rewards, jobs, turf battles, async raids on rival players, rewards, mock shop.
import { DISTRICTS, DAILY_REWARDS, JOB_TEMPLATES, REP_TIERS, GANGS, NAMES, SHOP, GEAR, RARITY, ROLES, SQUAD_SIZE } from './data.js';
import { makeMember, squadMembers, squadPower, memberPower } from './crew.js';
import { totalIncome } from './economy.js';
import { createBattle } from './battle.js';
import { rngNext, rngPick, rngInt } from './rng.js';

export const dayKey = (now) => new Date(now).toISOString().slice(0, 10);
const prevDay = (now) => dayKey(now - 86400000);

export const repTier = (rep) => [...REP_TIERS].reverse().find((t) => rep >= t.min);
export const nextRepTier = (rep) => REP_TIERS.find((t) => t.min > rep) || null;

function grant(state, g) {
  if (g.cash) { state.cash += g.cash; state.lifetime += g.cash; state.runEarnings += g.cash; }
  if (g.teeth) state.teeth += g.teeth;
  if (g.influence) state.influence += g.influence;
  if (g.ticket) state.tickets += g.ticket;
  if (g.gear) state.inventory[g.gear] = (state.inventory[g.gear] || 0) + 1;
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
    b.name = 'Old Scales'; b.species = 'croc'; b.rarity = 'legendary'; b.level = level + 2; b.boss = true;
    b.base = { muscle: 88, aim: 50, nerve: 70 };
  }
  return out;
}

const ALT_RIVAL = { grey: 'iron', iron: 'grey', swamp: 'velvet', velvet: 'grey' };
// Never make the player fight their own gang for turf.
export const districtRival = (state, d) => (d.rival && state && d.rival === state.gang ? ALT_RIVAL[d.rival] : d.rival);

export function districtEnemy(d, state) {
  // Fixed difficulty curve per district: forces crew upgrades between turf wars.
  return { gang: districtRival(state, d), count: d.tier <= 1 ? 3 : d.tier >= 5 ? 5 : 4, level: 1 + (d.tier - 1) * 4, tier: d.tier, boss: d.tier >= 5 };
}

export function districtReward(state, d, now) {
  return {
    cash: Math.round(400 * Math.pow(4.5, d.tier) + totalIncome(state, now) * 90),
    influence: 20 + 15 * d.tier, teeth: 15 + 5 * d.tier, rep: 40 + 20 * d.tier, gearChance: 0.6,
  };
}

// ---------------------------------------------------------------- rival players (async PvP, mocked)
export function refreshRivals(state, now, force = false) {
  if (!force && state.rivals.length && now - state.rivalsAt < 15 * 60 * 1000) return;
  const h = { rng: (state.rng ^ Math.floor(now / 1000)) >>> 0 };
  const myPow = Math.max(300, squadPower(state));
  const avgLvl = Math.max(1, Math.round(squadMembers(state).reduce((s, m) => s + m.level, 0) / Math.max(1, state.squad.length)));
  const income = totalIncome(state, now);
  const gangs = Object.keys(GANGS);
  state.rivals = [-1, 0, 1].map((delta, i) => {
    const level = Math.max(1, avgLvl + delta * 2 + rngInt(h, -1, 1));
    const gang = rngPick(h, gangs);
    const tier = Math.min(5, Math.floor(level / 5));
    const seed = (h.rng = (h.rng * 1664525 + 1013904223) >>> 0);
    const count = 3 + (delta >= 0 ? 1 : 0);
    const preview = makeEnemyCrew(seed, gang, count, level, tier);
    const power = preview.reduce((s, m) => s + memberPower(m), 0);
    return {
      id: `r${now}${i}`, name: `${rngPick(h, NAMES.rivalTags)}_${rngInt(h, 10, 99)}`, gang, level, count, tier, seed, power,
      rep: Math.max(0, state.rep + delta * 60 + rngInt(h, -20, 20)),
      stash: Math.round(250 * level + income * (60 + 40 * (delta + 1))),
      odds: power < myPow * 0.85 ? 'Easy' : power > myPow * 1.15 ? 'Risky' : 'Even',
    };
  });
  state.rivalsAt = now;
}

// ---------------------------------------------------------------- battle setup / resolution
function battleSeed(state) { state.rng = (state.rng * 1664525 + 1013904223) >>> 0; return state.rng; }

export function startDistrictBattle(state, districtId, now) {
  const d = DISTRICTS.find((x) => x.id === districtId);
  if (!d || state.districts[d.id].owner === 'player' || state.battle) return { ok: false };
  const prev = DISTRICTS.find((x) => x.tier === d.tier - 1);
  if (prev && state.districts[prev.id].owner !== 'player') return { ok: false, reason: 'locked' };
  const sq = squadMembers(state);
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

export function startRaid(state, rivalId) {
  const r = state.rivals.find((x) => x.id === rivalId);
  if (!r || state.battle) return { ok: false };
  const sq = squadMembers(state);
  if (!sq.length) return { ok: false, reason: 'squad' };
  const seed = battleSeed(state);
  state.battle = createBattle({
    seed, kind: 'raid', label: `Raid: ${r.name}`, enemyGang: r.gang,
    playerMembers: sq, enemyMembers: makeEnemyCrew(r.seed, r.gang, r.count, r.level, r.tier),
    reward: { cash: r.stash, influence: 10 + r.tier * 4, teeth: 0, rep: 25 + Math.max(0, r.rep - state.rep) / 10 | 0, gearChance: 0.25 },
    meta: { rivalId: r.id, rivalName: r.name },
  });
  state.stats.battles++;
  return { ok: true };
}

const DROP_TABLE = ['medkit', 'spikes', 'leather', 'pistol9', 'bat', 'adrenaline', 'sawnoff', 'machete', 'ironhide', 'smoke', 'smg'];

export function resolveBattle(state, now) {
  const b = state.battle;
  if (!b || b.status !== 'done') return null;
  const win = b.result === 'win';
  const r = b.reward;
  const out = { win, kind: b.kind, label: b.label, cash: 0, influence: 0, teeth: 0, rep: 0, gear: null, district: null, reason: b.endReason || null };
  if (win) {
    out.cash = r.cash; out.influence = r.influence; out.teeth = r.teeth; out.rep = r.rep;
    if (rngNext(state) < r.gearChance) {
      const maxIdx = Math.min(DROP_TABLE.length - 1, 3 + Math.floor(state.rep / 120));
      out.gear = DROP_TABLE[Math.floor(rngNext(state) * (maxIdx + 1))];
    }
    if (b.kind === 'district') { state.districts[b.meta.districtId].owner = 'player'; out.district = b.meta.districtId; }
    if (b.kind === 'raid') { state.rivals = state.rivals.filter((x) => x.id !== b.meta.rivalId); state.stats.raidWins = (state.stats.raidWins || 0) + 1; }
    state.stats.wins++;
    for (const u of b.units) if (u.side === 'player') { const m = state.crew.find((x) => x.id === u.memberId); if (m) m.wins++; }
  } else {
    out.influence = 3;
    out.rep = b.kind === 'raid' ? -15 : 0;
  }
  grant(state, { cash: out.cash, influence: out.influence, teeth: out.teeth, gear: out.gear });
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
    return { ok: true, text: `+${p.teeth * (first ? 2 : 1)} Gold Teeth${first ? ' (first-buy bonus x2)' : ''}` };
  }
  if (kind === 'offer') {
    const o = SHOP.offers.find((x) => x.id === id);
    if (o.once && state.purchases[id]) return { ok: false, text: 'Already owned' };
    const g = o.grant;
    if (g.teeth) state.teeth += g.teeth;
    if (g.gear) state.inventory[g.gear] = (state.inventory[g.gear] || 0) + 1;
    if (g.member) { const m = makeMember(state, g.member); m.name = 'Vesper'; state.crew.push(m); if (state.squad.length < SQUAD_SIZE) state.squad.push(m.id); }
    if (g.vip) state.vipUntil = Math.max(now, state.vipUntil) + g.vip * 86400000;
    if (g.pass) state.pass = true;
    if (g.bench) state.extraBench += g.bench;
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
export const OBJECTIVES = [
  { text: 'Shake down the street 10 times', check: (s) => s.stats.taps >= 10, reward: { cash: 60 } },
  { text: 'Collect the till at your Market Stall', check: (s) => s.stats.collects >= 1, reward: { cash: 60 } },
  { text: 'Upgrade the Market Stall to level 10', check: (s) => s.rackets.stall.level >= 10, reward: { teeth: 10 } },
  { text: 'Open a Hand Car Wash', check: (s) => s.rackets.carwash.level >= 1, reward: { influence: 10 } },
  { text: 'Train a crew member (Crew tab)', check: (s) => s.stats.trains >= 1, reward: { teeth: 10 } },
  { text: 'Take the Rail Yards in a turf war (City tab)', check: (s) => s.districts.rail.owner === 'player', reward: { teeth: 20 } },
  { text: 'Hire a lieutenant so a racket runs itself', check: (s) => Object.values(s.rackets).some((r) => r.lieutenant), reward: { influence: 20 } },
  { text: 'Win a raid against a rival crew', check: (s) => (s.stats.raidWins || 0) >= 1, reward: { teeth: 20 } },
  { text: 'Recruit a fourth crew member', check: (s) => s.crew.length >= 4, reward: { influence: 25 } },
  { text: 'Take the Neon Strip', check: (s) => s.districts.neon.owner === 'player', reward: { teeth: 30 } },
  { text: 'Take the Night Market', check: (s) => s.districts.market.owner === 'player', reward: { teeth: 40 } },
  { text: 'Take Glass Uptown', check: (s) => s.districts.uptown.owner === 'player', reward: { teeth: 50 } },
  { text: 'Take the Swamp Docks and topple Old Scales', check: (s) => s.districts.docks.owner === 'player', reward: { teeth: 100 } },
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
