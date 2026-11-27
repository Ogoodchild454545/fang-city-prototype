// XCOM-style 4v4 tactics: action points, half/full cover, hitchance, flanking,
// overwatch, and a simple enemy AI. Outcomes depend on positioning and decisions.
import { addPlayerXp, ensureProgress, isUnlocked, admit } from './progression.js';
import { rngNext, rngInt, newSeed } from './rng.js';
import { defOf, HEROES, matchup, synergiesFor, opGrants } from './heroes.js';
import { starBonus, tutorialShardGift } from './shards.js';
import { levelBonus, perkMods, addXp, xpFromBattle, resetAfterKo, perkChoices, xpToNext } from './progress.js';
import { kitMods, returnUnused, commitLoadout, defaultLoadout, carryOf } from './loadout.js';
import { inB, tile, tutorialMap, avenueMap, alleyMap, crossingMap, pickDeploys, DIRS4, docklandsMap } from './tmaps.js';
import { mapFromJson } from './mapfmt.js';
import { propDef } from './catalog.js';
import { findMatch, pvpStake, settlePvp, opponentLabel } from './pvp.js';
import { statsFor, defaultEquip, rollBattleLoot, rollBlueprintLoot, rollItem, addItem, ITEMS } from './items.js';

export const MANH = (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by);

export function unitAt(b, x, y) {
  return b.units.find((u) => u.hp > 0 && u.x === x && u.y === y) || null;
}

export function walkable(b, x, y, ignoreUid) {
  if (!inB(b.map, x, y)) return false;
  const t = tile(b.map, x, y);
  if (!t || t.block) return false;
  const u = unitAt(b, x, y);
  if (u && u.uid !== ignoreUid) return false;
  return true;
}

// Bresenham LOS. A blocked tile (car, wall, crate) stops the shot unless it is the target tile.
export function hasLOS(b, ax, ay, tx, ty) {
  let x = ax, y = ay;
  const dx = Math.abs(tx - ax), dy = Math.abs(ty - ay);
  const sx = ax < tx ? 1 : -1, sy = ay < ty ? 1 : -1;
  let err = dx - dy;
  while (x !== tx || y !== ty) {
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
    if (x === tx && y === ty) return true;
    const t = tile(b.map, x, y);
    // Tall solids (containers, building walls) block LOS. Vans, crates, barriers and barrels give cover but you can fire past them.
    if (!t || t.los) return false;
  }
  return true;
}

// Cover provided to a target standing at (tx,ty) against a shot from (ax,ay).
// An adjacent cover object on the attacker's side grants its cover value (1 half, 2 full).
export function coverFrom(b, ax, ay, tx, ty) {
  let best = 0;
  for (const [dx, dy] of DIRS4) {
    const cx = tx + dx, cy = ty + dy;
    const t = tile(b.map, cx, cy);
    if (!t || !t.cover) continue;
    // Object must sit between attacker and target (on the attacker-facing side).
    const vx = ax - tx, vy = ay - ty;
    const ox = cx - tx, oy = cy - ty;
    if (vx * ox + vy * oy <= 0) continue;
    let c = t.cover;
    if (t.face >= 0) {
      const f = DIRS4[t.face];
      // directional cover only helps if the object's face points toward the attacker-ish
      if (f[0] * ox + f[1] * oy < 0 && t.face !== -1) {
        // face points the other way; still count if the object itself is in the way
      }
    }
    if (c > best) best = c;
  }
  return best;
}

export function isFlanked(b, ax, ay, tx, ty) {
  return coverFrom(b, ax, ay, tx, ty) === 0;
}

function allyNear(b, u, x, y) {
  return b.units.some((o) => o.hp > 0 && o.side === u.side && o.uid !== u.uid && MANH(o.x, o.y, x, y) === 1);
}

function squadIds(b, side) {
  return b.units.filter((u) => u.side === side).map((u) => u.hero);
}

// The gun a unit shoots with and the weapon it swings (from its equipment; legacy units fall back
// to the hero's built-in weapon).
export function gunOf(u) {
  if (u.gun !== undefined) return u.gun;
  const w = defOf(u.hero).weapon;
  return w.typ !== 'melee' ? w : null;
}
export function melOf(u) {
  if (u.mel !== undefined && u.mel) return u.mel;
  return defOf(u.hero).weapon;
}
// Abilities this unit can use right now (unlocked by level), plus any granted by gear.
export function abilitiesOf(u) {
  const d = defOf(u.hero);
  // alv: ability level = the higher of operator level and player (account) level (v0.10)
  const out = (d.abilities || []).filter((a) => !a.unlock || (u.alv || u.lv || 1) >= a.unlock);
  if ((u.charges || 0) > 0 && !out.some((a) => a.kind === 'breach')) {
    out.push({ id: 'breach', name: 'Pipe Bomb', ap: CHARGE.ap, kind: 'breach', gear: 1, text: `Throw a pipe bomb up to ${CHARGE.range} tiles: ${CHARGE.dmg} damage around the tile, sets off barrels and cars. ${u.charges} left.` });
  }
  return out;
}
export function abilityOf(u, id) { return (defOf(u.hero).abilities || []).find((a) => a.id === id) || null; }
export const cooldownLeft = (u, id) => ((u.cd || {})[id] || 0);

// v0.19 foe-targeted utilities (no damage roll): Mark Target and Pay Off.
export const UTIL_FOE = ['mark', 'bribe'];
export const BASIC_KINDS = ['shot', 'melee'];
const gritOn = (u) => defOf(u.hero).passive?.id === 'rebelgrit' && u.hp > 0 && u.hp <= u.maxHp / 2;
export function previewUtil(b, att, def, mode) {
  if (!att || !def || att.hp <= 0 || def.hp <= 0) return null;
  const abl = abilityOf(att, mode);
  const dist = MANH(att.x, att.y, def.x, def.y);
  const base = { ok: false, chance: 0, dist, cover: 0, util: true, parts: [], mode, ap: abl ? abl.ap : 1 };
  if (!abl) return { ...base, reason: 'Unknown ability' };
  if (att.jammed) return { ...base, reason: 'Jammed: no abilities this turn' };
  if (def.hidden && dist > 2) return { ...base, reason: 'Hidden in the dark' };
  if (dist > (abl.range || 5)) return { ...base, reason: 'Out of range' };
  if (mode === 'mark' && !hasLOS(b, att.x, att.y, def.x, def.y)) return { ...base, reason: 'No line of sight' };
  return { ...base, ok: true, chance: 100, reason: '' };
}

export function previewShot(b, att, def, mode = 'shot') {
  if (!att || !def || att.hp <= 0 || def.hp <= 0) return null;
  if (UTIL_FOE.includes(mode)) return previewUtil(b, att, def, mode);
  const defn = defOf(att.hero);
  const tdef = defOf(def.hero);
  const abl = defn.abilities.find((a) => a.id === mode) || null;
  // v0.19 statuses that stop an attack outright
  if (att.paid) return { ok: false, reason: 'Paid off: weapon lowered this turn', chance: 0, dist: 0, cover: 0 };
  if (att.jammed && abl && !BASIC_KINDS.includes(abl.kind) && mode !== 'overwatch') return { ok: false, reason: 'Jammed: no abilities this turn', chance: 0, dist: 0, cover: 0 };
  if (def.hidden && (mode === 'overwatch' || MANH(att.x, att.y, def.x, def.y) > 2)) return { ok: false, reason: 'Hidden in the dark', chance: 0, dist: MANH(att.x, att.y, def.x, def.y), cover: 0 };
  const gun = gunOf(att);
  if (abl && abl.gun && !gun) return { ok: false, reason: 'No gun equipped', chance: 0, dist: 0, cover: 0 };
  const melee = mode === 'melee' || mode === 'lunge' || mode === 'roll' || !!(abl && abl.melee) || !gun;
  const w = melee ? melOf(att) : gun;
  const dist = MANH(att.x, att.y, def.x, def.y);
  const range = melee ? (mode === 'lunge' ? 1 : (abl?.range || 1)) : (w.range + (att.rangeBonus || 0));
  if (dist < 1) return null;
  if (!melee && dist > range) return { ok: false, reason: 'Out of range', chance: 0, dist, cover: 0 };
  if (!melee && (att.ammo || 0) <= 0) return { ok: false, reason: 'Out of ammo', chance: 0, dist, cover: 0, empty: true };
  if (melee && mode !== 'lunge' && dist > (defn.abilities.find((a) => a.id === mode)?.range || 1)) {
    return { ok: false, reason: 'Too far', chance: 0, dist, cover: 0 };
  }
  if (!melee && !hasLOS(b, att.x, att.y, def.x, def.y)) return { ok: false, reason: 'No line of sight', chance: 0, dist, cover: 0 };
  let cover = coverFrom(b, att.x, att.y, def.x, def.y);
  if (melee && (defn.passive?.id === 'jaw') && cover === 1) cover = 0;
  if (def.exposed && cover > 0) cover -= 1; // v0.19 Cover Breaker: knocked out of their spot
  const flanked = cover === 0 && dist > 0;
  const parts = [];
  const push = (label, val) => { if (val) parts.push({ label, val }); };
  let chance = defn.aim + (att.aimMod || 0);
  parts.push({ label: 'Aim', val: chance });
  if (mode === 'aimed') { chance += 25; push('Aimed', +25); }
  if (mode === 'overwatch' && !(att.perks || []).includes('trigger')) { chance -= 15; push('Overwatch', -15); }
  if (mode === 'suppress') { chance += 10; push('Suppress', +10); }
  if (mode === 'knife' && flanked) { chance += 20; push('Knife flank', +20); }
  const sure = mode === 'backstab' && (!!att.hidden || flanked);
  if (sure) { chance += 25; push('Ambush', +25); }
  if (att.blinded) { chance -= 40; push('Blinded', -40); }
  if (def.marked) { chance += 15; push('Marked', +15); }
  if (def.blur) { chance -= 20; push('Alley Ghost', -20); }
  if (mode === 'overwatch' && tdef.species === 'Cat') { chance -= 20; push('Cat reflexes', -20); }
  if (abl && abl.aim) { chance += abl.aim; push(abl.name, abl.aim); }
  if (att.rallied) { chance += 10; push('Rallied', +10); }
  if (att.shaken) { chance -= 15; push('Shaken', -15); }
  // v0.12 Taunt: a taunted foe struggles to aim at anyone but the rhino who called them out
  if (att.taunt && att.taunt !== def.uid && b.units.some((x) => x.uid === att.taunt && x.hp > 0)) { chance -= 25; push('Taunted', -25); }
  if (def.dodge && !def.marked && defn.species !== 'Owl') { chance -= def.dodge; push('Dodge', -def.dodge); }
  if (cover === 1) { chance -= 20; push('Half cover', -20); }
  if (cover === 2) { chance -= 40; push('Full cover', -40); }
  if (flanked) { chance += FLANK_AIM; push('Flank', +FLANK_AIM); }
  // range falloff / shotgun sweet spot
  if (!melee) {
    const mid = Math.max(2, Math.floor(range * 0.45));
    if (dist > mid) { const v = -6 * (dist - mid); chance += v; push('Range', v); }
    if (w.typ === 'shotgun' && dist <= 2) { chance += 15; push('Close range', +15); }
    if (w.typ === 'shotgun' && dist >= 4) { chance -= 10; push('Long shot', -10); }
  }
  if (!att.moved && (att.perks || []).includes('cool')) { chance += 10; push('Cool', +10); }
  if (att.moved && defn.passive?.id === 'cold' && mode === 'aimed') chance -= 0; // crit later, not aim
  const aSp = defn.species, dSp = (tdef && tdef.species) || defOf(def.hero).species;
  if (aSp === 'Wolf' && (allyNear(b, att, att.x, att.y) || allyNear(b, att, def.x, def.y))) { chance += 15; push('Pack', +15); }
  if (aSp === 'Rat' && flanked) { chance += 10; push('Sneak', +10); }
  if (dSp === 'Rat' && def.moved) { chance -= 15; push('Moved rat', -15); }
  const syn = synergiesFor(squadIds(b, att.side));
  if (syn.some((g) => g.name === 'Pack Bond')) { chance += 8; push('Pack Bond', +8); }
  if (att.hero === 'sledge' && def.blinded && syn.some((g) => g.name === 'Breach and Blind')) { chance += 15; push('Breach and Blind', +15); }
  if (syn.some((g) => g.name === 'Spotter') && att.hero === 'lumen') {
    const pip = b.units.find((u) => u.hero === 'pip' && u.side === att.side && u.hp > 0);
    if (pip && hasLOS(b, pip.x, pip.y, def.x, def.y)) { chance += 12; push('Spotter', +12); }
  }
  const mu = matchup(defn, tdef);
  chance += mu.aim;
  if (mu.aim) push('Matchup', mu.aim);
  if (def.suppressed) chance += 0; // att is not suppressed
  if (att.suppressed) { chance -= 20; push('Suppressed', -20); }
  // Hunker: cover counts one step better (none -> half, half -> full); full stays full. v0.22.1: half -> full now
  // costs the extra -20 too (it used to be skipped).
  if (def.fortify && cover < 2) { cover += 1; chance -= 20; push('Fortify', -20); }
  chance = Math.max(5, Math.min(95, Math.round(chance)));
  let [d0, d1] = melee
    ? (defn.abilities.find((a) => a.id === mode && a.dmg)?.dmg || w.dmg)
    : w.dmg;
  if (abl && abl.dmgAdd) { d0 += abl.dmgAdd; d1 += abl.dmgAdd; }
  if (mode === 'suppress') { d0 = Math.max(1, Math.floor(d0 / 2)); d1 = Math.max(1, Math.floor(d1 / 2)); }
  d0 += mu.dmg; d1 += mu.dmg;
  if (melee && att.mdmg) { d0 += att.mdmg; d1 += att.mdmg; }
  if (!melee && att.rdmg) { d0 += att.rdmg; d1 += att.rdmg; }
  if (flanked && (att.perks || []).includes('bully')) { d0 += 1; d1 += 1; }
  if (att.hero === 'sable' && def.marked && syn.some((g) => g.name === 'Eyes and Knives')) { d0 += 1; d1 += 1; }
  const ap = mode === 'aimed' ? 3 : mode === 'roll' ? 3 : mode === 'overwatch' ? 0 : (defn.abilities.find((a) => a.id === mode)?.ap || 2);
  return {
    ok: true, chance, cover, flanked, dist, melee, dmg: [Math.max(1, d0), Math.max(1, d1)],
    ap, mode, note: mu.note, los: true, parts, weapon: w.name, bleed: abl?.bleed || 0, sure,
    crit: critChance(att, mode, def, flanked),
  };
}

export const FLANK_AIM = 10, FLANK_CRIT = 15;
export function critChance(att, mode, def, flanked) {
  const defn = defOf(att.hero);
  let c = 8 + (att.crit || 0);
  if (flanked) c += FLANK_CRIT; // v0.22.1: catching a piece in the open is rewarded with crits too
  if (def && def.marked && def.markEye) c += 10; // v0.19 Spotter's Eye
  if (defn.passive?.id === 'cold' && !att.moved) c += 15;
  if (mode === 'aimed') c += 8;
  return c;
}

function bfs(b, u, maxCost) {
  const start = `${u.x},${u.y}`;
  const dist = new Map([[start, 0]]);
  const prev = new Map();
  const q = [{ x: u.x, y: u.y }];
  for (let i = 0; i < q.length; i++) {
    const { x, y } = q[i];
    const d = dist.get(`${x},${y}`);
    if (d >= maxCost) continue;
    for (const [dx, dy] of DIRS4) {
      const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
      if (dist.has(k) || !walkable(b, nx, ny, u.uid)) continue;
      dist.set(k, d + 1);
      prev.set(k, { x, y });
      q.push({ x: nx, y: ny });
    }
  }
  return { dist, prev };
}

export function reachable(b, u) {
  const budget = Math.min(u.ap, (u.move || defOf(u.hero).move) + (u.sprint || 0));
  return bfs(b, u, budget);
}

export function pathTo(b, u, x, y) {
  const { dist, prev } = reachable(b, u);
  const k = `${x},${y}`;
  if (!dist.has(k)) return null;
  const path = [{ x, y }];
  let cur = k;
  while (cur !== `${u.x},${u.y}`) {
    const p = prev.get(cur);
    if (!p) break;
    path.push(p);
    cur = `${p.x},${p.y}`;
  }
  path.reverse();
  if (path[0].x === u.x && path[0].y === u.y) path.shift();
  return { path, cost: dist.get(k) };
}

function freshUnit(hero, side, x, y, uid, opts = {}) {
  const d = defOf(hero);
  const extraAp = d.passive?.id === 'scurry' ? 1 : 0;
  const fox = d.species === 'Fox';
  const bear = d.species === 'Bear';
  const stars = opts.stars || 1;
  const lv = opts.lv || 1;
  const perks = opts.perks || [];
  const gear = opts.gear || null;
  // Equipped items (by slot). No record (rivals, sims) = the hero template's starter kit.
  const equip = opts.equip || defaultEquip(hero);
  const st = statsFor(hero, { stars, lv, perks, gear, equip });
  const hp = st.hp, move = st.move;
  return {
    uid, hero, side, x, y, hp, maxHp: hp, stars, lv, perks, gear, alv: Math.max(lv, opts.alv || 0),
    equip: Object.values(equip).filter((id) => ITEMS[id]),
    aimMod: st.aimMod,
    armor: st.armor, rangeBonus: st.range, mdmg: st.mdmg, rdmg: st.rdmg,
    crit: st.crit, dodge: st.dodge, charges: st.charges, gun: st.gun, mel: st.mel,
    cd: {}, bleed: 0, shaken: 0, rallied: 0, brace: 0, taunt: 0,
    ap: st.ap, maxAp: st.ap, move, baseMove: move,
    speed: st.speed, init: 0, classId: d.classId || '',
    ammo: opts.ammo == null ? (side === 'enemy' ? 8 : 0) : opts.ammo,
    medkits: opts.medkits || 0, kills: 0,
    overwatch: false, moved: 0, acted: 0, fired: 0, lastFired: 0,
    suppressed: 0, fortify: 0, venom: 0, dashUsed: 0, rollUsed: 0, sprint: 0,
    ko: 0, facing: side === 'player' ? 0 : 2,
    // v0.19 statuses (Blinded, Marked, Exposed, Hidden, Slowed, Jammed, Paid off, Stimmed, guard links)
    blinded: 0, marked: 0, markEye: 0, exposed: 0, hidden: 0, slowed: 0, jammed: 0, paid: 0, stim: 0, coord: 0,
    blur: 0, guarding: null, guardedBy: null, bonusAmmo: 0, bonusMed: 0,
  };
}

export function packFromState(s, id) {
  const rec = s.heroes.owned[id] || {};
  return { stars: rec.stars || 1, lv: rec.lv || 1, alv: (s.player && s.player.lv) || 1, perks: rec.perks || [], gear: rec.gear || null, equip: rec.equip ? { ...rec.equip } : null };
}

export function startBattle({ map, player, enemy, seed, label, tutorial, reward, kind, stars, loadout, highStakes, pvp, opponent, enemyRecs }) {
  const b = {
    kind: kind || (tutorial ? 'tutorial' : 'street'),
    label: label || (tutorial ? 'Street lesson' : 'Street fight'),
    map, seed: (seed >>> 0) || newSeed(), rng: (seed >>> 0) || newSeed(),
    status: 'active', side: 'player', turn: 1, tutorial: tutorial || 0,
    reward: reward || { cash: 200, influence: 20 },
    units: [], log: [], highStakes: !!highStakes,
    pvp: !!(pvp || (!tutorial && (kind || 'street') === 'street')),
    queue: [], qIndex: 0, acting: null, turnSec: 30,
    opponent: opponent || null,
  };
  const pSpots = pickDeploys(map, 'player', player.length, b.seed);
  const eSpots = pickDeploys(map, 'enemy', enemy.length, b.seed + 17);
  const lo = loadout || {};
  player.forEach((id, i) => {
    const spt = pSpots[i] || { x: 1, y: 1 + i };
    const rec = (lo.recs && lo.recs[id]) || { stars: (stars || {})[id] || 1, lv: 1, perks: [], gear: null };
    b.units.push(freshUnit(id, 'player', spt.x, spt.y, 'p' + i, {
      ...rec, ammo: lo.ammo ? lo.ammo[id] || 0 : (tutorial ? 6 : 0), medkits: lo.medkits ? lo.medkits[id] || 0 : 0,
    }));
  });
  enemy.forEach((id, i) => {
    const spt = eSpots[i] || { x: map.w - 2, y: 1 + i };
    b.units.push(freshUnit(id, 'enemy', spt.x, spt.y, 'e' + i, { ...((enemyRecs && enemyRecs[i]) || {}), ammo: 8 }));
  });
  // v0.19 Runner's Stash: Reed brings one medkit of her own (not from the stockpile, never banked)
  for (const un of b.units) if (defOf(un.hero).passive?.id === 'stash') { un.medkits = (un.medkits || 0) + 1; un.bonusMed = 1; }
  b.traps = [];
  beginRound(b, true);
  return b;
}

export function startTutorial(s, seed) {
  if (typeof s === 'number' || s == null) { seed = s; s = null; }
  const recs = { rook: packFromState(s || { heroes: { owned: { rook: { lv: 1, stars: 1 } } } }, 'rook') };
  let ammo = 6, med = 0;
  if (s) {
    ammo = Math.min(6, Math.max(0, Math.floor(s.ammo || 0)));
    if (ammo) s.ammo -= ammo;
    if (ammo < 6) ammo = 6; // gift the rest so the lesson is never ammo-blocked
  }
  return startBattle({
    map: tutorialMap(), player: ['rook'], enemy: ['hook'], seed,
    label: 'Street lesson', tutorial: 1, kind: 'tutorial',
    reward: { cash: 150, influence: 10 },
    loadout: { recs, ammo: { rook: ammo || 6 }, medkits: { rook: med } },
  });
}

export function startStreet(s, seed, committed) {
  const squad = (committed?.squad || s.heroes.squad || ['rook']).filter((id) => s.heroes.owned[id]).slice(0, 4);
  const n = Math.max(1, squad.length);
  // Any mix of classes is allowed (duplicates included). Matchmaking is by trophies.
  const opponent = (committed && committed.opponent) || findMatch(s, seed, n);
  const enemy = (opponent.squad || []).slice(0, n);
  const map = (committed && committed.map) || docklandsMap();
  const place = map.flavour === 'docklands' ? 'Docklands' : (map.name || 'Custom map');
  const recs = {};
  for (const id of squad) recs[id] = packFromState(s, id);
  const high = !!(committed && committed.highStakes);
  const reward = pvpStake(n, high);
  const vs = opponent.name ? ` vs ${opponent.name}` : '';
  return startBattle({
    map, player: squad, enemy, seed: (seed >>> 0) || s.rng,
    label: (high ? `High Stakes · ${place} PvP` : `${place} · PvP`) + vs, kind: 'street',
    reward, highStakes: high, pvp: true, opponent,
    loadout: { recs, ammo: committed?.ammo || {}, medkits: committed?.medkits || {} },
  });
}

// Practice fight on any map JSON (the map editor's Play button): your squad against a mirror
// crew. No rewards, no XP, no ammo or medkits spent, nothing at stake.
export function startCustom(s, json, seed) {
  const map = mapFromJson(json);
  const owned = Object.keys(s.heroes.owned || {});
  let squad = (s.heroes.squad || []).filter((id) => s.heroes.owned[id]).slice(0, 4);
  if (!squad.length) squad = owned.slice(0, 4);
  if (!squad.length) squad = ['rook'];
  const pool = Object.keys(HEROES);
  const holder = { rng: (seed >>> 0) || 7 };
  const enemy = [];
  for (let i = 0; i < squad.length; i++) enemy.push(pool[rngInt(holder, 0, pool.length - 1)]);
  const recs = {}, ammo = {};
  for (const id of squad) { recs[id] = packFromState(s, id); ammo[id] = 8; }
  const b = startBattle({
    map, player: squad, enemy, seed: (seed >>> 0) || newSeed(),
    label: `Practice · ${map.name || 'Custom map'}`, kind: 'custom', pvp: false,
    reward: { cash: 0, influence: 0 }, loadout: { recs, ammo, medkits: {} },
  });
  b.practice = 1;
  b.mapId = json.id;
  return b;
}

function living(b, side) { return b.units.filter((u) => u.hp > 0 && (!side || u.side === side)); }

function checkEnd(b) {
  if (b.status !== 'active') return;
  if (!living(b, 'player').length) { b.status = 'loss'; b.reason = 'wiped'; }
  else if (!living(b, 'enemy').length) { b.status = 'win'; b.reason = 'clear'; }
}

function log(b, text) { b.log.push(text); if (b.log.length > 40) b.log.shift(); }

function spend(u, n) {
  if (u.ap < n) return false;
  u.ap -= n;
  return true;
}

function stepMove(b, u, path) {
  const events = [];
  for (const step of path) {
    const from = { x: u.x, y: u.y };
    u.x = step.x; u.y = step.y; u.facing = step.x > from.x ? 0 : step.x < from.x ? 2 : step.y > from.y ? 1 : 3;
    events.push({ typ: 'step', uid: u.uid, from, to: { x: u.x, y: u.y } });
    // v0.19 Tripwire: the first foe onto a rigged tile takes 4, stops dead and is Slowed next turn
    const ti = (b.traps || []).findIndex((t) => t.x === u.x && t.y === u.y && t.side !== u.side);
    if (ti >= 0) {
      const tr = b.traps.splice(ti, 1)[0];
      const dmg = Math.min(u.hp, 4);
      u.hp -= dmg; u.slowed = 2; // tripped on their own turn: limps through the next one too
      log(b, `${nameOf(u)} hits a tripwire (-${dmg}).`);
      const ev = { typ: 'trap', uid: u.uid, x: u.x, y: u.y, dmg, by: tr.uid, halted: 1 };
      if (u.hp <= 0) { u.ko = 1; u.overwatch = false; ev.ko = 1; log(b, `${nameOf(u)} is down.`); checkEnd(b); }
      events.push(ev);
      return events;
    }
    // overwatch reactions from enemies who can see this tile (Hidden pieces slip past; Blinded can't watch)
    const ows = u.hidden ? [] : b.units.filter((o) => o.hp > 0 && o.side !== u.side && o.overwatch && !o.blinded);
    for (const o of ows) {
      const prev = previewShot(b, o, u, 'overwatch');
      if (prev && prev.ok) {
        o.overwatch = false;
        const ev = resolveHit(b, o, u, 'overwatch', prev);
        events.push({ typ: 'overwatch', uid: o.uid, target: u.uid, ...ev });
        if (u.hp <= 0) return events;
      }
    }
  }
  return events;
}

function resolveHit(b, att, def, mode, prev) {
  const roll = Math.floor(rngNext(b) * 100);
  const hit = roll < prev.chance;
  const ev = { typ: 'shot', uid: att.uid, target: def.uid, mode, chance: prev.chance, roll, hit, cover: prev.cover, flanked: prev.flanked, dmg: 0, crit: 0 };
  att.fired = 1; att.lastFired = b.turn; att.acted = 1; att.overwatch = false;
  if (att.hidden) { att.hidden = 0; ev.unhide = 1; } // v0.19 attacking gives a Hidden piece away
  if (!prev.melee && (att.ammo || 0) > 0) att.ammo -= 1;
  ev.ammo = att.ammo;
  if (!hit) { log(b, `${nameOf(att)} missed ${nameOf(def)} (${prev.chance}%).`); return ev; }
  const span = prev.dmg[1] - prev.dmg[0] + 1;
  let dmg = prev.dmg[0] + Math.floor(rngNext(b) * span);
  const cc = critChance(att, mode, def, prev.flanked);
  if (prev.sure || Math.floor(rngNext(b) * 100) < cc) { ev.crit = 1; dmg += 2; } // Backstab from hiding always crits
  const raw = dmg; // v0.17: remember the blow before armour so the UI can call out what was soaked
  const tdef = defOf(def.hero);
  if (tdef.passive?.id === 'hide' || tdef.species === 'Croc') dmg = Math.max(1, dmg - 1);
  if (def.armor) dmg = Math.max(1, dmg - def.armor);
  if (def.brace) dmg = Math.max(1, dmg - def.brace); // v0.12 Brace: riot shield up
  // v0.12 Bulwark (Anvil's passive): allies standing next to him take 1 less damage
  if (b.units.some((o) => o !== def && o.side === def.side && o.hp > 0 && defOf(o.hero).passive?.id === 'bulwark' && MANH(o.x, o.y, def.x, def.y) === 1)) dmg = Math.max(1, dmg - 1);
  const syn = synergiesFor(squadIds(b, def.side));
  if (syn.some((g) => g.name === 'Field Guard') && def.hero === 'vesper') {
    const brick = b.units.find((u) => u.hero === 'brick' && u.side === def.side && u.hp > 0 && MANH(u.x, u.y, def.x, def.y) === 1);
    if (brick) dmg = Math.max(1, dmg - 1);
  }
  // v0.19 Herd Wall (buffalo next to a crewmate) and Rebel Grit (Sledge below half health)
  if (tdef.species === 'Buffalo' && allyNear(b, def, def.x, def.y)) dmg = Math.max(1, dmg - 1);
  if (gritOn(def)) dmg = Math.max(1, dmg - 1);
  dmg = Math.max(1, dmg);
  if (raw > dmg) ev.blocked = raw - dmg;
  // v0.19 Shoulder Up: the guard standing next to this piece takes half of the blow (rounded up)
  const gd = def.guardedBy && b.units.find((o) => o.uid === def.guardedBy && o.hp > 0 && o.guarding === def.uid);
  if (gd && MANH(gd.x, gd.y, def.x, def.y) === 1) {
    const share = Math.ceil(dmg / 2);
    dmg -= share;
    gd.hp = Math.max(0, gd.hp - share);
    ev.guard = { uid: gd.uid, dmg: share };
    log(b, `${nameOf(gd)} takes ${share} for ${nameOf(def)}.`);
    if (gd.hp <= 0) { gd.ko = 1; gd.overwatch = false; gd.guarding = null; def.guardedBy = null; ev.guard.ko = 1; log(b, `${nameOf(gd)} is down.`); }
  }
  if (tdef.species === 'Badger' && !def.stubbornUsed && def.hp - dmg <= 0) {
    ev.stubborn = 1;
    dmg = Math.max(0, def.hp - 1);
    def.hp = 1;
    def.stubbornUsed = 1;
    log(b, `${nameOf(def)} stays on their feet (Stubborn).`);
  } else {
    def.hp = Math.max(0, def.hp - dmg);
  }
  ev.dmg = dmg;
  if (mode === 'suppress' && tdef.species !== 'Bear' && tdef.species !== 'Rhino' && !gritOn(def)) def.suppressed = 1;
  // v0.19 Cover Breaker: knock the target a tile straight back (if it is free) and leave them Exposed
  if (mode === 'smash' && def.hp > 0) {
    def.exposed = 1; ev.exposed = 1;
    const dx = Math.sign(def.x - att.x), dy = Math.sign(def.y - att.y);
    const nx = def.x + (Math.abs(dx) >= Math.abs(dy) ? dx : 0), ny = def.y + (Math.abs(dx) >= Math.abs(dy) ? 0 : dy);
    if ((nx !== def.x || ny !== def.y) && walkable(b, nx, ny, def.uid)) {
      ev.knock = { from: { x: def.x, y: def.y }, to: { x: nx, y: ny } };
      def.x = nx; def.y = ny;
      if (def.guardedBy) def.guardedBy = null;
    }
  }
  if (mode === 'hamstring' && def.hp > 0) { def.slowed = 1; ev.slowed = 1; }
  if (mode === 'venom' || defOf(att.hero).species === 'Snake') def.venom = Math.max(def.venom || 0, 2);
  if (prev.bleed && def.hp > 0) { def.bleed = Math.max(def.bleed || 0, prev.bleed); ev.bleed = prev.bleed; }
  // Bruiser Grit: melee hits patch the bruiser up.
  if (prev.melee && defOf(att.hero).passive?.id === 'grit' && att.hp > 0 && att.hp < att.maxHp) { att.hp += 1; ev.leech = 1; }
  log(b, `${nameOf(att)} hit ${nameOf(def)} for ${dmg}${ev.crit ? ' (crit)' : ''}.`);
  if (def.hp <= 0) {
    def.ko = 1; def.overwatch = false; ev.ko = 1; def.hidden = 0;
    log(b, `${nameOf(def)} is down.`);
    att.kills = (att.kills || 0) + 1;
    if (defOf(att.hero).passive?.id === 'hot') att.ap = Math.min(att.maxAp, att.ap + 2);
    checkEnd(b);
  }
  return ev;
}

function nameOf(u) { return defOf(u.hero).name; }

// v0.19 Tinkerer (raccoon): every cooldown runs one turn shorter.
export function cdFor(u, abl) {
  const n = abl.cd || 0;
  return defOf(u.hero).species === 'Raccoon' ? Math.max(1, n - 1) : n;
}
function markFoe(u, t) {
  const eye = defOf(u.hero).passive?.id === 'spotter';
  t.marked = Math.max(t.marked || 0, eye ? 3 : 2);
  if (eye) t.markEye = 1;
}
// v0.19 tile-targeted kit (Flare, Flashbang, Tripwire): range, line and who it would catch.
export const TILE_KINDS = ['flare', 'flash', 'trap'];
export function previewTile(b, u, kind, x, y) {
  const abl = (defOf(u.hero).abilities || []).find((a) => a.kind === kind);
  const out = { ok: false, reason: '', targets: [], ap: abl ? abl.ap : 1, radius: abl ? (abl.radius || 0) : 0 };
  if (!abl) return { ...out, reason: 'Unknown ability' };
  if (abl.unlock && (u.alv || u.lv || 1) < abl.unlock) return { ...out, reason: `${abl.name} unlocks at level ${abl.unlock}` };
  if (abl.cd && cooldownLeft(u, abl.id) > 0) return { ...out, reason: `${abl.name} is recharging` };
  if (u.jammed) return { ...out, reason: 'Jammed: no abilities this turn' };
  if (x == null || y == null || !inB(b.map, x, y)) return { ...out, reason: 'Pick a tile' };
  const d = MANH(u.x, u.y, x, y);
  if (d > (abl.range || 4)) return { ...out, reason: 'Out of range' };
  if (kind === 'trap') {
    if (d < 1 || !walkable(b, x, y)) return { ...out, reason: 'Needs an empty tile' };
    if ((b.traps || []).some((t) => t.x === x && t.y === y)) return { ...out, reason: 'Already rigged' };
    return { ...out, ok: true };
  }
  const t0 = tile(b.map, x, y);
  if (!t0 || (t0.block && t0.los)) return { ...out, reason: 'Pick an open tile' };
  const r = abl.radius || 1;
  out.targets = b.units.filter((o) => o.hp > 0 && o.side !== u.side && MANH(o.x, o.y, x, y) <= r);
  return { ...out, ok: true };
}

export function apply(b, action) {
  if (b.status !== 'active') return { ok: false, reason: 'Fight is over' };
  const events = [];
  if (action.type === 'endTurn' || action.type === 'timeout') {
    return endUnitTurn(b, action.type === 'timeout');
  }
  const u = b.units.find((x) => x.uid === action.uid);
  if (!u || u.hp <= 0) return { ok: false, reason: 'No such operator' };
  if (b.acting && u.uid !== b.acting) return { ok: false, reason: 'Not their turn' };
  if (u.side !== b.side) return { ok: false, reason: 'Not their turn' };

  if (action.type === 'move') {
    const info = pathTo(b, u, action.x, action.y);
    if (!info) return { ok: false, reason: 'Cannot walk there' };
    if (!spend(u, info.cost)) return { ok: false, reason: 'Not enough AP' };
    u.moved = 1;
    const mv = { typ: 'move', uid: u.uid, path: info.path, cost: info.cost, from: { x: u.x, y: u.y } };
    events.push(mv);
    const steps = stepMove(b, u, info.path);
    events.push(...steps);
    // a tripwire stops the walk where it is: the move animation ends on that tile
    if (steps.some((e) => e.typ === 'trap')) { const k = info.path.findIndex((p) => p.x === u.x && p.y === u.y); if (k >= 0) mv.path = info.path.slice(0, k + 1); }
    // v0.19 Alley Ghost: a long run leaves her hard to hit until her next turn
    if (u.hp > 0 && info.cost >= 4 && defOf(u.hero).passive?.id === 'alleyghost') u.blur = 1;
    checkEnd(b);
    return { ok: true, events, status: b.status };
  }

  // Abilities with cooldowns / level unlocks (data-driven, see hero template).
  const ablId = action.type === 'shootProp' || action.type === 'move' ? null : (action.mode || action.type);
  const abl = ablId ? abilityOf(u, ablId) : null;
  if (abl && abl.unlock && (u.alv || u.lv || 1) < abl.unlock) return { ok: false, reason: `${abl.name} unlocks at level ${abl.unlock}` };
  if (abl && abl.cd && cooldownLeft(u, abl.id) > 0) return { ok: false, reason: `${abl.name} is recharging (${cooldownLeft(u, abl.id)} turns)` };
  const startCd = () => { if (abl && abl.cd) { u.cd ||= {}; u.cd[abl.id] = cdFor(u, abl); } };
  // v0.19 Jammed: only move, shoot, strike, hunker and overwatch until the turn ends
  if (u.jammed && abl && !BASIC_KINDS.includes(abl.kind)) return { ok: false, reason: 'Jammed: no abilities this turn' };
  const near = (t, r) => t && MANH(u.x, u.y, t.x, t.y) <= r;
  const foeT = () => { const t = b.units.find((x) => x.uid === action.target); return t && t.side !== u.side && t.hp > 0 ? t : null; };
  const allyT = () => { const t = b.units.find((x) => x.uid === action.target); return t && t.side === u.side && t.hp > 0 ? t : null; };
  const needAbl = () => (!abl ? { ok: false, reason: 'Unknown ability' } : null);

  // ---------------------------------------------------------------- v0.19 new operator kits
  if (action.type === 'guard') { // Sledge · Shoulder Up
    const e = needAbl(); if (e) return e;
    const t = allyT();
    if (!t || t.uid === u.uid) return { ok: false, reason: 'Pick a crewmate next to him' };
    if (!near(t, abl.range || 1)) return { ok: false, reason: 'Must be next to them' };
    if (!spend(u, abl.ap)) return { ok: false, reason: 'Not enough AP' };
    const old = u.guarding && b.units.find((o) => o.uid === u.guarding); if (old) old.guardedBy = null;
    u.guarding = t.uid; t.guardedBy = u.uid; u.acted = 1; startCd();
    log(b, `${nameOf(u)} shoulders up beside ${nameOf(t)}.`);
    return { ok: true, events: [{ typ: 'guard', uid: u.uid, target: t.uid, ability: abl.id }], status: b.status };
  }
  if (action.type === 'cleave') { // Sledge · Sweeping Cleave
    const e = needAbl(); if (e) return e;
    const foes = b.units.filter((o) => o.hp > 0 && o.side !== u.side && MANH(o.x, o.y, u.x, u.y) === 1);
    if (!foes.length) return { ok: false, reason: 'No foe next to him' };
    if (!spend(u, abl.ap)) return { ok: false, reason: 'Not enough AP' };
    startCd();
    const evs = [{ typ: 'cleave', uid: u.uid, targets: foes.map((f) => f.uid), ability: abl.id }];
    log(b, `${nameOf(u)} swings wide.`);
    for (const f of foes) {
      if (b.status !== 'active' || f.hp <= 0) continue;
      const prev = previewShot(b, u, f, 'cleave');
      if (prev && prev.ok) evs.push(resolveHit(b, u, f, 'cleave', prev));
    }
    return { ok: true, events: evs, status: b.status };
  }
  if (action.type === 'yell') { // Sledge · Rebel Yell
    const e = needAbl(); if (e) return e;
    if (!spend(u, abl.ap)) return { ok: false, reason: 'Not enough AP' };
    const r = abl.radius || 3, hit = [];
    for (const o of b.units) {
      if (o.hp <= 0 || o.side !== u.side || MANH(o.x, o.y, u.x, u.y) > r) continue;
      o.shaken = 0; o.suppressed = 0; o.blinded = 0; o.bleed = 0; o.rallied = 1; hit.push(o.uid);
    }
    startCd();
    log(b, `${nameOf(u)} roars for the rebels. ${hit.length} rallied.`);
    return { ok: true, events: [{ typ: 'yell', uid: u.uid, radius: r, rallied: hit, ability: abl.id }], status: b.status };
  }
  if (action.type === 'mark') { // Vigil · Mark Target
    const e = needAbl(); if (e) return e;
    const t = foeT(); if (!t) return { ok: false, reason: 'No foe there' };
    const pv = previewUtil(b, u, t, 'mark'); if (!pv.ok) return { ok: false, reason: pv.reason };
    if (!spend(u, abl.ap)) return { ok: false, reason: 'Not enough AP' };
    markFoe(u, t); u.acted = 1; startCd();
    log(b, `${nameOf(u)} marks ${nameOf(t)}.`);
    return { ok: true, events: [{ typ: 'mark', uid: u.uid, target: t.uid, targets: [t.uid], ability: abl.id }], status: b.status };
  }
  if (action.type === 'flare' || action.type === 'flash' || action.type === 'trap') {
    const e = needAbl(); if (e) return e;
    const pv = previewTile(b, u, action.type, action.x, action.y);
    if (!pv.ok) return { ok: false, reason: pv.reason };
    if (!spend(u, abl.ap)) return { ok: false, reason: 'Not enough AP' };
    u.acted = 1; startCd();
    const { x, y } = action;
    if (action.type === 'trap') { // Jinx · Tripwire
      b.traps = (b.traps || []).filter((t) => t.uid !== u.uid); // one wire at a time
      b.traps.push({ x, y, side: u.side, uid: u.uid });
      log(b, `${nameOf(u)} rigs a tripwire.`);
      return { ok: true, events: [{ typ: 'trapset', uid: u.uid, x, y, ability: abl.id }], status: b.status };
    }
    const hits = pv.targets.map((t) => t.uid);
    if (action.type === 'flare') { // Vigil · Flare
      for (const t of pv.targets) { markFoe(u, t); t.hidden = 0; }
      log(b, `${nameOf(u)} pops a flare. ${hits.length} marked.`);
      return { ok: true, events: [{ typ: 'flare', uid: u.uid, x, y, radius: abl.radius || 2, targets: hits, ability: abl.id }], status: b.status };
    }
    // Jinx · Flashbang: Blinded until their turn ends (Rebel Grit shrugs it off)
    const blinded = [];
    for (const t of pv.targets) { if (gritOn(t)) continue; t.blinded = 1; t.overwatch = false; blinded.push(t.uid); }
    log(b, `${nameOf(u)} throws a flashbang. ${blinded.length} blinded.`);
    return { ok: true, events: [{ typ: 'flashbang', uid: u.uid, x, y, radius: abl.radius || 1, targets: blinded, ability: abl.id }], status: b.status };
  }
  if (action.type === 'jam') { // Jinx · Jammer
    const e = needAbl(); if (e) return e;
    if (!spend(u, abl.ap)) return { ok: false, reason: 'Not enough AP' };
    const r = abl.radius || 5, hit = [];
    for (const o of b.units) if (o.hp > 0 && o.side !== u.side && MANH(o.x, o.y, u.x, u.y) <= r) { o.jammed = 1; o.overwatch = false; hit.push(o.uid); }
    u.acted = 1; startCd();
    log(b, `${nameOf(u)} jams their comms. ${hit.length} jammed.`);
    return { ok: true, events: [{ typ: 'jam', uid: u.uid, radius: r, targets: hit, ability: abl.id }], status: b.status };
  }
  if (action.type === 'hide') { // Sable · Shadow Step
    const e = needAbl(); if (e) return e;
    if (!spend(u, abl.ap)) return { ok: false, reason: 'Not enough AP' };
    u.hidden = 2; startCd();
    log(b, `${nameOf(u)} melts into the dark.`);
    return { ok: true, events: [{ typ: 'hide', uid: u.uid, ability: abl.id }], status: b.status };
  }
  if (action.type === 'stim') { // Reed · Stim Shot
    const e = needAbl(); if (e) return e;
    const t = allyT();
    if (!t || t.uid === u.uid) return { ok: false, reason: 'Pick a crewmate' };
    if (!near(t, abl.range || 3)) return { ok: false, reason: 'Out of range' };
    if (!spend(u, abl.ap)) return { ok: false, reason: 'Not enough AP' };
    const heal = Math.min(2, t.maxHp - t.hp);
    t.hp += heal; t.stim = 1; u.acted = 1; startCd();
    log(b, `${nameOf(u)} stims ${nameOf(t)}.`);
    return { ok: true, events: [{ typ: 'stim', uid: u.uid, target: t.uid, heal, ability: abl.id }], status: b.status };
  }
  if (action.type === 'resupply') { // Reed · Resupply
    const e = needAbl(); if (e) return e;
    const t = allyT();
    if (!t) return { ok: false, reason: 'Pick a crewmate' };
    if (t.uid !== u.uid && !near(t, abl.range || 1)) return { ok: false, reason: 'Must be next to them' };
    if (!spend(u, abl.ap)) return { ok: false, reason: 'Not enough AP' };
    t.ammo = (t.ammo || 0) + 3; t.bonusAmmo = (t.bonusAmmo || 0) + 3;
    t.shaken = 0; t.suppressed = 0; t.blinded = 0; u.acted = 1; startCd();
    log(b, `${nameOf(u)} resupplies ${nameOf(t)} (+3 rounds).`);
    return { ok: true, events: [{ typ: 'resupply', uid: u.uid, target: t.uid, ammo: 3, ability: abl.id }], status: b.status };
  }
  if (action.type === 'comms') { // Reed · Call It In
    const e = needAbl(); if (e) return e;
    if (!spend(u, abl.ap)) return { ok: false, reason: 'Not enough AP' };
    const r = abl.radius || 6, hit = [];
    for (const o of b.units) if (o.hp > 0 && o.side === u.side && o.uid !== u.uid && MANH(o.x, o.y, u.x, u.y) <= r) { o.coord = 1; o.rallied = 1; hit.push(o.uid); }
    startCd();
    log(b, `${nameOf(u)} calls it in. ${hit.length} on the radio.`);
    return { ok: true, events: [{ typ: 'comms', uid: u.uid, radius: r, rallied: hit, ability: abl.id }], status: b.status };
  }
  if (action.type === 'bribe') { // Reed · Pay Off
    const e = needAbl(); if (e) return e;
    const t = foeT(); if (!t) return { ok: false, reason: 'No foe there' };
    const pv = previewUtil(b, u, t, 'bribe'); if (!pv.ok) return { ok: false, reason: pv.reason };
    if (!spend(u, abl.ap)) return { ok: false, reason: 'Not enough AP' };
    t.paid = 1; t.overwatch = false; u.acted = 1; startCd();
    log(b, `${nameOf(u)} pays off ${nameOf(t)}.`);
    return { ok: true, events: [{ typ: 'bribe', uid: u.uid, target: t.uid, ability: abl.id }], status: b.status };
  }

  if (action.type === 'secondwind') {
    if (!abl) return { ok: false, reason: 'Unknown ability' };
    if (!spend(u, abl.ap)) return { ok: false, reason: 'Not enough AP' };
    const heal = Math.min(Math.max(1, Math.round(u.maxHp * (abl.heal || 0.35))), u.maxHp - u.hp);
    u.hp += heal; u.bleed = 0; u.venom = 0; startCd();
    log(b, `${nameOf(u)} catches a second wind (+${heal}).`);
    return { ok: true, events: [{ typ: 'heal', uid: u.uid, target: u.uid, heal, ability: abl.id }], status: b.status };
  }

  if (action.type === 'howl') {
    if (!abl) return { ok: false, reason: 'Unknown ability' };
    if (!spend(u, abl.ap)) return { ok: false, reason: 'Not enough AP' };
    const r = abl.radius || 5;
    const shaken = [], rallied = [];
    for (const o of b.units) {
      if (o.hp <= 0 || MANH(o.x, o.y, u.x, u.y) > r) continue;
      if (o.side === u.side) { o.rallied = 1; rallied.push(o.uid); } else if (defOf(o.hero).species !== 'Rhino' && !gritOn(o)) { o.shaken = 1; shaken.push(o.uid); }
    }
    startCd();
    log(b, `${nameOf(u)} howls. ${shaken.length} shaken.`);
    return { ok: true, events: [{ typ: 'howl', uid: u.uid, radius: r, shaken, rallied, ability: abl.id }], status: b.status };
  }

  // v0.12 tank kit: Brace (shield up) and Taunt (draw fire)
  if (action.type === 'brace') {
    if (!abl) return { ok: false, reason: 'Unknown ability' };
    if (!spend(u, abl.ap)) return { ok: false, reason: 'Not enough AP' };
    u.brace = abl.armor || 2; u.fortify = 1; startCd();
    log(b, `${nameOf(u)} braces behind the shield.`);
    return { ok: true, events: [{ typ: 'brace', uid: u.uid, ability: abl.id }], status: b.status };
  }
  if (action.type === 'taunt') {
    if (!abl) return { ok: false, reason: 'Unknown ability' };
    if (!spend(u, abl.ap)) return { ok: false, reason: 'Not enough AP' };
    const r = abl.radius || 5, taunted = [];
    for (const o of b.units) if (o.hp > 0 && o.side !== u.side && MANH(o.x, o.y, u.x, u.y) <= r) { o.taunt = u.uid; taunted.push(o.uid); }
    startCd();
    log(b, `${nameOf(u)} roars a challenge. ${taunted.length} taunted.`);
    return { ok: true, events: [{ typ: 'taunt', uid: u.uid, radius: r, taunted, ability: abl.id }], status: b.status };
  }

  if (action.type === 'pounce' || action.mode === 'pounce') {
    if (!abl) return { ok: false, reason: 'Unknown ability' };
    const t = b.units.find((x) => x.uid === action.target);
    if (!t || t.side === u.side || t.hp <= 0) return { ok: false, reason: 'No foe there' };
    const d0 = MANH(u.x, u.y, t.x, t.y);
    if (d0 > (abl.range || 4)) return { ok: false, reason: 'Too far to pounce' };
    let dest = { x: u.x, y: u.y };
    if (d0 > 1) {
      const spots = DIRS4.map(([dx, dy]) => ({ x: t.x + dx, y: t.y + dy }))
        .filter((p) => walkable(b, p.x, p.y, u.uid) && MANH(u.x, u.y, p.x, p.y) <= (abl.range || 4) + 1)
        .sort((a, c) => MANH(u.x, u.y, a.x, a.y) - MANH(u.x, u.y, c.x, c.y));
      if (!spots.length) return { ok: false, reason: 'No room to land' };
      dest = spots[0];
    }
    if (u.ap < abl.ap) return { ok: false, reason: 'Not enough AP' };
    spend(u, abl.ap);
    startCd();
    const events = [];
    if (dest.x !== u.x || dest.y !== u.y) {
      const from = { x: u.x, y: u.y };
      u.x = dest.x; u.y = dest.y; u.moved = 1;
      u.facing = t.x > u.x ? 0 : t.x < u.x ? 2 : t.y > u.y ? 1 : 3;
      events.push({ typ: 'pounce', uid: u.uid, from, to: { ...dest }, target: t.uid });
      log(b, `${nameOf(u)} pounces.`);
    }
    const prev = previewShot(b, u, t, 'pounce');
    if (prev && prev.ok) events.push(resolveHit(b, u, t, 'pounce', prev));
    return { ok: true, events, status: b.status };
  }

  if (action.type === 'hunker' || action.type === 'fortify') {
    if (!spend(u, 1)) return { ok: false, reason: 'Not enough AP' };
    u.fortify = 1; u.acted = 1;
    log(b, `${nameOf(u)} digs in.`);
    return { ok: true, events: [{ typ: 'fortify', uid: u.uid }], status: b.status };
  }

  if (action.type === 'overwatch') {
    if (u.blinded) return { ok: false, reason: 'Blinded: cannot set Overwatch' };
    if (!spend(u, 2)) return { ok: false, reason: 'Not enough AP' };
    u.overwatch = true; u.acted = 1;
    log(b, `${nameOf(u)} watches the street.`);
    return { ok: true, events: [{ typ: 'overwatch', uid: u.uid }], status: b.status };
  }

  if (action.type === 'dash') {
    if (u.dashUsed) return { ok: false, reason: 'Dash already used' };
    if (!spend(u, 1)) return { ok: false, reason: 'Not enough AP' };
    u.move += 2; u.dashUsed = 1;
    log(b, `${nameOf(u)} dashes.`);
    return { ok: true, events: [{ typ: 'dash', uid: u.uid }], status: b.status };
  }

  if (action.type === 'sprint') {
    if (!spend(u, 1)) return { ok: false, reason: 'Not enough AP' };
    u.sprint = (u.sprint || 0) + 2;
    log(b, `${nameOf(u)} sprints.`);
    return { ok: true, events: [{ typ: 'sprint', uid: u.uid }], status: b.status };
  }

  if (action.type === 'breach') {
    // Breach Charge: a thrown blast. Hurts operators around the tile and sets off barrels / vans,
    // but cover never changes (cover is not destructible; wrecks keep their cover).
    const prev = previewCharge(b, u, action.x, action.y);
    if (!prev.ok) return { ok: false, reason: prev.reason };
    if (!spend(u, prev.ap)) return { ok: false, reason: 'Not enough AP' };
    u.acted = 1;
    if (!(defOf(u.hero).abilities || []).some((a) => a.kind === 'breach')) u.charges = Math.max(0, (u.charges || 0) - 1);
    const { x, y } = action;
    const events = [{ typ: 'throw', uid: u.uid, x, y }];
    log(b, `${nameOf(u)} throws a breach charge.`);
    b._chargeBonus = (u.gear === 'charges') ? 1 : 0;
    const seen = new Set();
    events.push({ typ: 'boom', x, y, radius: CHARGE.radius, dmg: CHARGE.dmg, spots: [{ x, y }] });
    blastUnits(b, [{ x, y }], CHARGE.radius, CHARGE.dmg + b._chargeBonus, events);
    if (b.status === 'active') chainFrom(b, [{ x, y }], CHARGE.radius, events, seen);
    b._chargeBonus = 0;
    const syn = synergiesFor(squadIds(b, u.side));
    if (syn.some((g) => g.name === 'Breach Pair') && u.hero === 'marlow') u.ap = Math.min(u.maxAp, u.ap + 1);
    return { ok: true, events, status: b.status };
  }

  if (action.type === 'heal' || action.type === 'patch') {
    const t = b.units.find((x) => x.uid === action.target);
    if (!t || t.side !== u.side) return { ok: false, reason: 'No ally there' };
    if (t.hp <= 0) return reviveAlly(b, u, t, events);
    const defn = defOf(u.hero);
    const ab = defn.abilities.find((a) => a.kind === 'heal') || { range: 3, heal: 4, ap: 2 };
    if (MANH(u.x, u.y, t.x, t.y) > ab.range) return { ok: false, reason: 'Out of range' };
    if (!spend(u, ab.ap || 2)) return { ok: false, reason: 'Not enough AP' };
    const heal = Math.min(ab.heal || 4, t.maxHp - t.hp);
    t.hp += heal; u.acted = 1;
    log(b, `${nameOf(u)} patches ${nameOf(t)} for ${heal}.`);
    return { ok: true, events: [{ typ: 'heal', uid: u.uid, target: t.uid, heal }], status: b.status };
  }

  if (action.type === 'lunge') {
    const t = b.units.find((x) => x.uid === action.target);
    if (!t || t.side === u.side || t.hp <= 0) return { ok: false, reason: 'No foe there' };
    if (!spend(u, 2)) return { ok: false, reason: 'Not enough AP' };
    // step to the closest adjacent walkable tile, up to 3 from current
    const opts = DIRS4.map(([dx, dy]) => ({ x: t.x + dx, y: t.y + dy }))
      .filter((p) => walkable(b, p.x, p.y, u.uid) && MANH(u.x, u.y, p.x, p.y) <= 3)
      .sort((a, c) => MANH(u.x, u.y, a.x, a.y) - MANH(u.x, u.y, c.x, c.y));
    if (!opts.length && MANH(u.x, u.y, t.x, t.y) !== 1) return { ok: false, reason: 'Cannot close in' };
    if (opts.length && MANH(u.x, u.y, t.x, t.y) !== 1) {
      const dest = opts[0];
      const info = pathTo(b, { ...u, ap: 8, move: 8, sprint: 0 }, dest.x, dest.y);
      const path = info && info.cost <= 3 ? info.path : [dest];
      events.push({ typ: 'move', uid: u.uid, path, cost: 0, from: { x: u.x, y: u.y } });
      events.push(...stepMove(b, u, path));
      if (u.hp <= 0 || b.status !== 'active') return { ok: true, events, status: b.status };
    }
    u.moved = 1;
    const prev = previewShot(b, u, t, 'melee');
    if (!prev || !prev.ok) return { ok: true, events, status: b.status };
    events.push(resolveHit(b, u, t, 'melee', prev));
    return { ok: true, events, status: b.status };
  }

  if (action.type === 'medkit' || action.type === 'revive') {
    if ((u.medkits || 0) < 1) return { ok: false, reason: 'No medkit loaded' };
    const t = action.target ? b.units.find((x) => x.uid === action.target) : u;
    if (!t || t.side !== u.side) return { ok: false, reason: 'No ally there' };
    if (MANH(u.x, u.y, t.x, t.y) > 1) return { ok: false, reason: 'Must be adjacent or self' };
    if (t.hp <= 0) return reviveAlly(b, u, t, events);
    if (!spend(u, 2)) return { ok: false, reason: 'Not enough AP' };
    const extra = (u.perks || []).includes('field') ? 2 : 0;
    const heal = Math.min(5 + extra, t.maxHp - t.hp);
    t.hp += heal; u.medkits -= 1; u.acted = 1;
    log(b, `${nameOf(u)} uses a medkit on ${nameOf(t)} (+${heal}).`);
    return { ok: true, events: [{ typ: 'heal', uid: u.uid, target: t.uid, heal, medkit: 1 }], status: b.status };
  }

  if (action.type === 'shootProp' || ((action.x != null && action.y != null) && !action.target && isExplosiveAt(b, action.x, action.y))) {
    return shootProp(b, u, action.x, action.y, action.mode || 'shot');
  }

  // generic offensive: shot, aimed, suppress, venom, melee, knife, roll, blast
  let mode = action.mode || action.type;
  const t = b.units.find((x) => x.uid === action.target);
  if (!t || t.side === u.side || t.hp <= 0) return { ok: false, reason: 'No foe there' };
  let prev = previewShot(b, u, t, mode);
  if ((!prev || !prev.ok) && prev && prev.empty && MANH(u.x, u.y, t.x, t.y) === 1) {
    mode = 'melee';
    prev = previewShot(b, u, t, 'melee');
    if (prev && prev.ok) log(b, `${nameOf(u)} is out of ammo and goes in with fists.`);
  }
  if (!prev || !prev.ok) return { ok: false, reason: prev?.reason || 'Cannot shoot' };
  const mab = abilityOf(u, mode);
  const ap = mode === 'aimed' ? 3 : mode === 'roll' ? 3 : (mab && mab.cd ? mab.ap : 2);
  if (mab && mab.cd && cooldownLeft(u, mab.id) > 0) return { ok: false, reason: `${mab.name} is recharging` };
  if (mab && mab.unlock && (u.alv || u.lv || 1) < mab.unlock) return { ok: false, reason: `${mab.name} unlocks at level ${mab.unlock}` };
  if (mode === 'roll' && u.rollUsed) return { ok: false, reason: 'Already used this turn' };
  if (!spend(u, ap)) return { ok: false, reason: 'Not enough AP' };
  if (mode === 'roll') u.rollUsed = 1;
  if (mab && mab.cd) { u.cd ||= {}; u.cd[mab.id] = cdFor(u, mab); }
  events.push(resolveHit(b, u, t, mode, prev));
  return { ok: true, events, status: b.status };
}

export function speedOf(u) { return u.speed || defOf(u.hero).speed || 8; }

export function actingUnit(b) {
  return (b.units || []).find((u) => u.uid === b.acting) || null;
}

export function queueUnits(b) {
  return (b.queue || []).map((id) => b.units.find((u) => u.uid === id)).filter(Boolean);
}

function sortBySpeed(units) {
  return units.slice().sort((a, c) => (speedOf(c) - speedOf(a)) || (c.init - a.init) || a.uid.localeCompare(c.uid));
}

export function beginRound(b, first) {
  const holder = { rng: b.rng || 1 };
  if (first) {
    for (const u of b.units) u.init = rngInt(holder, 0, 99);
    b.rng = holder.rng;
  }
  const living = b.units.filter((u) => u.hp > 0);
  let order = sortBySpeed(living);
  if (b.tutorial) {
    const rook = order.find((u) => u.hero === 'rook' && u.side === 'player');
    if (rook) order = [rook, ...order.filter((u) => u !== rook)];
  }
  b.queue = order.map((u) => u.uid);
  b.qIndex = 0;
  b.turn = first ? 1 : (b.turn || 1) + (first ? 0 : 1);
  if (!first) log(b, `Round ${b.turn}.`);
  return startUnitTurn(b, order[0]);
}

function startUnitTurn(b, u) {
  const events = [];
  if (!u || u.hp <= 0) return advanceQueue(b, events);
  const d = defOf(u.hero);
  u.ap = u.maxAp;
  u.moved = 0; u.acted = 0; u.dashUsed = 0; u.rollUsed = 0; u.sprint = 0;
  u.move = (u.baseMove || d.move);
  u.overwatch = false;
  u.fortify = 0; u.brace = 0;
  // v0.19: the guard steps off, stims and radio calls land, a hamstrung or tripped piece limps
  if (u.guarding) { const g = b.units.find((o) => o.uid === u.guarding); if (g && g.guardedBy === u.uid) g.guardedBy = null; u.guarding = null; }
  u.blur = 0;
  if (u.stim) { u.ap = u.maxAp + 1; u.stim = 0; }
  if (u.coord) { u.move += 1; u.coord = 0; }
  if (u.slowed) u.move = Math.max(1, u.move - 2);
  b.acting = u.uid;
  b.side = u.side;
  if (u.cd) for (const k of Object.keys(u.cd)) { if (u.cd[k] > 0) u.cd[k] -= 1; }
  if (u.bleed > 0) {
    u.hp = Math.max(0, u.hp - 1);
    u.bleed -= 1;
    log(b, `${nameOf(u)} bleeds.`);
    events.push({ typ: 'bleed', uid: u.uid, hp: u.hp });
    if (u.hp <= 0) { u.ko = 1; checkEnd(b); if (b.status !== 'active') return { ok: true, events, status: b.status }; return advanceQueue(b, events); }
  }
  if (u.venom > 0) {
    u.hp = Math.max(0, u.hp - 1);
    u.venom -= 1;
    log(b, `${nameOf(u)} takes venom damage.`);
    events.push({ typ: 'venom', uid: u.uid, hp: u.hp });
    if (u.hp <= 0) { u.ko = 1; checkEnd(b); if (b.status !== 'active') return { ok: true, events, status: b.status }; return advanceQueue(b, events); }
  }
  if (d.species === 'Otter') { u.bleed = 0; u.venom = 0; } // v0.19 Slick: one tick and it washes off
  if (d.passive?.id === 'kit' && u.lastFired !== b.turn && u.hp > 0) {
    u.hp = Math.min(u.maxHp, u.hp + 1);
  }
  events.push({ typ: 'act', uid: u.uid, side: u.side, turn: b.turn, name: nameOf(u) });
  log(b, `${nameOf(u)} is up.`);
  return { ok: true, events, status: b.status };
}

function advanceQueue(b, events) {
  if (b.status !== 'active') return { ok: true, events, status: b.status };
  const q = b.queue || [];
  let i = (b.qIndex || 0) + 1;
  while (i < q.length) {
    const u = b.units.find((x) => x.uid === q[i]);
    if (u && u.hp > 0) {
      b.qIndex = i;
      const r = startUnitTurn(b, u);
      events.push(...(r.events || []));
      return { ok: true, events, status: b.status };
    }
    i++;
  }
  // new round
  const r = beginRound(b, false);
  events.push(...(r.events || []));
  return { ok: true, events, status: b.status };
}

function endUnitTurn(b, timedOut) {
  const events = [{ typ: 'endTurn', uid: b.acting, side: b.side, timeout: !!timedOut }];
  const u = actingUnit(b);
  if (timedOut && u && u.hp > 0 && !u.overwatch && u.ap >= 2 && !u.acted) {
    u.ap = Math.max(0, u.ap - 2);
    u.overwatch = true; u.acted = 1;
    log(b, `${nameOf(u)} runs out of time and watches the yard.`);
    events.push({ typ: 'overwatch', uid: u.uid, timeout: 1 });
  } else if (timedOut && u) {
    log(b, `${nameOf(u)} runs out of time.`);
  }
  if (u) {
    u.suppressed = 0; u.shaken = 0; u.rallied = 0; u.taunt = 0;
    // v0.19 statuses that last until the end of the affected piece's own turn
    u.blinded = 0; u.exposed = 0; u.jammed = 0; u.paid = 0;
    if (u.slowed > 0) u.slowed -= 1;
    if (u.marked > 0) { u.marked -= 1; if (!u.marked) u.markEye = 0; }
    if (u.hidden > 0) u.hidden -= 1;
  }
  checkEnd(b);
  if (b.status !== 'active') return { ok: true, events, status: b.status };
  return advanceQueue(b, events);
}

export function timeoutTurn(b) { return endUnitTurn(b, true); }

function reviveAlly(b, u, t, events) {
  if (t.hp > 0) return { ok: false, reason: 'They are still up' };
  if (MANH(u.x, u.y, t.x, t.y) > 1) return { ok: false, reason: 'Must be adjacent' };
  if (!spend(u, 2)) return { ok: false, reason: 'Not enough AP' };
  if ((u.medkits || 0) < 1) return { ok: false, reason: 'No medkit loaded' };
  u.medkits -= 1; u.acted = 1;
  const share = u.gear === 'stim' ? 0.5 : 0.4;
  const hp = Math.max(1, Math.ceil(t.maxHp * share));
  t.hp = hp; t.ko = 0;
  log(b, `${nameOf(u)} revives ${nameOf(t)} (${hp} HP).`);
  events.push({ typ: 'revive', uid: u.uid, target: t.uid, heal: hp });
  return { ok: true, events, status: b.status };
}

export function isExplosiveAt(b, x, y) {
  const t = tile(b.map, x, y);
  return !!(t && t.explosive && blastRadiusOf(t) > 0);
}

export function blastRadiusOf(t) {
  if (!t) return 0;
  if (t.decor === 'barrel') return 1;
  if (t.decor === 'van' || t.decor === 'van2' || t.decor === 'car' || t.decor === 'car2') return 2;
  const d = propDef(t.decor); // location-pack explosives (parked cars, stills, gas tanks)
  return d && d.explosive ? d.blast : 0;
}

export function previewProp(b, att, x, y, mode = 'shot') {
  if (!att || att.hp <= 0) return { ok: false, reason: 'No shooter' };
  if (!isExplosiveAt(b, x, y)) return { ok: false, reason: 'Nothing to shoot' };
  const gun = gunOf(att);
  const w = gun || melOf(att);
  const dist = MANH(att.x, att.y, x, y);
  const melee = mode === 'melee' || !gun;
  const range = melee ? 1 : (w.range + (att.rangeBonus || 0));
  if (!melee && (att.ammo || 0) <= 0) return { ok: false, reason: 'Out of ammo', empty: true, dist };
  if (dist > range) return { ok: false, reason: 'Out of range', dist };
  if (!melee && !hasLOS(b, att.x, att.y, x, y)) return { ok: false, reason: 'No line of sight', dist };
  const t = tile(b.map, x, y);
  return { ok: true, dist, melee, radius: blastRadiusOf(t), chance: 100, ap: 2, mode, x, y };
}

function explodeTile(b, x, y, events, seen) {
  const t = tile(b.map, x, y);
  if (!t || !t.explosive) return;
  const key = x + ',' + y;
  if (seen.has(key)) return;
  seen.add(key);
  const radius = blastRadiusOf(t);
  const def = propDef(t.decor);
  const dmg = (t.decor === 'barrel' ? 4 : def && def.dmg ? def.dmg : 5) + (b._chargeBonus || 0);
  // partner van tile goes at the same time
  const spots = [{ x, y }];
  if (t.partner) spots.push({ x: t.partner.x, y: t.partner.y });
  for (const s of spots) {
    const tt = tile(b.map, s.x, s.y);
    if (!tt) continue;
    seen.add(s.x + ',' + s.y);
    const was = tt.decor;
    tt.explosive = 0;
    const wd = propDef(was);
    if (was === 'barrel') tt.decor = 'barrelWreck';
    else if (wd && wd.wreck && was !== 'van') tt.decor = wd.wreck;
    else if (was === 'van2' || was === 'car2') tt.decor = 'wreck2';
    else tt.decor = 'wreck';
    // cover, block and los stay as they were
  }
  log(b, `A ${t.decor === 'barrel' || t.decor === 'barrelWreck' ? 'barrel' : def && def.explosive && t.decor !== 'van' ? def.name.toLowerCase() : 'van'} explodes!`);
  events.push({ typ: 'boom', x, y, radius, dmg, spots });
  blastUnits(b, spots, radius, dmg, events);
  if (b.status !== 'active') return;
  chainFrom(b, spots, radius, events, seen);
}

export const CHARGE = { range: 4, radius: 1, dmg: 4, ap: 2 };

export function previewCharge(b, u, x, y) {
  if (!u || u.hp <= 0) return { ok: false, reason: 'No thrower' };
  const has = (defOf(u.hero).abilities || []).some((a) => a.kind === 'breach') || (u.charges || 0) > 0;
  if (!has) return { ok: false, reason: 'No charges' };
  const t = tile(b.map, x, y);
  if (!t) return { ok: false, reason: 'Off the map' };
  const dist = MANH(u.x, u.y, x, y);
  if (dist < 1 || dist > CHARGE.range) return { ok: false, reason: 'Out of throw range', dist };
  if (t.block && !t.explosive) return { ok: false, reason: 'Throw onto open ground', dist };
  return { ok: true, dist, radius: CHARGE.radius, dmg: CHARGE.dmg, ap: CHARGE.ap, x, y };
}

function blastUnits(b, centers, radius, dmg, events) {
  for (const u of b.units) {
    if (u.hp <= 0) continue;
    const dist = Math.min(...centers.map((s) => MANH(u.x, u.y, s.x, s.y)));
    if (dist > radius) continue;
    let take = dmg;
    const sp = defOf(u.hero).species;
    if (defOf(u.hero).passive?.id === 'hide' || sp === 'Croc') take = Math.max(1, take - 1);
    if (u.armor) take = Math.max(1, take - u.armor);
    if (sp === 'Badger' && !u.stubbornUsed && u.hp - take <= 0) {
      take = Math.max(0, u.hp - 1); u.hp = 1; u.stubbornUsed = 1;
      log(b, `${nameOf(u)} stays on their feet (Stubborn).`);
    } else {
      u.hp = Math.max(0, u.hp - take);
    }
    events.push({ typ: 'boomhit', uid: u.uid, dmg: take, x: u.x, y: u.y });
    log(b, `${nameOf(u)} is caught in the blast (${take}).`);
    if (u.hp <= 0) { u.ko = 1; }
  }
  checkEnd(b);
}

// chain nearby unexploded barrels / vans
function chainFrom(b, centers, radius, events, seen) {
  for (let yy = 0; yy < b.map.h; yy++) {
    for (let xx = 0; xx < b.map.w; xx++) {
      const n = tile(b.map, xx, yy);
      if (!n || !n.explosive) continue;
      const dist = Math.min(...centers.map((s) => MANH(xx, yy, s.x, s.y)));
      if (dist <= radius) explodeTile(b, xx, yy, events, seen);
    }
  }
}

function shootProp(b, u, x, y, mode) {
  const prev = previewProp(b, u, x, y, mode);
  if (!prev.ok) return { ok: false, reason: prev.reason };
  if (!spend(u, prev.ap || 2)) return { ok: false, reason: 'Not enough AP' };
  if (!prev.melee && (u.ammo || 0) > 0) u.ammo -= 1;
  u.acted = 1;
  const events = [{ typ: 'shot', uid: u.uid, x, y, hit: 1, mode: mode || 'shot', prop: 1 }];
  log(b, `${nameOf(u)} shoots the ${tile(b.map, x, y)?.decor || 'object'}.`);
  b._chargeBonus = (u.gear === 'charges') ? 1 : 0;
  explodeTile(b, x, y, events, new Set());
  b._chargeBonus = 0;
  return { ok: true, events, status: b.status };
}

// kept name so older calls still compile; ends the current operator's go
function endTurn(b) { return endUnitTurn(b, false); }



function approachScore(b, u, x, y, foes) {
  let best = 0;
  for (const f of foes) {
    const before = MANH(u.x, u.y, f.x, f.y);
    const after = MANH(x, y, f.x, f.y);
    best = Math.max(best, (before - after) * 18);
    const ghost = { ...u, x, y };
    const mode = (!gunOf(u) || (u.ammo || 0) <= 0 || (u.mel && defOf(u.hero).template)) ? 'melee' : 'shot';
    const prev = previewShot(b, ghost, f, mode);
    if (prev && prev.ok) best = Math.max(best, 20 + prev.chance * 0.5 + (prev.flanked ? 16 : 0) - prev.cover * 6);
  }
  const c = foes[0] ? coverFrom(b, foes[0].x, foes[0].y, x, y) : 0;
  best += c * 6;
  return best;
}

function closeInStep(b, u, foes) {
  let bestP = null;
  for (const f of foes) for (const [dx, dy] of DIRS4) {
    const x = f.x + dx, y = f.y + dy;
    if (!walkable(b, x, y, u.uid) && !(x === u.x && y === u.y)) continue;
    const info = pathTo(b, { ...u, ap: 99, move: 99, sprint: 0 }, x, y);
    if (info && info.path && (!bestP || info.cost < bestP.cost)) bestP = info;
  }
  if (!bestP || !bestP.path.length) return null;
  const { dist } = reachable(b, u);
  for (let i = bestP.path.length - 1; i >= 0; i--) {
    const p = bestP.path[i];
    if (dist.get(`${p.x},${p.y}`)) return p;
  }
  return null;
}

// Pick one action for whoever's turn it is.
export function think(b) {
  if (b.status !== 'active') return { type: 'endTurn' };
  const me = b.side;
  const foes = living(b, me === 'player' ? 'enemy' : 'player');
  const actor = actingUnit(b);
  const mine = (actor && actor.hp > 0 && actor.ap > 0 && actor.side === me) ? [actor] : living(b, me).filter((u) => u.ap > 0 && (!b.acting || u.uid === b.acting));
  if (!mine.length || !foes.length) return { type: 'endTurn' };
  let best = null, bestScore = -999;

  const consider = (action, score) => { if (score > bestScore) { bestScore = score; best = action; } };

  for (const u of mine) {
    const defn = defOf(u.hero);
    const modes = ['aimed', 'shot', 'venom', 'suppress', 'melee', 'roll', 'knife', 'maul', 'pounce', 'smash', 'backstab', 'hamstring'];
    const abls = abilitiesOf(u);
    const ready = (id) => { if (u.jammed) return null; const a = abls.find((x) => x.id === id || x.kind === id); return a && !(a.cd && cooldownLeft(u, a.id) > 0) && u.ap >= a.ap ? a : null; };
    thinkV019(b, u, foes, ready, consider);
    // Second Wind when hurt; Howl first while foes are close and AP remains to follow up.
    const sw = ready('secondwind');
    if (sw && u.ap >= sw.ap && u.hp <= u.maxHp * 0.5) consider({ type: 'secondwind', uid: u.uid }, 70 + (u.maxHp - u.hp) * 6);
    // Tank: taunt when two or more foes are close, brace when hurt and in reach of foes
    const tt = ready('taunt');
    if (tt && u.ap >= tt.ap && !u.acted) {
      const near = foes.filter((f) => MANH(u.x, u.y, f.x, f.y) <= (tt.radius || 5)).length;
      if (near >= 2) consider({ type: 'taunt', uid: u.uid }, 120 + near * 12);
    }
    const br = ready('brace');
    if (br && u.ap >= br.ap && u.ap <= 2 && foes.some((f) => MANH(u.x, u.y, f.x, f.y) <= 7)) consider({ type: 'brace', uid: u.uid }, 55 + (u.maxHp - u.hp) * 3);
    const hw = ready('howl');
    if (hw && u.ap >= hw.ap + 2 && !u.acted && foes.some((f) => MANH(u.x, u.y, f.x, f.y) <= Math.min(2, hw.radius || 5))) {
      consider({ type: 'howl', uid: u.uid }, 150 + foes.filter((f) => MANH(u.x, u.y, f.x, f.y) <= (hw.radius || 5)).length * 10);
    }
    for (const f of foes) {
      for (const mode of modes) {
        if (!['shot', 'melee'].includes(mode) && !abls.some((a) => a.kind === mode || a.id === mode)) continue;
        if (mode === 'melee' && gunOf(u) && !u.mel && defn.weapon.typ !== 'melee' && (u.ammo || 0) > 0) continue;
        const ab = abls.find((a) => a.id === mode);
        if (ab && ab.cd && cooldownLeft(u, ab.id) > 0) continue;
        const prev = previewShot(b, u, f, mode);
        if (!prev || !prev.ok) continue;
        const ap = prev.ap || 2;
        if (u.ap < ap) continue;
        let score = 40 + prev.chance + prev.dmg[0] * 8 + (prev.flanked ? 20 : 0) - prev.cover * 8;
        if (f.hp <= prev.dmg[1]) score += 30;
        if (u.taunt && f.uid !== u.taunt && b.units.some((x) => x.uid === u.taunt && x.hp > 0)) score -= 45;
        if (prev.bleed && f.hp > prev.dmg[1]) score += 12;
        if (mode === 'pounce') score += prev.dist > 1 ? 14 : -20;
        if (mode === 'smash') score += 10 + prev.cover * 10;
        if (mode === 'backstab') score += prev.sure ? 18 : 4;
        if (mode === 'hamstring') score += 6;
        consider({ type: mode, uid: u.uid, target: f.uid, mode }, score);
      }
      if (defn.abilities.some((a) => a.kind === 'lunge') && u.ap >= 2) {
        const dist = MANH(u.x, u.y, f.x, f.y);
        if (dist > 1 && dist <= 4) consider({ type: 'lunge', uid: u.uid, target: f.uid }, 50 + (5 - dist) * 6);
      }
    }
    // Shoot a barrel or van if the blast hurts more foes than friends
    if (u.ap >= 2 && (u.ammo || 0) > 0) {
      for (let y = 0; y < b.map.h; y++) for (let x = 0; x < b.map.w; x++) {
        if (!isExplosiveAt(b, x, y)) continue;
        const prev = previewProp(b, u, x, y, 'shot');
        if (!prev || !prev.ok) continue;
        const t = tile(b.map, x, y);
        const r = blastRadiusOf(t);
        let foesHit = 0, friendsHit = 0;
        for (const o of b.units) {
          if (o.hp <= 0) continue;
          if (MANH(o.x, o.y, x, y) <= r) { if (o.side === u.side) friendsHit++; else foesHit++; }
        }
        if (foesHit > friendsHit) consider({ type: 'shootProp', uid: u.uid, x, y, mode: 'shot' }, 30 + foesHit * 18 - friendsHit * 22);
      }
    }
    const { dist } = reachable(b, u);
    for (const [k, cost] of dist) {
      if (!cost) continue;
      const [x, y] = k.split(',').map(Number);
      const sc = approachScore(b, u, x, y, foes) - cost * 2;
      consider({ type: 'move', uid: u.uid, x, y }, sc);
    }
    if (u.ap >= 2 && u.acted === 0 && !u.blinded) consider({ type: 'overwatch', uid: u.uid }, 12);
  }
  // An operator with no rounds left can only win up close. If nothing better came up (e.g. a fence
  // makes the straight-line approach look bad), walk the real path toward the nearest foe.
  if (!best || best.type === 'overwatch' || (best.type === 'move' && bestScore < 8)) {
    const u = (best && mine.find((x) => x.uid === best.uid)) || mine[0];
    if (u && (((u.ammo || 0) <= 0 && defOf(u.hero).weapon.typ !== 'melee') || (u.mel && defOf(u.hero).template))) {
      const step = closeInStep(b, u, foes);
      if (step) return { type: 'move', uid: u.uid, x: step.x, y: step.y };
    }
  }
  if (!best) return { type: 'endTurn' };
  // Don't wander for a tiny score; if the best is a weak shuffle, overwatch or end.
  if (best.type === 'move' && bestScore < 8) {
    const u = mine.find((x) => x.uid === best.uid);
    if (u && u.ap >= 2 && !u.blinded) return { type: 'overwatch', uid: u.uid };
    return { type: 'endTurn' };
  }
  return best;
}

export function thinkAsPlayer(b) { return think(b); }

// v0.19 AI for the new kits (rival copies and practice crews use these operators too).
function thinkV019(b, u, foes, ready, consider) {
  const allies = living(b, u.side).filter((o) => o.uid !== u.uid);
  const D = (a, c) => MANH(a.x, a.y, c.x, c.y);
  const debuffed = (o) => o.shaken || o.suppressed || o.blinded || o.bleed > 0;
  let a;
  if ((a = ready('cleave'))) {
    const n = foes.filter((f) => D(u, f) === 1).length;
    if (n >= 2) consider({ type: 'cleave', uid: u.uid }, 95 + n * 25);
  }
  if ((a = ready('guard')) && !u.guarding) {
    const w = allies.filter((o) => D(u, o) === 1 && o.hp < o.maxHp * 0.7 && foes.some((f) => D(o, f) <= 8)).sort((p, q) => p.hp - q.hp)[0];
    if (w) consider({ type: 'guard', uid: u.uid, target: w.uid }, 58 + (w.maxHp - w.hp) * 3);
  }
  if ((a = ready('yell'))) {
    const n = [u, ...allies].filter((o) => D(u, o) <= (a.radius || 3) && debuffed(o)).length;
    if (n) consider({ type: 'yell', uid: u.uid }, 70 + n * 18);
  }
  if ((a = ready('mark'))) {
    const t = foes.filter((f) => !f.marked && previewUtil(b, u, f, 'mark').ok).sort((p, q) => p.hp - q.hp)[0];
    if (t && u.ap >= a.ap + 2) consider({ type: 'mark', uid: u.uid, target: t.uid }, 88);
  }
  if ((a = ready('bribe'))) {
    const t = foes.filter((f) => !f.paid && previewUtil(b, u, f, 'bribe').ok).sort((p, q) => (q.maxHp + (q.aimMod || 0)) - (p.maxHp + (p.aimMod || 0)))[0];
    if (t) consider({ type: 'bribe', uid: u.uid, target: t.uid }, 92);
  }
  if ((a = ready('jam'))) {
    const inR = foes.filter((f) => D(u, f) <= (a.radius || 5));
    const ow = inR.filter((f) => f.overwatch).length;
    if (inR.length >= 2 || ow) consider({ type: 'jam', uid: u.uid }, 50 + inR.length * 14 + ow * 25);
  }
  if ((a = ready('hide')) && !u.hidden && !u.acted && foes.some((f) => D(u, f) <= 7) && !foes.some((f) => D(u, f) === 1)) {
    consider({ type: 'hide', uid: u.uid }, 60 + (u.hp < u.maxHp * 0.6 ? 20 : 0));
  }
  if ((a = ready('stim'))) {
    const t = allies.filter((o) => !o.stim && D(u, o) <= (a.range || 3)).sort((p, q) => (q.maxAp - p.maxAp) || (p.hp - q.hp))[0];
    if (t) consider({ type: 'stim', uid: u.uid, target: t.uid }, 52 + (t.hp < t.maxHp ? 8 : 0));
  }
  if ((a = ready('resupply'))) {
    const t = [u, ...allies].filter((o) => (o === u || D(u, o) <= 1) && ((gunOf(o) && (o.ammo || 0) <= 1) || o.shaken || o.suppressed || o.blinded))[0];
    if (t) consider({ type: 'resupply', uid: u.uid, target: t.uid }, 66);
  }
  if ((a = ready('comms'))) {
    const n = allies.filter((o) => D(u, o) <= (a.radius || 6)).length;
    if (n >= 2) consider({ type: 'comms', uid: u.uid }, 44 + n * 9);
  }
  for (const kind of ['flash', 'flare']) {
    if (!(a = ready(kind))) continue;
    let best = null, bs = 0;
    for (const f of foes) for (const [dx, dy] of [[0, 0], ...DIRS4]) {
      const x = f.x + dx, y = f.y + dy;
      const pv = previewTile(b, u, kind, x, y);
      if (!pv.ok || !pv.targets.length) continue;
      const fresh = pv.targets.filter((t) => (kind === 'flash' ? !t.blinded : !t.marked));
      const sc = fresh.length * 30 + pv.targets.filter((t) => t.overwatch || t.hidden).length * 20;
      if (sc > bs) { bs = sc; best = { x, y }; }
    }
    if (best && bs >= 30) consider({ type: kind, uid: u.uid, x: best.x, y: best.y }, (kind === 'flash' ? 62 : 58) + bs);
  }
  if ((a = ready('trap')) && !(b.traps || []).some((t) => t.uid === u.uid)) {
    const f = foes.slice().sort((p, q) => D(u, p) - D(u, q))[0];
    if (f && D(u, f) <= 9) {
      let best = null, bd = 99;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const x = u.x + dx, y = u.y + dy;
        if (!previewTile(b, u, 'trap', x, y).ok) continue;
        const d = MANH(x, y, f.x, f.y);
        if (d < bd) { bd = d; best = { x, y }; }
      }
      if (best) consider({ type: 'trap', uid: u.uid, x: best.x, y: best.y }, 34);
    }
  }
}

export function autoplay(b, max = 200) {
  let n = 0;
  while (b.status === 'active' && n++ < max) {
    const act = b.side === 'enemy' ? think(b) : thinkAsPlayer(b);
    const r = apply(b, act);
    if (!r.ok) apply(b, { type: 'endTurn' });
  }
  return b;
}

export function resolveTactics(s, b) {
  if (!b || (b.status !== 'win' && b.status !== 'loss')) return null;
  const res = {
    kind: b.kind, label: b.label, win: b.status === 'win', reason: b.reason,
    cash: 0, influence: 0, teeth: 0, highStakes: !!b.highStakes, xp: [], lost: [], returned: null,
  };
  if (b.practice) {
    // practice on a custom map: nothing is spent, won or lost
    res.practice = true; res.mapId = b.mapId;
    s.tactics = null;
    s.lastTactics = res;
    return res;
  }
  // unused ammo / medkits come back; spent rounds stay gone (ops issue their own ammo)
  res.returned = b.freeAmmo ? { ammo: 0, medkits: 0 } : returnUnused(s, b.units);
  if (b.status === 'win') {
    res.cash = b.reward?.cash || 0;
    res.influence = isUnlocked(s, 'rep') ? (b.reward?.influence || 0) : 0;
    s.cash += res.cash;
    s.influence += res.influence;
    s.lifetime = (s.lifetime || 0) + res.cash;
    s.heroes.wins = (s.heroes.wins || 0) + 1;
    s.stats.wins = (s.stats.wins || 0) + 1;
    if (b.kind === 'tutorial' && !s.heroes.tutorialDone) {
      s.heroes.tutorialDone = true;
      res.tutorial = true;
      res.shardDrop = tutorialShardGift(s);
      res.item = rollBattleLoot(s, 'tutorial');
    } else if (b.kind !== 'tutorial') {
      res.item = rollBattleLoot(s, b.kind);
      res.bp = rollBlueprintLoot(s, b.kind);
    }
  }
  if (b.pvp && b.kind === 'street') {
    const pv = settlePvp(s, b);
    res.trophies = pv.trophies;
    res.trophiesNow = pv.trophiesNow;
    res.league = pv.league;
    res.opponent = pv.opponent;
    if (b.status === 'win' && pv.shardDrop) res.shardDrop = pv.shardDrop;
    // PvP wins sometimes pay out a Rare-or-better piece, reward-only gear included
    if (b.status === 'win' && !res.item && rngNext(s) < 0.12) { res.item = rollItem(s, { minQ: 2, rewards: true }); addItem(s, res.item, 1); }
  }
  for (const u of b.units.filter((x) => x.side === 'player')) {
    const rec = s.heroes.owned[u.hero];
    if (!rec) continue;
    if (b.highStakes && u.hp <= 0) {
      const lost = resetAfterKo(rec);
      lost.id = u.hero; lost.name = defOf(u.hero).name;
      // The winner also strips anything worth having off the body (worn starter kit is left).
      lost.items = [];
      for (const [sl, it] of Object.entries(rec.equip || {})) {
        if (ITEMS[it] && ITEMS[it].q !== 'worn') { lost.items.push(it); delete rec.equip[sl]; }
      }
      res.lost.push(lost);
      continue;
    }
    const amount = xpFromBattle(u, b.status === 'win', b.highStakes);
    const gained = addXp(rec, amount);
    if (gained.some((g) => g.perk) && rec.pendingPerk) {
      rec.pendingChoices = perkChoices(u.hero, rec.perks || []);
    }
    res.xp.push({
      id: u.hero, name: defOf(u.hero).name, amount, lv: rec.lv, xp: rec.xp, need: xpToNext(rec.lv),
      gained, kills: u.kills || 0, survived: u.hp > 0, pendingChoices: rec.pendingChoices || null,
    });
  }
  // v0.10: account XP, op clears and the clinic
  ensureProgress(s);
  const win = b.status === 'win';
  const opId = b.opId || (b.kind === 'tutorial' ? 't1' : null);
  if (opId && OPS_XP[opId] != null) {
    const first = !(s.ops.cleared[opId]);
    if (win) { s.ops.cleared[opId] = (s.ops.cleared[opId] || 0) + 1; res.firstClear = first; }
    // v0.19: some operators join on the first clear of a particular op (Jinx after "Hot metal")
    if (win && first) { const j = opGrants(s); if (j.length) res.joined = j.map((id) => ({ id, name: defOf(id).name })); }
    res.opId = opId;
    if (win && b.units.filter((u) => u.side === 'player').length >= 2) s.stats.duoWins = (s.stats.duoWins || 0) + 1;
    const tut = OPS_XP[opId];
    res.playerXp = addPlayerXp(s, tut ? (win && first ? tut : win ? Math.round(tut / 2) : 10) : (win ? 30 + (first ? 30 : 0) : 10));
  } else if (b.kind === 'street') {
    res.playerXp = addPlayerXp(s, win ? 40 : 15);
  }
  if (isUnlocked(s, 'clinic') && (opId || b.kind === 'street')) {
    const lostIds = new Set(res.lost.map((l) => l.id));
    res.clinic = [];
    for (const u of b.units) if (u.side === 'player' && u.hp <= 0 && !lostIds.has(u.hero) && admit(s, u.hero)) res.clinic.push(u.hero);
  }
  s.stats.battles = (s.stats.battles || 0) + 1;
  s.tactics = null;
  s.lastTactics = res;
  return res;
}
// Tutorial-op first-clear XP (others use the regular op formula). Mirrors ops.js opXp.
const OPS_XP = { t1: 90, t2: 80, t3: 80, ...Object.fromEntries(Array.from({ length: 30 }, (_, i) => ['o' + (i + 1), 0])) };

export function coverLabel(c) { return c >= 2 ? 'Full cover' : c === 1 ? 'Half cover' : 'No cover'; }

// v0.14: every buff and debuff on a unit, in plain words, for the tap-a-piece status panel and the
// little icons over pieces. `turns` = turns left (null when it lasts until something happens).
// Pure read of unit state; the rules that apply them live above.
export function statusesOf(b, u) {
  if (!u) return [];
  const out = [];
  const add = (id, name, kind, text, turns = null) => out.push({ id, name, kind, text, turns });
  const d = defOf(u.hero) || {};
  const nm = (uid) => { const o = b.units.find((x) => x.uid === uid); return o ? nameOf(o) : 'them'; };
  if (u.hp <= 0) add('ko', 'Knocked out', 'debuff', 'Down and out of the fight unless a medic revives them.');
  if (u.bleed > 0) add('bleed', 'Bleeding', 'debuff', `Loses 1 HP at the start of each of their turns. ${u.bleed} HP to lose in total.`, u.bleed);
  if (u.venom > 0) add('venom', 'Poisoned', 'debuff', `Venom: loses 1 HP at the start of each of their turns.`, u.venom);
  if (u.shaken) add('shaken', 'Shaken', 'debuff', '-15 aim on every shot and strike until the end of their next turn.', 1);
  if (u.suppressed) add('suppressed', 'Suppressed', 'debuff', 'Pinned down: -20 aim until the end of their next turn.', 1);
  if (u.taunt && b.units.some((x) => x.uid === u.taunt && x.hp > 0)) add('taunted', 'Taunted', 'debuff', `Called out by ${nm(u.taunt)}: -25 aim against anyone except ${nm(u.taunt)} until the end of their next turn.`, 1);
  if (u.rallied) add('rallied', 'Rallied', 'buff', '+10 aim until the end of their next turn.', 1);
  if (u.brace) add('braced', 'Braced', 'buff', `Shield up: takes ${u.brace} less damage from every hit until their next turn.`, 1);
  if (u.fortify && !u.brace) add('hunkered', 'Hunkered', 'buff', 'Cover counts one step better (half cover becomes full) until their next turn.', 1);
  if (u.overwatch) add('overwatch', 'Overwatch', 'buff', 'Will shoot the first enemy who moves into range (−15 aim on that shot).', null);
  if (u.sprint) add('sprint', 'Sprinting', 'buff', `+${u.sprint} move this turn.`, 1);
  if (u.hp > 0 && b.units.some((o) => o !== u && o.side === u.side && o.hp > 0 && defOf(o.hero).passive?.id === 'bulwark' && MANH(o.x, o.y, u.x, u.y) === 1)) add('bulwark', 'Bulwark', 'buff', 'Standing next to Anvil: takes 1 less damage from every hit.', null);
  if (u.hp > 0 && d.species === 'Badger' && !u.stubbornUsed) add('stubborn', 'Stubborn', 'buff', 'The first hit that would knock them out leaves them on 1 HP instead.', null);
  if (u.blinded) add('blinded', 'Blinded', 'debuff', 'Flashbanged: -40 aim, cannot keep or set Overwatch until the end of their next turn.', 1);
  if (u.marked > 0) add('marked', 'Marked', 'debuff', `Painted for the crew: +15 aim against them and their Dodge is ignored${u.markEye ? ', and +10% crit' : ''}.`, u.marked);
  if (u.exposed) add('exposed', 'Exposed', 'debuff', 'Knocked out of their spot: their cover counts one step worse until the end of their next turn.', 1);
  if (u.jammed) add('jammed', 'Jammed', 'debuff', 'Comms down: no abilities (only move, shoot, strike) until the end of their next turn.', 1);
  if (u.paid) add('paid', 'Paid off', 'debuff', 'Took the envelope: cannot attack on their next turn (can still move).', 1);
  if (u.slowed) add('slowed', 'Slowed', 'debuff', '-2 Move on their next turn.', 1);
  if (u.hidden > 0) add('hidden', 'Hidden', 'buff', 'Only foes within 2 tiles can target them, and Overwatch never fires at them. Ends when they attack.', u.hidden);
  if (u.stim) add('stim', 'Stimmed', 'buff', '+1 AP at the start of their next turn.', 1);
  if (u.coord) add('coord', 'On the radio', 'buff', '+1 Move at the start of their next turn.', 1);
  if (u.blur) add('blur', 'Alley Ghost', 'buff', '+20 Dodge until their next turn.', 1);
  if (u.guarding) add('guarding', 'Shoulder Up', 'buff', `Taking half of every hit on ${nm(u.guarding)}.`, 1);
  if (u.guardedBy && b.units.some((x) => x.uid === u.guardedBy && x.hp > 0)) add('guarded', 'Guarded', 'buff', `${nm(u.guardedBy)} takes half of every hit on them.`, 1);
  if (u.hp > 0 && d.passive?.id === 'rebelgrit' && u.hp <= u.maxHp / 2) add('grit', 'Rebel Grit', 'buff', '-1 damage from every hit; cannot be Shaken, Suppressed or Blinded.', null);
  if (u.hp > 0 && u.ammo != null && u.ammo <= 0 && gunOf(u)) add('noammo', 'Out of ammo', 'debuff', 'Cannot shoot until resupplied; melee only.', null);
  return out;
}

// v0.22.1: how much cover a piece has right now against the opposing pieces that can see it (worst case),
// using the same rules as previewShot: half -20 to hit, full -40, none = flanked (+10), Hunker one step better.
export function coverInfo(b, un) {
  const foes = b.units.filter((q) => q.hp > 0 && q.side !== un.side && !q.paid);
  const seen = foes.filter((q) => hasLOS(b, q.x, q.y, un.x, un.y) || MANH(q.x, q.y, un.x, un.y) <= 1);
  if (!seen.length) return { level: -1, by: null, each: [] };
  // cover is directional: a crate only protects against shots from its side, so it is worked out per rival
  const each = seen.map((q) => {
    let c = coverFrom(b, q.x, q.y, un.x, un.y);
    if (un.exposed && c > 0) c -= 1;
    if (un.fortify) c = Math.min(2, c + 1);
    return { level: c, by: q };
  });
  const worst = each.reduce((m, e) => (e.level < m.level ? e : m), each[0]);
  return { level: worst.level, by: worst.by, each };
}
