---
date: 2026-11-05
title: Prices recover to what goods cost to make, not past it
summary: >-
  A price that rises because buyers went short now stops at what the good costs
  its maker to produce, and at the highest price any buyer is offering. Goods
  that already sell above their cost keep their price.
tags: [economy, market, production]
badges: [patch]
areas: [engine]
---

## What changed

- When a company sells out while buyers go short, it still asks a little more
  the next turn, but only while its price is below what each unit costs it to
  make: inputs at market prices plus wages and site costs. It stops at that
  cost.
- A company that already earns more than its cost keeps its price. Those
  shortages come from too few plants, and a higher price would mostly take
  money from households without adding supply.
- A price never rises past the highest price any buyer in that market is
  offering, so one raise cannot price out every buyer at once.
