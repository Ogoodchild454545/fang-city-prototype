# Fang City: Animal Gangs (playable prototype v0.2)

Dark, modern-day animal gangster game for phones, played in **landscape**. Build a free-form hideout on an
isometric dusk wasteland (clear junk, place and upgrade buildings, collect cash and influence), train a crew,
then fight turn-based grid battles: turf wars for districts and raids on rival bases.
Plain HTML/CSS/JS ES modules, no build step.

Play: open `index.html` through any static server (`python3 -m http.server`), or the hosted GitHub Pages link.
URL flags: `?reset=1` wipes the save, `?fast=1` skips the splash and speeds up battle animations.

## The base (Hideout)
- 40x40 tile isometric map, bigger than the screen: drag to pan, pinch or mouse-wheel to zoom.
- Starts as an unstructured wasteland: dead grass, cracked concrete lots, broken streets, ruins, trees,
  bushes, rubble, scrap, tyres, car wrecks and puddles, with just a shack (The Den, level 1).
- **The Den** (HQ) level gates which buildings exist, how many of each, and their max level (2 x Den level).
- Producers fill a till (collect bubble); **Strongboxes** cap cash and **Ledger Offices** cap influence.
- **Builders** limit concurrent builds, upgrades and clear-ups (start with 1; 2nd costs 250 Gold Teeth or the £3.99 mock pack).
- Clearing junk costs cash and time and sometimes drops Gold Teeth. The wasteland slowly grows back.
- **Training Yard** trains crew over time (one slot per yard); **Bunkhouses** + the Den give housing (roster cap);
  **Armoury** level gates gear rarity; **Family Club** is a placeholder for the clan system.
- **Sniper Nests**, **Scrap Cannons** and **Barricades** unlock with Den level 2-3 and are placed freely.
- Every building can be moved; upgrades show a timer bar and a visible level change (sprite tier, glow, plate).

## Raids
Rival bases are generated with the same building catalogue and layout rules. `raid.js` converts a window of
any base layout into a battle grid: footprints become solid blocks, the Den/storages/defences become structure
units (defences shoot back as turrets), barricades become cover, and loot sits in the storages.
Wreck The Den to win and take everything left; storages pay out as they fall (kept even if you lose).
Stars: Den wrecked, 50% of structures wrecked, every defender down. `playerBaseLayout()` already converts the
player's own base, ready for a "rivals raid you" defence mode.

## Architecture (ready for an online backend)
```
js/core/   pure game rules, no DOM. Runs in the browser and in Node (tests), and later on a server.
  data.js       gear, species, districts, jobs, shop SKUs
  buildings.js  building + obstacle catalogue, Den gating tables, cost/time/rate curves
  base.js       map generation, placement, builders, timers, clearing, production, storage caps
  raid.js       rival base generator, base layout -> battle grid conversion, loot split
  rng.js        seeded deterministic RNG stored inside the JSON state
  state.js      newGame(), versioned JSON save (v2) with v1 migration, storage adapter
  economy.js    ticking, offline catch-up (finishes jobs at their own end time), boosts
  crew.js       recruiting with published odds + pity, training (needs yards), housing, gear
  battle.js     grid combat (variable size): AP, LOS, cover, crits, structures/turrets, raid scoring
  ai.js         rival AI, one action at a time
  meta.js       daily rewards, jobs, objectives, turf/raid setup, rewards, mock purchases
js/ui/     rendering only
  iso.js        canvas renderer for the base: pre-rendered ground, depth-sorted sprites, culling, pan/zoom, ghost
  hideout.js    base HUD, selection panel, build menu, placement, move
  battle.js     isometric DOM battle board (landscape), raid HUD, scouting preview
assets/base/   cut-out WebP building/obstacle sprites + ground textures (tools/cut_sprites.py)
tests/         core.test.js (node) and playthrough.py (Playwright, 844x390 landscape)
```

## Tests
`node tests/core.test.js` - placement, builders, Den gating, storage caps vs every upgrade cost, clearing,
offline, crew limits, raids (turrets, loot, stars), rival layout validity, v1 save migration, balance table.
`python3 tests/playthrough.py` - drives the real UI at 844x390 (pan, wheel + pinch zoom, place by dragging,
clear, upgrade, collect bubbles, move, builders, walls, crew, shop, jobs, scout + raid, turf war, offline,
portrait rotate prompt, v1 migration) and saves screenshots to `screenshots/`.

All purchases are mock: nothing charges money. All names, art and UI are original.
