---
date: 2026-11-08
title: "A new world starts clean"
summary: >-
  A world reset now rebuilds starting data from scratch instead of patching the
  old world's records, and checks the new world for anything left behind
  before the first turn can run.
tags: [world, reset]
badges: [patch]
areas: [engine, backend]
---

## What changed

- When the world resets, the starting map, budgets, political boards and other starting data are written fresh instead of being merged over the old world's records. Leftovers such as an old defence budget balance or old political momentum can no longer carry into the new world.
- Your account keeps your login, settings, supporter perks and history. Links to your old characters, old corporation cooldowns, old wire limits and corporations starred in your watchlist are cleared, because those belonged to the old world.
- Heads of state keep their identity and profile, and start the new world with an empty wallet as before.
- After a reset the game checks the new world for anything from the old one: wars, crises, elections, bills, embargoes, blockades, defence contracts, turn counters and more. If anything is found, the world stays paused until a clean reset, so a new world never opens with old state in it.
- The live world is not affected until the next reset.
