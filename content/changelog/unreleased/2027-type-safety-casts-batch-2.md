---
date: 2026-11-08
title: "Internal type-safety cleanup, part 2"
summary: >-
  More behind-the-scenes cleanup of share trading, corporation turn handling
  and market share code. Nothing changes for players.
tags: [engine]
badges: [patch]
areas: [engine]
---

## What changed

- Share trading, corporation cash settlement and market share code now use stricter internal typing instead of forced type conversions. Gameplay, numbers and results are unchanged.
