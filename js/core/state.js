// Game state: one plain JSON object. Persistence goes through a tiny storage adapter so the
// localStorage backend can later be swapped for an online save API without touching rules.
import { RACKETS, DISTRICTS, GANGS } from './data.js';
import { makeMember } from './crew.js';
import { newSeed } from './rng.js';

export const SAVE_KEY = 'fangcity.save.v1';
export const STATE_VERSION = 1;

export function newGame(now, gang = 'grey', seed = newSeed()) {
  const s = {
    v: STATE_VERSION, createdAt: now, lastTick: now, rng: seed >>> 0, nextId: 1,
    gang, bossName: 'You',
    cash: 25, lifetime: 0, runEarnings: 0, teeth: 50, influence: 10, rep: 0,
    cred: 0, credEarned: 0, prestiges: 0, tickets: 0,
    rackets: {}, boosts: { adIncomeUntil: 0, adsToday: 0, adsDay: '' },
    crew: [], squad: [], inventory: { medkit: 1 }, training: [], extraBench: 0, rosterBonus: 0,
    streetRecruits: 0, pity: 0,
    districts: {},
    daily: { lastClaim: '', streak: 0 },
    jobs: { day: '', list: [] },
    stats: { taps: 0, collects: 0, wins: 0, trains: 0, racketBuys: 0, battles: 0 },
    rivals: [], rivalsAt: 0,
    battle: null, lastResult: null,
    purchases: {}, vipUntil: 0, pass: false, noads: false, passXp: 0,
    tutorial: 0,
  };
  for (const r of RACKETS) s.rackets[r.id] = { level: 0, till: 0, lieutenant: false };
  s.rackets.stall.level = 1;
  for (const d of DISTRICTS) s.districts[d.id] = { owner: d.owner === 'player' ? 'player' : d.rival };
  // starting crew: three from your gang
  const sp = GANGS[gang].species;
  const starters = [
    { species: sp[0], role: 'enforcer', rarity: 'rare' },
    { species: sp[sp.length > 1 ? 1 : 0], role: 'shooter' },
    { species: sp[0], role: 'shooter' },
  ];
  for (const st of starters) { const m = makeMember(s, st); s.crew.push(m); s.squad.push(m.id); }
  return s;
}

export function migrate(s) {
  if (!s || typeof s !== 'object') return null;
  if (s.v !== STATE_VERSION) return null; // future: step-by-step migrations
  for (const r of RACKETS) if (!s.rackets[r.id]) s.rackets[r.id] = { level: 0, till: 0, lieutenant: false };
  for (const d of DISTRICTS) if (!s.districts[d.id]) s.districts[d.id] = { owner: d.owner === 'player' ? 'player' : d.rival };
  return s;
}

export const serialize = (s) => JSON.stringify(s);
export const deserialize = (txt) => { try { return migrate(JSON.parse(txt)); } catch { return null; } };

export function makeLocalStorage(ls) {
  return {
    load: () => { const t = ls.getItem(SAVE_KEY); return t ? deserialize(t) : null; },
    save: (s) => ls.setItem(SAVE_KEY, serialize(s)),
    clear: () => ls.removeItem(SAVE_KEY),
  };
}
