// v0.10 Player (account) level, unlock pacing, energy, Rookie Track, Hideout stockpile,
// operator jobs and the clinic. Account level is separate from each operator's own level.
// Everything is timestamp-based so it keeps working while the game is closed.
import { HEROES, defOf, grantHero } from './heroes.js';
import { gain } from './base.js';
import { LEVEL_ITEMS, addItem, ITEMS, hasBlueprint } from './items.js';

// ---------------------------------------------------------------- player level
export const PLAYER_MAX = 30;
// XP needed to go from level n to n+1 (index = n). Lv 3 lands after the three tutorial ops
// (~1 short session); Lv 10 needs ~2,600 XP, roughly 60-70 ops = a few days at 10 energy.
const XP_NEED = [0, 80, 100, 150, 200, 260, 330, 410, 500, 600, 700, 760, 820, 880, 940, 1000, 1080, 1160, 1240, 1320];
export const playerXpNeed = (lv) => (lv >= PLAYER_MAX ? 0 : XP_NEED[lv] || 1400 + (lv - 20) * 80);

// What each player level opens. `id` is checked by isUnlocked(); grants run on level-up.
export const UNLOCKS = [
  { lv: 1, id: 'ops', name: 'Street ops', ico: '🎯', text: 'Short turn-based ops with Rook.' },
  { lv: 3, id: 'track', name: 'Rookie Track', ico: '🛤️', text: '20 steps of goals with rewards. Shows what opens next.' },
  { lv: 3, id: 'stockpile', name: 'Hideout stockpile', ico: '📦', text: 'Cash and ammo pile up while you are away (12h max). One tap to collect.' },
  { lv: 3, id: 'maul', name: 'Maul', ico: '🩸', text: 'Rook’s savage bite and swing: +2 damage and bleed.' },
  { lv: 3, id: 'market', name: 'Ice & Market', ico: '🧊', text: 'Ice, crates and the Market.' },
  { lv: 5, id: 'medic', name: 'Vesper joins', ico: '🐍', text: 'A free medic joins your crew. Ops become 2 v 2.' },
  { lv: 5, id: 'squad2', name: '2 v 2 ops', ico: '👥', text: 'Take two operators into ops.' },
  { lv: 5, id: 'howl', name: 'Howl', ico: '🐺', text: 'Rook shakes nearby foes and rallies the crew.' },
  { lv: 5, id: 'clinic', name: 'Clinic', ico: '🏥', text: 'Build a Clinic in the base: knocked-out operators patch up there.' },
  { lv: 7, id: 'squad3', name: '3 v 3 ops', ico: '👥', text: 'Take three operators into ops.' },
  { lv: 7, id: 'jobs', name: 'Operator jobs', ico: '💼', text: 'Send spare operators on 1–8 hour jobs.' },
  { lv: 7, id: 'crafting', name: 'Factory', ico: '🏭', text: 'Build a Factory: craft gear from blueprints you find.' },
  { lv: 7, id: 'rep', name: 'Rep', ico: '⭐', text: 'Earn Rep from ops and the Pirate Radio.' },
  { lv: 10, id: 'tank', name: 'Anvil joins', ico: '🦏', text: 'Anvil, a rhino Tank, joins your crew for free.' },
  { lv: 10, id: 'squad4', name: '4 v 4 ops', ico: '👥', text: 'Full squads of four.' },
  { lv: 10, id: 'allslots', name: 'All 13 gear slots', ico: '🎒', text: 'Every gear slot open on every operator.' },
  { lv: 10, id: 'bestgear', name: 'Best gear button', ico: '✨', text: 'Auto-equip the strongest kit in one tap.' },
  { lv: 15, id: 'highstakes', name: 'High Stakes', ico: '🎲', text: 'Bet XP and gear for double rewards.' },
  { lv: 15, id: 'pvpcopy', name: 'PvP vs copies', ico: '⚔️', text: 'Fight AI-run copies of other crews’ squads for trophies.' },
  { lv: 20, id: 'livepvp', name: 'Live PvP', ico: '📡', text: 'Real head-to-head fights. Coming soon.' },
];
const UNLOCK_LV = Object.fromEntries(UNLOCKS.map((u) => [u.id, u.lv]));
export const unlockLv = (id) => UNLOCK_LV[id] || 1;
export const playerLv = (s) => (s && s.player && s.player.lv) || 1;
export const isUnlocked = (s, id) => playerLv(s) >= unlockLv(id);
export const unlocksAt = (lv) => UNLOCKS.filter((u) => u.lv === lv && u.id !== 'squad2' && u.id !== 'squad3');
// Next level that opens something, with what it opens.
export function nextUnlock(s) {
  const lv = playerLv(s);
  const next = UNLOCKS.find((u) => u.lv > lv);
  if (!next) return null;
  return { lv: next.lv, items: unlocksAt(next.lv) };
}
export function squadCap(s) {
  const lv = playerLv(s);
  return lv >= 10 ? 4 : lv >= 7 ? 3 : lv >= 5 ? 2 : 1;
}

// Level-up side effects (idempotent: safe to re-run for every level <= current).
export function grantsFor(s, lv) {
  s.player.itemsGot ||= {};
  for (const li of LEVEL_ITEMS) if (lv >= li.lv && !s.player.itemsGot[li.id]) { addItem(s, li.id, 1); s.player.itemsGot[li.id] = 1; }
  if (lv >= 5 && !s.heroes.owned.vesper && !s.player.gotMedic) {
    grantHero(s, 'vesper');
    s.player.gotMedic = 1;
  }
  if (lv >= 10 && !s.heroes.owned.anvil && !s.player.gotTank) {
    grantHero(s, 'anvil');
    s.player.gotTank = 1;
  }
}

export function addPlayerXp(s, amount) {
  ensureProgress(s);
  const p = s.player;
  const out = { amount, from: p.lv, levels: [], unlocks: [] };
  p.xp += Math.max(0, Math.round(amount));
  p.total = (p.total || 0) + Math.max(0, Math.round(amount));
  while (p.lv < PLAYER_MAX && p.xp >= playerXpNeed(p.lv)) {
    p.xp -= playerXpNeed(p.lv);
    p.lv += 1;
    out.levels.push(p.lv);
    out.unlocks.push(...unlocksAt(p.lv));
    grantsFor(s, p.lv);
  }
  out.lv = p.lv; out.xp = p.xp; out.need = playerXpNeed(p.lv);
  trimSquad(s);
  return out;
}

// Debug / testing: jump to a level (?level=N).
export function setPlayerLevel(s, lv, now = Date.now()) {
  ensureProgress(s, now);
  const to = Math.max(1, Math.min(PLAYER_MAX, Math.floor(lv) || 1));
  s.player.lv = to; s.player.xp = 0;
  for (let l = 2; l <= to; l++) grantsFor(s, l);
  if (to >= 3) s.heroes.tutorialDone = true;
  trimSquad(s);
  return to;
}

// ---------------------------------------------------------------- energy
export const ENERGY_MAX = 10;
export const ENERGY_MS = 10 * 60 * 1000; // one point every 10 minutes
export const ENERGY_REFILL_ICE = 20;
export function energy(s, now = Date.now()) {
  const e = s.energy;
  if (e.n >= ENERGY_MAX) { e.at = now; return { n: e.n, max: ENERGY_MAX, nextMs: 0, fullMs: 0 }; }
  const k = Math.floor(Math.max(0, now - e.at) / ENERGY_MS);
  if (k > 0) { e.n = Math.min(ENERGY_MAX, e.n + k); e.at = e.n >= ENERGY_MAX ? now : e.at + k * ENERGY_MS; }
  const nextMs = e.n >= ENERGY_MAX ? 0 : ENERGY_MS - (now - e.at);
  return { n: e.n, max: ENERGY_MAX, nextMs, fullMs: e.n >= ENERGY_MAX ? 0 : nextMs + (ENERGY_MAX - e.n - 1) * ENERGY_MS };
}
export function spendEnergy(s, n = 1, now = Date.now()) {
  const e = energy(s, now);
  if (e.n < n) return false;
  if (s.energy.n >= ENERGY_MAX) s.energy.at = now; // the refill clock starts when you drop below full
  s.energy.n -= n;
  return true;
}
export function refillEnergy(s, now = Date.now()) {
  if (s.teeth < ENERGY_REFILL_ICE) return { ok: false, reason: `Need ${ENERGY_REFILL_ICE} Ice` };
  if (energy(s, now).n >= ENERGY_MAX) return { ok: false, reason: 'Energy is already full' };
  s.teeth -= ENERGY_REFILL_ICE;
  s.energy = { n: ENERGY_MAX, at: now };
  return { ok: true };
}

// ---------------------------------------------------------------- Hideout stockpile
export const STOCK_CAP_H = 12;
export const stockRate = (s) => ({ cash: 100 + 25 * playerLv(s), ammo: 2 }); // per hour
export function stockpile(s, now = Date.now()) {
  if (!isUnlocked(s, 'stockpile')) return { cash: 0, ammo: 0, hours: 0, full: false };
  const st = s.stockpile;
  if (!st.at) st.at = now;
  const hours = Math.min(STOCK_CAP_H, Math.max(0, (now - st.at) / 3600000));
  const r = stockRate(s);
  return { cash: Math.floor(r.cash * hours), ammo: Math.floor(r.ammo * hours), hours, full: hours >= STOCK_CAP_H, rate: r };
}
export function collectStockpile(s, now = Date.now()) {
  const p = stockpile(s, now);
  if (!isUnlocked(s, 'stockpile')) return { ok: false, reason: `Unlocks at Lv ${unlockLv('stockpile')}` };
  if (p.cash < 1 && p.ammo < 1) return { ok: false, reason: 'Nothing to collect yet' };
  const cash = gain(s, 'cash', p.cash), ammo = gain(s, 'ammo', p.ammo);
  // cash that did not fit in storage stays in the pile
  const rest = p.cash - cash;
  s.stockpile.at = rest > 0 ? now - (rest / p.rate.cash) * 3600000 : now;
  s.stats.stockpiles = (s.stats.stockpiles || 0) + 1;
  return { ok: true, cash, ammo, lost: rest };
}

// ---------------------------------------------------------------- operator jobs
export const OP_JOBS = [
  { id: 'lookout', name: 'Lookout shift', hours: 1, text: 'Watch the corner for the Grey Pack.', reward: { cash: 250 } },
  { id: 'debts', name: 'Debt round', hours: 2, text: 'Knock on a few doors in the rain.', reward: { cash: 500, influence: 15 } },
  { id: 'courier', name: 'Tail a courier', hours: 4, text: 'Follow the van to the drop and back.', reward: { cash: 900, influence: 30, parts: 6 } },
  { id: 'stakeout', name: 'All-night stakeout', hours: 8, text: 'Sit in a cold car outside the docks office.', reward: { cash: 1600, influence: 60, universal: 3 } },
];
export const jobSlots = (s) => (playerLv(s) >= 12 ? 3 : 2);
export const onJob = (s, id) => (s.opJobs || []).find((j) => j.hero === id) || null;
export function sendOnJob(s, heroId, jobId, now = Date.now()) {
  if (!isUnlocked(s, 'jobs')) return { ok: false, reason: `Operator jobs unlock at Lv ${unlockLv('jobs')}` };
  const job = OP_JOBS.find((j) => j.id === jobId);
  if (!job) return { ok: false, reason: 'Unknown job' };
  if (!s.heroes.owned[heroId]) return { ok: false, reason: 'Not in the crew' };
  if (!isAvailable(s, heroId, now)) return { ok: false, reason: 'That operator is busy' };
  if (s.opJobs.length >= jobSlots(s)) return { ok: false, reason: 'All job slots are in use' };
  const free = Object.keys(s.heroes.owned).filter((id) => id !== heroId && isAvailable(s, id, now));
  if (!free.length) return { ok: false, reason: 'Keep at least one operator home for ops' };
  s.opJobs.push({ hero: heroId, job: jobId, start: now, end: now + job.hours * 3600000 });
  s.heroes.squad = s.heroes.squad.filter((id) => id !== heroId);
  if (!s.heroes.squad.length) s.heroes.squad = [free[0]];
  return { ok: true, job };
}
export function collectJob(s, heroId, now = Date.now()) {
  const j = onJob(s, heroId);
  if (!j) return { ok: false, reason: 'Not on a job' };
  if (now < j.end) return { ok: false, reason: 'Not finished yet' };
  const job = OP_JOBS.find((x) => x.id === j.job) || OP_JOBS[0];
  const r = job.reward, got = { cash: 0, influence: 0, parts: 0, universal: 0 };
  if (r.cash) got.cash = gain(s, 'cash', r.cash);
  if (r.influence && isUnlocked(s, 'rep')) got.influence = gain(s, 'influence', r.influence);
  if (r.parts) got.parts = gain(s, 'parts', r.parts);
  if (r.universal) { s.heroes.universal = (s.heroes.universal || 0) + r.universal; got.universal = r.universal; }
  s.opJobs = s.opJobs.filter((x) => x !== j);
  s.stats.opJobs = (s.stats.opJobs || 0) + 1;
  return { ok: true, got, job };
}

// ---------------------------------------------------------------- clinic
export const CLINIC_MIN = 10; // minutes per patient
// v0.11: the clinic is a building you put down in the base. No building, no beds.
const clinicB = (s) => ((s.base && s.base.buildings) || []).filter((b) => b.t === 'clinic' && b.lv >= 1);
export const clinicBuilt = (s) => isUnlocked(s, 'clinic') && clinicB(s).length > 0;
export const clinicSlots = (s) => (clinicB(s).some((b) => b.lv >= 4) ? 3 : 2);
export const RUSH_ICE = 5;
export const inClinic = (s, id, now = Date.now()) => (s.clinic || []).find((p) => p.hero === id && p.end > now) || null;
// Patients are treated in order; with N beds, patient i starts when patient i-N is discharged.
function schedule(s, now) {
  const beds = clinicSlots(s);
  s.clinic.forEach((p, i) => {
    if (p.start <= now) return; // already being treated
    const prev = s.clinic[i - beds];
    p.start = Math.max(now, prev ? prev.end : now);
    p.end = p.start + CLINIC_MIN * 60000;
  });
}
export function admit(s, heroId, now = Date.now()) {
  if (!clinicBuilt(s) || inClinic(s, heroId, now)) return null;
  tickClinic(s, now);
  const beds = clinicSlots(s);
  const prev = s.clinic[s.clinic.length - beds];
  const start = Math.max(now, prev ? prev.end : now);
  const p = { hero: heroId, start, end: start + CLINIC_MIN * 60000 };
  s.clinic.push(p);
  s.heroes.squad = s.heroes.squad.filter((id) => id !== heroId);
  return p;
}
export function tickClinic(s, now = Date.now()) {
  const done = s.clinic.filter((p) => p.end <= now).map((p) => p.hero);
  if (done.length) { s.clinic = s.clinic.filter((p) => p.end > now); s.stats.healed = (s.stats.healed || 0) + done.length; }
  return done;
}
export function rushPatient(s, heroId, now = Date.now()) {
  const p = inClinic(s, heroId, now);
  if (!p) return { ok: false, reason: 'Not in the clinic' };
  if (s.teeth < RUSH_ICE) return { ok: false, reason: `Need ${RUSH_ICE} Ice` };
  s.teeth -= RUSH_ICE;
  s.clinic = s.clinic.filter((x) => x !== p);
  s.stats.healed = (s.stats.healed || 0) + 1;
  schedule(s, now);
  return { ok: true };
}

// ---------------------------------------------------------------- availability & squad
export function isAvailable(s, id, now = Date.now()) {
  return !!s.heroes.owned[id] && !onJob(s, id) && !inClinic(s, id, now);
}
export function busyReason(s, id, now = Date.now()) {
  const j = onJob(s, id);
  if (j) return { kind: 'job', end: j.end, text: now >= j.end ? 'Back from a job' : 'On a job' };
  const c = inClinic(s, id, now);
  if (c) return { kind: 'clinic', end: c.end, text: c.start > now ? 'Waiting for a clinic bed' : 'In the clinic' };
  return null;
}
// Squad used for ops: chosen operators that are home, capped by player level.
export function opsSquad(s, now = Date.now()) {
  const cap = squadCap(s);
  const pick = (s.heroes.squad || []).filter((id) => isAvailable(s, id, now));
  // fill empty seats with whoever is home, so a new seat at Lv 5/7/10 is used straight away
  for (const id of Object.keys(s.heroes.owned)) if (pick.length < cap && !pick.includes(id) && HEROES[id] && isAvailable(s, id, now)) pick.push(id);
  return pick.slice(0, cap);
}
export function trimSquad(s) {
  if (!s.heroes) return;
  const cap = squadCap(s);
  s.heroes.squad = (s.heroes.squad || []).filter((id) => s.heroes.owned[id]).slice(0, cap);
  if (!s.heroes.squad.length) s.heroes.squad = Object.keys(s.heroes.owned).slice(0, 1);
}

// ---------------------------------------------------------------- Rookie Track (opens at Lv 3)
const cleared = (s) => Object.keys((s.ops && s.ops.cleared) || {}).length;
const opClear = (s, id) => !!(s.ops && s.ops.cleared && s.ops.cleared[id]);
const hasB = (s, t, lv = 1) => s.base.buildings.some((b) => b.t === t && b.lv >= lv);
export const TRACK = [
  { text: 'Collect the Hideout stockpile', check: (s) => (s.stats.stockpiles || 0) >= 1, reward: { teeth: 10 } },
  { text: 'Clear the op “Corner squeeze”', check: (s) => opClear(s, 'o1'), reward: { cash: 300 } },
  { text: 'Upgrade the Knock-off Stall to level 2', check: (s) => hasB(s, 'stall', 2), reward: { cash: 300 } },
  { text: 'Reach player level 4', check: (s) => playerLv(s) >= 4, reward: { teeth: 10 } },
  { text: 'Clear 5 different ops', check: (s) => cleared(s) >= 5, reward: { cash: 400 } },
  { text: 'Build a Strongbox to hold more cash', check: (s) => hasB(s, 'strongbox'), reward: { cash: 300 } },
  { text: 'Reach player level 5', check: (s) => playerLv(s) >= 5, reward: { teeth: 15 } },
  { text: 'Win an op with two operators', check: (s) => (s.stats.duoWins || 0) >= 1, reward: { cash: 500 } },
  { text: 'Get Rook to operator level 3', check: (s) => (s.heroes.owned.rook?.lv || 1) >= 3, reward: { cash: 400 } },
  { text: 'Reach player level 6', check: (s) => playerLv(s) >= 6, reward: { teeth: 15 } },
  { text: 'Clear 10 different ops', check: (s) => cleared(s) >= 10, reward: { cash: 600 } },
  { text: 'Reach player level 7', check: (s) => playerLv(s) >= 7, reward: { teeth: 20, bp: 'smg' } },
  { text: 'Send an operator on a job', check: (s) => (s.opJobs || []).length > 0 || (s.stats.opJobs || 0) >= 1, reward: { influence: 40 } },
  { text: 'Build a Factory and craft a piece of gear', check: (s) => (s.stats.crafted || 0) >= 1, reward: { influence: 40 } },
  { text: 'Reach player level 8', check: (s) => playerLv(s) >= 8, reward: { teeth: 20 } },
  { text: 'Upgrade The Den to level 2', check: (s) => hasB(s, 'den', 2), reward: { cash: 800 } },
  { text: 'Reach player level 9', check: (s) => playerLv(s) >= 9, reward: { teeth: 20, bp: 'karambit' } },
  { text: 'Clear 15 different ops', check: (s) => cleared(s) >= 15, reward: { cash: 1000 } },
  { text: 'Reach player level 10', check: (s) => playerLv(s) >= 10, reward: { teeth: 30 } },
  { text: 'Use the Best gear button', check: (s) => (s.stats.bestGear || 0) >= 1, reward: { teeth: 30, universal: 5, item: 'wolfknux' } },
];
export function trackState(s) {
  const i = s.track.claimed;
  return TRACK.map((t, k) => ({ ...t, i: k, claimed: k < i, current: k === i, done: k <= i ? t.check(s) : t.check(s) }));
}
export function trackCurrent(s) {
  const i = s.track.claimed;
  const t = TRACK[i];
  return t ? { ...t, i, done: t.check(s) } : null;
}
export function claimTrack(s) {
  if (!isUnlocked(s, 'track')) return { ok: false, reason: `Rookie Track opens at Lv ${unlockLv('track')}` };
  const t = trackCurrent(s);
  if (!t) return { ok: false, reason: 'Track complete' };
  if (!t.done) return { ok: false, reason: 'Not done yet' };
  const r = t.reward;
  if (r.cash) gain(s, 'cash', r.cash);
  if (r.teeth) s.teeth += r.teeth;
  if (r.influence) gain(s, 'influence', r.influence);
  if (r.universal) s.heroes.universal = (s.heroes.universal || 0) + r.universal;
  if (r.item) addItem(s, r.item, 1);
  if (r.bp && !hasBlueprint(s, r.bp)) { s.blueprints ||= {}; s.blueprints[r.bp] = 1; }
  s.track.claimed += 1;
  return { ok: true, reward: r };
}

// ---------------------------------------------------------------- state
export function ensureProgress(s, now = Date.now()) {
  s.player ||= { lv: 1, xp: 0, total: 0 };
  s.player.lv = Math.max(1, s.player.lv || 1); s.player.xp ||= 0;
  if (!s.energy || typeof s.energy.n !== 'number') s.energy = { n: ENERGY_MAX, at: now };
  s.stockpile ||= { at: now };
  s.opJobs = Array.isArray(s.opJobs) ? s.opJobs.filter((j) => s.heroes.owned[j.hero]) : [];
  s.clinic = Array.isArray(s.clinic) ? s.clinic.filter((p) => s.heroes.owned[p.hero]) : [];
  s.track ||= { claimed: 0 };
  s.ops ||= { cleared: {}, runs: 0 };
  s.ops.cleared ||= {};
  s.blueprints ||= {};
  if (s.factory === undefined) s.factory = null;
  s.player.itemsGot ||= {};
  return s;
}

// Rough account level for saves made before v0.10: lesson + fights played.
export function estimateLevel(s) {
  let xp = (s.heroes?.tutorialDone ? 250 : 0) + (s.stats?.battles || 0) * 40 + (s.pvp?.wins || 0) * 20;
  let lv = 1;
  while (lv < 10 && xp >= playerXpNeed(lv)) { xp -= playerXpNeed(lv); lv++; }
  return { lv, xp: lv >= 10 ? 0 : xp };
}

export const heroName = (id) => (defOf(id) || {}).name || id;
