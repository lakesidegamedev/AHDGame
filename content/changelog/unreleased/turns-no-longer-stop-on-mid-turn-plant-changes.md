---
date: 2026-11-26
title: Turns no longer stop when plants change while the turn is running
summary: >-
  Sector attacks, nationalizations and state company merges, splits and sales
  now wait until the turn finishes, and stores with leftover empty stock rows no
  longer stop the turn.
tags: [turns, corporations]
badges: [patch]
areas: [engine, backend]
---

## What changed

- Attacking a rival's sector, nationalizing a company or sector, merging,
  splitting or selling a state company, and choosing an emergency taking in a
  crisis now wait while a turn is running. You see "The game is processing this
  turn, try again shortly." and can try again once the turn is done. Before,
  one of these landing during the turn could move a plant the turn had already
  planned with, which stopped the turn and made it start over.
- A store that still listed an empty stock row from before stores began
  selling goods no longer stops the turn. Empty rows hold no goods and no money,
  so the turn now treats them as absent. Rows that hold real stock still have to
  match.
