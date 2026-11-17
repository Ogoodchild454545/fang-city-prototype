// Operator equipment: paper-doll slots, a grounded street-gear catalogue (no magic), the shared
// stash, equip/unequip rules and the one stat calculation used by both the character screen and
// battles (so what the sheet shows is exactly what the fight uses). See docs/hero-template.md.
import { defOf } from './heroes.js';
import { starBonus } from './shards.js';
import { levelBonus, perkMods } from './progress.js';
import { kitMods } from './loadout.js';
import { rngNext } from './rng.js';

// Paper-doll slots, in screen order. `acc` has two sockets (acc1, acc2).
export const SLOTS = [
  { id: 'primary', name: 'Primary weapon', short: 'Primary', kind: 'primary', ico: '🔫' },
  { id: 'sidearm', name: 'Sidearm', short: 'Sidearm', kind: 'sidearm', ico: '🔫' },
  { id: 'melee', name: 'Melee weapon', short: 'Melee', kind: 'melee', ico: '🔧' },
  { id: 'head', name: 'Head', short: 'Head', kind: 'head', ico: '🧢' },
  { id: 'jacket', name: 'Jacket / coat', short: 'Jacket', kind: 'jacket', ico: '🧥' },
  { id: 'body', name: 'Body armour', short: 'Armour', kind: 'body', ico: '🦺' },
  { id: 'gloves', name: 'Gloves', short: 'Gloves', kind: 'gloves', ico: '🧤' },
  { id: 'boots', name: 'Legs / boots', short: 'Boots', kind: 'boots', ico: '🥾' },
  { id: 'acc1', name: 'Accessory', short: 'Accessory', kind: 'acc', ico: '⌚' },
  { id: 'acc2', name: 'Accessory', short: 'Accessory', kind: 'acc', ico: '💍' },
  { id: 'utility', name: 'Utility / grenade', short: 'Utility', kind: 'utility', ico: '💣' },
  { id: 'consumable', name: 'Consumables', short: 'Kit', kind: 'consumable', ico: '🩹' },
  { id: 'trinket', name: 'Trinket / charm', short: 'Charm', kind: 'trinket', ico: '🎲' },
];
export const SLOT_IDS = SLOTS.map((s) => s.id);
export const SLOT_BY_ID = Object.fromEntries(SLOTS.map((s) => [s.id, s]));

// Items can have quality tiers (heroes never have rarity).
// v0.11: one rarity system. The old quality keys stay (saves + tables use them) but now read as
// Common / Uncommon / Rare / Epic / Legendary, each with its own frame colour.
export const QUALITY = {
  worn: { id: 'worn', name: 'Common', col: '#a8a39b', rank: 0, lv: 1 },
  street: { id: 'street', name: 'Uncommon', col: '#5fbf5a', rank: 1, lv: 1 },
  tuned: { id: 'tuned', name: 'Rare', col: '#4f9be8', rank: 2, lv: 3 },
  custom: { id: 'custom', name: 'Epic', col: '#b066e8', rank: 3, lv: 6 },
  legend: { id: 'legend', name: 'Legendary', col: '#f0902a', rank: 4, lv: 10 },
};
export const RARITY = QUALITY;

// Stat keys an item can change. Shown in this order on the sheet.
export const STAT_DEFS = [
  { id: 'hp', name: 'Health', short: 'HP' },
  { id: 'armor', name: 'Armour', short: 'Armour', tip: 'Ignore this much damage from every hit (min 1).' },
  { id: 'mdmg', name: 'Melee damage bonus', short: 'Melee dmg +' },
  { id: 'rdmg', name: 'Ranged damage bonus', short: 'Gun dmg +' },
  { id: 'aim', name: 'Aim', short: 'Aim', tip: 'Base hit chance before cover and range.' },
  { id: 'crit', name: 'Crit chance', short: 'Crit', pct: 1 },
  { id: 'dodge', name: 'Dodge', short: 'Dodge', pct: 1, tip: 'Taken off every attacker\'s hit chance.' },
  { id: 'speed', name: 'Speed', short: 'Speed', tip: 'Higher goes earlier in the turn order.' },
  { id: 'move', name: 'Move', short: 'Move', tip: 'Tiles per AP budget.' },
  { id: 'ap', name: 'Action points', short: 'AP' },
  { id: 'carry', name: 'Ammo carry', short: 'Ammo' },
  { id: 'medCarry', name: 'Medkit carry', short: 'Medkits' },
];
const MOD_KEYS = ['hp', 'armor', 'mdmg', 'rdmg', 'aim', 'crit', 'dodge', 'speed', 'move', 'carry', 'medCarry', 'range', 'charges'];

const W = (name, dmg, range, typ) => ({ name, dmg, range, typ });
// slot = paper-doll kind; wpn = weapon profile for weapon slots; give = where it drops from.
export const ITEMS = {
  // --- primary guns ---
  carbine: { name: 'Dockside Carbine', slot: 'primary', q: 'street', wpn: W('Carbine', [3, 5], 8, 'rifle'), carry: 2, text: 'Old but true. Ammo goes further.' },
  sawnoff: { name: 'Sawn-off Shotgun', slot: 'primary', q: 'street', wpn: W('Sawn-off', [4, 6], 4, 'shotgun'), text: 'Brutal across a table, useless across a yard.' },
  pumpgun: { name: 'Pump Shotgun', slot: 'primary', q: 'tuned', wpn: W('Pump shotgun', [5, 7], 5, 'shotgun'), text: 'Every rack says "leave".' },
  // --- sidearms ---
  snub: { name: 'Snub Revolver', slot: 'sidearm', q: 'worn', wpn: W('Snub revolver', [2, 4], 6, 'pistol'), text: 'Five in the drum. Make them count.' },
  pistol9: { name: 'Nine-mil Pistol', slot: 'sidearm', q: 'street', wpn: W('9mm pistol', [2, 4], 7, 'pistol'), aim: 4, text: 'Nothing fancy. It just works.' },
  magnum: { name: 'Bulldog Magnum', slot: 'sidearm', q: 'custom', wpn: W('Magnum', [3, 6], 6, 'pistol'), crit: 5, text: 'Loud enough to end arguments.' },
  // --- melee ---
  tyreiron: { name: 'Tyre Iron', slot: 'melee', q: 'worn', wpn: W('Tyre iron', [4, 6], 1, 'melee'), text: 'Lifted from a dock lorry. Still has the grease.' },
  knuckles: { name: 'Brass Knuckles', slot: 'melee', q: 'street', wpn: W('Brass knuckles', [3, 5], 1, 'melee'), crit: 8, speed: 1, text: 'Fast hands find the soft spots.' },
  bat: { name: 'Taped Bat', slot: 'melee', q: 'street', wpn: W('Taped bat', [5, 7], 1, 'melee'), aim: -4, text: 'Big swings. Bigger misses.' },
  machete: { name: 'Machete', slot: 'melee', q: 'tuned', wpn: W('Machete', [5, 8], 1, 'melee'), text: 'Cane-field steel, kept sharp.' },
  sledge: { name: 'Sledgehammer', slot: 'melee', q: 'custom', wpn: W('Sledgehammer', [6, 9], 1, 'melee'), speed: -2, text: 'Slow. Final.' },
  // --- head ---
  flatcap: { name: 'Flat Cap', slot: 'head', q: 'worn', aim: 2, text: 'Keeps the rain out of your eyes.' },
  beanie: { name: 'Wool Beanie', slot: 'head', q: 'street', hp: 1, dodge: 2, text: 'Dark wool, low profile.' },
  helmet: { name: 'Riot Helmet', slot: 'head', q: 'tuned', hp: 3, speed: -1, text: 'Liberated from a police van.' },
  // --- jacket / coat ---
  hoodie: { name: 'Dock Hoodie', slot: 'jacket', q: 'worn', dodge: 3, text: 'Hood up, head down.' },
  leather: { name: 'Leather Jacket', slot: 'jacket', q: 'street', hp: 2, dodge: 2, text: 'Scuffed in all the right places.' },
  trench: { name: 'Trench Coat', slot: 'jacket', q: 'tuned', hp: 2, dodge: 4, crit: 3, text: 'Room for a lot under there.' },
  // --- body armour ---
  gilet: { name: 'Puffer Gilet', slot: 'body', q: 'street', hp: 3, text: 'Foam and duct tape under the nylon. Better than nothing.' },
  stabvest: { name: 'Stab Vest', slot: 'body', q: 'tuned', armor: 1, text: 'Turns a blade, dulls a bullet.' },
  platerig: { name: 'Steel-plate Rig', slot: 'body', q: 'custom', armor: 1, hp: 3, move: -1, text: 'Heavy as sin, worth every pound.' },
  // --- gloves ---
  tape: { name: 'Knuckle Tape', slot: 'gloves', q: 'worn', mdmg: 1, text: 'Tape over the knuckles.' },
  fingerless: { name: 'Fingerless Gloves', slot: 'gloves', q: 'street', aim: 4, text: 'Warm hands, steady trigger.' },
  weighted: { name: 'Weighted Gloves', slot: 'gloves', q: 'tuned', mdmg: 2, speed: -1, text: 'Lead shot sewn in the knuckles.' },
  // --- boots ---
  trainers: { name: 'Beat-up Trainers', slot: 'boots', q: 'worn', speed: 1, text: 'Light on the feet.' },
  workboots: { name: 'Steel-toe Boots', slot: 'boots', q: 'street', hp: 2, mdmg: 1, text: 'Every kick counts.' },
  runners: { name: 'Running Shoes', slot: 'boots', q: 'tuned', move: 1, speed: 1, text: 'For when it all goes wrong.' },
  // --- accessories (two slots) ---
  dogtags: { name: 'Dog Tags', slot: 'acc', q: 'worn', hp: 1, text: 'Somebody else\'s name. You keep them anyway.' },
  chain: { name: 'Gold Chain', slot: 'acc', q: 'street', crit: 5, text: 'Heavy enough to swing.' },
  watch: { name: 'Pawned Watch', slot: 'acc', q: 'street', speed: 2, text: 'Never late to a fight.' },
  ring: { name: 'Signet Ring', slot: 'acc', q: 'tuned', mdmg: 1, crit: 3, text: 'Leaves a mark.' },
  // --- utility / grenade ---
  pipebomb: { name: 'Pipe Bomb', slot: 'utility', q: 'street', charges: 1, text: 'One throw per fight: blast around a tile, sets off barrels and cars.' },
  bandolier: { name: 'Bandolier', slot: 'utility', q: 'worn', carry: 3, text: '+3 rounds carried into a fight.' },
  // --- consumables ---
  dressings: { name: 'Bandage Roll', slot: 'consumable', q: 'worn', medCarry: 1, text: 'Carry one more medkit into a fight.' },
  painkillers: { name: 'Painkillers', slot: 'consumable', q: 'street', hp: 2, text: 'Take the edge off. +2 HP.' },
  // --- trinkets ---
  dice: { name: 'Lucky Dice', slot: 'trinket', q: 'worn', crit: 3, text: 'Loaded, obviously.' },
  photo: { name: 'Family Photo', slot: 'trinket', q: 'street', hp: 2, text: 'Something worth getting home to.' },
  fang: { name: 'Fang Charm', slot: 'trinket', q: 'tuned', aim: 3, mdmg: 1, text: 'Your first trophy, on a bootlace.' },
  // ===== v0.11 additions (25) =====
  smg: { name: 'Alley Sweeper SMG', slot: 'primary', q: 'tuned', wpn: W('SMG', [3, 5], 6, 'rifle'), speed: 1, bp: 1, text: 'Sprays a corridor clean. Accuracy optional.' },
  huntrifle: { name: 'Bolt-action Hunting Rifle', slot: 'primary', q: 'tuned', wpn: W('Hunting rifle', [5, 7], 10, 'rifle'), aim: 6, bp: 1, text: 'Made for deer. Works on rats.' },
  lmg: { name: 'Dockyard LMG', slot: 'primary', q: 'custom', wpn: W('LMG', [5, 8], 7, 'rifle'), speed: -2, carry: 2, bp: 1, text: 'Came off a boat in a piano crate.' },
  goldrifle: { name: 'Gilded Kingpin Rifle', slot: 'primary', q: 'legend', wpn: W('Gilded rifle', [6, 9], 9, 'rifle'), crit: 8, aim: 5, src: 'reward', text: 'Gold-plated, engraved, and absolutely loaded.' },
  flaregun: { name: 'Flare Pistol', slot: 'sidearm', q: 'street', wpn: W('Flare pistol', [2, 4], 5, 'pistol'), crit: 4, src: 'level', unlockLv: 6, text: 'Meant for boats in trouble. Now it is you.' },
  machinepistol: { name: 'Machine Pistol', slot: 'sidearm', q: 'tuned', wpn: W('Machine pistol', [2, 5], 5, 'pistol'), speed: 1, bp: 1, text: 'Small, ugly, never stops talking.' },
  silenced: { name: 'Suppressed .22', slot: 'sidearm', q: 'custom', wpn: W('Suppressed .22', [3, 5], 7, 'pistol'), aim: 8, dodge: 3, bp: 1, text: 'Nobody hears it. Nobody sees you.' },
  crowbar: { name: 'Crowbar', slot: 'melee', q: 'worn', wpn: W('Crowbar', [3, 5], 1, 'melee'), src: 'level', unlockLv: 2, text: 'Opens doors. And heads.' },
  cleaver: { name: 'Butcher\'s Cleaver', slot: 'melee', q: 'street', wpn: W('Cleaver', [4, 7], 1, 'melee'), crit: 5, text: 'From the back room at Moretti\'s.' },
  karambit: { name: 'Karambit', slot: 'melee', q: 'tuned', wpn: W('Karambit', [4, 6], 1, 'melee'), crit: 10, speed: 1, bp: 1, text: 'A claw you can put in your pocket.' },
  dockhook: { name: 'Docker\'s Hook', slot: 'melee', q: 'custom', wpn: W('Docker\'s hook', [6, 8], 1, 'melee'), mdmg: 1, bp: 1, text: 'Hauled cargo for thirty years. Now it hauls people.' },
  wolfknux: { name: 'Wolf-Fang Knuckles', slot: 'melee', q: 'legend', wpn: W('Wolf-fang knuckles', [6, 9], 1, 'melee'), crit: 12, speed: 2, src: 'reward', text: 'Silver spikes, filed like teeth. A pack legend.' },
  balaclava: { name: 'Balaclava', slot: 'head', q: 'street', dodge: 4, text: 'No face, no witness.' },
  nvgoggles: { name: 'Night-vision Goggles', slot: 'head', q: 'custom', aim: 8, crit: 3, text: 'Army surplus. The dark belongs to you.' },
  raincoat: { name: 'Rain Mac', slot: 'jacket', q: 'worn', hp: 1, dodge: 2, src: 'level', unlockLv: 4, text: 'It always rains in Fang City.' },
  bomber: { name: 'Kevlar-lined Bomber', slot: 'jacket', q: 'custom', hp: 3, armor: 1, dodge: 3, src: 'level', unlockLv: 12, text: 'Looks like a jacket. Stops like a vest.' },
  platecarrier: { name: 'Ceramic Plate Carrier', slot: 'body', q: 'legend', hp: 6, armor: 2, speed: -1, src: 'reward', text: 'Military plates. Ask no questions.' },
  drivegloves: { name: 'Leather Driving Gloves', slot: 'gloves', q: 'tuned', aim: 5, crit: 3, bp: 1, text: 'For the getaway, and the job before it.' },
  combatboots: { name: 'Combat Boots', slot: 'boots', q: 'tuned', hp: 2, dodge: 2, src: 'level', unlockLv: 8, text: 'Laced tight. Built for long nights.' },
  burner: { name: 'Burner Phone', slot: 'acc', q: 'street', speed: 2, text: 'One call, then the canal.' },
  lighter: { name: 'Brass Lighter', slot: 'acc', q: 'worn', crit: 3, text: 'Click, flame, a promise.' },
  goldwatch: { name: 'Kingpin\'s Gold Watch', slot: 'acc', q: 'legend', crit: 6, aim: 4, dodge: 4, hp: 2, src: 'reward', text: 'Time is money. This is both.' },
  smoke: { name: 'Smoke Grenade', slot: 'utility', q: 'tuned', dodge: 8, bp: 1, text: 'Pull, throw, vanish.' },
  molotov: { name: 'Molotov', slot: 'utility', q: 'street', charges: 1, crit: 2, text: 'Rag, bottle, bad intentions.' },
  medkitpro: { name: 'Combat Med Kit', slot: 'consumable', q: 'custom', medCarry: 2, hp: 1, bp: 1, text: 'Stolen from a field hospital. Fully stocked.' },
};
for (const id of ['pumpgun', 'stabvest', 'machete', 'helmet', 'trench']) ITEMS[id].bp = 1;
for (const [id, it] of Object.entries(ITEMS)) { it.id = id; it.lv ||= QUALITY[it.q].lv; it.src ||= 'loot'; }
export const ITEM_IDS = Object.keys(ITEMS);
export const itemDef = (id) => ITEMS[id] || null;
export const itemIcon = (id) => `assets/items/${ITEMS[id] || id === 'blueprint' ? id : 'parts'}.webp`;
export const rarityOf = (id) => QUALITY[(ITEMS[id] || {}).q] || QUALITY.worn;
// Where an item comes from, in words (item detail view).
export function sourceText(id) {
  const it = ITEMS[id]; if (!it) return '';
  const bits = [];
  if (it.src === 'level') bits.push(`Unlocked at player Lv ${it.unlockLv}`);
  else if (it.src === 'reward') bits.push('Won only: Rookie Track, High Stakes and vault crates');
  else bits.push('Found in op loot and crates');
  if (it.bp) bits.push('craftable in the Factory with its blueprint');
  return bits.join(' · ');
}
// Items handed out when the player reaches a level.
export const LEVEL_ITEMS = Object.values(ITEMS).filter((it) => it.src === 'level').map((it) => ({ id: it.id, lv: it.unlockLv }));
export const slotFits = (slotId, itemId) => { const it = ITEMS[itemId], sl = SLOT_BY_ID[slotId]; return !!(it && sl && it.slot === sl.kind); };

export function modsOf(ids = []) {
  const m = Object.fromEntries(MOD_KEYS.map((k) => [k, 0]));
  for (const id of ids) { const it = ITEMS[id]; if (!it) continue; for (const k of MOD_KEYS) if (it[k]) m[k] += it[k]; }
  return m;
}

// Equipped item ids of a hero record ({slot: itemId}).
export const equippedIds = (rec) => Object.values((rec && rec.equip) || {}).filter((id) => ITEMS[id]);

// The hero's defaults when no record exists (rival copies, sims): their template start kit.
export function defaultEquip(heroId) {
  const d = defOf(heroId);
  return (d && d.template && d.template.start && d.template.start.equip) ? { ...d.template.start.equip } : {};
}

// Weapons a hero fights with: the gun used by shots, the melee weapon used by strikes.
export function weaponsFor(heroId, ids) {
  const d = defOf(heroId);
  const pick = (kind) => ids.map((id) => ITEMS[id]).find((it) => it && it.slot === kind && it.wpn);
  const prim = pick('primary'), side = pick('sidearm'), mel = pick('melee');
  const base = d.weapon;
  const baseGun = base.typ !== 'melee' ? base : (d.template && d.template.fallbackGun) || null;
  const baseMel = base.typ === 'melee' ? base : null;
  return {
    gun: prim ? prim.wpn : side ? side.wpn : baseGun,
    mel: mel ? mel.wpn : baseMel,
  };
}

// Full stat sheet for a hero with a given progression + gear. Battle units are built from this.
export function statsFor(heroId, { stars = 1, lv = 1, perks = [], gear = null, equip = null } = {}) {
  const d = defOf(heroId);
  const ids = equip ? Object.values(equip).filter((id) => ITEMS[id]) : [];
  const sb = starBonus(stars), lb = levelBonus(lv), pm = perkMods(perks), km = kitMods(gear), im = modsOf(ids);
  const fox = d.species === 'Fox', bear = d.species === 'Bear';
  const extraAp = d.passive?.id === 'scurry' ? 1 : 0;
  const { gun, mel } = weaponsFor(heroId, ids);
  const tb = (d.template && d.template.base) || {};
  return {
    hp: d.hp + sb.hp + lb.hp + pm.hp + (km.hp || 0) + (bear ? 3 : 0) + (km.hpClass || 0) + im.hp,
    armor: (km.armor || 0) + (tb.armor || 0) + im.armor,
    mdmg: (km.mdmg || 0) + im.mdmg,
    rdmg: (km.rdmg || 0) + im.rdmg,
    aim: d.aim + sb.aim + lb.aim + pm.aim + (km.aim || 0) + im.aim,
    aimMod: sb.aim + lb.aim + pm.aim + (km.aim || 0) + im.aim,
    crit: (tb.crit || 0) + im.crit,
    dodge: (tb.dodge || 0) + im.dodge,
    speed: (d.speed || 8) + (fox ? 2 : 0) + im.speed,
    move: d.move + (pm.move || 0) + (fox ? 1 : 0) + (km.move || 0) + im.move,
    ap: d.ap + extraAp,
    range: (km.range || 0) + im.range,
    carry: im.carry, medCarry: im.medCarry, charges: im.charges,
    gun, mel,
  };
}

// ---------- stash & equipping (state) ----------
export function ensureItems(s) {
  s.stash ||= {};
  for (const [id, rec] of Object.entries((s.heroes && s.heroes.owned) || {})) {
    if (!rec.equip || typeof rec.equip !== 'object') {
      rec.equip = {};
      const d = defOf(id);
      const start = d && d.template && d.template.start;
      if (start) {
        Object.assign(rec.equip, start.equip || {});
        if (!rec.starterGiven) { for (const it of start.stash || []) addItem(s, it, 1); rec.starterGiven = 1; }
      }
    }
    for (const [sl, it] of Object.entries(rec.equip)) if (!ITEMS[it] || !slotFits(sl, it)) delete rec.equip[sl];
  }
  for (const k of Object.keys(s.stash)) if (!ITEMS[k] || !(s.stash[k] > 0)) delete s.stash[k];
  return s;
}
export const stashCount = (s, id) => (s.stash && s.stash[id]) || 0;
export function addItem(s, id, n = 1) {
  if (!ITEMS[id]) return false;
  s.stash ||= {};
  s.stash[id] = (s.stash[id] || 0) + n;
  return true;
}
export function stashList(s) {
  return Object.entries(s.stash || {}).filter(([id, n]) => ITEMS[id] && n > 0)
    .sort((a, b) => SLOT_IDS.indexOf(firstSlotFor(a[0])) - SLOT_IDS.indexOf(firstSlotFor(b[0])) || QUALITY[ITEMS[b[0]].q].rank - QUALITY[ITEMS[a[0]].q].rank)
    .map(([id, n]) => ({ id, n, item: ITEMS[id] }));
}
export function firstSlotFor(itemId) { const it = ITEMS[itemId]; return it ? (SLOTS.find((sl) => sl.kind === it.slot) || {}).id : null; }
// Slot an item would go into: the first empty matching socket, else the first matching one.
export function targetSlot(rec, itemId, s, heroId) {
  const it = ITEMS[itemId]; if (!it) return null;
  const fits = SLOTS.filter((sl) => sl.kind === it.slot).map((sl) => sl.id);
  return fits.find((sl) => !(rec.equip || {})[sl] && (!s || slotOpen(s, heroId, sl))) || (s && fits.find((sl) => slotOpen(s, heroId, sl))) || fits[0];
}

export function equipItem(s, heroId, itemId, slotId) {
  const rec = s.heroes.owned[heroId];
  if (!rec) return { ok: false, reason: 'Not in the crew' };
  ensureItems(s);
  if (!ITEMS[itemId]) return { ok: false, reason: 'Unknown item' };
  const slot = slotId || targetSlot(rec, itemId, s, heroId);
  if (!slotFits(slot, itemId)) return { ok: false, reason: `${ITEMS[itemId].name} doesn't go in that slot` };
  if (s.player && !slotOpen(s, heroId, slot)) return { ok: false, reason: `${SLOT_BY_ID[slot].short} slot opens at level ${SLOT_UNLOCK[slot]}` };
  if (s.player && slotLevel(s, heroId) < (ITEMS[itemId].lv || 1)) return { ok: false, reason: `${ITEMS[itemId].name} needs level ${ITEMS[itemId].lv}` };
  if (stashCount(s, itemId) < 1) return { ok: false, reason: 'Not in the stash' };
  const prev = rec.equip[slot];
  s.stash[itemId] -= 1;
  if (!s.stash[itemId]) delete s.stash[itemId];
  if (prev) addItem(s, prev, 1);
  rec.equip[slot] = itemId;
  if (s.stats) s.stats.equips = (s.stats.equips || 0) + 1;
  return { ok: true, slot, prev: prev || null };
}
export function unequipItem(s, heroId, slotId) {
  const rec = s.heroes.owned[heroId];
  if (!rec) return { ok: false, reason: 'Not in the crew' };
  ensureItems(s);
  const it = rec.equip[slotId];
  if (!it) return { ok: false, reason: 'Slot is empty' };
  delete rec.equip[slotId];
  addItem(s, it, 1);
  return { ok: true, item: it };
}

// What the sheet would look like with one change (for compare / diff arrows).
export function previewEquip(s, heroId, itemId, slotId) {
  const rec = s.heroes.owned[heroId] || {};
  const slot = slotId || targetSlot(rec, itemId);
  const equip = { ...(rec.equip || {}) };
  if (itemId) equip[slot] = itemId; else delete equip[slot];
  const pack = { stars: rec.stars, lv: rec.lv, perks: rec.perks, gear: rec.gear, equip };
  return { slot, now: statsFor(heroId, { ...pack, equip: rec.equip || {} }), next: statsFor(heroId, pack) };
}

// ---------- loot ----------
// Drop weights by quality; tables are built from the catalogue so new items join automatically.
const DROP_W = { worn: 6, street: 5, tuned: 2, custom: 0.6, legend: 0.12 };
export function rollItem(holder, { minQ = 0, bonus = 0, rewards = false } = {}) {
  // level-unlock items never drop; reward-only items only drop from reward rolls (vault crates)
  const pool = ITEM_IDS.filter((id) => QUALITY[ITEMS[id].q].rank >= minQ && ITEMS[id].src !== 'level' && (rewards || ITEMS[id].src !== 'reward'));
  const w = pool.map((id) => DROP_W[ITEMS[id].q] * (QUALITY[ITEMS[id].q].rank >= 2 ? 1 + bonus : 1));
  let r = rngNext(holder) * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i]; }
  return pool[pool.length - 1];
}
// After a won fight: a chance at a piece of street gear.
export function rollBattleLoot(s, kind) {
  if (kind === 'tutorial') { addItem(s, 'knuckles', 1); return 'knuckles'; }
  const chance = kind === 'street' ? 0.45 : 0.3;
  if (rngNext(s) >= chance) return null;
  const id = rollItem(s, { bonus: kind === 'street' ? 0.2 : 0 });
  addItem(s, id, 1);
  return id;
}
// ---------- v0.11 blueprints ----------
export const BP_ITEMS = ITEM_IDS.filter((id) => ITEMS[id].bp);
export const hasBlueprint = (s, id) => !!(s.blueprints && s.blueprints[id]);
// Pick a blueprint the player doesn't own yet (rarer ones less often); null if they have them all.
export function rollBlueprint(s) {
  const pool = BP_ITEMS.filter((id) => !hasBlueprint(s, id));
  if (!pool.length) return null;
  const w = pool.map((id) => DROP_W[ITEMS[id].q] + 0.5);
  let r = rngNext(s) * w.reduce((a, b) => a + b, 0);
  let pick = pool[pool.length - 1];
  for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) { pick = pool[i]; break; } }
  s.blueprints ||= {}; s.blueprints[pick] = 1;
  return pick;
}
// After an op/street win: sometimes a blueprint turns up in the loot (Factory must be unlockable).
export function rollBlueprintLoot(s, kind) {
  if (kind === 'tutorial' || !s.player || (s.player.lv || 1) < 7) return null;
  if (rngNext(s) >= (kind === 'street' ? 0.2 : 0.15)) return null;
  return rollBlueprint(s);
}

// Mission wins: a first clear always pays out a piece of gear, repeats sometimes do.
export function rollMissionLoot(s, first) {
  if (!first && rngNext(s) >= 0.35) return null;
  const id = rollItem(s, { minQ: first ? 1 : 0, bonus: first ? 0.5 : 0 });
  addItem(s, id, 1);
  return id;
}
// Ice crates: street crates sometimes include gear, vault crates always do (better odds).
export function rollCrateLoot(s, kind) {
  if (kind !== 'vault' && rngNext(s) >= 0.35) return null;
  const id = rollItem(s, kind === 'vault' ? { minQ: 1, bonus: 1, rewards: true } : {});
  addItem(s, id, 1);
  return id;
}
// Workshop (base production): turn scrap parts into a random piece of street gear.
export const CRAFT_ITEM_COST = 10;
export function craftItem(s) {
  if ((s.parts || 0) < CRAFT_ITEM_COST) return { ok: false, reason: `Need ${CRAFT_ITEM_COST} parts (from Scrapyards and junk piles)` };
  s.parts -= CRAFT_ITEM_COST;
  const id = rollItem(s, {});
  addItem(s, id, 1);
  if (s.stats) s.stats.crafted = (s.stats.crafted || 0) + 1;
  return { ok: true, id, item: ITEMS[id] };
}

// ---------- v0.10 slot unlocks + Best gear ----------
// Four slots are open at the start; the rest open with the operator's level (or the player's
// account level, whichever is higher), so every slot is open by level 10.
export const SLOT_UNLOCK = { melee: 1, sidearm: 1, jacket: 1, boots: 1, gloves: 2, head: 2, consumable: 3, body: 4, primary: 5, acc1: 6, utility: 7, acc2: 8, trinket: 10 };
export const slotLevel = (s, heroId) => Math.max((s.heroes.owned[heroId] || {}).lv || 1, (s.player && s.player.lv) || 1);
export const slotOpen = (s, heroId, slotId) => slotLevel(s, heroId) >= (SLOT_UNLOCK[slotId] || 1);
export const openSlotCount = (s, heroId) => SLOT_IDS.filter((sl) => slotOpen(s, heroId, sl)).length;
export const BEST_GEAR_LV = 10;

// One number per item for auto-equip. Weapons count their damage; everything else its stats.
export function itemScore(heroId, itemId) {
  const it = ITEMS[itemId]; if (!it) return -1e9;
  const d = defOf(heroId) || {};
  const melee = (d.weapon && d.weapon.typ === 'melee') || d.classId === 'bruiser';
  let v = 0;
  if (it.wpn) {
    const avg = (it.wpn.dmg[0] + it.wpn.dmg[1]) / 2;
    v += avg * (it.slot === 'melee' ? (melee ? 2.2 : 1) : (melee ? 1.4 : 2.2)) + (it.slot === 'melee' ? 0 : it.wpn.range * 0.25);
  }
  v += (it.hp || 0) * 1 + (it.armor || 0) * 3 + (it.mdmg || 0) * (melee ? 2.5 : 1) + (it.rdmg || 0) * (melee ? 1 : 2.5)
    + (it.aim || 0) * 0.25 + (it.crit || 0) * 0.15 + (it.dodge || 0) * 0.25 + (it.speed || 0) * 0.6 + (it.move || 0) * 1.5
    + (it.carry || 0) * 0.3 + (it.medCarry || 0) * 1 + (it.charges || 0) * 1.5 + (it.range || 0) * 0.8;
  return v + QUALITY[it.q].rank * 0.05;
}
export function bestGear(s, heroId) {
  const rec = s.heroes.owned[heroId];
  if (!rec) return { ok: false, reason: 'Not in the crew' };
  if (((s.player && s.player.lv) || 1) < BEST_GEAR_LV) return { ok: false, reason: `Best gear unlocks at Lv ${BEST_GEAR_LV}` };
  ensureItems(s);
  const before = { ...rec.equip };
  // take everything off the open slots into the pool, then fill each slot with the best piece
  for (const sl of SLOT_IDS) if (slotOpen(s, heroId, sl) && rec.equip[sl]) { addItem(s, rec.equip[sl], 1); delete rec.equip[sl]; }
  for (const sl of SLOT_IDS) {
    if (!slotOpen(s, heroId, sl)) continue;
    const cands = Object.keys(s.stash).filter((id) => s.stash[id] > 0 && slotFits(sl, id));
    if (!cands.length) continue;
    cands.sort((a, b) => itemScore(heroId, b) - itemScore(heroId, a));
    const pick = cands[0];
    if (itemScore(heroId, pick) <= 0 && !ITEMS[pick].wpn) continue;
    s.stash[pick] -= 1; if (!s.stash[pick]) delete s.stash[pick];
    rec.equip[sl] = pick;
  }
  const changed = SLOT_IDS.filter((sl) => (before[sl] || null) !== (rec.equip[sl] || null)).length;
  if (s.stats) s.stats.bestGear = (s.stats.bestGear || 0) + 1;
  return { ok: true, changed };
}
