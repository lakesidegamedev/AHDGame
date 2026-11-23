---
date: 2026-11-23
title: "Cleaner operations numbers on corporation pages"
summary: >-
  Wage and offer numbers no longer show long decimals, slow plant arrivals and
  small freight needs read clearly, and shortage and price notes say more.
tags: [corporations, interface]
badges: [patch]
areas: [frontend]
---

## What changed

- Wage fields and supply offer quantities show clean numbers such as 1.08 and 12.31, and the wage field accepts them.
- The warning on a supply offer you could not receive now says it is about receiving the goods. Making a good yourself does not count as using it.
- A slow build reads "About 1 campus arrives every 24 turns" instead of "About 0 arrive each turn". Small freight estimates no longer round down to 0 TEU.
- The Commodities tab now explains why the price a plant is charged for an input differs from the market price.
- When a plant is held back by a shortage of an input, the run meter names the missing input.
