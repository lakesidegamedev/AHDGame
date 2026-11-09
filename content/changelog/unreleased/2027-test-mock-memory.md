---
date: 2026-11-09
title: "Lighter automated check memory use"
summary: >-
  The shared test helper that fakes the database now uses far less memory, so
  large automated checks stop running out of it. The game itself is unchanged.
tags: [engineering]
badges: [patch]
areas: [backend]
---

## What changed

- The fake database used by automated checks now builds its pieces only when a check actually uses them.
- Large checks no longer need special workarounds to avoid running out of memory.
- Nothing changes for players.
