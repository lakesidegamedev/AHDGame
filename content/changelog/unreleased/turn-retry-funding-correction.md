---
date: 2026-11-05
title: "Turns no longer stall after a retried turn changes its construction funding"
summary: >-
  When a turn failed after paying out construction funding, every retry worked
  the funding out again slightly differently and was refused, so turns stopped.
  A retry now corrects the earlier payment to its own figures and carries on.
tags: [economy, corporations]
badges: [patch]
areas: [engine]
---

## What changed

- Turn 697 failed once after construction buyers had already been funded. Each retry computed slightly different funding, the game refused to pay the same turn twice, and turns stopped advancing.
- A retry now tops up or takes back the difference against what was already paid, once per retry, so nobody is funded twice and the turn can finish.
- The error for a sector whose plant records changed mid-turn now names the sector, so that kind of failure can be traced quickly.
