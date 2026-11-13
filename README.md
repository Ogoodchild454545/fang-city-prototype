# Fang City: Animal Gangs (playable prototype v0.5.9)

Dark, modern-day animal gangster game for phones, played in **landscape**. Build a free-form hideout on an
isometric dusk wasteland (clear junk, place and upgrade buildings, collect cash and Rep), train a mixed
crew of animal troops, then fight turn-based grid battles: PvE missions through the four gang districts, turf
wars, and raids on rival bases.
Plain HTML/CSS/JS ES modules, no build step.

Play: open `index.html` through any static server (`python3 -m http.server`), or the hosted GitHub Pages link.
URL flags: `?reset=1` wipes the save, `?fast=1` skips the splash and speeds up battle animations.

There is **no gang to pick**. Every player starts on the same dusk-wasteland hideout and unlocks the same
shared roster of mixed-species troops (rats, foxes, wolves, snakes, badgers, crocs, bears) as the Training Yard
and The Den level up. The four gangs — Grey Pack, Iron Claw, Swamp Syndicate and Velvet Den — are the enemy
factions you fight in Missions.


## v0.4

- Currencies: Cash, Rep (star medal), and Ice (premium). Collect bubbles show a cash wad or the Rep medal.
- Original procedural music and UI/battle SFX, with a mute toggle (starts on the first tap).
- Unique operators fight 4v4 street battles (action points, half/full cover, hit chance, flanking, overwatch). Home-base troops stay on missions and raids.
- New players start with Rook the wolf and a guided street lesson. Seven more mixed-species operators unlock with 30 shards (bush clears, mission rewards, Ice crates). Pin a target, a weekly feature, a 10-crate pity, and duplicate shards raise star level (or convert to universal shards at 5★).
- Mock shop only — no real payments.

## v0.5

- Operators earn XP from kills, survival and winning, then level up (Rookie through Kingpin) with small stat gains. Every few ranks they pick a new perk.
- Street fights open a loadout screen: pick up to four operators, then load ammo and medkits from base stock and assign Workshop gear.
- Ammo and medkits are finite. The Armoury, Clinic and Workshop are placeable, upgradeable producers with collect bubbles and storage caps (the Armoury also still upgrades troops). Before a fight each operator carries a limited load; each shot spends a round for good; unused rounds come back after the fight; there is no mid-battle refill (empty guns fall back to melee).
- High Stakes is an opt-in mode with a confirm step and triple rewards. It is not permadeath: a KO'd operator stays in the crew, but their level and perks reset and any gear they carried is taken. Normal fights have no such penalty.
- Saves are version 5. Older saves migrate and get a starting ammo / medkit stock.

## v0.5.9 (docklands readability)

- Rivals read on the dark docks: their near-black art gets a baked shadow lift plus a red team rim, so leather, fur and kit separate from the asphalt while keeping the rival look. Blue/red team discs under the feet, team-tinted HP bars (rivals' bars are red).
- Camera framing fits the 844x390 landscape view: units are kept inside a HUD-safe area (below the top bar and turn strip, above the dock). Priority is the acting unit, then its whole squad, then the nearest foe. The camera glides to each new operator. Chained shot/explosion pans no longer creep the zoom in.
- Turn-order strip: brighter portraits on a dark pill, blue rings for your crew and red for rivals, HP slivers, KO tags, and a larger gold-glow current unit. It sits in the top bar between the turn label and the timer.
- Hit feedback: HIT/CRIT/MISS callout above the head, a separate red damage number to the side (crits larger and gold), and floats follow camera zoom. Quip bubbles are bigger, team-bordered and readable when zoomed out.
- Explosions: barrels now sit beside the east and south-west vans, so one shot can chain (van → barrel → barrel) with a CHAIN ×N callout and a beat between blasts.
- Rival turns pause briefly on each hand-off so the banner and camera glide can be read. Retreat and End turn stay pinned right when there is no timer.

## v0.5.8 (battle polish)

- Battle dock: hero card (HP bar, AP pips, move/speed/ammo) plus an icon ability tray with AP-cost pips, greyed-out states when you can't afford an ability, and a tooltip. Fits 844x390 landscape without clipping.
- Fight feed: the last three events, newest first, fading out and colour-coded (hit, miss, KO, heal). The "X is up" hand-offs now show as a slide-in turn banner.
- End screen: Victory/Defeat with the squad (MVP and KO tags), a quip, counting Cash/Rep/trophy/shard tiles, and a league bar showing promotion or relegation.
- Marlow and Bruno's Breach is now a thrown **Breach Charge** (4 tiles, radius 1, 4 damage, sets off barrels and vans). Cover is never destroyed; wrecks keep their cover. Range, blast and damage previews are shown on the map.
- Lead rigs: weightier hit react, Brick braces for Hunker/Fortify, Lumen holds a steady aimed shot, Rook sweeps on Overwatch.

## The base (Hideout)
- 40x40 tile isometric map, bigger than the screen: drag to pan, pinch or mouse-wheel to zoom.
- Starts as an unstructured wasteland: dead grass, cracked concrete lots, broken streets, ruins, trees,
  bushes, rubble, scrap, tyres, car wrecks and puddles, with just a shack (The Den, level 1).
- **The Den** (HQ) level gates which buildings exist, how many of each, and their max level (2 x Den level).
- Producers fill a till (collect bubble); **Strongboxes** cap cash and **Ledger Offices** cap Rep.
- **Builders** limit concurrent builds, upgrades and clear-ups (start with 1; 2nd costs 250 Ice or the £3.99 mock pack).
- Clearing junk costs cash and time and sometimes drops Ice. The wasteland slowly grows back.
- **Training Yard** trains troop types over time (a queue, sped up by yard level, a Drill Sergeant or VIP);
  **Bunkhouses** + the Den give housing (space cap); **Armoury** upgrades a whole troop type at once and now also produces and stores ammo;
  **Clinic** makes medkits; **Workshop** makes parts for operator gear;
  **Family Club** is a placeholder for the clan system.
- **Sniper Nests**, **Scrap Cannons** and **Barricades** unlock with Den level 2-3 and are placed freely.
- Every building can be moved; upgrades show a timer bar and a visible level change (sprite tier, glow, plate).

## My Crew
- One shared roster of seven troop types, each with a grid-battle role, housing space, train cost/time and
  a type level (1–10). You unlock them by upgrading the Training Yard (Rats and Foxes at lv 1, Wolf Bruisers
  at lv 2, then Snake Medics, Badger Tanks, Croc Heavies and Bear Breachers).
- **My Crew** is a landscape army screen: bosses on the left (with a locked third slot), trained troops with
  counts and levels, a housing counter, the training queue, and a Battle button that jumps to Missions.
- Troops knocked out in a fight are lost and must be retrained; survivors come home.
- Named bosses are collectable heroes with a once-per-battle skill: **Ma Grey** (Rally Howl, Den 2) and
  **Old Scales** (Death Roll, Den 4). If knocked out they rest for 10 minutes; they are never lost.

## Missions
The four gang districts are PvE campaigns of three stages each (Grey Pack at Den 1, Iron Claw at Den 2,
Velvet Den at Den 3, Swamp Syndicate at Den 4). First clears pay more; rematches are allowed for a smaller
payout. Mission battles use the gang’s turf art as the board backdrop.

## Raids
Rival bases are generated with the same building catalogue and layout rules. `raid.js` converts a window of
any base layout into a battle grid: footprints become solid blocks, the Den/storages/defences become structure
units (defences shoot back as turrets), barricades become cover, and loot sits in the storages.
Wreck The Den to win and take everything left; storages pay out as they fall (kept even if you lose).
Stars: Den wrecked, 50% of structures wrecked, every defender down. `playerBaseLayout()` already converts the
player's own base, ready for a "rivals raid you" defence mode.

Saves are version 5. Older v1–v4 saves migrate automatically: a v2 base is kept, individual crew members
become troops of their species, and the old gang choice is dropped.

## Architecture (ready for an online backend)
```
js/core/   pure game rules, no DOM. Runs in the browser and in Node (tests), and later on a server.
  data.js       gear, species, troop types, bosses, missions, districts, jobs, shop SKUs
  buildings.js  building + obstacle catalogue, Den gating tables, cost/time/rate curves
  base.js       map generation, placement, builders, timers, clearing, production, storage caps
  raid.js       rival base generator, base layout -> battle grid conversion, loot split
  rng.js        seeded deterministic RNG stored inside the JSON state
  state.js      newGame(), versioned JSON save (v5) with v1–v4 migration, storage adapter
  economy.js    ticking, offline catch-up (finishes jobs at their own end time), boosts
  crew.js       troop training queue, housing, type upgrades, bosses, battle line-up
  battle.js     grid combat (variable size): AP, LOS, cover, crits, structures/turrets, boss skills, raid scoring
  ai.js         rival AI, one action at a time
  meta.js       daily rewards, jobs, objectives, missions, turf/raid setup, rewards, mock purchases
  progress.js   operator XP, ranks and perk picks
  loadout.js    ammo/medkit carry, Workshop gear, High Stakes commit/return
js/ui/     rendering only
  iso.js        canvas renderer for the base: pre-rendered ground, depth-sorted sprites, culling, pan/zoom, ghost
  hideout.js    base HUD, selection panel, build menu, placement, move
  crew.js       My Crew army screen, training queue, Armoury upgrades, boss hire
  missions.js   four gang-district campaigns
  battle.js     isometric DOM battle board (landscape), raid HUD, scouting preview
assets/base/   cut-out WebP building/obstacle sprites + ground textures (tools/cut_sprites.py)
assets/turf/   gang district concept art used as mission backdrops
tests/         core.test.js (node) and playthrough.py (Playwright, 844x390 landscape)
```

## Tests
`node tests/core.test.js` - placement, builders, Den gating, storage caps vs every upgrade cost, clearing,
offline, troop training and unlocks, bosses, missions, raids (turrets, loot, stars), rival layout validity,
v1 and v2 save migration, balance table.
`python3 tests/playthrough.py` - drives the real UI at 844x390 (pan, wheel + pinch zoom, place by dragging,
clear, upgrade, collect bubbles, move, builders, walls, My Crew, missions, shop, jobs, scout + raid, turf war,
offline, portrait rotate prompt, v1 migration) and saves screenshots to `screenshots/`.

All purchases are mock: nothing charges money. All names, art and UI are original.
