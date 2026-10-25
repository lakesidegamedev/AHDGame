---
date: 2026-10-25
title: Funded market builds faster where it is short, and its price pace can be set
summary: >-
  On funded turns, outstanding construction in plants whose output is short on
  the funded book can be shortened by a settable factor, and the funded price
  rule's per-turn move and ceiling can be set. All three settings are absent
  by default, so nothing changes until a world turns them on.
tags: [economy, producer-market, construction, prices]
badges: [patch]
areas: [engine]
---

## What changed

- `gameConfig.producerShortageBuildFactor`: between 0 and 1, the remaining
  build time of each outstanding order in a short plant (main product's book
  pressure above 1) is multiplied by it once. The legacy shortage speedup
  reads the formula ledger, which funded turns do not produce, so it never
  fired on a funded world.
- `gameConfig.producerPriceMaxMove` and `producerPriceMaxMultiplier`: the
  funded price rule's largest per-turn move (default 6%) and ceiling (default
  10x).
