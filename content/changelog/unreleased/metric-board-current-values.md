---
date: 2026-10-19
title: Publish current metric values every turn
summary: >-
  Metric boards publish current values every turn across countries and show when
  each measure was last updated. History sampling stays separate.
# Free text. What the change was about: economy, elections, balance, corporations.
tags: [metrics]
# How big this change is, which sets how it is grouped in the release post.
# One of: major | minor | patch | hotfix
badges: [patch]
# Which part of the codebase moved. Any of: backend | frontend | fullstack | engine
areas: [fullstack]
---

## What changed

- Numeric metrics update every turn; cohort and election reporting keeps its existing triggers.
- Regional and national boards show publication freshness, including the oldest source in a national rollup.
- History samples append every 12 turns without rewriting the board or its chart history.
