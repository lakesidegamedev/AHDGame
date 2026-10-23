---
date: 2026-10-23
title: Waiting on inputs now has its own colour on the sector capacity chart
summary: >-
  The capacity chart used the same yellow for a sector waiting on bought-in
  goods and one holding back for demand. Waiting on inputs now has a distinct
  amber, so the chart says which remedy to reach for.
tags: [corporations, accessibility]
badges: [patch]
areas: [frontend]
---

## What changed

- Waiting on inputs uses its own amber swatch on the run meter fill and the legend dot.
- Demand limited keeps the warning yellow, so the two causes no longer read as one.
- Both keep warning severity, so the chart still says output is being held back rather than lost.
