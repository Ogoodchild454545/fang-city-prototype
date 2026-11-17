# Hero template (v0.9.0)

Every operator is plain data in `js/core/heroes.js`. Rook is the first hero built on the full
**template**: class, base stats, paper-doll slots, starter kit and abilities. New operators (or
rival copies) are made by copying Rook's block and changing the numbers. No code changes are needed
to add a hero, an item or a cooldown ability that uses an existing ability kind.

```js
rook: {
  id: 'rook', name: 'Rook', species: 'Wolf', role: 'Bruiser', classId: 'bruiser',
  hp: 16, ap: 4, move: 5, aim: 66, speed: 8,                    // base stats
  weapon: { name: 'Fists', dmg: [2, 3], range: 1, typ: 'melee' }, // used only with nothing equipped
  abilities: [ /* see below */ ],
  passive: { id: 'grit', name: 'Bruiser Grit', text: '…' },
  template: {
    class: 'bruiser',
    base: { crit: 5, dodge: 0 },                    // extra base stats the old hero format lacked
    slots: ['primary', 'sidearm', 'melee', 'head', 'jacket', 'body', 'gloves', 'boots',
            'acc1', 'acc2', 'utility', 'consumable', 'trinket'],
    start: {
      equip: { melee: 'tyreiron', sidearm: 'snub', jacket: 'hoodie', boots: 'trainers',
               gloves: 'tape', consumable: 'dressings' },
      stash: ['flatcap', 'gilet', 'chain', 'pipebomb'],   // given once, on a new game or migration
    },
  },
  tags: ['melee', 'wolf', 'bruiser'], unlock: { kind: 'start' },
}
```

## Classes

`CLASSES` has seven fixed classes: tank, sniper, medic, assault, demo, scout and **bruiser**.
Heroes never have rarity. Bruiser is the melee all-rounder: enough HP for the front line, decent
damage, and his own sustain.

## Stats

`statsFor(heroId, { stars, lv, perks, gear, equip })` in `js/core/items.js` is the one place stats
are added up. The character sheet and battle units (`freshUnit` in `tactics.js`) both call it, so
the sheet always matches the fight.

| Stat | Source | Effect in battle |
|---|---|---|
| HP | base + stars + level + perks + Workshop mod + items | max health |
| Armour | Workshop mod + items | every hit loses this much damage (min 1) |
| Melee dmg + / Gun dmg + | Workshop mod + items | added to melee / gun damage rolls |
| Aim | base + stars + level + perks + items | base hit chance |
| Crit | 8 base + template `base.crit` + items | crit chance (+2 dmg) |
| Dodge | template `base.dodge` + items | taken off every attacker's hit chance |
| Speed | base (+2 fox) + items | turn order |
| Move | base + perks + items | tiles per turn (1 AP each) |
| Ammo / Medkits | gun type + perks + items | how much the hero can carry into a fight |

Weapons come from equipment. The **gun** is the primary, else the sidearm, else a ranged built-in
weapon. The **melee weapon** is the melee slot, else a melee built-in weapon. A melee-template
hero with no gun cannot use gun abilities ("No gun equipped").

## Items

`ITEMS` in `js/core/items.js` holds 37 grounded street items: no magic. Each one has:

- `slot`: primary, sidearm, melee, head, jacket, body, gloves, boots, acc (two sockets), utility,
  consumable or trinket.
- `q`: quality tier. Worn, Street, Tuned or Custom. This sets the frame colour and drop weight.
- stat fields from the table above.
- `wpn: { name, dmg, range, typ }` for weapons.
- `charges` for throwables. The Pipe Bomb gives a one-off breach-style throw.

The shared stash is `state.stash = { itemId: count }`. Each hero's slots are
`state.heroes.owned[id].equip = { slot: itemId }`.

Items are obtained from:

- Battle wins: 30–45% chance. The street lesson always gives Brass Knuckles.
- Missions: a first clear always drops gear; repeat clears have a 35% chance.
- Ice crates: a street crate has a 35% chance; a vault crate always drops Street quality or better.
- Workshop crafting in the character screen: 10 parts for a random item.

## Abilities

Each ability is `{ id, name, kind, ap, cd?, unlock?, range?, aim?, dmgAdd?, bleed?, heal?, radius?, melee?, gun?, text }`.

- `unlock` is the hero level needed. XP comes from fights; perk picks happen at levels 3, 5, 7 and 10.
- `cd` is the cooldown in the unit's own turns. It counts down at the start of each of their turns.
- `melee: true` uses the melee weapon. `gun: true` needs a gun.

Rook's set:

| Ability | AP | Cooldown | Unlock | Effect |
|---|---|---|---|---|
| Strike | 2 | – | – | Hit with the melee weapon (Tyre Iron 4–6, +1 from Knuckle Tape) |
| Sidearm | 2 | – | – | Fire the gun (Snub Revolver 2–4, range 6, uses ammo) |
| Pounce | 2 | 3 | Lv 1 | Leap next to a foe up to 4 tiles away (overwatch can't catch the leap), then strike at +10 aim |
| Second Wind | 1 | 5 | Lv 1 | Heal 35% of max HP and clear bleed and venom |
| Maul | 3 | 2 | Lv 3 | Melee hit at +2 damage; the target bleeds 1 HP a turn for 2 turns |
| Howl | 1 | 4 | Lv 5 | Foes within 5 tiles are Shaken (−15 aim); Rook and allies in range are Rallied (+10 aim) until their turn ends |

- **Passive, Bruiser Grit:** every melee hit heals Rook 1 HP.
- **Species perk, Pack Sense (Wolf):** +15% hit chance when an ally is next to him or the target.

## Adding a hero

1. Copy Rook's block and give it a new `id`, name, art, stats, abilities and `template.start`.
2. Add the id to `HERO_ORDER`, and to `RIGS` / `FITS` in `js/ui/rig.js` if it has a rig.
3. New ability *kinds* need a branch in `apply()` (tactics core), an AI score in `think()`, an icon in
   `ICONS` (tactics UI) and, ideally, a sound in `audio.js`. Variants of existing kinds (another
   `melee: true` hit with different `dmgAdd`/`bleed`/`cd`) need no code.

## Second hero from the template: Anvil (v0.12)

Anvil (Rhino, `classId: 'tank'`) is Rook's block with new numbers: HP 26, Move 3, Speed 4, Aim 60,
`template.base.armor: 1` (template armour now adds into `statsFor`). He reuses existing kinds for
Gore Charge (`pounce`) and Horn Slam (`maul`) and adds two new kinds: `brace` (+armour until his next
turn) and `taunt` (foes in radius get -25 aim at anyone else; the AI avoids other targets). Passive
`bulwark` cuts 1 damage from hits on adjacent allies. `unlock: { kind: 'level', lv: 10 }` grants him
in `grantsFor` at player level 10; level-unlock heroes are kept out of the shard pools.

## Figurine art (v0.13 trial)
In the default **Figurines** unit style each hero is a painted miniature on a round base. To give a new hero
bespoke miniature art, generate a full-body 3/4 "painted 32mm resin miniature" on plain white with **no base**,
cut it out to a transparent PNG about 760 px tall (`assets/actors/<id>-fig.png`), and add an entry to `FIGS` in
`js/ui/actors.js` with `origin` (feet point), `gunTip`, `head`, `imageFacing` (-1 if the art faces left) and `h`
(height multiplier). Without an entry the hero's classic stamp is stood on the base automatically.
