---
date: 2026-11-19
title: Restore bond market funding
summary: >-
  New 2027 worlds start with funded bond pools. Unsold company bonds can sell
  gradually from available cash when the pool is below its liquidity target.
tags: [bonds, liquidity, reset]
badges: [patch]
areas: [engine]
---

## What changed

- Run the existing bond pool initializer on the opening turn of a 2027 world.
- Calculate the company placement reserve from cash the pool can hold back.
- Keep the full government reserve for placements of earlier sovereign offers.
