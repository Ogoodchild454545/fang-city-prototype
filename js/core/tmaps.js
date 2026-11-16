// Docklands container yard — the 4v4 operator (PvP) battle map.
// Flat: container stacks are solid cover, not climbable. Cover is not destructible.
import { rngInt } from './rng.js';
import { mapFromJson } from './mapfmt.js';
import { DOCKLANDS } from './maps/docklands.js';

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
export const DIRS4 = DIRS;

export function blankTile(t = 'yard') {
  return { t, block: 0, cover: 0, face: -1, decor: '', los: 0, explosive: 0, hue: '' };
}

export function makeGrid(w, h, fill = 'yard') {
  const tiles = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) row.push(blankTile(fill));
    tiles.push(row);
  }
  return { w, h, tiles };
}

export const inB = (m, x, y) => x >= 0 && y >= 0 && x < m.w && y < m.h;
export const tile = (m, x, y) => (inB(m, x, y) ? m.tiles[y][x] : null);

// The 22×16 PvP yard: open west apron, container lanes, office and bar interiors, canal along
// the west edge. Since v0.7 it is stored in the map JSON format (js/core/maps/docklands.js) and
// loads through the same path as player-made maps.
export function docklandsMap() {
  const m = mapFromJson(DOCKLANDS);
  m.flavour = 'docklands';
  m.id = 'docklands';
  m.name = 'Docklands container yard';
  return m;
}

// Same yard, with Rook west of a crate and Hook behind it, plus a clear southern flank.
export function tutorialMap() {
  const m = docklandsMap();
  m.start = {
    player: [{ x: 6, y: 9 }],
    enemy: [{ x: 13, y: 9 }],
  };
  m.flavour = 'tutorial';
  m.tutorial = 1;
  return m;
}

// Street / PvP fights all use this yard (kept as named exports so older calls still work).
export function avenueMap() { return docklandsMap(); }
export function alleyMap() { return docklandsMap(); }
export function crossingMap() { return docklandsMap(); }

export function deploySpots(m, side) {
  if (m.start && m.start[side]) return m.start[side].slice();
  const spots = [];
  const xs = side === 'player' ? [5, 6, 7] : [m.w - 3, m.w - 2, m.w - 4];
  for (const x of xs) {
    for (let y = 1; y < m.h - 1; y++) {
      const t = tile(m, x, y);
      if (t && !t.block && t.t !== 'water') spots.push({ x, y });
    }
  }
  return spots;
}

export function pickDeploys(m, side, n, seed = 1) {
  // Hand-placed seats are used in order; an editor spawn zone (startZone) is sampled by seed.
  if (!m.startZone && m.start && m.start[side] && m.start[side].length >= n) return m.start[side].slice(0, n);
  const holder = { rng: (seed >>> 0) || 1 };
  const spots = deploySpots(m, side).slice();
  const out = [];
  while (out.length < n && spots.length) {
    const i = rngInt(holder, 0, spots.length - 1);
    const [s] = spots.splice(i, 1);
    if (out.some((o) => o.x === s.x && o.y === s.y)) continue;
    out.push(s);
  }
  return out;
}

// Plain inventory for review: every gameplay tile and scenery type on the yard.
export function describeDocklands() {
  const m = docklandsMap();
  const groups = {};
  const add = (key, rec) => { (groups[key] ||= []).push(rec); };
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      const t = m.tiles[y][x];
      if (t.t === 'water' && !t.decor) { add('water (impassable canal)', { x, y }); continue; }
      if (t.t === 'edge' && !t.decor) { add('quay edge (walkable)', { x, y }); continue; }
      if (t.t === 'yard' && !t.decor) continue;
      if (t.t === 'shed' && !t.decor) { add('workshop canopy (walkable)', { x, y }); continue; }
      if (t.t === 'interior' && !t.decor) { add('interior floor (walkable)', { x, y, in: t.t }); continue; }
      const rec = {
        x, y, decor: t.decor || t.t, terrain: t.t,
        cover: t.cover, coverLabel: t.cover >= 2 ? 'full' : t.cover === 1 ? 'half' : 'none',
        blocksMove: !!t.block, blocksLOS: !!t.los, explosive: !!t.explosive,
        hue: t.hue || undefined, stack: t.stack || undefined,
      };
      let key = t.decor || t.t;
      if (t.decor === 'container') key = `container (${t.hue || 'steel'}, visual stack ${t.stack || 1}, solid, not climbable)`;
      else if (t.decor === 'van' || t.decor === 'van2') key = `van (${t.hue || 'white'}, explosive, 2 tiles)`;
      else if (t.decor === 'barrel') key = 'explosive barrel (half cover)';
      else if (t.decor === 'crate') key = 'crate / pallet (half cover)';
      else if (t.decor === 'barrier') key = 'concrete barrier (full cover)';
      else if (t.decor === 'wall') key = `building wall (${t.hue || 'office'}, full cover, blocks LOS)`;
      else if (t.decor === 'desk') key = 'interior desk / bar counter (half cover)';
      else if (t.decor === 'shelf') key = 'interior shelving (half cover)';
      else if (t.decor === 'fence') key = 'chain-link fence (blocks movement, no cover, see-through)';
      else if (t.decor === 'burn') key = 'burn barrel (half cover, not explosive)';
      else if (t.decor === 'door') key = `doorway (walkable, ${t.hue || ''})`;
      else if (t.decor === 'boat') key = `moored boat scenery (${t.hue || 'tug'}, impassable water)`;
      else if (t.decor === 'stairs') key = 'decorative stairs (not walkable high ground)';
      else if (t.decor === 'lamp') key = 'lamp post (scenery, no cover)';
      else if (t.decor === 'barrel-shelf') key = 'workshop scenery (not explosive)';
      add(key, rec);
    }
  }
  const plainYard = [];
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const t = m.tiles[y][x];
    if (t.t === 'yard' && !t.decor) plainYard.push({ x, y });
  }
  groups['yard concrete (walkable, no cover)'] = [`${plainYard.length} tiles`];
  return {
    name: m.name, size: `${m.w}×${m.h}`,
    win: 'Knock out the whole enemy squad',
    elevation: 'Flat — container tops are not walkable high ground',
    fog: 'None — full view',
    coverDestructible: false,
    explosives: 'Vans and red barrels can be shot; they explode for area damage and leave a burnt wreck that still gives the same cover',
    spawns: m.start,
    groups,
  };
}
