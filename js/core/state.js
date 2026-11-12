// Game state: one plain JSON object. Persistence goes through a tiny storage adapter so the
// localStorage backend can later be swapped for an online save API without touching rules.
import { DISTRICTS, GANGS } from './data.js';
import { makeMember } from './crew.js';
import { newSeed } from './rng.js';
import { newBase } from './base.js';

export const SAVE_KEY = 'fangcity.save.v2';
export const OLD_SAVE_KEY = 'fangcity.save.v1';
export const STATE_VERSION = 2;

export function newGame(now, gang = 'grey', seed = newSeed()) {
  const s = {
    v: STATE_VERSION, createdAt: now, lastTick: now, rng: seed >>> 0, nextId: 1,
    gang, bossName: 'You',
    cash: 500, lifetime: 0, runEarnings: 0, teeth: 50, influence: 150, rep: 0,
    cred: 0, credEarned: 0, prestiges: 0, tickets: 0,
    base: newBase(seed), boosts: { adIncomeUntil: 0, adsToday: 0, adsDay: '' },
    crew: [], squad: [], inventory: { medkit: 1 }, training: [], extraBench: 0, rosterBonus: 0,
    streetRecruits: 0, pity: 0,
    districts: {},
    daily: { lastClaim: '', streak: 0 },
    jobs: { day: '', list: [] },
    stats: { taps: 0, collects: 0, wins: 0, trains: 0, builds: 0, upgrades: 0, cleared: 0, battles: 0, raidWins: 0 },
    rivals: [], rivalsAt: 0,
    battle: null, lastResult: null,
    purchases: {}, vipUntil: 0, pass: false, noads: false, passXp: 0,
    tutorial: 0,
  };
  for (const d of DISTRICTS) s.districts[d.id] = { owner: d.owner === 'player' ? 'player' : d.rival };
  const sp = GANGS[gang].species;
  const starters = [
    { species: sp[0], role: 'enforcer', rarity: 'rare' },
    { species: sp[sp.length > 1 ? 1 : 0], role: 'shooter' },
    { species: sp[0], role: 'shooter' },
  ];
  for (const st of starters) { const m = makeMember(s, st); s.crew.push(m); s.squad.push(m.id); }
  return s;
}

// v1 (racket list) -> v2 (free-build base). Keeps crew, gear, turf, Gold Teeth, purchases and progress;
// the old rackets become a cash refund (capped by the new storage) and the player starts on the wasteland.
export function migrateV1(old, now) {
  if (!old || old.v !== 1) return null;
  const s = newGame(now, old.gang || 'grey', old.rng || newSeed());
  for (const k of ['crew', 'squad', 'inventory', 'districts', 'daily', 'rep', 'teeth', 'tickets', 'pity', 'streetRecruits', 'purchases', 'vipUntil', 'pass', 'noads', 'passXp', 'extraBench', 'nextId', 'rng', 'lifetime']) {
    if (old[k] !== undefined) s[k] = old[k];
  }
  s.stats = { ...s.stats, ...(old.stats || {}) };
  s.training = [];
  s.teeth += 100; // moving-in gift
  s.influence = Math.min(200, Math.floor(old.influence || 0) + 150);
  s.cash = 1500;
  s.migratedFrom = 1;
  if (old.purchases?.bench) s.extraBench = 1;
  return s;
}

export function migrate(s, now = Date.now()) {
  if (!s || typeof s !== 'object') return null;
  if (s.v === 1) return migrateV1(s, now);
  if (s.v !== STATE_VERSION || !s.base) return null;
  for (const d of DISTRICTS) if (!s.districts[d.id]) s.districts[d.id] = { owner: d.owner === 'player' ? 'player' : d.rival };
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
