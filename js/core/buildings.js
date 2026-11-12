// Base-building catalogue. Pure data + small pure helpers, shared by client and a future server.
// Names, art and numbers are original to Fang City.

export const MAP_N = 40;           // base map is MAP_N x MAP_N tiles
export const MAX_DEN = 6;

// counts[i] = how many of this building you may own at Den level i (index 0 unused)
export const BUILDINGS = {
  den:      { name: 'The Den', cat: 'core', size: 3, res: 'cash', maxLv: 6, unlock: 1, counts: [0, 1, 1, 1, 1, 1, 1],
              costs: [0, 0, 1000, 6000, 30000, 140000, 700000], times: [0, 0, 60, 300, 1200, 3600, 10800],
              store: { cash: [0, 1500, 5000, 15000, 50000, 150000, 450000], influence: [0, 200, 500, 1200, 3000, 8000, 20000],
                       ammo: [0, 40, 70, 110, 160, 220, 300], medkits: [0, 4, 6, 8, 12, 16, 20], parts: [0, 4, 8, 12, 16, 22, 30] },
              housing: [0, 10, 12, 15, 20, 25, 30],
              desc: 'Your headquarters. Its level decides which buildings you can put up, how many, and how far they can be upgraded. Holds some cash and Rep.' },
  // ---- money makers (cash)
  stall:    { name: 'Knock-off Stall', cat: 'money', size: 2, res: 'cash', cost0: 60, g: 2.0, t0: 5, maxLv: 10, unlock: 1, counts: [0, 1, 2, 2, 3, 3, 4],
              produce: { res: 'cash', rate: 0.6, till: 1200 }, desc: 'Fake watches and handbags. Small, steady cash.' },
  carwash:  { name: 'Hand Car Wash', cat: 'money', size: 3, res: 'cash', cost0: 250, g: 2.0, t0: 15, maxLv: 10, unlock: 1, counts: [0, 1, 1, 2, 2, 2, 3],
              produce: { res: 'cash', rate: 1.6, till: 1200 }, desc: 'Cash only, no questions, no receipts.' },
  phone:    { name: 'Phone Unlock Shop', cat: 'money', size: 2, res: 'cash', cost0: 1500, g: 2.0, t0: 60, maxLv: 10, unlock: 2, counts: [0, 0, 1, 1, 2, 2, 2],
              produce: { res: 'cash', rate: 5, till: 1500 }, desc: 'Unlocks, resets and "refurbished" handsets.' },
  pawn:     { name: 'Pawn & Cash', cat: 'money', size: 2, res: 'cash', cost0: 5000, g: 2.0, t0: 120, maxLv: 10, unlock: 3, req: 'rail', counts: [0, 0, 0, 1, 1, 2, 2],
              produce: { res: 'cash', rate: 14, till: 1800 }, desc: 'Gold in, cash out. Turns stolen goods into clean money.' },
  chop:     { name: 'Chop Shop', cat: 'money', size: 3, res: 'cash', cost0: 12000, g: 2.0, t0: 180, maxLv: 10, unlock: 3, req: 'rail', counts: [0, 0, 0, 1, 1, 1, 2],
              produce: { res: 'cash', rate: 30, till: 1800 }, desc: 'Cars come in whole and leave in pieces.' },
  club:     { name: 'Neon Nightclub', cat: 'money', size: 3, res: 'cash', cost0: 50000, g: 1.6, t0: 600, maxLv: 10, unlock: 4, req: 'neon', counts: [0, 0, 0, 0, 1, 1, 1],
              produce: { res: 'cash', rate: 80, till: 2400 }, desc: 'Late-night money and later-night deals.' },
  casino:   { name: 'Backroom Casino', cat: 'money', size: 3, res: 'cash', cost0: 180000, g: 1.7, t0: 900, maxLv: 10, unlock: 5, req: 'market', counts: [0, 0, 0, 0, 0, 1, 1],
              produce: { res: 'cash', rate: 200, till: 2400 }, desc: 'Behind the launderette. The house always wins.' },
  crypto:   { name: 'Crypto Laundromat', cat: 'money', size: 2, res: 'cash', cost0: 400000, g: 1.55, t0: 1200, maxLv: 10, unlock: 5, req: 'uptown', counts: [0, 0, 0, 0, 0, 1, 1],
              produce: { res: 'cash', rate: 420, till: 3000 }, desc: 'Dirty money in, clean coins out.' },
  docks:    { name: 'Container Yard', cat: 'money', size: 3, res: 'cash', cost0: 1500000, g: 1.32, t0: 1800, maxLv: 10, unlock: 6, req: 'docks', counts: [0, 0, 0, 0, 0, 0, 1],
              produce: { res: 'cash', rate: 1000, till: 3600 }, desc: 'Everything comes in through the docks.' },
  // ---- influence makers
  radio:    { name: 'Pirate Radio', cat: 'influence', size: 2, res: 'cash', cost0: 150, g: 2.0, t0: 10, maxLv: 10, unlock: 1, counts: [0, 1, 1, 2, 2, 3, 3],
              produce: { res: 'influence', rate: 0.08, till: 3600 }, desc: 'Spreads your name across the city. Makes Rep, used to upgrade troops and bosses.' },
  pit:      { name: 'Fight Pit', cat: 'influence', size: 3, res: 'cash', cost0: 8000, g: 2.0, t0: 300, maxLv: 10, unlock: 3, counts: [0, 0, 0, 1, 1, 1, 2],
              produce: { res: 'influence', rate: 0.25, till: 3600 }, desc: 'Bare-knuckle nights build a reputation fast.' },
  // ---- storage
  strongbox:{ name: 'Strongbox', cat: 'storage', size: 2, res: 'cash', cost0: 300, g: 2.0, t0: 10, maxLv: 10, unlock: 1, counts: [0, 1, 1, 3, 3, 4, 4],
              store: { cash: { base: 1500, g: 2.5 } }, desc: 'Armoured container for cash. Raiders go for these first.' },
  ledger:   { name: 'Ledger Office', cat: 'storage', size: 2, res: 'cash', cost0: 400, g: 2.0, t0: 15, maxLv: 10, unlock: 1, counts: [0, 1, 1, 1, 2, 2, 2],
              store: { influence: { base: 300, g: 2.0 } }, desc: 'Names, favours and debts. Stores Rep.' },
  // ---- crew
  gym:      { name: 'Training Yard', cat: 'crew', size: 2, res: 'influence', cost0: 60, g: 2.1, t0: 10, maxLv: 10, unlock: 1, counts: [0, 1, 1, 1, 2, 2, 2],
              desc: 'Trains troops in a queue. Its level unlocks new troop types (Wolf Bruiser at 2, Snake Medic at 3, Badger Tank at 4, Croc Heavy at 5, Bear Breacher at 7) and trains a little faster.' },
  bunk:     { name: 'Bunkhouse', cat: 'crew', size: 2, res: 'influence', cost0: 80, g: 2.1, t0: 15, maxLv: 10, unlock: 1, counts: [0, 1, 1, 2, 2, 3, 3],
              housing: { base: 6, per: 4 }, desc: 'Bunks for your troops. Every level houses 4 more space worth of crew.' },
  armoury:  { name: 'Armoury', cat: 'crew', size: 2, res: 'influence', cost0: 250, g: 2.1, t0: 60, maxLv: 10, unlock: 2, counts: [0, 0, 1, 1, 1, 1, 1],
              produce: { res: 'ammo', rate: 0.025, till: 1800 },
              store: { ammo: { base: 80, g: 1.7 } },
              desc: 'Makes ammo for street fights and stores a stockpile. Also upgrades troop types: max troop level is the Armoury level + 1.' },
  clinic:   { name: 'Clinic', cat: 'supplies', size: 2, res: 'cash', cost0: 180, g: 2.0, t0: 20, maxLv: 10, unlock: 1, counts: [0, 1, 1, 1, 2, 2, 2],
              produce: { res: 'medkits', rate: 0.0022, till: 3600 },
              store: { medkits: { base: 6, g: 1.55 } },
              desc: 'Turns out medkits for the operators. Used in street fights; once a kit is spent, it is gone.' },
  workshop: { name: 'Workshop', cat: 'supplies', size: 2, res: 'cash', cost0: 400, g: 2.05, t0: 45, maxLv: 10, unlock: 2, counts: [0, 0, 1, 1, 1, 1, 1],
              produce: { res: 'parts', rate: 0.004, till: 3600 },
              store: { parts: { base: 10, g: 1.65 } },
              desc: 'Makes parts you spend on operator gear — vests, grips, pouches and the rest.' },
  family:   { name: 'Family Club', cat: 'social', size: 3, res: 'cash', cost0: 20000, g: 2.0, t0: 600, maxLv: 1, unlock: 3, counts: [0, 0, 0, 1, 1, 1, 1],
              desc: 'Join or start a Family: shared chat, crew donations and Family wars. (Coming soon: online feature.)' },
  // ---- defence (only matter when your base is raided; act as turrets in raid battles)
  sniper:   { name: 'Sniper Nest', cat: 'defence', size: 2, res: 'cash', cost0: 1200, g: 2.0, t0: 60, maxLv: 10, unlock: 2, counts: [0, 0, 1, 1, 2, 2, 3],
              turret: { dmg: 8, dmgLv: 2, range: 6, hp: 40, hpLv: 12, aim: 60 }, desc: 'Long-range rifle on a scaffold tower.' },
  cannon:   { name: 'Scrap Cannon', cat: 'defence', size: 2, res: 'cash', cost0: 6000, g: 2.0, t0: 180, maxLv: 10, unlock: 3, counts: [0, 0, 0, 1, 1, 2, 2],
              turret: { dmg: 13, dmgLv: 3, range: 3, hp: 60, hpLv: 18, aim: 55 }, desc: 'Fires bolts and nails. Short range, brutal up close.' },
  wall:     { name: 'Barricade', cat: 'wall', size: 1, res: 'cash', cost0: 200, g: 2.3, t0: 0, maxLv: 6, unlock: 3, counts: [0, 0, 0, 25, 40, 60, 80],
              desc: 'Concrete and razor wire. Blocks movement and gives cover. Instant to place, no builder needed.' },
};

export const SPRITES = {
  den: (lv) => (lv <= 2 ? 'hq1' : lv <= 4 ? 'hq2' : 'hq3'),
  cannon: () => 'turret',
};
export const spriteFor = (type, lv = 1) => (SPRITES[type] ? SPRITES[type](lv) : type);

export const OBSTACLES = {
  bush:     { name: 'Overgrown Bush', size: 1, cost: 15,   time: 4,   teeth: [0.25, 1, 3] },
  tyres:    { name: 'Tyre Pile',      size: 1, cost: 25,   time: 6,   teeth: [0.3, 1, 3] },
  scrap:    { name: 'Scrap Wood',     size: 1, cost: 30,   time: 6,   teeth: [0.3, 1, 3] },
  rubble:   { name: 'Rubble',         size: 1, cost: 40,   time: 8,   teeth: [0.35, 1, 4] },
  deadtree: { name: 'Dead Tree',      size: 1, cost: 60,   time: 10,  teeth: [0.4, 1, 5] },
  tree:     { name: 'Wild Tree',      size: 2, cost: 120,  time: 15,  teeth: [0.45, 2, 6] },
  wreck:    { name: 'Car Wreck',      size: 2, cost: 250,  time: 25,  teeth: [0.5, 2, 6] },
  ruin2:    { name: 'Ruined House',   size: 2, cost: 800,  time: 45,  teeth: [0.8, 3, 8] },
  ruin3:    { name: 'Derelict Block', size: 3, cost: 3000, time: 120, teeth: [1, 6, 15] },
};

export const CATS = [
  ['money', 'Money'], ['influence', 'Rep'], ['storage', 'Storage'], ['crew', 'Crew'], ['supplies', 'Supplies'], ['defence', 'Defence'], ['wall', 'Walls'], ['social', 'Family'],
];

export const lvCap = (type, den) => (type === 'den' ? MAX_DEN : Math.min(BUILDINGS[type].maxLv, Math.max(1, den * 2)));

export function costOf(type, lv) {
  const d = BUILDINGS[type];
  if (d.costs) return d.costs[lv] || 0;
  return Math.round(d.cost0 * Math.pow(d.g, lv - 1));
}
export function timeOf(type, lv) {
  const d = BUILDINGS[type];
  if (d.times) return d.times[lv] || 0;
  if (!d.t0) return 0;
  return Math.min(4 * 3600, Math.round(d.t0 * Math.pow(2.2, lv - 1)));
}
export function rateOf(type, lv) {
  const p = BUILDINGS[type].produce;
  return p && lv > 0 ? p.rate * (1 + 0.55 * (lv - 1)) : 0;
}
export function tillOf(type, lv) {
  const p = BUILDINGS[type].produce;
  return p ? rateOf(type, lv) * p.till : 0;
}
export function storeOf(type, lv, res) {
  const d = BUILDINGS[type];
  if (!d.store || lv <= 0) return 0;
  const s = d.store[res];
  if (!s) return 0;
  if (Array.isArray(s)) return s[lv] || 0;
  return Math.round(s.base * Math.pow(s.g, lv - 1));
}
export function housingOf(type, lv) {
  const d = BUILDINGS[type];
  if (lv <= 0 || !d.housing) return 0;
  return Array.isArray(d.housing) ? d.housing[lv] : d.housing.base + d.housing.per * lv;
}
export function turretOf(type, lv) {
  const t = BUILDINGS[type].turret;
  return t ? { dmg: t.dmg + t.dmgLv * (lv - 1), range: t.range, hp: t.hp + t.hpLv * (lv - 1), aim: t.aim + 2 * (lv - 1) } : null;
}
