// Turn-based grid battle rules. The whole battle is one JSON object; every change goes through
// applyAction(), which returns a list of events for the renderer to animate. A server can run the
// same code to validate player actions (same seed + same actions = same result).
import { SPECIES, ROLES } from './data.js';
import { memberStats } from './crew.js';
import { rngNext, rngInt } from './rng.js';

// Default street-fight board (landscape: your crew deploys on the left, rivals on the right).
export const W = 10, H = 7;
export const T = { FLOOR: 0, COVER: 1, WALL: 2 };
export const MAX_TURNS = 20;
export const COST = { shot: 2, aimed: 3, suppress: 2, patch: 2, gadget: 1, strike: 2, skill: 1 };

const idx = (b, x, y) => y * b.w + x;
const inB = (b, x, y) => x >= 0 && y >= 0 && x < b.w && y < b.h;
export const dist = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const tileAt = (b, x, y) => (inB(b, x, y) ? b.tiles[idx(b, x, y)] : T.WALL);
export const unitAt = (b, x, y) => b.units.find((u) => u.alive && u.x === x && u.y === y);
export const living = (b, side) => b.units.filter((u) => u.alive && (!side || u.side === side));
export const unitById = (b, uid) => b.units.find((u) => u.uid === uid);
// units that still fight (crew and turrets); storages and the Den don't count towards "everyone down"
export const combatants = (b, side) => living(b, side).filter((u) => !u.structure || u.weapon);

// ---------------------------------------------------------------- map
export function connected(b, fromCols, toCols) {
  // flood fill over floor from any floor tile in fromCols; true if it reaches every row band of toCols
  const seen = new Set(), q = [];
  for (const x of fromCols) for (let y = 0; y < b.h; y++) if (tileAt(b, x, y) === T.FLOOR) { seen.add(idx(b, x, y)); q.push([x, y]); }
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (inB(b, nx, ny) && tileAt(b, nx, ny) === T.FLOOR && !seen.has(idx(b, nx, ny))) { seen.add(idx(b, nx, ny)); q.push([nx, ny]); }
    }
  }
  return { seen, ok: toCols.every((x) => [...Array(b.h).keys()].some((y) => seen.has(idx(b, x, y)))) };
}

function genStreet(b, h) {
  for (let attempt = 0; attempt < 50; attempt++) {
    b.tiles = new Array(b.w * b.h).fill(T.FLOOR);
    b.deco = new Array(b.w * b.h).fill(0);
    const walls = rngInt(h, 1, 3);
    for (let i = 0; i < walls; i++) {
      const x = rngInt(h, 3, b.w - 4), y = rngInt(h, 0, b.h - 2);
      const vert = rngNext(h) < 0.6;
      for (let k = 0; k < 2; k++) {
        const xx = vert ? x : x + k, yy = vert ? y + k : y;
        if (inB(b, xx, yy)) b.tiles[idx(b, xx, yy)] = T.WALL;
      }
    }
    const covers = rngInt(h, 8, 11);
    for (let i = 0; i < covers; i++) {
      const x = rngInt(h, 2, b.w - 3), y = rngInt(h, 0, b.h - 1);
      if (b.tiles[idx(b, x, y)] === T.FLOOR) { b.tiles[idx(b, x, y)] = T.COVER; b.deco[idx(b, x, y)] = rngInt(h, 0, 2); }
    }
    for (let i = 0; i < b.w * b.h; i++) if (b.tiles[i] === T.FLOOR && rngNext(h) < 0.06) b.deco[i] = 3;
    const c = connected(b, [0], [b.w - 1]);
    let ok = c.ok;
    for (let y = 0; y < b.h; y++) for (const x of [0, 1, b.w - 2, b.w - 1]) if (b.tiles[idx(b, x, y)] === T.FLOOR && !c.seen.has(idx(b, x, y))) ok = false;
    if (ok) return;
  }
  b.tiles = new Array(b.w * b.h).fill(T.FLOOR);
  b.deco = new Array(b.w * b.h).fill(0);
}

// ---------------------------------------------------------------- units
export function unitFromMember(m, side, uid) {
  const s = m.stats || memberStats(m);
  return {
    uid, side, memberId: side === 'player' ? m.id : null,
    troop: m.troop || null, troopLv: m.troopLv || 0, bossId: m.bossId || null, skill: m.skill || null, skillUsed: false, img: m.img || null,
    name: m.name, boss: !!m.boss, species: m.species, role: m.role, rarity: m.rarity, level: m.level,
    x: 0, y: 0, hp: s.hp, maxHp: s.hp, ap: s.ap, maxAp: s.ap,
    muscle: s.muscle, aim: s.aim, nerve: s.nerve, def: s.def, crit: s.crit,
    trait: SPECIES[m.species].trait,
    weapon: { ...s.weapon }, gadget: s.gadget ? { ...s.gadget } : null, gadgetUsed: false,
    status: { poison: 0, smoke: false, suppressed: false }, patched: false, alive: true,
  };
}

// Structures (raid targets) and turrets come from a base layout; see raid.js.
export function unitFromStructure(st, uid) {
  const tur = st.turret;
  return {
    uid, side: 'enemy', memberId: null, structure: true, static: true, kind: st.t, size: st.size, fx: st.fx, fy: st.fy,
    name: st.name, boss: false, species: null, role: tur ? 'turret' : 'structure', rarity: 'common', level: st.lv,
    x: st.x, y: st.y, hp: st.hp, maxHp: st.hp, ap: tur ? 2 : 0, maxAp: tur ? 2 : 0,
    muscle: 50, aim: tur ? tur.aim : 0, nerve: 50, def: st.def || 1, crit: tur ? 5 : 0, trait: null,
    weapon: tur ? { slot: 'weapon', name: st.name, kind: 'ranged', dmg: tur.dmg, range: tur.range, acc: 0 } : null,
    gadget: null, gadgetUsed: true, loot: st.loot || null,
    status: { poison: 0, smoke: false, suppressed: false }, patched: false, alive: true,
  };
}

export function createBattle({ seed, playerMembers, enemyMembers, kind, label, enemyGang, weather, reward, meta, layout }) {
  const w = layout ? layout.w : W, h = layout ? layout.h : H;
  const b = { v: 2, seed, rng: seed >>> 0, w, h, kind, label, enemyGang, turn: 1, side: 'player', status: 'active', result: null, log: [], reward, meta: meta || {}, looted: { cash: 0, influence: 0 }, props: [] };
  b.weather = weather || (rngNext(b) < 0.5 ? 'rain' : rngNext(b) < 0.5 ? 'fog' : 'clear');
  b.units = [];
  if (layout) {
    b.tiles = [...layout.tiles]; b.deco = [...layout.deco]; b.props = layout.props || [];
    layout.structures.forEach((st, i) => b.units.push(unitFromStructure(st, `s${i}`)));
  } else genStreet(b, b);
  const place = (members, side, cols) => {
    const mid = Math.floor(h / 2);
    const order = [...Array(h).keys()].sort((a, c) => Math.abs(a - mid) - Math.abs(c - mid));
    const slots = [];
    for (const x of cols) for (const y of order) if (b.tiles[idx(b, x, y)] === T.FLOOR && !unitAt(b, x, y)) slots.push([x, y]);
    members.forEach((m, i) => {
      const u = unitFromMember(m, side, `${side[0]}${i}`);
      const [x, y] = slots[i] || [cols[0], i % h];
      u.x = x; u.y = y;
      b.units.push(u);
    });
  };
  place(playerMembers, 'player', [0, 1]);
  if (layout) place(enemyMembers, 'enemy', layout.guardCols);
  else place(enemyMembers, 'enemy', [w - 1, w - 2]);
  b.log.push(`Turn 1. ${b.weather === 'rain' ? 'Rain: -10% to hit.' : b.weather === 'fog' ? 'Fog: ranged shots past 4 tiles -15%.' : 'Clear night.'}`);
  return b;
}

// ---------------------------------------------------------------- queries
export function reachable(b, u) {
  // BFS over floor tiles, 1 AP per orthogonal step; returns Map key "x,y" -> {cost, path}
  const out = new Map();
  if (!u.alive || u.ap <= 0 || u.static) return out;
  const start = { x: u.x, y: u.y, cost: 0, path: [] };
  const q = [start];
  const seen = new Set([`${u.x},${u.y}`]);
  while (q.length) {
    const c = q.shift();
    if (c.cost >= u.ap) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = c.x + dx, ny = c.y + dy, k = `${nx},${ny}`;
      if (seen.has(k) || !inB(b, nx, ny) || tileAt(b, nx, ny) !== T.FLOOR || unitAt(b, nx, ny)) continue;
      seen.add(k);
      const n = { x: nx, y: ny, cost: c.cost + 1, path: [...c.path, [nx, ny]] };
      out.set(k, n);
      q.push(n);
    }
  }
  return out;
}

export function hasLOS(b, a, t) {
  // Bresenham; tall walls between the two tiles block the line
  let x0 = a.x, y0 = a.y; const x1 = t.x, y1 = t.y;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  while (true) {
    if (x0 === x1 && y0 === y1) return true;
    if (!(x0 === a.x && y0 === a.y) && tileAt(b, x0, y0) === T.WALL) return false;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

export function inCover(b, from, t) {
  // A target is covered if a cover/wall tile sits next to it on the side facing the attacker.
  const ddx = Math.sign(from.x - t.x), ddy = Math.sign(from.y - t.y);
  const checks = [];
  if (ddx !== 0) checks.push([t.x + ddx, t.y]);
  if (ddy !== 0) checks.push([t.x, t.y + ddy]);
  if (t.structure) return false; // buildings are big targets
  return checks.some(([x, y]) => inB(b, x, y) && tileAt(b, x, y) !== T.FLOOR);
}

const adjacentAlly = (b, u) => living(b, u.side).some((o) => o.uid !== u.uid && dist(o, u) === 1);

export function attackPreview(b, u, t, mode = 'shot', fromPos) {
  const pos = fromPos || u;
  if (!t.alive || t.side === u.side || !u.weapon) return null;
  const d = dist(pos, t);
  const melee = u.weapon.kind === 'melee';
  if (mode === 'throw') {
    if (!u.gadget || u.gadget.effect !== 'throw' || u.gadgetUsed || d > u.gadget.range) return null;
    if (!hasLOS(b, pos, t)) return null;
    return { chance: 85, min: u.gadget.power, max: u.gadget.power, covered: false, cost: COST.gadget, melee: false, d };
  }
  if (melee) {
    if (d !== 1) return null;
    const chance = Math.max(5, Math.min(95, Math.round(82 + (u.muscle - 50) * 0.2)));
    let base = u.weapon.dmg * (1 + (u.muscle - 50) / 150);
    if (u.trait === 'roll') base *= 1.25;
    if (u.trait === 'pack' && adjacentAlly(b, u)) base *= 1.15;
    return { chance, min: Math.max(1, Math.round(base * 0.85) - t.def), max: Math.max(1, Math.round(base * 1.15) - t.def), covered: false, cost: COST.strike, melee: true, d };
  }
  if (d > u.weapon.range || !hasLOS(b, pos, t) || t.status.smoke) return null;
  const covered = inCover(b, pos, t);
  let chance = 60 + (u.aim - 50) * 0.35 + u.weapon.acc - 4 * Math.max(0, d - 2);
  if (covered) chance -= 30;
  if (b.weather === 'rain') chance -= 10;
  if (b.weather === 'fog' && d > 4) chance -= 15;
  if (t.structure && !t.weapon) chance += 15;
  if (u.status.suppressed) chance -= 15;
  if (mode === 'aimed') chance += 20;
  chance = Math.max(5, Math.min(95, Math.round(chance)));
  let base = u.weapon.dmg * (1 + (u.aim - 50) / 250);
  if (u.trait === 'pack' && adjacentAlly(b, u)) base *= 1.15;
  const cost = mode === 'aimed' ? COST.aimed : mode === 'suppress' ? COST.suppress : COST.shot;
  return { chance, min: Math.max(1, Math.round(base * 0.85) - t.def), max: Math.max(1, Math.round(base * 1.15) - t.def), covered, cost, melee: false, d };
}

export function canAct(b, u) { return b.status === 'active' && u && u.alive && u.side === b.side; }

// ---------------------------------------------------------------- actions
// action: {type:'move', uid, x, y} | {type:'attack', uid, target, mode:'shot'|'aimed'|'throw'}
//         {type:'suppress', uid, target} | {type:'patch', uid, target} | {type:'gadget', uid, target?} | {type:'end'}
export function applyAction(b, a) {
  const ev = [];
  if (b.status !== 'active') return { ok: false, ev };
  if (a.type === 'end') { endTurn(b, ev); return { ok: true, ev }; }
  const u = unitById(b, a.uid);
  if (!canAct(b, u)) return { ok: false, ev };

  if (a.type === 'move') {
    const r = reachable(b, u).get(`${a.x},${a.y}`);
    if (!r) return { ok: false, ev };
    u.x = a.x; u.y = a.y; u.ap -= r.cost;
    ev.push({ type: 'move', uid: u.uid, path: r.path });
    return { ok: true, ev };
  }

  if (a.type === 'attack' || a.type === 'suppress') {
    const t = unitById(b, a.target);
    const mode = a.type === 'suppress' ? 'suppress' : (a.mode || 'shot');
    if (mode === 'suppress' && !(u.role === 'shooter' || u.role === 'marksman')) return { ok: false, ev };
    if (mode === 'aimed' && u.weapon.kind === 'melee') return { ok: false, ev };
    const p = t && attackPreview(b, u, t, mode);
    if (!p || u.ap < p.cost) return { ok: false, ev };
    u.ap -= p.cost;
    if (mode === 'throw') u.gadgetUsed = true;
    if (mode === 'suppress') {
      t.status.suppressed = true;
      ev.push({ type: 'suppress', uid: u.uid, target: t.uid });
      b.log.push(`${u.name} pins down ${t.name}.`);
      return { ok: true, ev };
    }
    const hit = rngNext(b) * 100 < p.chance;
    if (!hit) {
      ev.push({ type: 'attack', uid: u.uid, target: t.uid, hit: false, melee: p.melee, chance: p.chance });
      b.log.push(`${u.name} misses ${t.name} (${p.chance}%).`);
      return { ok: true, ev };
    }
    let dmg = p.min + Math.floor(rngNext(b) * (p.max - p.min + 1));
    const critChance = u.crit + (p.covered || p.melee ? 0 : 10);
    const crit = mode !== 'throw' && rngNext(b) * 100 < critChance;
    if (crit) dmg = Math.round(dmg * 1.5);
    t.hp = Math.max(0, t.hp - dmg);
    if (u.trait === 'venom' && mode !== 'throw') t.status.poison = 2;
    const kill = t.hp <= 0;
    if (kill) {
      t.alive = false;
      if (t.loot) { b.looted.cash += t.loot.cash || 0; b.looted.influence += t.loot.influence || 0; t.lootTaken = true; }
    }
    ev.push({ type: 'attack', uid: u.uid, target: t.uid, hit: true, dmg, crit, kill, melee: p.melee, chance: p.chance });
    b.log.push(`${u.name} ${p.melee ? 'hits' : 'shoots'} ${t.name} for ${dmg}${crit ? ' (CRIT)' : ''}${kill ? (t.structure ? (t.loot ? ' and loots it' : ' and wrecks it') : ' and drops them') : ''}.`);
    checkEnd(b, ev);
    return { ok: true, ev };
  }

  if (a.type === 'skill') {
    if (!u.skill || u.skillUsed || u.ap < COST.skill) return { ok: false, ev };
    if (u.skill === 'howl') {
      u.ap -= COST.skill; u.skillUsed = true;
      for (const o of living(b, u.side)) if (!o.structure) { o.ap += 2; ev.push({ type: 'buff', uid: o.uid, text: '+2 AP' }); }
      b.log.push(`${u.name} lets out a Rally Howl: the whole crew gets +2 AP.`);
      return { ok: true, ev };
    }
    if (u.skill === 'roll') {
      const t = unitById(b, a.target);
      if (!t || !t.alive || t.side === u.side || dist(u, t) !== 1) return { ok: false, ev };
      u.ap -= COST.skill; u.skillUsed = true;
      const dmg = Math.round(u.weapon.dmg * (1 + (u.muscle - 50) / 150) * 3);
      t.hp = Math.max(0, t.hp - dmg);
      const kill = t.hp <= 0;
      if (kill) { t.alive = false; if (t.loot) { b.looted.cash += t.loot.cash || 0; b.looted.influence += t.loot.influence || 0; t.lootTaken = true; } }
      const heal = Math.min(u.maxHp - u.hp, Math.round(dmg / 2));
      u.hp += heal;
      ev.push({ type: 'attack', uid: u.uid, target: t.uid, hit: true, dmg, crit: true, kill, melee: true, chance: 100 });
      if (heal) ev.push({ type: 'heal', uid: u.uid, target: u.uid, amt: heal });
      b.log.push(`${u.name} Death Rolls ${t.name} for ${dmg}${kill ? (t.structure ? ' and wrecks it' : ' and drops them') : ''}.`);
      checkEnd(b, ev);
      return { ok: true, ev };
    }
    return { ok: false, ev };
  }

  if (a.type === 'patch' || a.type === 'gadget') {
    const t = a.target ? unitById(b, a.target) : u;
    if (a.type === 'patch') {
      if (u.role !== 'doc' || u.patched || u.ap < COST.patch) return { ok: false, ev };
      if (!t || !t.alive || t.side !== u.side || dist(u, t) > 1) return { ok: false, ev };
      const amt = Math.min(t.maxHp - t.hp, Math.round(6 + u.nerve / 12));
      t.hp += amt; u.ap -= COST.patch; u.patched = true; t.status.poison = 0;
      ev.push({ type: 'heal', uid: u.uid, target: t.uid, amt });
      b.log.push(`${u.name} patches up ${t.name} (+${amt}).`);
      return { ok: true, ev };
    }
    const g = u.gadget;
    if (!g || u.gadgetUsed || u.ap < COST.gadget) return { ok: false, ev };
    if (g.effect === 'heal') {
      if (!t || !t.alive || t.side !== u.side || dist(u, t) > 1) return { ok: false, ev };
      const amt = Math.min(t.maxHp - t.hp, g.power);
      t.hp += amt; t.status.poison = 0;
      ev.push({ type: 'heal', uid: u.uid, target: t.uid, amt });
      b.log.push(`${u.name} uses a Med Kit on ${t.name} (+${amt}).`);
    } else if (g.effect === 'ap') {
      u.ap += g.power + COST.gadget;
      ev.push({ type: 'buff', uid: u.uid, text: '+2 AP' });
      b.log.push(`${u.name} jabs an Adrenaline Shot.`);
    } else if (g.effect === 'smoke') {
      u.status.smoke = true;
      ev.push({ type: 'buff', uid: u.uid, text: 'SMOKE' });
      b.log.push(`${u.name} vanishes into smoke.`);
    } else return { ok: false, ev };
    u.ap -= COST.gadget; u.gadgetUsed = true;
    return { ok: true, ev };
  }
  return { ok: false, ev };
}

function startSide(b, side, ev) {
  for (const u of living(b, side)) {
    u.ap = u.maxAp - (u.status.suppressed ? 1 : 0);
    u.status.suppressed = false;
    u.status.smoke = false;
    u.patched = false;
    if (u.status.poison > 0) {
      u.hp = Math.max(0, u.hp - 3); u.status.poison--;
      ev.push({ type: 'poison', target: u.uid, dmg: 3, kill: u.hp <= 0 });
      if (u.hp <= 0) { u.alive = false; b.log.push(`${u.name} succumbs to venom.`); }
    }
  }
}

function endTurn(b, ev) {
  if (b.side === 'player') {
    b.side = 'enemy';
  } else {
    b.side = 'player';
    b.turn++;
    if (b.turn > MAX_TURNS) { b.status = 'done'; b.result = 'loss'; b.endReason = 'timeout'; ev.push({ type: 'end', result: 'loss' }); return; }
    b.log.push(`Turn ${b.turn}.`);
  }
  startSide(b, b.side, ev);
  ev.push({ type: 'turn', side: b.side, turn: b.turn });
  checkEnd(b, ev);
}

function winRaid(b, ev, reason) {
  // the base is yours: everything left in its storages is taken
  for (const u of b.units) if (u.side === 'enemy' && u.loot && !u.lootTaken) { b.looted.cash += u.loot.cash || 0; b.looted.influence += u.loot.influence || 0; u.lootTaken = true; }
  b.status = 'done'; b.result = 'win'; b.endReason = reason; ev.push({ type: 'end', result: 'win' });
}
function checkEnd(b, ev) {
  if (b.status !== 'active') return;
  if (b.kind === 'raid' && b.units.some((u) => u.kind === 'den' && !u.alive)) return winRaid(b, ev, 'den');
  if (!combatants(b, 'enemy').length) { if (b.kind === 'raid') winRaid(b, ev, 'wiped'); else { b.status = 'done'; b.result = 'win'; ev.push({ type: 'end', result: 'win' }); } }
  else if (!living(b, 'player').length) { b.status = 'done'; b.result = 'loss'; ev.push({ type: 'end', result: 'loss' }); }
}

// Raid scoring: one star each for wrecking the Den, half the buildings, and every defender.
export function raidStars(b) {
  const st = b.units.filter((u) => u.side === 'enemy' && u.structure);
  const destroyed = st.filter((u) => !u.alive).length;
  const pct = st.length ? Math.round((destroyed / st.length) * 100) : 0;
  const stars = (b.units.some((u) => u.kind === 'den' && !u.alive) ? 1 : 0) + (pct >= 50 ? 1 : 0) + (combatants(b, 'enemy').length === 0 ? 1 : 0);
  return { stars, pct };
}

export function retreat(b) {
  if (b.status !== 'active') return;
  b.status = 'done'; b.result = 'loss'; b.endReason = 'retreat';
}
