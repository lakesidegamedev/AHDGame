---
date: 2026-10-27
title: Fix funded fertility policy receipt timing
summary: >-
  Funded family policies now use the current turn's delivery receipts when
  calculating fertility. This prevents paid programs from appearing unfunded
  after the treasury settles a new turn.
# Free text. What the change was about: economy, elections, balance, corporations.
tags: [demographics, legislation, funding]
# How big this change is, which sets how it is grouped in the release post.
# One of: major | minor | patch | hotfix
badges: [patch]
# Which part of the codebase moved. Any of: backend | frontend | fullstack | engine
areas: [engine]
---

## What changed

- Corrected fertility policy receipt timing for every country using the current demographic system.
- Kept stale, future and undelivered receipts ineligible, and retained the existing health observation lag.
