---
date: 2026-11-03
title: Single player autosaves keep their spacing on fast turns
summary: >-
  Autosaves no longer come a turn early when several turns finish within the
  same instant.
tags: [singleplayer]
badges: [patch]
areas: [backend]
---

## What changed

- Autosave counts turns from the most recent autosave. When two saves were made
  in the same instant, it could count from the older one and save again a turn
  early. The newest save is now chosen by turn when the times match.
- No game rules changed.
