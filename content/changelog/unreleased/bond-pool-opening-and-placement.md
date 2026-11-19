---
date: 2026-11-19
title: Restore bond market funding
summary: >-
  New 2027 worlds now start with funded bond pools. Unsold bonds can sell gradually
  when the pool has cash, even when its balance is below the liquidity target.
tags: [bonds, liquidity, reset]
badges: [patch]
areas: [engine]
---

## What changed

- Run the existing bond pool initializer on the opening turn of a 2027 world.
- Calculate the placement reserve from the cash the pool can actually hold back.
