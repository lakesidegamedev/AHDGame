---
date: 2026-10-25
title: Economy-only reset starts the funded market with faster builds and a gentler price pace
summary: >-
  The economy-only reset now writes the funded-market settings chosen on the
  fresh-economy tests: short plants build in a quarter of the time, and prices
  move at most 2% a turn up to 3 times base. Admin tooling only.
tags: [economy, admin, reset, producer-market]
badges: [patch]
areas: [backend]
---

## What changed

- The reset sets `producerShortageBuildFactor` 0.25, `producerPriceMaxMove`
  0.02 and `producerPriceMaxMultiplier` 3.
- Chosen on test arms run on a copy of the live world: with these values the
  rebuilt economy grew every turn for 23 funded turns. The default 6% a turn
  and a 3% a turn arm both crashed part-way.
