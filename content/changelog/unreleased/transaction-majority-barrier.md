---
date: 2026-10-24
title: Turn transactions always see the turn's own earlier writes
summary: >-
  Fixes the failure that stopped turn 396: a bond maturity step could not see
  a change it had made a moment earlier. Gameplay rules are unchanged.
tags: [turn, bonds, database, fix]
badges: [patch]
areas: [engine, backend]
---

## What changed

- The turn worker acknowledges ordinary writes before they are journaled, to
  keep turns fast. A multi-document transaction reads only journaled data, so
  a transaction that followed a very recent write could miss it.
- Turn 396 stopped on exactly that: a sovereign bond maturity reserved a
  public-float rollover and its transaction, started immediately after, did
  not see the reservation and refused to continue.
- Before each transaction in that mode, the worker now waits for one journaled
  write, which guarantees every earlier write is visible. Other processes are
  unchanged.
