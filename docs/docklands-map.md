# Docklands container yard — map element list

The 4v4 operator / street / tutorial battle map. Size **22×16**. Win by knocking out the whole enemy squad. The map is **flat**: container tops are scenery only, not walkable high ground. There is **no fog of war** (full view). **Cover cannot be destroyed.** Vans and barrels can be shot; they explode for area damage (friendly fire included) and leave a burnt wreck that still gives the same cover.

Camera starts zoomed to the action; pan and zoom are kept.

## Spawns

- Player: (4,4), (6,5), (4,7), (6,8) — spread across the west apron so four operators do not overlap on a tight 2×2
- Enemy: (18,4), (20,5), (18,7), (21,6) — matching spread on the east lane

Tutorial placements: Rook (6,9), Hook (13,9), crate at (12,9) for the west-cover lesson, with a clear southern flank at y=11.

## Terrain

- **Impassable canal / water** — x=0–2, all y (45 tiles).
- **Quay edge** — x=3, all y (16 tiles). Walkable lip along the water.
- **Yard concrete** — walkable, no cover. Drawn as wet night-time concrete slabs (cracks, puddles, oil, paint, drains, steel road plates); the tile grid only shows faintly and in the movement range.
- **Workshop canopy** — (17–19, 0–1), walkable (5 tiles of shed floor; one of those cells also holds the barrel-shelf).

## Site office (north) — container-panel room, near walls cut away

Walls (full cover, block movement and LOS): back (10–14,0), left (10,1). Near walls drawn cut-away (still full cover, still block LOS): (10,2), (11,2), (13,2), (14,1), (14,2).

- Interiors (walkable, steel tread-plate floor): (11–13,1).
- Desk (half cover): (11,1). Shelving (half cover): (13,1).
- Door (walkable): (12,2).
- Back walls carry lockers, a window, posters and a fridge (art only).

## Container bar (south-east) — container-panel room, near walls cut away

Walls (full cover, block movement and LOS): back (16–20,11), left (16,12), (16,14). Near walls drawn cut-away: (16,15), (20,12–15), (17–19,15).

- Interiors (walkable, chequered floor, neon): (17–19,12–14).
- Bar counter (half cover): (18,12). Shelving (half cover): (19,14).
- Door (walkable): (16,13).

## Chain-link fence

- (15,2), (16,2): blocks movement only — no cover, does not block LOS (see-through).
- Border fences around the yard and bollards on the quay are art only.

## Workshop scenery

- Barrel-shelf at (19,1) — scenery only, not explosive.

## Moored boats (impassable water scenery)

- Tug at (1,2)
- Work boat at (1,7)
- Small boat at (1,13)

## Containers

Solid full cover, block LOS, **not climbable**. Each run is drawn as one long corrugated container (doors on the east end, brand and number on the side).

- Teal, stack 2: (10–11,4), (16–17,5)
- Rust, stack 2: (10–11,5), (16–17,6)
- Mustard, stack 2: (13–14,6)
- Grey, stack 1: (13,5)
- Blue, stack 1: (14–16,4)
- Green, stack 1: (13–15,8)

## Vans (explosive, full cover, two tiles, do not block LOS)

After a blast they become wrecks with the same cover.

- White: (8,6)–(9,6)
- Grey: (8,12)–(9,12)
- Grey: (19,8)–(20,8)

## Cover objects

- **Concrete barriers** (full cover): (7,3), (7,8), (7,14), (10,11)
- **Crates / pallets / tyre stacks** (half cover): (11,7), (12,9) (tutorial), (8,10), (15,10), (12,12)
- **Explosive barrels** (half cover): (19,3), (17,7), (17,8), (5,12), (10,12), (11,14). Wrecks keep half cover.
- **Burn barrels** (half cover, not explosive, lit): (9,14), (15,12)
- **Lamp posts** (scenery, no cover): (8,3), (16,10), (3,5), (3,11)

## Blast rules

- Barrel: radius 1, damage 4, then `barrelWreck` (cover 1).
- Van: radius 2, damage 5, then `wreck` / `wreck2` (cover 2).
- Chain reactions are allowed. Thick Hide / armour reduce blast damage. Cover values are unchanged after the blast.
