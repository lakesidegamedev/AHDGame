---
date: 2026-11-01
title: Sold share labels state their denominator
summary: >-
  The sector pricing badge and the corporation Operations summary both showed a
  sold percentage that counted different things. Each now says whether it means
  the share of units offered or the share of output.
tags: [corporations]
badges: [patch]
areas: [frontend]
---

## What changed

- The corporation Operations summary now reads "N% of output sold", because its
  figure is sold units divided by the units the corporation produced that turn.
- The sector pricing badge now reads "N% sold of units offered last turn (all
  outputs)", because its figure is sold units divided by the units the sector
  put up for sale.
- The pricing badge tooltip states both denominators, so the two pages no longer
  look like they disagree about the same plant.
