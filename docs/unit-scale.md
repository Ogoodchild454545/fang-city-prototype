# Unit scale (v0.6.2, retuned in v0.6.3)

Feedback: the map's buildings are about the right size, but the creatures are far too big. Buildings and props stay as they are; only the units change.

## Measurements (world px at zoom 1, before the change)

| Thing | Height |
|---|---|
| Single container (drawn squat, 0.88 tile deep) | 21.5 |
| Same container at true 2.6 m proportions | ~31 |
| Door lintel (rooms) | 31 |
| Room back wall | 40 |
| Double container stack | 45 |
| **Rook (v0.6.1)** | **78** |

So in v0.6.1 a wolf was about 3.6 single containers tall, or about 7 m in world terms.

Target: a 1.8 m person is about 0.7 of a 2.6 m container, which is about 0.7 of a door. That works out at about 21 px.

## Candidates tested

We rendered Rook, Brick, Lumen, Vesper and Pip in front of the green container run, idle / walk / shoot, at zoom 1.0 and 1.45 (dpr 3). We tried four sizes as a fraction of the old one:

- **1.0** (78 px): giants, much taller than the containers.
- **0.36** (28 px): still looks oversized next to doors.
- **0.28** (22 px): right against the props, and faces, guns and team colour still read.
- **0.21** (16 px): faces turn into mush, and the walk cycle becomes a flicker.

Images:
- `screenshots/118-unit-scale-compare-z1.0.png`
- `screenshots/119-unit-scale-compare-z1.45.png`
- `screenshots/120-unit-scale-final-close.png` (final sizes)
- `screenshots/121-unit-scale-rim-grounding.png`

## Chosen scale: per-species world height

| Species | Height (px) | Who |
|---|---|---|
| Wolf / Fox / Snake | 21 | Rook, Lumen, Vesper... |
| Badger | 22 | |
| Croc | 24 | Nile |
| Bear | 25 | Brick, Marlow |
| Rat | 16 | Pip |

A unit is now about a door's height minus the head-room, about half a room wall, and about 0.68 of a true-proportion container.

`actors.js` (`SPECIES_H`) controls this. You can tweak it live with `window.__setUnitScale(k)`.

## Keeping small sprites readable and animated

The research behind this is standard small-sprite and HD-2D practice. You can't shrink a big painted sprite with one bilinear pass: it shimmers and loses its silhouette. The tricks below keep the sprites readable at small sizes:

1. **Pre-downscaled parts (mipmaps).** Every cut-out part keeps a chain of halved copies made with high-quality smoothing. Each frame draws from the smallest level that is at least 1.15× the on-screen size. This stops aliasing and shimmer while limbs rotate.
2. **Bigger head and weapon.** Heads are drawn ×1.14 and weapons ×1.1, a slight chibi push, so faces and silhouettes still read at about 25 css px.
3. **Team rim on every unit.** A 1–2 px team-coloured rim (blue for us, red for them) separates dark clothing from the dark asphalt, so legs and feet read as standing on the ground.
4. **Animation stays in rig space.** Pose offsets (the hip bob) now scale with the sprite. Before, they were in absolute pixels, which made small units jitter and hover. Contact shadow, muzzle flash, hit flash and ability glow also scale with unit height.
5. **UI scaled to the unit.** These are now smaller and sit lower:
   - team ring: 10×4.4 z
   - HP bar: 17×2.6 z, 9 z above the head
   - ammo badge
6. **Tap target bigger than the sprite.** A tap hits a unit if it lands on its tile or inside a body box (±14 world px, height plus 12), so small units are still easy to select on a phone.
7. **Camera.** The default fit zoom is now clamped to 1.2–1.55 (it was 0.74–1.45), so units are at least about 25 css px tall at 844×390. Pinch zoom still goes further out or in.

## Remaining issues
- At full zoom-out (pinch), faces become unreadable. Silhouette, ring and rim still identify the unit.
- Speech bubbles, damage numbers and the hit-chance label are still sized for the old units and can overlap when the squad is bunched up.
- The rim shadow adds some draw cost per unit. That's fine on GPUs, but noticeable in headless software rendering.

## v0.6.3 retune (units were overshot)

v0.6.2 made the units too small: explosive barrels and crate stacks stood almost as tall as a wolf, and the rings, bars and badges swamped the bodies. We re-checked against real-world rules of thumb:

| Thing | Real | Rule vs a 1.8 m wolf | v0.6.2 | v0.6.3 |
|---|---|---|---|---|
| Explosive barrel | 0.9 m | hip/waist (~0.5x) | 15 px (0.71x) | **12.5 px (0.46x)** |
| Crate stack on pallet | ~1.2 m | chest (~0.65x) | 15.4 px (0.73x) | **18 px (0.67x)** |
| Door lintel | 2.1 m | ~1.15x | 31 (1.48x) | 31 (**1.15x**) |
| Room wall | ~2.6 m+ | ~1.4x | 40 | 40 (1.48x) |
| Single container | 2.6 m | ~1.4x | 21.5 | 21.5 (0.8x); **38 (1.4x) from v0.6.4**, see occlusion.md |

The door, room walls, barrel and crate all agree on about 14.5 px per metre, which puts a 1.8 m wolf at **27 px**. New species heights, with the same ratios as before:

| Species | px |
|---|---|
| Wolf / Fox / Snake | 27 |
| Badger | 28 |
| Croc | 31 |
| Bear | 32 |
| Rat (Pip) | 20 |

Props: barrels are 12.5 px tall (rx 6.2), down from 15. Crate stacks go up from 13 to 15.5 px plus the pallet, and sack stacks up from 14 to 16. Buildings, walls, doors and containers are unchanged.

**Known compromise:** single containers are deliberately drawn squat at 21.5 px (that's the look Oliver likes), so a wolf stands a little taller than a one-high box. A one-high box is 0.8x a wolf, not the 1.4x of a real container; a two-high stack (45 px) is 1.7x. Making single boxes about 38 px would fix the ratio but changes the container look, so it's left for a decision.

### Overlays sized to the units
- **Team ring:** about the size of the footprint (8 x 3.5 z), with a 0.75 z line (1.3 z for the acting unit) and a fainter fill.
- **HP bar:** 12 x 1.8 z, 8 z above the head. The ammo count is a tiny chip at the bar's right end, and the AP pips (r 1.5 z) sit just above the bar.
- **Hit-chance tag:**
  - 7.5 z Oswald, with a 0.7x shield/flank badge and a 4.8 z cover word.
  - The breakdown is in a 5.6 z font.
  - Tags are laid out after all units: one that would cover another unit's HP bar or another tag moves up, with a thin leader line back to its unit.
- **Speech bubbles:** 5.8 z, with a minimum of 9 CSS px. They are queued and placed nearest-first, and step upward past each other, HP bars and tags, again with a leader line.
- **Damage numbers:** 10 / 11.5 / 13 z. Numbers that land on the same spot within 0.5 s stack instead of overprinting. HIT/MISS/CRIT callouts are 9 / 11 z.
- Hit sparks, tracers, damage numbers and callouts are positioned from the target's actual height, not a fixed 40 px.

Images:
- `screenshots/126-v063-scale-vs-barrel-crate-container.png` (before/after close-up)
- `screenshots/127-v063-battle-default.png`
- `screenshots/128-v063-combat-labels.png`
- `screenshots/129-v063-combat-bubbles.png`
