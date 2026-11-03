---
date: 2026-11-03
title: Quieter turn log for routine index fund holds
summary: >-
  An index fund held for one turn while it pays out redemptions no longer
  writes a warning. A one-off repair check for records from the previous world
  no longer fails after the reset.
tags: [index-funds, operations]
badges: [patch]
areas: [backend]
---

## What changed

- An index fund that has redemptions waiting skips its daily rebalance and
  catches up on the next turn. That one-turn hold is routine, so it no longer
  appears as a turn warning. A fund that misses a whole day of rebalancing
  still warns, once a day.
- A repair check written for state-owned sectors in the previous world failed
  every time it ran on the current world, because those records no longer
  exist. It now reports that there is nothing to repair.
- No game rules changed.
