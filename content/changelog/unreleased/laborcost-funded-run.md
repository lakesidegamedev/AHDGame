---
date: 2026-11-10
title: Plant labour cost follows the funded run
summary: >-
  A plant running far below its crew share no longer shows an inflated labour cost. The figure now matches the wages actually paid, which also corrects the base for union pension charges.
# Free text. What the change was about: economy, elections, balance, corporations.
tags: [economy, corporations, labour, pensions]
# How big this change is, which sets how it is grouped in the release post.
# One of: major | minor | patch | hotfix
badges: [patch]
# Which part of the codebase moved. Any of: backend | frontend | fullstack | engine
areas: [backend, engine]
---

## What changed

- Sector labour cost and wage per worker on a funded turn are priced from the funded headcount instead of the crew share, so a plant at a 1% funded run no longer reports hundreds of times its real payroll.
- The union pension charge base reads that labour cost, so it no longer overstates for those plants.
