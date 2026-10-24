---
date: 2026-10-24
title: Retain completed bond settlement flows after a phase timeout
summary: >-
  Bond processing that finishes successfully after a timeout now keeps its
  settlement totals, allowing the turn to continue safely without repeating
  payments. Interrupted or unverifiable processing still stops for repair.
# Free text. What the change was about: economy, elections, balance, corporations.
tags: [turns, reliability, bonds]
# How big this change is, which sets how it is grouped in the release post.
# One of: major | minor | patch | hotfix
badges: [patch]
# Which part of the codebase moved. Any of: backend | frontend | fullstack | engine
areas: [engine]
---

## What changed

- Retain the exact successful result after draining a timed-out bond phase.
- Persist its validated totals and completed marker together before continuing.
- Preserve timeout warnings, rejected-phase guards and crash-resume protection
  against duplicate settlement.
- Cover late success, rejection, persistence failure and delayed marker writes.
