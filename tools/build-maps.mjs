// Builds the ready-made location maps into js/core/maps/*.js and docs/maps/*.json.
// Run: node tools/build-maps.mjs   (Docklands container yard is hand-converted and not rebuilt here.)
import fs from 'node:fs';
import { MapKit } from './mapkit.mjs';
import { validateMap, stringifyMap, normalizeMapJson } from '../js/core/mapfmt.js';

const maps = [];
const add = (k) => { maps.push(k); return k; };
const sideSpawns = (k, rows = [5, 10]) => { k.spawn('P', 1, rows[0], 2, rows[1]); k.spawn('E', k.w - 3, k.h - 1 - rows[1], k.w - 2, k.h - 1 - rows[0]); };

// ---------------- Docklands: Fish Market Wharf ----------------
{
  const k = add(new MapKit({ id: 'fish_wharf', name: 'Fish Market Wharf', theme: 'docklands', env: { time: 'night', weather: 'rain' }, notes: 'Night market on the quay: stalls, ice boxes, forklifts and a crane base. Watch the gas tanks.' }));
  k.ground('~', 0, 0, 2, 15).ground('=', 3, 0, 3, 15);
  k.ground('a', 4, 7, 21, 8); // lorry lane
  k.obj('warehouse', 9, 0, { hue: 'blue' }).obj('warehouse', 13, 0, { hue: 'rust' });
  k.obj('boat', 1, 3, { hue: 'tug' }).obj('boat', 1, 11, { hue: 'work' });
  k.spawn('P', 4, 4, 5, 11); k.spawn('E', 19, 4, 20, 11);
  // market stalls in two rows
  for (const [x, y, h] of [[8, 3, 'red'], [10, 3, 'blue'], [13, 3, 'green'], [8, 12, 'green'], [11, 12, 'red'], [13, 12, 'blue']]) k.obj('fish_stall', x, y, { hue: h, dir: 'E' });
  k.props('x', [[7, 5], [15, 10], [12, 6]]);
  k.obj('ice_box', 9, 5).obj('ice_box', 13, 10).obj('ice_box', 16, 5).obj('ice_box', 6, 10);
  k.obj('crane_base', 11, 9).obj('crane_base', 16, 2);
  k.obj('forklift', 7, 9, { dir: 'E', hue: 'yellow' }).obj('forklift', 15, 6, { dir: 'S', hue: 'orange' });
  k.obj('container', 17, 12, { len: 2, dir: 'E', hue: 'teal' }).obj('container', 18, 1, { len: 1, dir: 'S', hue: 'red', stack: 2 });
  k.obj('container', 6, 1, { len: 2, dir: 'E', hue: 'mustard' });
  k.obj('gas_tank', 17, 9).obj('gas_tank', 6, 7);
  k.props('b', [[10, 7], [14, 14]]);
  k.obj('bollard', 4, 2).obj('bollard', 4, 13).obj('traps', 5, 14).obj('traps', 18, 14);
  k.props('l', [[4, 6], [12, 8], [20, 3], [20, 13]]);
  k.prop('B', 18, 7);
}

// ---------------- Velvet Den: Neon Strip ----------------
{
  const k = add(new MapKit({ id: 'neon_strip', name: 'Neon Strip', theme: 'velvet', notes: 'A wet night street: shopfronts both sides, parked cars that go up when shot.' }));
  k.ground('p', 0, 0, 21, 4).ground('p', 0, 11, 21, 15).ground('a', 0, 5, 21, 10);
  k.ground('p', 9, 5, 12, 10); // central crossing
  sideSpawns(k, [5, 10]);
  k.sym('neon_shop', 4, 0, { hue: 'pink', hue2: 'cyan' });
  k.sym('neon_shop', 9, 0, { hue: 'amber', hue2: 'pink' });
  k.sym('neon_shop', 15, 0, { hue: 'cyan', hue2: 'amber' });
  k.sym('sedan', 5, 4, { dir: 'E', hue: 'red', hue2: 'taxi' });
  k.sym('sedan', 15, 5, { dir: 'E', hue: 'black', hue2: 'blue' });
  k.sym('dumpster', 1, 1, { dir: 'E', hue: 'green' });
  k.sym('bin', 8, 3).sym('bin', 14, 2);
  k.sym('phone_box', 12, 3);
  k.sym('planter', 7, 7).sym('planter', 10, 9);
  k.sym('bollard', 9, 5);
  k.sym('bus_shelter', 18, 3, { dir: 'E' });
  k.sym('neon_sign', 3, 2, { hue: 'pink', hue2: 'cyan' });
  k.symProp('x', [[4, 8]]); k.symProp('B', [[13, 7]]); k.symProp('l', [[2, 4], [11, 4]]);
  k.prop('b', 18, 9); k.prop('b', 3, 6);
}

// ---------------- Velvet Den: Club Velvet ----------------
{
  const k = add(new MapKit({ id: 'club_velvet', name: 'Club Velvet', theme: 'velvet', env: { weather: 'clear' }, notes: 'Fight through the club: booths, speaker stacks and the bar. Two doors each side.' }));
  k.ground('a', 0, 0, 21, 15).ground('p', 0, 0, 21, 2).ground('p', 0, 13, 21, 15);
  sideSpawns(k, [5, 10]);
  k.room('club', 5, 3, 16, 12, { doors: [[5, 6], [5, 9], [16, 6], [16, 9], [10, 12], [11, 3]] });
  // bar along the top, booths around a dance floor
  k.props('k', [[8, 5], [9, 5], [12, 10], [13, 10]]);
  k.sym('booth', 7, 8, { dir: 'E', hue: 'red', hue2: 'purple' });
  k.sym('booth', 9, 10, { dir: 'E', hue: 'purple', hue2: 'red' });
  k.sym('speakers', 6, 4).sym('speakers', 10, 7);
  k.sym('rope', 10, 13, { dir: 'E' });
  k.sym('sedan', 1, 1, { dir: 'E', hue: 'black', hue2: 'red' });
  k.sym('dumpster', 3, 4, { dir: 'S', hue: 'blue' });
  k.sym('bin', 2, 13).sym('bin', 3, 11);
  k.sym('neon_sign', 13, 2, { hue: 'pink', hue2: 'cyan' });
  k.symProp('b', [[17, 2]]); k.symProp('x', [[3, 7]]); k.symProp('l', [[8, 1]]);
}

// ---------------- Swamp Syndicate: Gator Farm ----------------
{
  const k = add(new MapKit({ id: 'gator_farm', name: 'Gator Farm', theme: 'bayou', notes: 'Boardwalks over black water, a fenced gator pen and moonshine stills (they burn).' }));
  // channels of water with boardwalk crossings
  k.ground('~', 0, 0, 21, 1).ground('~', 0, 14, 21, 15);
  k.ground('~', 6, 2, 7, 13).ground('~', 14, 2, 15, 13);
  k.ground('b', 6, 4, 7, 4).ground('b', 6, 11, 7, 11).ground('b', 14, 4, 15, 4).ground('b', 14, 11, 15, 11);
  k.ground('b', 6, 7, 7, 8).ground('b', 14, 7, 15, 8);
  k.ground('b', 0, 2, 21, 2).ground('b', 0, 13, 21, 13);
  k.ground('e', 9, 5, 12, 10);
  sideSpawns(k, [5, 10]);
  // gator pen in the middle
  const pen = []; for (let x = 9; x <= 12; x++) { pen.push([x, 5], [x, 10]); }
  for (let y = 6; y <= 9; y++) { if (y === 7 || y === 8) continue; pen.push([9, y], [12, y]); }
  for (const [x, y] of pen) if (!((x === 10 || x === 11) && (y === 5 || y === 10))) k.obj('gator_fence', x, y);
  k.sym('stilt_shack', 6, 0, { dir: 'E', hue: 'tin', hue2: 'plank' });
  k.sym('stilt_shack', 2, 14, { dir: 'E', hue: 'plank', hue2: 'tin' });
  k.ground('m', 9, 1, 12, 1).ground('m', 9, 14, 12, 14);
  k.sym('rusty_boat', 10, 1, { dir: 'E', hue: 'rust', hue2: 'green' });
  k.sym('still', 4, 4).sym('still', 11, 3);
  k.sym('stump', 3, 8).sym('stump', 9, 12);
  k.sym('tyres', 4, 11).sym('traps', 8, 6).sym('traps', 12, 4);
  k.sym('tree', 1, 3).sym('tree', 5, 12);
  k.sym('reeds', 8, 3).sym('reeds', 8, 9).sym('reeds', 5, 6);
  k.sym('lantern', 7, 2).sym('lantern', 10, 7);
  k.symProp('x', [[4, 9]]); k.symProp('b', [[3, 6]]);
}

// ---------------- Iron Claw: Foundry Floor ----------------
{
  const k = add(new MapKit({ id: 'foundry', name: 'Foundry Floor', theme: 'ironclaw', notes: 'Inside the works: presses, conveyors, pipe runs and gas tanks. Catwalk grates are flat walkways.' }));
  k.ground('f', 0, 0, 21, 15);
  k.ground('c', 0, 7, 21, 8).ground('c', 10, 0, 11, 15);
  sideSpawns(k, [5, 10]);
  k.room('works', 0, 0, 5, 3, { doors: [[3, 3]] });
  k.room('works', 16, 12, 21, 15, { doors: [[18, 12]] });
  k.props('k', [[2, 1]]); k.props('h', [[4, 1]]); k.props('k', [[19, 14]]); k.props('h', [[17, 13]]);
  k.sym('press', 6, 2, { dir: 'E', hue: 'green', hue2: 'orange' });
  k.sym('press', 13, 4, { dir: 'S', hue: 'orange', hue2: 'green' });
  k.sym('conveyor', 4, 11, { dir: 'E' });
  k.sym('pipes', 8, 5, { dir: 'S' }).sym('pipes', 8, 6, { dir: 'S' });
  k.sym('gas_tank', 12, 2).sym('scrap', 6, 9).sym('beams', 4, 6, { dir: 'S' });
  k.sym('workbench', 13, 11, { dir: 'E' }).sym('skip', 17, 3, { dir: 'E', hue: 'yellow' });
  k.sym('forklift', 15, 7, { dir: 'E', hue: 'orange' });
  k.symProp('b', [[9, 12], [3, 9]]); k.symProp('x', [[7, 8]]); k.symProp('l', [[9, 1]]);
}

// ---------------- Iron Claw: Rail Sidings ----------------
{
  const k = add(new MapKit({ id: 'rail_sidings', name: 'Rail Sidings', theme: 'ironclaw', env: { time: 'dusk', weather: 'clear' }, notes: 'Three tracks of parked wagons with gaps to slip through, scrap heaps and a signal shed.' }));
  k.ground('e', 0, 0, 21, 15);
  k.ground('t', 0, 3, 21, 3).ground('t', 0, 7, 21, 8).ground('t', 0, 12, 21, 12);
  sideSpawns(k, [4, 11]);
  k.sym('wagon', 5, 3, { dir: 'E', hue: 'rust', hue2: 'blue' }).sym('wagon', 9, 3, { dir: 'E', hue: 'black' });
  k.sym('wagon', 14, 3, { dir: 'E', hue: 'blue', hue2: 'rust' });
  k.sym('wagon', 7, 7, { dir: 'E', hue: 'black', hue2: 'rust' });
  k.sym('scrap', 4, 5).sym('scrap', 12, 5).sym('tyres', 8, 10).sym('tyres', 17, 1);
  k.sym('container', 2, 13, { len: 2, dir: 'E', hue: 'rust' });
  k.sym('gas_tank', 11, 10).sym('beams', 6, 1, { dir: 'E' }).sym('crane_base', 15, 10);
  k.room('works', 9, 13, 13, 15, { doors: [[13, 14]] });
  k.props('k', [[10, 14]]);
  k.symProp('b', [[3, 9]]); k.symProp('x', [[14, 6]]); k.symProp('l', [[1, 2]]);
}

// ---------------- Grey Pack: Back Streets ----------------
{
  const k = add(new MapKit({ id: 'back_streets', name: 'Back Streets', theme: 'estate', notes: 'Terraced houses with cut-away rooms, back gardens, a garage row and a back alley.' }));
  k.ground('a', 0, 7, 21, 8);
  k.ground('g', 0, 4, 21, 6).ground('g', 0, 9, 21, 11);
  sideSpawns(k, [6, 9]);
  // terraces north (doors to gardens) and south
  k.room('house', 4, 0, 8, 3, { doors: [[6, 3]] });
  k.room('house', 8, 0, 12, 3, { doors: [[10, 3]] });
  k.room('house', 9, 12, 13, 15, { doors: [[11, 12]] });
  k.room('house', 13, 12, 17, 15, { doors: [[15, 12]] });
  k.props('k', [[5, 1], [9, 2], [12, 14], [16, 13]]); k.props('h', [[7, 1], [11, 1], [10, 14], [14, 13]]);
  k.sym('garage', 14, 1, { dir: 'E', hue: 'grey', hue2: 'green' }).sym('garage', 17, 1, { dir: 'E', hue: 'blue', hue2: 'grey' });
  const gf = [[4, 5], [5, 5], [7, 5], [8, 5], [9, 5], [11, 5], [12, 5]];
  for (const [x, y] of gf) { k.obj('garden_fence', x, y); const [a, b] = k.mx(x, y, 'garden_fence'); k.obj('garden_fence', a, b); }
  k.sym('hedge', 1, 4).sym('hedge', 2, 4);
  k.sym('sedan', 15, 8, { dir: 'E', hue: 'blue', hue2: 'red' });
  k.sym('bin', 6, 6).sym('bin', 10, 6).sym('skip', 3, 1, { dir: 'S', hue: 'yellow', hue2: 'blue' });
  k.sym('tree', 13, 5).sym('bench', 16, 6, { dir: 'E' });
  k.symProp('l', [[3, 7]]); k.symProp('x', [[9, 9]]); k.symProp('b', [[12, 8]]);
}

// ---------------- Grey Pack: Corner Shop & Park ----------------
{
  const k = add(new MapKit({ id: 'corner_shop', name: 'Corner Shop & Park', theme: 'estate', env: { time: 'night', weather: 'clear' }, notes: 'A corner shop and houses face a little park across the road. Bus stop, postbox, parked cars.' }));
  k.ground('a', 0, 6, 21, 8).ground('p', 0, 5, 21, 5).ground('p', 0, 9, 21, 9);
  k.ground('g', 0, 10, 21, 15);
  k.ground('p', 9, 10, 12, 15); // park path
  k.spawn('P', 1, 6, 3, 9); k.spawn('E', 18, 6, 20, 9);
  k.room('shop', 3, 0, 9, 4, { doors: [[6, 4]] });
  k.props('h', [[4, 1], [5, 1], [7, 1]]); k.props('k', [[8, 3]]);
  k.room('house', 10, 0, 14, 4, { doors: [[12, 4]] });
  k.props('k', [[11, 2]]); k.props('h', [[13, 1]]);
  k.obj('garage', 16, 1, { dir: 'E', hue: 'green' }).obj('garage', 18, 1, { dir: 'E', hue: 'grey' });
  k.obj('bin', 1, 2).obj('bin', 2, 2).obj('postbox', 2, 5).obj('phone_box', 15, 5);
  k.obj('bus_shelter', 9, 9, { dir: 'E' });
  k.obj('sedan', 5, 6, { dir: 'E', hue: 'red' }).obj('sedan', 14, 8, { dir: 'E', hue: 'taxi' });
  k.obj('van', 10, 6, { dir: 'E', hue: 'white' });
  k.obj('tree', 3, 12).obj('tree', 7, 14).obj('tree', 15, 11).obj('tree', 18, 14).obj('tree', 13, 13);
  for (const x of [1, 2, 3, 4, 5, 6]) k.obj('hedge', x, 10);
  for (const x of [15, 16, 17, 18, 19, 20]) k.obj('hedge', x, 10);
  k.obj('bench', 8, 12, { dir: 'S' }).obj('bench', 11, 12, { dir: 'S' }).obj('bench', 5, 13, { dir: 'E' });
  k.obj('skip', 19, 4, { dir: 'E', hue: 'blue' }).obj('planter', 17, 12).obj('planter', 2, 13);
  k.props('b', [[17, 4], [8, 10]]); k.props('x', [[13, 5], [4, 9]]); k.props('l', [[1, 5], [11, 9], [19, 9]]);
  k.prop('B', 16, 7); k.prop('B', 7, 7);
}

// ---------------- write ----------------
const ok = [];
let bad = 0;
for (const k of maps) {
  const pr = k.problems();
  if (pr.length) { bad++; console.log(`✗ ${k.id} layout:`, pr); }
  const j = normalizeMapJson(k.json());
  const v = validateMap(j);
  if (v.errors.length) { bad++; console.log(`✗ ${k.id}:`, v.errors); }
  if (v.warnings.length) console.log(`! ${k.id}:`, v.warnings);
  const txt = stringifyMap(j);
  const C = k.id.toUpperCase();
  fs.writeFileSync(`js/core/maps/${k.id}.js`, `// Built-in map "${k.name}" (${k.theme}). Generated by tools/build-maps.mjs — edit there, not here.\nexport const ${C} = ${txt};\n`);
  fs.writeFileSync(`docs/maps/${k.id}.json`, txt + '\n');
  ok.push(k);
}
console.log(`${ok.length} maps written, ${bad} with errors`);
if (bad) process.exitCode = 1;
