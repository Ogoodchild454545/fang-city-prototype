# Unit scale (v0.6.2)

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
