---
date: 2026-11-10
title: Add an offline US geographic election prototype
summary: >-
  Adds an offline US House experiment comparing presidential geography with
  provisional 2026 evidence. Live elections and campaign actions are unchanged.
# Free text. What the change was about: economy, elections, balance, corporations.
tags: [elections, research]
# How big this change is, which sets how it is grouped in the release post.
# One of: major | minor | patch | hotfix
badges: [patch]
# Which part of the codebase moved. Any of: backend | frontend | fullstack | engine
areas: [engine]
---

## What changed

- Added portable integer ballot allocation, bounded local campaign effects,
  country-isolation tests and a reproducible California comparison harness.
- Reports retain source hashes, coverage exclusions and provisional-data limits.
- Added multi-turn campaign schedules and PS accounting to compare action
  costs, decay, county coverage prices and fractional vote carry. Live rules
  remain unchanged.
