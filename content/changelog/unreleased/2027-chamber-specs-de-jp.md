---
date: 2026-11-08
title: "Germany, Japan and the upper chambers run from a shared description"
summary: >-
  Election scheduling for the Bundestag, the Landtage, Japan's two houses and
  the French, Italian, Spanish and Turkish senates now comes from the same
  chamber description as the other countries. Dates and seat counts are
  unchanged, with one small fix below.
tags: [engine, elections, countries]
badges: [patch]
areas: [engine]
---

## What changed

- The Bundestag and Landtage, Japan's lower and upper houses (including the two staggered halves of the upper house and snap elections), and the beta senates are now described as data and run by one shared spawner.
- Snapshot tests for every era start (1953 to 2027) confirm the same elections, dates and seats as before.
- A region that is missing its seat count or Landtag cycle date now stops the election check with a clear error. It no longer quietly gets one seat or is skipped.
- Fix: a German election that finished this turn no longer starts its next cycle in the same turn. It starts on the next one, as in every other country.
