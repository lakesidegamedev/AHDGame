---
date: 2026-10-30
title: Trading reopens sooner after each turn
summary: >-
  History charts, rankings and health records are now written just after the
  turn finishes instead of while it is still running, so actions that wait for
  the turn become available again several seconds earlier.
tags: [performance, turn]
badges: [patch]
areas: [engine]
---

Snapshots that only feed charts, rankings and diagnostics run right after the
turn releases the world, in the same worker, stamped with the turn they
describe. If a newer turn starts before they finish, the rest are skipped and
recorded as skipped on the turn log rather than written under the wrong turn.
