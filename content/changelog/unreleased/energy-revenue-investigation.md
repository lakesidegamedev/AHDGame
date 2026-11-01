---
date: 2026-10-31
title: Correct sector sales and profit reporting
summary: >-
  Sector sales panels now use settled market sales, and profit displays retain
  the full cost of unsold output instead of treating it as earnings.
tags: [corporations, economy]
badges: [patch]
areas: [fullstack, engine]
---

## What changed

- Show actual sales for each output, including turns when nothing sells.
- Preserve booked losses in sector details and corporation summaries, including freight and growth costs.
- Keep the cost of unsold output and transition support separate from operating profit.
- Hide the legacy clearing multiplier when a funded settlement supplies the sales figures.
