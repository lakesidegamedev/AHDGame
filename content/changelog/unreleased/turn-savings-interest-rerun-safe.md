---
date: 2026-11-13
title: "Savings interest cannot be paid twice if a turn is restarted"
summary: >-
  Each saver's interest accrual for a turn is now marked as done in the same
  step that adds it, so if the game restarts a turn that was cut off, interest
  already added is not added again. No change to what savers earn.
tags: [engineering]
badges: [patch]
areas: [engine, backend]
---

## What changed

- Interest accrual for characters, bank accounts and autonomous investors is stamped with the turn it was applied on.
- The central bank interest counter is booked once per turn.
- From turn resilience stage 2, an interrupted savings interest step is rerun on recovery instead of holding the turn.
- Savers earn exactly what they did before.
- Dark behind turn resilience stage 2: production stays at stage 1, where the turn writes exactly what it wrote before and an interrupted step still holds the turn.
