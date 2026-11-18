// v0.10 Street ops: short (3–5 minute) turn-based fights for operators. Small numbers of foes
// placed close together on the ready-made maps, so a fight is a handful of rounds. The long
// 4v4 Docklands fights stay for PvP. Story ops replace this list in roadmap step 3.
import { mapFromJson } from './mapfmt.js';
import { BUILTIN_BY_ID } from './maps/index.js';
import { tile, inB, tutorialMap, DIRS4 } from './tmaps.js';
import { startBattle, startTutorial, packFromState } from './tactics.js';
import { playerLv, squadCap, opsSquad, isUnlocked, spendEnergy, energy } from './progression.js';

// tut: free tutorial op (no energy). lv: player level needed. foes: rival ids. elv: foe level.
export const OPS = [
  { id: 't1', name: 'Street lesson', tut: 1, lesson: 1, lv: 1, map: 'docklands', foes: ['hook'], elv: 1, cash: 150,
    blurb: 'Hook owes the Pack money. Learn action points, cover and Pounce.' },
  { id: 't2', name: 'Late payment', tut: 1, lv: 1, map: 'back_streets', foes: ['knack'], elv: 1, cash: 150,
    blurb: 'A rat runner skipped a payment. Corner him in the back streets.' },
  { id: 't3', name: 'Crate snatch', tut: 1, lv: 1, map: 'fish_wharf', foes: ['slab'], elv: 1, cash: 200,
    blurb: 'A badger is sitting on our crate at the wharf. Take it back.' },
  { id: 'o1', name: 'Corner squeeze', lv: 3, map: 'corner_shop', foes: ['hook'], elv: 1, cash: 220, blurb: 'The corner shop stopped paying. Remind them.' },
  { id: 'o2', name: 'Rail yard tip-off', lv: 3, map: 'rail_sidings', foes: ['knack'], elv: 2, cash: 240, blurb: 'A rat lookout by the sidings. Catch him before he runs.' },
  { id: 'o3', name: 'Neon shakedown', lv: 4, map: 'neon_strip', foes: ['ash'], elv: 2, cash: 260, blurb: 'A Grey Pack gun on our strip.' },
  { id: 'o4', name: 'Foundry debt', lv: 4, map: 'foundry', foes: ['rill'], elv: 2, cash: 280, blurb: 'The croc foreman thinks he is untouchable.' },
  { id: 'o5', name: 'Velvet rope', lv: 5, map: 'club_velvet', foes: ['slab', 'hook'], elv: 2, cash: 320, blurb: 'Two bouncers, one back door.' },
  { id: 'o6', name: 'Gator farm run', lv: 5, map: 'gator_farm', foes: ['rill', 'pact'], elv: 3, cash: 340, blurb: 'Their medic keeps the croc on his feet. Split them.' },
  { id: 'o7', name: 'Wharf ambush', lv: 6, map: 'fish_wharf', foes: ['mica', 'knack'], elv: 3, cash: 360, blurb: 'A sniper on the ice boxes and a runner below.' },
  { id: 'o8', name: 'Back-alley toll', lv: 6, map: 'back_streets', foes: ['ash', 'hook'], elv: 3, cash: 380, blurb: 'They are charging our runners to pass.' },
  { id: 'o9', name: 'Signal box', lv: 7, map: 'rail_sidings', foes: ['slab', 'hook', 'knack'], elv: 3, cash: 420, blurb: 'Three of them holding the signal box.' },
  { id: 'o10', name: 'Last orders', lv: 7, map: 'club_velvet', foes: ['bruno', 'pact', 'hook'], elv: 4, cash: 450, blurb: 'A bear with a drum gun and friends.' },
  { id: 'o11', name: 'Hot metal', lv: 8, map: 'foundry', foes: ['rill', 'mica', 'knack'], elv: 4, cash: 480, blurb: 'Watch the barrels by the furnace.' },
  { id: 'o12', name: 'Neon blackout', lv: 8, map: 'neon_strip', foes: ['ash', 'ash', 'pact'], elv: 5, cash: 520, blurb: 'Cut the lights, then cut them down.' },
  { id: 'o13', name: 'Shop front', lv: 9, map: 'corner_shop', foes: ['slab', 'mica', 'hook'], elv: 5, cash: 560, blurb: 'They have dug in behind the park wall.' },
  { id: 'o14', name: 'Container yard', lv: 10, map: 'docklands', foes: ['slab', 'ash', 'pact', 'knack'], elv: 5, cash: 620, blurb: 'A full Grey Pack crew on the docks.' },
  { id: 'o15', name: 'Gator pit', lv: 10, map: 'gator_farm', foes: ['rill', 'rill', 'pact', 'mica'], elv: 6, cash: 680, blurb: 'Two crocs and a sniper. Bring a medic.' },
  { id: 'o16', name: 'Furnace floor', lv: 12, map: 'foundry', foes: ['bruno', 'slab', 'mica', 'pact'], elv: 7, cash: 760, blurb: 'Heavy hitters. Use the barrels.' },
  { id: 'o17', name: 'Velvet takeover', lv: 14, map: 'club_velvet', foes: ['bruno', 'ash', 'mica', 'pact'], elv: 8, cash: 850, blurb: 'Take the club from the top floor down.' },
];
export const OP_BY_ID = Object.fromEntries(OPS.map((o) => [o.id, o]));

export const opXp = (op, win, first = true) => (op.tut ? Math.round((op.lesson ? 90 : 80) / (first ? 1 : 2)) : (win ? 30 + (first ? 30 : 0) : 10));
export const isCleared = (s, id) => !!(s.ops && s.ops.cleared && s.ops.cleared[id]);
export function opStatus(s, op) {
  if (op.tut) {
    const i = OPS.indexOf(op);
    const prev = i > 0 ? OPS[i - 1] : null;
    if (prev && !isCleared(s, prev.id) && !(prev.lesson && s.heroes.tutorialDone)) return { locked: true, reason: `Clear “${prev.name}” first` };
  } else if (playerLv(s) < op.lv) return { locked: true, reason: `Unlocks at Lv ${op.lv}` };
  else if (!tutorialOpsDone(s)) return { locked: true, reason: 'Finish the three tutorial ops first' };
  return { locked: false, cleared: isCleared(s, op.id) || (op.lesson && s.heroes.tutorialDone) };
}
export const tutorialOpsDone = (s) => OPS.filter((o) => o.tut).every((o) => isCleared(s, o.id) || (o.lesson && s.heroes.tutorialDone));
// The op the "Next op" button points at: first uncleared open op, else the newest open one.
export function nextOp(s) {
  const open = OPS.filter((o) => !opStatus(s, o).locked);
  return open.find((o) => !opStatus(s, o).cleared) || open[open.length - 1] || OPS[0];
}
// First clear pays double; a replay of a completed op pays about half of that (cash, Rep and XP).
export function opReward(s, op, first) {
  const cash = first ? op.cash * 2 : op.cash;
  const rep = isUnlocked(s, 'rep') && !op.tut ? Math.round(op.cash / 12) : 0;
  const influence = first ? rep : Math.round(rep / 2);
  return { cash, influence };
}

// Close-quarters start: both sides placed a few tiles apart near the middle of the map, in the
// same walkable area, so ops are short. Player seats west of centre, enemy seats east.
function walk(m, x, y) { const t = tile(m, x, y); return !!(t && !t.block && t.t !== 'water' && !t.explosive); }
function component(m, sx, sy) {
  const seen = new Set([sx + ',' + sy]), q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of DIRS4) { const nx = x + dx, ny = y + dy, k = nx + ',' + ny; if (!seen.has(k) && inB(m, nx, ny) && walk(m, nx, ny)) { seen.add(k); q.push([nx, ny]); } }
  }
  return seen;
}
export function closeStart(m, nP, nE, gap = 7) {
  const cx = Math.floor(m.w / 2), cy = Math.floor(m.h / 2);
  const near = (tx, ty, ok) => {
    const c = [];
    for (let y = 1; y < m.h - 1; y++) for (let x = 1; x < m.w - 1; x++) if (walk(m, x, y) && ok(x, y)) c.push({ x, y, d: Math.abs(x - tx) * 1.3 + Math.abs(y - ty) });
    return c.sort((a, b) => a.d - b.d);
  };
  const px = cx - Math.ceil(gap / 2), ex = px + gap;
  const pc = near(px, cy, () => true);
  for (const seed of pc.slice(0, 12)) {
    const comp = component(m, seed.x, seed.y);
    const inC = (x, y) => comp.has(x + ',' + y);
    const pl = near(px, cy, (x, y) => inC(x, y) && x <= cx - 1).slice(0, nP);
    const en = near(ex, cy, (x, y) => inC(x, y) && x >= cx + 1).slice(0, nE);
    if (pl.length === nP && en.length === nE) return { player: pl.map(({ x, y }) => ({ x, y })), enemy: en.map(({ x, y }) => ({ x, y })) };
  }
  return null;
}
export function opMap(op, nP, nE) {
  const j = BUILTIN_BY_ID[op.map] || BUILTIN_BY_ID.docklands;
  const m = mapFromJson(j);
  m.id = j.id; m.name = j.name; m.flavour = j.id === 'docklands' ? 'docklands' : (m.flavour || j.id);
  const st = closeStart(m, nP, nE);
  if (st) { m.start = st; delete m.startZone; }
  return m;
}

// Start an op. Tutorial ops are free; the rest cost 1 energy. Ammo is issued for the op
// (ops never block on base supplies); the long fights that spend your stock are PvP.
export function startOp(s, opId, now = Date.now(), seed) {
  const op = OP_BY_ID[opId];
  if (!op) return { ok: false, reason: 'Unknown op' };
  const st = opStatus(s, op);
  if (st.locked) return { ok: false, reason: st.reason };
  if (op.lesson) {
    const b = startTutorial(s, seed || s.rng);
    b.opId = op.id; b.label = `Op · ${op.name}`;
    return { ok: true, battle: b };
  }
  // ops are N v N at most: an op with fewer foes takes only your first operators
  const squad = opsSquad(s, now).slice(0, Math.max(1, op.foes.length));
  if (!squad.length) return { ok: false, reason: 'Nobody is home: your operators are on jobs or in the clinic.' };
  if (!op.tut && energy(s, now).n < 1) return { ok: false, reason: 'energy' };
  const n = Math.min(op.foes.length, Math.max(1, op.tut ? 1 : op.foes.length));
  const enemy = op.foes.slice(0, n);
  const map = opMap(op, squad.length, enemy.length);
  const recs = {}, ammo = {};
  for (const id of squad) { recs[id] = packFromState(s, id); ammo[id] = 6; }
  const first = !isCleared(s, op.id);
  const reward = opReward(s, op, first);
  const b = startBattle({
    map, player: squad, enemy, seed: (seed >>> 0) || s.rng || 1,
    label: `Op · ${op.name}`, kind: 'op', pvp: false, reward,
    loadout: { recs, ammo, medkits: {} },
    enemyRecs: enemy.map(() => ({ lv: op.elv || 1 })),
  });
  b.opId = op.id; b.freeAmmo = 1; b.firstClear = first;
  if (!op.tut) spendEnergy(s, 1, now);
  s.ops.runs = (s.ops.runs || 0) + 1;
  return { ok: true, battle: b };
}
export { squadCap };
