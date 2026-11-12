// Idle empire rules. Pure functions over the JSON state; `now` is always injected.
import { RACKETS, RACKET_MILESTONES, TILL_SECONDS, LIEUTENANT_COST_MULT, DISTRICTS } from './data.js';

export const racketDef = (id) => RACKETS.find((r) => r.id === id);

export function racketCost(def, level, n = 1) {
  // cost of buying n levels starting at `level` owned (geometric series)
  const r = def.growth;
  return def.baseCost * Math.pow(r, level) * (Math.pow(r, n) - 1) / (r - 1);
}

export function maxAffordable(def, level, cash) {
  const r = def.growth;
  const first = def.baseCost * Math.pow(r, level);
  if (cash < first) return 0;
  return Math.floor(Math.log(cash * (r - 1) / first + 1) / Math.log(r));
}

export function milestoneMult(level) {
  return Math.pow(2, RACKET_MILESTONES.filter((m) => level >= m).length);
}
export function nextMilestone(level) {
  return RACKET_MILESTONES.find((m) => m > level) || null;
}

export function districtBonus(state) {
  return DISTRICTS.reduce((s, d) => s + (state.districts[d.id]?.owner === 'player' ? d.bonus : 0), 0);
}

export const isVip = (state, now) => state.vipUntil > now;
export const adBoostActive = (state, now) => state.boosts.adIncomeUntil > now;

export function globalMult(state, now) {
  let m = (1 + 0.02 * state.cred) * (1 + districtBonus(state));
  if (adBoostActive(state, now)) m *= 2;
  return m;
}

export function isRacketUnlocked(state, def) {
  return !def.req || state.districts[def.req]?.owner === 'player';
}

export function racketIncome(state, id, now) {
  const def = racketDef(id);
  const rk = state.rackets[id];
  if (!rk || rk.level <= 0) return 0;
  return def.income * rk.level * milestoneMult(rk.level) * globalMult(state, now);
}

export function totalIncome(state, now) {
  return RACKETS.reduce((s, d) => s + racketIncome(state, d.id, now), 0);
}

export const tillCap = (state, id, now) => racketIncome(state, id, now) * TILL_SECONDS;
export const isAuto = (state, id, now) => state.rackets[id]?.lieutenant || isVip(state, now);

export function offlineCapHours(state, now) {
  return isVip(state, now) ? 12 : 8;
}

export function influencePerHour(state) {
  return DISTRICTS.reduce((s, d) => s + (state.districts[d.id]?.owner === 'player' ? d.influencePerHour : 0), 0);
}

function earn(state, amount) {
  state.cash += amount;
  state.lifetime += amount;
  state.runEarnings += amount;
}

// Advance the empire by dt seconds. Returns cash banked directly (auto rackets).
export function tick(state, dt, now) {
  let banked = 0;
  for (const def of RACKETS) {
    const rk = state.rackets[def.id];
    if (!rk || rk.level <= 0) continue;
    const inc = racketIncome(state, def.id, now) * dt;
    if (isAuto(state, def.id, now)) {
      if (rk.till > 0) { banked += rk.till; rk.till = 0; }
      banked += inc;
    } else {
      rk.till = Math.min(rk.till + inc, tillCap(state, def.id, now));
    }
  }
  earn(state, banked);
  state.influence += influencePerHour(state) * dt / 3600;
  state.lastTick = now;
  return banked;
}

// Apply time passed since the last save, capped. Returns a summary for the "welcome back" screen.
export function applyOffline(state, now) {
  const elapsed = Math.max(0, (now - state.lastTick) / 1000);
  if (elapsed < 1) { state.lastTick = now; return null; }
  const capped = Math.min(elapsed, offlineCapHours(state, now) * 3600);
  const cashBefore = state.cash;
  const tillsBefore = Object.values(state.rackets).reduce((s, r) => s + r.till, 0);
  const inflBefore = state.influence;
  tick(state, capped, now);
  const tillsAfter = Object.values(state.rackets).reduce((s, r) => s + r.till, 0);
  const summary = {
    seconds: Math.round(elapsed),
    cappedSeconds: Math.round(capped),
    banked: state.cash - cashBefore,
    tills: Math.max(0, tillsAfter - tillsBefore),
    influence: state.influence - inflBefore,
  };
  return elapsed >= 60 && (summary.banked > 0 || summary.tills > 0 || summary.influence > 0.5) ? summary : null;
}

export function doubleOffline(state, summary) {
  // Rewarded-ad mock: doubles what was banked while away.
  if (!summary || summary.doubled) return 0;
  summary.doubled = true;
  earn(state, summary.banked);
  return summary.banked;
}

export function tapValue(state, now) {
  return Math.max(1, Math.round((1 + totalIncome(state, now) * 0.08) * 100) / 100);
}

export function tap(state, now) {
  const v = tapValue(state, now);
  earn(state, v);
  state.stats.taps++;
  return v;
}

export function collect(state, id) {
  const rk = state.rackets[id];
  if (!rk || rk.till <= 0) return 0;
  const v = rk.till;
  rk.till = 0;
  earn(state, v);
  state.stats.collects++;
  return v;
}

export function collectAll(state) {
  let total = 0;
  for (const id of Object.keys(state.rackets)) total += collect(state, id);
  return total;
}

export function buyRacket(state, id, n = 1) {
  const def = racketDef(id);
  if (!def || !isRacketUnlocked(state, def)) return { ok: false, reason: 'locked' };
  const rk = state.rackets[id] || (state.rackets[id] = { level: 0, till: 0, lieutenant: false });
  const cost = racketCost(def, rk.level, n);
  if (n < 1 || state.cash < cost) return { ok: false, reason: 'cash' };
  state.cash -= cost;
  rk.level += n;
  state.stats.racketBuys += n;
  return { ok: true, cost };
}

export const lieutenantCost = (def) => def.baseCost * LIEUTENANT_COST_MULT;

export function hireLieutenant(state, id) {
  const def = racketDef(id);
  const rk = state.rackets[id];
  if (!rk || rk.level <= 0 || rk.lieutenant) return { ok: false };
  const cost = lieutenantCost(def);
  if (state.cash < cost) return { ok: false, reason: 'cash' };
  state.cash -= cost;
  rk.lieutenant = true;
  return { ok: true, cost };
}

// Prestige ("Lay Low"): trade the run's empire for permanent Street Cred (+2% income each).
export const credForLifetime = (lifetime) => Math.floor(10 * Math.sqrt(lifetime / 1e6));
export const credAvailable = (state) => Math.max(0, credForLifetime(state.lifetime) - state.credEarned);

export function layLow(state) {
  const gain = credAvailable(state);
  if (gain < 1) return { ok: false };
  state.cred += gain;
  state.credEarned += gain;
  state.cash = 0;
  state.runEarnings = 0;
  for (const id of Object.keys(state.rackets)) state.rackets[id] = { level: 0, till: 0, lieutenant: false };
  state.rackets.stall = { level: 1, till: 0, lieutenant: false };
  state.prestiges++;
  return { ok: true, gain };
}

export function watchIncomeAd(state, now) {
  // Rewarded ad mock: x2 income for 30 minutes (stacks up to 4h), 6 per day.
  const day = new Date(now).toISOString().slice(0, 10);
  if (state.boosts.adsDay !== day) { state.boosts.adsDay = day; state.boosts.adsToday = 0; }
  if (state.boosts.adsToday >= 6) return { ok: false, reason: 'limit' };
  state.boosts.adsToday++;
  const base = Math.max(now, state.boosts.adIncomeUntil);
  state.boosts.adIncomeUntil = Math.min(base + 30 * 60 * 1000, now + 4 * 3600 * 1000);
  return { ok: true };
}
