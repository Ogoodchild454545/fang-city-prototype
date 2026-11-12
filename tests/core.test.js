import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newGame, serialize, deserialize, migrate } from '../js/core/state.js';
import * as E from '../js/core/economy.js';
import * as C from '../js/core/crew.js';
import * as M from '../js/core/meta.js';
import * as B from '../js/core/battle.js';
import * as BS from '../js/core/base.js';
import { BUILDINGS, OBSTACLES, MAP_N, costOf, storeOf, lvCap, timeOf } from '../js/core/buildings.js';
import { generateRivalBase, baseToRaidLayout, playerBaseLayout, RAID_W, RAID_H } from '../js/core/raid.js';
import { aiNextActionFor } from '../js/core/ai.js';
import { DISTRICTS } from '../js/core/data.js';

let pass = 0;
const test = (name, fn) => { try { fn(); pass++; console.log('ok  ', name); } catch (e) { console.error('FAIL', name, '\n', e); process.exitCode = 1; } };
const T0 = Date.UTC(2026, 10, 11, 12, 0, 0);
const rich = (s) => { s.base.buildings[0].lv = 6; s.cash = 1e6; s.influence = 1e4; s.teeth = 1e5; };
const place = (s, t, now = T0) => { const p = BS.findFreeSpot(s.base, t); return BS.startBuild(s, t, p.x, p.y, now); };
function autoplay(b, maxSteps = 4000) {
  let steps = 0;
  while (b.status === 'active' && steps++ < maxSteps) { const r = B.applyAction(b, aiNextActionFor(b, b.side) || { type: 'end' }); if (!r.ok) B.applyAction(b, { type: 'end' }); }
  return b;
}

test('new game: JSON round-trip, wasteland map with a shack and junk', () => {
  const s = newGame(T0, 'grey', 123);
  assert.deepEqual(deserialize(serialize(s), T0), s);
  assert.equal(s.base.buildings.length, 1);
  assert.equal(s.base.buildings[0].t, 'den');
  assert.ok(s.base.obstacles.length > 150, 'plenty of junk to clear');
  const occ = BS.occupancy(s.base); // throws/overlaps would show as missing ids
  let cells = 0; for (const it of [...s.base.buildings, ...s.base.obstacles]) { const sz = (BUILDINGS[it.t] || OBSTACLES[it.t]).size; cells += sz * sz; assert.ok(it.x >= 0 && it.y >= 0 && it.x + sz <= MAP_N && it.y + sz <= MAP_N); }
  assert.equal(occ.filter(Boolean).length, cells, 'no overlapping items');
  assert.ok(BS.findFreeSpot(s.base, 'stall'), 'room to build near the shack');
});

test('placement, builders, timers, moving', () => {
  const s = newGame(T0, 'grey', 1);
  const d = BS.den(s);
  assert.equal(BS.canPlace(s.base, 'stall', d.x, d.y), false);
  const r = place(s, 'stall');
  assert.ok(r.ok && s.cash === 500 - 60);
  assert.equal(BS.buildersFree(s), 0);
  const r2 = place(s, 'carwash');
  assert.equal(r2.ok, false, 'one builder = one job');
  assert.equal(BS.finishTimers(s, T0 + 1000).length, 0);
  const ev = BS.finishTimers(s, T0 + 5000);
  assert.equal(ev[0].type, 'built'); assert.equal(r.b.lv, 1);
  assert.ok(place(s, 'carwash', T0 + 5000).ok);
  const spot = BS.findFreeSpot(s.base, 'stall', 5, 5);
  assert.ok(BS.moveBuilding(s, r.b.id, spot.x, spot.y).ok);
  assert.equal(BS.moveBuilding(s, r.b.id, d.x, d.y).ok, false);
});

test('The Den gates buildings, counts and max levels', () => {
  const s = newGame(T0, 'grey', 1);
  s.cash = 1e6; s.influence = 1e4;
  assert.equal(BS.unlockInfo(s, 'phone').ok, false);
  assert.equal(BS.unlockInfo(s, 'sniper').ok, false);
  const st = place(s, 'stall').b; BS.finishTimers(s, T0 + 1e7);
  assert.equal(BS.unlockInfo(s, 'stall').ok, false, 'only 1 stall at Den 1');
  st.lv = 2;
  assert.equal(BS.upgradeInfo(s, st).ok, false, 'Den 1 caps buildings at level 2');
  BS.den(s).lv = 2;
  assert.ok(BS.unlockInfo(s, 'phone').ok && BS.unlockInfo(s, 'sniper').ok);
  assert.ok(BS.upgradeInfo(s, st).ok);
  BS.den(s).lv = 3;
  assert.equal(BS.unlockInfo(s, 'pawn').ok, false, 'pawn needs Rail Yards turf');
  s.districts.rail.owner = 'player';
  assert.ok(BS.unlockInfo(s, 'pawn').ok);
});

test('every upgrade fits under the best storage you can have at that Den level', () => {
  for (let L = 1; L <= 6; L++) {
    const cap = { cash: storeOf('den', L, 'cash') + (BUILDINGS.strongbox.counts[L] || 0) * storeOf('strongbox', lvCap('strongbox', L), 'cash'),
      influence: storeOf('den', L, 'influence') + (BUILDINGS.ledger.counts[L] || 0) * storeOf('ledger', lvCap('ledger', L), 'influence') };
    if (L < 6) assert.ok(BUILDINGS.den.costs[L + 1] <= cap.cash, `Den ${L + 1} too expensive`);
    for (const [t, d] of Object.entries(BUILDINGS)) {
      if (t === 'den' || !(d.counts[L] > 0)) continue;
      for (let lv = 1; lv <= lvCap(t, L); lv++) assert.ok(costOf(t, lv) <= cap[d.res], `${t} L${lv} at Den ${L}: ${costOf(t, lv)} > ${cap[d.res]}`);
    }
  }
});

test('production fills tills, collecting respects storage caps', () => {
  const s = newGame(T0, 'grey', 1);
  const st = place(s, 'stall').b; BS.finishTimers(s, T0 + 1e7);
  E.tick(s, 10, T0);
  assert.ok(Math.abs(st.till - 6) < 1e-6);
  E.tick(s, 1e6, T0);
  assert.equal(st.till, BS.tillCap(s, st, T0));
  s.cash = BS.caps(s).cash - 100;
  const r = BS.collect(s, st.id);
  assert.equal(Math.round(r.amount), 100);
  assert.equal(s.cash, BS.caps(s).cash);
  assert.equal(BS.collect(s, st.id).ok, false);
  const before = BS.caps(s).cash;
  BS.den(s).lv = 2; place(s, 'strongbox'); BS.finishTimers(s, T0 + 1e7);
  assert.ok(BS.caps(s).cash > before);
});

test('clearing junk costs cash and time, can drop gold teeth', () => {
  const s = newGame(T0, 'grey', 4);
  s.cash = 1e5; BS.den(s).lv = 6; s.base.builders = 5;
  const n0 = s.base.obstacles.length, t0 = s.teeth;
  const ids = s.base.obstacles.filter((o) => o.t === 'ruin3' || o.t === 'wreck').slice(0, 5).map((o) => o.id);
  for (const id of ids) assert.ok(BS.startClear(s, id, T0).ok);
  assert.equal(BS.startClear(s, s.base.obstacles.find((o) => !o.clr).id, T0).ok, false, 'no free builder');
  const ev = BS.finishTimers(s, T0 + 3600e3);
  assert.equal(ev.length, 5); assert.equal(s.base.obstacles.length, n0 - 5);
  assert.equal(s.stats.cleared, 5);
  assert.ok(s.teeth >= t0, 'teeth never lost');
  assert.ok(ev.some((e) => e.teeth > 0), 'big ruins usually hide teeth');
});

test('speed-ups cost teeth by time left; extra builders cost teeth', () => {
  const s = newGame(T0, 'grey', 1);
  s.cash = 1e6; BS.den(s).lv = 2; s.teeth = 5000;
  const r = BS.startUpgrade(s, BS.den(s).id, T0);
  assert.ok(r.ok);
  const c = BS.speedUpCost(BS.den(s), T0);
  assert.equal(c, Math.ceil(timeOf('den', 3) / 90));
  const t = s.teeth;
  assert.ok(BS.speedUp(s, BS.den(s).id, T0).ok);
  assert.equal(s.teeth, t - c); assert.equal(BS.denLevel(s), 3);
  for (let i = 2; i <= 5; i++) assert.ok(BS.buyBuilder(s).ok);
  assert.equal(s.base.builders, 5); assert.equal(BS.buyBuilder(s).ok, false);
  assert.equal(s.teeth, t - c - 250 - 500 - 1000 - 2000);
});

test('offline: lieutenants bank, tills fill, builds finish, capped at 8h', () => {
  const s = newGame(T0, 'grey', 1);
  s.cash = 1e5;
  const st = place(s, 'stall').b; BS.finishTimers(s, T0 + 1e4);
  s.cash = 1000;
  assert.ok(BS.hireLieutenant(s, st.id).ok);
  const cw = place(s, 'carwash', T0 + 1e4).b;
  s.cash = 0; s.lastTick = T0;
  const sum = E.applyOffline(s, T0 + 24 * 3600e3);
  assert.ok(sum);
  assert.equal(sum.cappedSeconds, 8 * 3600);
  assert.equal(sum.finished, 1); assert.equal(cw.lv, 1);
  assert.equal(s.cash, BS.caps(s).cash, 'lieutenant banked up to the cap');
});

test('crew: training needs a Training Yard, housing caps the roster, armoury gates gear', () => {
  const s = newGame(T0, 'grey', 7);
  s.cash = 1e6; s.influence = 1e4; s.teeth = 1e5;
  const m = s.crew[0];
  assert.equal(C.startTraining(s, m.id, T0).reason, 'yard');
  assert.equal(C.buyGear(s, 'leather').reason, 'armoury');
  assert.equal(C.rosterCap(s), BS.housing(s));
  while (s.crew.length < C.rosterCap(s)) assert.ok(C.recruit(s, 'premium').ok);
  assert.equal(C.recruit(s, 'premium').reason, 'roster');
  place(s, 'gym'); BS.finishTimers(s, T0 + 1e7);
  assert.ok(C.startTraining(s, m.id, T0).ok);
  assert.equal(C.startTraining(s, s.crew[1].id, T0).reason, 'bench');
  BS.den(s).lv = 2; s.base.builders = 3; assert.ok(place(s, 'armoury').ok); assert.ok(place(s, 'bunk').ok); BS.finishTimers(s, T0 + 1e8);
  assert.ok(C.buyGear(s, 'leather').ok);
  assert.ok(C.rosterCap(s) > 3);
  C.finishTraining(s, T0 + 1e9);
  assert.ok(m.level >= 2);
});

test('pity guarantees a legendary within 30 premium recruits', () => {
  const s = newGame(T0, 'grey', 99);
  s.teeth = 1e6; s.rosterBonus = 100;
  let got = false;
  for (let i = 0; i < 30; i++) if (C.recruit(s, 'premium').member.rarity === 'legendary') got = true;
  assert.ok(got);
});

test('daily reward streak and jobs', () => {
  const s = newGame(T0, 'grey', 1);
  assert.ok(M.claimDaily(s, T0).ok);
  assert.equal(M.claimDaily(s, T0 + 1000).ok, false);
  assert.ok(M.claimDaily(s, T0 + 86400000).ok);
  assert.equal(s.daily.streak, 2);
  M.ensureJobs(s, T0);
  assert.equal(s.jobs.list.length, 3);
  const j = s.jobs.list[0], p = M.jobProgress(s, j);
  s.stats[p.t.stat] = (s.stats[p.t.stat] || 0) + p.t.goal;
  assert.ok(M.claimJob(s, j.id).ok);
});

test('turf battle: landscape grid, validated actions, deterministic replay', () => {
  const s = newGame(T0, 'grey', 5);
  assert.ok(M.startDistrictBattle(s, 'rail', T0).ok);
  const b = s.battle;
  assert.equal(b.w, B.W); assert.equal(b.h, B.H); assert.ok(b.w > b.h, 'wide board for landscape');
  const copy = JSON.parse(JSON.stringify(b));
  assert.equal(B.applyAction(b, { type: 'move', uid: 'e0', x: 3, y: 3 }).ok, false);
  autoplay(b); autoplay(copy);
  assert.equal(b.result, copy.result);
  assert.deepEqual(b.units.map((x) => x.hp), copy.units.map((x) => x.hp));
  assert.ok(M.resolveBattle(s, T0) && s.battle === null);
});

test('rival bases: valid layouts at every Den level, every structure reachable', () => {
  for (let L = 1; L <= 6; L++) for (let k = 0; k < 25; k++) {
    const base = generateRivalBase(1000 * L + k, L);
    assert.ok(base.length >= 4, `Den ${L} seed ${k}: only ${base.length} buildings (fallback layout)`);
    const lay = baseToRaidLayout(base, 0, 0, RAID_W, RAID_H, { cash: 1000, influence: 100 });
    assert.ok(lay.reachableAll);
    assert.ok(lay.structures.some((s) => s.t === 'den'));
    const loot = lay.structures.reduce((a, s) => a + (s.loot?.cash || 0), 0);
    assert.ok(Math.abs(loot - 1000) <= lay.structures.length, 'loot split adds up');
  }
});

test('raid: turrets shoot, storages pay out, Den win takes the rest, stars', () => {
  let wins = 0, turretShots = 0, lossLoot = 0;
  for (let k = 0; k < 20; k++) {
    const s = newGame(T0, 'grey', 300 + k);
    BS.den(s).lv = 3;
    for (const m of s.crew) m.level = 6;
    M.refreshRivals(s, T0, true);
    const r = s.rivals[0];
    assert.ok(M.startRaid(s, r.id).ok);
    const b = s.battle;
    assert.ok(b.units.some((u) => u.structure && u.weapon), 'has turrets');
    let steps = 0;
    while (b.status === 'active' && steps++ < 4000) {
      const a = aiNextActionFor(b, b.side) || { type: 'end' };
      const res = B.applyAction(b, a);
      if (!res.ok) B.applyAction(b, { type: 'end' });
      if (res.ok && res.ev.some((e) => e.type === 'attack' && B.unitById(b, e.uid)?.structure)) turretShots++;
    }
    const looted = { ...b.looted };
    const cash0 = s.cash;
    const out = M.resolveBattle(s, T0);
    assert.ok(out.stars >= 0 && out.stars <= 3);
    if (out.win) { wins++; assert.ok(out.stars >= 1); assert.ok(looted.cash > 0); }
    else lossLoot += looted.cash;
    assert.ok(s.cash >= Math.min(BS.caps(s).cash, cash0 + looted.cash) - 1, 'stolen loot is banked even on a loss');
  }
  assert.ok(turretShots > 0, 'turrets fired');
  assert.ok(wins >= 10, `easy raids should mostly win (${wins}/20)`);
});

test('player base converts to a raid layout (groundwork for defence mode)', () => {
  const s = newGame(T0, 'grey', 1);
  rich(s); s.base.builders = 5;
  for (const t of ['strongbox', 'sniper', 'cannon']) place(s, t);
  BS.finishTimers(s, T0 + 1e9);
  const lay = playerBaseLayout(s);
  assert.ok(lay.structures.some((x) => x.t === 'den'));
});

test('v0.1 save migrates: progress kept, rackets refunded, old key gone', () => {
  const v1 = readFileSync(new URL('./fixtures/v1save.json', import.meta.url), 'utf8');
  const store = { 'fangcity.save.v1': v1 };
  const ls = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } };
  const old = JSON.parse(v1);
  const s = migrate(JSON.parse(v1), T0);
  assert.equal(s.v, 2);
  assert.equal(s.crew.length, old.crew.length);
  assert.equal(s.districts.rail.owner, 'player');
  assert.equal(s.teeth, old.teeth + 100);
  assert.equal(s.base.buildings[0].t, 'den');
  assert.equal(s.rackets, undefined);
  return import('../js/core/state.js').then(({ makeLocalStorage }) => {
    const st = makeLocalStorage(ls).load(T0);
    assert.ok(st && st.v === 2 && !store['fangcity.save.v1'] && store['fangcity.save.v2']);
  });
});

test('mock purchases: builder pack, VIP slot, one-time offers', () => {
  const s = newGame(T0, 'grey', 3);
  assert.ok(M.mockPurchase(s, 'offer', 'builder', T0).ok);
  assert.equal(s.base.builders, 2);
  assert.ok(M.mockPurchase(s, 'offer', 'starter', T0).ok);
  assert.equal(M.mockPurchase(s, 'offer', 'starter', T0).ok, false);
  M.mockPurchase(s, 'offer', 'vip', T0);
  assert.ok(E.isVip(s, T0 + 1000));
  assert.equal(E.offlineCapHours(s, T0 + 1000), 12);
});

test('balance (info): AI-vs-AI turf and raid win rates', () => {
  const rows = [];
  for (const d of DISTRICTS.filter((x) => x.tier > 0)) {
    let wins = 0; const N = 40;
    const e = M.districtEnemy(d);
    for (let i = 0; i < N; i++) {
      const s = newGame(T0, 'grey', 1000 + i);
      if (d.tier > 1) { s.crew = M.makeEnemyCrew(500 + i, 'grey', 4, e.level, d.tier - 1).map((m, k) => ({ ...m, id: 'x' + k })); s.squad = s.crew.map((m) => m.id); }
      for (const p of DISTRICTS.filter((x) => x.tier < d.tier)) s.districts[p.id].owner = 'player';
      M.startDistrictBattle(s, d.id, T0); autoplay(s.battle);
      if (s.battle.result === 'win') wins++;
    }
    rows.push(`turf ${d.name}: ${Math.round((wins / N) * 100)}%`);
  }
  for (let L = 1; L <= 6; L++) {
    let wins = 0, stars = 0; const N = 20;
    for (let i = 0; i < N; i++) {
      const s = newGame(T0, 'grey', 2000 + i);
      BS.den(s).lv = L;
      s.crew = M.makeEnemyCrew(700 + i, 'grey', 4, 2 + L * 2, Math.min(5, L - 1)).map((m, k) => ({ ...m, id: 'x' + k })); s.squad = s.crew.map((m) => m.id);
      M.refreshRivals(s, T0, true); M.startRaid(s, s.rivals[1].id); autoplay(s.battle);
      if (s.battle.result === 'win') wins++; stars += B.raidStars(s.battle).stars;
    }
    rows.push(`raid Den ${L}: ${Math.round((wins / N) * 100)}% win, ${(stars / N).toFixed(1)} stars`);
  }
  console.log('     ' + rows.join('\n     '));
});

console.log(`\n${pass} tests passed`);
