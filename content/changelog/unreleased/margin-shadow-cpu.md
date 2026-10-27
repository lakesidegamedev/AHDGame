---
date: 2026-10-27
title: Corporation turn stops rebuilding identical commodity margins
summary: >-
  Commodity margin modifiers are computed once per combination of books and
  recipe instead of once per sector, and the producer-market shadow stops
  copying whole sector documents. No gameplay change.
tags: [performance, turn, corporations, observability]
badges: [patch]
areas: [engine]
---

## What changed

- `computeBlendedMarginModifiers` caches its result per (sector type, global,
  national and state books, blend weights, supply and demand rates). Sectors
  that share all of those now share one frozen answer, and the stabilised state
  book is built once per state instead of once per sector. On the
  production-shape fixture a 14,000-sector pass fell from 154 to 61 ms of CPU
  and from 10.9 to 2.6 ms of GC.
- The producer shadow copies only the labour collectors it mutates, instead of
  a generic deep clone of each map.
- The shadow hands plant preparation a projection of each live sector rather
  than a copy of the whole document. On the same fixture the carried opening
  pass fell from 40 to 28 ms of CPU and its GC from 2.4 to 1.4 ms.
- The producer-turn golden now also pins the shadow's summary and carry state,
  recorded from the unmodified code.
