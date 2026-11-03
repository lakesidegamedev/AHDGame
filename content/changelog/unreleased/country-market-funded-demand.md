---
date: 2026-11-03
title: Country commodity markets show what buyers really ordered
summary: >-
  A country's commodity market left out orders from government, military and
  investment buyers, so goods that were short could read as a large surplus.
tags: [economy, commodities]
badges: [patch]
areas: [fullstack]
---

## What changed

- A country's commodity market now shows the orders placed on last turn's
  market: supply is what its producers offered and demand is what its buyers
  ordered, government, military and investment buyers included. Before, those
  buyers were missing from country demand, so goods such as ordnance and
  building materials could read as a deep surplus while they were short.
- The commodity page says when a country's figures come from last turn's
  orders and shows how much its buyers actually received.
- The map's country and reachable views, the wiki's country breakdown, the
  country economy outlook and the public API read the same orders.
- World totals do not change: they already counted every order.
- No game rules or prices changed. Countries fall back to the old figures on
  a turn with no market orders.
