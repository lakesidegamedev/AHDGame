---
date: 2026-11-17
title: "The turn balance record keeps every turn"
summary: >-
  The per-turn economy balance record no longer stops at a region that still
  holds an older currency the world no longer trades, so the money-flow check
  keeps a full record of every turn.
tags: [economy, ledger, turn]
badges: [patch]
areas: [engine, backend]
---

## What changed

- A producer wallet holding a currency with no exchange rate, such as a
  pre-euro franc or lira left in a region, is now valued at parity instead of
  stopping the balance record.
- The record still lists every other account and wallet for the turn.
- Wallets with an unusable amount are skipped rather than aborting the record.
