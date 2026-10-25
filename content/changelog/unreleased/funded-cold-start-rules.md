---
date: 2026-10-25
title: Funded market plants keep running until the market answers, and stock cost stays sane
summary: >-
  Two rules for the funded producer market found on the fresh-economy proof.
  A plant that has never produced or offered anything keeps a full run instead
  of reading its own empty first turn as no demand. Stock carried into the next
  turn is valued at no more than three times the reference price, so a run that
  made almost nothing cannot book a billion-anchor write-off on a few units.
tags: [economy, producer-market, cold-start]
badges: [patch]
areas: [engine]
---

## What changed

- Output rules: when the last receipt shows nothing produced and nothing
  offered, the plan is a full run. On a cold start every secondary producer
  begins with empty input stock, and the old reading parked the whole supply
  chain at the 1% probe run for good.
- Stock cost basis: the unit cost carried into stock, and the basis used for
  stock-cover write-downs, is capped at three times the output's reference
  price. Everything above that was already expensed in the period.

No change for a world whose plants have sales history and sane unit costs.
