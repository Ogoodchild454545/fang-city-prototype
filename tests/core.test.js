import assert from 'node:assert/strict';
import { newGame, serialize, deserialize } from '../js/core/state.js';
import * as E from '../js/core/economy.js';
import * as C from '../js/core/crew.js';
import * as M from '../js/core/meta.js';
import * as B from '../js/core/battle.js';
import { aiNextAction, aiNextActionFor } from '../js/core/ai.js';
import { DISTRICTS } from '../js/core/data.js';

let pass = 0;
const test = (name, fn) => { try { fn(); pass++; console.log('ok  ', name); } catch (e) { console.error('FAIL', name, '\n', e); process.exitCode = 1; } };
const T0 = Date.UTC(2026, 10, 11, 12, 0, 0);

test('new game is JSON-serialisable and round-trips', () => {
  const s = newGame(T0, 'grey', 123);
  const s2 = deserialize(serialize(s));
  assert.deepEqual(s2, s);
  assert.equal(s.crew.length, 3);
  assert.equal(s.squad.length, 3);
});

test('rackets tick into tills, cap, and collect', () => {
  const s = newGame(T0, 'grey', 1);
  E.tick(s, 10, T0);
  assert.ok(Math.abs(s.rackets.stall.till - 10) < 1e-9);
  E.tick(s, 10000, T0);
  assert.equal(s.rackets.stall.till, E.tillCap(s, 'stall', T0));
  const got = E.collect(s, 'stall');
  assert.ok(got > 0 && s.rackets.stall.till === 0);
});

test('buying levels uses geometric cost and milestones double income', () => {
  const s = newGame(T0, 'grey', 1);
  s.cash = 1e9;
  const c1 = E.racketCost(E.racketDef('stall'), 1, 1);
  assert.ok(E.buyRacket(s, 'stall', 1).ok);
  assert.ok(Math.abs(E.racketCost(E.racketDef('stall'), 2, 1) - c1 * 1.07) < 1e-6);
  E.buyRacket(s, 'stall', 8); // level 10
  assert.equal(s.rackets.stall.level, 10);
  assert.equal(E.racketIncome(s, 'stall', T0), 10 * 2);
  const n = E.maxAffordable(E.racketDef('carwash'), 0, 1000);
  assert.ok(E.racketCost(E.racketDef('carwash'), 0, n) <= 1000 && E.racketCost(E.racketDef('carwash'), 0, n + 1) > 1000);
});

test('locked rackets need turf', () => {
  const s = newGame(T0, 'grey', 1);
  s.cash = 1e12;
  assert.equal(E.buyRacket(s, 'pawn').ok, false);
  s.districts.rail.owner = 'player';
  assert.equal(E.buyRacket(s, 'pawn').ok, true);
  assert.ok(E.globalMult(s, T0) > 1.09);
});

test('offline earnings: lieutenants bank, others fill tills, capped at 8h', () => {
  const s = newGame(T0, 'grey', 1);
  s.cash = 1e6;
  E.buyRacket(s, 'carwash', 1);
  E.hireLieutenant(s, 'carwash');
  const cash0 = s.cash;
  s.lastTick = T0;
  const sum = E.applyOffline(s, T0 + 24 * 3600 * 1000);
  assert.ok(sum);
  assert.equal(sum.cappedSeconds, 8 * 3600);
  assert.ok(Math.abs(s.cash - cash0 - 8 * 8 * 3600) < 1e-6);
  assert.equal(s.rackets.stall.till, E.tillCap(s, 'stall', T0));
});

test('prestige gives cred and resets rackets', () => {
  const s = newGame(T0, 'grey', 1);
  s.lifetime = 4e6; s.cash = 5000; s.rackets.carwash.level = 20;
  const r = E.layLow(s);
  assert.equal(r.gain, 20);
  assert.equal(s.cash, 0);
  assert.equal(s.rackets.carwash.level, 0);
  assert.ok(Math.abs(E.globalMult(s, T0) - 1.4) < 1e-9);
  assert.equal(E.layLow(s).ok, false);
});

test('recruit, pity, equip and training with skip', () => {
  const s = newGame(T0, 'grey', 7);
  s.teeth = 100 * 40;
  let legendary = 0;
  for (let i = 0; i < 7; i++) { const r = C.recruit(s, 'premium'); assert.ok(r.ok); if (r.member.rarity === 'legendary') legendary++; }
  assert.equal(s.crew.length, 10);
  assert.equal(C.recruit(s, 'premium').ok, false); // roster full
  const m = s.crew[0];
  s.cash = 1e6; s.influence = 1e3;
  assert.ok(C.buyGear(s, 'leather').ok);
  assert.ok(C.equip(s, m.id, 'leather').ok);
  assert.equal(m.gear.armour, 'leather');
  assert.equal(C.equip(s, m.id, 'rifle').ok, false); // enforcer can't use rifle (and none owned)
  const lv = m.level;
  assert.ok(C.startTraining(s, m.id, T0).ok);
  assert.equal(C.startTraining(s, s.crew[1].id, T0).reason, 'bench');
  assert.ok(!s.squad.includes(m.id));
  C.finishTraining(s, T0 + 1000);
  assert.equal(m.level, lv);
  C.finishTraining(s, T0 + C.trainingSeconds({ level: lv }) * 1000);
  assert.equal(m.level, lv + 1);
  // long training + skip
  m.level = 10; s.training = [];
  C.startTraining(s, m.id, T0);
  const cost = C.skipCost(s.training[0], T0);
  assert.ok(cost > 0);
  const t0 = s.teeth;
  assert.ok(C.skipTraining(s, m.id, T0).ok);
  assert.equal(s.teeth, t0 - cost);
  assert.equal(m.level, 11);
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
  M.claimDaily(s, T0 + 4 * 86400000);
  assert.equal(s.daily.streak, 1); // streak broken
  M.ensureJobs(s, T0);
  assert.equal(s.jobs.list.length, 3);
  const j = s.jobs.list[0];
  const p = M.jobProgress(s, j);
  s.stats[p.t.stat] += p.t.goal;
  assert.ok(M.claimJob(s, j.id).ok);
});

function autoplay(b, maxSteps = 4000) {
  let steps = 0;
  while (b.status === 'active' && steps++ < maxSteps) {
    const a = aiNextActionFor(b, b.side);
    const r = B.applyAction(b, a);
    if (!r.ok) B.applyAction(b, { type: 'end' });
  }
  return b;
}

test('battle: map connectivity, actions validated, deterministic replay', () => {
  const s = newGame(T0, 'grey', 5);
  assert.ok(M.startDistrictBattle(s, 'rail', T0).ok);
  const b = s.battle;
  const copy = JSON.parse(JSON.stringify(b));
  assert.equal(B.applyAction(b, { type: 'move', uid: 'e0', x: 3, y: 3 }).ok, false); // not your turn
  const u = b.units.find((x) => x.side === 'player');
  const reach = [...B.reachable(b, u).values()];
  assert.ok(reach.length > 0);
  autoplay(b);
  autoplay(copy);
  assert.equal(b.result, copy.result);
  assert.deepEqual(b.units.map((x) => x.hp), copy.units.map((x) => x.hp));
  assert.ok(['win', 'loss'].includes(b.result));
  const res = M.resolveBattle(s, T0);
  assert.ok(res && s.battle === null);
});

test('balance: AI-vs-AI win rates across district tiers (info)', () => {
  const rows = [];
  for (const d of DISTRICTS.filter((x) => x.tier > 0)) {
    let wins = 0, turns = 0, timeouts = 0; const N = 80;
    const e = M.districtEnemy(d);
    for (let i = 0; i < N; i++) {
      const s = newGame(T0, 'grey', 1000 + i);
      if (d.tier > 1) {
        // a reasonably invested player: 4 crew at the district level with gear one tier behind
        s.crew = M.makeEnemyCrew(500 + i, 'grey', 4, e.level, d.tier - 1).map((m, k) => ({ ...m, id: 'x' + k }));
        s.squad = s.crew.map((m) => m.id);
      }
      for (const p of DISTRICTS.filter((x) => x.tier < d.tier)) s.districts[p.id].owner = 'player';
      M.startDistrictBattle(s, d.id, T0);
      autoplay(s.battle);
      if (s.battle.result === 'win') wins++;
      if (s.battle.endReason === 'timeout') timeouts++;
      turns += s.battle.turn;
    }
    rows.push(`${d.name}: ${Math.round((wins / N) * 100)}% win, avg ${Math.round(turns / N)} turns, ${timeouts} timeouts`);
  }
  console.log('     ' + rows.join('\n     '));
});

test('raid targets scale with player and pay out', () => {
  const s = newGame(T0, 'grey', 3);
  M.refreshRivals(s, T0, true);
  assert.equal(s.rivals.length, 3);
  assert.ok(M.startRaid(s, s.rivals[0].id).ok);
  autoplay(s.battle);
  const cash0 = s.cash;
  const r = M.resolveBattle(s, T0);
  if (r.win) assert.ok(s.cash > cash0);
});

test('mock purchases grant items, one-time offers once', () => {
  const s = newGame(T0, 'grey', 3);
  assert.ok(M.mockPurchase(s, 'offer', 'starter', T0).ok);
  assert.equal(M.mockPurchase(s, 'offer', 'starter', T0).ok, false);
  assert.equal(s.crew.length, 4);
  M.mockPurchase(s, 'offer', 'vip', T0);
  assert.ok(E.isVip(s, T0 + 1000));
  assert.equal(C.benches(s, T0 + 1000), 2);
  assert.equal(E.offlineCapHours(s, T0 + 1000), 12);
});

console.log(`\n${pass} tests passed`);
