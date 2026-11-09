---
date: 2026-11-09
title: "Resets no longer stall on a false leftover alarm"
summary: >-
  The check that looks for leftovers after a world reset wrongly flagged three
  sets of seeded data as old, which would have kept a fresh world paused. It
  now judges them correctly.
tags: [world, reset]
badges: [patch]
areas: [backend]
---

## What changed

- After a reset, the leftover check no longer treats seeded laws, starting companies and the achievement list as old-world data.
- A clean reset now opens the world instead of staying paused.
- Real leftovers from the previous world are still caught.
