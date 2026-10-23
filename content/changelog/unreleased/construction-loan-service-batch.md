---
date: 2026-10-23
title: Construction loans are serviced in one batch per bank
summary: >-
  Each bank now services its construction-backed loans in a single journaled
  move per turn instead of one lease, settlement and release per loan. Loan
  arithmetic is unchanged. No gameplay change.
tags: [performance, turn, banking]
badges: [patch]
areas: [engine, backend]
---

## What changed

- A bank's construction loans now share one lender lease and one money-journal
  record per turn: one debit per borrower, one credit to the bank, one record
  update per loan. Before, every loan took its own lease, settlement and
  release, about 17 database round trips each.
- Each payment is still decided against the borrower's running balance in the
  same order, so amounts, arrears, defaults and payoffs are identical.
- A loan another receipt still owns (an unfinished build, a sale, an older
  instalment) keeps the per-loan path, which knows how to recover it.
- If a turn crashes mid-batch, the next turn's banking recovery finishes the
  batch and releases every loan it held.
