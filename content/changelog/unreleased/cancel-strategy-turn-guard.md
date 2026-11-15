---
date: 2026-11-15
title: "Strategy cancel and sector purchase wait while a turn processes"
summary: >-
  Cancelling a strategy change and buying a listed sector now wait while a
  turn is processing, instead of risking a stopped turn.
tags: [corporations, sectors, turns]
badges: [patch]
areas: [engine, backend]
---

## What changed

- Cancelling an in-progress strategy change while the game is processing a
  turn now returns a short retry notice instead of changing plant capacity
  and the build queue mid-turn, which could stop the turn with a physical
  opening error.
- Buying a listed sector during turn processing waits the same way, since a
  merged purchase rewrites the surviving sector's capacity, build queue and
  plant ledger.
- Neither action writes anything while the turn runs. Retrying after about a
  minute goes through as before.
