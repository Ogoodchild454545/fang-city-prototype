// Turn-based grid battle rules. The whole battle is one JSON object; every change goes through
// applyAction(), which returns a list of events for the renderer to animate. A server can run the
// same code to validate player actions (same seed + same actions = same result).
import { SPECIES, ROLES } from './data.js';
import { memberStats } from './crew.js';
import { rngNext, rngInt } from './rng.js';

export const W = 7, H = 9;
export const T = { FLOOR: 0, COVER: 1, WALL: 2 };
export const MAX_TURNS = 20;
export const COST = { shot: 2, aimed: 3, suppress: 2, patch: 2, gadget: 1, strike: 2 };

const idx = (x, y) => y * W + x;
const inB = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
export const dist = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const tileAt = (b, x, y) => (inB(x, y) ? b.tiles[idx(x, y)] : T.WALL);
export const unitAt = (b, x, y) => b.units.find((u) => u.alive && u.x === x && u.y === y);
export const living = (b, side) => b.units.filter((u) => u.alive && (!side || u.side === side));
export const unitById = (b, uid) => b.units.find((u) => u.uid === uid);

// ---------------------------------------------------------------- map
function genMap(h) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const tiles = new Array(W * H).fill(T.FLOOR);
    const deco = new Array(W * H).fill(0);
    // short wall segments (dumpsters / brick stubs) in the middle rows
    const walls = rngInt(h, 1, 3);
    for (let i = 0; i < walls; i++) {
      const x = rngInt(h, 0, W - 2), y = rngInt(h, 3, H - 4);
      const horiz = rngNext(h) < 0.6;
      for (let k = 0; k < 2; k++) {
        const xx = horiz ? x + k : x, yy = horiz ? y : y + k;
        if (inB(xx, yy)) tiles[idx(xx, yy)] = T.WALL;
      }
    }
    // low cover: crates, cars, bins
    const covers = rngInt(h, 7, 10);
    for (let i = 0; i < covers; i++) {
      const x = rngInt(h, 0, W - 1), y = rngInt(h, 2, H - 3);
      if (tiles[idx(x, y)] === T.FLOOR) { tiles[idx(x, y)] = T.COVER; deco[idx(x, y)] = rngInt(h, 0, 2); }
    }
    for (let i = 0; i < W * H; i++) if (tiles[i] === T.FLOOR && rngNext(h) < 0.06) deco[i] = 3; // puddles / manholes
    // connectivity check from bottom row to top row
    const seen = new Set([idx(3, H - 1)]);
    const q = [[3, H - 1]];
    while (q.length) {
      const [x, y] = q.shift();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (inB(nx, ny) && tiles[idx(nx, ny)] === T.FLOOR && !seen.has(idx(nx, ny))) { seen.add(idx(nx, ny)); q.push([nx, ny]); }
      }
    }
    let ok = true;
    for (let x = 0; x < W; x++) if (!seen.has(idx(x, 0)) || !seen.has(idx(x, 1))) ok = false;
    if (ok) return { tiles, deco };
  }
  return { tiles: new Array(W * H).fill(T.FLOOR), deco: new Array(W * H).fill(0) };
}

// ---------------------------------------------------------------- units
export function unitFromMember(m, side, uid) {
  const s = memberStats(m);
  return {
    uid, side, memberId: side === 'player' ? m.id : null,
    name: m.name, boss: !!m.boss, species: m.species, role: m.role, rarity: m.rarity, level: m.level,
    x: 0, y: 0, hp: s.hp, maxHp: s.hp, ap: s.ap, maxAp: s.ap,
    muscle: s.muscle, aim: s.aim, nerve: s.nerve, def: s.def, crit: s.crit,
    trait: SPECIES[m.species].trait,
    weapon: { ...s.weapon }, gadget: s.gadget ? { ...s.gadget } : null, gadgetUsed: false,
    status: { poison: 0, smoke: false, suppressed: false }, patched: false, alive: true,
  };
}

export function createBattle({ seed, playerMembers, enemyMembers, kind, label, enemyGang, weather, reward, meta }) {
  const b = { v: 1, seed, rng: seed >>> 0, w: W, h: H, kind, label, enemyGang, turn: 1, side: 'player', status: 'active', result: null, log: [], reward, meta: meta || {} };
  b.weather = weather || (rngNext(b) < 0.5 ? 'rain' : rngNext(b) < 0.5 ? 'fog' : 'clear');
  const map = genMap(b);
  b.tiles = map.tiles; b.deco = map.deco;
  b.units = [];
  const placeRow = (members, side, rows) => {
    const slots = [];
    for (const y of rows) for (const x of [3, 2, 4, 1, 5, 0, 6]) if (b.tiles[idx(x, y)] === T.FLOOR) slots.push([x, y]);
    members.forEach((m, i) => {
      const u = unitFromMember(m, side, `${side[0]}${i}`);
      const [x, y] = slots[i] || [i % W, rows[0]];
      u.x = x; u.y = y;
      b.units.push(u);
    });
  };
  placeRow(playerMembers, 'player', [H - 1, H - 2]);
  placeRow(enemyMembers, 'enemy', [0, 1]);
  b.log.push(`Turn 1. ${b.weather === 'rain' ? 'Rain: -10% to hit.' : b.weather === 'fog' ? 'Fog: ranged shots past 4 tiles -15%.' : 'Clear night.'}`);
  return b;
}

// ---------------------------------------------------------------- queries
export function reachable(b, u) {
  // BFS over floor tiles, 1 AP per orthogonal step; returns Map key "x,y" -> {cost, path}
  const out = new Map();
  if (!u.alive || u.ap <= 0) return out;
  const start = { x: u.x, y: u.y, cost: 0, path: [] };
  const q = [start];
  const seen = new Set([`${u.x},${u.y}`]);
  while (q.length) {
    const c = q.shift();
    if (c.cost >= u.ap) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = c.x + dx, ny = c.y + dy, k = `${nx},${ny}`;
      if (seen.has(k) || !inB(nx, ny) || tileAt(b, nx, ny) !== T.FLOOR || unitAt(b, nx, ny)) continue;
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
  return checks.some(([x, y]) => inB(x, y) && tileAt(b, x, y) !== T.FLOOR);
}

const adjacentAlly = (b, u) => living(b, u.side).some((o) => o.uid !== u.uid && dist(o, u) === 1);

export function attackPreview(b, u, t, mode = 'shot', fromPos) {
  const pos = fromPos || u;
  if (!t.alive || t.side === u.side) return null;
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
    if (kill) t.alive = false;
    ev.push({ type: 'attack', uid: u.uid, target: t.uid, hit: true, dmg, crit, kill, melee: p.melee, chance: p.chance });
    b.log.push(`${u.name} ${p.melee ? 'hits' : 'shoots'} ${t.name} for ${dmg}${crit ? ' (CRIT)' : ''}${kill ? ' and drops them' : ''}.`);
    checkEnd(b, ev);
    return { ok: true, ev };
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

function checkEnd(b, ev) {
  if (b.status !== 'active') return;
  if (!living(b, 'enemy').length) { b.status = 'done'; b.result = 'win'; ev.push({ type: 'end', result: 'win' }); }
  else if (!living(b, 'player').length) { b.status = 'done'; b.result = 'loss'; ev.push({ type: 'end', result: 'loss' }); }
}

export function retreat(b) {
  if (b.status !== 'active') return;
  b.status = 'done'; b.result = 'loss'; b.endReason = 'retreat';
}
