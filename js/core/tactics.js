// XCOM-style 4v4 tactics: action points, half/full cover, hitchance, flanking,
// overwatch, and a simple enemy AI. Outcomes depend on positioning and decisions.
import { rngNext, rngInt, newSeed } from './rng.js';
import { defOf, HEROES, matchup, synergiesFor } from './heroes.js';
import { inB, tile, tutorialMap, avenueMap, alleyMap, crossingMap, pickDeploys, DIRS4 } from './tmaps.js';

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
    // Walls block LOS. Cars, crates and barriers give cover but you can fire past them.
    if (!t || t.decor === 'wall') return false;
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

export function previewShot(b, att, def, mode = 'shot') {
  if (!att || !def || att.hp <= 0 || def.hp <= 0) return null;
  const defn = defOf(att.hero);
  const tdef = defOf(def.hero);
  const w = defn.weapon;
  const dist = MANH(att.x, att.y, def.x, def.y);
  const melee = mode === 'melee' || mode === 'lunge' || mode === 'roll' || w.typ === 'melee';
  const range = melee ? (mode === 'lunge' ? 1 : (defn.abilities.find((a) => a.id === mode)?.range || 1)) : w.range;
  if (dist < 1) return null;
  if (!melee && dist > range) return { ok: false, reason: 'Out of range', chance: 0, dist, cover: 0 };
  if (melee && mode !== 'lunge' && dist > (defn.abilities.find((a) => a.id === mode)?.range || 1)) {
    return { ok: false, reason: 'Too far', chance: 0, dist, cover: 0 };
  }
  if (!melee && !hasLOS(b, att.x, att.y, def.x, def.y)) return { ok: false, reason: 'No line of sight', chance: 0, dist, cover: 0 };
  let cover = coverFrom(b, att.x, att.y, def.x, def.y);
  if (melee && (defn.passive?.id === 'jaw') && cover === 1) cover = 0;
  const flanked = cover === 0 && dist > 0;
  let chance = defn.aim + (att.aimMod || 0);
  if (mode === 'aimed') chance += 25;
  if (mode === 'overwatch') chance -= 15;
  if (mode === 'suppress') chance += 10;
  if (mode === 'knife' && flanked) chance += 20;
  if (cover === 1) chance -= 20;
  if (cover === 2) chance -= 40;
  if (flanked) chance += 10;
  // range falloff / shotgun sweet spot
  if (!melee) {
    const mid = Math.max(2, Math.floor(range * 0.45));
    if (dist > mid) chance -= 6 * (dist - mid);
    if (w.typ === 'shotgun' && dist <= 2) chance += 15;
    if (w.typ === 'shotgun' && dist >= 4) chance -= 10;
  }
  if (att.moved && defn.passive?.id === 'cold' && mode === 'aimed') chance -= 0; // crit later, not aim
  if (defn.passive?.id === 'pack' && (allyNear(b, att, att.x, att.y) || allyNear(b, att, def.x, def.y))) chance += 15;
  const syn = synergiesFor(squadIds(b, att.side));
  if (syn.some((g) => g.name === 'Pack Bond')) chance += 8;
  if (syn.some((g) => g.name === 'Spotter') && att.hero === 'lumen') {
    const pip = b.units.find((u) => u.hero === 'pip' && u.side === att.side && u.hp > 0);
    if (pip && hasLOS(b, pip.x, pip.y, def.x, def.y)) chance += 12;
  }
  const mu = matchup(defn, tdef);
  chance += mu.aim;
  if (def.suppressed) chance += 0; // att is not suppressed
  if (att.suppressed) chance -= 20;
  if (def.fortify) cover = Math.min(2, cover + 1);
  // re-apply cover penalty if fortify raised it after the first calc? already applied pre-fortify.
  if (def.fortify) {
    // add one extra step of penalty if we hadn't already counted the bumped cover
    if (cover === 1) { /* was 0, now half */ chance -= 20; }
    else if (cover === 2) { /* maybe already full */ }
  }
  chance = Math.max(5, Math.min(95, Math.round(chance)));
  let [d0, d1] = melee
    ? (defn.abilities.find((a) => a.id === mode && a.dmg)?.dmg || w.dmg)
    : w.dmg;
  if (mode === 'suppress') { d0 = Math.max(1, Math.floor(d0 / 2)); d1 = Math.max(1, Math.floor(d1 / 2)); }
  d0 += mu.dmg; d1 += mu.dmg;
  const ap = mode === 'aimed' ? 3 : mode === 'roll' ? 3 : mode === 'overwatch' ? 0 : (defn.abilities.find((a) => a.id === mode)?.ap || 2);
  return {
    ok: true, chance, cover, flanked, dist, melee, dmg: [Math.max(1, d0), Math.max(1, d1)],
    ap, mode, note: mu.note, los: true,
  };
}

export function critChance(att, mode) {
  const defn = defOf(att.hero);
  let c = 8;
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

function freshUnit(hero, side, x, y, uid) {
  const d = defOf(hero);
  const extraAp = d.passive?.id === 'scurry' ? 1 : 0;
  return {
    uid, hero, side, x, y, hp: d.hp, maxHp: d.hp,
    ap: d.ap + extraAp, maxAp: d.ap + extraAp, move: d.move,
    overwatch: false, moved: 0, acted: 0, fired: 0, lastFired: 0,
    suppressed: 0, fortify: 0, venom: 0, dashUsed: 0, rollUsed: 0, sprint: 0,
    ko: 0, facing: side === 'player' ? 0 : 2,
  };
}

export function startBattle({ map, player, enemy, seed, label, tutorial, reward, kind }) {
  const b = {
    kind: kind || (tutorial ? 'tutorial' : 'street'),
    label: label || (tutorial ? 'Street lesson' : 'Street fight'),
    map, seed: (seed >>> 0) || newSeed(), rng: (seed >>> 0) || newSeed(),
    status: 'active', side: 'player', turn: 1, tutorial: tutorial || 0,
    reward: reward || { cash: 200, influence: 20 },
    units: [], log: [],
  };
  const pSpots = pickDeploys(map, 'player', player.length, b.seed);
  const eSpots = pickDeploys(map, 'enemy', enemy.length, b.seed + 17);
  player.forEach((id, i) => {
    const s = pSpots[i] || { x: 1, y: 1 + i };
    b.units.push(freshUnit(id, 'player', s.x, s.y, 'p' + i));
  });
  enemy.forEach((id, i) => {
    const s = eSpots[i] || { x: map.w - 2, y: 1 + i };
    b.units.push(freshUnit(id, 'enemy', s.x, s.y, 'e' + i));
  });
  return b;
}

export function startTutorial(seed) {
  return startBattle({
    map: tutorialMap(), player: ['rook'], enemy: ['hook'], seed,
    label: 'Street lesson', tutorial: 1, kind: 'tutorial',
    reward: { cash: 150, influence: 10 },
  });
}

export function startStreet(s, seed) {
  const squad = (s.heroes.squad || ['rook']).filter((id) => s.heroes.owned[id]).slice(0, 4);
  const n = Math.max(1, squad.length);
  const pools = {
    1: ['hook', 'knack'],
    2: ['hook', 'knack', 'ash'],
    3: ['slab', 'mica', 'knack', 'ash'],
    4: ['slab', 'mica', 'rill', 'pact', 'bruno', 'ash', 'knack'],
  };
  const pool = pools[Math.min(4, n)];
  const holder = { rng: (seed >>> 0) || s.rng };
  const enemy = [];
  const left = pool.slice();
  while (enemy.length < n && left.length) {
    const i = rngInt(holder, 0, left.length - 1);
    enemy.push(left.splice(i, 1)[0]);
  }
  const maps = [avenueMap, alleyMap, crossingMap];
  const map = maps[rngInt(holder, 0, maps.length - 1)](holder.rng);
  return startBattle({
    map, player: squad, enemy, seed: holder.rng,
    label: 'Street fight', kind: 'street',
    reward: { cash: 200 + n * 80, influence: 15 + n * 8 },
  });
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
  if (!hit) { log(b, `${nameOf(att)} missed ${nameOf(def)} (${prev.chance}%).`); return ev; }
  const span = prev.dmg[1] - prev.dmg[0] + 1;
  let dmg = prev.dmg[0] + Math.floor(rngNext(b) * span);
  const cc = critChance(att, mode);
  if (Math.floor(rngNext(b) * 100) < cc) { ev.crit = 1; dmg += 2; }
  const tdef = defOf(def.hero);
  if (tdef.passive?.id === 'hide') dmg = Math.max(1, dmg - 1);
  const syn = synergiesFor(squadIds(b, def.side));
  if (syn.some((g) => g.name === 'Field Guard') && def.hero === 'vesper') {
    const brick = b.units.find((u) => u.hero === 'brick' && u.side === def.side && u.hp > 0 && MANH(u.x, u.y, def.x, def.y) === 1);
    if (brick) dmg = Math.max(1, dmg - 1);
  }
  dmg = Math.max(1, dmg);
  def.hp = Math.max(0, def.hp - dmg);
  ev.dmg = dmg;
  if (mode === 'suppress') def.suppressed = 1;
  if (mode === 'venom') def.venom = 2;
  log(b, `${nameOf(att)} hit ${nameOf(def)} for ${dmg}${ev.crit ? ' (crit)' : ''}.`);
  if (def.hp <= 0) {
    def.ko = 1; def.overwatch = false; ev.ko = 1;
    log(b, `${nameOf(def)} is down.`);
    if (defOf(att.hero).passive?.id === 'hot') att.ap = Math.min(att.maxAp, att.ap + 2);
    checkEnd(b);
  }
  return ev;
}

function nameOf(u) { return defOf(u.hero).name; }

export function apply(b, action) {
  if (b.status !== 'active') return { ok: false, reason: 'Fight is over' };
  const events = [];
  if (action.type === 'endTurn') {
    return endTurn(b);
  }
  const u = b.units.find((x) => x.uid === action.uid);
  if (!u || u.hp <= 0) return { ok: false, reason: 'No such operator' };
  if (u.side !== b.side) return { ok: false, reason: 'Not their turn' };

  if (action.type === 'move') {
    const info = pathTo(b, u, action.x, action.y);
    if (!info) return { ok: false, reason: 'Cannot walk there' };
    if (!spend(u, info.cost)) return { ok: false, reason: 'Not enough AP' };
    u.moved = 1;
    events.push({ typ: 'move', uid: u.uid, path: info.path, cost: info.cost });
    events.push(...stepMove(b, u, info.path));
    checkEnd(b);
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
    const { x, y } = action;
    if (MANH(u.x, u.y, x, y) !== 1) return { ok: false, reason: 'Must be adjacent' };
    const t = tile(b.map, x, y);
    if (!t || !t.decor) return { ok: false, reason: 'Nothing to breach' };
    if (!spend(u, 2)) return { ok: false, reason: 'Not enough AP' };
    t.decor = ''; t.block = 0; t.cover = 0;
    // if a two-tile car, clear the partner
    for (const [dx, dy] of DIRS4) {
      const n = tile(b.map, x + dx, y + dy);
      if (n && (n.decor === 'car' || n.decor === 'car2')) { n.decor = ''; n.block = 0; n.cover = 0; }
    }
    u.acted = 1;
    const syn = synergiesFor(squadIds(b, u.side));
    if (syn.some((g) => g.name === 'Breach Pair') && u.hero === 'marlow') u.ap = Math.min(u.maxAp, u.ap + 1);
    log(b, `${nameOf(u)} breaches the cover.`);
    return { ok: true, events: [{ typ: 'breach', uid: u.uid, x, y }], status: b.status };
  }

  if (action.type === 'heal' || action.type === 'patch') {
    const t = b.units.find((x) => x.uid === action.target);
    if (!t || t.side !== u.side || t.hp <= 0) return { ok: false, reason: 'No ally there' };
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
      events.push({ typ: 'move', uid: u.uid, path, cost: 0 });
      events.push(...stepMove(b, u, path));
      if (u.hp <= 0 || b.status !== 'active') return { ok: true, events, status: b.status };
    }
    u.moved = 1;
    const prev = previewShot(b, u, t, 'melee');
    if (!prev || !prev.ok) return { ok: true, events, status: b.status };
    events.push(resolveHit(b, u, t, 'melee', prev));
    return { ok: true, events, status: b.status };
  }

  // generic offensive: shot, aimed, suppress, venom, melee, knife, roll, blast
  const mode = action.mode || action.type;
  const t = b.units.find((x) => x.uid === action.target);
  if (!t || t.side === u.side || t.hp <= 0) return { ok: false, reason: 'No foe there' };
  const prev = previewShot(b, u, t, mode);
  if (!prev || !prev.ok) return { ok: false, reason: prev?.reason || 'Cannot shoot' };
  const ap = mode === 'aimed' ? 3 : mode === 'roll' ? 3 : 2;
  if (mode === 'roll' && u.rollUsed) return { ok: false, reason: 'Already used this turn' };
  if (!spend(u, ap)) return { ok: false, reason: 'Not enough AP' };
  if (mode === 'roll') u.rollUsed = 1;
  events.push(resolveHit(b, u, t, mode, prev));
  return { ok: true, events, status: b.status };
}

function startSide(b, side) {
  b.side = side;
  for (const u of b.units) {
    if (u.side !== side || u.hp <= 0) continue;
    const d = defOf(u.hero);
    u.ap = u.maxAp;
    u.moved = 0; u.acted = 0; u.dashUsed = 0; u.rollUsed = 0; u.sprint = 0;
    u.move = d.move;
    u.overwatch = false;
    // suppressed lasts through this turn (it was applied on the enemy's previous turn)
    u.fortify = 0;
    if (u.venom > 0) {
      u.hp = Math.max(0, u.hp - 1);
      u.venom -= 1;
      log(b, `${nameOf(u)} takes venom damage.`);
      if (u.hp <= 0) { u.ko = 1; checkEnd(b); }
    }
    if (d.passive?.id === 'kit' && u.lastFired !== b.turn - 1 && u.hp > 0) {
      u.hp = Math.min(u.maxHp, u.hp + 1);
    }
  }
}

function endTurn(b) {
  const events = [{ typ: 'endTurn', side: b.side }];
  for (const u of b.units) if (u.side === b.side) u.suppressed = 0;
  if (b.side === 'player') {
    startSide(b, 'enemy');
    events.push({ typ: 'side', side: 'enemy' });
  } else {
    b.turn += 1;
    startSide(b, 'player');
    events.push({ typ: 'side', side: 'player', turn: b.turn });
    log(b, `Turn ${b.turn}.`);
  }
  checkEnd(b);
  return { ok: true, events, status: b.status };
}


function approachScore(b, u, x, y, foes) {
  let best = 0;
  for (const f of foes) {
    const before = MANH(u.x, u.y, f.x, f.y);
    const after = MANH(x, y, f.x, f.y);
    best = Math.max(best, (before - after) * 18);
    const ghost = { ...u, x, y };
    const mode = defOf(u.hero).weapon.typ === 'melee' ? 'melee' : 'shot';
    const prev = previewShot(b, ghost, f, mode);
    if (prev && prev.ok) best = Math.max(best, 20 + prev.chance * 0.5 + (prev.flanked ? 16 : 0) - prev.cover * 6);
  }
  const c = foes[0] ? coverFrom(b, foes[0].x, foes[0].y, x, y) : 0;
  best += c * 6;
  return best;
}

// Pick one action for whoever's turn it is.
export function think(b) {
  if (b.status !== 'active') return { type: 'endTurn' };
  const me = b.side;
  const foes = living(b, me === 'player' ? 'enemy' : 'player');
  const mine = living(b, me).filter((u) => u.ap > 0);
  if (!mine.length || !foes.length) return { type: 'endTurn' };
  let best = null, bestScore = -999;

  const consider = (action, score) => { if (score > bestScore) { bestScore = score; best = action; } };

  for (const u of mine) {
    const defn = defOf(u.hero);
    const modes = ['aimed', 'shot', 'venom', 'suppress', 'melee', 'roll', 'knife'];
    for (const f of foes) {
      for (const mode of modes) {
        if (!['shot', 'melee'].includes(mode) && !defn.abilities.some((a) => a.kind === mode || a.id === mode)) continue;
        if (mode === 'melee' && defn.weapon.typ !== 'melee' && mode !== 'knife') continue;
        const prev = previewShot(b, u, f, mode);
        if (!prev || !prev.ok) continue;
        const ap = prev.ap || 2;
        if (u.ap < ap) continue;
        let score = 40 + prev.chance + prev.dmg[0] * 8 + (prev.flanked ? 20 : 0) - prev.cover * 8;
        if (f.hp <= prev.dmg[1]) score += 30;
        consider({ type: mode, uid: u.uid, target: f.uid, mode }, score);
      }
      if (defn.abilities.some((a) => a.kind === 'lunge') && u.ap >= 2) {
        const dist = MANH(u.x, u.y, f.x, f.y);
        if (dist > 1 && dist <= 4) consider({ type: 'lunge', uid: u.uid, target: f.uid }, 50 + (5 - dist) * 6);
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
    cash: 0, influence: 0, teeth: 0,
  };
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
      if (!s.heroes.owned.pip) {
        s.heroes.owned.pip = { xp: 0 };
        if (s.heroes.squad.length < 4) s.heroes.squad.push('pip');
        res.unlocked = 'pip';
      }
    }
  }
  s.stats.battles = (s.stats.battles || 0) + 1;
  s.tactics = null;
  s.lastTactics = res;
  return res;
}

export function coverLabel(c) { return c >= 2 ? 'Full cover' : c === 1 ? 'Half cover' : 'No cover'; }
