---
date: 2026-11-17
title: Plants in unserved markets no longer pay the dominance surcharge
summary: >-
  When buyers want far more of a good than anyone delivers, being the only seller there no longer counts as dominating the market, so plant build prices stop carrying a surcharge for it.
# Free text. What the change was about: economy, elections, balance, corporations.
tags: [corporations, economy]
# How big this change is, which sets how it is grouped in the release post.
# One of: major | minor | patch | hotfix
badges: [patch]
# Which part of the codebase moved. Any of: backend | frontend | fullstack | engine
areas: [backend]
---

## What changed

- The dominance surcharge on plant builds now measures your share against the larger of total supply and what buyers have funded. A first seller in a mostly unserved market pays little or no surcharge.
- Markets that are already well served behave as before.
