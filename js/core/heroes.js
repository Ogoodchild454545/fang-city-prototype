// Unique collectable operators. Separate from home-base trained troops (those stay
// for missions, raids and later modes). A new player owns only Rook.
import { den } from './base.js';


export const CLASSES = {
  tank:    { id: 'tank',    name: 'Tank',          blurb: 'Soaks hits and holds the line.' },
  sniper:  { id: 'sniper',  name: 'Sniper',        blurb: 'Long range, high aim. Gear can quiet or weight the rifle.' },
  medic:   { id: 'medic',   name: 'Medic',         blurb: 'Keeps the crew standing and can revive a KO mid-fight.' },
  assault: { id: 'assault', name: 'Assault',       blurb: 'Mid-range rifles and shotguns. Gear tweaks the punch.' },
  demo:    { id: 'demo',    name: 'Demolitions',   blurb: 'Explosives and heavy shots. Best around barrels and vans.' },
  scout:   { id: 'scout',   name: 'Scout',         blurb: 'First around the corner. Fast, quiet, hard to pin down.' },
  bruiser: { id: 'bruiser', name: 'Bruiser',       blurb: 'Melee all-rounder: holds the front alone, hits hard, heals on every hit.' },
};

// Species perk is always on. Heroes of the same species share it; there are no rarity tiers.
export const SPECIES_PERKS = {
  Wolf:   { id: 'pack',     name: 'Pack Sense',  text: '+15% hit when an ally is next to you or the target.' },
  Rat:    { id: 'sneaky',   name: 'Sneaky',      text: 'Harder to hit after you have moved, and deadlier on a flank.' },
  Fox:    { id: 'quick',    name: 'Quick',       text: '+2 Speed in the initiative queue and +1 Move.' },
  Badger: { id: 'stubborn', name: 'Stubborn',    text: 'The first time you would be KO\'d in a fight, you stay at 1 HP.' },
  Snake:  { id: 'poison',   name: 'Venom',       text: 'A hitting shot leaves the target poisoned for two turns.' },
  Croc:   { id: 'tough',    name: 'Thick Hide',  text: 'Ignore 1 damage from every hit.' },
  Bear:   { id: 'stout',    name: 'Immovable',   text: '+3 max HP, and you cannot be suppressed.' },
  Rhino:  { id: 'unshakeable', name: 'Unshakeable', text: 'Cannot be Shaken or suppressed.' },
  Hare:   { id: 'lightfoot', name: 'Light Foot', text: '+1 Move, and free to step away from a foe next to her.' },
  // v0.19 new species (one operator each)
  Buffalo: { id: 'herd',    name: 'Herd Wall',   text: 'Takes 1 less damage from every hit while a crewmate stands next to him.' },
  Owl:     { id: 'nighteye', name: 'Night Eyes', text: '+1 range on every gun, and her shots ignore Dodge.' },
  Raccoon: { id: 'tinker',  name: 'Tinkerer',    text: 'Every ability with a cooldown recharges 1 turn faster.' },
  Cat:     { id: 'reflex',  name: 'Cat Reflexes', text: 'Overwatch shots at her are at -20 aim.' },
  Otter:   { id: 'slick',   name: 'Slick',       text: 'Bleeding and venom wash off her after a single tick.' },
};

export const classOf = (h) => (h && CLASSES[h.classId]) || CLASSES[(h && h.classId)] || null;
export const speciesPerk = (species) => SPECIES_PERKS[species] || null;

export const HERO_ORDER = ['rook', 'anvil', 'pip', 'lumen', 'brick', 'vesper', 'ivory', 'nile', 'marlow', 'sledge', 'vigil', 'jinx', 'sable', 'reed'];
// v0.19: the five operators added on New Operators Day (see docs/new-operators-day.md).
export const NEW_OPS_V019 = ['sledge', 'vigil', 'jinx', 'sable', 'reed'];

export const HEROES = {
  rook: {
    id: 'rook', name: 'Rook', species: 'Wolf', role: 'Bruiser',
    blurb: 'A frontline wolf bruiser. Every new crew starts with him.',
    portrait: 'assets/heroes/rook.webp', thumb: 'assets/heroes/rook-64.webp',
    mood: 'heroic',
    // Bruiser / Fighter: the melee all-rounder. Enough HP to hold the front alone,
    // respectable damage, and his own sustain (Bruiser Grit, Second Wind).
    hp: 16, ap: 4, move: 5, aim: 66, armor: 0, speed: 8,
    // Bare-handed baseline; the real weapons come from his equipment (template.start).
    weapon: { name: 'Fists', dmg: [2, 3], range: 1, typ: 'melee' },
    abilities: [
      { id: 'melee', name: 'Strike', ap: 2, kind: 'melee', range: 1, melee: true, text: 'Hit with the equipped melee weapon.' },
      { id: 'shot', name: 'Shoot', ap: 2, kind: 'shot', gun: true, text: 'Fire the equipped gun (uses ammo).' },
      { id: 'pounce', name: 'Pounce', ap: 2, kind: 'pounce', range: 4, cd: 3, aim: 10, melee: true, unlock: 1, sfx: 'pounce',
        text: 'Leap onto a foe up to 4 tiles away (no overwatch can catch the leap), then strike at +10 aim.' },
      { id: 'secondwind', name: 'Second Wind', ap: 1, kind: 'secondwind', cd: 5, heal: 0.35, unlock: 1, sfx: 'secondwind',
        text: 'Catch your breath: heal 35% of max HP and shake off bleed and venom.' },
      { id: 'maul', name: 'Maul', ap: 3, kind: 'maul', range: 1, cd: 2, dmgAdd: 2, bleed: 2, melee: true, unlock: 3, sfx: 'maul',
        text: 'Savage bite and swing: +2 damage and the target bleeds 1 HP a turn for 2 turns.' },
      { id: 'howl', name: 'Howl', ap: 1, kind: 'howl', cd: 4, radius: 5, unlock: 5, sfx: 'howl',
        text: 'Foes within 5 tiles are Shaken (-15 aim); you and nearby crew are Rallied (+10 aim) until your next turn.' },
    ],
    passive: { id: 'grit', name: 'Bruiser Grit', text: 'Every melee hit heals Rook 1 HP — he keeps himself standing on the front line.' },
    classId: 'bruiser',
    // Data-driven template: anything built from Rook later (new operators, rivals) copies this shape.
    template: {
      class: 'bruiser',
      base: { crit: 5, dodge: 0 },
      slots: ['primary', 'melee', 'head', 'jacket', 'body', 'gloves', 'boots', 'acc1', 'acc2', 'utility', 'consumable', 'trinket'],
      start: {
        // v0.10: four slots are open at the start (melee, gun, jacket, boots); the rest open
        // as Rook levels up, so the tape and dressings wait in the stash.
        equip: { melee: 'tyreiron', primary: 'snub', jacket: 'hoodie', boots: 'trainers' },
        stash: ['tape', 'dressings', 'flatcap', 'gilet', 'chain', 'pipebomb'],
      },
    },
    bio: "A dock-road bruiser who walked out of a Grey Pack setup with a tyre iron, a borrowed revolver and a younger cousin to look after. He talks little, goes in first, and does not leave crew on the ground.",
    quips: {
      move: ["Round the crates.", "On me.", "Keep it tight."],
      shoot: ["I have him.", "Steady.", "Down you go."],
      ko: ["Not… done.", "I'm still here."],
      revive: ["On your feet.", "Up. We are not finished."]
    },

    tags: ['melee', 'wolf', 'bruiser'],
    unlock: { kind: 'start' },
  },
  // v0.12: the second hero built on Rook's template. A slow rhino Tank who joins free at player Lv 10
  // (the fourth op seat). Huge health and armour; poor speed and movement; holds the line for the crew.
  anvil: {
    id: 'anvil', name: 'Anvil', species: 'Rhino', role: 'Tank',
    blurb: 'A rhino in a riot plate. Slow to start, impossible to stop.',
    portrait: 'assets/heroes/anvil.webp', thumb: 'assets/heroes/anvil-64.webp',
    mood: 'heroic',
    hp: 26, ap: 4, move: 3, aim: 60, armor: 1, speed: 4,
    weapon: { name: 'Fists', dmg: [3, 4], range: 1, typ: 'melee' },
    abilities: [
      { id: 'melee', name: 'Strike', ap: 2, kind: 'melee', range: 1, melee: true, text: 'Hit with the equipped melee weapon.' },
      { id: 'shot', name: 'Shotgun', ap: 2, kind: 'shot', gun: true, text: 'Fire the equipped gun (uses ammo).' },
      { id: 'brace', name: 'Brace', ap: 1, kind: 'brace', cd: 3, armor: 2, unlock: 1, sfx: 'secondwind',
        text: 'Riot shield up: +2 armour and cover one step better until your next turn.' },
      { id: 'pounce', name: 'Gore Charge', ap: 2, kind: 'pounce', range: 4, cd: 3, aim: 5, dmgAdd: 2, melee: true, unlock: 1, sfx: 'pounce',
        text: 'Charge a foe up to 4 tiles away (overwatch can\'t catch it) and hit with the horn at +2 damage and +5 aim.' },
      { id: 'taunt', name: 'Taunt', ap: 1, kind: 'taunt', cd: 4, radius: 5, unlock: 3, sfx: 'howl',
        text: 'Call them out: foes within 5 tiles aim 25% worse at anyone but Anvil until their turn ends.' },
      { id: 'maul', name: 'Horn Slam', ap: 3, kind: 'maul', range: 1, cd: 3, dmgAdd: 3, bleed: 1, melee: true, unlock: 5, sfx: 'maul',
        text: 'Drive the horn in: +3 damage and the target bleeds 1 HP for a turn.' },
    ],
    passive: { id: 'bulwark', name: 'Bulwark', text: 'Crew standing next to Anvil take 1 less damage from every hit.' },
    classId: 'tank',
    template: {
      class: 'tank',
      base: { crit: 0, dodge: 0, armor: 1 },
      slots: ['primary', 'melee', 'head', 'jacket', 'body', 'gloves', 'boots', 'acc1', 'acc2', 'utility', 'consumable', 'trinket'],
      start: {
        equip: { primary: 'sawnoff', melee: 'bat', jacket: 'leather', body: 'stabvest', boots: 'workboots' },
        stash: ['helmet'],
      },
    },
    bio: "Ten years on the door of the Harbour Lights club, two on a prison landing, and not one night where anyone got past him. Anvil came out with a dented riot shield he lifted on the way, a debt to Rook's family, and no interest in running. He walks in at his own pace and stands where the bullets are.",
    quips: {
      move: ["I'm coming. Slowly.", "Behind me.", "Make room."],
      shoot: ["Knock knock.", "Stay down.", "Wrong door."],
      ko: ["...Took a while.", "Still... standing... mostly."],
      revive: ["Get behind me.", "Back on the door."],
      win: ["Doors closed.", "Nobody got past."],
    },
    tags: ['tank', 'rhino', 'melee'],
    unlock: { kind: 'level', lv: 10 },
  },
  pip: {
    id: 'pip', name: 'Pip', species: 'Rat', role: 'Scout',
    blurb: 'Tiny, fast, and always first around a corner.',
    portrait: 'assets/heroes/pip.webp', thumb: 'assets/heroes/pip-64.webp',
    mood: 'heroic',
    hp: 8, ap: 5, move: 7, aim: 68, armor: 0, speed: 12,
    weapon: { name: 'Holdout pistol', dmg: [2, 4], range: 6, typ: 'pistol' },
    abilities: [
      { id: 'dash', name: 'Dash', ap: 1, kind: 'dash', text: 'Move again this turn with +2 range. Once per turn.' },
      { id: 'knife', name: 'Flick Knife', ap: 2, kind: 'melee', range: 1, dmg: [3, 5], text: 'Close cut. +20% hit if the target is flanked.' },
    ],
    passive: { id: 'scurry', name: 'Scurry', text: '+1 Action Point each turn.' },
    classId: 'scout',
    bio: "A dock rat who learned every drain and crate-gap in the yard before she could count. She scouts because standing still feels like being bait.",
    quips: {
      move: ["Already gone.", "This way.", "Too slow."],
      shoot: ["Surprise.", "From the side.", "Gotcha."],
      ko: ["Ow— not fair.", "Still twitchin’."],
      revive: ["I’m up, I’m up!", "Didn’t see that coming."]
    },

    tags: ['scout', 'rat'],
    unlock: { kind: 'tutorial' },
  },
  lumen: {
    id: 'lumen', name: 'Lumen', species: 'Fox', role: 'Sniper',
    blurb: 'A rooftop shot. She prefers to stand still and pick her moment.',
    portrait: 'assets/heroes/lumen.webp', thumb: 'assets/heroes/lumen-64.webp',
    mood: 'heroic',
    hp: 9, ap: 4, move: 4, aim: 82, armor: 0, speed: 7,
    weapon: { name: 'Long rifle', dmg: [4, 6], range: 11, typ: 'rifle' },
    abilities: [
      { id: 'aimed', name: 'Aimed Shot', ap: 3, kind: 'aimed', text: '+25% hit. Best when she has not moved.' },
      { id: 'overwatch', name: 'Overwatch', ap: 2, kind: 'overwatch', text: 'Shoot the first foe who moves in range.' },
    ],
    passive: { id: 'cold', name: 'Cold Eye', text: '+15% crit if Lumen has not moved this turn.' },
    classId: 'sniper',
    bio: "A rooftop fox who used to call marks for a velvet-room crew, then walked when the jobs got sloppy. She still prefers a long lane and a quiet shot.",
    quips: {
      move: ["Better angle.", "Hold still out there.", "I see a line."],
      shoot: ["One breath.", "Called it.", "Stay down."],
      ko: ["Missed one.", "…tch."],
      revive: ["I’m fine. Range is fine.", "Give me the rifle."]
    },

    tags: ['marksman', 'fox'],
    unlock: { kind: 'buy', cash: 2000 },
  },
  brick: {
    id: 'brick', name: 'Brick', species: 'Badger', role: 'Tank',
    blurb: 'Walks into the street first and dares anyone to move him.',
    portrait: 'assets/heroes/brick.webp', thumb: 'assets/heroes/brick-64.webp',
    mood: 'heroic',
    hp: 16, ap: 4, move: 4, aim: 62, armor: 1, speed: 5,
    weapon: { name: 'Heavy SMG', dmg: [3, 4], range: 6, typ: 'smg' },
    abilities: [
      { id: 'suppress', name: 'Suppress', ap: 2, kind: 'suppress', text: 'A pinning burst. Half damage, and the target aims worse until their next turn.' },
      { id: 'fortify', name: 'Fortify', ap: 1, kind: 'fortify', text: 'Treat cover as one step better until your next turn.' },
    ],
    passive: { id: 'hide', name: 'Thick Hide', text: 'Ignore 1 damage from every hit.' },
    classId: 'tank',
    bio: "A night-door badger who took knocks so smaller cousins didn’t have to. He walks in first, plants his feet, and waits for the crew to finish the work.",
    quips: {
      move: ["I’m the door.", "Make me move.", "On the line."],
      shoot: ["Stay down there.", "That’s far enough.", "Hold."],
      ko: ["Still standing… almost.", "Took worse."],
      revive: ["Told you. Stubborn.", "Back in."]
    },

    tags: ['tank', 'badger'],
    unlock: { kind: 'buy', influence: 80, den: 2 },
  },
  vesper: {
    id: 'vesper', name: 'Vesper', species: 'Snake', role: 'Medic',
    blurb: 'Keeps the crew standing and makes sharpshooters miss.',
    portrait: 'assets/heroes/vesper.webp', thumb: 'assets/heroes/vesper-64.webp',
    mood: 'heroic',
    hp: 10, ap: 4, move: 5, aim: 70, armor: 0, speed: 8,
    weapon: { name: 'Dart pistol', dmg: [2, 3], range: 7, typ: 'pistol' },
    abilities: [
      { id: 'patch', name: 'Patch Up', ap: 2, kind: 'heal', range: 3, heal: 4, text: 'Restore 4 HP to an ally within 3 tiles.' },
      { id: 'venom', name: 'Venom Round', ap: 2, kind: 'venom', text: 'A shot that cuts their aim and bleeds them for two turns.' },
    ],
    passive: { id: 'kit', name: 'Field Kit', text: 'If she did not fire last turn, she heals 1 HP at the start of her turn.' },
    classId: 'medic',
    bio: "A back-room snake who stitched more knife work than she ever started. She joined the crew with a bag of kits and a rule: nobody stays down if she can reach them.",
    quips: {
      move: ["Stay with me.", "I can reach them.", "Hold on."],
      shoot: ["A little sting.", "That’ll slow you.", "Don’t wriggle."],
      ko: ["Need a minute…", "Bag’s still here."],
      revive: ["Breathe. You’re back.", "Easy. Partial, but you’re up.", "Not losing you tonight."]
    },

    tags: ['support', 'snake'],
    unlock: { kind: 'buy', cash: 5000, den: 2 },
  },
  ivory: {
    id: 'ivory', name: 'Ivory', species: 'Wolf', role: 'Assault',
    blurb: 'Closes the gap and finishes the job with a short-barrel shotgun.',
    portrait: 'assets/heroes/ivory.webp', thumb: 'assets/heroes/ivory-64.webp',
    mood: 'heroic',
    hp: 11, ap: 4, move: 6, aim: 70, armor: 0, speed: 9,
    weapon: { name: 'Street shotgun', dmg: [5, 7], range: 5, typ: 'shotgun' },
    abilities: [
      { id: 'blast', name: 'Point Blank', ap: 2, kind: 'shot', text: 'Shotgun blast. Much more accurate up close.' },
      { id: 'sprint', name: 'Sprint', ap: 1, kind: 'sprint', text: '+2 move this turn.' },
    ],
    passive: { id: 'hot', name: 'Hot Blood', text: 'After a knock-out, regain 2 AP.' },
    classId: 'assault',
    bio: "A close-in wolf who likes a heavy shotgun and a short hallway. She used to clear warehouse doors for cash; now she clears them for the pack.",
    quips: {
      move: ["In close.", "Kick it in.", "With you."],
      shoot: ["Eat this.", "Too close to miss.", "Move."],
      ko: ["Gnh— keep going.", "I’m not the one who folds."],
      revive: ["I’m up. Who’s next.", "Shotgun’s still here."]
    },

    tags: ['shotgun', 'wolf'],
    unlock: { kind: 'buy', teeth: 25, den: 3 },
  },
  nile: {
    id: 'nile', name: 'Nile', species: 'Croc', role: 'Tank',
    blurb: 'Crosses the street in two strides and ends the argument up close.',
    portrait: 'assets/heroes/nile.webp', thumb: 'assets/heroes/nile-64.webp',
    mood: 'heroic',
    hp: 14, ap: 4, move: 5, aim: 64, armor: 0, speed: 10,
    weapon: { name: 'Jaw and hook', dmg: [4, 6], range: 1, typ: 'melee' },
    abilities: [
      { id: 'lunge', name: 'Close In', ap: 2, kind: 'lunge', range: 3, text: 'Move up to 3 tiles toward a foe and strike.' },
      { id: 'roll', name: 'Death Roll', ap: 3, kind: 'melee', range: 1, dmg: [6, 9], text: 'A heavy melee hit. Once per turn.' },
    ],
    passive: { id: 'jaw', name: 'Iron Jaw', text: 'Melee ignores half cover.' },
    classId: 'tank',
    bio: "A canal croc who used to pull hulls and debts along the quay. He doesn’t chase if he can wait, and once he has you, he does not let go.",
    quips: {
      move: ["Slow is fine.", "Coming.", "The water’s this way."],
      shoot: ["Got you.", "Closer.", "Stay in the jaw."],
      ko: ["Harder than that…", "Still heavy."],
      revive: ["I bite back.", "Up. Let’s finish it."]
    },

    tags: ['melee', 'croc'],
    unlock: { kind: 'buy', cash: 8000, den: 3 },
  },
  marlow: {
    id: 'marlow', name: 'Marlow', species: 'Bear', role: 'Demolitions',
    blurb: 'Flushes crews out from behind cover with lobbed charges and a drum shotgun.',
    portrait: 'assets/heroes/marlow.webp', thumb: 'assets/heroes/marlow-64.webp',
    mood: 'heroic',
    hp: 18, ap: 3, move: 3, aim: 60, armor: 1, speed: 4,
    weapon: { name: 'Drum shotgun', dmg: [5, 8], range: 5, typ: 'shotgun' },
    abilities: [
      { id: 'breach', name: 'Breach Charge', ap: 2, kind: 'breach', range: 4, text: 'Lob a charge up to 4 tiles: 4 damage to everyone next to it and sets off barrels and vans. Cover is not damaged.' },
      { id: 'blast', name: 'Point Blank', ap: 3, kind: 'shot', text: 'A heavy close shot.' },
    ],
    passive: { id: 'bulk', name: 'Bulk', text: '+4 max HP (already in his sheet).' },
    classId: 'demo',
    bio: "A yard bear who learned explosives because locks bored him. He treats a barrel like a tool, a van like a warning, and a wall like a suggestion.",
    quips: {
      move: ["Mind the barrel.", "Give me room.", "This’ll do."],
      shoot: ["Loud and clear.", "Light it.", "Back up."],
      ko: ["That… stung.", "Leave the charges."],
      revive: ["Still got a fuse.", "I’m not scrap yet."]
    },

    tags: ['heavy', 'bear'],
    unlock: { kind: 'buy', teeth: 40, den: 4 },
  },
  // ------------------------------------------------------------------ v0.19 New Operators Day
  // WORKING PLACEHOLDER: "Sledge" and his backstory are working names awaiting the Fang City Story
  // bot (the buffalo rebel from the world bible). Kit, stats and art are final; name/bio may change.
  sledge: {
    id: 'sledge', name: 'Sledge', species: 'Buffalo', role: 'Breaker', roleTag: 'Breaker',
    faction: 'The Thaw',
    blurb: 'A Thaw buffalo with a sledgehammer. Knocks crews out of cover and stands over his own.',
    portrait: 'assets/heroes/sledge.webp', thumb: 'assets/heroes/sledge-64.webp',
    mood: 'heroic',
    // Slowest piece on the board and the biggest health pool; he wins fights by breaking cover, not by shooting.
    hp: 28, ap: 4, move: 3, aim: 58, armor: 0, speed: 4,
    weapon: { name: 'Fists', dmg: [3, 4], range: 1, typ: 'melee' },
    abilities: [
      { id: 'melee', name: 'Strike', ap: 2, kind: 'melee', range: 1, melee: true, text: 'Hit with the equipped melee weapon.' },
      { id: 'shot', name: 'Shoot', ap: 2, kind: 'shot', gun: true, text: 'Fire the equipped gun (uses ammo).' },
      { id: 'smash', name: 'Cover Breaker', ap: 2, kind: 'smash', range: 1, cd: 3, dmgAdd: 2, melee: true, unlock: 1, sfx: 'maul',
        text: 'Bring the hammer down on a foe next to him: +2 damage, knocks them 1 tile back out of their spot if there is room, and leaves them Exposed (their cover counts one step worse) until their turn ends.' },
      { id: 'guard', name: 'Shoulder Up', ap: 1, kind: 'guard', range: 1, cd: 3, unlock: 1, sfx: 'secondwind',
        text: 'Plant himself beside a crewmate: until his next turn, half of every hit on that crewmate (rounded up) lands on Sledge instead.' },
      { id: 'cleave', name: 'Sweeping Cleave', ap: 3, kind: 'cleave', range: 1, cd: 3, dmgAdd: 1, melee: true, unlock: 3, sfx: 'maul',
        text: 'One wide swing that hits every foe standing next to him (+1 damage, rolled separately for each).' },
      { id: 'yell', name: 'Rebel Yell', ap: 1, kind: 'yell', cd: 5, radius: 3, unlock: 5, sfx: 'howl',
        text: 'Crew within 3 tiles shake off Shaken, Suppressed, Blinded and bleeding, and are Rallied (+10 aim) until their next turn.' },
    ],
    passive: { id: 'rebelgrit', name: 'Rebel Grit', text: 'Below half health he takes 1 less damage from every hit and cannot be Shaken, Suppressed or Blinded.' },
    classId: 'tank',
    gearPref: { melee: 1.5, body: 1.3, shotgun: 1.15 },
    template: {
      class: 'tank',
      base: { crit: 0, dodge: 0, armor: 1 },
      slots: ['primary', 'melee', 'head', 'jacket', 'body', 'gloves', 'boots', 'acc1', 'acc2', 'utility', 'consumable', 'trinket'],
      start: {
        equip: { melee: 'sledge', primary: 'sawnoff', jacket: 'leather', boots: 'workboots' },
        stash: ['bandolier', 'gilet'],
      },
    },
    bio: "A dock-gang buffalo who carried Helix crates for nine years until the company cut his mother's Ice ration to make a quota. He walked into the depot the next morning with the sledgehammer from the loading bay and walked out a Thaw man. Bracken Hale calls him the door: when the Thaw needs a wall gone, a barricade held, or a crew dragged out of a raid, Sledge goes first and comes back last. He doesn't talk about the cure. He talks about Ice for everyone, and he swings like he means it.",
    quips: {
      move: ["Make a hole.", "I'm coming through.", "Stay behind the horns."],
      shoot: ["Nothing to hide behind now.", "Wall's gone.", "Down."],
      ko: ["Still… breathing…", "Get them out first."],
      revive: ["Up. The Thaw doesn't kneel.", "On your feet, comrade."],
      win: ["Ice for everyone.", "Tell Helix we were here."],
    },
    tags: ['tank', 'buffalo', 'melee'],
    unlock: { kind: 'level', lv: 12 },
  },
  vigil: {
    id: 'vigil', name: 'Vigil', species: 'Owl', role: 'Spotter', roleTag: 'Spotter',
    faction: 'Helix contractor',
    blurb: 'A barn owl marksman who paints targets for the whole crew and lights up the dark.',
    portrait: 'assets/heroes/vigil.webp', thumb: 'assets/heroes/vigil-64.webp',
    mood: 'heroic',
    hp: 11, ap: 4, move: 4, aim: 76, armor: 0, speed: 6,
    weapon: { name: 'Scoped carbine', dmg: [3, 5], range: 9, typ: 'rifle' },
    abilities: [
      { id: 'shot', name: 'Shoot', ap: 2, kind: 'shot', gun: true, text: 'Fire the equipped gun (uses ammo).' },
      { id: 'mark', name: 'Mark Target', ap: 1, kind: 'mark', range: 12, cd: 2, unlock: 1, sfx: 'overwatch',
        text: 'Paint a foe she can see up to 12 tiles away: for 2 turns the whole crew gets +15 aim against them and their Dodge is ignored.' },
      { id: 'suppress', name: 'Pinning Shot', ap: 2, kind: 'suppress', cd: 2, gun: true, unlock: 3,
        text: 'A shot at +10 aim for half damage that pins the target down: Suppressed (-20 aim) until their turn ends.' },
      { id: 'flare', name: 'Flare', ap: 1, kind: 'flare', range: 8, radius: 2, cd: 4, unlock: 5, sfx: 'overwatch',
        text: 'Pop a flare over a tile up to 8 away: every foe within 2 tiles of it is Marked and pulled out of hiding.' },
    ],
    passive: { id: 'spotter', name: "Spotter's Eye", text: 'Her Marks last a turn longer, and the crew crit 10% more often against a foe she has Marked.' },
    classId: 'sniper',
    gearPref: { rifle: 1.4, head: 1.2, pistol: 0.7 },
    template: {
      class: 'sniper',
      base: { crit: 5, dodge: 0 },
      slots: ['primary', 'melee', 'head', 'jacket', 'body', 'gloves', 'boots', 'acc1', 'acc2', 'utility', 'consumable', 'trinket'],
      start: {
        equip: { primary: 'carbine', head: 'flatcap', jacket: 'raincoat', boots: 'trainers' },
        stash: ['fingerless'],
      },
    },
    bio: "Vigil sat in a bell tower for the whole of the Second War calling targets for a gun crew that never once saw her face. Now Helix pays her by the night to watch rooftops, and she takes their money and anyone else's. She keeps a notebook of every face she has painted for a rifle, and lately too many of them have been animals who were only slipping. She hasn't decided what to do about that yet. She just keeps writing.",
    quips: {
      move: ["Finding a perch.", "Higher.", "I see the whole board."],
      shoot: ["Marked and gone.", "Mind the wind.", "One breath."],
      ko: ["Lost… the angle…", "Someone take the watch."],
      revive: ["Eyes open. Back up.", "I've got you covered."],
      win: ["Street's clear. I'd know.", "Write it down."],
    },
    tags: ['marksman', 'owl'],
    unlock: { kind: 'shards' },
  },
  jinx: {
    id: 'jinx', name: 'Jinx', species: 'Raccoon', role: 'Saboteur', roleTag: 'Saboteur',
    faction: 'Helix defector',
    blurb: 'An ex-Helix raccoon technician: flashbangs, comms jammers and tripwires.',
    portrait: 'assets/heroes/jinx.webp', thumb: 'assets/heroes/jinx-64.webp',
    mood: 'heroic',
    hp: 12, ap: 4, move: 5, aim: 64, armor: 0, speed: 8,
    weapon: { name: '9mm pistol', dmg: [2, 4], range: 7, typ: 'pistol' },
    abilities: [
      { id: 'shot', name: 'Shoot', ap: 2, kind: 'shot', gun: true, text: 'Fire the equipped gun (uses ammo).' },
      { id: 'melee', name: 'Strike', ap: 2, kind: 'melee', range: 1, melee: true, text: 'Hit with the equipped melee weapon.' },
      { id: 'flash', name: 'Flashbang', ap: 2, kind: 'flash', range: 5, radius: 1, cd: 3, unlock: 1, sfx: 'explosion',
        text: 'Throw a flashbang up to 5 tiles: every foe within 1 tile of it is Blinded until their turn ends (-40 aim, Overwatch dropped and cannot be set).' },
      { id: 'jam', name: 'Jammer', ap: 1, kind: 'jam', radius: 5, cd: 4, unlock: 3, sfx: 'overwatch',
        text: 'Kill their comms: foes within 5 tiles drop Overwatch and are Jammed (no abilities, only move, shoot and strike) until their turn ends.' },
      { id: 'trap', name: 'Tripwire', ap: 1, kind: 'trap', range: 3, cd: 3, unlock: 5, sfx: 'move',
        text: 'Rig an empty tile up to 3 away. The first foe to step on it takes 4 damage, stops dead and is Slowed (-2 Move) next turn.' },
    ],
    passive: { id: 'scrapkit', name: 'Scrap Kit', text: 'Builds a Pipe Bomb out of junk before every fight (+1 charge).' },
    classId: 'demo',
    gearPref: { utility: 1.6, pistol: 1.2, gloves: 1.2 },
    template: {
      class: 'demo',
      base: { crit: 3, dodge: 2 },
      slots: ['primary', 'melee', 'head', 'jacket', 'body', 'gloves', 'boots', 'acc1', 'acc2', 'utility', 'consumable', 'trinket'],
      start: {
        equip: { primary: 'pistol9', melee: 'crowbar', jacket: 'hoodie', boots: 'trainers' },
        stash: ['fingerless'],
      },
    },
    bio: "Jinx kept the alarms, locks and cold-store sensors running in a Helix Ice plant for six years, right up until she worked out how many vials went into the incinerator every week to hold the price up. She left through a fire door she had wired herself, with a bag of company tools and a security pass that still opens more doors than it should. Now she sells sabotage to whoever pays, and does the Helix jobs cheap.",
    quips: {
      move: ["Mind the wires.", "Shortcut.", "Nobody touch anything."],
      shoot: ["Lights out.", "Oops. On purpose.", "Pop."],
      ko: ["Should've… read the manual…", "Ow. Bad wiring."],
      revive: ["Rebooted. Go.", "Patched you up with tape. Don't ask."],
      win: ["Helix sends its regards. Not.", "Everything's broken. Perfect."],
    },
    tags: ['saboteur', 'raccoon'],
    unlock: { kind: 'op', op: 'o11', opName: 'Hot metal', lv: 8 },
  },
  sable: {
    id: 'sable', name: 'Sable', species: 'Cat', role: 'Infiltrator', roleTag: 'Infiltrator',
    faction: 'Independent',
    blurb: 'A black alley cat who vanishes, walks round the back and puts a knife in the problem.',
    portrait: 'assets/heroes/sable.webp', thumb: 'assets/heroes/sable-64.webp',
    mood: 'heroic',
    hp: 10, ap: 4, move: 6, aim: 68, armor: 0, speed: 11,
    weapon: { name: 'Fists', dmg: [2, 3], range: 1, typ: 'melee' },
    abilities: [
      { id: 'melee', name: 'Strike', ap: 2, kind: 'melee', range: 1, melee: true, text: 'Hit with the equipped melee weapon.' },
      { id: 'shot', name: 'Shoot', ap: 2, kind: 'shot', gun: true, text: 'Fire the equipped gun (uses ammo).' },
      { id: 'hide', name: 'Shadow Step', ap: 1, kind: 'hide', cd: 4, unlock: 1, sfx: 'move',
        text: 'Melt into the dark: until she attacks or her next turn ends she is Hidden. Rivals more than 2 tiles away cannot target her and Overwatch never fires at her.' },
      { id: 'backstab', name: 'Backstab', ap: 2, kind: 'backstab', range: 1, cd: 2, dmgAdd: 2, melee: true, unlock: 1, sfx: 'maul',
        text: 'A knife in the back: +2 damage. Out of hiding or on a flanked foe it gets +25 aim and always crits.' },
      { id: 'hamstring', name: 'Hamstring', ap: 2, kind: 'hamstring', range: 1, cd: 3, bleed: 1, melee: true, unlock: 3, sfx: 'maul',
        text: 'Cut low: the target bleeds 1 HP and is Slowed (-2 Move) on their next turn.' },
      { id: 'dash', name: 'Rooftop Run', ap: 1, kind: 'dash', unlock: 5,
        text: 'Over the bins and along the wall: +2 Move this turn. Once per turn.' },
    ],
    passive: { id: 'alleyghost', name: 'Alley Ghost', text: 'After she moves 4 or more tiles in one go she has +20 Dodge until her next turn.' },
    classId: 'scout',
    gearPref: { melee: 1.5, boots: 1.3, head: 1.1 },
    template: {
      class: 'scout',
      base: { crit: 8, dodge: 4 },
      slots: ['primary', 'melee', 'head', 'jacket', 'body', 'gloves', 'boots', 'acc1', 'acc2', 'utility', 'consumable', 'trinket'],
      start: {
        equip: { melee: 'karambit', primary: 'snub', head: 'balaclava', boots: 'trainers' },
        stash: ['hoodie'],
      },
    },
    bio: "Nobody in the Neon Strip agrees on where Sable came from, and she likes it that way. She grew up on the rooftops above the clubs, lifting wallets and then ledgers and then whole safes, and now she takes contracts from fixers who need a door opened from the inside. She has no side and no crew, only a price, and an old debt to a hare nurse on Tanner Street that she pays back in favours.",
    quips: {
      move: ["You didn't see me.", "Round the back.", "Quiet now."],
      shoot: ["Surprise.", "Behind you.", "Shh."],
      ko: ["One of nine…", "Hm. Careless."],
      revive: ["Up. Before they notice.", "On your feet, quietly."],
      win: ["Easy money.", "Nobody saw a thing."],
    },
    tags: ['scout', 'melee', 'cat'],
    unlock: { kind: 'shards' },
  },
  reed: {
    id: 'reed', name: 'Reed', species: 'Otter', role: 'Fixer', roleTag: 'Fixer',
    faction: 'Independent (Ice-runner)',
    blurb: 'A canal otter who runs Ice: stims, ammo, a radio and an envelope for every problem.',
    portrait: 'assets/heroes/reed.webp', thumb: 'assets/heroes/reed-64.webp',
    mood: 'heroic',
    hp: 12, ap: 4, move: 5, aim: 62, armor: 0, speed: 9,
    weapon: { name: '9mm pistol', dmg: [2, 4], range: 7, typ: 'pistol' },
    abilities: [
      { id: 'shot', name: 'Shoot', ap: 2, kind: 'shot', gun: true, text: 'Fire the equipped gun (uses ammo).' },
      { id: 'stim', name: 'Stim Shot', ap: 1, kind: 'stim', range: 3, cd: 3, unlock: 1, sfx: 'secondwind',
        text: 'Jab an Ice-cut stimulant into a crewmate within 3: +2 HP now and +1 AP on their next turn.' },
      { id: 'resupply', name: 'Resupply', ap: 1, kind: 'resupply', range: 1, cd: 2, unlock: 1, sfx: 'collect',
        text: 'Hand a crewmate next to her 3 rounds from her stash and clear Shaken, Suppressed and Blinded.' },
      { id: 'comms', name: 'Call It In', ap: 1, kind: 'comms', radius: 6, cd: 4, unlock: 3, sfx: 'overwatch',
        text: 'Get on the radio: crew within 6 tiles get +1 Move on their next turn and are Rallied (+10 aim).' },
      { id: 'bribe', name: 'Pay Off', ap: 2, kind: 'bribe', range: 5, cd: 5, unlock: 5, sfx: 'collect',
        text: 'Wave an envelope of Ice at a rival within 5: they lower their weapon and cannot attack on their next turn (they can still move).' },
    ],
    passive: { id: 'stash', name: "Runner's Stash", text: 'Carries one extra medkit into every fight.' },
    classId: 'medic',
    gearPref: { consumable: 1.6, acc: 1.2, pistol: 1.1 },
    template: {
      class: 'medic',
      base: { crit: 3, dodge: 3 },
      slots: ['primary', 'melee', 'head', 'jacket', 'body', 'gloves', 'boots', 'acc1', 'acc2', 'utility', 'consumable', 'trinket'],
      start: {
        equip: { primary: 'pistol9', jacket: 'raincoat', consumable: 'dressings', boots: 'trainers' },
        stash: ['burner'],
      },
    },
    bio: "Reed's family has worked the canals since before the Pact, and Reed worked out young that the barges Helix never searches are the ones that carry their own Ice. She runs vials up the locks to whoever is paying, knows every fixer between the docks and the rail yard, and keeps a radio on her collar and an envelope in every pocket. Lately some of her crates go to the Thaw for nothing. She tells everyone it's good business.",
    quips: {
      move: ["Shortcut by the locks.", "Keep moving.", "I know a way."],
      shoot: ["Nothing personal.", "Business.", "Missed a payment."],
      ko: ["Tell my brother… the barge is his…", "Bad deal."],
      revive: ["Breathe. On the house.", "That one's free. Next one isn't."],
      win: ["Everyone gets paid.", "Pleasure doing business."],
    },
    tags: ['support', 'otter'],
    unlock: { kind: 'market', teeth: 150, den: 2 },
  },
};

// Rival operators used as computer opponents (same rules, darker stock portraits).
export const RIVALS = {
  hook: {
    id: 'hook', name: 'Hook', species: 'Fox', role: 'Assault',
    portrait: 'assets/fox.webp', thumb: 'assets/fox.webp',
    hp: 8, ap: 4, move: 5, aim: 58, armor: 0, speed: 7,
    weapon: { name: 'Pistol', dmg: [2, 3], range: 6, typ: 'pistol' },
    abilities: [
      { id: 'shot', name: 'Shot', ap: 2, kind: 'shot', text: '' },
      { id: 'overwatch', name: 'Overwatch', ap: 2, kind: 'overwatch', text: '' },
    ],
    classId: 'assault',
    passive: { id: 'none', name: '', text: '' },
    tags: ['pistol', 'fox'],
  },
  knack: {
    id: 'knack', name: 'Knack', species: 'Rat', role: 'Scout',
    portrait: 'assets/rat.webp', thumb: 'assets/rat.webp',
    hp: 7, ap: 5, move: 7, aim: 64, armor: 0, speed: 12,
    weapon: { name: 'Holdout', dmg: [2, 3], range: 6, typ: 'pistol' },
    abilities: [
      { id: 'shot', name: 'Shot', ap: 2, kind: 'shot', text: '' },
      { id: 'dash', name: 'Dash', ap: 1, kind: 'dash', text: '' },
    ],
    classId: 'scout',
    passive: { id: 'scurry', name: 'Scurry', text: '+1 AP.' },
    tags: ['scout', 'rat'],
  },
  slab: {
    id: 'slab', name: 'Slab', species: 'Badger', role: 'Tank',
    portrait: 'assets/badger.webp', thumb: 'assets/badger.webp',
    hp: 14, ap: 4, move: 4, aim: 58, armor: 1, speed: 5,
    weapon: { name: 'SMG', dmg: [3, 4], range: 6, typ: 'smg' },
    abilities: [
      { id: 'shot', name: 'Shot', ap: 2, kind: 'shot', text: '' },
      { id: 'fortify', name: 'Fortify', ap: 1, kind: 'fortify', text: '' },
    ],
    classId: 'tank',
    passive: { id: 'hide', name: 'Thick Hide', text: '-1 damage.' },
    tags: ['tank', 'badger'],
  },
  rill: {
    id: 'rill', name: 'Rill', species: 'Croc', role: 'Tank',
    portrait: 'assets/croc.webp', thumb: 'assets/croc.webp',
    hp: 13, ap: 4, move: 5, aim: 60, armor: 0, speed: 10,
    weapon: { name: 'Hook', dmg: [4, 6], range: 1, typ: 'melee' },
    abilities: [
      { id: 'lunge', name: 'Close In', ap: 2, kind: 'lunge', range: 3, text: '' },
      { id: 'roll', name: 'Death Roll', ap: 3, kind: 'melee', range: 1, dmg: [5, 8], text: '' },
    ],
    classId: 'tank',
    passive: { id: 'jaw', name: 'Iron Jaw', text: 'Melee ignores half cover.' },
    tags: ['melee', 'croc'],
  },
  pact: {
    id: 'pact', name: 'Pact', species: 'Snake', role: 'Medic',
    portrait: 'assets/snake.webp', thumb: 'assets/snake.webp',
    hp: 9, ap: 4, move: 5, aim: 68, armor: 0, speed: 8,
    weapon: { name: 'Dart gun', dmg: [2, 3], range: 7, typ: 'pistol' },
    abilities: [
      { id: 'venom', name: 'Venom Round', ap: 2, kind: 'venom', text: '' },
      { id: 'patch', name: 'Patch Up', ap: 2, kind: 'heal', range: 3, heal: 3, text: '' },
    ],
    classId: 'medic',
    passive: { id: 'none', name: '', text: '' },
    tags: ['support', 'snake'],
  },
  bruno: {
    id: 'bruno', name: 'Bruno', species: 'Bear', role: 'Demolitions',
    portrait: 'assets/bear.webp', thumb: 'assets/bear.webp',
    hp: 16, ap: 3, move: 3, aim: 58, armor: 1, speed: 4,
    weapon: { name: 'Drum gun', dmg: [5, 7], range: 5, typ: 'shotgun' },
    abilities: [
      { id: 'shot', name: 'Shot', ap: 3, kind: 'shot', text: '' },
      { id: 'breach', name: 'Breach Charge', ap: 2, kind: 'breach', range: 4, text: 'Lob a charge: blast damage around the tile. Cover is not damaged.' },
    ],
    classId: 'demo',
    passive: { id: 'bulk', name: 'Bulk', text: '' },
    tags: ['heavy', 'bear'],
  },
  ash: {
    id: 'ash', name: 'Ash', species: 'Wolf', role: 'Assault',
    portrait: 'assets/wolf.webp', thumb: 'assets/wolf.webp',
    hp: 11, ap: 4, move: 5, aim: 70, armor: 0, speed: 8,
    weapon: { name: 'Carbine', dmg: [3, 5], range: 8, typ: 'rifle' },
    abilities: [
      { id: 'shot', name: 'Snap Shot', ap: 2, kind: 'shot', text: '' },
      { id: 'overwatch', name: 'Overwatch', ap: 2, kind: 'overwatch', text: '' },
    ],
    classId: 'assault',
    passive: { id: 'pack', name: 'Pack Sense', text: '+15% hit with a nearby ally.' },
    tags: ['rifle', 'wolf'],
  },
  mica: {
    id: 'mica', name: 'Mica', species: 'Fox', role: 'Sniper',
    portrait: 'assets/fox.webp', thumb: 'assets/fox.webp',
    hp: 8, ap: 4, move: 4, aim: 80, armor: 0, speed: 7,
    weapon: { name: 'Long rifle', dmg: [4, 6], range: 11, typ: 'rifle' },
    abilities: [
      { id: 'aimed', name: 'Aimed Shot', ap: 3, kind: 'aimed', text: '' },
      { id: 'overwatch', name: 'Overwatch', ap: 2, kind: 'overwatch', text: '' },
    ],
    classId: 'sniper',
    passive: { id: 'cold', name: 'Cold Eye', text: '+15% crit if she has not moved.' },
    tags: ['marksman', 'fox'],
  },
};

export const defOf = (id) => HEROES[id] || RIVALS[id];
// Operators that come from crates/shards. Level, op and Market operators join another way (v0.19).
export const isShardHero = (id) => !!HEROES[id] && id !== 'rook' && !['level', 'op', 'market'].includes(HEROES[id].unlock?.kind);
// v0.19: op-unlock operators join on the first clear of their op (also catches up older saves).
export function opGrants(s) {
  const out = [];
  const cleared = (s.ops && s.ops.cleared) || {};
  for (const id of HERO_ORDER) {
    const u = HEROES[id].unlock;
    if (!u || u.kind !== 'op' || !cleared[u.op] || s.heroes.owned[id]) continue;
    s.player ||= {}; s.player.opJoined ||= {};
    if (s.player.opJoined[id]) continue;
    grantHero(s, id); s.player.opJoined[id] = 1; out.push(id);
  }
  return out;
}

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

// v0.14: operators that are planned but not in the game yet. They show greyed out on the Operators
// grid (bio, abilities and stats only) and are never in shard pools, squads or PvP copies.
export const FUTURE_HEROES = {
  stitch: {
    id: 'stitch', name: 'Stitch', species: 'Hare', role: 'Medic', classId: 'medic', future: 1,
    portrait: 'assets/heroes/stitch.webp', thumb: 'assets/heroes/stitch-64.webp',
    hp: 13, ap: 4, move: 6, aim: 62, speed: 8, armor: 0,
    weapon: { name: 'Snub revolver', dmg: [2, 4], range: 6, typ: 'pistol' },
    abilities: [
      { id: 'shot', name: 'Shoot', ap: 2, kind: 'shot', text: 'Fire the equipped gun (uses ammo).' },
      { id: 'patch', name: 'Field Dressing', ap: 2, kind: 'heal', text: 'Restore 5 HP to an ally within 3 tiles and stop their bleeding.', unlock: 1 },
      { id: 'drag', name: 'Drag to Cover', ap: 2, kind: 'dash', text: 'Pull an adjacent ally one tile into cover with you.', unlock: 3 },
      { id: 'revive', name: 'Back on Your Feet', ap: 3, kind: 'heal', text: 'Revive a knocked-out ally next to her at 40% HP. Once per fight.', unlock: 5 },
    ],
    passive: { id: 'steady', name: 'Steady Hands', text: 'Heals 1 extra HP on every heal while she has not been hit this turn.' },
    bio: "A struck-off ward nurse who runs a night clinic above a laundrette on Tanner Street. Every crew in the docks owes her for a bullet pulled or a stitch in the dark, and she keeps a ledger of who. Sooner or later she will have to decide which side of that ledger she is on.",
    coming: 'Story mode · coming in a later season',
  },
};
export const FUTURE_ORDER = Object.keys(FUTURE_HEROES);

export function unlockHint(s, id) {
  const h = HEROES[id]; if (!h) return 'Unknown';
  if (id === 'rook') return 'Given in the street lesson';
  if (h.unlock && h.unlock.kind === 'level' && !s.heroes?.owned?.[id]) return `Joins free at player level ${h.unlock.lv}`;
  if (s.heroes?.owned?.[id]) return 'In the crew';
  if (h.unlock && h.unlock.kind === 'op') return `Joins after your first clear of the op “${h.unlock.opName}” (Lv ${h.unlock.lv})`;
  if (h.unlock && h.unlock.kind === 'market') return `Recruit for ${h.unlock.teeth} Ice${h.unlock.den ? ` (Den Lv ${h.unlock.den})` : ''}`;
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
  if (u.kind === 'level') return { ok: false, reason: `Joins free at player level ${u.lv}` };
  if (u.kind === 'op') return { ok: false, reason: `Joins after the op “${u.opName}”` };
  if (u.kind === 'shards') return { ok: false, reason: 'Collect 30 shards from crates' };
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
  s.heroes.owned[id] = { xp: 0, lv: 1, stars: 1, shards: 0, perks: [], gear: null };
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
  { need: ['nile', 'marlow'], name: 'Breach Pair', text: 'Marlow\'s Breach Charge refunds 1 AP if Nile is in the fight.' },
  { need: ['vigil', 'sable'], name: 'Eyes and Knives', text: 'Sable deals +1 damage to a foe Vigil has Marked.' },
  { need: ['sledge', 'jinx'], name: 'Breach and Blind', text: 'Sledge gets +15 aim against Blinded foes.' },
];

export function synergiesFor(ids) {
  const set = new Set(ids);
  return SQUAD_SYNERGY.filter((g) => g.need.every((id) => set.has(id)));
}
