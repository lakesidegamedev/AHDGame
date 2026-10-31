---
date: 2026-10-26
title: Corporation turn does less repeated calculation
summary: >-
  Market clearing and sector processing stop recalculating the same tables
  for every company and commodity. No gameplay change.
tags: [performance, turn, corporations, market]
badges: [patch]
areas: [engine]
---

## What changed

- Price tables, product mix weights and seller lookups used by market
  clearing are built once per turn instead of once per company or commodity.
