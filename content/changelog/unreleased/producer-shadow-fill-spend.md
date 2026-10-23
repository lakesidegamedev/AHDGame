---
date: 2026-10-23
title: The producer market shadow totals spend per fill
summary: >-
  The producer market shadow that runs inside the corporation phase no longer
  expands every fill into one trade per supplier just to add up what each
  buyer spent. It totals each fill directly, which removes the largest CPU
  cost in the corporation phase.
tags: [performance, turn, market]
badges: [patch]
areas: [engine]
---

## What changed

- The shadow's household money check and its spend summary read buyer and
  order spend straight from the fills. A fill's supplier legs always add up to
  the fill's units, so the totals are the same.
- The expanded per-supplier trade list is still available for audits and
  route or contract accounting.

No balance, price, rate or live market input changed. The shadow is telemetry
and the live economy does not read it.
