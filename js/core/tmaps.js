// Modern-street battle maps. Clean streets, alleys, parked cars, barriers and crates
// as cover. No junk or ruin buildings.
import { rngInt, rngNext } from './rng.js';

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

export function blankTile(t = 'walk') {
  return { t, block: 0, cover: 0, face: -1, decor: '' };
}

export function makeGrid(w, h, fill = 'walk') {
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

function paintRoad(m, y0, lanes = 2) {
  for (let y = y0; y < y0 + lanes && y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      const t = m.tiles[y][x];
      t.t = 'road';
    }
  }
}

function put(m, x, y, decor, cover, face = -1, block = 1) {
  if (!inB(m, x, y)) return;
  const t = m.tiles[y][x];
  if (t.block) return;
  t.decor = decor; t.cover = cover; t.face = face; t.block = block;
}

// A car occupies two tiles along an axis and gives full cover on its long sides.
function putCar(m, x, y, horiz = true) {
  if (horiz) {
    if (!inB(m, x + 1, y) || m.tiles[y][x].block || m.tiles[y][x + 1].block) return false;
    put(m, x, y, 'car', 2, 1, 1);
    put(m, x + 1, y, 'car2', 2, 1, 1);
  } else {
    if (!inB(m, x, y + 1) || m.tiles[y][x].block || m.tiles[y + 1][x].block) return false;
    put(m, x, y, 'car', 2, 0, 1);
    put(m, x, y + 1, 'car2', 2, 0, 1);
  }
  return true;
}

export function streetMap(w, h, seed, flavour = 'avenue') {
  const holder = { rng: (seed >>> 0) || 1 };
  const m = makeGrid(w, h, 'walk');
  const roadY = flavour === 'alley' ? Math.floor(h / 2) - 1 : Math.floor(h / 2) - 1;
  const lanes = flavour === 'alley' ? 1 : 2;
  paintRoad(m, roadY, lanes);
  // sidewalks already walk; mark a slightly different type either side of the road
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (m.tiles[y][x].t === 'walk' && Math.abs(y - roadY) <= lanes + 1) m.tiles[y][x].t = 'side';
      if (y === 0 || y === h - 1) m.tiles[y][x].t = 'alley';
    }
  }
  // shopfront walls along the top / bottom, not rubble — solid clean facades
  if (flavour !== 'tutorial') {
    for (let x = 2; x < w - 2; x++) {
      if (x % 5 === 0) continue; // leave door gaps
      put(m, x, 0, 'wall', 2, 1, 1);
      put(m, x, h - 1, 'wall', 2, 3, 1);
    }
  }
  // parked cars along the kerb
  const kerbA = roadY - 1, kerbB = roadY + lanes;
  const cars = flavour === 'tutorial' ? 2 : flavour === 'alley' ? 3 : 5;
  let placed = 0, guard = 0;
  while (placed < cars && guard++ < 80) {
    const y = rngNext(holder) < 0.5 ? kerbA : kerbB;
    const x = rngInt(holder, 2, w - 4);
    if (putCar(m, x, y, true)) placed++;
  }
  // crates and concrete barriers as extra cover in the street and alleys
  const extras = flavour === 'tutorial' ? 4 : 8;
  for (let i = 0; i < extras; i++) {
    const x = rngInt(holder, 1, w - 2);
    const y = rngInt(holder, 1, h - 2);
    if (m.tiles[y][x].block || m.tiles[y][x].t === 'road') continue;
    if (i % 3 === 0) put(m, x, y, 'barrier', 2, rngInt(holder, 0, 3), 1);
    else put(m, x, y, 'crate', 1, -1, 1);
  }
  m.flavour = flavour;
  m.roadY = roadY;
  m.lanes = lanes;
  return m;
}

// Hand-authored tutorial street: Rook west, Hook east behind a crate, a clear flank route.
export function tutorialMap() {
  const m = makeGrid(14, 10, 'walk');
  paintRoad(m, 4, 2);
  for (let x = 0; x < m.w; x++) {
    if (m.tiles[3][x].t !== 'road') m.tiles[3][x].t = 'side';
    if (m.tiles[6][x].t !== 'road') m.tiles[6][x].t = 'side';
  }
  putCar(m, 5, 3, true);
  putCar(m, 4, 6, true);
  put(m, 9, 5, 'crate', 1, -1, 1); // Hook's cover from the west
  put(m, 8, 2, 'crate', 1, -1, 1);
  put(m, 10, 7, 'barrier', 2, 3, 1);
  put(m, 3, 2, 'barrier', 2, 1, 1);
  m.flavour = 'tutorial';
  m.roadY = 4;
  m.lanes = 2;
  m.start = { player: [{ x: 2, y: 5 }], enemy: [{ x: 10, y: 5 }] };
  return m;
}

export function avenueMap(seed) { return streetMap(20, 16, seed, 'avenue'); }
export function alleyMap(seed) { return streetMap(18, 14, seed, 'alley'); }
export function crossingMap(seed) {
  const m = streetMap(22, 16, seed, 'avenue');
  // a north-south road as well
  const mid = 10;
  for (let y = 0; y < m.h; y++) {
    for (let x = mid; x <= mid + 1; x++) {
      if (!m.tiles[y][x].block) m.tiles[y][x].t = 'road';
    }
  }
  m.flavour = 'crossing';
  return m;
}

export function deploySpots(m, side) {
  const spots = [];
  const xs = side === 'player' ? [1, 2, 3] : [m.w - 2, m.w - 3, m.w - 4];
  for (const x of xs) {
    for (let y = 1; y < m.h - 1; y++) {
      const t = tile(m, x, y);
      if (t && !t.block) spots.push({ x, y });
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
    if (out.some((o) => Math.abs(o.x - s.x) + Math.abs(o.y - s.y) === 0)) continue;
    out.push(s);
  }
  return out;
}

export const DIRS4 = DIRS;
