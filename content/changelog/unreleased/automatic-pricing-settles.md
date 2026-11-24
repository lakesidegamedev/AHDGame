---
date: 2026-11-24
title: Asking prices settle instead of swinging every other turn
summary: >-
  When the price buyers pay sits between two asking prices, a plant's ask now
  narrows in on it over a few turns instead of jumping between the two every
  other turn.
tags: [corporations, economy, pricing, bugfix]
badges: [patch]
areas: [engine]
---

## What changed

- A plant remembers the highest price that sold out and the lowest price that left stock unsold. The next ask lands halfway between them, and the gap halves each turn until the price holds.
- Before this, a plant could ask a high price, sell little, mark the leftover stock down, sell out, and ask the high price again. Revenue and output swung every other turn.
- This applies to automatic pricing and to every price setting. If the market moves, the plant lets go of the old prices and searches again.
- The Pricing panel and the market system guide explain the new behaviour.
