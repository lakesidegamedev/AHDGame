---
date: 2026-11-18
title: "Bond limits and market share read foreign sectors correctly"
summary: >-
  Bond limits, market share, state enterprise remittance and nationalization
  values now read sectors a company owns in France or Italy at their true size.
tags: [corporations, currency, bonds]
badges: [patch]
areas: [engine]
---

## What changed

- Sectors a company owns in France or Italy were counted several times too large when working out bond limits, relocation bonds, refinancing and restructuring, state enterprise remittance and nationalization values. They are now counted at their true size, the same size the turn already paid out on.
- Market share in a market shared by domestic and foreign owners now converts each sector with its own owner's currency, so a euro-based French or Italian company is no longer compared in lira or francs.
- No existing bond was over its limit under the corrected reading. Cash, taxes and payouts were not changed.
