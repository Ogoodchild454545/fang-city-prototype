# Map editor and battle-map format (v0.7.0)

Every battle map in Fang City is a small JSON document, including the built-in Docklands yard.
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
  - **Ground:** Concrete, Water, Quay edge, Canopy, Office floor, Bar floor.
  - **Build:** Room, Container, Double stack, Van, Crates, Barrel (explosive), Burn barrel, Barrier,
    Fence, Lamp, Wall, Door, Counter, Shelf, Boat.
  - **Spawns:** Your spawn, Enemy spawn.
  - **Edit:** Rotate/flip, Eraser.
  - Containers and double stacks also show options for length (1–4 tiles) and colour.
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
| Rotate | Rotate/flip tool, then tap a container or van (turns it), or a wall/door (full ↔ low) | R toggles Along X / Along Y for new pieces |

- **Containers** are placed starting from the tile you tap and run *Along X* (east) or *Along Y*
  (south), depending on the toggle. A run that would leave the map or hit water is shortened to fit.
  After each container the colour moves on to the next swatch, so neighbouring runs don't all match.
  Pick a swatch to choose the colour yourself.
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
- **Copy Docklands** opens an editable copy of the stock yard.

## Playing a map

- **▶ Play** in the editor checks the map, saves it, and starts a **practice match**:
  - Your current squad fights a random enemy squad of the same size.
  - Each operator carries 8 rounds.
  - Nothing is spent or earned: no rewards, XP, trophies or ammo.
- **Loadout → Map** lets you pick any *valid* saved map for a real PvP street fight. Rewards and
  trophies work as normal. Docklands is the default.

## JSON format (v1)

```json
{
  "format": "fang-city-map",
  "version": 1,
  "id": "map-abc123",
  "name": "My yard",
  "w": 22, "h": 16,
  "ground": ["~~~=..................", "..."],
  "props":  ["......x...B...........", "..."],
  "spawn":  ["....PP............EE..", "..."],
  "objects": [
    {"k": "container", "x": 10, "y": 3, "len": 3, "dir": "E", "stack": 1, "hue": "green"},
    {"k": "van", "x": 13, "y": 7, "dir": "S", "hue": "white"},
    {"k": "boat", "x": 1, "y": 2, "hue": "tug"}
  ],
  "notes": ""
}
```

Each layer is an array of `h` strings, and each string is `w` characters long. Row 0 is the top
(north) edge and column 0 is the west edge.

**ground**

| char | tile |
| --- | --- |
| `.` | concrete yard |
| `~` | water / canal (impassable) |
| `=` | quay edge |
| `s` | workshop canopy floor |
| `o` | office floor (interior) |
| `r` | bar floor (interior) |

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

Wall, door, desk and shelf colours come from the nearest office (`o`) or bar (`r`) floor.

**spawn:** `P` is a player spawn tile and `E` is an enemy spawn tile. Units deploy on tiles sampled
from their zone using the battle seed.

**objects** (multi-tile):

| field | meaning |
| --- | --- |
| `k` | `container`, `van` or `boat` |
| `x, y` | anchor tile, the north-west end |
| `len` | container length, 1–4 tiles |
| `dir` | `E` runs along X, `S` runs along Y. Vans also use it to face. |
| `stack` | 1 = single, 2 = double stack. Both give full cover and block LoS. |
| `hue` | containers: green, rust, teal, blue, mustard, grey, red, white. Vans: white, grey. Boats: tug, work, small. |

Docklands also carries an optional `seats` block with ordered, hand-picked spawn seats. When `seats`
is present, deployment uses those seats in order instead of sampling the zone. The editor drops
`seats` when you save a copy.

Older or future versions are put through `normalizeMapJson`, which rejects unknown formats and
upgrades older versions in one place.

## Docklands

- The stock map is `js/core/maps/docklands.js`, with a readable copy at `docs/maps/docklands.json`.
  Both are generated by `node tools/convert-docklands.mjs`.
- `docklandsMap()` in `js/core/tmaps.js` is simply `mapFromJson(DOCKLANDS)`.
- A unit test checks the result tile-for-tile against a frozen copy of the old hand-written builder
  (`tests/fixtures/docklands-legacy.js`).
- The 30-fight AI simulation gives identical results before and after the switch.

## Known limits

- Containers and vans running along Y are drawn as a mirror image of the X-running art, so their
  lighting comes from the mirrored side.
- Rooms look best as rectangles. L-shaped rooms work but the floor shading is simpler.
- There is no multi-select or copy/paste yet. Large changes are made by painting.
