---
date: 2026-11-23
title: "Sector list, commodity page and market chart now agree with their detail screens"
summary: >-
  The sectors list shows the margin each sector actually earned, the commodity
  page shows the prices behind each shortage multiplier and explains how short
  supply is shared, and two small market labels were corrected.
tags: [markets, commodities, corporations]
badges: [patch]
areas: [fullstack]
---

## What changed

- The sectors list now shows the margin each sector actually earned last turn, the same figure as its own page. Sectors with no recorded margin show nothing instead of a default.
- On a commodity page, each shortage row shows its multiplier next to the two prices it was worked out from.
- The commodity consumers list now totals what household, government and other buyers ordered and received, and explains in one line how a short supply is shared.
- The market chart's price tag now follows whether the index is up or down over the chosen range, not the colour of the latest candle.
- The index listing request shows the exact minimum fee, the same number the fee box is filled with.
