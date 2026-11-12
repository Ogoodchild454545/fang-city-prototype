// Raids: rival bases use the same building catalogue and layout rules as the player's base.
// A base layout (any window of base tiles) converts into a turn-based battle grid:
//   building footprints -> solid blocks; the Den, storages and defences -> structure units on the
//   footprint's front tile (defences shoot back as turrets); barricades -> cover; loot sits in storages.
import { BUILDINGS, lvCap, turretOf, storeOf } from './buildings.js';
import { T, connected } from './battle.js';
import { rngNext, rngInt, rngPick } from './rng.js';

export const RAID_W = 12, RAID_H = 8, DEPLOY = 2;
const STRUCT_HP = { den: [60, 20], strongbox: [34, 10], ledger: [34, 10] };

export function generateRivalBase(seed, denLv) {
  const h = { rng: seed >>> 0 };
  for (let attempt = 0; attempt < 40; attempt++) {
    const occ = new Array(RAID_W * RAID_H).fill(null);
    const list = [];
    const free = (x, y, s) => { for (let j = y; j < y + s; j++) for (let i = x; i < x + s; i++) if (i < 0 || j < 0 || i >= RAID_W || j >= RAID_H || occ[j * RAID_W + i]) return false; return true; };
    // buildings keep a one-tile alley around them (walls excepted) so every door can be reached
    const roomy = (x, y, s) => { if (!free(x, y, s)) return false; for (let j = y - 1; j <= y + s; j++) for (let i = x - 1; i <= x + s; i++) if (i >= 0 && j >= 0 && i < RAID_W && j < RAID_H && occ[j * RAID_W + i]) return false; return true; };
    const put = (t, x, y) => { const s = BUILDINGS[t].size; for (let j = y; j < y + s; j++) for (let i = x; i < x + s; i++) occ[j * RAID_W + i] = t; const cap = lvCap(t, denLv); const b = { t, x, y, lv: t === 'den' ? denLv : Math.max(1, rngInt(h, cap - 3, cap)) }; list.push(b); return b; };
    const tryPut = (t, near, r = 3) => {
      const s = BUILDINGS[t].size;
      for (let a = 0; a < 50; a++) {
        const x = near ? near.x + rngInt(h, -r - s + 1, r + 2) : rngInt(h, 1, RAID_W - s);
        const y = near ? near.y + rngInt(h, -r - s + 1, r + 2) : rngInt(h, 0, RAID_H - s);
        if (x < 1) continue; // keep the first base column open as an approach lane
        if (roomy(x, y, s)) return put(t, x, y);
      }
      return null;
    };
    const den = put('den', rngInt(h, 6, 7), rngInt(h, 2, 3));
    const n = (t) => BUILDINGS[t].counts[denLv] || 0;
    for (let i = 0; i < Math.min(2, n('strongbox')); i++) tryPut('strongbox', den, 2);
    if (n('ledger')) tryPut('ledger', den, 2);
    for (let i = 0; i < Math.min(2, n('sniper')); i++) tryPut('sniper', den, 3);
    for (let i = 0; i < Math.min(1, n('cannon')); i++) tryPut('cannon', den, 2);
    const money = ['stall', 'carwash', 'radio', 'phone'].filter((t) => n(t));
    for (let i = 0; i < (denLv >= 3 ? 1 : 2); i++) tryPut(rngPick(h, money));
    if (denLv < 2) tryPut('sniper', den, 3); // even a starter base has someone on watch (as an L1 nest)
    // barricades: a broken ring around the Den from Den level 3
    if (n('wall')) {
      const ring = [];
      for (let x = den.x - 1; x <= den.x + 3; x++) ring.push([x, den.y - 1], [x, den.y + 3]);
      for (let y = den.y; y <= den.y + 2; y++) ring.push([den.x - 1, y], [den.x + 3, y]);
      const gaps = new Set([rngInt(h, 0, ring.length - 1), rngInt(h, 0, ring.length - 1), rngInt(h, 0, ring.length - 1)]);
      // the Den's front door (left of its anchor) always stays open
      ring.forEach(([x, y], i) => { if (x === den.x - 1 && y === den.y + 1) return; if (!gaps.has(i) && free(x, y, 1) && rngNext(h) < 0.8) put('wall', x, y); });
    }
    const lay = baseToRaidLayout(list, 0, 0, RAID_W, RAID_H, { cash: 1, influence: 1 });
    if (lay.reachableAll) return list;
  }
  return [{ t: 'den', x: 6, y: 2, lv: denLv }];
}

// Convert any set of base buildings (in base tile coords) inside a window into a battle layout.
export function baseToRaidLayout(buildings, ox, oy, ww = RAID_W, wh = RAID_H, loot = { cash: 0, influence: 0 }) {
  const w = ww + DEPLOY, h = wh;
  const tiles = new Array(w * h).fill(T.FLOOR), deco = new Array(w * h).fill(0);
  const structures = [], props = [];
  const inWin = (b) => { const s = BUILDINGS[b.t].size; return b.x >= ox && b.y >= oy && b.x + s <= ox + ww && b.y + s <= oy + wh; };
  const inside = buildings.filter(inWin);
  const boxes = inside.filter((b) => b.t === 'strongbox').length, ledgers = inside.filter((b) => b.t === 'ledger').length;
  for (const b of inside) {
    const d = BUILDINGS[b.t], s = d.size;
    const fx = b.x - ox + DEPLOY, fy = b.y - oy;
    if (b.t === 'wall') { tiles[fy * w + fx] = T.COVER; deco[fy * w + fx] = 4; props.push({ t: 'wall', lv: b.lv, fx, fy, size: 1 }); continue; }
    for (let j = fy; j < fy + s; j++) for (let i = fx; i < fx + s; i++) tiles[j * w + i] = T.WALL;
    props.push({ t: b.t, lv: b.lv, fx, fy, size: s });
    const isStruct = b.t === 'den' || b.t === 'strongbox' || b.t === 'ledger' || d.turret;
    if (!isStruct) continue;
    const ax = fx, ay = fy + Math.floor(s / 2); // front-left tile faces the attackers
    tiles[ay * w + ax] = T.FLOOR;
    const tur = turretOf(b.t, b.lv);
    const hpd = STRUCT_HP[b.t];
    let l = null;
    if (b.t === 'den') l = { cash: Math.round(loot.cash * (boxes ? 0.25 : 1)), influence: Math.round(loot.influence * (ledgers ? 0.25 : 1)) };
    if (b.t === 'strongbox') l = { cash: Math.round((loot.cash * 0.75) / boxes), influence: 0 };
    if (b.t === 'ledger') l = { cash: 0, influence: Math.round((loot.influence * 0.75) / ledgers) };
    structures.push({ t: b.t, name: d.name, lv: b.lv, x: ax, y: ay, fx, fy, size: s, hp: tur ? tur.hp : hpd[0] + hpd[1] * (b.lv - 1), def: b.t === 'den' ? 2 : 1, turret: tur, loot: l });
  }
  const lay = { w, h, tiles, deco, structures, props };
  // a little street cover in the approach lane
  const hh = { rng: (inside.length * 7919 + ox * 31 + oy) >>> 0 };
  for (let k = 0; k < 3; k++) { const x = rngInt(hh, 1, 2), y = rngInt(hh, 0, h - 1); if (tiles[y * w + x] === T.FLOOR) { tiles[y * w + x] = T.COVER; deco[y * w + x] = rngInt(hh, 0, 2); } }
  // can attackers reach a tile next to every structure?
  const c = connected({ w, h, tiles }, [0], [0]);
  lay.reachableAll = structures.every((st) => [[st.x - 1, st.y], [st.x, st.y - 1], [st.x, st.y + 1], [st.x + 1, st.y]].some(([x, y]) => x >= 0 && y >= 0 && x < w && y < h && c.seen.has(y * w + x)));
  // guards stand around the Den
  const den = structures.find((s2) => s2.t === 'den');
  const cols = [];
  if (den) for (const x of [den.fx + 3, den.fx - 1, den.fx + 4, den.fx - 2, den.fx + 2]) if (x >= DEPLOY + 1 && x < w) cols.push(x);
  for (let x = w - 1; x > DEPLOY; x--) if (!cols.includes(x)) cols.push(x);
  lay.guardCols = cols;
  return lay;
}

// Window of the player's own base around the Den (for a future "defend your base" mode where rivals raid you).
export function playerBaseLayout(state) {
  const d = state.base.buildings.find((b) => b.t === 'den');
  const ox = Math.max(0, d.x - 4), oy = Math.max(0, d.y - 3);
  return baseToRaidLayout(state.base.buildings.filter((b) => b.lv > 0), ox, oy, RAID_W, RAID_H, { cash: state.cash * 0.2, influence: state.influence * 0.2 });
}

export function rivalLoot(h, denLv) {
  const cashCap = BUILDINGS.den.store.cash[denLv] + 2 * storeOf('strongbox', lvCap('strongbox', denLv) - 1, 'cash');
  const inflCap = BUILDINGS.den.store.influence[denLv] + storeOf('ledger', lvCap('ledger', denLv) - 1, 'influence');
  return { cash: Math.round((200 + cashCap * 0.18) * (0.7 + rngNext(h) * 0.5)), influence: Math.round((20 + inflCap * 0.18) * (0.7 + rngNext(h) * 0.5)) };
}
