---
date: 2026-11-03
title: "Market books record how much demand buyers could actually pay for"
summary: >-
  Each country's market book now records units requested, units buyers had the
  cash for, and units they received. Nothing about prices or sales changes yet;
  this is the measurement the economy rebalance will be judged against.
tags: [economy, markets]
badges: [minor]
areas: [engine]
---

## What changed

- Every country and commodity book now keeps three new counts: requested (a reserved order and its fallback counted once), funded (what the buyers' shared cash covers at their bid prices) and filled (what they received).
- Prices still read the same demand figure as before. These counts let us see how much of a shortage is orders nobody can pay for before any price rule changes.
