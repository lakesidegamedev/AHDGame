---
date: 2026-11-11
title: Generated enemy forces live in their own rules module, with no player-visible change
summary: >-
  The table and generator for computer-controlled enemy forces moved out of
  the main battle file into a small rules module. Battles resolve exactly as
  before.
tags: [maintenance, military]
badges: [patch]
areas: [engine]
---

## What changed

- The enemy force generator and the seeded dice it shares with battle
  resolution now live in their own pure rules module, keeping the battle file
  under its size limit.
- Every battle with the same seed produces the same result as before.
