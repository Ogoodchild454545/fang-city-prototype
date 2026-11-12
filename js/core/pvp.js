// Street fights are live head-to-head PvP. Until a server is wired, findMatch()
// returns the same Opponent shape a server would, and the local AI plays that
// side through chooseAction(). Swap those two functions for a network
// implementation without changing battle rules or rewards.
import { rngInt, rngNext, newSeed } from './rng.js';
import { RIVALS, defOf } from './heroes.js';
import { addShards, pickHero } from './shards.js';

export const LEAGUES = [
  { id: 'dock',     name: 'Dock Rat',          min: 0 },
  { id: 'wharf',    name: 'Wharf Hand',        min: 200 },
  { id: 'yard',     name: 'Yard Boss',         min: 500 },
  { id: 'quay',     name: 'Quay Chief',        min: 900 },
  { id: 'harbour',  name: 'Harbour King',      min: 1400 },
  { id: 'legend',   name: 'Docklands Legend',  min: 2000 },
];

const NAMES = [
  'Vera Hook', 'Cal Drift', 'Nash Kettle', 'Ivy Brine', 'Moss Quill',
  'Rex Harbor', 'Sable Wren', 'Joss Pike', 'Ned Cinder', 'Lark Voss',
  'Gwen Coil', 'Bram Silt', 'Otis Krane', 'Faye Rill', 'Kit Harlow',
];

const RIVAL_IDS = Object.keys(RIVALS);

export function ensurePvp(s) {
  if (!s.pvp || typeof s.pvp !== 'object') s.pvp = { trophies: 0, wins: 0, losses: 0, streak: 0 };
  s.pvp.trophies = Math.max(0, s.pvp.trophies | 0);
  s.pvp.wins = s.pvp.wins | 0;
  s.pvp.losses = s.pvp.losses | 0;
  s.pvp.streak = s.pvp.streak | 0;
  return s.pvp;
}

export function leagueOf(trophies) {
  const t = Math.max(0, trophies | 0);
  let cur = LEAGUES[0];
  for (const lg of LEAGUES) if (t >= lg.min) cur = lg;
  const idx = LEAGUES.indexOf(cur);
  const next = LEAGUES[idx + 1] || null;
  return { ...cur, idx, next, trophies: t };
}

export function nextLeague(trophies) {
  return leagueOf(trophies).next;
}

export function trophyDelta(myTrophies, theirTrophies, win) {
  const mine = Math.max(0, myTrophies | 0);
  const theirs = Math.max(0, theirTrophies | 0);
  const diff = theirs - mine;
  if (win) {
    return 20 + Math.round(Math.max(-8, Math.min(10, diff / 25)));
  }
  const loss = 15 - Math.round(Math.max(-8, Math.min(8, diff / 30)));
  return -Math.min(mine, Math.max(0, loss));
}

function pickName(holder) {
  return NAMES[rngInt(holder, 0, NAMES.length - 1)];
}

function pickSquad(holder, size) {
  const n = Math.max(1, Math.min(4, size | 0));
  const left = RIVAL_IDS.slice();
  const out = [];
  while (out.length < n && left.length) {
    const i = rngInt(holder, 0, left.length - 1);
    out.push(left.splice(i, 1)[0]);
  }
  return out;
}

export function makeOpponent(holder, trophies, squadSize = 4) {
  const t = Math.max(0, trophies | 0);
  const lg = leagueOf(t);
  const name = pickName(holder);
  return {
    id: `opp-${(holder.rng >>> 0).toString(16)}`,
    name,
    trophies: t,
    league: lg.id,
    leagueName: lg.name,
    squad: pickSquad(holder, squadSize),
    seed: holder.rng >>> 0,
  };
}

// THE hook a future server replaces: return an Opponent near the player's trophies.
export function findMatch(s, seed, squadSize = 4) {
  ensurePvp(s);
  const mine = s.pvp.trophies;
  const holder = { rng: (seed >>> 0) || s.rng || newSeed() };
  const window = 80 + Math.min(200, Math.floor(mine / 20));
  const pool = [];
  for (let i = 0; i < 12; i++) {
    const delta = rngInt(holder, -window, window);
    pool.push(makeOpponent(holder, Math.max(0, mine + delta), squadSize));
  }
  pool.sort((a, c) => Math.abs(a.trophies - mine) - Math.abs(c.trophies - mine));
  const pick = pool[rngInt(holder, 0, Math.min(4, pool.length - 1))];
  s.rng = holder.rng >>> 0;
  return pick;
}

// THE hook a future server replaces for the remote player's turn.
// Today it just delegates to the local tactics AI (passed in to avoid a cycle).
export function chooseAction(battle, thinkFn) {
  return thinkFn(battle);
}

export function pvpStake(n, highStakes) {
  const size = Math.max(1, n | 0);
  const reward = { cash: 200 + size * 80, influence: 15 + size * 8 };
  if (highStakes) { reward.cash *= 3; reward.influence *= 3; }
  return reward;
}

export function rollPvpShards(s, highStakes, now = Date.now()) {
  const lg = leagueOf(ensurePvp(s).trophies);
  let n = 5 + lg.idx * 2;
  if (highStakes) n += 4;
  n += rngInt(s, 0, 2);
  const id = pickHero(s, now, { excludeMaxed: true });
  return addShards(s, id, n);
}

export function settlePvp(s, b) {
  ensurePvp(s);
  const out = { trophies: 0, trophiesNow: s.pvp.trophies, league: leagueOf(s.pvp.trophies), opponent: b.opponent || null, shardDrop: null };
  if (!b || b.tutorial || b.kind === 'tutorial' || !b.pvp) return out;
  const win = b.status === 'win';
  const theirs = b.opponent ? b.opponent.trophies : s.pvp.trophies;
  const delta = trophyDelta(s.pvp.trophies, theirs, win);
  s.pvp.trophies = Math.max(0, s.pvp.trophies + delta);
  if (win) {
    s.pvp.wins += 1;
    s.pvp.streak = Math.max(0, s.pvp.streak) + 1;
    out.shardDrop = rollPvpShards(s, !!b.highStakes);
  } else {
    s.pvp.losses += 1;
    s.pvp.streak = Math.min(0, s.pvp.streak) - 1;
  }
  out.trophies = delta;
  out.trophiesNow = s.pvp.trophies;
  out.league = leagueOf(s.pvp.trophies);
  return out;
}

export function classMixOk() {
  // Squads may mix any classes, including duplicates. There is no class cap.
  return true;
}

export function opponentLabel(opp) {
  if (!opp) return 'an opponent';
  const lg = opp.leagueName || leagueOf(opp.trophies).name;
  return `${opp.name} · ${lg} · ${opp.trophies} trophies`;
}
