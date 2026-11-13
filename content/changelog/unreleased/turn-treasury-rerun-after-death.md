---
date: 2026-11-13
title: "The treasury step is repeated safely after a mid-turn crash"
summary: >-
  If the game process dies while the national treasury step of a turn is
  running, the step is now run again on recovery instead of holding the turn.
  It was already built so a repeat changes nothing; tests now prove it at every
  write. Off until the turn resilience switch is turned on.
tags: [engineering]
badges: [patch]
areas: [engine, backend]
---

## What changed

- A new short list names steps proven safe to repeat after a crash. The treasury step is the first.
- From turn resilience stage 2, an interrupted treasury step is rerun on recovery; other money steps still hold the turn for a person.
- A test stops the treasury step at every database write, reruns it, and checks cash, holder credits and the ledger match an uninterrupted turn.
- Dark behind turn resilience stage 2: production stays at stage 1, where the turn writes exactly what it wrote before and an interrupted step still holds the turn.
