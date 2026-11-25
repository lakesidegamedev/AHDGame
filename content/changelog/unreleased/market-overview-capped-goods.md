---
date: 2026-11-25
title: "Market overview: goods at the price cap share one row"
summary: >-
  The commodities card on the market overview no longer fills up with goods
  stuck at the price cap. They share one summary row, and the other rows show
  the goods furthest from their base price that can still move.
tags: [market, interface]
badges: [patch]
areas: [frontend]
---

The commodities card listed the goods furthest from their original base
price. When several goods sat at the price cap, they took every row with the
same figure, so the card said nothing new.

Now goods at the cap share one row that names them and gives the cap, and
the other rows list the goods furthest from base that are still below it.
The full commodities tab still lists every good.
