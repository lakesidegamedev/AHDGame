---
date: 2026-11-09
title: "Every new crisis now runs on the Crisis v2 model"
summary: >-
  Crises opened from now on, including disasters, economic and political
  shocks, and the events of long-running conflicts, run on the new crisis
  model. They look and hit the same as before, and they gain stages, a
  record of who acted, and responses by office. Crises already underway finish
  on the old path.
tags: [world, crises]
badges: [patch]
areas: [engine, backend]
---

## What changed

- Each authored crisis is now a scripted Crisis v2 definition: same effects at the same size, the same length (including the cuts earned by aid and decisive responses), and its decision options offered as responses for the office that makes them. Crises are no longer one-way snapshots: easing one with responses scales its effects down.
- Per-turn "decay" effects are skipped by the turn exactly as before; other systems still read them off the crisis.
- Long-running conflicts get a crisis of their own that tracks the conflict's intensity through the stages and closes when the conflict settles. Their rules for civilian loss, destroyed capacity, refugee reception and trade sanctions now exist as crisis effect modules, and each conflict names the crises it spills into. Those new effect kinds are not routed to the game systems yet, so they change nothing in play today.
- New crises are opened under a budget by reach (local, regional, national, global) instead of a flat two-per-country limit. A regional disaster now costs far less budget than a national crisis, so disasters no longer crowd national events out. The held-back "deferred spawn" marker is retired.
- Crises that were already running when this ships are not migrated. The old turn code for them stays, marked for removal once none are left.
