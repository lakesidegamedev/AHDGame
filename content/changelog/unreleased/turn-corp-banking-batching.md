---
date: 2026-10-26
title: Fewer repeated reads in the corporation and banking phases
summary: >-
  Dead-bank loan servicing, NPP market-entry ranking, reinvestment pools,
  advertising settlement and political media plans stop repeating the same
  lookups per item. No gameplay change.
tags: [performance, turn, corporations, banking]
badges: [patch]
areas: [engine, backend]
---

## What changed

- Loans on failed banks are serviced from one read of the loan books and
  borrowers instead of one read per loan.
- AI corporations rank empty sectors without recomputing each candidate's
  market scores on every comparison, and build their reinvestment pool once
  per turn instead of once per corporation.
- Advertising settlement resolves each seller's currency once instead of once
  per buyer and seller pair.
- Political media settlement plans are saved in one batch per turn.
