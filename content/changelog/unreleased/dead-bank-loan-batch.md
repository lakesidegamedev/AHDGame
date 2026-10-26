---
date: 2026-10-26
title: Loans on failed banks are collected in one payment per bank
summary: >-
  Loans owed to a failed bank are collected in one journaled payment per bank
  each turn instead of one per loan, cutting the banking phase's database
  work for those books by about three quarters. No gameplay change.
tags: [performance, turn, banking]
badges: [patch]
areas: [engine]
---

## What changed

- Loans on a failed bank's book are now collected the same way live banks
  collect theirs: one payment per bank per turn, with each borrower charged
  its own instalments. Household pool loans, construction loans and borrowers
  with loans in several currencies keep the per-loan path.
