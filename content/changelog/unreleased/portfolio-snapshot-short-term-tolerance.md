---
date: 2026-10-26
title: Portfolio history no longer skips a turn on large short-term holdings
summary: >-
  Some turns wrote no portfolio history at all because a large holding's
  short-term value looked fractionally larger than its own total. The check
  now allows for that rounding, so every turn records the snapshot again.
tags: [portfolio, turn, bugfix]
badges: [patch]
areas: [backend, engine]
---

## What changed

- The portfolio snapshot compared a holding's total value, converted as
  `(shares * price) / fx`, against its short-term share, converted as
  `shares * (price / fx)`. Both are arithmetically equal, but at portfolio
  magnitudes they round differently, so an entirely short-term holding could
  appear to exceed its own total and the phase threw before writing anything.
- The sanity check now scales its tolerance with the value instead of using a
  fixed absolute tolerance, so a genuine split above the total is still
  rejected while normal rounding no longer loses a turn's history.
