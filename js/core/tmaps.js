// Docklands container yard — the 4v4 operator (PvP) battle map.
// Flat: container stacks are solid cover, not climbable. Cover is not destructible.
import { rngInt } from './rng.js';

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

function setTile(m, x, y, patch) {
  if (!inB(m, x, y)) return null;
  Object.assign(m.tiles[y][x], patch);
  return m.tiles[y][x];
}

function put(m, x, y, decor, cover, opts = {}) {
  if (!inB(m, x, y)) return null;
  const t = m.tiles[y][x];
  t.decor = decor;
  t.cover = cover;
  t.block = opts.block == null ? 1 : opts.block;
  t.face = opts.face == null ? -1 : opts.face;
  t.los = opts.los || 0;
  t.explosive = opts.explosive || 0;
  t.hue = opts.hue || '';
  t.stack = opts.stack || 0;
  if (opts.t) t.t = opts.t;
  return t;
}

function putVan(m, x, y, hue = 'white') {
  // Two tiles, full cover, can be shot to explode; wreck keeps the same cover.
  put(m, x, y, 'van', 2, { explosive: 1, hue, partner: { x: x + 1, y } });
  put(m, x + 1, y, 'van2', 2, { explosive: 1, hue, partner: { x, y } });
  m.tiles[y][x].partner = { x: x + 1, y };
  m.tiles[y][x + 1].partner = { x, y };
}

// A medium, hand-authored 22×16 PvP yard. Open west apron, container lanes,
// office and cafe interiors, canal along the west edge. 4v4, ~10–20 minute fights.
export function docklandsMap() {
  const W = 22, H = 16;
  const m = makeGrid(W, H, 'yard');

  // Canal (impassable) and quay edge (walkable lip).
  for (let y = 0; y < H; y++) {
    for (let x = 0; x <= 2; x++) setTile(m, x, y, { t: 'water', block: 1, decor: '' });
    setTile(m, 3, y, { t: 'edge', block: 0, decor: '' });
  }
  put(m, 1, 2, 'boat', 0, { block: 1, t: 'water', hue: 'tug' });
  put(m, 1, 7, 'boat', 0, { block: 1, t: 'water', hue: 'work' });
  put(m, 1, 13, 'boat', 0, { block: 1, t: 'water', hue: 'small' });

  // Dock office (north): walls block LOS and movement; door on the south; desk inside.
  // Stairs on the west wall are scenery only — the map is flat, they are not climbable.
  const officeWalls = [
    [10, 0], [11, 0], [12, 0], [13, 0],
    [10, 1], [13, 1],
    [10, 2], [11, 2], [13, 2],
  ];
  for (const [x, y] of officeWalls) put(m, x, y, 'wall', 2, { los: 1, hue: 'office' });
  setTile(m, 11, 1, { t: 'interior' });
  setTile(m, 12, 1, { t: 'interior' });
  put(m, 11, 1, 'desk', 1, { t: 'interior' });
  setTile(m, 12, 2, { t: 'door', block: 0, decor: 'door', cover: 0, hue: 'office' });
  put(m, 9, 1, 'stairs', 0, { block: 0, cover: 0 }); // decorative, not high ground

  // Open workshop canopy in the north-east — walkable shade, no walls on the south.
  for (let x = 17; x <= 19; x++) {
    for (let y = 0; y <= 1; y++) setTile(m, x, y, { t: 'shed' });
  }
  put(m, 19, 1, 'barrel-shelf', 0, { block: 0, cover: 0 }); // scenery on the back wall; not a blast barrel

  // Cafe (south-east): interiors, warm light, door on the west.
  const cafeWalls = [
    [17, 12], [18, 12], [19, 12], [20, 12],
    [20, 13], [20, 14],
    [17, 14], [18, 14], [19, 14], [20, 14],
    [17, 13],
  ];
  for (const [x, y] of cafeWalls) put(m, x, y, 'wall', 2, { los: 1, hue: 'cafe' });
  setTile(m, 18, 13, { t: 'interior' });
  setTile(m, 19, 13, { t: 'interior' });
  put(m, 19, 13, 'desk', 1, { t: 'interior', hue: 'cafe' });
  setTile(m, 17, 13, { t: 'door', block: 0, decor: 'door', cover: 0, hue: 'cafe' });

  // Shipping containers — solid, full cover, block LOS. Tops are not walkable.
  const containers = [
    // west-central stack (teal, two high visually)
    { x: 10, y: 4, hue: 'teal', stack: 2 }, { x: 11, y: 4, hue: 'teal', stack: 2 },
    { x: 10, y: 5, hue: 'teal', stack: 2 }, { x: 11, y: 5, hue: 'red', stack: 2 },
    // mid lane
    { x: 13, y: 5, hue: 'red', stack: 1 },
    { x: 13, y: 6, hue: 'teal', stack: 2 }, { x: 14, y: 6, hue: 'teal', stack: 2 },
    // east lane near the opponent apron
    { x: 14, y: 4, hue: 'red', stack: 1 }, { x: 15, y: 4, hue: 'red', stack: 1 }, { x: 16, y: 4, hue: 'teal', stack: 1 },
    { x: 16, y: 5, hue: 'teal', stack: 2 }, { x: 17, y: 5, hue: 'teal', stack: 2 },
    { x: 16, y: 6, hue: 'red', stack: 2 }, { x: 17, y: 6, hue: 'red', stack: 2 },
    // southern row (leaves y=9 open as the tutorial / mid lane)
    { x: 13, y: 8, hue: 'red', stack: 1 }, { x: 14, y: 8, hue: 'teal', stack: 1 }, { x: 15, y: 8, hue: 'teal', stack: 1 },
  ];
  for (const c of containers) put(m, c.x, c.y, 'container', 2, { los: 1, hue: c.hue, stack: c.stack });

  // Vans (full cover, explosive). After a blast they become wrecks with the same cover.
  putVan(m, 8, 6, 'white');
  putVan(m, 8, 12, 'grey');
  putVan(m, 19, 8, 'grey');

  // Concrete barriers — full cover, not explosive, not destructible.
  for (const [x, y] of [[7, 3], [7, 8], [7, 14], [10, 11]]) put(m, x, y, 'barrier', 2);

  // Crates / pallets — half cover, not destructible. (12,9) is Hook's tutorial cover from the west.
  for (const [x, y] of [[11, 7], [12, 9], [8, 10], [15, 10], [12, 12]]) put(m, x, y, 'crate', 1);

  // Explosive barrels — half cover, can be shot to explode, wreck keeps half cover. (17,8) and (10,12) sit beside vans so a shot can set off a chain.
  for (const [x, y] of [[19, 3], [17, 7], [17, 8], [5, 12], [10, 12], [11, 14]]) put(m, x, y, 'barrel', 1, { explosive: 1 });

  // Lamp posts: scenery, no cover, do not block.
  for (const [x, y] of [[8, 3], [16, 10]]) put(m, x, y, 'lamp', 0, { block: 0 });

  // Clear spawn zones — west apron for the player, east lane for the opponent.
  m.start = {
    player: [{ x: 4, y: 4 }, { x: 6, y: 5 }, { x: 4, y: 7 }, { x: 6, y: 8 }],
    enemy: [{ x: 18, y: 4 }, { x: 20, y: 5 }, { x: 18, y: 7 }, { x: 21, y: 6 }],
  };
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
  if (m.start && m.start[side] && m.start[side].length >= n) return m.start[side].slice(0, n);
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
      else if (t.decor === 'desk') key = 'interior desk (half cover)';
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
    elevation: 'Flat — container tops and stairs are not walkable high ground',
    fog: 'None — full view',
    coverDestructible: false,
    explosives: 'Vans and red barrels can be shot; they explode for area damage and leave a burnt wreck that still gives the same cover',
    spawns: m.start,
    groups,
  };
}
