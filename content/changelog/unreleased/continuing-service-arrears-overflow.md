---
date: 2026-11-09
title: "Turns no longer fail on a successor's unpaid federation debt"
summary: >-
  A turn could stop at the bond step because a successor state's running total
  of unpaid debt kept growing every turn. The total now only grows when new debt
  goes unpaid, so turns complete again.
tags: [bonds, economy]
badges: [patch]
areas: [engine]
---

## What changed

- A successor state's unpaid share of inherited federation debt was added to its running total again every turn, even when nothing new fell due. The total now grows only by newly unpaid debt.
- Turns that stopped at the bond step because that total grew too large now complete.
