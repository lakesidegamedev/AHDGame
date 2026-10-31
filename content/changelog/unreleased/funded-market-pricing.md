---
date: 2026-10-25
title: Funded market prices follow real shortages and gluts
summary: >-
  On a funded producer turn the commodity price engine now moves each
  scarcity multiplier by the funded market's own measured imbalance, up to 6%
  a turn, instead of the formula-era ratchets that were built to stop a
  demand treadmill. A real shortage now raises the price every turn it lasts.
  No change on legacy turns.
tags: [economy, producer-market, prices]
badges: [patch]
areas: [engine]
---

## What changed

- `updateScarcityMultiplierFunded`: half the signed imbalance between units
  ordered and units offered, capped at 6% a turn, bounded at 0.25x to 10x of
  base. Holds when a lane has no market.
- The price phase uses it for the world and per-country multipliers whenever
  the turn ran the funded producer market. The level ratchet (0.4% a turn,
  2.5x cap) and momentum mode (a steady shortage reads as no signal) still
  apply to legacy turns.

Found on the fresh-economy proof: food buyers were short two to one for
fourteen turns and the price rose 11% in total, so primary producers stayed
under their labour cost and the supply chain could not grow.
