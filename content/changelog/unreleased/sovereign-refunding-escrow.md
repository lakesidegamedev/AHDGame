---
date: 2026-10-27
title: Refinanced bank bond repayments are paid the same turn
summary: >-
  When a government refinances a maturing bond held by a bank, the money now
  goes straight to the bank's repayment instead of passing through the treasury,
  where other spending could use it first.
tags: [economy, bonds, banking]
badges: [patch]
areas: [backend, engine]
---

## What changed

- A government refinancing a maturing bond held by a bank now pays the bank's
  share in the same step that raises the money. Before, the money landed in
  the treasury first, an earlier check that turn had already given up on the
  payment, and other spending used part of the cash before the bank was paid.
- The amount a government can refinance for a maturing bond is now limited to
  what that bond owes its holders, separately for banks and for everyone else,
  so missing money can never turn into repeated borrowing.
- A bond still waiting from before this change borrows only the part of the
  repayment the treasury no longer holds.
