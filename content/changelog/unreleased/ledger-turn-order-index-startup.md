---
date: 2026-11-11
title: Ledger ordering index is now checked on every start
summary: >-
  The index that keeps the ledger page fast is now created or confirmed each
  time the game starts, instead of only when someone runs it by hand.
tags: [ledger, performance]
badges: [patch]
areas: [backend]
---

## What changed

- The index behind the ledger's newest-first ordering is now part of the startup
  index checks, so a live world always has it. Before, it only existed if a
  manual migration had been run.
- Without it the database sorts the whole ledger in memory for each page, which
  can be slow on a large ledger. Nothing in the ledger itself changes.
