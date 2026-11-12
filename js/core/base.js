// Base-building rules: the wasteland map, obstacles, placing/moving buildings, builders and timers,
// production into tills, storage caps. Pure functions over the JSON state; `now` is always injected.
import { MAP_N, BUILDINGS, OBSTACLES, lvCap, costOf, timeOf, rateOf, tillOf, storeOf, housingOf } from './buildings.js';
import { DISTRICTS } from './data.js';
import { rngNext, rngInt, rngPick } from './rng.js';
const RES_LABEL = { cash: 'Cash', influence: 'Rep', teeth: 'Ice' };

const N = MAP_N;
export const DEN_POS = { x: 18, y: 18 };

// ---------------------------------------------------------------- map generation
// Ground is regenerated from the seed (not saved). 0 dirt, 1 dead grass, 2 asphalt/concrete.
export function groundMap(seed) {
  const h = { rng: (seed ^ 0x5bd1e995) >>> 0 };
  const g = new Uint8Array(N * N);
  // coarse value noise for grass patches
  const C = 6, cells = Math.ceil(N / C) + 2;
  const v = Array.from({ length: cells * cells }, () => rngNext(h));
  const at = (cx, cy) => v[cy * cells + cx];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const fx = x / C, fy = y / C, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const n = at(ix, iy) * (1 - tx) * (1 - ty) + at(ix + 1, iy) * tx * (1 - ty) + at(ix, iy + 1) * (1 - tx) * ty + at(ix + 1, iy + 1) * tx * ty;
    g[y * N + x] = n + (rngNext(h) - 0.5) * 0.18 > 0.52 ? 1 : 0;
  }
  const roads = roadsFor(seed);
  for (const r of roads) for (const [x, y] of r.cells) g[y * N + x] = 2;
  for (const lot of lotsFor(seed)) for (let y = lot.y; y < lot.y + lot.h; y++) for (let x = lot.x; x < lot.x + lot.w; x++) if (inMap(x, y) && rngNext(h) > 0.12) g[y * N + x] = 2;
  return g;
}
export const inMap = (x, y) => x >= 0 && y >= 0 && x < N && y < N;

export function roadsFor(seed) {
  const h = { rng: (seed ^ 0x27d4eb2d) >>> 0 };
  const out = [];
  // one road running along x, one along y, both slightly off-centre, with broken stretches
  const ry = rngInt(h, 9, 13), rx = rngInt(h, 25, 29);
  const a = { cells: [] }, b = { cells: [] };
  for (let x = 0; x < N; x++) for (let k = 0; k < 2; k++) if (rngNext(h) > 0.06) a.cells.push([x, ry + k]);
  for (let y = 0; y < N; y++) for (let k = 0; k < 2; k++) if (rngNext(h) > 0.06) b.cells.push([rx + k, y]);
  // a short dead-end lane
  const ly = rngInt(h, 27, 31);
  const c = { cells: [] };
  for (let x = 3; x < rx; x++) if (rngNext(h) > 0.15) c.cells.push([x, ly]);
  out.push(a, b, c);
  return out;
}
export function lotsFor(seed) {
  const h = { rng: (seed ^ 0x165667b1) >>> 0 };
  return Array.from({ length: 4 }, () => ({ x: rngInt(h, 2, N - 9), y: rngInt(h, 2, N - 9), w: rngInt(h, 4, 7), h: rngInt(h, 3, 6) }));
}
export function decalsFor(seed) {
  // puddles and oil stains: purely visual
  const h = { rng: (seed ^ 0x85ebca6b) >>> 0 };
  return Array.from({ length: 34 }, () => ({ x: rngNext(h) * N, y: rngNext(h) * N, r: 0.35 + rngNext(h) * 0.9, k: rngNext(h) < 0.75 ? 'puddle' : 'stain' }));
}

export function newBase(seed) {
  const base = { seed: seed >>> 0, nextId: 1, buildings: [], obstacles: [], builders: 1, spawnAt: 0 };
  const den = { id: 'b' + base.nextId++, t: 'den', x: DEN_POS.x, y: DEN_POS.y, lv: 1, till: 0, job: null, lt: false };
  base.buildings.push(den);
  const h = { rng: (seed ^ 0x9e3779b9) >>> 0 };
  const occ = occupancy(base);
  const roadSet = new Set(roadsFor(seed).flatMap((r) => r.cells.map(([x, y]) => y * N + x)));
  const nearDen = (x, y, s, d) => x + s > DEN_POS.x - d && x < DEN_POS.x + 3 + d && y + s > DEN_POS.y - d && y < DEN_POS.y + 3 + d;
  const tryPlace = (t, opts = {}) => {
    const s = OBSTACLES[t].size;
    for (let a = 0; a < 60; a++) {
      const x = opts.x != null ? opts.x + rngInt(h, -opts.r, opts.r) : rngInt(h, 0, N - s);
      const y = opts.y != null ? opts.y + rngInt(h, -opts.r, opts.r) : rngInt(h, 0, N - s);
      if (!inMap(x, y) || !inMap(x + s - 1, y + s - 1)) continue;
      if (!opts.allowNear && nearDen(x, y, s, opts.clear ?? 4)) continue;
      if (opts.road != null) { const onRoad = roadSet.has(y * N + x); if (opts.road !== onRoad && rngNext(h) < 0.85) continue; }
      if (!areaFree(occ, x, y, s)) continue;
      const o = { id: 'o' + base.nextId++, t, x, y, clr: null };
      base.obstacles.push(o);
      mark(occ, x, y, s, o.id);
      return o;
    }
    return null;
  };
  for (let i = 0; i < 5; i++) tryPlace('ruin3', { clear: 7 });
  for (let i = 0; i < 9; i++) tryPlace('ruin2', { clear: 6 });
  for (let i = 0; i < 10; i++) tryPlace('wreck', { road: true, clear: 5 });
  // tree clusters, mostly towards the edges
  for (let c = 0; c < 6; c++) {
    const edge = rngInt(h, 0, 3);
    const cx = edge === 0 ? rngInt(h, 1, 7) : edge === 1 ? rngInt(h, N - 8, N - 2) : rngInt(h, 2, N - 3);
    const cy = edge === 2 ? rngInt(h, 1, 7) : edge === 3 ? rngInt(h, N - 8, N - 2) : rngInt(h, 2, N - 3);
    for (let i = 0; i < 5; i++) tryPlace(rngNext(h) < 0.4 ? 'tree' : 'deadtree', { x: cx, y: cy, r: 4 });
  }
  for (let i = 0; i < 6; i++) tryPlace(rngNext(h) < 0.35 ? 'tree' : 'deadtree');
  for (let i = 0; i < 34; i++) tryPlace('bush');
  for (let i = 0; i < 36; i++) tryPlace('rubble');
  for (let i = 0; i < 24; i++) tryPlace('scrap');
  for (let i = 0; i < 18; i++) tryPlace('tyres', { road: rngNext(h) < 0.5 });
  // a little junk right by the shack, so clearing is the first thing you learn
  for (const t of ['bush', 'scrap', 'rubble', 'tyres']) tryPlace(t, { x: DEN_POS.x + 1, y: DEN_POS.y + 1, r: 4, allowNear: true });
  return base;
}

// ---------------------------------------------------------------- occupancy
export function occupancy(base, ignoreId) {
  const occ = new Array(N * N).fill(null);
  for (const b of base.buildings) if (b.id !== ignoreId) mark(occ, b.x, b.y, BUILDINGS[b.t].size, b.id);
  for (const o of base.obstacles) if (o.id !== ignoreId) mark(occ, o.x, o.y, OBSTACLES[o.t].size, o.id);
  return occ;
}
function mark(occ, x, y, s, id) { for (let j = y; j < y + s; j++) for (let i = x; i < x + s; i++) if (inMap(i, j)) occ[j * N + i] = id; }
function areaFree(occ, x, y, s) {
  for (let j = y; j < y + s; j++) for (let i = x; i < x + s; i++) if (!inMap(i, j) || occ[j * N + i]) return false;
  return true;
}
export function canPlace(base, type, x, y, ignoreId) {
  return areaFree(occupancy(base, ignoreId), x, y, BUILDINGS[type].size);
}
export function findFreeSpot(base, type, nearX = DEN_POS.x, nearY = DEN_POS.y) {
  const s = BUILDINGS[type].size, occ = occupancy(base);
  for (let r = 0; r < N; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = nearX + dx, y = nearY + dy;
      if (areaFree(occ, x, y, s)) return { x, y };
    }
  }
  return null;
}
export const itemAt = (base, x, y) => {
  for (const b of base.buildings) { const s = BUILDINGS[b.t].size; if (x >= b.x && x < b.x + s && y >= b.y && y < b.y + s) return { kind: 'building', item: b }; }
  for (const o of base.obstacles) { const s = OBSTACLES[o.t].size; if (x >= o.x && x < o.x + s && y >= o.y && y < o.y + s) return { kind: 'obstacle', item: o }; }
  return null;
};

// ---------------------------------------------------------------- queries
export const den = (state) => state.base.buildings.find((b) => b.t === 'den');
export const denLevel = (state) => den(state)?.lv || 1;
export const byId = (state, id) => state.base.buildings.find((b) => b.id === id) || state.base.obstacles.find((o) => o.id === id);
export const countOf = (state, type) => state.base.buildings.filter((b) => b.t === type).length;
export const maxCount = (state, type) => BUILDINGS[type].counts[denLevel(state)] || 0;
export const builtLevel = (b) => b.lv; // level currently in effect (0 while first being built)

export function unlockInfo(state, type) {
  const d = BUILDINGS[type];
  const dl = denLevel(state);
  if (dl < d.unlock) return { ok: false, reason: `Needs The Den level ${d.unlock}` };
  if (d.req && state.districts[d.req]?.owner !== 'player') {
    const dist = DISTRICTS.find((x) => x.id === d.req);
    return { ok: false, reason: `Take ${dist.name} in the City` };
  }
  if (countOf(state, type) >= maxCount(state, type)) {
    const next = d.counts.findIndex((c, i) => i > dl && c > maxCount(state, type));
    return { ok: false, reason: next > 0 ? `Max built. More at Den level ${next}` : 'Max built' };
  }
  return { ok: true };
}

export function buildersBusy(state) {
  return state.base.buildings.filter((b) => b.job).length + state.base.obstacles.filter((o) => o.clr).length;
}
export const buildersFree = (state) => state.base.builders - buildersBusy(state);

export function caps(state) {
  const c = { cash: 0, influence: 0 };
  for (const b of state.base.buildings) {
    c.cash += storeOf(b.t, b.lv, 'cash');
    c.influence += storeOf(b.t, b.lv, 'influence');
  }
  return c;
}
export function housing(state) {
  return state.base.buildings.reduce((s, b) => s + housingOf(b.t, b.lv), 0);
}
export function trainingYards(state) {
  return state.base.buildings.filter((b) => b.t === 'gym' && b.lv > 0);
}
export function armouryLevel(state) {
  return state.base.buildings.filter((b) => b.t === 'armoury').reduce((m, b) => Math.max(m, b.lv), 0);
}

// ---------------------------------------------------------------- resources
export function spend(state, res, amount) {
  if ((state[res] || 0) < amount) return false;
  state[res] -= amount;
  return true;
}
// add resources respecting storage caps; returns what actually went in
export function gain(state, res, amount) {
  if (amount <= 0) return 0;
  if (res === 'teeth') { state.teeth += amount; return amount; }
  const cap = caps(state)[res];
  const room = Math.max(0, cap - state[res]);
  const v = Math.min(room, amount);
  state[res] += v;
  if (res === 'cash') { state.lifetime += v; state.runEarnings = (state.runEarnings || 0) + v; }
  return v;
}

// ---------------------------------------------------------------- actions
export function startBuild(state, type, x, y, now) {
  const d = BUILDINGS[type];
  if (!d || type === 'den') return { ok: false, reason: 'Not buildable' };
  const u = unlockInfo(state, type);
  if (!u.ok) return { ok: false, reason: u.reason };
  if (!canPlace(state.base, type, x, y)) return { ok: false, reason: 'Something is in the way' };
  const t = timeOf(type, 1);
  if (t > 0 && buildersFree(state) < 1) return { ok: false, reason: 'All builders are busy' };
  const cost = costOf(type, 1);
  if (!spend(state, d.res, cost)) return { ok: false, reason: `Not enough ${RES_LABEL[d.res] || d.res}` };
  const b = { id: 'b' + state.base.nextId++, t: type, x, y, lv: 0, till: 0, job: null, lt: false };
  if (t > 0) b.job = { kind: 'build', toLv: 1, endsAt: now + t * 1000, total: t };
  else b.lv = 1;
  state.base.buildings.push(b);
  state.stats.builds = (state.stats.builds || 0) + 1;
  return { ok: true, b, cost };
}

export function upgradeInfo(state, b) {
  const d = BUILDINGS[b.t];
  const to = b.lv + 1;
  const cap = lvCap(b.t, denLevel(state));
  if (b.job) return { ok: false, reason: 'Already working on it' };
  if (b.lv >= d.maxLv) return { ok: false, reason: 'Max level', max: true };
  if (b.lv >= cap) return { ok: false, reason: b.t === 'den' ? 'Max level' : `Upgrade The Den to go past level ${cap}`, capped: true };
  return { ok: true, to, cost: costOf(b.t, to), res: d.res, time: timeOf(b.t, to) };
}

export function startUpgrade(state, id, now) {
  const b = state.base.buildings.find((x) => x.id === id);
  if (!b) return { ok: false, reason: 'Gone' };
  const u = upgradeInfo(state, b);
  if (!u.ok) return u;
  if (u.time > 0 && buildersFree(state) < 1) return { ok: false, reason: 'All builders are busy' };
  if (!spend(state, u.res, u.cost)) return { ok: false, reason: `Not enough ${RES_LABEL[u.res] || u.res}` };
  if (u.time > 0) b.job = { kind: 'upgrade', toLv: u.to, endsAt: now + u.time * 1000, total: u.time };
  else b.lv = u.to;
  state.stats.upgrades = (state.stats.upgrades || 0) + 1;
  return { ok: true, cost: u.cost };
}

export function moveBuilding(state, id, x, y) {
  const b = state.base.buildings.find((v) => v.id === id);
  if (!b) return { ok: false };
  if (!canPlace(state.base, b.t, x, y, id)) return { ok: false, reason: 'Something is in the way' };
  b.x = x; b.y = y;
  return { ok: true };
}

let clearLoot = null;
export function setClearLoot(fn) { clearLoot = fn; }

export function startClear(state, id, now) {
  const o = state.base.obstacles.find((v) => v.id === id);
  if (!o || o.clr) return { ok: false, reason: 'Already clearing' };
  if (buildersFree(state) < 1) return { ok: false, reason: 'All builders are busy' };
  const d = OBSTACLES[o.t];
  if (!spend(state, 'cash', d.cost)) return { ok: false, reason: 'Not enough Cash' };
  o.clr = { endsAt: now + d.time * 1000, total: d.time };
  return { ok: true, cost: d.cost };
}

export const jobOf = (it) => it.job || it.clr || null;
export function speedUpCost(it, now) {
  const j = jobOf(it);
  if (!j) return 0;
  const left = Math.max(0, (j.endsAt - now) / 1000);
  return left <= 0 ? 0 : Math.max(1, Math.ceil(left / 90));
}
export function speedUp(state, id, now) {
  const it = byId(state, id);
  const j = it && jobOf(it);
  if (!j) return { ok: false };
  const c = speedUpCost(it, now);
  if (state.teeth < c) return { ok: false, reason: 'Not enough Ice' };
  state.teeth -= c;
  j.endsAt = now;
  const ev = finishTimers(state, now);
  return { ok: true, cost: c, ev };
}

// Complete any finished jobs. Returns events for the UI.
export function finishTimers(state, now) {
  const ev = [];
  for (const b of state.base.buildings) {
    if (b.job && b.job.endsAt <= now) {
      b.lv = b.job.toLv;
      ev.push({ type: b.job.kind === 'build' ? 'built' : 'upgraded', id: b.id, t: b.t, lv: b.lv });
      b.job = null;
    }
  }
  const keep = [];
  for (const o of state.base.obstacles) {
    if (o.clr && o.clr.endsAt <= now) {
      const d = OBSTACLES[o.t];
      let teeth = 0;
      if (rngNext(state) < d.teeth[0]) teeth = rngInt(state, d.teeth[1], d.teeth[2]);
      state.teeth += teeth;
      state.stats.cleared = (state.stats.cleared || 0) + 1;
      const shards = clearLoot ? clearLoot(state) : null;
      ev.push({ type: 'cleared', id: o.id, t: o.t, x: o.x, y: o.y, teeth, shards });
    } else keep.push(o);
  }
  state.base.obstacles = keep;
  return ev;
}

// The wasteland slowly takes land back: a weed or junk pile appears every few hours (up to a cap).
export function maybeSpawnObstacle(state, now) {
  const base = state.base;
  if (!base.spawnAt) { base.spawnAt = now + 4 * 3600 * 1000; return null; }
  if (now < base.spawnAt) return null;
  base.spawnAt = now + 4 * 3600 * 1000;
  if (base.obstacles.length >= 260) return null;
  const t = rngPick(state, ['bush', 'bush', 'rubble', 'scrap', 'tyres', 'deadtree']);
  const occ = occupancy(base);
  for (let a = 0; a < 40; a++) {
    const x = rngInt(state, 0, N - 1), y = rngInt(state, 0, N - 1);
    if (areaFree(occ, x, y, 1)) { const o = { id: 'o' + base.nextId++, t, x, y, clr: null }; base.obstacles.push(o); return o; }
  }
  return null;
}

// ---------------------------------------------------------------- production
export const producers = (state) => state.base.buildings.filter((b) => BUILDINGS[b.t].produce && b.lv > 0);
export const isAutoCollect = (state, b, now) => b.lt || state.vipUntil > now;

export function globalMult(state, now) {
  let m = (1 + 0.02 * (state.cred || 0)) * (1 + districtBonus(state));
  if (state.boosts.adIncomeUntil > now) m *= 2;
  return m;
}
export function districtBonus(state) {
  return DISTRICTS.reduce((s, d) => s + (state.districts[d.id]?.owner === 'player' ? d.bonus : 0), 0);
}
export function rate(state, b, now) {
  const p = BUILDINGS[b.t].produce;
  if (!p) return 0;
  return rateOf(b.t, b.lv) * (p.res === 'cash' ? globalMult(state, now) : 1 + districtBonus(state) / 2);
}
export const tillCap = (state, b, now) => tillOf(b.t, b.lv) * (BUILDINGS[b.t].produce.res === 'cash' ? globalMult(state, now) : 1);
export function incomePerSec(state, res, now) {
  return producers(state).filter((b) => BUILDINGS[b.t].produce.res === res).reduce((s, b) => s + rate(state, b, now), 0);
}

// Advance production by dt seconds.
export function produce(state, dt, now) {
  const banked = { cash: 0, influence: 0 };
  for (const b of producers(state)) {
    const res = BUILDINGS[b.t].produce.res;
    const add = rate(state, b, now) * dt;
    if (isAutoCollect(state, b, now)) {
      // the lieutenant banks as it comes in; whatever won't fit in storage waits in the till
      const v = gain(state, res, b.till + add);
      b.till = Math.min(b.till + add - v, tillCap(state, b, now));
      banked[res] += v;
    } else {
      b.till = Math.min(b.till + add, tillCap(state, b, now));
    }
  }
  return banked;
}

export function collect(state, id) {
  const b = state.base.buildings.find((x) => x.id === id);
  if (!b || !BUILDINGS[b.t].produce || b.till < 0.5) return { ok: false, amount: 0 };
  const res = BUILDINGS[b.t].produce.res;
  const v = gain(state, res, b.till);
  b.till -= v;
  if (v > 0) state.stats.collects++;
  return { ok: v > 0, amount: v, res, full: v <= 0 };
}
export function collectAll(state) {
  const tot = { cash: 0, influence: 0 };
  for (const b of producers(state)) { const r = collect(state, b.id); if (r.ok) tot[r.res] += r.amount; }
  return tot;
}

export const lieutenantCost = (b) => Math.round((BUILDINGS[b.t].cost0 || 100) * 8);
export function hireLieutenant(state, id) {
  const b = state.base.buildings.find((x) => x.id === id);
  if (!b || !BUILDINGS[b.t].produce || b.lt || b.lv < 1) return { ok: false };
  if (!spend(state, 'cash', lieutenantCost(b))) return { ok: false, reason: 'Not enough Cash' };
  b.lt = true;
  return { ok: true };
}

// ---------------------------------------------------------------- builders (premium)
export const BUILDER_TEETH = [0, 0, 250, 500, 1000, 2000];
export const MAX_BUILDERS = 5;
export function buyBuilder(state) {
  const n = state.base.builders;
  if (n >= MAX_BUILDERS) return { ok: false, reason: 'All builders hired' };
  const c = BUILDER_TEETH[n + 1];
  if (state.teeth < c) return { ok: false, reason: 'Not enough Ice' };
  state.teeth -= c;
  state.base.builders++;
  return { ok: true, cost: c };
}
