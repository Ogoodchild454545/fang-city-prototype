// Unique collectable operators. Separate from home-base trained troops (those stay
// for missions, raids and later modes). A new player owns only Rook.
import { den } from './base.js';

export const HERO_ORDER = ['rook', 'pip', 'lumen', 'brick', 'vesper', 'ivory', 'nile', 'marlow'];

export const HEROES = {
  rook: {
    id: 'rook', name: 'Rook', species: 'Wolf', role: 'Assault',
    blurb: 'A steady street rifleman. Every new crew starts with him.',
    portrait: 'assets/heroes/rook.jpg', thumb: 'assets/heroes/rook-64.jpg',
    mood: 'heroic',
    hp: 12, ap: 4, move: 5, aim: 72, armor: 0, speed: 8,
    weapon: { name: 'Carbine', dmg: [3, 5], range: 8, typ: 'rifle' },
    abilities: [
      { id: 'shot', name: 'Snap Shot', ap: 2, kind: 'shot', text: 'Standard carbine shot.' },
      { id: 'overwatch', name: 'Overwatch', ap: 2, kind: 'overwatch', text: 'Shoot the first foe who moves in range.' },
    ],
    passive: { id: 'pack', name: 'Pack Sense', text: '+15% hit when an ally is next to Rook or the target.' },
    tags: ['rifle', 'wolf'],
    unlock: { kind: 'start' },
  },
  pip: {
    id: 'pip', name: 'Pip', species: 'Rat', role: 'Scout',
    blurb: 'Tiny, fast, and always first around a corner.',
    portrait: 'assets/heroes/pip.jpg', thumb: 'assets/heroes/pip-64.jpg',
    mood: 'heroic',
    hp: 8, ap: 5, move: 7, aim: 68, armor: 0, speed: 12,
    weapon: { name: 'Holdout pistol', dmg: [2, 4], range: 6, typ: 'pistol' },
    abilities: [
      { id: 'dash', name: 'Dash', ap: 1, kind: 'dash', text: 'Move again this turn with +2 range. Once per turn.' },
      { id: 'knife', name: 'Flick Knife', ap: 2, kind: 'melee', range: 1, dmg: [3, 5], text: 'Close cut. +20% hit if the target is flanked.' },
    ],
    passive: { id: 'scurry', name: 'Scurry', text: '+1 Action Point each turn.' },
    tags: ['scout', 'rat'],
    unlock: { kind: 'tutorial' },
  },
  lumen: {
    id: 'lumen', name: 'Lumen', species: 'Fox', role: 'Marksman',
    blurb: 'A rooftop shot. She prefers to stand still and pick her moment.',
    portrait: 'assets/heroes/lumen.jpg', thumb: 'assets/heroes/lumen-64.jpg',
    mood: 'heroic',
    hp: 9, ap: 4, move: 4, aim: 82, armor: 0, speed: 7,
    weapon: { name: 'Long rifle', dmg: [4, 6], range: 11, typ: 'rifle' },
    abilities: [
      { id: 'aimed', name: 'Aimed Shot', ap: 3, kind: 'aimed', text: '+25% hit. Best when she has not moved.' },
      { id: 'overwatch', name: 'Overwatch', ap: 2, kind: 'overwatch', text: 'Shoot the first foe who moves in range.' },
    ],
    passive: { id: 'cold', name: 'Cold Eye', text: '+15% crit if Lumen has not moved this turn.' },
    tags: ['marksman', 'fox'],
    unlock: { kind: 'buy', cash: 2000 },
  },
  brick: {
    id: 'brick', name: 'Brick', species: 'Badger', role: 'Anchor',
    blurb: 'Walks into the street first and dares anyone to move him.',
    portrait: 'assets/heroes/brick.jpg', thumb: 'assets/heroes/brick-64.jpg',
    mood: 'heroic',
    hp: 16, ap: 4, move: 4, aim: 62, armor: 1, speed: 5,
    weapon: { name: 'Heavy SMG', dmg: [3, 4], range: 6, typ: 'smg' },
    abilities: [
      { id: 'suppress', name: 'Suppress', ap: 2, kind: 'suppress', text: 'A pinning burst. Half damage, and the target aims worse until their next turn.' },
      { id: 'fortify', name: 'Fortify', ap: 1, kind: 'fortify', text: 'Treat cover as one step better until your next turn.' },
    ],
    passive: { id: 'hide', name: 'Thick Hide', text: 'Ignore 1 damage from every hit.' },
    tags: ['tank', 'badger'],
    unlock: { kind: 'buy', influence: 80, den: 2 },
  },
  vesper: {
    id: 'vesper', name: 'Vesper', species: 'Snake', role: 'Support',
    blurb: 'Keeps the crew standing and makes sharpshooters miss.',
    portrait: 'assets/heroes/vesper.jpg', thumb: 'assets/heroes/vesper-64.jpg',
    mood: 'heroic',
    hp: 10, ap: 4, move: 5, aim: 70, armor: 0, speed: 8,
    weapon: { name: 'Dart pistol', dmg: [2, 3], range: 7, typ: 'pistol' },
    abilities: [
      { id: 'patch', name: 'Patch Up', ap: 2, kind: 'heal', range: 3, heal: 4, text: 'Restore 4 HP to an ally within 3 tiles.' },
      { id: 'venom', name: 'Venom Round', ap: 2, kind: 'venom', text: 'A shot that cuts their aim and bleeds them for two turns.' },
    ],
    passive: { id: 'kit', name: 'Field Kit', text: 'If she did not fire last turn, she heals 1 HP at the start of her turn.' },
    tags: ['support', 'snake'],
    unlock: { kind: 'buy', cash: 5000, den: 2 },
  },
  ivory: {
    id: 'ivory', name: 'Ivory', species: 'Wolf', role: 'Breacher',
    blurb: 'Closes the gap and finishes the job with a short-barrel shotgun.',
    portrait: 'assets/heroes/ivory.jpg', thumb: 'assets/heroes/ivory-64.jpg',
    mood: 'heroic',
    hp: 11, ap: 4, move: 6, aim: 70, armor: 0, speed: 9,
    weapon: { name: 'Street shotgun', dmg: [5, 7], range: 5, typ: 'shotgun' },
    abilities: [
      { id: 'blast', name: 'Point Blank', ap: 2, kind: 'shot', text: 'Shotgun blast. Much more accurate up close.' },
      { id: 'sprint', name: 'Sprint', ap: 1, kind: 'sprint', text: '+2 move this turn.' },
    ],
    passive: { id: 'hot', name: 'Hot Blood', text: 'After a knock-out, regain 2 AP.' },
    tags: ['shotgun', 'wolf'],
    unlock: { kind: 'buy', teeth: 25, den: 3 },
  },
  nile: {
    id: 'nile', name: 'Nile', species: 'Croc', role: 'Closer',
    blurb: 'Crosses the street in two strides and ends the argument up close.',
    portrait: 'assets/heroes/nile.jpg', thumb: 'assets/heroes/nile-64.jpg',
    mood: 'heroic',
    hp: 14, ap: 4, move: 5, aim: 64, armor: 0, speed: 10,
    weapon: { name: 'Jaw and hook', dmg: [4, 6], range: 1, typ: 'melee' },
    abilities: [
      { id: 'lunge', name: 'Close In', ap: 2, kind: 'lunge', range: 3, text: 'Move up to 3 tiles toward a foe and strike.' },
      { id: 'roll', name: 'Death Roll', ap: 3, kind: 'melee', range: 1, dmg: [6, 9], text: 'A heavy melee hit. Once per turn.' },
    ],
    passive: { id: 'jaw', name: 'Iron Jaw', text: 'Melee ignores half cover.' },
    tags: ['melee', 'croc'],
    unlock: { kind: 'buy', cash: 8000, den: 3 },
  },
  marlow: {
    id: 'marlow', name: 'Marlow', species: 'Bear', role: 'Heavy',
    blurb: 'Opens a route through parked cars and anything else in the way.',
    portrait: 'assets/heroes/marlow.jpg', thumb: 'assets/heroes/marlow-64.jpg',
    mood: 'heroic',
    hp: 18, ap: 3, move: 3, aim: 60, armor: 1, speed: 4,
    weapon: { name: 'Drum shotgun', dmg: [5, 8], range: 5, typ: 'shotgun' },
    abilities: [
      { id: 'breach', name: 'Breach', ap: 2, kind: 'breach', range: 1, text: 'Smash an adjacent car, crate or barrier off the map.' },
      { id: 'blast', name: 'Point Blank', ap: 3, kind: 'shot', text: 'A heavy close shot.' },
    ],
    passive: { id: 'bulk', name: 'Bulk', text: '+4 max HP (already in his sheet).' },
    tags: ['heavy', 'bear'],
    unlock: { kind: 'buy', teeth: 40, den: 4 },
  },
};

// Rival operators used as computer opponents (same rules, darker stock portraits).
export const RIVALS = {
  hook: {
    id: 'hook', name: 'Hook', species: 'Fox', role: 'Thug',
    portrait: 'assets/fox.jpg', thumb: 'assets/fox.jpg',
    hp: 8, ap: 4, move: 5, aim: 58, armor: 0, speed: 7,
    weapon: { name: 'Pistol', dmg: [2, 3], range: 6, typ: 'pistol' },
    abilities: [
      { id: 'shot', name: 'Shot', ap: 2, kind: 'shot', text: '' },
      { id: 'overwatch', name: 'Overwatch', ap: 2, kind: 'overwatch', text: '' },
    ],
    passive: { id: 'none', name: '', text: '' },
    tags: ['pistol', 'fox'],
  },
  knack: {
    id: 'knack', name: 'Knack', species: 'Rat', role: 'Runner',
    portrait: 'assets/rat.jpg', thumb: 'assets/rat.jpg',
    hp: 7, ap: 5, move: 7, aim: 64, armor: 0, speed: 12,
    weapon: { name: 'Holdout', dmg: [2, 3], range: 6, typ: 'pistol' },
    abilities: [
      { id: 'shot', name: 'Shot', ap: 2, kind: 'shot', text: '' },
      { id: 'dash', name: 'Dash', ap: 1, kind: 'dash', text: '' },
    ],
    passive: { id: 'scurry', name: 'Scurry', text: '+1 AP.' },
    tags: ['scout', 'rat'],
  },
  slab: {
    id: 'slab', name: 'Slab', species: 'Badger', role: 'Anchor',
    portrait: 'assets/badger.jpg', thumb: 'assets/badger.jpg',
    hp: 14, ap: 4, move: 4, aim: 58, armor: 1, speed: 5,
    weapon: { name: 'SMG', dmg: [3, 4], range: 6, typ: 'smg' },
    abilities: [
      { id: 'shot', name: 'Shot', ap: 2, kind: 'shot', text: '' },
      { id: 'fortify', name: 'Fortify', ap: 1, kind: 'fortify', text: '' },
    ],
    passive: { id: 'hide', name: 'Thick Hide', text: '-1 damage.' },
    tags: ['tank', 'badger'],
  },
  rill: {
    id: 'rill', name: 'Rill', species: 'Croc', role: 'Closer',
    portrait: 'assets/croc.jpg', thumb: 'assets/croc.jpg',
    hp: 13, ap: 4, move: 5, aim: 60, armor: 0, speed: 10,
    weapon: { name: 'Hook', dmg: [4, 6], range: 1, typ: 'melee' },
    abilities: [
      { id: 'lunge', name: 'Close In', ap: 2, kind: 'lunge', range: 3, text: '' },
      { id: 'roll', name: 'Death Roll', ap: 3, kind: 'melee', range: 1, dmg: [5, 8], text: '' },
    ],
    passive: { id: 'jaw', name: 'Iron Jaw', text: 'Melee ignores half cover.' },
    tags: ['melee', 'croc'],
  },
  pact: {
    id: 'pact', name: 'Pact', species: 'Snake', role: 'Support',
    portrait: 'assets/snake.jpg', thumb: 'assets/snake.jpg',
    hp: 9, ap: 4, move: 5, aim: 68, armor: 0, speed: 8,
    weapon: { name: 'Dart gun', dmg: [2, 3], range: 7, typ: 'pistol' },
    abilities: [
      { id: 'venom', name: 'Venom Round', ap: 2, kind: 'venom', text: '' },
      { id: 'patch', name: 'Patch Up', ap: 2, kind: 'heal', range: 3, heal: 3, text: '' },
    ],
    passive: { id: 'none', name: '', text: '' },
    tags: ['support', 'snake'],
  },
  bruno: {
    id: 'bruno', name: 'Bruno', species: 'Bear', role: 'Heavy',
    portrait: 'assets/bear.jpg', thumb: 'assets/bear.jpg',
    hp: 16, ap: 3, move: 3, aim: 58, armor: 1, speed: 4,
    weapon: { name: 'Drum gun', dmg: [5, 7], range: 5, typ: 'shotgun' },
    abilities: [
      { id: 'shot', name: 'Shot', ap: 3, kind: 'shot', text: '' },
      { id: 'breach', name: 'Breach', ap: 2, kind: 'breach', range: 1, text: '' },
    ],
    passive: { id: 'bulk', name: 'Bulk', text: '' },
    tags: ['heavy', 'bear'],
  },
  ash: {
    id: 'ash', name: 'Ash', species: 'Wolf', role: 'Assault',
    portrait: 'assets/wolf.jpg', thumb: 'assets/wolf.jpg',
    hp: 11, ap: 4, move: 5, aim: 70, armor: 0, speed: 8,
    weapon: { name: 'Carbine', dmg: [3, 5], range: 8, typ: 'rifle' },
    abilities: [
      { id: 'shot', name: 'Snap Shot', ap: 2, kind: 'shot', text: '' },
      { id: 'overwatch', name: 'Overwatch', ap: 2, kind: 'overwatch', text: '' },
    ],
    passive: { id: 'pack', name: 'Pack Sense', text: '+15% hit with a nearby ally.' },
    tags: ['rifle', 'wolf'],
  },
  mica: {
    id: 'mica', name: 'Mica', species: 'Fox', role: 'Marksman',
    portrait: 'assets/fox.jpg', thumb: 'assets/fox.jpg',
    hp: 8, ap: 4, move: 4, aim: 80, armor: 0, speed: 7,
    weapon: { name: 'Long rifle', dmg: [4, 6], range: 11, typ: 'rifle' },
    abilities: [
      { id: 'aimed', name: 'Aimed Shot', ap: 3, kind: 'aimed', text: '' },
      { id: 'overwatch', name: 'Overwatch', ap: 2, kind: 'overwatch', text: '' },
    ],
    passive: { id: 'cold', name: 'Cold Eye', text: '+15% crit if she has not moved.' },
    tags: ['marksman', 'fox'],
  },
};

export const defOf = (id) => HEROES[id] || RIVALS[id];

export function emptyHeroes() {
  return {
    owned: { rook: { xp: 0, lv: 1, stars: 1, shards: 0, perks: [], gear: null } },
    squad: ['rook'], tutorialDone: false, wins: 0,
    shards: {}, universal: 0, pin: null, cratePity: 0, vaultPity: 0, cratesOpened: 0,
  };
}

export function ensureHeroes(s) {
  if (!s.heroes || !s.heroes.owned) s.heroes = emptyHeroes();
  if (!s.heroes.owned.rook) s.heroes.owned.rook = { xp: 0, lv: 1, stars: 1, shards: 0, perks: [], gear: null };
  for (const rec of Object.values(s.heroes.owned)) {
    rec.xp ||= 0; rec.lv = rec.lv || 1; rec.stars = rec.stars || 1; rec.shards ||= 0;
    rec.perks = rec.perks || [];
    if (rec.gear === undefined) rec.gear = null;
  }
  s.heroes.shards ||= {};
  s.heroes.universal ||= 0;
  s.heroes.cratePity ||= 0;
  s.heroes.vaultPity ||= 0;
  s.heroes.cratesOpened ||= 0;
  if (s.heroes.pin === undefined) s.heroes.pin = null;
  if (!Array.isArray(s.heroes.squad) || !s.heroes.squad.length) s.heroes.squad = ['rook'];
  s.heroes.squad = s.heroes.squad.filter((id) => s.heroes.owned[id]).slice(0, 4);
  if (!s.heroes.squad.length) s.heroes.squad = ['rook'];
  s.heroes.wins ||= 0;
  return s.heroes;
}

export const ownedList = (s) => HERO_ORDER.filter((id) => s.heroes?.owned?.[id]);

export function setSquad(s, ids) {
  const next = [...new Set(ids)].filter((id) => HEROES[id] && s.heroes.owned[id]).slice(0, 4);
  if (!next.length) return { ok: false, reason: 'Pick at least one operator.' };
  s.heroes.squad = next;
  return { ok: true };
}

export function denLv(s) {
  const d = den(s);
  return d && d.lv ? d.lv : 1;
}

export function unlockHint(s, id) {
  const h = HEROES[id]; if (!h) return 'Unknown';
  if (id === 'rook') return 'Given in the street lesson';
  if (s.heroes?.owned?.[id]) return 'In the crew';
  const have = s.heroes?.shards?.[id] || 0;
  return `${have}/30 shards to unlock`;
}

export function canRecruit(s, id) {
  const h = HEROES[id];
  if (!h) return { ok: false, reason: 'Unknown operator' };
  if (s.heroes?.owned?.[id]) return { ok: false, reason: 'Already in the crew' };
  const u = h.unlock || {};
  if (u.kind === 'start') return { ok: true };
  if (u.kind === 'tutorial') return { ok: false, reason: 'Finishes the street lesson first' };
  if (u.den && denLv(s) < u.den) return { ok: false, reason: `The Den must be level ${u.den}` };
  if (u.cash && s.cash < u.cash) return { ok: false, reason: `Need $${u.cash.toLocaleString('en-GB')}` };
  if (u.influence && s.influence < u.influence) return { ok: false, reason: `Need ${u.influence} Rep` };
  if (u.teeth && s.teeth < u.teeth) return { ok: false, reason: `Need ${u.teeth} Ice` };
  return { ok: true };
}

export function recruit(s, id) {
  const gate = canRecruit(s, id);
  if (!gate.ok) return gate;
  const u = HEROES[id].unlock || {};
  if (u.cash) s.cash -= u.cash;
  if (u.influence) s.influence -= u.influence;
  if (u.teeth) s.teeth -= u.teeth;
  s.heroes.owned[id] = { xp: 0 };
  if (s.heroes.squad.length < 4) s.heroes.squad.push(id);
  return { ok: true, name: HEROES[id].name };
}

export function grantHero(s, id) {
  if (!HEROES[id]) return false;
  if (!s.heroes.owned[id]) s.heroes.owned[id] = { xp: 0, lv: 1, stars: 1, shards: 0, perks: [], gear: null };
  if (s.heroes.squad.length < 4 && !s.heroes.squad.includes(id)) s.heroes.squad.push(id);
  return true;
}

export function finishTutorial(s) {
  s.heroes.tutorialDone = true;
  return { ok: true };
}

// Aim / damage tweaks when this attacker faces that defender.
export function matchup(attDef, defDef) {
  const a = attDef.tags || [], d = defDef.tags || [];
  let aim = 0, dmg = 0, note = '';
  if (a.includes('marksman') && d.includes('scout')) { aim += 10; note = 'Marksman has the drop on a scout in the open'; }
  if (a.includes('scout') && d.includes('marksman')) { aim += 12; note = 'A scout on the flank unpicks a camper'; }
  if (a.includes('melee') && d.includes('marksman')) { aim += 8; dmg += 1; note = 'A closer punishes a long rifle up close'; }
  if (a.includes('tank') && d.includes('melee')) { dmg -= 1; note = 'Thick hide shrugs off a close swing'; }
  if (a.includes('marksman') && d.includes('tank')) { aim -= 8; note = 'An anchor is a hard target at range'; }
  if (a.includes('shotgun') && d.includes('scout')) { dmg += 1; note = 'A short barrel hurts a light scout'; }
  if (a.includes('support') && d.includes('marksman')) { aim += 6; note = 'Venom and darts spoil a sharpshooter'; }
  if (a.includes('melee') && d.includes('tank')) { aim -= 6; note = 'Hard to find a gap in an anchor'; }
  if (a.includes('rifle') && d.includes('melee') && (attDef.weapon?.range || 0) > 3) { aim += 6; note = 'A rifle keeps a closer at arm\'s length'; }
  return { aim, dmg, note };
}

export const SQUAD_SYNERGY = [
  { need: ['rook', 'ivory'], name: 'Pack Bond', text: 'Two wolves: both gain +8 aim.' },
  { need: ['lumen', 'pip'], name: 'Spotter', text: 'If Pip has line of sight to Lumen\'s target, she gains +12 aim.' },
  { need: ['brick', 'vesper'], name: 'Field Guard', text: 'If Brick is next to Vesper, she takes 1 less damage.' },
  { need: ['nile', 'marlow'], name: 'Breach Pair', text: 'Marlow\'s Breach refunds 1 AP if Nile is in the fight.' },
];

export function synergiesFor(ids) {
  const set = new Set(ids);
  return SQUAD_SYNERGY.filter((g) => g.need.every((id) => set.has(id)));
}
