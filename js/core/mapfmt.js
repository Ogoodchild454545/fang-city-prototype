// Fang City battle-map format (v1): plain JSON, one string per row per layer, so maps are easy
// to read, diff and hand-edit. Multi-tile things (container runs, vans, boats) live in an object
// list. Every battle map, including the built-in Docklands yard, loads through mapFromJson().
// Spec: docs/map-editor.md.

export const MAP_FORMAT = 'fang-city-map';
export const MAP_VERSION = 1;
export const MAP_SIZES = { small: [16, 12], medium: [22, 16], large: [28, 20] };
export const MIN_SPAWNS = 4;

// ground layer
export const GROUND = {
  '.': { t: 'yard', label: 'Concrete' },
  '~': { t: 'water', label: 'Water / canal', block: 1 },
  '=': { t: 'edge', label: 'Quay edge' },
  's': { t: 'shed', label: 'Workshop canopy' },
  'o': { t: 'interior', hue: 'office', label: 'Office floor' },
  'r': { t: 'interior', hue: 'cafe', label: 'Bar floor' },
};
// single-tile props layer (cover: 1 half, 2 full)
export const PROPS = {
  '.': null,
  'x': { decor: 'crate', cover: 1, label: 'Crates' },
  'b': { decor: 'barrel', cover: 1, explosive: 1, label: 'Explosive barrel' },
  'f': { decor: 'burn', cover: 1, label: 'Burn barrel' },
  'B': { decor: 'barrier', cover: 2, label: 'Concrete barrier' },
  'l': { decor: 'lamp', cover: 0, block: 0, label: 'Lamp post' },
  'n': { decor: 'fence', cover: 0, label: 'Fence' },
  'W': { decor: 'wall', cover: 2, los: 1, cut: 0, label: 'Wall' },
  'w': { decor: 'wall', cover: 2, los: 1, cut: 1, label: 'Wall (low, cut away)' },
  'D': { door: 1, cut: 0, label: 'Door' },
  'd': { door: 1, cut: 1, label: 'Door (low)' },
  'k': { decor: 'desk', cover: 1, label: 'Desk / counter' },
  'h': { decor: 'shelf', cover: 1, label: 'Shelf' },
  'p': { decor: 'barrel-shelf', cover: 0, block: 0, label: 'Workshop rack' },
};
export const CONTAINER_HUES = ['green', 'rust', 'teal', 'blue', 'mustard', 'grey', 'red', 'white'];
export const VAN_HUES = ['white', 'grey'];
export const BOAT_HUES = ['tug', 'work', 'small'];

function blank(t = 'yard') {
  return { t, block: 0, cover: 0, face: -1, decor: '', los: 0, explosive: 0, hue: '' };
}
const rowsOf = (w, h, ch) => Array.from({ length: h }, () => ch.repeat(w));

export function blankMapJson(size = 'medium', name = 'New map') {
  const [w, h] = MAP_SIZES[size] || MAP_SIZES.medium;
  return {
    format: MAP_FORMAT, version: MAP_VERSION,
    id: 'map-' + Date.now().toString(36), name, w, h,
    ground: rowsOf(w, h, '.'), props: rowsOf(w, h, '.'), spawn: rowsOf(w, h, '.'),
    objects: [], notes: '',
  };
}

// Light structural check + upgrade of older versions. Throws on anything unusable.
export function normalizeMapJson(j) {
  if (typeof j === 'string') j = JSON.parse(j);
  if (!j || j.format !== MAP_FORMAT) throw new Error('Not a Fang City map (format must be "fang-city-map").');
  if (!(j.version >= 1)) throw new Error('Missing map version.');
  if (j.version > MAP_VERSION) throw new Error(`Map version ${j.version} is newer than this game understands (${MAP_VERSION}).`);
  const w = j.w | 0, h = j.h | 0;
  if (w < 8 || h < 8 || w > 40 || h > 40) throw new Error('Map size must be between 8 and 40 tiles a side.');
  const fix = (rows, ch, okSet) => Array.from({ length: h }, (_, y) => {
    const r = String((rows || [])[y] || '');
    let out = '';
    for (let x = 0; x < w; x++) { const c = r[x] || ch; out += okSet[c] !== undefined ? c : ch; }
    return out;
  });
  return {
    format: MAP_FORMAT, version: MAP_VERSION,
    id: String(j.id || 'map-' + Date.now().toString(36)), name: String(j.name || 'Untitled map').slice(0, 40), w, h,
    ground: fix(j.ground, '.', GROUND),
    props: fix(j.props, '.', PROPS),
    spawn: fix(j.spawn, '.', { '.': 1, P: 1, E: 1 }),
    objects: (Array.isArray(j.objects) ? j.objects : []).filter((o) => o && ['container', 'van', 'boat'].includes(o.k)).map((o) => ({
      k: o.k, x: o.x | 0, y: o.y | 0,
      ...(o.k === 'container' ? { len: Math.max(1, Math.min(6, o.len | 0 || 1)), stack: o.stack >= 2 ? 2 : 1 } : {}),
      ...(o.k !== 'boat' ? { dir: o.dir === 'S' ? 'S' : 'E' } : {}),
      hue: String(o.hue || ''),
    })),
    ...(j.seats ? { seats: j.seats } : {}),
    notes: String(j.notes || ''),
    ...(j.flavour ? { flavour: j.flavour } : {}),
  };
}

// Tiles an object covers, in order.
export function objectTiles(o) {
  const n = o.k === 'container' ? o.len : o.k === 'van' ? 2 : 1;
  const out = [];
  for (let i = 0; i < n; i++) out.push(o.dir === 'S' ? [o.x, o.y + i] : [o.x + i, o.y]);
  return out;
}

const near = (rows, x, y, chars, r = 3) => {
  // nearest ground char from `chars` within r (Chebyshev rings)
  for (let d = 0; d <= r; d++) for (let yy = y - d; yy <= y + d; yy++) for (let xx = x - d; xx <= x + d; xx++) {
    if (Math.max(Math.abs(xx - x), Math.abs(yy - y)) !== d) continue;
    const c = rows[yy] && rows[yy][xx];
    if (c && chars.includes(c)) return c;
  }
  return null;
};

// JSON -> battle map (the same tile records the tactics core has always used).
export function mapFromJson(input) {
  const j = normalizeMapJson(input);
  const { w, h } = j;
  const tiles = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) {
      const g = GROUND[j.ground[y][x]] || GROUND['.'];
      const t = blank(g.t);
      if (g.block) t.block = 1;
      if (g.hue) t.hue = g.hue;
      row.push(t);
    }
    tiles.push(row);
  }
  const roomHue = (x, y) => { const c = near(j.ground, x, y, 'or'); return c === 'r' ? 'cafe' : 'office'; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = PROPS[j.props[y][x]];
    if (!p) continue;
    const t = tiles[y][x];
    if (p.door) {
      Object.assign(t, { t: 'door', block: 0, decor: 'door', cover: 0, hue: roomHue(x, y), cut: p.cut });
      continue;
    }
    t.decor = p.decor; t.cover = p.cover; t.block = p.block == null ? 1 : p.block;
    t.face = -1; t.los = p.los || 0; t.explosive = p.explosive || 0;
    t.hue = (p.decor === 'wall' || p.decor === 'desk' || p.decor === 'shelf') ? roomHue(x, y) : (t.t === 'interior' ? t.hue : '');
    t.stack = 0; t.cut = p.cut || 0;
  }
  let runId = 0;
  for (const o of j.objects) {
    const cells = objectTiles(o).filter(([x, y]) => x >= 0 && y >= 0 && x < w && y < h);
    if (!cells.length) continue;
    if (o.k === 'container') {
      const id = runId++;
      cells.forEach(([x, y], i) => {
        Object.assign(tiles[y][x], { decor: 'container', cover: 2, block: 1, face: -1, los: 1, explosive: 0, hue: o.hue || CONTAINER_HUES[id % CONTAINER_HUES.length], stack: o.stack, cut: 0 });
        tiles[y][x].run = { id, i, n: cells.length };
        if (o.dir === 'S') tiles[y][x].dir = 'S';
      });
    } else if (o.k === 'van') {
      if (cells.length < 2) continue;
      const [[x0, y0], [x1, y1]] = cells;
      const base = { cover: 2, block: 1, face: -1, los: 0, explosive: 1, hue: o.hue || 'white', stack: 0, cut: 0 };
      Object.assign(tiles[y0][x0], base, { decor: 'van', partner: { x: x1, y: y1 } });
      Object.assign(tiles[y1][x1], base, { decor: 'van2', partner: { x: x0, y: y0 } });
      if (o.dir === 'S') { tiles[y0][x0].dir = 'S'; tiles[y1][x1].dir = 'S'; }
    } else if (o.k === 'boat') {
      const [x, y] = cells[0];
      Object.assign(tiles[y][x], { t: 'water', decor: 'boat', cover: 0, block: 1, face: -1, los: 0, explosive: 0, hue: o.hue || 'tug', stack: 0, cut: 0 });
    }
  }
  const zone = { player: [], enemy: [] };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = j.spawn[y][x];
    if (c === 'P') zone.player.push({ x, y }); else if (c === 'E') zone.enemy.push({ x, y });
  }
  const m = { w, h, tiles };
  if (j.seats && j.seats.player && j.seats.enemy) {
    m.start = { player: j.seats.player.map(([x, y]) => ({ x, y })), enemy: j.seats.enemy.map(([x, y]) => ({ x, y })) };
  } else {
    m.start = zone; m.startZone = 1; // more tiles than fighters: spread picks by seed
  }
  m.zone = zone;
  m.id = j.id; m.name = j.name;
  m.flavour = j.flavour || 'custom';
  m.source = j;
  return m;
}

// Battle map -> JSON (used to convert the hand-built yard, and by tests for round trips).
export function mapToJson(m, meta = {}) {
  const gch = (t) => {
    if (t.decor === 'boat') return '~';
    if (t.t === 'door') return t.hue === 'cafe' ? 'r' : 'o';
    for (const [k, g] of Object.entries(GROUND)) if (g.t === t.t && (!g.hue || g.hue === t.hue)) return k;
    return '.';
  };
  const ground = [], props = [], spawn = [];
  const objects = [];
  const runs = new Map();
  for (let y = 0; y < m.h; y++) {
    let gr = '', pr = '', sp = '';
    for (let x = 0; x < m.w; x++) {
      const t = m.tiles[y][x];
      gr += gch(t);
      let pc = '.';
      if (t.t === 'door') pc = t.cut ? 'd' : 'D';
      else if (t.decor === 'wall') pc = t.cut ? 'w' : 'W';
      else if (t.decor === 'container') {
        const r = t.run || { id: `${x},${y}`, i: 0, n: 1 };
        if (!runs.has(r.id)) { const o = { k: 'container', x, y, len: r.n, dir: t.dir === 'S' ? 'S' : 'E', stack: t.stack >= 2 ? 2 : 1, hue: t.hue }; runs.set(r.id, o); }
      } else if (t.decor === 'van' || t.decor === 'wreck' || t.decor === 'car') objects.push({ k: 'van', x, y, dir: t.dir === 'S' ? 'S' : 'E', hue: t.hue });
      else if (t.decor === 'boat') objects.push({ k: 'boat', x, y, hue: t.hue });
      else if (t.decor && t.decor !== 'van2' && t.decor !== 'wreck2' && t.decor !== 'car2') {
        const k = Object.keys(PROPS).find((c) => PROPS[c] && PROPS[c].decor === t.decor);
        if (k) pc = k;
      }
      pr += pc;
      const inZone = (side) => ((m.zone || m.start || {})[side] || []).some((p) => p.x === x && p.y === y);
      sp += inZone('player') ? 'P' : inZone('enemy') ? 'E' : '.';
    }
    ground.push(gr); props.push(pr); spawn.push(sp);
  }
  const cont = [...runs.entries()].sort((a, b) => (typeof a[0] === 'number' && typeof b[0] === 'number' ? a[0] - b[0] : 0)).map((e) => e[1]);
  const j = {
    format: MAP_FORMAT, version: MAP_VERSION,
    id: meta.id || m.id || 'map', name: meta.name || m.name || 'Map', w: m.w, h: m.h,
    ground, props, spawn, objects: [...cont, ...objects], notes: meta.notes || '',
  };
  if (meta.flavour) j.flavour = meta.flavour;
  if (meta.seats && m.start) j.seats = { player: m.start.player.map((p) => [p.x, p.y]), enemy: m.start.enemy.map((p) => [p.x, p.y]) };
  return j;
}

// ---------- validation ----------
const passable = (t) => t && !t.block && t.t !== 'water';
export function validateMap(input) {
  const errors = [], warnings = [];
  let m;
  try { m = input && input.tiles ? input : mapFromJson(input); } catch (e) { return { ok: false, errors: [e.message], warnings, stats: {} }; }
  const zone = m.zone || m.start || { player: [], enemy: [] };
  const P = zone.player || [], E = zone.enemy || [];
  const at = (x, y) => (x >= 0 && y >= 0 && x < m.w && y < m.h ? m.tiles[y][x] : null);
  if (P.length < MIN_SPAWNS) errors.push(`Player spawn zone needs at least ${MIN_SPAWNS} tiles (has ${P.length}).`);
  if (E.length < MIN_SPAWNS) errors.push(`Enemy spawn zone needs at least ${MIN_SPAWNS} tiles (has ${E.length}).`);
  const badSpawn = [...P, ...E].filter((p) => !passable(at(p.x, p.y)));
  if (badSpawn.length) errors.push(`${badSpawn.length} spawn tile(s) sit on water or a solid prop (first at ${badSpawn[0].x},${badSpawn[0].y}).`);
  // flood from the player zone
  const seen = new Uint8Array(m.w * m.h);
  const q = [];
  for (const p of P) if (passable(at(p.x, p.y)) && !seen[p.y * m.w + p.x]) { seen[p.y * m.w + p.x] = 1; q.push(p); }
  while (q.length) {
    const { x, y } = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!passable(at(nx, ny)) || seen[ny * m.w + nx]) continue;
      seen[ny * m.w + nx] = 1; q.push({ x: nx, y: ny });
    }
  }
  const unreachedE = E.filter((p) => passable(at(p.x, p.y)) && !seen[p.y * m.w + p.x]);
  if (P.length && E.length && unreachedE.length) errors.push(`The two spawn zones are not connected: ${unreachedE.length} enemy spawn tile(s) can't be reached from the player side.`);
  const sealed = [];
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (passable(at(x, y)) && !seen[y * m.w + x]) sealed.push({ x, y });
  if (P.length && sealed.length) warnings.push(`${sealed.length} walkable tile(s) are sealed off and can never be reached (e.g. ${sealed[0].x},${sealed[0].y}).`);
  // cover balance: split the map by which spawn zone each tile is closer to
  const cen = (L) => L.length ? { x: L.reduce((s, p) => s + p.x, 0) / L.length, y: L.reduce((s, p) => s + p.y, 0) / L.length } : null;
  const cp = cen(P), ce = cen(E);
  let coverP = 0, coverE = 0, coverTiles = 0;
  if (cp && ce) {
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      const t = at(x, y);
      if (!t.cover) continue;
      coverTiles++;
      const dp = Math.hypot(x - cp.x, y - cp.y), de = Math.hypot(x - ce.x, y - ce.y);
      if (Math.abs(dp - de) < 0.5) { coverP += t.cover / 2; coverE += t.cover / 2; } else if (dp < de) coverP += t.cover; else coverE += t.cover;
    }
    const lo = Math.min(coverP, coverE), hi = Math.max(coverP, coverE);
    if (coverTiles < 6) warnings.push('Very little cover on the map; fights will be short and brutal.');
    else if (hi > 0 && lo / hi < 0.6) warnings.push(`Cover is lopsided: ${coverP >= coverE ? 'player' : 'enemy'} half has ${Math.round(hi)} cover points vs ${Math.round(lo)}.`);
    let minD = 99;
    for (const a of P) for (const b of E) minD = Math.min(minD, Math.abs(a.x - b.x) + Math.abs(a.y - b.y));
    if (minD < 6) warnings.push(`Spawn zones are only ${minD} tiles apart; units could be shot on turn one.`);
  }
  return { ok: !errors.length, errors, warnings, stats: { coverP, coverE, sealed: sealed.length, sealedTiles: sealed, unreached: unreachedE.length } };
}

// Readable JSON: one row string per line, one object per line.
export function stringifyMap(j) {
  const lines = ['{'];
  const keys = Object.keys(j);
  keys.forEach((k, i) => {
    const v = j[k], end = i === keys.length - 1 ? '' : ',';
    if (Array.isArray(v) && (k === 'ground' || k === 'props' || k === 'spawn' || k === 'objects')) {
      lines.push(`  ${JSON.stringify(k)}: [`);
      v.forEach((r, n) => lines.push(`    ${JSON.stringify(r)}${n === v.length - 1 ? '' : ','}`));
      lines.push(`  ]${end}`);
    } else lines.push(`  ${JSON.stringify(k)}: ${JSON.stringify(v)}${end}`);
  });
  lines.push('}');
  return lines.join('\n');
}
