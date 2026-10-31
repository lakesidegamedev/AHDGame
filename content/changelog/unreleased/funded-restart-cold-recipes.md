---
date: 2026-10-27
title: Fully idle plant types can restart, and AI companies read current demand
summary: >-
  On the funded market, a plant type with every plant mothballed can now reopen when buyers go short,
  and AI companies judge market saturation from this turn's sales instead of a stale reading.
tags: [economy, corporations, npps]
badges: [patch]
areas: [backend]
---

## What changed

- A recipe with no running plant reads unmet demand on its own output books, so one mothballed plant can reopen when buyers ask for more than was delivered.
- Funded turns write each plant's demand throttle (units sold over capacity) in the same sector write as the zero-sales counter, so AI placement and mothballing see the funded market.
