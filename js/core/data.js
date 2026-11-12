// Static game definitions. Pure data: safe to share between client and a future server.

export const GAME = { title: 'FANG CITY', subtitle: 'Animal Gangs', version: '0.2.0' };

export const SPECIES = {
  wolf:   { name: 'Wolf',      gang: 'grey',  img: 'assets/wolf.jpg',   base: { muscle: 55, aim: 60, nerve: 62 }, trait: 'pack',  traitName: 'Pack Tactics', traitDesc: '+15% damage when next to an ally' },
  rat:    { name: 'Rat',       gang: 'grey',  img: 'assets/rat.jpg',    base: { muscle: 35, aim: 55, nerve: 45 }, trait: 'scurry', traitName: 'Scurry', traitDesc: '+1 AP every turn' },
  badger: { name: 'Badger',    gang: 'iron',  img: 'assets/badger.jpg', base: { muscle: 72, aim: 40, nerve: 66 }, trait: 'hide',  traitName: 'Thick Hide', traitDesc: 'Takes 1 less damage from every hit' },
  bear:   { name: 'Bear',      gang: 'iron',  img: 'assets/bear.jpg',   base: { muscle: 82, aim: 30, nerve: 50 }, trait: 'bulk',  traitName: 'Bulk', traitDesc: '+30% max health' },
  fox:    { name: 'Fox',       gang: 'velvet',img: 'assets/fox.jpg',    base: { muscle: 42, aim: 72, nerve: 64 }, trait: 'cold',  traitName: 'Cold Blood', traitDesc: '+15% critical chance' },
  croc:   { name: 'Crocodile', gang: 'swamp', img: 'assets/croc.jpg',   base: { muscle: 78, aim: 42, nerve: 58 }, trait: 'roll',  traitName: 'Death Roll', traitDesc: '+25% melee damage' },
  snake:  { name: 'Snake',     gang: 'swamp', img: 'assets/snake.jpg',  base: { muscle: 40, aim: 62, nerve: 60 }, trait: 'venom', traitName: 'Venom', traitDesc: 'Hits poison the target (3 dmg for 2 turns)' },
};

export const GANGS = {
  grey:   { name: 'The Grey Pack',      species: ['wolf', 'rat'],    colour: '#c9302c', blurb: 'Wolves and rats. Numbers, coordination, no mercy.' },
  iron:   { name: 'The Iron Claw',      species: ['badger', 'bear'], colour: '#b08d57', blurb: 'Badgers and bears. Muscle that never backs down.' },
  swamp:  { name: 'The Swamp Syndicate',species: ['croc', 'snake'],  colour: '#4f8a3c', blurb: 'Crocodiles and snakes. Patient, venomous, old money.' },
  velvet: { name: 'The Velvet Den',     species: ['fox'],            colour: '#d9792b', blurb: 'Foxes. Precision hits and clean getaways.' },
};

export const ROLES = {
  enforcer: { name: 'Enforcer', icon: '✊', move: 3, desc: 'Melee bruiser. Closes the gap and hits hard.', statBias: { muscle: 12, aim: -8, nerve: 4 }, defaultWeapon: 'bat' },
  shooter:  { name: 'Shooter',  icon: '🔫', move: 3, desc: 'Mid-range gunner. The backbone of any crew.', statBias: { muscle: -2, aim: 8, nerve: 2 }, defaultWeapon: 'pistol9' },
  marksman: { name: 'Marksman', icon: '🎯', move: 2, desc: 'Long range. Deadly from cover, fragile up close.', statBias: { muscle: -8, aim: 14, nerve: 4 }, defaultWeapon: 'rifle' },
  doc:      { name: 'Street Doc', icon: '✚', move: 3, desc: 'Patches up the crew mid-fight. Light sidearm.', statBias: { muscle: -6, aim: 0, nerve: 8 }, defaultWeapon: 'pocket' },
};

export const RARITY = {
  common:    { name: 'Common',    mult: 1.0,  maxLevel: 15, colour: '#8a8a8a' },
  rare:      { name: 'Rare',      mult: 1.12, maxLevel: 25, colour: '#3d7fd9' },
  epic:      { name: 'Epic',      mult: 1.26, maxLevel: 35, colour: '#9b4dd9' },
  legendary: { name: 'Legendary', mult: 1.42, maxLevel: 50, colour: '#e0a526' },
};

// Gear. type: weapon | armour | gadget. Weapons: kind melee|ranged.
export const GEAR = {
  // melee
  knife:     { slot: 'weapon', name: 'Switchblade',     kind: 'melee',  dmg: 9,  range: 1, acc: 0,   price: 0,      rarity: 'common' },
  bat:       { slot: 'weapon', name: 'Spiked Bat',      kind: 'melee',  dmg: 13, range: 1, acc: 0,   price: 400,    rarity: 'common' },
  machete:   { slot: 'weapon', name: 'Machete',         kind: 'melee',  dmg: 17, range: 1, acc: 0,   price: 6000,   rarity: 'rare' },
  sledge:    { slot: 'weapon', name: 'Sledgehammer',    kind: 'melee',  dmg: 24, range: 1, acc: -5,  price: 90000,  rarity: 'epic' },
  // ranged
  pocket:    { slot: 'weapon', name: 'Pocket Pistol',   kind: 'ranged', dmg: 8,  range: 4, acc: 5,   price: 0,      rarity: 'common' },
  pistol9:   { slot: 'weapon', name: '9mm Pistol',      kind: 'ranged', dmg: 10,  range: 5, acc: 0,   price: 600,    rarity: 'common' },
  sawnoff:   { slot: 'weapon', name: 'Sawn-off .45',    kind: 'ranged', dmg: 15, range: 3, acc: 5,   price: 8000,   rarity: 'rare' },
  smg:       { slot: 'weapon', name: 'Compact SMG',     kind: 'ranged', dmg: 12, range: 5, acc: -5,  price: 30000,  rarity: 'rare' },
  rifle:     { slot: 'weapon', name: 'Hunting Rifle',   kind: 'ranged', dmg: 14, range: 7, acc: 5,   price: 2500,   rarity: 'common' },
  marksman:  { slot: 'weapon', name: 'Scoped Rifle',    kind: 'ranged', dmg: 20, range: 8, acc: 10,  price: 120000, rarity: 'epic' },
  // armour
  hoodie:    { slot: 'armour', name: 'Street Hoodie',   def: 0, price: 0,      rarity: 'common' },
  leather:   { slot: 'armour', name: 'Leather Jacket',  def: 1, price: 900,    rarity: 'common' },
  ironhide:  { slot: 'armour', name: 'Ironhide Jacket', def: 2, price: 15000,  rarity: 'rare' },
  kevlar:    { slot: 'armour', name: 'Kevlar Vest',     def: 3, price: 150000, rarity: 'epic' },
  // gadgets (one use per battle)
  medkit:    { slot: 'gadget', name: 'Med Kit',         effect: 'heal',  power: 15, price: 700,   rarity: 'common', desc: 'Heal self or adjacent ally for 15' },
  adrenaline:{ slot: 'gadget', name: 'Adrenaline Shot', effect: 'ap',    power: 2,  price: 2000,  rarity: 'rare',   desc: '+2 AP right now' },
  spikes:    { slot: 'gadget', name: 'Throwing Spikes', effect: 'throw', power: 9,  range: 3, price: 1200, rarity: 'common', desc: '9 damage up to 3 tiles away, ignores cover' },
  smoke:     { slot: 'gadget', name: 'Smoke Pellet',    effect: 'smoke', power: 0,  price: 3000,  rarity: 'rare',   desc: 'Become untargetable from range until your next turn' },
};

// Rackets: idle businesses. Cost grows geometrically, income linearly per level (AdVenture Capitalist pattern).
export const RACKETS = [
  { id: 'stall',   name: 'Knock-off Market Stall', icon: '⌚', baseCost: 10,     growth: 1.07, income: 1,       req: null },
  { id: 'carwash', name: 'Hand Car Wash',          icon: '🚿', baseCost: 150,    growth: 1.08, income: 8,       req: null },
  { id: 'phone',   name: 'Phone Unlock Shop',      icon: '📱', baseCost: 1800,   growth: 1.09, income: 55,      req: null },
  { id: 'pawn',    name: 'Pawn & Cash Converter',  icon: '💍', baseCost: 22000,  growth: 1.10, income: 380,     req: 'rail' },
  { id: 'chop',    name: 'Chop Shop',              icon: '🔧', baseCost: 260000, growth: 1.11, income: 2600,    req: 'rail' },
  { id: 'club',    name: 'Neon Nightclub',         icon: '🍸', baseCost: 3.2e6,  growth: 1.12, income: 19000,   req: 'neon' },
  { id: 'casino',  name: 'Backroom Casino',        icon: '🎲', baseCost: 4e7,    growth: 1.13, income: 140000,  req: 'market' },
  { id: 'crypto',  name: 'Crypto Laundromat',      icon: '💻', baseCost: 5.5e8,  growth: 1.14, income: 1.05e6,  req: 'uptown' },
  { id: 'docks',   name: 'Container Docks',        icon: '🚢', baseCost: 8e9,    growth: 1.15, income: 8e6,     req: 'docks' },
];
export const RACKET_MILESTONES = [10, 25, 50, 100, 150, 200]; // each doubles that racket's income
export const TILL_SECONDS = 120;      // an unmanaged racket's till holds 2 minutes of income
export const LIEUTENANT_COST_MULT = 40; // lieutenant (manager) costs 40x the racket's base cost

// Turf districts on the city map. Capturing one boosts income and unlocks rackets.
export const DISTRICTS = [
  { id: 'sprawl', name: 'The Sprawl',      x: 22, y: 78, tier: 0, owner: 'player', rival: null,   bonus: 0,    influencePerHour: 0,  desc: 'Your home turf. Tower blocks and corner shops.' },
  { id: 'rail',   name: 'Rail Yards',      x: 62, y: 74, tier: 1, rival: 'grey',   bonus: 0.10, influencePerHour: 6,  desc: 'Freight, scrap and stolen cars.' },
  { id: 'neon',   name: 'Neon Strip',      x: 40, y: 52, tier: 2, rival: 'velvet', bonus: 0.15, influencePerHour: 10, desc: 'Clubs, bars and late-night money.' },
  { id: 'market', name: 'Night Market',    x: 76, y: 44, tier: 3, rival: 'iron',   bonus: 0.20, influencePerHour: 14, desc: 'Cash-only stalls and backroom tables.' },
  { id: 'uptown', name: 'Glass Uptown',    x: 30, y: 24, tier: 4, rival: 'velvet', bonus: 0.25, influencePerHour: 20, desc: 'Towers, penthouses and dirty money made clean.' },
  { id: 'docks',  name: 'Swamp Docks',     x: 70, y: 16, tier: 5, rival: 'swamp',  bonus: 0.35, influencePerHour: 30, desc: 'The Croc\'s harbour. Everything comes in through here.' },
];

export const REP_TIERS = [
  { min: 0,    name: 'Street Rat' },
  { min: 100,  name: 'Hustler' },
  { min: 300,  name: 'Soldier' },
  { min: 700,  name: 'Capo' },
  { min: 1300, name: 'Underboss' },
  { min: 2200, name: 'Kingpin' },
];

export const RECRUIT = {
  street:  { name: 'Street Recruit', currency: 'cash', odds: [['common', 72], ['rare', 24], ['epic', 4]] },
  premium: { name: 'Gold Teeth Recruit', currency: 'teeth', cost: 100, odds: [['rare', 62], ['epic', 31], ['legendary', 7]], pity: 30 },
};
export const ROSTER_BASE = 10;
export const SQUAD_SIZE = 4;

export const DAILY_REWARDS = [
  { cash: 500 }, { teeth: 20 }, { influence: 25 }, { gear: 'medkit' }, { teeth: 40 }, { influence: 60 }, { ticket: 1, teeth: 60 },
];

export const JOB_TEMPLATES = [
  { id: 'collect', text: 'Collect from your buildings 20 times', goal: 20, stat: 'collects', reward: { teeth: 10 } },
  { id: 'clear',   text: 'Clear 5 pieces of junk from your land', goal: 5, stat: 'cleared', reward: { teeth: 10 } },
  { id: 'win',     text: 'Win 2 street fights',               goal: 2,  stat: 'wins',     reward: { influence: 30 } },
  { id: 'train',   text: 'Train a crew member',               goal: 1,  stat: 'trains',   reward: { teeth: 10 } },
  { id: 'upgrade', text: 'Start 3 building upgrades',          goal: 3,  stat: 'upgrades', reward: { cash: 1500 } },
  { id: 'taps',    text: 'Shake down the street 100 times',   goal: 100, stat: 'taps',    reward: { influence: 15 } },
];

// Mock storefront. Prices in GBP; nothing is charged in the prototype.
export const SHOP = {
  teeth: [
    { id: 't1', teeth: 80,    price: '£0.99' },
    { id: 't2', teeth: 500,   price: '£4.99', tag: 'Popular' },
    { id: 't3', teeth: 1100,  price: '£9.99', tag: '+10%' },
    { id: 't4', teeth: 2400,  price: '£19.99', tag: '+20%' },
    { id: 't5', teeth: 6500,  price: '£49.99', tag: '+30%' },
    { id: 't6', teeth: 14000, price: '£99.99', tag: 'Best value' },
  ],
  offers: [
    { id: 'starter', name: 'Starter Crate', price: '£2.99', once: true, desc: '500 Gold Teeth, an Epic Fox marksman and a Kevlar Vest. One per player.', grant: { teeth: 500, member: { species: 'fox', role: 'marksman', rarity: 'epic' }, gear: 'kevlar' } },
    { id: 'builder', name: 'Second Builder', price: '£3.99', once: true, desc: 'A second builder for your base: two upgrades or clear-ups at once. Permanent. (Also buyable for 250 Gold Teeth.)', grant: { builder: 1 } },
    { id: 'vip',     name: 'Made Member (monthly)', price: '£4.99 / month', desc: '50 Gold Teeth daily, offline earnings up to 12h, all buildings auto-collect, one extra training slot, gold name badge.', grant: { vip: 30 } },
    { id: 'pass',    name: 'Street Pass (season)', price: '£7.99', desc: 'Premium reward track for this 30-day season: exclusive Neon Rain skin, 1,000+ Gold Teeth, recruit tickets.', grant: { pass: true } },
    { id: 'bench',   name: 'Extra Training Slot', price: '£2.99', once: true, desc: 'Train one more crew member at once (needs a Training Yard). Permanent.', grant: { bench: 1 } },
    { id: 'noads',   name: 'No Ads', price: '£3.99', once: true, desc: 'Removes interstitial ads. Reward ads stay optional and still pay out.', grant: { noads: true } },
  ],
  cosmetics: [
    { id: 'skin_neon',  name: 'Neon Rain crew skin', price: '£4.99', desc: 'Glowing red trim on every jacket. Pure cosmetic.' },
    { id: 'skin_gold',  name: 'Gold Fang boss skin', price: '£7.99', desc: 'Gold teeth, white suit, cigar smoke. Pure cosmetic.' },
    { id: 'emote_pack', name: 'Taunt pack', price: '£1.99', desc: 'Six battle taunts. Pure cosmetic.' },
  ],
};

export const NAMES = {
  first: ['Grimsbite', 'Knuckles', 'Two-Tone', 'Mange', 'Slick', 'Rook', 'Dex', 'Kaz', 'Tank', 'Ghost', 'Rizzo', 'Shiv', 'Moth', 'Brick', 'Scar', 'Jinx', 'Vex', 'Flint', 'Sully', 'Ash', 'Dutch', 'Nails', 'Smoke', 'Hex', 'Crow', 'Patch', 'Bones', 'Razor', 'Gutter', 'Lucky'],
  rivalTags: ['SilverFang', 'NightHowl', 'GutterKing', 'VelvetPaw', 'IronJaw', 'SwampLord', 'RatKing', 'ColdSnout', 'BigTooth', 'ScarTail', 'NeonClaw', 'DockRat'],
};
