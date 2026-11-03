---
date: 2026-11-02
title: Builds that arrive in one piece no longer look stuck
summary: >-
  An order for less than one whole plant, or for fewer plants than it has turns
  to build, showed a small per-turn rate such as "about 0.1 a turn" even though
  nothing arrives until each plant is finished. The build card and the sector
  page now show the turn the next plant lands, or the turn it is ready.
# Free text. What the change was about: economy, elections, balance, corporations.
tags: [corporations, construction]
# How big this change is, which sets how it is grouped in the release post.
# One of: major | minor | patch | hotfix
badges: [patch]
# Which part of the codebase moved. Any of: backend | frontend | fullstack | engine
areas: [frontend, backend]
---

## What changed

- Capacity is built in whole plants, mines or farms. An order smaller than one
  lands all at once on its finish turn, and an order of a few plants spread over
  more turns lands one plant at a time, with turns in between where nothing
  arrives.
- The build card and the Under construction list on the sector page used to
  show a per-turn rate for these orders, so a build on schedule read as stuck
  at "0 of 0.8 in, about 0.1 a turn". They now say when the next plant lands
  if that is before the build is done, and otherwise the finish turn. The
  tooltip says whether the capacity arrives in one piece or in steps.
- Orders that land at least one plant every turn keep their per-turn rate.
  Nothing about how or when capacity is built has changed.
