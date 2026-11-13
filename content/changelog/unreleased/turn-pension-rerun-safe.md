---
date: 2026-11-13
title: "Pension charges and payouts cannot be applied twice if a turn is restarted"
summary: >-
  Employer pension contributions, scheme benefit payments and scheme
  investments are now marked as done for the turn in the same step that moves
  the money, so a turn restarted after a crash does not repeat them. Nothing
  changes for players.
tags: [engineering]
badges: [patch]
areas: [engine, backend]
---

## What changed

- Each employer pension debit is stamped per agreement and turn when it is taken.
- A scheme is charged, paid out and invested at most once per turn.
- A scheme investment that was cut off is finished on recovery without buying twice.
- From turn resilience stage 2, an interrupted pension step is rerun on recovery instead of holding the turn.
- Dark behind turn resilience stage 2: production stays at stage 1, where the turn writes exactly what it wrote before and an interrupted step still holds the turn.
