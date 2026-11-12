// Game state: one plain JSON object. Persistence goes through a tiny storage adapter so the
// localStorage backend can later be swapped for an online save API without touching rules.
import { DISTRICTS, GEAR, TROOPS } from './data.js';
import { SPECIES_TO_TROOP, armyCap, spaceOf } from './crew.js';
import { newSeed } from './rng.js';
import { newBase, gain } from './base.js';

export const SAVE_KEY = 'fangcity.save.v2'; // key kept; the object inside carries its own version
export const OLD_SAVE_KEY = 'fangcity.save.v1';
export const STATE_VERSION = 3;

export function newGame(now, seed = newSeed()) {
  const s = {
    v: STATE_VERSION, createdAt: now, lastTick: now, rng: seed >>> 0, nextId: 1,
    bossName: 'You',
    cash: 500, lifetime: 0, runEarnings: 0, teeth: 50, influence: 150, rep: 0,
    cred: 0, credEarned: 0, prestiges: 0, tickets: 0,
    base: newBase(seed), boosts: { adIncomeUntil: 0, adsToday: 0, adsDay: '' },
    army: { rat: 4, fox: 3 }, queue: [], queueAt: 0, troopLv: {}, research: null, bosses: {}, extraBench: 0,
    missions: {},
    districts: {},
    daily: { lastClaim: '', streak: 0 },
    jobs: { day: '', list: [] },
    stats: { taps: 0, collects: 0, wins: 0, trains: 0, builds: 0, upgrades: 0, cleared: 0, battles: 0, raidWins: 0, missionWins: 0 },
    rivals: [], rivalsAt: 0,
    battle: null, lastResult: null,
    purchases: {}, vipUntil: 0, pass: false, noads: false, passXp: 0,
    tutorial: 0,
  };
  for (const d of DISTRICTS) s.districts[d.id] = { owner: d.owner === 'player' ? 'player' : d.rival };
  return s;
}

// Old saves had individual crew members with gear. v3 has a shared troop roster: each member
// becomes one troop of its species (as many as housing allows), member levels become troop
// levels (capped at 3), and spare gear is sold for cash.
function convertCrew(s, crew = [], inventory = {}) {
  const army = {}, best = {};
  for (const m of [...crew].sort((a, b) => (b.level || 1) - (a.level || 1))) {
    const t = SPECIES_TO_TROOP[m.species] || 'rat';
    army[t] = (army[t] || 0) + 1;
    best[t] = Math.max(best[t] || 1, Math.min(3, 1 + Math.floor(((m.level || 1) - 1) / 4)));
  }
  s.army = {};
  const cap = armyCap(s);
  // fill housing, biggest troops first so no one is wasted on space
  for (const t of Object.keys(army).sort((a, b) => TROOPS[a].space - TROOPS[b].space)) {
    for (let i = 0; i < army[t]; i++) if (spaceOf(s.army) + TROOPS[t].space <= cap) s.army[t] = (s.army[t] || 0) + 1;
  }
  if (!Object.keys(s.army).length) s.army = { rat: 4, fox: 3 };
  s.troopLv = best;
  let sold = 0;
  for (const [gid, n] of Object.entries(inventory || {})) if (GEAR[gid]) sold += Math.round((GEAR[gid].price || 0) * 0.5) * (n || 0);
  s.gearRefund = sold;
  return s;
}

// v1 (racket list) -> v3. Keeps turf, Gold Teeth, purchases and progress; starts on the wasteland.
export function migrateV1(old, now) {
  if (!old || old.v !== 1) return null;
  const s = newGame(now, old.rng || newSeed());
  for (const k of ['districts', 'daily', 'rep', 'teeth', 'tickets', 'purchases', 'vipUntil', 'pass', 'noads', 'passXp', 'nextId', 'rng', 'lifetime']) {
    if (old[k] !== undefined) s[k] = old[k];
  }
  s.stats = { ...s.stats, ...(old.stats || {}) };
  s.teeth += 100; // moving-in gift
  s.influence = Math.min(200, Math.floor(old.influence || 0) + 150);
  s.cash = 1500;
  if (old.purchases?.bench) s.extraBench = 1;
  convertCrew(s, old.crew, old.inventory);
  if (s.gearRefund) s.gearRefund = gain(s, 'cash', s.gearRefund);
  s.migratedFrom = 1;
  return s;
}

// v2 (free-build base, individual crew) -> v3 (troop roster, bosses, missions). The base is kept as is.
export function migrateV2(old, now) {
  if (!old || old.v !== 2 || !old.base) return null;
  const s = { ...old };
  convertCrew(s, old.crew, old.inventory);
  for (const k of ['crew', 'squad', 'inventory', 'training', 'gang', 'rosterBonus', 'pity', 'streetRecruits']) delete s[k];
  s.queue = []; s.queueAt = 0; s.research = null; s.bosses = {}; s.missions = {};
  s.extraBench = old.purchases?.bench ? 1 : 0;
  s.stats = { missionWins: 0, ...s.stats };
  s.battle = null;
  if (s.gearRefund) s.gearRefund = gain(s, 'cash', s.gearRefund);
  s.teeth += 50; // sorry-for-the-shake-up gift
  s.v = STATE_VERSION;
  s.migratedFrom = 2;
  return s;
}

export function migrate(s, now = Date.now()) {
  if (!s || typeof s !== 'object') return null;
  if (s.v === 1) return migrateV1(s, now);
  if (s.v === 2) return migrateV2(s, now);
  if (s.v !== STATE_VERSION || !s.base) return null;
  for (const d of DISTRICTS) if (!s.districts[d.id]) s.districts[d.id] = { owner: d.owner === 'player' ? 'player' : d.rival };
  s.missions ||= {}; s.bosses ||= {}; s.troopLv ||= {}; s.queue ||= []; s.army ||= {};
  return s;
}

export const serialize = (s) => JSON.stringify(s);
export const deserialize = (txt, now) => { try { return migrate(JSON.parse(txt), now); } catch { return null; } };

export function makeLocalStorage(ls) {
  return {
    load: (now) => {
      const t = ls.getItem(SAVE_KEY);
      if (t) return deserialize(t, now);
      const old = ls.getItem(OLD_SAVE_KEY);
      if (old) { const s = deserialize(old, now); if (s) { ls.setItem(SAVE_KEY, serialize(s)); ls.removeItem(OLD_SAVE_KEY); } return s; }
      return null;
    },
    save: (s) => ls.setItem(SAVE_KEY, serialize(s)),
    clear: () => { ls.removeItem(SAVE_KEY); ls.removeItem(OLD_SAVE_KEY); },
  };
}
