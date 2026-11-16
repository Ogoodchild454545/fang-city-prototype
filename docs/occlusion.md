# Seeing units behind tall props (v0.6.4)

Single containers are now 38 px tall, about 1.4x a 27 px wolf (2.6 m against 1.8 m). Double stacks are 76.8 px. Boxes that tall would hide whole squads, so three visual layers keep every standing unit in view. We adapted them from the mafia game's v0.7 cutaway (`/workspace/mafia/pathA/mafia_A.html`, `CUT` / `stepCut` / `drawCut`, the building fade and the x-ray pass). That file was read only, not changed.

They're implemented in `js/ui/tactics.js` (`occlusionPass`, `drawXray`) and `js/ui/yard.js` (`CONT_H`, `CUT`, and the cut branch of `drawContainer`).

1. **Cutaway.** A cut container drops to a knee-high stub: 0.3 of its height, at most 12 px. It shows a dark sliced-open top, a lit rim, and a dashed ghost of the full box, so you still know it's there. The whole run is cut together. A container is cut when it covers any of these:
   - the acting or selected unit
   - a unit walking its path
   - both shooter and target during a shot (for 1.6 s)
   - the hovered unit
   - the hovered tile (your finger)

   Like the mafia version, the cut is held for 700 ms after the trigger leaves and eases in and out over 150 ms. Fully cut boxes come from the sprite cache; only the 150 ms drop is painted live.
2. **Fade.** Any other tall prop that covers a standing unit fades to 0.4 alpha, eased at about 70 ms. This covers uncut containers, full walls, doors, shelves and vans. Lamp posts are ignored.
3. **X-ray.** A unit that is still more than 30% covered by something drawn after it is redrawn on top as a silhouette in its team colour (blue or red) at 0.62 alpha, with the contact shadow skipped. Its HP bar, AP pips, ammo chip and overwatch eye are now drawn after all props, so they're never hidden.

**Coverage test.** For a prop on (px, py) of height H and a figure on (fx, fy):
- `dd = (px+py) - (fx+fy)` must be > 0 (the prop is in front).
- `lat = |(px-py) - (fx-fy)|` must be ≤ 1.2 (screen columns overlap).
- `rise = H + 14.5*(1 - min(1, lat)) - dd*14.5`: how far the prop's top rises above the figure's feet. It covers the figure if `rise` > 4 px.

**Rules are untouched.** Cover, line of sight, movement and hit chance all come from the map tiles (`js/core/tmaps.js`), not the drawn heights. The 30-fight AI sim gives identical results before and after: 30/30, the same round counts.

Screenshots:
- `screenshots/130-v064-cutaway-container.png`
- `screenshots/131-v064-xray-silhouettes.png`
- `screenshots/132-v064-wolf-vs-taller-container.png`
- `screenshots/133-v064-battle-default.png`
