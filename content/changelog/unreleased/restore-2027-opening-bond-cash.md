---
date: 2026-11-19
title: Keep transferred opening bond cash inside M2
summary: >-
  The 2027 bond market can recover its opening cash from modeled deposits in
  the same currency. The transfer preserves broad money and is recorded in the ledger.
tags: [bonds, liquidity, money-supply]
badges: [patch]
areas: [engine]
---

## What changed

- Record deposit-funded opening cash separately from central bank purchases.
- Keep that funding in broad money while it sits in a bond pool.
