# Fang City: Animal Gangs (playable prototype v0.9.1)

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

## v0.9.1 (hero-only crew, tougher Rook, theme mockups)

- **My Crew is for hero operators only.** New games start with just Rook and no troops. The Crew tab shows the operator list plus a big showcase for the selected operator (portrait, XP, key stats, weapons, armour, ability unlocks, "Gear & abilities" and Street lesson / Docklands fight buttons). Troop training, the training queue, housing and the Armoury upgrades tab are hidden (`TROOPS_UI = false` in `js/ui/crew.js`); the troop code and data stay dormant so hiring can come back from the base later.
- **Troop modes lock gracefully.** Gang missions, raids and turf wars show a "Troop hiring at the base is coming soon" note and won't start without troops. Older saves keep their troops and can still play them.
- **Objectives follow Rook.** Hideout objectives that asked you to train troops, raid, take turf or hire a boss now track the street lesson, equipping gear, Docklands wins, Rook's level and trophies.
- **Tougher Rook portrait:** scarred, heavier brawler in a battered leather jacket with a tyre iron over his shoulder (same outfit as his battle rig).
- **Optional colour themes (not live):** `css/themes.css` adds Neon Noir (`neon`), Rusted Dockyard (`rust`), Graphic Novel (`novel`) and Gangster Luxe (`luxe`) via CSS variables. They do nothing unless `<html data-theme="…">` is set; the game still ships the original dark theme.

## v0.9.0 (Rook the Bruiser, inventory and wolf abilities)

- **One starter, the same for everyone.** A new game's crew is just **Rook**, a wolf **Bruiser**. My Crew shows him alone in the left column; there are no bosses there and no locked placeholders. The Operators screen lists only operators you own, plus a Recruit card for shard progress. Other operators still unlock with shards.
- **Rook is a Bruiser / Fighter.** He is a melee all-rounder: 16 HP base, Tyre Iron 4–6 plus a Snub Revolver backup, and Bruiser Grit (every melee hit heals 1 HP).
- **Character sheet.** Tap Rook in My Crew or Operators to open it:
  - a paper doll with 13 slots: primary, sidearm, melee, head, jacket, body armour, gloves, boots, two accessories, utility, consumable and charm
  - a stash grid with slot filters
  - item cards that compare against what is equipped
  - a live stat panel with ▲/▼ diffs
  - tap to equip; drag and drop works on desktop
- **37 street items** in four quality tiers (Worn, Street, Tuned, Custom); no magic. Gear stats apply in battle: HP, armour, melee and gun damage, aim, crit, dodge, speed, move, ammo and medkit carry, plus a Pipe Bomb throw.
- **Where gear comes from:** fights, missions, Ice crates, and Workshop crafting (10 parts).
- **Wolf abilities** with cooldowns and level unlocks, each with an ability-bar button, animation, sound and callouts:
  - Pounce
  - Second Wind
  - Maul (bleed)
  - Howl (Shaken / Rallied)
- **Street lesson** is Rook alone against Hook. It is rewritten for melee: walk, Sidearm, then Pounce and Strike.
- **Data-driven hero template.** See [docs/hero-template.md](docs/hero-template.md).
- **Saves are version 6.** v5 saves keep every unlocked operator. Rook gets his starter kit and stash, and a Workshop mod that no longer fits his class goes back to stock.
- **High Stakes:** a KO also loses any equipped gear above Worn quality.

## v0.8.0 (locations and prop catalogue)

- **Five locations**, each with its own ground, walls, lighting, weather, backdrop and prop pack:
  - **Docklands:** canal, containers, crane legs, forklifts, warehouse fronts, fish market stalls.
  - **Velvet Den downtown:** neon shopfronts, a club interior, parked cars that explode, dumpsters, bins and phone boxes.
  - **Swamp Syndicate bayou:** black water, boardwalks, mud, reeds, stilt shacks, a gator-farm fence, moonshine stills and a rusty boat.
  - **Iron Claw industrial:** factory floor, catwalk grating, rail track and wagons, machine presses, pipe runs, scrap and gas tanks.
  - **Grey Pack estate:** terraced houses as cut-away rooms, lock-up garages, garden fences and hedges, a corner shop and a park.
- **Shared prop catalogue** (`js/core/catalog.js`): one entry per prop with its name, location tags, category, footprint, height, rotation, cover, line of sight, movement blocking, explosive blast and variants. The battle rules, the renderer and the editor palette all read it. There are 55 placeable props and 20 ground types.
- **Nine ready-made maps**, picked from the Loadout map list (grouped by location) or copied into the editor:
  - Docklands yard and Fish Market Wharf
  - Neon Strip and Club Velvet
  - Gator Farm
  - Foundry Floor and Rail Sidings
  - Back Streets and Corner Shop & Park
- **Editor:**
  - location picker, time of day (dusk/night) and weather (clear/rain/fog)
  - palette grouped by category, with search and a This location / All toggle
  - colour variants for props, and every room style
  - undo/redo, rotate and validation work as before
- The map format is now **v2** (it adds `theme` and `env`). v1 maps and saved maps load unchanged as Docklands.
- The canal and its far-bank warehouses only show on maps that actually have water on the west edge.
- An AI operator with an empty gun now walks the real path to melee range instead of standing on overwatch. This fixes a rare stalemate when both sides ran dry behind a fence.

## v0.7.0 (map editor)

- An in-game map editor, opened from Operators → **Map editor** or Loadout → **Edit maps**. It runs fullscreen at 844×390 and also works on desktop.
- Paint the ground (concrete, water/canal, quay edge, canopy, office and bar floors). Place and rotate single and double containers (1–4 long, 8 colours), vans, crates, explosive and burn barrels, barriers, fences, lamps, walls, doors, counters, shelves and boats. Drag out a Room to get walls and a door automatically.
- Paint player and enemy spawn zones. The editor has an eraser, undo/redo, a map name and three sizes, and you can switch between a top-down grid and a live 3D preview.
- Live validation:
  - errors: spawns too small, spawns on solid tiles, or the two sides not connected
  - warnings: sealed-off areas, lopsided cover, too little cover, spawns too close
- Maps save to localStorage and can be exported or imported as JSON. **Play** starts a practice match with nothing spent or earned. Valid saved maps can be picked for PvP in the Loadout.
- New versioned JSON map format with one string per row for each layer. Docklands is now stored in this format and loads through the same path; a test checks it tile-for-tile against the old builder. See [docs/map-editor.md](docs/map-editor.md).

## v0.6.4 (taller containers, never lose a unit)

- Single containers are now 38 px (1.4x a wolf) and double stacks 77 px. Walls, rooms and the rest are unchanged.
- Units behind tall props stay visible (adapted from the mafia game's cutaway, see `docs/occlusion.md`). Containers in front of the acting or selected unit, its target or your finger drop to a knee-high stub. Other tall props covering a unit fade. Anyone still hidden shows as a blue or red silhouette on top. HP bars and badges are drawn above everything.
- Gameplay (cover, line of sight, hit chance) is unchanged.

## v0.6.3 (unit scale retune)

- Units are back up to 27 px for a wolf or fox, with the same species ratios: Bear 32, Croc 31, Badger 28, Pip 20. That's 1.8 m against the doors and walls. Explosive barrels are smaller (12.5 px, hip height) and crate stacks a little taller (chest height). Buildings and containers are unchanged.
- The rings are slimmer and the size of the footprint. HP bars, the ammo chip, AP pips, hit-chance tags, speech bubbles, damage numbers and callouts are all scaled to the units. Bubbles and hit-chance tags move up instead of overlapping when units are bunched.

## v0.6.2 (unit scale)

- The creatures are now in proportion with the buildings. A wolf or fox stands about 21 px, where it used to be 78 (about 0.7 of a door or container). Bears and crocs are a little bigger and Pip is smaller. See `docs/unit-scale.md`.
- Small-sprite readability: mipmapped part sprites, a slightly larger head and weapon, a team-coloured rim on every unit, and a smaller ring, HP bar and ammo badge. Taps hit the tile or the unit's body box. The battle camera starts a little closer.

## v0.6.1

- Base/city tutorial tips no longer appear over a battle. A tip that would show (or was cut short) while a fight is open waits and shows once you are back at base.
- Brighter site office (lighter panels and floor, stronger ceiling light) and bulkhead wall lights on the back walls of both rooms.

## v0.6.0 (docklands rebuilt as a real place)

- The battle map no longer looks like a board of blocks. The ground is baked once into a textured night-time yard: wet concrete slabs with joints, cracks, puddles reflecting the dusk, oil, tyre marks, painted bay lines and stencils, drains, steel road plates, blood and litter. The tile grid is barely visible; it shows in the movement range and on hover.
- Containers are drawn as whole corrugated runs with rust, dents, corner castings, locking-bar doors and brand/number markings. Stack-2 runs are two boxes.
- The site office and the bar are container-panel rooms: back walls full height with lockers, windows, a fridge, shelves and neon; the near walls are cut away so you see inside.
- New props: chain-link fences (a short gameplay fence blocks movement only), border fences, tyre stacks, wrapped pallets, burn barrels with live fire, shelving, quay bollards, proper vans with cabs and headlights, tugs on the canal. Background: a gantry crane with blinking lights, stacked boxes and far-bank warehouses.
- Lighting: soft cast shadows and contact shadows under every prop, lamp, fire and room light pools, a shimmering canal, a vignette.
- Tall props (containers, full-height walls, shelves) fade when one of your units, a rival, or the hovered tile is just behind them.
- Static props are cached as sprites so the richer map stays fast.

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
- **My Crew** is a landscape army screen: your operators on the left (tap one for the character sheet), trained troops with
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

Saves are version 6. Older v1–v5 saves migrate automatically: a v2 base is kept, individual crew members
become troops of their species, and the old gang choice is dropped.

## Architecture (ready for an online backend)
```
js/core/   pure game rules, no DOM. Runs in the browser and in Node (tests), and later on a server.
  data.js       gear, species, troop types, bosses, missions, districts, jobs, shop SKUs
  buildings.js  building + obstacle catalogue, Den gating tables, cost/time/rate curves
  base.js       map generation, placement, builders, timers, clearing, production, storage caps
  raid.js       rival base generator, base layout -> battle grid conversion, loot split
  rng.js        seeded deterministic RNG stored inside the JSON state
  state.js      newGame(), versioned JSON save (v6) with v1–v5 migration, storage adapter
  economy.js    ticking, offline catch-up (finishes jobs at their own end time), boosts
  crew.js       troop training queue, housing, type upgrades, bosses, battle line-up
  battle.js     grid combat (variable size): AP, LOS, cover, crits, structures/turrets, boss skills, raid scoring
  ai.js         rival AI, one action at a time
  meta.js       daily rewards, jobs, objectives, missions, turf/raid setup, rewards, mock purchases
  progress.js   operator XP, ranks and perk picks
  loadout.js    ammo/medkit carry, Workshop gear, High Stakes commit/return
  items.js      paper-doll slots, item catalogue, stash, equip/unequip, statsFor(), loot rolls
js/ui/     rendering only
  iso.js        canvas renderer for the base: pre-rendered ground, depth-sorted sprites, culling, pan/zoom, ghost
  hideout.js    base HUD, selection panel, build menu, placement, move
  crew.js       My Crew army screen (operator column), training queue, Armoury upgrades
  character.js  operator character sheet: paper doll, stash, stat diff, abilities
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
