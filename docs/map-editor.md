# Map editor and battle-map format (v0.8.0)

Every battle map in Fang City is a small JSON document, including the nine ready-made maps.
Maps you build in the in-game editor go through the same loader (`mapFromJson` in
`js/core/mapfmt.js`) as Docklands, so a custom map behaves exactly like the stock one: cover, hit
chance, line of sight, explosive barrels, the container cutaway and x-ray all apply unchanged.

## Opening the editor

- **Operators** screen → **Map editor**
- **Loadout** (before a PvP fight) → **Edit maps**
- After a practice match → **Back to editor**

The editor is fullscreen and laid out for an 844×390 landscape phone. It also works with a mouse
and keyboard on desktop.

## Screen layout

- **Top bar:** Maps menu, map name, size (Small 16×12 / Medium 22×16 / Large 28×20), undo and redo,
  the direction toggle (**Along X / Along Y**), Grid/3D view, Save, ▶ Play and close.
- **Left palette:**
  - **Location:** the location picker (Docklands, Velvet Den downtown, Swamp Syndicate bayou,
    Iron Claw industrial, Grey Pack estate), plus time of day (Dusk / Night) and weather (Clear /
    Rain / Fog). Changing the location repaints the old base ground with the new one, and switches
    the lighting, sky, backdrop and perimeter. Nothing you placed is removed.
  - **Search props…** filters the palette as you type. **This location / All** chooses between
    the current location's pack (plus shared basics) and every prop in the catalogue. Props from
    other locations are shown slightly dimmed.
  - **Ground:** the ground types for this location (e.g. bayou: concrete, water, grass, mud,
    boardwalk, gravel, shack planks).
  - **Build:** Room (pick a style: Office, Bar, Club, Shop, House, Shack, Works), Wall, Door.
  - **One group per catalogue category:** Buildings & walls, Cover, Vehicles, Explosives, Street,
    Nature, Industry, Furniture, Water.
  - **Spawns:** Your spawn, Enemy spawn.
  - **Edit:** Rotate/flip, Eraser.
  - The selected tool shows its options above the palette: container length and colour, the
    prop's colour variants, and which way a rotatable prop faces.
- **Canvas:**
  - **Grid view** is a flat top-down grid. It is the quickest way to paint.
  - **3D view** uses the real battle renderer, and you can paint in it too.
  - Bottom left: the status pill (✓ ready / ⚠ warnings / ✕ errors). Tap it to see the list.

### Controls

| Action | Touch | Desktop |
| --- | --- | --- |
| Paint, place or erase | tap; drag for ground, props, spawns and eraser | click / drag |
| Room | drag a rectangle | drag |
| Pan | two-finger drag | right- or middle-drag |
| Zoom | pinch, or the + / − buttons | mouse wheel, or + / − |
| Undo / redo | ↶ ↷ | Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z) |
| Save | Save | Ctrl+S |
| Rotate | Rotate/flip tool, then tap any rotatable prop (container, van, car, shopfront, wagon…) to turn it, or a wall/door (full ↔ low) | R toggles Along X / Along Y for new pieces |

- **Containers** are placed starting from the tile you tap and run *Along X* (east) or *Along Y*
  (south), depending on the toggle. A run that would leave the map or hit water is shortened to fit.
  After each container the colour moves on to the next swatch, so neighbouring runs don't all match.
  Pick a swatch to choose the colour yourself.
- **Two-tile props** (van, parked car, shopfront, warehouse front, stilt shack, beached boat, press,
  wagon, conveyor, garage) show a two-tile ghost before you place them. Single-tile props can be
  dragged to paint a row.
- **Water rules** come from the catalogue: boats only go on water, stilt shacks go on land or
  water, and everything else stays on land. Painting water over a land prop removes it.
- **Room** builds full back walls and low "cut-away" front walls around a floor, with one door in
  the front wall. You can then edit walls and doors one tile at a time.
- **Eraser** removes, in this order, the object, the prop, or the spawn mark on a tile. Ground is
  left alone; paint Concrete over it to reset it. Placing something on a tile clears what was there.

## Validation

Validation runs on every edit. **Play** is blocked until all errors are fixed. Warnings are only
advisory.

Errors:
- Each spawn zone needs at least 4 tiles (`MIN_SPAWNS`).
- Spawn tiles can't be on water or on a solid prop.
- The two spawn zones must be connected: a flood fill from the player zone has to reach every enemy
  spawn tile.

Warnings:
- Walkable tiles that are sealed off and can never be reached.
- Cover is lopsided. Each tile counts toward the half it is nearer to (by spawn centroid), and the
  warning fires when the smaller half has less than 60% of the larger. Half cover counts 1 and full
  cover counts 2.
- Very little cover (fewer than 6 cover tiles).
- The spawn zones are fewer than 6 tiles apart.

## Saving, export and import

- Maps are saved in `localStorage` under `fangcity.maps.v1`. This is separate from the game save, so
  resetting a save never deletes your maps. The helpers are in `js/core/custommaps.js`.
- **Maps → Export JSON** downloads `<name>.json` and also shows the text so you can copy it.
- **Import file** and **Paste JSON** load a map into the editor. If its id clashes with a saved map or Docklands, it gets a fresh id so nothing is overwritten.
- **Maps → Ready-made maps** lists every built-in map. **Copy & edit** opens an editable copy and
  **Play** starts a practice match on it. Built-ins themselves are never overwritten.

## Playing a map

- **▶ Play** in the editor checks the map, saves it, and starts a **practice match**:
  - Your current squad fights a random enemy squad of the same size.
  - Each operator carries 8 rounds.
  - Nothing is spent or earned: no rewards, XP, trophies or ammo.
- **Loadout → Map** lets you pick a ready-made map (grouped by location) or any *valid* saved map
  for a real PvP street fight. Rewards and trophies work as normal. Docklands is the default.

## JSON format (v2)

```json
{
  "format": "fang-city-map",
  "version": 2,
  "id": "map-abc123",
  "name": "My yard",
  "w": 22, "h": 16,
  "theme": "velvet",
  "env": {"time": "night", "weather": "rain"},
  "ground": ["~~~=..................", "..."],
  "props":  ["......x...B...........", "..."],
  "spawn":  ["....PP............EE..", "..."],
  "objects": [
    {"k": "container", "x": 10, "y": 3, "len": 3, "dir": "E", "stack": 1, "hue": "green"},
    {"k": "van", "x": 13, "y": 7, "dir": "S", "hue": "white"},
    {"k": "boat", "x": 1, "y": 2, "hue": "tug"},
    {"k": "sedan", "x": 5, "y": 9, "dir": "E", "hue": "taxi"},
    {"k": "reeds", "x": 8, "y": 3, "hue": ""}
  ],
  "notes": ""
}
```

Each layer is an array of `h` strings, and each string is `w` characters long. Row 0 is the top
(north) edge and column 0 is the west edge.

**theme** is the location id: `docklands`, `velvet`, `bayou`, `ironclaw` or `estate`. It sets the
base ground colours, lights, sky, backdrop (canal and warehouses, city skyline, cypress trees,
factory chimneys or terraced rooftops) and the perimeter (chain-link fence or none).
**env** is `time` (`dusk` | `night`) and `weather` (`clear` | `rain` | `fog`). Both are visual only.

**ground** (from `GROUND` in `js/core/catalog.js`; any ground can be used in any location, the
palette just shows each location's own set)

| char | tile | char | tile |
| --- | --- | --- | --- |
| `.` | concrete yard | `t` | rail track |
| `~` | water / canal (impassable) | `c` | catwalk grating |
| `=` | quay edge | `f` | factory floor |
| `s` | workshop canopy | `e` | gravel / dirt |
| `o` | office floor (interior) | `k` | club floor (interior) |
| `r` | bar floor (interior) | `x` | shop tiles (interior) |
| `a` | asphalt road | `h` | house floor (interior) |
| `p` | pavement | `w` | shack planks (interior) |
| `g` | grass | `i` | works floor (interior) |
| `m` | mud | `b` | boardwalk (walkable, over water) |

All ground is flat and walkable except water.

**props** (single tile; cover 1 = half, 2 = full)

| char | prop | cover |
| --- | --- | --- |
| `x` | crates | half |
| `b` | explosive barrel | half (explodes) |
| `f` | burn barrel | half |
| `B` | concrete barrier | full |
| `l` | lamp post | none, walkable |
| `n` | fence | none, blocks movement |
| `W` / `w` | wall (full height / low cut-away) | full, blocks LoS |
| `D` / `d` | door (full / low) | walkable |
| `k` | desk / counter | half |
| `h` | shelf | half |
| `p` | workshop rack | none, walkable |

Wall, door, desk and shelf styles come from the nearest interior floor: office, bar, club, shop,
house (brick), shack (planks) or works.

**spawn:** `P` is a player spawn tile and `E` is an enemy spawn tile. Units deploy on tiles sampled
from their zone using the battle seed.

**objects** (multi-tile):

| field | meaning |
| --- | --- |
| `k` | `container`, `van`, `boat`, or any catalogue prop id without a layer char (see below) |
| `x, y` | anchor tile, the north-west end |
| `len` | container length, 1–4 tiles |
| `dir` | `E` runs along X, `S` runs along Y. Vans also use it to face. |
| `stack` | 1 = single, 2 = double stack. Both give full cover and block LoS. |
| `hue` | the variant: containers green, rust, teal, blue, mustard, grey, red, white; vans white, grey; boats tug, work, small; other props see `variants` in the catalogue (empty string if none) |

Docklands also carries an optional `seats` block with ordered, hand-picked spawn seats. When `seats`
is present, deployment uses those seats in order instead of sampling the zone. The editor drops
`seats` when you save a copy.

Older or future versions are put through `normalizeMapJson`, which rejects unknown formats and
upgrades older versions in one place.

## Prop catalogue

`js/core/catalog.js` defines every prop once. The battle rules (`js/core/tactics.js`), the map
loader, the renderer (`js/ui/yard.js` and `js/ui/props.js`) and the editor palette all read it.

| field | meaning |
| --- | --- |
| `id`, `name` | key used in map JSON, display name |
| `themes` | locations whose palette shows it (`all` = shared basics) |
| `cat` | palette category |
| `size` | footprint: 1 or 2 tiles (2-tile props run along `dir`) |
| `h` | drawn height in px at the battle scale (wolf 27 px, container 38 px) |
| `rot` | can be turned (`dir` E/S) |
| `cover` | 0 none, 1 half, 2 full |
| `los` | blocks line of sight |
| `block` | blocks movement (0 for lamps, reeds, lantern and neon-sign posts) |
| `explosive`, `blast`, `dmg`, `wreck` | can be shot to explode; blast radius, damage, and the wreck it leaves (the wreck keeps the cover) |
| `water` | `land`, `water` or `any` |
| `variants` | colour/style variants (`hue`) |
| `ch` / `chLow` | legacy one-character code in the `props` layer (crates, barrels, walls…) |
| `cut`, `light`, `link` | tall enough to cut away; light pool it casts; joins up with neighbours (fences, hedges) |

Locations and their packs (shared basics such as crates, barrels, barriers, lamps, walls and doors
are in every palette):

| location | own props |
| --- | --- |
| Docklands | containers, van, boat, crane leg, forklift, warehouse front, fish stall, fish boxes, bollard, chain fence, workshop rack, crab traps, rail wagon, gas tank, steel beams, beached boat, parked car |
| Velvet Den downtown | neon shopfront, parked car (explosive), van, dumpster, wheelie bins, club booth, speaker stack, neon sign post, phone box, planter, queue rope, bench, bus shelter, bollard, fence |
| Swamp Syndicate bayou | stilt shack, beached boat, boat, gator-farm fence, reeds, cypress stump, moonshine still (explosive), crab traps, tyre pile, lantern post, fish stall, fish boxes, scrap, tree |
| Iron Claw industrial | machine press, pipe run, scrap pile, rail wagon, gas tank (explosive), steel beams, conveyor, workbench, containers, crane leg, forklift, warehouse front, dumpster, skip, tyres, parked car, van |
| Grey Pack estate | lock-up garage, garden fence, hedge, tree, park bench, bus shelter, postbox, skip, wheelie bins, phone box, planter, neon shopfront, parked car, van, tyres, scrap, workbench |

All art is procedural canvas drawing in the same iso style as the Docklands set, so cutaway (tall
props in front of a unit drop to a stub), fading and x-ray silhouettes work for every prop.

## Ready-made maps

The built-ins are in `js/core/maps/` (listed in `index.js`), with readable copies in `docs/maps/`.
All except Docklands are generated by `node tools/build-maps.mjs` with a small builder
(`tools/mapkit.mjs`). The builder mirrors most cover through the map centre so both sides get
the same cover. It also refuses overlapping props, props on the wrong ground, and solid props on
spawn tiles.

| id | name | location | notes |
| --- | --- | --- | --- |
| `docklands` | Docklands yard | Docklands | the original yard |
| `fish_wharf` | Fish Market Wharf | Docklands | night, rain; stalls, forklifts, crane legs, gas tanks |
| `neon_strip` | Neon Strip | Velvet Den | wet street, shopfronts both sides, parked cars |
| `club_velvet` | Club Velvet | Velvet Den | fight through a club with six doors, booths and speaker stacks |
| `gator_farm` | Gator Farm | Bayou | water channels, boardwalk crossings, fenced pen, stills |
| `foundry` | Foundry Floor | Iron Claw | presses, conveyors, pipe runs, two works offices |
| `rail_sidings` | Rail Sidings | Iron Claw | three tracks of wagons with gaps, scrap, signal shed |
| `back_streets` | Back Streets | Grey Pack estate | terraces with cut-away rooms, gardens, garages, alley |
| `corner_shop` | Corner Shop & Park | Grey Pack estate | shop and house, road with cars, park with trees and hedges |

The maps follow the house rules: flat ground, no destructible cover, full view, spawn zones on
opposite sides, and explosives (barrels, cars, gas tanks, stills) placed to reward flanking.
The tests run three AI-vs-AI fights on each one. With 40 seeds per map the fights end in 4–15
rounds, with no deadlocks.

## Docklands

- The stock map is `js/core/maps/docklands.js`, with a readable copy at `docs/maps/docklands.json`.
  Both are generated by `node tools/convert-docklands.mjs`.
- `docklandsMap()` in `js/core/tmaps.js` is simply `mapFromJson(DOCKLANDS)`.
- A unit test checks the result tile-for-tile against a frozen copy of the old hand-written builder
  (`tests/fixtures/docklands-legacy.js`).
- The 30-fight AI simulation gives identical results before and after the switch.

## Known limits

- Props are at most 2 tiles. Bigger buildings are made from rooms, or from 2-tile fronts placed
  side by side.
- Weather and night are visual only and do not change hit chance.
- Changing the location keeps any props from the old location. Use **This location** to see what
  belongs.
- Containers and vans running along Y are drawn as a mirror image of the X-running art, so their
  lighting comes from the mirrored side.
- Rooms look best as rectangles. L-shaped rooms work but the floor shading is simpler.
- There is no multi-select or copy/paste yet. Large changes are made by painting.
