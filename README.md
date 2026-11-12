# Fang City: Animal Gangs (playable prototype)

Dark, modern-day animal gangster game for phones: an idle empire (rackets, cash, influence, offline earnings)
feeding turn-based grid battles against rival crews. Plain HTML/CSS/JS, no build step.

Play: open `index.html` through any static server (`python3 -m http.server`), or the hosted GitHub Pages link.
URL flags: `?reset=1` wipes the save, `?fast=1` skips the splash and speeds up battle animations.

## Architecture (ready for an online backend)

```
js/core/   pure game rules, no DOM. Runs in the browser and in Node (tests), and later on a server.
  data.js      all tunable definitions (rackets, gear, species, districts, shop SKUs)
  rng.js       seeded deterministic RNG stored inside the JSON state
  state.js     newGame(), versioned JSON save, storage adapter (localStorage now, API later)
  economy.js   idle maths: geometric costs, milestones, tills, lieutenants, offline catch-up, prestige
  crew.js      recruiting with published odds + pity, stats, gear, timed training + speed-ups
  battle.js    grid combat: AP, movement, line of sight, cover, crits, venom, suppression; applyAction() -> events
  ai.js        rival crew AI, one action at a time (also used for offline defence later)
  meta.js      daily rewards, jobs, objectives, turf/raid setup, rewards, mock purchases
js/ui/     rendering only: reads state, sends intents to core, animates returned events
tests/     core.test.js (node) and playthrough.py (Playwright, phone viewport)
```

Every state change goes through a core function, and the whole game is one JSON object. A server can therefore
own the state, validate each battle action (same seed + same actions = same result) and run the AI for
defence fights, while the client keeps the same renderer.

## Tests
`node tests/core.test.js` - rules, saves, offline, prestige, pity, battle replay determinism, balance table.
`python3 tests/playthrough.py` - drives the real UI at 390x844 through the whole loop and saves screenshots.

All purchases are mock: nothing charges money.
