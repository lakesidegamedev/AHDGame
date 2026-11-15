---
date: 2026-11-09
title: "Country market prices move at the same pace as world prices"
summary: >-
  A country's market price for a good now changes by at most the same step
  per turn as the world price, so a surplus no longer halves prices in one turn.
tags: [economy, prices, market]
badges: [patch]
areas: [engine]
---

- Each plant's reference price comes from the market its country can reach. That price was not held to the per-turn pace the world and national prices already follow, so a surplus could halve it in one turn and pull asks, discount floors and household price limits down with it.
- Prices still fall in a surplus and rise in a shortage, one step per turn.
