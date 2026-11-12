# Docklands container yard — map element list

The 4v4 operator / street / tutorial battle map. Size **22×16**. Win by knocking out the whole enemy squad. The map is **flat**: stairs and container tops are scenery only, not walkable high ground. There is **no fog of war** (full view). **Cover cannot be destroyed.** Vans and barrels can be shot; they explode for area damage (friendly fire included) and leave a burnt wreck that still gives the same cover.

Camera starts zoomed to the action; pan and zoom are kept.

## Spawns

- Player: (4,4), (6,5), (4,7), (6,8) — spread across the west apron so four operators do not overlap on a tight 2×2
- Enemy: (18,4), (20,5), (18,7), (21,6) — matching spread on the east lane

Tutorial placements: Rook (6,9), Hook (13,9), crate at (12,9) for the west-cover lesson, with a clear southern flank at y=11.

## Terrain

- **Impassable canal / water** — x=0–2, all y (45 tiles).
- **Quay edge** — x=3, all y (16 tiles). Walkable lip along the water.
- **Yard concrete** — 219 tiles, walkable, no cover.
- **Workshop canopy** — (17–19, 0–1), walkable (5 tiles of shed floor; one of those cells also holds the barrel-shelf).

## Dock office (north)

Walls (full cover, block movement and LOS): (10–13,0), (10,1), (13,1), (10,2), (11,2), (13,2).

- Interiors (walkable): (11,1), (12,1).
- Desk (half cover): (11,1).
- Door (walkable): (12,2).
- Decorative stairs at (9,1) — not climbable high ground.

## Cafe (south-east)

Walls (full cover, block movement and LOS): (17–20,12), (20,13–14), (17–19,14).

- Interiors (walkable): (18,13), (19,13).
- Desk (half cover): (19,13).
- Door (walkable): (17,13).

## Workshop scenery

- Barrel-shelf at (19,1) — scenery only, not explosive.

## Moored boats (impassable water scenery)

- Tug at (1,2)
- Work boat at (1,7)
- Small boat at (1,13)

## Containers

Solid full cover, block LOS, **not climbable**.

- Teal, visual stack 2: (10–11,4), (10,5), (13–14,6), (16–17,5)
- Red, visual stack 2: (11,5), (16–17,6)
- Red, visual stack 1: (13,5), (14–15,4), (13,8)
- Teal, visual stack 1: (16,4), (14–15,8)

## Vans (explosive, full cover, two tiles, do not block LOS)

After a blast they become wrecks with the same cover.

- White: (8,6)–(9,6)
- Grey: (8,12)–(9,12)
- Grey: (19,8)–(20,8)

## Cover objects

- **Concrete barriers** (full cover): (7,3), (7,8), (7,14), (10,11)
- **Crates / pallets** (half cover): (11,7), (12,9) (tutorial), (8,10), (15,10), (12,12)
- **Explosive barrels** (half cover): (19,3), (17,7), (5,12), (11,14). Wrecks keep half cover.
- **Lamp posts** (scenery, no cover): (8,3), (16,10)

## Blast rules

- Barrel: radius 1, damage 4, then `barrelWreck` (cover 1).
- Van: radius 2, damage 5, then `wreck` / `wreck2` (cover 2).
- Chain reactions are allowed. Thick Hide / armour reduce blast damage. Cover values are unchanged after the blast.
