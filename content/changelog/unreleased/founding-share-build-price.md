---
date: 2026-11-17
title: "New sectors no longer count as dominant before they produce anything"
summary: >-
  A sector you have just founded no longer reads as owning the whole market
  while its first plant is still being built, so your first expansion there is
  not charged the dominance surcharge.
tags: [corporations, economy, fix]
badges: [patch]
areas: [economy]
---

## What changed

- Market share for build prices, the sector detail quote and dominance checks now ignores a sector that has no delivered capacity yet.
- A firm that really holds most of a market still pays the dominance surcharge.
