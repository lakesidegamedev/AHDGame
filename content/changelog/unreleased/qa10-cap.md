---
date: 2026-11-24
title: Capped goods now show where the market price would be
summary: >-
  Goods held at the price cap used to all show the same figure. They now show
  how far above the cap the market price would be, and how short supply is.
tags: [economy, market]
badges: [patch]
areas: [frontend]
---

## What changed

- Goods held at the price cap now say "held at the cap; the market price would be about +X% without it", with demand as a multiple of supply.
- The market overview and the commodities table order capped goods by how far above the cap the market price sits, so they no longer tie.
- The commodity page shows the same line under the price.
