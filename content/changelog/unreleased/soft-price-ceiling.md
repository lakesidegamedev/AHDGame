---
date: 2026-11-03
title: Prices approach their ceiling instead of stopping on it
summary: >-
  With the soft price ceiling switched on, a good in shortage climbs toward the
  price ceiling gradually instead of stopping exactly on it, so goods in
  different shortages no longer all show the same price.
# Free text. What the change was about: economy, elections, balance, corporations.
tags: [economy, market]
# How big this change is, which sets how it is grouped in the release post.
# One of: major | minor | patch | hotfix
badges: [minor]
# Which part of the codebase moved. Any of: backend | frontend | fullstack | engine
areas: [engine]
---

## What changed

- Most goods in shortage sat exactly on the price ceiling and moved together
  each turn, so the price said nothing about how short a good was.
- Behind a new switch, off until it is turned on: above 60% of the ceiling, the
  price a good is heading for is softened so it approaches the ceiling without
  reaching it, and the usual limit on how far a price moves in one turn applies
  after that. A deeper shortage still shows a higher price.
- When the switch is turned on, goods now sitting on the ceiling will ease down
  toward their softened prices over a few dozen turns.
