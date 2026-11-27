# Painted props (v0.22)

Docklands draws its props from painted WebP sprites instead of canvas shapes. Gameplay data is untouched:
tile footprints, `propHeight` (cover), line of sight, explosive flags and wreck rules all come from the map
as before. Only the drawing changes.

## How it works

- `js/ui/propart.js` holds `SETS[mapId]`. Each sprite entry has:
  - `fp`: the code prop's footprint in tile units. The sprite is scaled to that footprint's screen width
    (`kw`) and its bottom is set on the footprint's front corner (`dy` nudges it).
  - optional `lights` (headlight positions as fractions of the sprite) or `embers` for live glows.
- `ensure(m)` is called from `drawYardLive`. It starts loading the set the first time the map is drawn and
  bumps a version number when every file has arrived. That number is part of the sprite-cache key, so the
  cached props repaint once with the art.
- `yard.js` `paintProp()` asks `artMap(t)` whether the tile belongs to the map that has art loaded, then
  `paintArt()` picks the sprite. It returns false to fall back to the code drawing (unknown prop, a bar
  counter, or a tall prop while it is cut away).
- The cached sprite is still lit by `mapfx.lightSprite`, so painted props pick up the map's light pools.
- Vehicles: `vehicleArt()` (grey: box truck or panel van; white: Luton van). Wrecks use `truck-wreck`.
  Headlights are drawn live over the cached sprite (two additive glows and a ground beam per van).
- Containers keep their code shape, names and cutaway, with the painted steel texture multiplied onto the
  long faces.

## Art pipeline

1. Generate each prop as a render on a flat magenta (#FF00FF) background, in the iso camera, with no text.
   Long props run upper-left to lower-right (the map's +x axis) with the front at the lower right.
2. Add it to `S` in `tools/cut_props.py` (source hash prefix, output width) and run
   `python3 tools/cut_props.py`. This keys out the backdrop and its purple cast shadows and despills the
   edges. Use `FIX` to blank any small lettering.
3. Add the entry to the map's set in `propart.js` and tune `kw`/`dy` against `tests/prop_shots.py`.

## Rolling out to another map

Add `SETS.<map_id>` with that map's props (reusing Docklands sprites where they fit, such as drums, crates,
tyres, barriers and lamps) and extend `artName()` for any new decor ids. Then run `tests/v022.py`.
