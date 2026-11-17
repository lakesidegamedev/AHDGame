---
date: 2026-11-17
title: "Construction and freight build prices use real country demand"
summary: >-
  Building construction or freight capacity was priced against a tiny slice of
  demand, so the build dialog showed absurd market shares and inflated prices.
  It now measures against the same country demand shown on the market page.
tags: [corporations, construction]
badges: [patch]
areas: [fullstack]
---

## What changed

- Construction and freight build quotes now measure your capacity against the country's funded demand, the figure on the country market page, instead of a much smaller state-level estimate.
- The "share of market demand" line in the build dialog no longer reads hundreds of percent for a market with room to grow, and the build price stops carrying the false surcharge.
- The line is now labelled "Share of market demand", since these services are measured against their country rather than the world.
