# Map beauty pass (v0.21)

Every battle map got a lighting and atmosphere pass. It's all drawn in canvas: original art, no new image
files, no new downloads. Nothing here touches the rules. Cover, line of sight, movement and hit chance still
come from the map tiles.

Code: `js/ui/mapfx.js` (new), hooked from `js/ui/yard.js` (ground bake, sprite cache, live layer, weather,
sky, screen grade). `js/ui/tactics.js` is unchanged.

## How it works

1. **Baked lighting.** When a map first loads, a small light map (30% of the ground bake) is built:
   - a dark ambient per map, with a gentle gradient so the back of the board is a touch brighter than the front;
   - a soft pool for every light;
   - for each light, every prop footprint near it cuts a shadow that runs away from the light. Tall walls and
     containers throw long shadows and crates throw short ones. Windows in walls let some light out.

   The map is multiplied into the ground, and the light colour is added on top. This is all done once, inside
   the existing ground bake, so it costs nothing per frame. The close-zoom detail window uses the same light map.
2. **Lit props.** Props are painted once into the sprite cache. Each sprite is now multiplied by the light at
   its tile (brighter on the side facing the strongest light) and gets a little of that light's colour, low
   down. That is also a one-off cost when the cache is built.
3. **Light sources.** These are the old ones (lamps, burn barrels, neon, lanterns, room lights) plus prop
   lights: phone boxes, bus shelters, fish stalls, fish boxes (cold), moonshine stills, machine presses
   (furnace glow), crane floodlights, warehouse door lamps, garage bulkheads, stilt-shack windows, club
   speakers and forklift headlights. Every outside door also gets a porch or bulkhead light.
4. **Live layer under the pieces** (`drawUnder`):
   - fire and lantern flicker;
   - a couple of "faulty" neons per map that buzz and drop out;
   - lights reflected in nearby water, as a broken shimmering column;
   - low ground fog on the bayou.
5. **Live layer over everything** (`drawOver`), kept faint so the pieces stay readable:
   - bloom round light heads;
   - steam from manholes, foundry pipes, presses and stills, and cold vapour off the fish boxes;
   - spot beams sweeping the club floor;
   - ambient particles: dust, embers, fireflies, dust motes, falling leaves, and moths round the lamps.
6. **Decals** (baked):
   - manhole covers;
   - zebra crossings, double yellow kerb lines and gutter grime on the streets;
   - wet-tarmac sheen on rain maps;
   - fallen leaves under estate trees and hedges;
   - cigarette ends and bottle caps;
   - rust bleed under containers and wagons;
   - metal filings and hazard chevrons in front of foundry presses;
   - duckweed, lily pads and moss on the bayou;
   - spilled drinks in the club.
7. **Graffiti.** It goes on wall faces that look out of a building (they used to get indoor dressing like
   lockers) and on the doors-end of long container runs. It uses real words only ("HELIX LIES", "WAKE UP",
   "NO MORE RATIONS", "ICE IS A LEASH", "VALE LIES", "FANG CITY", "RUN") or a fang sigil, with drips.
8. **Colour grade.** A cool tint fades in from the top and a warm tint from the bottom, with the middle of the
   board left clear. It sits in the CSS layer over the canvas alongside the vignette, so it is composited and
   never re-rasterised. The sky bake also gets a horizon glow, cloud bands, and stars and a hazy moon on the
   clear-night maps.

## Per-map looks (`LOOKS` in mapfx.js)

| Map | Mood |
| --- | --- |
| Docklands | Dusk. Sodium pools, burn barrels, teal shadows and an orange low light. Dust, a little steam. |
| Fish Wharf | Rainy night. Cold blue grade, fish-stall bulbs, ice-box vapour, reflections in the canal. |
| Neon Strip | Rainy night. Pink and cyan shop neon pools, buzzing signs, manhole steam, purple/teal grade. |
| Club Velvet | Indoor. Purple room light, sweeping spot beams with floor pools, dust motes, porch neon at the doors. |
| Gator Farm | Foggy night. Lantern pools, lit shack windows, low drifting fog, fireflies, still glow, green grade. |
| Foundry | Dusk. Furnace glow off the presses, embers, pipe steam, hazard chevrons, orange grade. |
| Rail Sidings | Dusk. Floodlights, rust bleed under the wagons, dust. |
| Back Streets | Clear night. Moonlit blue ambient, porch lights, window light, leaves, manhole steam. |
| Corner Shop | Clear night. As Back Streets, plus phone box and bus shelter light and moths round the lamps. |

Editor maps start from their theme's look and follow their own time, weather and indoor flags.

## Readability rules

- The move tiles, threat zones, overwatch hatching, cover shields and path ribbon are drawn after the ground,
  so they sit on top of the lighting and keep their colours.
- The over-layer stays faint: bloom is at most 0.22 alpha on small sprites, haze is used only on fog and indoor
  maps and is at most about 0.04, and particles are tiny.
- Units are not darkened. They stay at full brightness, so pieces pop against the darker ground.

## Performance

The per-frame work is a few dozen small sprite draws (bloom, steam, beams, reflections) and one batched path
per particle type. The expensive parts (the light map, shadows, decals and lit sprites) are baked once per map
and zoom step. See the README for the `tests/bench.py` numbers.

## v0.21.1 additions

- Light shafts: one faint additive beam sprite per street lamp and crane floodlight.
- Rain glints: up to 14 short streaks per lamp on rain maps, drawn as one batched stroke.
- Faulty neons: flagged once in `lightsOf` (`faulty`); `neonOff()` drives both the pool flicker and the bloom.
- Club mirror ball: 46 specks in one batched fill.
- Graffiti sits in the lower third of a face, clear of container brand names.
