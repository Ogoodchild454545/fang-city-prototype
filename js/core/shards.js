// Operator shards: ~30 unlock a hero. Drops from clearing bushes, mission wins,
// and Ice crates (mock shop). Pin a target, a weekly feature, and a 10-crate pity.
import { rngNext, rngInt, rngWeighted } from './rng.js';
import { HERO_ORDER, HEROES, ensureHeroes, grantHero } from './heroes.js';

export const SHARDS_TO_UNLOCK = 30;
export const MAX_STARS = 5;
// Cost in shards to go from (star) to (star+1). Index is the current star.
export const STAR_COST = [0, 10, 20, 35, 50];

export const CRATES = {
  street: {
    id: 'street', name: 'Street Crate', cost: 40,
    blurb: 'A bag of operator leads from the street.',
    odds: [
      { label: '3–5 shards', p: 0.62 },
      { label: '8–12 shards', p: 0.25 },
      { label: '15–20 shards', p: 0.08 },
      { label: '5–8 universal shards', p: 0.05 },
    ],
    pityEvery: 10,
    pity: 'Every 10 crates: 10 shards of your pinned operator, or the weekly feature if you have not pinned one.',
  },
  vault: {
    id: 'vault', name: 'Vault Crate', cost: 200,
    blurb: 'A heavier lockbox. Better odds, and a slim chance at a full unlock.',
    odds: [
      { label: '10–14 shards', p: 0.60 },
      { label: '20–30 shards', p: 0.25 },
      { label: '30 shards — unlock a locked operator', p: 0.08 },
      { label: '12–18 universal shards', p: 0.07 },
    ],
    pityEvery: 10,
    pity: 'Every 10 vault crates: 15 shards of your pinned operator, or the weekly feature.',
  },
};

const WEEK_MS = 7 * 24 * 3600 * 1000;
const FEATURE_POOL = HERO_ORDER.filter((id) => id !== 'rook');

export function weekIndex(now) {
  return Math.floor((now || Date.now()) / WEEK_MS);
}

export function featuredHero(now) {
  return FEATURE_POOL[weekIndex(now) % FEATURE_POOL.length];
}

export function featuredUntil(now) {
  const w = weekIndex(now);
  return (w + 1) * WEEK_MS;
}

export function collectable(s) {
  return HERO_ORDER.filter((id) => id !== 'rook');
}

function weightFor(s, id, now) {
  let w = 10;
  if (id === featuredHero(now)) w *= 2;
  if (s.heroes.pin && s.heroes.pin === id) w *= 3;
  // slightly prefer locked heroes so players finish a collection
  if (!s.heroes.owned[id]) w *= 1.3;
  // skip maxed (5-star) targets unless everything is maxed
  const rec = s.heroes.owned[id];
  if (rec && (rec.stars || 1) >= MAX_STARS) w *= 0.15;
  return w;
}

export function pickHero(s, now = Date.now(), { excludeMaxed = false } = {}) {
  ensureHeroes(s);
  let pool = collectable(s);
  if (excludeMaxed) {
    const open = pool.filter((id) => !s.heroes.owned[id] || (s.heroes.owned[id].stars || 1) < MAX_STARS);
    if (open.length) pool = open;
  }
  const table = pool.map((id) => [id, weightFor(s, id, now)]);
  return rngWeighted(s, table);
}

export function shardCount(s, id) {
  ensureHeroes(s);
  if (s.heroes.owned[id]) return s.heroes.owned[id].shards || 0;
  return s.heroes.shards[id] || 0;
}

export function progressOf(s, id) {
  const have = shardCount(s, id);
  if (!s.heroes.owned[id]) return { have, need: SHARDS_TO_UNLOCK, kind: 'unlock', stars: 0 };
  const stars = s.heroes.owned[id].stars || 1;
  if (stars >= MAX_STARS) return { have, need: 0, kind: 'max', stars };
  return { have, need: STAR_COST[stars], kind: 'star', stars };
}

export function starBonus(stars) {
  const n = Math.max(1, stars || 1) - 1;
  return { hp: n, aim: n };
}

// Add shards, auto-unlock, auto-star, convert overflow at max stars into universal shards.
export function addShards(s, id, n) {
  ensureHeroes(s);
  n = Math.max(0, n | 0);
  const out = { id, name: HEROES[id]?.name || id, added: n, unlocked: false, stars: 0, converted: 0, universal: 0 };
  if (!n || !HEROES[id] || id === 'rook' && !s.heroes.owned.rook) {
    // Rook is story-granted; still allow star shards if owned
  }
  if (!HEROES[id] || n <= 0) return out;
  if (id === 'rook' && s.heroes.owned.rook) {
    return bankOwned(s, id, n, out);
  }
  if (s.heroes.owned[id]) return bankOwned(s, id, n, out);
  s.heroes.shards[id] = (s.heroes.shards[id] || 0) + n;
  if (s.heroes.shards[id] >= SHARDS_TO_UNLOCK) {
    s.heroes.shards[id] -= SHARDS_TO_UNLOCK;
    grantHero(s, id);
    s.heroes.owned[id].stars = 1;
    s.heroes.owned[id].shards = s.heroes.shards[id];
    s.heroes.shards[id] = 0;
    out.unlocked = true;
    // leftover may star up immediately
    bankOwned(s, id, 0, out);
  }
  out.stars = s.heroes.owned[id]?.stars || 0;
  return out;
}

function bankOwned(s, id, extra, out) {
  const rec = s.heroes.owned[id];
  if (!rec) return out;
  rec.stars = rec.stars || 1;
  rec.shards = (rec.shards || 0) + extra;
  while (rec.stars < MAX_STARS && rec.shards >= STAR_COST[rec.stars]) {
    rec.shards -= STAR_COST[rec.stars];
    rec.stars += 1;
    out.stars = rec.stars;
  }
  if (rec.stars >= MAX_STARS && rec.shards > 0) {
    s.heroes.universal = (s.heroes.universal || 0) + rec.shards;
    out.converted = rec.shards;
    rec.shards = 0;
  }
  out.stars = rec.stars;
  return out;
}

export function spendUniversal(s, id, n) {
  ensureHeroes(s);
  n = Math.max(0, Math.min(n | 0, s.heroes.universal || 0));
  if (!n) return { ok: false, reason: 'No universal shards' };
  if (!HEROES[id] || id === 'rook' && !s.heroes.owned.rook) return { ok: false, reason: 'Pick an operator' };
  s.heroes.universal -= n;
  const r = addShards(s, id, n);
  r.ok = true;
  r.universalSpent = n;
  return r;
}

export function setPin(s, id) {
  ensureHeroes(s);
  if (id && !HEROES[id]) return { ok: false, reason: 'Unknown operator' };
  if (id === 'rook') return { ok: false, reason: 'Rook is already yours. Pin someone you are collecting.' };
  s.heroes.pin = id || null;
  return { ok: true, pin: s.heroes.pin };
}

export function formatDrop(r) {
  if (!r) return '';
  const bits = [`${r.added} ${r.name} shard${r.added === 1 ? '' : 's'}`];
  if (r.unlocked) bits.push(`${r.name} unlocked`);
  if (r.stars > 1 && r.unlocked === false) bits.push(`${r.name} is ${r.stars}★`);
  if (r.converted) bits.push(`${r.converted} converted to universal shards`);
  return bits.join(' — ');
}

export function rollClearDrop(s, now = Date.now()) {
  ensureHeroes(s);
  // Bushes and junk: a decent chance at a small lead, better when a target is pinned.
  const chance = s.heroes.pin ? 0.48 : 0.34;
  if (rngNext(s) >= chance) return null;
  const id = pickHero(s, now, { excludeMaxed: true });
  const n = rngInt(s, 1, 2);
  return addShards(s, id, n);
}

export function rollMissionDrop(s, first, now = Date.now()) {
  ensureHeroes(s);
  const n = first ? rngInt(s, 4, 8) : rngInt(s, 1, 3);
  const id = pickHero(s, now, { excludeMaxed: true });
  return addShards(s, id, n);
}

function rollCrateInner(s, kind, now) {
  const c = CRATES[kind];
  const r = rngNext(s);
  if (kind === 'street') {
    if (r < 0.05) return { typ: 'universal', n: rngInt(s, 5, 8) };
    if (r < 0.13) return { typ: 'shards', n: rngInt(s, 15, 20) };
    if (r < 0.38) return { typ: 'shards', n: rngInt(s, 8, 12) };
    return { typ: 'shards', n: rngInt(s, 3, 5) };
  }
  // vault
  if (r < 0.07) return { typ: 'universal', n: rngInt(s, 12, 18) };
  if (r < 0.15) return { typ: 'unlock', n: SHARDS_TO_UNLOCK };
  if (r < 0.40) return { typ: 'shards', n: rngInt(s, 20, 30) };
  return { typ: 'shards', n: rngInt(s, 10, 14) };
}

export function openCrate(s, kind, now = Date.now()) {
  ensureHeroes(s);
  const c = CRATES[kind];
  if (!c) return { ok: false, reason: 'Unknown crate' };
  if ((s.teeth || 0) < c.cost) return { ok: false, reason: `Need ${c.cost} Ice` };
  s.teeth -= c.cost;
  const pityKey = kind === 'vault' ? 'vaultPity' : 'cratePity';
  s.heroes[pityKey] = (s.heroes[pityKey] || 0) + 1;
  s.heroes.cratesOpened = (s.heroes.cratesOpened || 0) + 1;
  let drop;
  const pityHit = s.heroes[pityKey] >= c.pityEvery;
  if (pityHit) {
    s.heroes[pityKey] = 0;
    const target = s.heroes.pin || featuredHero(now);
    const n = kind === 'vault' ? 15 : 10;
    const r = addShards(s, target, n);
    r.ok = true; r.pity = true; r.kind = kind;
    return r;
  }
  drop = rollCrateInner(s, kind, now);
  if (drop.typ === 'universal') {
    s.heroes.universal = (s.heroes.universal || 0) + drop.n;
    return { ok: true, kind, id: null, name: 'Universal', added: drop.n, universal: drop.n };
  }
  let id = pickHero(s, now, { excludeMaxed: true });
  if (drop.typ === 'unlock') {
    const locked = collectable(s).filter((h) => !s.heroes.owned[h]);
    if (locked.length) id = rngWeighted(s, locked.map((h) => [h, weightFor(s, h, now)]));
  }
  const r = addShards(s, id, drop.n);
  r.ok = true; r.kind = kind;
  return r;
}

export function pityOf(s, kind = 'street') {
  ensureHeroes(s);
  const c = CRATES[kind];
  const key = kind === 'vault' ? 'vaultPity' : 'cratePity';
  return { have: s.heroes[key] || 0, need: c.pityEvery };
}

export function tutorialShardGift(s, now = Date.now()) {
  // A story lead after the lesson — not a full unlock.
  return addShards(s, 'pip', 5);
}
