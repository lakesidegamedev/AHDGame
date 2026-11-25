---
date: 2026-11-25
title: Cost-plus pricing now prices from your costs
summary: >-
  Sectors in cost-plus mode now ask their own operating cost per unit plus
  their markup, and the Pricing panel shows the cost and the resulting ask.
tags: [corporations, economy, pricing, bugfix]
badges: [patch]
areas: [fullstack]
---

## What changed

- In cost-plus mode your ask is last run's operating cost per unit made (inputs at what you paid, wages and site bills) plus your markup. Before this, cost-plus sectors asked the market price.
- The ask is capped at 3 times the reference price. Until a run has settled, the ask is the market price.
- Cost-plus asks are not marked down when stock is left over, and they do not use the automatic price search.
- The Pricing panel shows the cost per unit and markup each ask used, so the numbers add up to the price you asked.
