---
date: 2026-10-30
title: Faster producer market funding each turn
summary: >-
  The turn's producer funding moves pay every wallet in a few bulk writes
  instead of one at a time. No gameplay change.
tags: [performance, turn]
badges: [patch]
areas: [backend]
---

## What changed

- A money move that mints and credits in alternating legs, which is how the
  turn's batched producer funding is built, now delivers its credits in one
  bulk pass. Mint and burn legs touch no document, so they no longer end a run
  of credits early and send every credit down the one-at-a-time path.
- On a production-shaped copy the funded producer step of the corporation
  turn went from 1,192 database commands to 197. Balances, receipts and
  journal entries are unchanged.
