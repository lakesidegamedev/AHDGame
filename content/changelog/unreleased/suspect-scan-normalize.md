---
date: 2026-10-27
title: Fraud checks stop rewriting every recent transaction
summary: >-
  The turn's suspicious-transaction check now touches only the transactions it
  flags instead of rewriting every recent one. No gameplay change.
tags: [performance, turn]
badges: [patch]
areas: [engine]
---

## What changed

- Before marking a transaction as suspicious, the check prepared every
  transaction from the last few turns, thousands of writes each time it ran.
  It now prepares only the transactions it is about to flag.
