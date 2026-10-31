---
date: 2026-10-27
title: Timed economy-only pause
summary: >-
  Operators can freeze the economy for a set number of turns while elections, campaigns, parties and
  legislation keep running. The economy resumes on its own, and the status bar shows when.
tags: [economy, turns, admin]
badges: [minor]
areas: [fullstack]
---

## What changed

- New gameConfig `economyPauseUntilTurn`: economy phases are skipped on every turn below it and resume on that turn with no second command.
- The skipped set is the same economy boundary the elections-only sandbox profile uses, except the fiscal year rollover, which still runs so a year end inside the window is not lost.
- The turn status payload carries the window, and the status bar shows "Economy paused, resumes turn N" while it is open.
- A full world reset clears the window; the economy-only reset keeps it.
