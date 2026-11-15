---
date: 2026-11-10
title: Support v2 resets across preset openings
summary: >-
  Allows v2 system selections on other presets using their modeled game-seed
  openings and year-aware Cabinet funding.
tags: [reset, presets, government]
badges: [patch]
areas: [fullstack]
---

## What changed

- V2 reset selections now work across preset dates. Openings outside the
  reviewed 1991 anchor use the selected preset's game seed as a modeled baseline.
- Seeded budget totals, transfers and continuity obligations reconcile with
  world-bound Cabinet accounts. Opening observations retain inherited source
  years and frozen cohort inputs for subsequent turns.
- Cabinet funding follows the opening year, including the modern UK Environment
  department. Existing country catalog coverage still determines v2 availability.
- Added preset-wide opening checks and an isolated first-turn and replay harness.
