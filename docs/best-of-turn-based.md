# Best of turn-based tactics, for a 3–5 minute mobile op

Written 22 Nov 2026 for Fang City. The question for each idea: does it help someone play a short 2 v 2 to 4 v 4
op on a phone in landscape (844×390), with one thumb, in a few minutes, and understand why they won or lost?

Sources read for this: Subset Games on Into the Breach UI ("sacrifice cool ideas for the sake of clarity every
time", Game Developer), the "perfect information" write-ups on Into the Breach / Slay the Spire, Firaxis on
Midnight Suns (GDC 2023, Game Developer), XCOM's hit-chance breakdown ("More info"), and the general
preview-then-commit / undo pattern used by mobile board-game ports (Battle of the Bulge design guide).

## What each game does best

| Game | Best idea | Fit for Fang City ops |
|---|---|---|
| **XCOM 2** | Blue/yellow move range (one move vs dash), shield icons for half/full cover on the destination tile, red "flanked" warning, hit % with a full modifier list, overwatch | **High.** We already have cover, flanking, overwatch and hit %. Missing: a clear destination preview with path, cost and "who can shoot me there". |
| **Into the Breach** | Perfect information: every enemy shows exactly what it will do; tiny boards; animated tooltips; one-turn reset | **High for clarity, low for full determinism.** Show enemy threat (who can reach / shoot a tile) and what a rival will do on its turn. Keep dice: our fantasy is gangsters, not chess. |
| **Marvel's Midnight Suns** | Abilities that always land (cards), big readable "this will happen" previews, environment kills, free reposition | **Medium.** Specials should feel certain and juicy (claws, horn slam). Knock-back into props is a good later addition. Cards don't fit. |
| **Mario + Rabbids** | Movement is an action in itself (dash through enemies, team jumps), very readable half/full cover blocks, 0/50/100 % hit chances | **Medium.** Chunky cover readability and short turns fit mobile. Our % stays, but rounding and colour bands (green/yellow/red) help. |
| **Fire Emblem** | Danger zone toggle (all tiles enemies can hit next turn), combat forecast window (damage, hit, crit, counter, both sides) | **High.** A forecast with damage and % on the attack button, and a danger overlay, are the two biggest readability wins for us. |
| **Darkest Dungeon** | Tiny UI, strong stress/status icons, turn order bar, punchy hit-stop and camera zoom on every hit | **Medium–high.** We have a turn queue and hit-stop. Steal: clear status icons and short "barks". |
| **Demeo** | Figurines on a physical board, tilt/hop movement, zoom in to admire pieces, every action shows its card cost | **High.** Our look is now Demeo-like: smooth hops with squash, pieces that react, and close zoom. |
| **Hard West** | Ricochets, luck as a resource, aggressive "every turn matters" design | **Low–medium.** Ricochet visuals already exist for misses. Luck meters would add complexity. |
| **Invisible Inc** | Exact AP shown on every tile, rewind, enemy vision cones, everything predictable | **High for AP-per-tile and rewind.** Showing the exact AP cost on the destination, and undoing a move, remove frustration. |

## What we take (and in what order)

1. **Move preview, then commit (touch).** First tap on a tile draws the exact path, the AP cost, cover shields at
   the destination and a red "FLANKED" / "N can shoot you" warning with each threatening enemy linked by a line.
   Second tap (or the Move button) commits. With a mouse, hovering is the preview, so one click moves.
   (XCOM, Invisible Inc, Fire Emblem.)
2. **Undo the last move.** If nothing was revealed or triggered (no overwatch shot, no new rival in view), one
   button puts the piece back with its AP. Removes the "fat finger" loss on phones. (Invisible Inc, board ports.)
3. **Combat forecast on the attack button.** "Shoot · 68% · 2–4" with a colour band, and the modifier list one tap
   away in the target panel. (Fire Emblem, XCOM.)
4. **Rival threat.** Tapping a rival shows its reach this turn (move + attack area) in red, like Fire Emblem's danger
   zone; previewing a destination shows which rivals can hit it. (Into the Breach, Fire Emblem.)
5. **Clear end-turn prompt.** When the acting piece has no AP left (or nothing useful), the End turn button pulses
   and says so. (XCOM, Mario + Rabbids.)
6. **Speed toggle 1× / 2×** for rival turns and animations, saved between sessions. (Most modern tactics games.)
7. **Camera follow** for the moving piece and the acting rival, without fighting the player's own pan and zoom.
8. **Juice:** squash and stretch on hops, landing dust, hit-stop, knock-back, readable barks. (Demeo, Darkest
   Dungeon.)

## What we leave out (for now)

- Full Into the Breach determinism (no dice): wrong fantasy for street gangs; keep the % but show it honestly.
- Card hands (Midnight Suns): a second system to learn in a 3-minute op.
- Luck meters (Hard West), vision cones and stealth (Invisible Inc): good, but too much for short ops on a phone.
- Team jumps / dash-through-enemy movement (Mario + Rabbids): could suit Pip (scout) later as an ability.

## Mobile rules of thumb we hold ourselves to

- Every tap target at least 40 px tall; primary action buttons 48 px.
- One obvious primary action on screen at a time (red), secondary actions dim.
- Never let a single accidental tap spend AP without a preview or an undo.
- All information needed for a decision is visible without hover.
- Text never under 11 px at 844×390.
