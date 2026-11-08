---
date: 2026-11-08
title: "Stricter checks before a world reset"
summary: >-
  A world reset now refuses to start if any state in a playable country is
  missing its own GDP or population. No player-facing change in the live game.
tags: [world, resets]
badges: [patch]
areas: [engine, backend]
---

## What changed

- Before a reset writes anything, every state of every playable country in the chosen start date must carry a real, positive GDP and population. A missing figure stops the reset with a list of what is missing.
- Resets are also checked against a fixture holding every leftover seen in past resets, so none of them can survive into a new world.
- A single report now lists every collection, preserved field and seed dataset with what a reset does to it, and fails if anything is unclassified.
- Live worlds are unchanged.
