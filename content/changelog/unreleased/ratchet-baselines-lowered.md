---
date: 2026-11-10
title: Architecture check allowances tightened to current levels
summary: >-
  Several developer checks kept a little unused room for new debt. Their recorded
  limits now match what the code actually contains.
tags: [engineering, quality]
badges: [patch]
areas: [backend]
---

## What changed

- The recorded limits for country-specific branches, direct database access sites
  and file size pins were lowered to the current counts, so new debt can no longer
  hide in leftover room.
- No game rules or player-facing pages changed.
