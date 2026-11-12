---
date: 2026-11-11
title: Country display settings are typed as they are stored, with no player-visible change
summary: >-
  The per-country display files now say in their types that an era can clear a
  setting, instead of hiding the difference behind a forced type. Nothing in a
  running game changes.
tags: [maintenance]
badges: [patch]
areas: [engine]
---

## What changed

- Era-specific display settings for each country record a cleared value the
  way the data file stores it, and the loader turns it back before any page
  reads it.
- Every country and era shows the same names, chambers and offices as before.
