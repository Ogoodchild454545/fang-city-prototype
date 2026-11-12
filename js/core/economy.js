// Economy clock: production, offline catch-up, shake-downs and reward-ad boosts.
// The buildings themselves live in base.js; this file advances time over them.
import { DISTRICTS } from './data.js';
import * as BS from './base.js';

export const isVip = (state, now) => state.vipUntil > now;
export const adBoostActive = (state, now) => state.boosts.adIncomeUntil > now;
export const globalMult = BS.globalMult;
export const totalIncome = (state, now) => BS.incomePerSec(state, 'cash', now);
export const influenceIncome = (state, now) => BS.incomePerSec(state, 'influence', now) + influencePerHour(state) / 3600;
export const offlineCapHours = (state, now) => (isVip(state, now) ? 12 : 8);

export function influencePerHour(state) {
  return DISTRICTS.reduce((s, d) => s + (state.districts[d.id]?.owner === 'player' ? d.influencePerHour : 0), 0);
}

// Advance everything by dt seconds.
export function tick(state, dt, now) {
  const banked = BS.produce(state, dt, now);
  const inf = influencePerHour(state) * dt / 3600;
  banked.influence += BS.gain(state, 'influence', inf);
  state.lastTick = now;
  return banked;
}

// Apply time passed since the last save (capped). Builder timers use timestamps, so they finish naturally.
export function applyOffline(state, now) {
  const elapsed = Math.max(0, (now - state.lastTick) / 1000);
  if (elapsed < 1) { state.lastTick = now; return null; }
  const capped = Math.min(elapsed, offlineCapHours(state, now) * 3600);
  const tillsBefore = BS.producers(state).reduce((s, b) => s + b.till, 0);
  // walk through the away time, finishing build jobs at their own end times so new levels start producing then
  const start = now - capped * 1000;
  const ends = state.base.buildings.filter((b) => b.job && b.job.endsAt > start && b.job.endsAt < now).map((b) => b.job.endsAt).sort((a, c) => a - c);
  const banked = { cash: 0, influence: 0 };
  const ev = [];
  let t = start;
  for (const e of [...ends, now]) {
    const part = tick(state, (e - t) / 1000, e);
    banked.cash += part.cash; banked.influence += part.influence;
    ev.push(...BS.finishTimers(state, e));
    t = e;
  }
  BS.maybeSpawnObstacle(state, now);
  const tillsAfter = BS.producers(state).reduce((s, b) => s + b.till, 0);
  const summary = {
    seconds: Math.round(elapsed), cappedSeconds: Math.round(capped),
    banked: banked.cash, influence: banked.influence, tills: Math.max(0, tillsAfter - tillsBefore),
    finished: ev.filter((e) => e.type !== 'cleared').length, cleared: ev.filter((e) => e.type === 'cleared').length,
  };
  return elapsed >= 60 && (summary.banked > 0 || summary.tills > 1 || summary.influence > 0.5 || summary.finished || summary.cleared) ? summary : null;
}

export function doubleOffline(state, summary) {
  if (!summary || summary.doubled) return 0;
  summary.doubled = true;
  return BS.gain(state, 'cash', summary.banked);
}

export function tapValue(state, now) {
  return Math.max(1, Math.round(1 + totalIncome(state, now) * 0.25));
}
export function tap(state, now) {
  const v = BS.gain(state, 'cash', tapValue(state, now));
  state.stats.taps++;
  return v;
}

export function watchIncomeAd(state, now) {
  // Rewarded ad mock: x2 cash production for 30 minutes (stacks up to 4h), 6 per day.
  const day = new Date(now).toISOString().slice(0, 10);
  if (state.boosts.adsDay !== day) { state.boosts.adsDay = day; state.boosts.adsToday = 0; }
  if (state.boosts.adsToday >= 6) return { ok: false, reason: 'limit' };
  state.boosts.adsToday++;
  const base = Math.max(now, state.boosts.adIncomeUntil);
  state.boosts.adIncomeUntil = Math.min(base + 30 * 60 * 1000, now + 4 * 3600 * 1000);
  return { ok: true };
}
