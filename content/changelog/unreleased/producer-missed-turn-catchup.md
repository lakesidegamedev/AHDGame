---
date: 2026-10-31
title: Turns resume after a missed company production step
summary: >-
  When one turn's company production step fails, the next turn now picks up
  from the last completed production instead of stopping every turn after it.
tags: [corporations, economy, turns]
badges: [hotfix]
areas: [engine]
---

## What changed

- If a turn fails before companies produce and sell, later turns no longer stop on it. Each plant resumes from its last completed production, with nothing made or sold for the missed turn.
- Construction that was due during the missed turn still arrives, and plants still age for the turns that passed, so no paid construction is lost.
- Companies founded during the missed turn join the next turn as usual.
- The recovery only covers short gaps of up to six turns. A turn whose production was recorded but never finished, or a longer gap, still stops the turn so it can be checked by hand.
