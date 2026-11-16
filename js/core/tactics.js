// XCOM-style 4v4 tactics: action points, half/full cover, hitchance, flanking,
// overwatch, and a simple enemy AI. Outcomes depend on positioning and decisions.
import { rngNext, rngInt, newSeed } from './rng.js';
import { defOf, HEROES, matchup, synergiesFor } from './heroes.js';
import { starBonus, tutorialShardGift } from './shards.js';
import { levelBonus, perkMods, addXp, xpFromBattle, resetAfterKo, perkChoices, xpToNext } from './progress.js';
import { kitMods, returnUnused, commitLoadout, defaultLoadout, carryOf } from './loadout.js';
import { inB, tile, tutorialMap, avenueMap, alleyMap, crossingMap, pickDeploys, DIRS4, docklandsMap } from './tmaps.js';
import { mapFromJson } from './mapfmt.js';
import { propDef } from './catalog.js';
import { findMatch, pvpStake, settlePvp, opponentLabel } from './pvp.js';
import { statsFor, defaultEquip, rollBattleLoot, ITEMS } from './items.js';

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
  const out = (d.abilities || []).filter((a) => !a.unlock || (u.lv || 1) >= a.unlock);
  if ((u.charges || 0) > 0 && !out.some((a) => a.kind === 'breach')) {
    out.push({ id: 'breach', name: 'Pipe Bomb', ap: CHARGE.ap, kind: 'breach', gear: 1, text: `Throw a pipe bomb up to ${CHARGE.range} tiles: ${CHARGE.dmg} damage around the tile, sets off barrels and cars. ${u.charges} left.` });
  }
  return out;
}
export function abilityOf(u, id) { return (defOf(u.hero).abilities || []).find((a) => a.id === id) || null; }
export const cooldownLeft = (u, id) => ((u.cd || {})[id] || 0);

export function previewShot(b, att, def, mode = 'shot') {
  if (!att || !def || att.hp <= 0 || def.hp <= 0) return null;
  const defn = defOf(att.hero);
  const tdef = defOf(def.hero);
  const abl = defn.abilities.find((a) => a.id === mode) || null;
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
  const flanked = cover === 0 && dist > 0;
  const parts = [];
  const push = (label, val) => { if (val) parts.push({ label, val }); };
  let chance = defn.aim + (att.aimMod || 0);
  parts.push({ label: 'Aim', val: chance });
  if (mode === 'aimed') { chance += 25; push('Aimed', +25); }
  if (mode === 'overwatch' && !(att.perks || []).includes('trigger')) { chance -= 15; push('Overwatch', -15); }
  if (mode === 'suppress') { chance += 10; push('Suppress', +10); }
  if (mode === 'knife' && flanked) { chance += 20; push('Knife flank', +20); }
  if (abl && abl.aim) { chance += abl.aim; push(abl.name, abl.aim); }
  if (att.rallied) { chance += 10; push('Rallied', +10); }
  if (att.shaken) { chance -= 15; push('Shaken', -15); }
  if (def.dodge) { chance -= def.dodge; push('Dodge', -def.dodge); }
  if (cover === 1) { chance -= 20; push('Half cover', -20); }
  if (cover === 2) { chance -= 40; push('Full cover', -40); }
  if (flanked) { chance += 10; push('Flank', +10); }
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
  if (syn.some((g) => g.name === 'Spotter') && att.hero === 'lumen') {
    const pip = b.units.find((u) => u.hero === 'pip' && u.side === att.side && u.hp > 0);
    if (pip && hasLOS(b, pip.x, pip.y, def.x, def.y)) { chance += 12; push('Spotter', +12); }
  }
  const mu = matchup(defn, tdef);
  chance += mu.aim;
  if (mu.aim) push('Matchup', mu.aim);
  if (def.suppressed) chance += 0; // att is not suppressed
  if (att.suppressed) { chance -= 20; push('Suppressed', -20); }
  if (def.fortify) cover = Math.min(2, cover + 1);
  // re-apply cover penalty if fortify raised it after the first calc? already applied pre-fortify.
  if (def.fortify) {
    // add one extra step of penalty if we hadn't already counted the bumped cover
    if (cover === 1) { chance -= 20; push('Fortify', -20); }
    else if (cover === 2) { /* maybe already full */ }
  }
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
  const ap = mode === 'aimed' ? 3 : mode === 'roll' ? 3 : mode === 'overwatch' ? 0 : (defn.abilities.find((a) => a.id === mode)?.ap || 2);
  return {
    ok: true, chance, cover, flanked, dist, melee, dmg: [Math.max(1, d0), Math.max(1, d1)],
    ap, mode, note: mu.note, los: true, parts, weapon: w.name, bleed: abl?.bleed || 0,
  };
}

export function critChance(att, mode) {
  const defn = defOf(att.hero);
  let c = 8 + (att.crit || 0);
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
    uid, hero, side, x, y, hp, maxHp: hp, stars, lv, perks, gear,
    equip: Object.values(equip).filter((id) => ITEMS[id]),
    aimMod: st.aimMod,
    armor: st.armor, rangeBonus: st.range, mdmg: st.mdmg, rdmg: st.rdmg,
    crit: st.crit, dodge: st.dodge, charges: st.charges, gun: st.gun, mel: st.mel,
    cd: {}, bleed: 0, shaken: 0, rallied: 0,
    ap: st.ap, maxAp: st.ap, move, baseMove: move,
    speed: st.speed, init: 0, classId: d.classId || '',
    ammo: opts.ammo == null ? (side === 'enemy' ? 8 : 0) : opts.ammo,
    medkits: opts.medkits || 0, kills: 0,
    overwatch: false, moved: 0, acted: 0, fired: 0, lastFired: 0,
    suppressed: 0, fortify: 0, venom: 0, dashUsed: 0, rollUsed: 0, sprint: 0,
    ko: 0, facing: side === 'player' ? 0 : 2,
  };
}

function packFromState(s, id) {
  const rec = s.heroes.owned[id] || {};
  return { stars: rec.stars || 1, lv: rec.lv || 1, perks: rec.perks || [], gear: rec.gear || null, equip: rec.equip ? { ...rec.equip } : null };
}

export function startBattle({ map, player, enemy, seed, label, tutorial, reward, kind, stars, loadout, highStakes, pvp, opponent }) {
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
    b.units.push(freshUnit(id, 'enemy', spt.x, spt.y, 'e' + i, { ammo: 8 }));
  });
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
    // overwatch reactions from enemies who can see this tile
    const ows = b.units.filter((o) => o.hp > 0 && o.side !== u.side && o.overwatch);
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
  if (!prev.melee && (att.ammo || 0) > 0) att.ammo -= 1;
  ev.ammo = att.ammo;
  if (!hit) { log(b, `${nameOf(att)} missed ${nameOf(def)} (${prev.chance}%).`); return ev; }
  const span = prev.dmg[1] - prev.dmg[0] + 1;
  let dmg = prev.dmg[0] + Math.floor(rngNext(b) * span);
  const cc = critChance(att, mode);
  if (Math.floor(rngNext(b) * 100) < cc) { ev.crit = 1; dmg += 2; }
  const tdef = defOf(def.hero);
  if (tdef.passive?.id === 'hide' || tdef.species === 'Croc') dmg = Math.max(1, dmg - 1);
  if (def.armor) dmg = Math.max(1, dmg - def.armor);
  const syn = synergiesFor(squadIds(b, def.side));
  if (syn.some((g) => g.name === 'Field Guard') && def.hero === 'vesper') {
    const brick = b.units.find((u) => u.hero === 'brick' && u.side === def.side && u.hp > 0 && MANH(u.x, u.y, def.x, def.y) === 1);
    if (brick) dmg = Math.max(1, dmg - 1);
  }
  dmg = Math.max(1, dmg);
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
  if (mode === 'suppress' && tdef.species !== 'Bear') def.suppressed = 1;
  if (mode === 'venom' || defOf(att.hero).species === 'Snake') def.venom = Math.max(def.venom || 0, 2);
  if (prev.bleed && def.hp > 0) { def.bleed = Math.max(def.bleed || 0, prev.bleed); ev.bleed = prev.bleed; }
  // Bruiser Grit: melee hits patch the bruiser up.
  if (prev.melee && defOf(att.hero).passive?.id === 'grit' && att.hp > 0 && att.hp < att.maxHp) { att.hp += 1; ev.leech = 1; }
  log(b, `${nameOf(att)} hit ${nameOf(def)} for ${dmg}${ev.crit ? ' (crit)' : ''}.`);
  if (def.hp <= 0) {
    def.ko = 1; def.overwatch = false; ev.ko = 1;
    log(b, `${nameOf(def)} is down.`);
    att.kills = (att.kills || 0) + 1;
    if (defOf(att.hero).passive?.id === 'hot') att.ap = Math.min(att.maxAp, att.ap + 2);
    checkEnd(b);
  }
  return ev;
}

function nameOf(u) { return defOf(u.hero).name; }

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
    events.push({ typ: 'move', uid: u.uid, path: info.path, cost: info.cost, from: { x: u.x, y: u.y } });
    events.push(...stepMove(b, u, info.path));
    checkEnd(b);
    return { ok: true, events, status: b.status };
  }

  // Abilities with cooldowns / level unlocks (data-driven, see hero template).
  const ablId = action.type === 'shootProp' || action.type === 'move' ? null : (action.mode || action.type);
  const abl = ablId ? abilityOf(u, ablId) : null;
  if (abl && abl.unlock && (u.lv || 1) < abl.unlock) return { ok: false, reason: `${abl.name} unlocks at level ${abl.unlock}` };
  if (abl && abl.cd && cooldownLeft(u, abl.id) > 0) return { ok: false, reason: `${abl.name} is recharging (${cooldownLeft(u, abl.id)} turns)` };
  const startCd = () => { if (abl && abl.cd) { u.cd ||= {}; u.cd[abl.id] = abl.cd; } };

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
      if (o.side === u.side) { o.rallied = 1; rallied.push(o.uid); } else { o.shaken = 1; shaken.push(o.uid); }
    }
    startCd();
    log(b, `${nameOf(u)} howls. ${shaken.length} shaken.`);
    return { ok: true, events: [{ typ: 'howl', uid: u.uid, radius: r, shaken, rallied, ability: abl.id }], status: b.status };
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
  if (mab && mab.unlock && (u.lv || 1) < mab.unlock) return { ok: false, reason: `${mab.name} unlocks at level ${mab.unlock}` };
  if (mode === 'roll' && u.rollUsed) return { ok: false, reason: 'Already used this turn' };
  if (!spend(u, ap)) return { ok: false, reason: 'Not enough AP' };
  if (mode === 'roll') u.rollUsed = 1;
  if (mab && mab.cd) { u.cd ||= {}; u.cd[mab.id] = mab.cd; }
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
  u.fortify = 0;
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
  if (u) { u.suppressed = 0; u.shaken = 0; u.rallied = 0; }
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
    const modes = ['aimed', 'shot', 'venom', 'suppress', 'melee', 'roll', 'knife', 'maul', 'pounce'];
    const abls = abilitiesOf(u);
    const ready = (id) => { const a = abls.find((x) => x.id === id || x.kind === id); return a && !(a.cd && cooldownLeft(u, a.id) > 0) ? a : null; };
    // Second Wind when hurt; Howl first while foes are close and AP remains to follow up.
    const sw = ready('secondwind');
    if (sw && u.ap >= sw.ap && u.hp <= u.maxHp * 0.5) consider({ type: 'secondwind', uid: u.uid }, 70 + (u.maxHp - u.hp) * 6);
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
        if (prev.bleed && f.hp > prev.dmg[1]) score += 12;
        if (mode === 'pounce') score += prev.dist > 1 ? 14 : -20;
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
    if (u.ap >= 2 && u.acted === 0) consider({ type: 'overwatch', uid: u.uid }, 12);
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
    if (u && u.ap >= 2) return { type: 'overwatch', uid: u.uid };
    return { type: 'endTurn' };
  }
  return best;
}

export function thinkAsPlayer(b) { return think(b); }

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
  // unused ammo / medkits come back; spent rounds stay gone
  res.returned = returnUnused(s, b.units);
  if (b.status === 'win') {
    res.cash = b.reward?.cash || 0;
    res.influence = b.reward?.influence || 0;
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
    }
  }
  if (b.pvp && b.kind === 'street') {
    const pv = settlePvp(s, b);
    res.trophies = pv.trophies;
    res.trophiesNow = pv.trophiesNow;
    res.league = pv.league;
    res.opponent = pv.opponent;
    if (b.status === 'win' && pv.shardDrop) res.shardDrop = pv.shardDrop;
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
  s.stats.battles = (s.stats.battles || 0) + 1;
  s.tactics = null;
  s.lastTactics = res;
  return res;
}

export function coverLabel(c) { return c >= 2 ? 'Full cover' : c === 1 ? 'Half cover' : 'No cover'; }
