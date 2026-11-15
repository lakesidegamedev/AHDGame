---
date: 2026-11-08
title: "Crisis engine groundwork: crises that evolve each turn"
summary: >-
  The turn now has a phase that can run the new crisis model: a crisis with a
  severity that rises and falls from real economic conditions, moves through
  stages, records who acted and who did nothing, and applies its effects to the
  world. Nothing uses it yet, so no live crisis changes.
tags: [world, crises]
badges: [patch]
areas: [engine, backend]
---

## What changed

- A new turn phase steps every crisis that carries the new crisis state: it reads unemployment, growth and bank stress, applies the levers used since the last turn, moves the crisis between stages and writes the result.
- Each turn it records who held an office with a lever available and did nothing, next to who acted.
- A load director decides how many crises of each size can run at once, so a world gets many small crises, the occasional national one and a rare global one.
- A crisis that fails is skipped and logged, and the rest of the turn's crises still run.
- No existing crisis carries the new state, so the phase does nothing and live crises behave exactly as before.
