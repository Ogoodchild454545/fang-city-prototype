// Fang City asset catalogue: every placeable prop and ground tile is defined once here.
// Battle rules (cover, movement, line of sight, explosions), the map loader and the editor
// palette all read these records. Art lives in js/ui (yard.js for the original Docklands set,
// props.js for location packs) and is looked up by `art` (defaults to the id).
//
// Prop fields
//   id, name, cat, themes[]   identity + palette grouping ('all' = shown in every location)
//   size 1|2                  footprint in tiles (2 = two tiles along its direction)
//   h                         drawn height in world px (wolf = 27, single container = 38)
//   rot                       can face E (along x) or S (along y)
//   cover 0|1|2               none / half / full
//   block 0|1                 blocks movement (default 1)
//   los 0|1                   blocks line of sight
//   explosive, blast, dmg     shootable explosive: blast radius in tiles and damage
//   wreck                     id it turns into after exploding (keeps cover/block)
//   cut                       tall solid prop that drops to a stub when a unit is behind it
//   water 'land'|'water'|'any' where it may stand (default land)
//   variants[]                colour / style options (stored as `hue`)
//   ch, chLow                 legacy single-character code in the v1 props layer
//   light                     light pool it casts: { kind, col? }
//   hidden                    runtime-only (wrecks), never in the palette

export const THEMES = {
  docklands: {
    name: 'Docklands', gang: 'Neutral ground', blurb: 'Container yard on a canal quay: cranes, forklifts, fish market.',
    ground: '.', yard: [64, 62, 58], out: [44, 44, 46], sky: ['#0c0b12', '#2a1a24', '#4a2a26', '#0e0f12'],
    perimeter: 'chain', backdrop: 'docks', env: { time: 'dusk', weather: 'clear' },
  },
  velvet: {
    name: 'Velvet Den downtown', gang: 'Velvet Den', blurb: 'Nightlife strip: neon shopfronts, clubs, parked cars and alleys.',
    ground: 'a', yard: [50, 49, 54], out: [34, 32, 38], sky: ['#0a0816', '#2a1438', '#4a1c44', '#0c0a12'],
    perimeter: 'none', backdrop: 'skyline', env: { time: 'night', weather: 'rain' },
  },
  bayou: {
    name: 'Swamp Syndicate bayou', gang: 'Swamp Syndicate', blurb: 'Stilt shacks on boardwalks over black water, mud, reeds and a gator farm.',
    ground: 'm', yard: [56, 50, 38], out: [30, 32, 26], sky: ['#070b0a', '#14221c', '#2e3424', '#0a0c0a'],
    perimeter: 'none', backdrop: 'trees', env: { time: 'night', weather: 'fog' },
  },
  ironclaw: {
    name: 'Iron Claw industrial', gang: 'Iron Claw', blurb: 'Foundry floor and rail sidings: presses, pipes, scrap, wagons, catwalks.',
    ground: 'f', yard: [60, 58, 54], out: [40, 38, 36], sky: ['#0c0a0a', '#2c1a12', '#5a3218', '#100c0a'],
    perimeter: 'chain', backdrop: 'chimneys', env: { time: 'dusk', weather: 'clear' },
  },
  estate: {
    name: 'Grey Pack estate', gang: 'Grey Pack', blurb: 'Back streets of terraced houses, garages, garden fences, a corner shop and a park.',
    ground: 'p', yard: [62, 62, 64], out: [40, 41, 44], sky: ['#0a0c12', '#1c2232', '#3a3a48', '#0c0d10'],
    perimeter: 'chain', backdrop: 'rooftops', env: { time: 'night', weather: 'clear' },
  },
};
export const THEME_IDS = Object.keys(THEMES);
export const ENV_TIMES = ['dusk', 'night'];
export const ENV_WEATHER = ['clear', 'rain', 'fog'];

// ---------- ground tiles (one character per tile in the `ground` layer) ----------
// t: terrain id on the battle tile; hue: interior style (also picked up by walls, doors, desks, shelves).
export const GROUND = {
  '.': { t: 'yard', label: 'Concrete', themes: ['all'], col: '#4a4844' },
  '~': { t: 'water', label: 'Water / canal', block: 1, themes: ['all'], col: '#163a48' },
  '=': { t: 'edge', label: 'Quay edge', themes: ['docklands', 'ironclaw'], col: '#6a675f' },
  's': { t: 'shed', label: 'Workshop canopy', themes: ['docklands', 'ironclaw'], col: '#3a3c3b' },
  'o': { t: 'interior', hue: 'office', label: 'Office floor', themes: ['docklands', 'ironclaw', 'estate'], col: '#5a636a' },
  'r': { t: 'interior', hue: 'cafe', label: 'Bar floor', themes: ['docklands', 'velvet', 'estate'], col: '#5a3f35' },
  'a': { t: 'asphalt', label: 'Asphalt road', themes: ['velvet', 'estate', 'ironclaw'], col: '#323236' },
  'p': { t: 'pavement', label: 'Pavement', themes: ['velvet', 'estate'], col: '#5c5c60' },
  'g': { t: 'grass', label: 'Grass', themes: ['estate', 'bayou'], col: '#34482c' },
  'm': { t: 'mud', label: 'Mud', themes: ['bayou'], col: '#4a3e2a' },
  'b': { t: 'boardwalk', label: 'Boardwalk', themes: ['bayou', 'docklands'], col: '#6a5238' },
  't': { t: 'rail', label: 'Rail track', themes: ['ironclaw', 'docklands'], col: '#3e3a36' },
  'c': { t: 'grate', label: 'Catwalk grating', themes: ['ironclaw'], col: '#3a4046' },
  'f': { t: 'factory', label: 'Factory floor', themes: ['ironclaw'], col: '#4a5048' },
  'e': { t: 'dirt', label: 'Gravel / dirt', themes: ['bayou', 'ironclaw', 'estate'], col: '#544a3e' },
  'k': { t: 'interior', hue: 'club', label: 'Club floor', themes: ['velvet'], col: '#2c2232' },
  'x': { t: 'interior', hue: 'shop', label: 'Shop tiles', themes: ['velvet', 'estate'], col: '#7a7a72' },
  'h': { t: 'interior', hue: 'house', label: 'House floor', themes: ['estate'], col: '#5a4434' },
  'w': { t: 'interior', hue: 'shack', label: 'Shack planks', themes: ['bayou'], col: '#4e3c2a' },
  'i': { t: 'interior', hue: 'works', label: 'Works floor', themes: ['ironclaw'], col: '#4a4e52' },
};
// interior ground char -> room style (walls, doors, desks and shelves take the nearest one)
export const ROOM_STYLES = {
  office: { ch: 'o', name: 'Office', wall: '#6a7c8a' },
  cafe: { ch: 'r', name: 'Bar', wall: '#7c3e2a' },
  club: { ch: 'k', name: 'Club', wall: '#3a2a44' },
  shop: { ch: 'x', name: 'Shop', wall: '#5a6a58' },
  house: { ch: 'h', name: 'House', wall: '#74402e' },
  shack: { ch: 'w', name: 'Shack', wall: '#5e4a34' },
  works: { ch: 'i', name: 'Works', wall: '#545a5e' },
};
export const INTERIOR_CHARS = Object.values(ROOM_STYLES).map((r) => r.ch).join('');
export const ROOM_BY_CH = Object.fromEntries(Object.entries(ROOM_STYLES).map(([k, r]) => [r.ch, k]));

export const CATS = {
  structure: 'Buildings & walls', cover: 'Cover', vehicle: 'Vehicles', hazard: 'Explosives',
  street: 'Street', nature: 'Nature', industry: 'Industry', furniture: 'Furniture', water: 'Water',
};

const P = (o) => ({ size: 1, rot: false, cover: 0, block: 1, los: 0, explosive: 0, blast: 0, dmg: 0, water: 'land', themes: ['all'], variants: [], ...o });

export const CATALOG = [
  // ---- original Docklands set (legacy layer codes kept for v1 maps) ----
  P({ id: 'container', name: 'Container', cat: 'structure', themes: ['docklands', 'ironclaw'], h: 38, cover: 2, los: 1, cut: 1, rot: true, ico: '📦', special: 'container', variants: ['green', 'rust', 'teal', 'blue', 'mustard', 'grey', 'red', 'white'] }),
  P({ id: 'van', name: 'Van', cat: 'vehicle', themes: ['docklands', 'velvet', 'ironclaw', 'estate'], size: 2, h: 18, cover: 2, explosive: 1, blast: 2, dmg: 5, rot: true, ico: '🚐', variants: ['white', 'grey'], legacyObj: 1 }),
  P({ id: 'boat', name: 'Moored boat', cat: 'water', themes: ['docklands', 'bayou'], h: 14, cover: 0, water: 'water', ico: '🚤', variants: ['tug', 'work', 'small'], legacyObj: 1 }),
  P({ id: 'crate', name: 'Crates', cat: 'cover', h: 16, cover: 1, ch: 'x', ico: '🟫' }),
  P({ id: 'barrel', name: 'Explosive barrel', cat: 'hazard', h: 12, cover: 1, explosive: 1, blast: 1, dmg: 4, wreck: 'barrelWreck', ch: 'b', ico: '🛢️' }),
  P({ id: 'burn', name: 'Burn barrel', cat: 'street', h: 12, cover: 1, ch: 'f', ico: '🔥', light: { kind: 'fire' } }),
  P({ id: 'barrier', name: 'Concrete barrier', cat: 'cover', h: 12, cover: 2, ch: 'B', ico: '🚧' }),
  P({ id: 'lamp', name: 'Lamp post', cat: 'street', h: 54, cover: 0, block: 0, ch: 'l', ico: '💡', light: { kind: 'lamp' } }),
  P({ id: 'fence', name: 'Chain-link fence', cat: 'structure', themes: ['docklands', 'ironclaw', 'estate', 'velvet'], h: 30, cover: 0, ch: 'n', ico: '⛓️' }),
  P({ id: 'wall', name: 'Wall', cat: 'structure', h: 40, cover: 2, los: 1, ch: 'W', chLow: 'w', ico: '🧱', special: 'wall' }),
  P({ id: 'door', name: 'Door', cat: 'structure', h: 40, cover: 0, block: 0, ch: 'D', chLow: 'd', ico: '🚪', special: 'door' }),
  P({ id: 'desk', name: 'Desk / counter', cat: 'furniture', h: 10, cover: 1, ch: 'k', ico: '🪑' }),
  P({ id: 'shelf', name: 'Shelf', cat: 'furniture', h: 22, cover: 1, ch: 'h', ico: '🗄️' }),
  P({ id: 'barrel-shelf', name: 'Workshop rack', cat: 'industry', themes: ['docklands', 'ironclaw'], h: 12, cover: 0, block: 0, ch: 'p', ico: '🧰' }),
  // ---- Docklands additions ----
  P({ id: 'crane_base', name: 'Crane leg', cat: 'structure', themes: ['docklands', 'ironclaw'], h: 48, cover: 2, los: 1, cut: 1, ico: '🏗️' }),
  P({ id: 'forklift', name: 'Forklift', cat: 'vehicle', themes: ['docklands', 'ironclaw'], h: 22, cover: 1, rot: true, ico: '🚜', variants: ['yellow', 'orange'] }),
  P({ id: 'warehouse', name: 'Warehouse front', cat: 'structure', themes: ['docklands', 'ironclaw'], size: 2, h: 44, cover: 2, los: 1, cut: 1, rot: true, ico: '🏭', variants: ['blue', 'rust', 'grey'] }),
  P({ id: 'fish_stall', name: 'Fish market stall', cat: 'street', themes: ['docklands', 'bayou'], h: 24, cover: 1, rot: true, ico: '🐟', variants: ['red', 'blue', 'green'] }),
  P({ id: 'ice_box', name: 'Fish boxes', cat: 'cover', themes: ['docklands', 'bayou'], h: 12, cover: 1, ico: '🧊' }),
  P({ id: 'bollard', name: 'Mooring bollard', cat: 'street', themes: ['docklands', 'velvet', 'estate'], h: 8, cover: 0, ico: '⚓' }),
  // ---- Velvet Den downtown ----
  P({ id: 'neon_shop', name: 'Neon shopfront', cat: 'structure', themes: ['velvet', 'estate'], size: 2, h: 42, cover: 2, los: 1, cut: 1, rot: true, ico: '🏪', variants: ['pink', 'cyan', 'amber'], light: { kind: 'neon' } }),
  P({ id: 'sedan', name: 'Parked car', cat: 'vehicle', themes: ['velvet', 'estate', 'ironclaw', 'docklands'], size: 2, h: 16, cover: 2, explosive: 1, blast: 2, dmg: 5, wreck: 'sedanWreck', rot: true, ico: '🚗', variants: ['red', 'black', 'taxi', 'blue'] }),
  P({ id: 'dumpster', name: 'Dumpster', cat: 'cover', themes: ['velvet', 'estate', 'ironclaw'], h: 18, cover: 1, rot: true, ico: '🗑️', variants: ['green', 'blue'] }),
  P({ id: 'bin', name: 'Wheelie bins', cat: 'street', themes: ['velvet', 'estate'], h: 15, cover: 1, ico: '🚮', variants: ['black', 'green', 'blue'] }),
  P({ id: 'booth', name: 'Club booth', cat: 'furniture', themes: ['velvet'], h: 12, cover: 1, rot: true, ico: '🛋️', variants: ['red', 'purple'] }),
  P({ id: 'speakers', name: 'Speaker stack', cat: 'furniture', themes: ['velvet'], h: 26, cover: 1, ico: '🔊' }),
  P({ id: 'neon_sign', name: 'Neon sign post', cat: 'street', themes: ['velvet'], h: 46, cover: 0, block: 0, ico: '✨', variants: ['pink', 'cyan', 'amber'], light: { kind: 'neon' } }),
  P({ id: 'phone_box', name: 'Phone box', cat: 'street', themes: ['velvet', 'estate'], h: 40, cover: 2, ico: '📞' }),
  P({ id: 'planter', name: 'Planter', cat: 'cover', themes: ['velvet', 'estate'], h: 12, cover: 1, ico: '🪴' }),
  P({ id: 'rope', name: 'Queue rope', cat: 'street', themes: ['velvet'], h: 14, cover: 0, rot: true, ico: '🎗️' }),
  // ---- Swamp Syndicate bayou ----
  P({ id: 'stilt_shack', name: 'Stilt shack', cat: 'structure', themes: ['bayou'], size: 2, h: 44, cover: 2, los: 1, cut: 1, rot: true, water: 'any', ico: '🛖', variants: ['tin', 'plank'] }),
  P({ id: 'rusty_boat', name: 'Beached boat', cat: 'vehicle', themes: ['bayou', 'docklands'], size: 2, h: 16, cover: 2, rot: true, ico: '🛶', variants: ['rust', 'green'] }),
  P({ id: 'gator_fence', link: 1, name: 'Gator-farm fence', cat: 'structure', themes: ['bayou'], h: 24, cover: 0, ico: '🐊' }),
  P({ id: 'reeds', name: 'Reeds', cat: 'nature', themes: ['bayou'], h: 24, cover: 0, block: 0, ico: '🌾' }),
  P({ id: 'stump', name: 'Cypress stump', cat: 'nature', themes: ['bayou'], h: 16, cover: 1, ico: '🪵' }),
  P({ id: 'still', name: 'Moonshine still', cat: 'hazard', themes: ['bayou'], h: 24, cover: 1, explosive: 1, blast: 1, dmg: 4, wreck: 'stillWreck', ico: '⚗️' }),
  P({ id: 'traps', name: 'Crab traps', cat: 'cover', themes: ['bayou', 'docklands'], h: 14, cover: 1, ico: '🦀' }),
  P({ id: 'tyres', name: 'Tyre pile', cat: 'cover', themes: ['bayou', 'ironclaw', 'estate'], h: 13, cover: 1, ico: '🛞' }),
  P({ id: 'lantern', name: 'Lantern post', cat: 'street', themes: ['bayou'], h: 36, cover: 0, block: 0, ico: '🏮', light: { kind: 'lantern' } }),
  // ---- Iron Claw industrial ----
  P({ id: 'press', name: 'Machine press', cat: 'industry', themes: ['ironclaw'], size: 2, h: 34, cover: 2, los: 1, cut: 1, rot: true, ico: '⚙️', variants: ['green', 'orange'] }),
  P({ id: 'pipes', name: 'Pipe run', cat: 'industry', themes: ['ironclaw'], h: 14, cover: 1, rot: true, ico: '🪈' }),
  P({ id: 'scrap', name: 'Scrap pile', cat: 'cover', themes: ['ironclaw', 'estate', 'bayou'], h: 18, cover: 1, ico: '🔩' }),
  P({ id: 'wagon', name: 'Rail wagon', cat: 'vehicle', themes: ['ironclaw', 'docklands'], size: 2, h: 34, cover: 2, los: 1, cut: 1, rot: true, ico: '🚃', variants: ['rust', 'black', 'blue'] }),
  P({ id: 'gas_tank', name: 'Gas tank', cat: 'hazard', themes: ['ironclaw', 'docklands'], h: 30, cover: 2, explosive: 1, blast: 2, dmg: 5, wreck: 'tankWreck', ico: '🧯' }),
  P({ id: 'beams', name: 'Steel beams', cat: 'cover', themes: ['ironclaw', 'docklands'], h: 12, cover: 1, rot: true, ico: '🏗' }),
  P({ id: 'conveyor', name: 'Conveyor', cat: 'industry', themes: ['ironclaw'], size: 2, h: 14, cover: 1, rot: true, ico: '🛤️' }),
  P({ id: 'workbench', name: 'Workbench', cat: 'furniture', themes: ['ironclaw', 'estate'], h: 13, cover: 1, rot: true, ico: '🛠️' }),
  // ---- Grey Pack estate ----
  P({ id: 'garage', name: 'Lock-up garage', cat: 'structure', themes: ['estate'], size: 2, h: 34, cover: 2, los: 1, cut: 1, rot: true, ico: '🏚️', variants: ['grey', 'green', 'blue'] }),
  P({ id: 'garden_fence', link: 1, name: 'Garden fence', cat: 'structure', themes: ['estate'], h: 18, cover: 1, ico: '🪧' }),
  P({ id: 'hedge', link: 1, name: 'Hedge', cat: 'nature', themes: ['estate'], h: 16, cover: 1, ico: '🌿' }),
  P({ id: 'tree', name: 'Tree', cat: 'nature', themes: ['estate', 'bayou'], h: 56, cover: 2, ico: '🌳' }),
  P({ id: 'bench', name: 'Park bench', cat: 'street', themes: ['estate', 'velvet'], h: 10, cover: 1, rot: true, ico: '🪑' }),
  P({ id: 'bus_shelter', name: 'Bus shelter', cat: 'street', themes: ['estate', 'velvet'], h: 30, cover: 1, rot: true, ico: '🚏' }),
  P({ id: 'postbox', name: 'Postbox', cat: 'street', themes: ['estate'], h: 16, cover: 0, ico: '📮' }),
  P({ id: 'skip', name: 'Builders skip', cat: 'cover', themes: ['estate', 'ironclaw'], h: 14, cover: 2, rot: true, ico: '🧱', variants: ['yellow', 'blue'] }),
  // ---- runtime wrecks (after explosions) ----
  P({ id: 'sedanWreck', name: 'Burnt-out car', cat: 'vehicle', size: 2, h: 13, cover: 2, rot: true, hidden: 1, art: 'sedan' }),
  P({ id: 'stillWreck', name: 'Wrecked still', cat: 'hazard', h: 12, cover: 1, hidden: 1, art: 'still' }),
  P({ id: 'tankWreck', name: 'Ruptured tank', cat: 'hazard', h: 22, cover: 2, hidden: 1, art: 'gas_tank' }),
];
export const PROP = Object.fromEntries(CATALOG.map((p) => [p.id, p]));
export const propDef = (id) => PROP[id] || null;
// Wreck ids map back to the drawing of the intact prop with a burnt look.
export const isWreckId = (id) => !!(PROP[id] && PROP[id].hidden);

// Props usable from the palette for a location (its own set first, then shared ones).
export function paletteFor(theme) {
  const own = [], shared = [];
  for (const p of CATALOG) {
    if (p.hidden) continue;
    if (p.themes.includes(theme)) own.push(p); else if (p.themes.includes('all')) shared.push(p);
  }
  return { own, shared };
}
export function groundFor(theme) {
  return Object.entries(GROUND).filter(([, g]) => g.themes.includes('all') || g.themes.includes(theme)).map(([ch]) => ch);
}
