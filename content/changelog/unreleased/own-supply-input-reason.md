---
date: 2026-11-02
title: Short inputs say why your own output did not arrive
summary: >-
  When a plant is short of something your company makes elsewhere, the sector
  page now says why that output did not cover it: a market-first supply policy,
  no haul to that region, or a supply agreement holding that share of demand.
# Free text. What the change was about: economy, elections, balance, corporations.
tags: [corporations, economy]
# How big this change is, which sets how it is grouped in the release post.
# One of: major | minor | patch | hotfix
badges: [patch]
# Which part of the codebase moved. Any of: backend | frontend | fullstack | engine
areas: [fullstack]
---

## What changed

- The company commodity table nets output against use across every site, so it
  could show a surplus of an input that one of your plants was short of. The
  sector page's "What goes in, what comes out" panel now explains the gap for
  the CEO, under any short input your other sites made last turn.
- It names the regions that made the input and gives each reason that applied:
  your supply policy sells to the market first; the input is made only in other
  regions and none was hauled to this one; a supply agreement covers part of
  this demand, which your own plants do not fill; or some of your own output
  arrived but not enough.
- No game rules changed. This only reports what last turn's records show.
