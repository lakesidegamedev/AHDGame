---
date: 2026-11-12
title: "A turn that stops partway tries again on its own"
summary: >-
  When an hourly turn stops after some of its steps have run, the game now
  retries it within minutes, picking up at the step that failed, instead of
  waiting for the next hour. Off until switched on.
tags: [engineering]
badges: [patch]
areas: [engine, backend]
---

## What changed

- A stopped turn is retried up to three times, after about 1, 3 and 9 minutes.
- Each retry skips the steps that already finished and carries on from the one that failed.
- A step that cannot safely be repeated is never retried; the game stops and raises an alert instead.
- After the last attempt the game stops, raises an alert and keeps the evidence.
- Nothing changes until the turn resilience switch is turned on.
