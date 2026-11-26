# New Operators Day (v0.19.0) — lore handoff

Five new operators for Fang City. This file is the handoff for the **Fang City Story** bot: names, species,
factions, bios, kits and voice lines as shipped in `js/core/heroes.js`. Kits, stats and art are final for
v0.19; names and backstories can be rewritten by Story (change `name`, `bio`, `blurb`, `quips` in
`js/core/heroes.js`; ids, portraits and saves don't depend on the name).

> **WORKING PLACEHOLDER — the buffalo.** "Sledge" and his backstory are *working* names for the buffalo
> rebel from the world bible (concept art: `fang-city-lore/art/rebel-buffalo-concept.jpg`). They are
> awaiting the Fang City Story bot. The same flag sits as a comment above his entry in `js/core/heroes.js`.

Grounded only: no magic, no seasonal tags. Hyena (Bracken Hale) and lion (Vale) were left alone as
species because the bible already uses them for named characters.

| Operator | Species | Role | Faction | How to get |
|---|---|---|---|---|
| Sledge *(placeholder)* | Buffalo | Breaker | Rebels | Joins free at player level 12 |
| Vigil | Owl | Spotter | Helix contractor | 30 shards from Ice crates, missions and bushes (pinnable; in the featured rotation) |
| Jinx | Raccoon | Saboteur | Helix defector | Joins on the first clear of op “Hot metal” (player Lv 8) |
| Sable | Cat | Infiltrator | Independent | 30 shards from Ice crates, missions and bushes (pinnable; in the featured rotation) |
| Reed | Otter | Fixer | Independent (Ice-runner) | Recruit from the Operators grid for 150 Ice (Den level 2+) |

## Sledge — Buffalo Breaker (WORKING PLACEHOLDER name + backstory)

- **Faction:** The rebels (unnamed for now)
- **One-liner:** A rebel buffalo with a sledgehammer. Knocks crews out of cover and stands over his own.
- **How to get:** Joins free at player level 12
- **Stats:** HP 28 · AP 4 · Move 3 · Aim 58 · Speed 4 · Armour 1
- **Passive — Rebel Grit:** Below half health he takes 1 less damage from every hit and cannot be Shaken, Suppressed or Blinded.
- **Species perk — Herd Wall:** Takes 1 less damage from every hit while a crewmate stands next to him.
- **Starter kit:** Sledgehammer, Sawn-off Shotgun, Leather Jacket, Steel-toe Boots (+ in the stash: Bandolier, Puffer Gilet)
- **Gear preference:** melee ×1.5, body ×1.3, shotgun ×1.15 (no sidearm slot)

**Abilities** (unlock at the higher of operator level and player level)

| Ability | AP | Cooldown | Unlocks | What it does |
|---|---|---|---|---|
| Cover Breaker | 2 | 3 | Lv 1 | Bring the hammer down on a foe next to him: +2 damage, knocks them 1 tile back out of their spot if there is room, and leaves them Exposed (their cover counts one step worse) until their turn ends. |
| Shoulder Up | 1 | 3 | Lv 1 | Plant himself beside a crewmate: until his next turn, half of every hit on that crewmate (rounded up) lands on Sledge instead. |
| Sweeping Cleave | 3 | 3 | Lv 3 | One wide swing that hits every foe standing next to him (+1 damage, rolled separately for each). |
| Rebel Yell | 1 | 5 | Lv 5 | Crew within 3 tiles shake off Shaken, Suppressed, Blinded and bleeding, and are Rallied (+10 aim) until their next turn. |

**Bio**

A dock-gang buffalo who carried Helix crates for nine years until the company cut his mother's Ice ration to make a quota. He walked into the depot the next morning with the sledgehammer from the loading bay and walked out a rebel. Bracken Hale calls him the door: when the rebels need a wall gone, a barricade held, or a crew dragged out of a raid, Sledge goes first and comes back last. He doesn't talk about the cure. He talks about Ice for everyone, and he swings like he means it.

**Voice lines**

- *move:* “Make a hole.” · “I'm coming through.” · “Stay behind the horns.”
- *shoot:* “Nothing to hide behind now.” · “Wall's gone.” · “Down.”
- *ko:* “Still… breathing…” · “Get them out first.”
- *revive:* “Up. Rebels don't kneel.” · “On your feet, comrade.”
- *win:* “Ice for everyone.” · “Tell Helix we were here.”

## Vigil — Owl Spotter

- **Faction:** Helix contractor
- **One-liner:** A barn owl marksman who paints targets for the whole crew and lights up the dark.
- **How to get:** 30 shards from Ice crates, missions and bushes (pinnable; in the featured rotation)
- **Stats:** HP 11 · AP 4 · Move 4 · Aim 76 · Speed 6
- **Passive — Spotter's Eye:** Her Marks last a turn longer, and the crew crit 10% more often against a foe she has Marked.
- **Species perk — Night Eyes:** +1 range on every gun, and her shots ignore Dodge.
- **Starter kit:** Dockside Carbine, Flat Cap, Rain Mac, Beat-up Trainers (+ in the stash: Fingerless Gloves)
- **Gear preference:** rifle ×1.4, head ×1.2, pistol ×0.7 (no sidearm slot)

**Abilities** (unlock at the higher of operator level and player level)

| Ability | AP | Cooldown | Unlocks | What it does |
|---|---|---|---|---|
| Mark Target | 1 | 2 | Lv 1 | Paint a foe she can see up to 12 tiles away: for 2 turns the whole crew gets +15 aim against them and their Dodge is ignored. |
| Pinning Shot | 2 | 2 | Lv 3 | A shot at +10 aim for half damage that pins the target down: Suppressed (-20 aim) until their turn ends. |
| Flare | 1 | 4 | Lv 5 | Pop a flare over a tile up to 8 away: every foe within 2 tiles of it is Marked and pulled out of hiding. |

**Bio**

Vigil sat in a bell tower for the whole of the Second War calling targets for a gun crew that never once saw her face. Now Helix pays her by the night to watch rooftops, and she takes their money and anyone else's. She keeps a notebook of every face she has painted for a rifle, and lately too many of them have been animals who were only slipping. She hasn't decided what to do about that yet. She just keeps writing.

**Voice lines**

- *move:* “Finding a perch.” · “Higher.” · “I see the whole board.”
- *shoot:* “Marked and gone.” · “Mind the wind.” · “One breath.”
- *ko:* “Lost… the angle…” · “Someone take the watch.”
- *revive:* “Eyes open. Back up.” · “I've got you covered.”
- *win:* “Street's clear. I'd know.” · “Write it down.”

## Jinx — Raccoon Saboteur

- **Faction:** Helix defector
- **One-liner:** An ex-Helix raccoon technician: flashbangs, comms jammers and tripwires.
- **How to get:** Joins on the first clear of op “Hot metal” (player Lv 8)
- **Stats:** HP 12 · AP 4 · Move 5 · Aim 64 · Speed 8
- **Passive — Scrap Kit:** Builds a Pipe Bomb out of junk before every fight (+1 charge).
- **Species perk — Tinkerer:** Every ability with a cooldown recharges 1 turn faster.
- **Starter kit:** Nine-mil Pistol, Crowbar, Dock Hoodie, Beat-up Trainers (+ in the stash: Fingerless Gloves)
- **Gear preference:** utility ×1.6, pistol ×1.2, gloves ×1.2 (no sidearm slot)

**Abilities** (unlock at the higher of operator level and player level)

| Ability | AP | Cooldown | Unlocks | What it does |
|---|---|---|---|---|
| Flashbang | 2 | 3 | Lv 1 | Throw a flashbang up to 5 tiles: every foe within 1 tile of it is Blinded until their turn ends (-40 aim, Overwatch dropped and cannot be set). |
| Jammer | 1 | 4 | Lv 3 | Kill their comms: foes within 5 tiles drop Overwatch and are Jammed (no abilities, only move, shoot and strike) until their turn ends. |
| Tripwire | 1 | 3 | Lv 5 | Rig an empty tile up to 3 away. The first foe to step on it takes 4 damage, stops dead and is Slowed (-2 Move) next turn. |

**Bio**

Jinx kept the alarms, locks and cold-store sensors running in a Helix Ice plant for six years, right up until she worked out how many vials went into the incinerator every week to hold the price up. She left through a fire door she had wired herself, with a bag of company tools and a security pass that still opens more doors than it should. Now she sells sabotage to whoever pays, and does the Helix jobs cheap.

**Voice lines**

- *move:* “Mind the wires.” · “Shortcut.” · “Nobody touch anything.”
- *shoot:* “Lights out.” · “Oops. On purpose.” · “Pop.”
- *ko:* “Should've… read the manual…” · “Ow. Bad wiring.”
- *revive:* “Rebooted. Go.” · “Patched you up with tape. Don't ask.”
- *win:* “Helix sends its regards. Not.” · “Everything's broken. Perfect.”

## Sable — Cat Infiltrator

- **Faction:** Independent
- **One-liner:** A black alley cat who vanishes, walks round the back and puts a knife in the problem.
- **How to get:** 30 shards from Ice crates, missions and bushes (pinnable; in the featured rotation)
- **Stats:** HP 10 · AP 4 · Move 6 · Aim 68 · Speed 11
- **Passive — Alley Ghost:** After she moves 4 or more tiles in one go she has +20 Dodge until her next turn.
- **Species perk — Cat Reflexes:** Overwatch shots at her are at -20 aim.
- **Starter kit:** Karambit, Snub Revolver, Balaclava, Beat-up Trainers (+ in the stash: Dock Hoodie)
- **Gear preference:** melee ×1.5, boots ×1.3, head ×1.1 (no sidearm slot)

**Abilities** (unlock at the higher of operator level and player level)

| Ability | AP | Cooldown | Unlocks | What it does |
|---|---|---|---|---|
| Shadow Step | 1 | 4 | Lv 1 | Melt into the dark: until she attacks or her next turn ends she is Hidden. Rivals more than 2 tiles away cannot target her and Overwatch never fires at her. |
| Backstab | 2 | 2 | Lv 1 | A knife in the back: +2 damage. Out of hiding or on a flanked foe it gets +25 aim and always crits. |
| Hamstring | 2 | 3 | Lv 3 | Cut low: the target bleeds 1 HP and is Slowed (-2 Move) on their next turn. |
| Rooftop Run | 1 | — | Lv 5 | Over the bins and along the wall: +2 Move this turn. Once per turn. |

**Bio**

Nobody in the Neon Strip agrees on where Sable came from, and she likes it that way. She grew up on the rooftops above the clubs, lifting wallets and then ledgers and then whole safes, and now she takes contracts from fixers who need a door opened from the inside. She has no side and no crew, only a price, and an old debt to a hare nurse on Tanner Street that she pays back in favours.

**Voice lines**

- *move:* “You didn't see me.” · “Round the back.” · “Quiet now.”
- *shoot:* “Surprise.” · “Behind you.” · “Shh.”
- *ko:* “One of nine…” · “Hm. Careless.”
- *revive:* “Up. Before they notice.” · “On your feet, quietly.”
- *win:* “Easy money.” · “Nobody saw a thing.”

## Reed — Otter Fixer

- **Faction:** Independent (Ice-runner)
- **One-liner:** A canal otter who runs Ice: stims, ammo, a radio and an envelope for every problem.
- **How to get:** Recruit from the Operators grid for 150 Ice (Den level 2+)
- **Stats:** HP 12 · AP 4 · Move 5 · Aim 62 · Speed 9
- **Passive — Runner's Stash:** Carries one extra medkit into every fight.
- **Species perk — Slick:** Bleeding and venom wash off her after a single tick.
- **Starter kit:** Nine-mil Pistol, Rain Mac, Bandage Roll, Beat-up Trainers (+ in the stash: Burner Phone)
- **Gear preference:** consumable ×1.6, acc ×1.2, pistol ×1.1 (no sidearm slot)

**Abilities** (unlock at the higher of operator level and player level)

| Ability | AP | Cooldown | Unlocks | What it does |
|---|---|---|---|---|
| Stim Shot | 1 | 3 | Lv 1 | Jab an Ice-cut stimulant into a crewmate within 3: +2 HP now and +1 AP on their next turn. |
| Resupply | 1 | 2 | Lv 1 | Hand a crewmate next to her 3 rounds from her stash and clear Shaken, Suppressed and Blinded. |
| Call It In | 1 | 4 | Lv 3 | Get on the radio: crew within 6 tiles get +1 Move on their next turn and are Rallied (+10 aim). |
| Pay Off | 2 | 5 | Lv 5 | Wave an envelope of Ice at a rival within 5: they lower their weapon and cannot attack on their next turn (they can still move). |

**Bio**

Reed's family has worked the canals since before the Pact, and Reed worked out young that the barges Helix never searches are the ones that carry their own Ice. She runs vials up the locks to whoever is paying, knows every fixer between the docks and the rail yard, and keeps a radio on her collar and an envelope in every pocket. Lately some of her crates go to the rebels for nothing. She tells everyone it's good business.

**Voice lines**

- *move:* “Shortcut by the locks.” · “Keep moving.” · “I know a way.”
- *shoot:* “Nothing personal.” · “Business.” · “Missed a payment.”
- *ko:* “Tell my brother… the barge is his…” · “Bad deal.”
- *revive:* “Breathe. On the house.” · “That one's free. Next one isn't.”
- *win:* “Everyone gets paid.” · “Pleasure doing business.”

## New statuses

- **Blinded** (Jinx's Flashbang): −40 aim and no overwatch until the end of their next turn. Rebel Grit shrugs it off.
- **Marked** (Vigil): +15 aim for everyone against them and Dodge is ignored; lasts 2 turn-ends (3 with Spotter's Eye).
- **Exposed** (Sledge's Cover Breaker): their cover counts one step worse until their turn ends.
- **Jammed** (Jinx): only move, shoot, strike, hunker and overwatch until their turn ends.
- **Paid off** (Reed): no attacks or overwatch on their next turn.
- **Slowed** (Tripwire, Hamstring): −2 move.
- **Hidden** (Sable): can't be targeted from more than 2 tiles away and ignores overwatch; attacking reveals her.
- **Stimmed / On the radio / Guarded:** +1 AP, +1 move, and half of every hit going to Sledge.

## Synergies

- **Eyes and Knives** (Vigil + Sable): +1 damage against a Marked foe.
- **Breach and Blind** (Sledge + Jinx): +15 aim against a Blinded foe.
