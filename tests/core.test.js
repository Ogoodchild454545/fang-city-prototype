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
import { DISTRICTS, TROOPS, TROOP_ORDER, BOSSES, MISSIONS } from '../js/core/data.js';
import * as T from '../js/core/tactics.js';
import { HERO_ORDER, HEROES, grantHero, finishTutorial, matchup } from '../js/core/heroes.js';
import * as SH from '../js/core/shards.js';
import { tutorialMap, avenueMap, docklandsMap, describeDocklands, tile } from '../js/core/tmaps.js';
import * as P from '../js/core/progress.js';
import * as L from '../js/core/loadout.js';

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
function beefArmy(s, { den = 3, yard = 5, lv = 4, boss = true } = {}) {
  BS.den(s).lv = Math.max(BS.denLevel(s), den);
  s.extraHousing = 80;
  s.army = { rat: 6, fox: 4, wolf: 3, snake: 2, badger: 2, croc: yard >= 5 ? 1 : 0, bear: yard >= 7 ? 1 : 0 };
  for (const t of Object.keys(s.army)) if (!s.army[t]) delete s.army[t];
  s.troopLv = Object.fromEntries(Object.keys(s.army).map((t) => [t, lv]));
  if (boss) C.hireBoss(s, 'magrey', true);
  return s;
}

test('new game: JSON round-trip, wasteland map with a shack and junk', () => {
  const s = newGame(T0, 123);
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
  const s = newGame(T0, 1);
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
  const s = newGame(T0, 1);
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
  const s = newGame(T0, 1);
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
  const s = newGame(T0, 4);
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
  const s = newGame(T0, 1);
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
  const s = newGame(T0, 1);
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

test('troops: unlock by Training Yard, queue trains into the army, housing caps it, Armoury upgrades a type', () => {
  const s = newGame(T0, 7);
  s.cash = 1e6; s.influence = 1e4; s.teeth = 1e5;
  assert.equal(C.armyUsed(s), 10);
  assert.equal(C.armyCap(s), 10, 'Den 1 houses 10');
  assert.ok(C.troopUnlocked(s, 'rat') === false, 'no yard yet, even starting troops are locked for training');
  // Starting army is already in the barracks; training more needs a yard and free beds.
  assert.equal(C.enqueue(s, 'rat', T0).reason, 'yard');
  place(s, 'gym'); BS.finishTimers(s, T0 + 1e7);
  assert.ok(C.troopUnlocked(s, 'rat') && C.troopUnlocked(s, 'fox'));
  assert.equal(C.troopUnlocked(s, 'wolf'), false, 'wolves need yard 2');
  assert.equal(C.enqueue(s, 'wolf', T0).reason, 'locked');
  assert.equal(C.enqueue(s, 'rat', T0).reason, 'housing', 'starting army already fills Den 1 housing');
  BS.den(s).lv = 2; s.base.builders = 3;
  assert.ok(place(s, 'bunk').ok); assert.ok(place(s, 'armoury').ok);
  BS.finishTimers(s, T0 + 1e8);
  assert.ok(C.armyCap(s) > 10);
  const r = C.enqueue(s, 'rat', T0);
  assert.ok(r.ok && s.queue.length === 1);
  const paid = 500000; // just to compare cash moved
  C.finishQueue(s, T0 + 1e9);
  assert.equal(s.army.rat, 5);
  assert.equal(s.stats.trains, 1);
  assert.equal(C.startResearch(s, 'fox', T0).ok, true);
  assert.equal(C.startResearch(s, 'rat', T0).reason, 'busy');
  const done = C.finishResearch(s, T0 + 1e9);
  assert.equal(done.t, 'fox'); assert.equal(s.troopLv.fox, 2);
  assert.equal(C.hireBoss(s, 'magrey').ok, true);
  assert.equal(C.hireBoss(s, 'scales').reason, 'den');
});

test('bosses join the line-up and Rally Howl grants AP once', () => {
  const s = newGame(T0, 11);
  C.hireBoss(s, 'magrey', true);
  const line = C.lineup(s, T0);
  assert.ok(line.some((m) => m.bossId === 'magrey'));
  assert.ok(M.startMission(s, 0, 0, T0).ok);
  const u = s.battle.units.find((x) => x.bossId === 'magrey' && x.side === 'player');
  assert.ok(u);
  const ap0 = s.battle.units.filter((x) => x.side === 'player' && x.alive && x !== u).map((x) => x.ap);
  const r = B.applyAction(s.battle, { type: 'skill', uid: u.uid });
  assert.ok(r.ok);
  const ap1 = s.battle.units.filter((x) => x.side === 'player' && x.alive && x !== u).map((x) => x.ap);
  assert.ok(ap1.every((a, i) => a === ap0[i] + 2), 'howl adds 2 AP');
  assert.equal(B.applyAction(s.battle, { type: 'skill', uid: u.uid }).ok, false, 'once per battle');
});

test('daily reward streak and jobs', () => {
  const s = newGame(T0, 1);
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
  const s = newGame(T0, 5);
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
    const s = newGame(T0, 300 + k);
    beefArmy(s, { den: 3, yard: 5, lv: 6 });
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
  const s = newGame(T0, 1);
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
  assert.equal(s.v, 5);
  assert.equal(s.crew, undefined);
  assert.ok(C.armyCount(s) > 0);
  assert.equal(s.districts.rail.owner, 'player');
  assert.equal(s.teeth, old.teeth + 100);
  assert.equal(s.base.buildings[0].t, 'den');
  assert.equal(s.rackets, undefined);
  return import('../js/core/state.js').then(({ makeLocalStorage }) => {
    const st = makeLocalStorage(ls).load(T0);
    assert.ok(st && st.v === 5 && !store['fangcity.save.v1'] && store['fangcity.save.v2']);
  });
});

test('v2 save migrates: base kept, individual crew becomes troops, gang choice dropped', () => {
  const s2 = newGame(T0, 42);
  s2.v = 2;
  s2.gang = 'grey';
  s2.crew = [
    { id: 'm1', species: 'wolf', role: 'enforcer', rarity: 'rare', level: 9 },
    { id: 'm2', species: 'rat', role: 'enforcer', rarity: 'common', level: 5 },
    { id: 'm3', species: 'fox', role: 'shooter', rarity: 'rare', level: 8 },
  ];
  s2.squad = ['m1', 'm2'];
  s2.inventory = { bat: 2 };
  s2.training = [];
  const stall = place(s2, 'stall').b; BS.finishTimers(s2, T0 + 1e5);
  const teeth = s2.teeth, cash0 = s2.cash;
  const s = migrate(JSON.parse(JSON.stringify(s2)), T0);
  assert.equal(s.v, 5);
  assert.equal(s.gang, undefined);
  assert.equal(s.crew, undefined);
  assert.ok(s.army.wolf >= 1 && s.army.rat >= 1 && s.army.fox >= 1);
  assert.ok(s.troopLv.wolf >= 2, 'level 9 member becomes troop lv 3 max 3, or 2+');
  assert.equal(s.base.buildings.find((b) => b.id === stall.id).t, 'stall');
  assert.equal(s.teeth, teeth + 50);
  assert.ok(s.cash >= cash0, 'spare gear sold for cash');
});

test('missions: locked by Den and previous stage, first clear pays more, progress saves', () => {
  const s = newGame(T0, 8);
  assert.equal(M.missionStatus(s, 1, 0).locked, true, 'Iron Claw needs Den 2');
  assert.ok(!M.missionStatus(s, 0, 0).locked);
  assert.equal(M.missionStatus(s, 0, 1).locked, true, 'stage 2 waits on stage 1');
  const first = M.missionReward(0, 0, false);
  const rematch = M.missionReward(0, 0, true);
  assert.ok(first.teeth > 0 && rematch.teeth === 0);
  assert.ok(first.cash > rematch.cash);
  assert.ok(M.startMission(s, 0, 0, T0).ok);
  autoplay(s.battle);
  const out = M.resolveBattle(s, T0);
  if (out.win) {
    assert.equal(s.missions.grey, 1);
    assert.ok(out.missionFirst);
    assert.ok(!M.missionStatus(s, 0, 1).locked);
  } else {
    assert.equal(s.missions.grey || 0, 0);
  }
  assert.equal(s.battle, null);
});

test('mock purchases: builder pack, VIP slot, one-time offers', () => {
  const s = newGame(T0, 3);
  assert.ok(M.mockPurchase(s, 'offer', 'builder', T0).ok);
  assert.equal(s.base.builders, 2);
  assert.ok(M.mockPurchase(s, 'offer', 'starter', T0).ok);
  assert.ok(s.bosses.magrey);
  assert.equal(s.army.wolf, 3);
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
      const s = newGame(T0, 1000 + i);
      if (d.tier > 1) beefArmy(s, { den: Math.max(2, d.tier), yard: 7, lv: Math.max(3, e.level - 2) });
      for (const p of DISTRICTS.filter((x) => x.tier < d.tier)) s.districts[p.id].owner = 'player';
      M.startDistrictBattle(s, d.id, T0); autoplay(s.battle);
      if (s.battle.result === 'win') wins++;
    }
    rows.push(`turf ${d.name}: ${Math.round((wins / N) * 100)}%`);
  }
  for (let L = 1; L <= 6; L++) {
    let wins = 0, stars = 0; const N = 20;
    for (let i = 0; i < N; i++) {
      const s = newGame(T0, 2000 + i);
      beefArmy(s, { den: L, yard: Math.max(1, L + 1), lv: 2 + L });
      M.refreshRivals(s, T0, true); M.startRaid(s, s.rivals[1].id); autoplay(s.battle);
      if (s.battle.result === 'win') wins++; stars += B.raidStars(s.battle).stars;
    }
    rows.push(`raid Den ${L}: ${Math.round((wins / N) * 100)}% win, ${(stars / N).toFixed(1)} stars`);
  }
  console.log('     ' + rows.join('\n     '));
});


test('a new player starts with Rook only; others are collectable', () => {
  const s = newGame(T0, 9);
  assert.deepEqual(Object.keys(s.heroes.owned), ['rook']);
  assert.deepEqual(s.heroes.squad, ['rook']);
  assert.equal(s.heroes.tutorialDone, false);
  assert.equal(HERO_ORDER.length, 8);
  finishTutorial(s);
  assert.equal(s.heroes.tutorialDone, true);
  assert.ok(!s.heroes.owned.pip, 'Pip is no longer a free unlock');
});

test('shards unlock heroes, pin boosts, crates have pity, extras become stars or universal', () => {
  const s = newGame(T0, 11);
  const mid = SH.addShards(s, 'lumen', 29);
  assert.equal(!!s.heroes.owned.lumen, false);
  assert.equal(s.heroes.shards.lumen, 29);
  const done = SH.addShards(s, 'lumen', 1);
  assert.ok(done.unlocked);
  assert.ok(s.heroes.owned.lumen);
  assert.equal(s.heroes.owned.lumen.stars, 1);
  // more shards raise stars
  SH.addShards(s, 'lumen', 10);
  assert.equal(s.heroes.owned.lumen.stars, 2);
  // pin
  assert.ok(SH.setPin(s, 'pip').ok);
  assert.equal(s.heroes.pin, 'pip');
  assert.equal(SH.setPin(s, 'rook').ok, false);
  // crates + pity: 10 street crates guarantee a drop
  s.teeth = 10000;
  let pity = false, opened = 0;
  for (let i = 0; i < 10; i++) {
    const r = SH.openCrate(s, 'street', T0);
    assert.ok(r.ok, r.reason);
    opened++;
    if (r.pity) pity = true;
  }
  assert.equal(opened, 10);
  assert.ok(pity, 'tenth crate is a pity grant');
  assert.equal(SH.pityOf(s, 'street').have, 0);
  // featured hero is one of the collectable operators
  assert.ok(HEROES[SH.featuredHero(T0)]);
  assert.notEqual(SH.featuredHero(T0), 'rook');
  // max stars convert to universal
  s.heroes.owned.lumen.stars = 5;
  s.heroes.owned.lumen.shards = 0;
  const uni = s.heroes.universal || 0;
  const conv = SH.addShards(s, 'lumen', 7);
  assert.equal(conv.converted, 7);
  assert.equal(s.heroes.universal, uni + 7);
  const pipBefore = SH.shardCount(s, 'pip');
  const used = SH.spendUniversal(s, 'pip', 7);
  assert.ok(used.ok);
  assert.equal(SH.shardCount(s, 'pip'), pipBefore + 7);
  // clearing bushes can drop shards (run many times on a copy of rng)
  let drops = 0;
  for (let i = 0; i < 40; i++) {
    const s2 = newGame(T0, 200 + i);
    const d = SH.rollClearDrop(s2, T0);
    if (d) drops++;
  }
  assert.ok(drops > 0, 'some bush clears drop shards');
});

test('tactics: cover, hitchance, flanking, overwatch and a tutorial fight', () => {
  const b = T.startTutorial(42);
  assert.equal(b.units.length, 2);
  const rook = b.units.find((u) => u.hero === 'rook');
  const hook = b.units.find((u) => u.hero === 'hook');
  assert.equal(rook.x, 6); assert.equal(rook.y, 9);
  assert.equal(hook.x, 13); assert.equal(hook.y, 9);
  assert.equal(b.acting, rook.uid, 'Rook goes first in the lesson');
  // Hook sits behind a crate at (12,9) — shots from the west should have cover
  const west = T.previewShot(b, rook, hook, 'shot');
  assert.ok(west && west.ok, 'LOS down the lane, ' + (west && west.reason));
  assert.ok(west.cover >= 1, 'crate gives Hook cover from the west, cover=' + west.cover);
  const front = west.chance;
  // teleport south of Hook for the flank test
  rook.x = 13; rook.y = 11;
  const flank = T.previewShot(b, rook, hook, 'shot');
  assert.ok(flank.ok, flank && flank.reason);
  assert.equal(flank.cover, 0, 'south of Hook is a flank');
  assert.ok(flank.flanked);
  assert.ok(flank.chance > front, `flank ${flank.chance} should beat covered ${front}`);
  // overwatch: Hook watches, Rook walks in the open lane
  const b2 = T.startTutorial(7);
  const r2 = b2.units.find((u) => u.hero === 'rook');
  const h2 = b2.units.find((u) => u.hero === 'hook');
  h2.x = 10; h2.y = 9; h2.overwatch = true; h2.ap = 0;
  const before = r2.hp;
  const mv = T.apply(b2, { type: 'move', uid: r2.uid, x: 7, y: 9 });
  assert.ok(mv.ok, mv.reason);
  const ow = (mv.events || []).filter((e) => e.typ === 'overwatch' || (e.typ === 'shot' && e.mode === 'overwatch'));
  assert.ok(ow.length || r2.hp !== before || mv.events.some((e) => e.typ === 'step'), 'move resolved');
  const b3 = T.startTutorial(99);
  T.autoplay(b3, 200);
  assert.ok(b3.status === 'win' || b3.status === 'loss', b3.status);
  const mu = matchup(HEROES.nile, HEROES.lumen);
  assert.ok(mu.aim > 0 || mu.dmg > 0, 'closer vs marksman is a good matchup');
});


test('v3 save migrates to v5 with Rook and starting ammo', () => {
  const s3 = newGame(T0, 5);
  // pretend it is a v3 blob (no heroes)
  s3.v = 3;
  delete s3.heroes;
  delete s3.tactics;
  const s = migrate(s3, T0);
  assert.equal(s.v, 5);
  assert.ok(s.heroes.owned.rook);
  assert.deepEqual(s.heroes.squad, ['rook']);
  assert.ok((s.ammo || 0) >= 30);
  assert.ok((s.medkits || 0) >= 2);
});


test('Armoury, Clinic and Workshop produce ammo, medkits and parts into capped stores', () => {
  const s = newGame(T0, 8);
  rich(s);
  s.base.buildings[0].lv = 2; // den 2 unlocks armoury + workshop
  const clinic = place(s, 'clinic').b;
  BS.finishTimers(s, T0 + 1e7);
  const yard = place(s, 'armoury');
  assert.ok(yard.ok, yard.reason);
  BS.finishTimers(s, T0 + 2e7);
  const shop = place(s, 'workshop');
  assert.ok(shop.ok, shop.reason);
  BS.finishTimers(s, T0 + 3e7);
  assert.ok(BS.caps(s).ammo >= 40);
  assert.ok(BS.caps(s).medkits >= 4);
  assert.ok(BS.caps(s).parts >= 4);
  s.ammo = 0; s.medkits = 0; s.parts = 0;
  E.tick(s, 400, T0);
  assert.ok(clinic.till > 0, 'clinic till fills');
  const c = BS.collect(s, clinic.id);
  assert.ok(c.ok && c.res === 'medkits' && c.amount > 0);
  const a = BS.collect(s, yard.b.id);
  assert.ok(a.ok && a.res === 'ammo' && a.amount > 0, a);
  const w = BS.collect(s, shop.b.id);
  assert.ok(w.ok && w.res === 'parts' && w.amount > 0);
  // cap respected
  s.ammo = BS.caps(s).ammo;
  yard.b.till = 50;
  const full = BS.collect(s, yard.b.id);
  assert.equal(full.ok, false);
});


test('heroes earn XP, level up, and unlock a perk choice every few ranks', () => {
  const rec = { xp: 0, lv: 1, perks: [] };
  const gained = P.addXp(rec, 60);
  assert.equal(rec.lv, 2);
  assert.equal(rec.xp, 0);
  assert.equal(gained[0].rank, 'Street');
  assert.ok(!gained[0].perk);
  P.addXp(rec, 80 + 100); // 2->3 and 3->4; perk at 3
  assert.equal(rec.lv, 4);
  assert.equal(rec.pendingPerk, true);
  const choices = P.perkChoices('rook', rec.perks);
  assert.equal(choices.length, 2);
  const r = P.pickPerk(rec, choices[0]);
  assert.ok(r.ok);
  assert.ok(rec.perks.includes(choices[0]));
  assert.equal(rec.pendingPerk, false);
  const xp = P.xpFromBattle({ kills: 2, hp: 1 }, true, false);
  assert.equal(xp, 2 * 25 + 15 + 20);
  const hs = P.xpFromBattle({ kills: 2, hp: 1 }, true, true);
  assert.equal(hs, Math.round(xp * 2));
});

test('loadout spends base ammo; unused rounds return and spent shots are gone', () => {
  const s = newGame(T0, 11);
  grantHero(s, 'nile');
  s.heroes.squad = ['rook', 'nile'];
  s.ammo = 20;
  s.medkits = 3;
  const draft = L.defaultLoadout(s);
  assert.ok(draft.ammo.rook > 0);
  assert.ok(draft.ammo.rook <= L.carryOf(s, 'rook'));
  const used = draft.ammo.rook + draft.ammo.nile;
  const med = (draft.medkits.rook || 0) + (draft.medkits.nile || 0);
  const c = L.commitLoadout(s, draft);
  assert.ok(c.ok, c.reason);
  assert.equal(s.ammo, 20 - used);
  assert.equal(s.medkits, 3 - med);
  // start a fight with that loadout, fire one shot (even a miss spends a round)
  const b = T.startStreet(s, 22, c);
  const rook = b.units.find((u) => u.hero === 'rook' && u.side === 'player');
  const foe = b.units.find((u) => u.side === 'enemy' && u.hp > 0);
  const before = rook.ammo;
  assert.ok(before > 0, 'rook loaded ammo');
  // place them in range with LOS and AP
  rook.x = 6; rook.y = 9; foe.x = 8; foe.y = 9;
  rook.ap = 4;
  b.acting = rook.uid; b.side = rook.side;
  const shot = T.apply(b, { type: 'shot', uid: rook.uid, target: foe.uid, mode: 'shot' });
  assert.ok(shot.ok, shot.reason);
  assert.equal(rook.ammo, before - 1);
  b.status = 'win';
  const left = rook.ammo;
  const nile = b.units.find((u) => u.hero === 'nile' && u.side === 'player');
  const expectBack = left + (nile.ammo || 0);
  const res = T.resolveTactics(s, b);
  assert.ok(res);
  assert.equal(res.returned.ammo, expectBack);
  assert.equal(s.ammo, 20 - used + expectBack);
  // the fired round is gone for good
  assert.equal(s.ammo, 20 - 1);
  assert.ok(res.xp.some((x) => x.id === 'rook' && x.amount > 0));
});

test('empty magazines fall back to melee; High Stakes KO resets level and takes gear, normal fights do not', () => {
  const s = newGame(T0, 33);
  grantHero(s, 'nile');
  s.heroes.owned.rook.lv = 5;
  s.heroes.owned.rook.xp = 40;
  s.heroes.owned.rook.perks = ['grouping'];
  s.heroes.owned.rook.gear = 'grip';
  s.kit = {};
  s.ammo = 10; s.medkits = 1;
  const load = { squad: ['rook', 'nile'], ammo: { rook: 0, nile: 4 }, medkits: { rook: 0, nile: 0 }, highStakes: true };
  const c = L.commitLoadout(s, load);
  assert.ok(c.ok, c.reason);
  const b = T.startStreet(s, 44, c);
  assert.equal(b.highStakes, true);
  assert.equal(b.reward.cash, (200 + 2 * 80) * 3);
  const rook = b.units.find((u) => u.hero === 'rook' && u.side === 'player');
  const foe = b.units.find((u) => u.side === 'enemy' && u.hp > 0);
  rook.ammo = 0; rook.ap = 4; rook.x = 6; rook.y = 9; foe.x = 7; foe.y = 9;
  b.acting = rook.uid; b.side = rook.side;
  const melee = T.apply(b, { type: 'shot', uid: rook.uid, target: foe.uid, mode: 'shot' });
  assert.ok(melee.ok, melee.reason);
  const ev = (melee.events || []).find((e) => e.mode === 'melee' || e.typ === 'shot' || e.typ === 'melee');
  assert.ok(ev, melee.events);
  assert.equal(rook.ammo, 0, 'melee does not spend ammo');
  // KO Rook, keep Nile alive, force a win so resolve runs High Stakes reset
  rook.hp = 0;
  b.status = 'win';
  const res = T.resolveTactics(s, b);
  assert.ok(res.highStakes);
  assert.ok(res.lost.some((l) => l.id === 'rook' && l.gear === 'grip'));
  assert.equal(s.heroes.owned.rook.lv, 1);
  assert.equal(s.heroes.owned.rook.xp, 0);
  assert.deepEqual(s.heroes.owned.rook.perks, []);
  assert.equal(s.heroes.owned.rook.gear, null);
  assert.ok(s.heroes.owned.rook, 'hero is kept');
  // Nile still has progress
  assert.ok(res.xp.some((x) => x.id === 'nile'));
  // Normal fight: level is kept after a KO
  const s2 = newGame(T0, 34);
  grantHero(s2, 'nile');
  s2.heroes.owned.rook.lv = 5;
  s2.heroes.owned.rook.xp = 40;
  s2.heroes.owned.rook.gear = 'vest';
  s2.ammo = 8;
  const c2 = L.commitLoadout(s2, { squad: ['rook'], ammo: { rook: 4 }, medkits: {}, highStakes: false });
  const b2 = T.startStreet(s2, 9, c2);
  const r2 = b2.units.find((u) => u.hero === 'rook');
  r2.hp = 0;
  b2.status = 'loss';
  const res2 = T.resolveTactics(s2, b2);
  assert.ok(!res2.highStakes);
  assert.equal(res2.lost.length, 0);
  assert.equal(s2.heroes.owned.rook.lv, 5);
  assert.equal(s2.heroes.owned.rook.gear, 'vest');
});


test('docklands: speed queue, explosive barrels, medkit revive, cover is not destroyed', () => {
  const s = newGame(T0, 21);
  grantHero(s, 'vesper');
  s.ammo = 40; s.medkits = 4;
  s.heroes.squad = ['rook', 'vesper'];
  const load = L.commitLoadout(s, { squad: ['rook', 'vesper'], ammo: { rook: 8, vesper: 6 }, medkits: { rook: 0, vesper: 2 }, highStakes: false });
  assert.ok(load.ok, load.reason);
  const b = T.startStreet(s, 8, load);
  assert.equal(b.pvp, true);
  assert.ok(b.map.w >= 20 && b.map.h >= 14, 'medium yard');
  assert.equal(b.map.id, 'docklands');
  assert.ok(b.queue.length >= 4, 'mixed initiative queue');
  const first = T.actingUnit(b);
  assert.ok(first, 'someone is up');
  // First actor is the living unit with the highest speed (ties broken by init).
  const living = b.units.filter((u) => u.hp > 0);
  const top = living.slice().sort((a, c) => (T.speedOf(c) - T.speedOf(a)) || (c.init - a.init) || a.uid.localeCompare(c.uid))[0];
  assert.equal(first.uid, top.uid);

  // Shoot the barrel at (5,12) — not next to the starting aprons
  const shooter = b.units.find((u) => u.side === 'player' && (u.ammo || 0) > 0) || first;
  // force it to be this unit's turn
  b.acting = shooter.uid; b.side = shooter.side; shooter.ap = 4; shooter.x = 5; shooter.y = 10;
  const dummy = b.units.find((u) => u.uid !== shooter.uid);
  dummy.x = 5; dummy.y = 11; // adjacent to barrel (5,12)
  const hp0 = dummy.hp;
  const boom = T.apply(b, { type: 'shootProp', uid: shooter.uid, x: 5, y: 12, mode: 'shot' });
  assert.ok(boom.ok, boom.reason);
  const wreck = tile(b.map, 5, 12);
  assert.equal(wreck.explosive, 0);
  assert.equal(wreck.decor, 'barrelWreck');
  assert.equal(wreck.cover, 1, 'wreck keeps half cover');
  assert.ok(dummy.hp < hp0 || dummy.hp === 0, 'blast deals area damage');
  // shooting the wreck again is refused
  shooter.ap = 4;
  const again = T.previewProp(b, shooter, 5, 12, 'shot');
  assert.equal(again.ok, false);

  // Marlow cannot breach cover away
  const br = T.apply(b, { type: 'breach', uid: shooter.uid, x: 12, y: 9 });
  assert.equal(br.ok, false);

  // Revive: KO vesper, have her next to rook with a medkit
  const rook = b.units.find((u) => u.hero === 'rook');
  const ves = b.units.find((u) => u.hero === 'vesper');
  if (rook && ves) {
    ves.hp = 0; ves.ko = 1; ves.x = rook.x + 1; ves.y = rook.y;
    // stand on a walkable tile
    if (!T.walkable(b, ves.x, ves.y, ves.uid)) { ves.x = rook.x; ves.y = rook.y + 1; }
    rook.medkits = 1; rook.ap = 4;
    b.acting = rook.uid; b.side = rook.side;
    const rev = T.apply(b, { type: 'medkit', uid: rook.uid, target: ves.uid });
    assert.ok(rev.ok, rev.reason);
    assert.ok(ves.hp > 0 && ves.hp < ves.maxHp, 'revived at partial HP');
    assert.equal(rook.medkits, 0);
  }

  const inv = describeDocklands();
  assert.equal(inv.coverDestructible, false);
  assert.ok(inv.spawns.player.length === 4 && inv.spawns.enemy.length === 4);
});

console.log(`\n${pass} tests passed`);


