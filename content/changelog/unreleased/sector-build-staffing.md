---
date: 2026-10-25
title: Build preview shows the right crew for a sector's production method
summary: >-
  The staff figure in the expand sector preview now scales with the production
  method the sector actually runs, instead of always using an ordinary
  factory's crew.
tags: [corporations, sectors, ui]
badges: [patch]
areas: [frontend]
---

## What changed

- Expanding a sector that runs a non-standard production method now shows the
  workers that method needs, matching the workforce the same plants use once
  built.
- The "Staff per unit of capacity" row on the sector page reads the same way.
- Sectors on the standard method are unchanged, and the build price still uses
  the standard price basis.
