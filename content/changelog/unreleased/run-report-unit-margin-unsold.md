---
date: 2026-11-08
title: Sector run card counts unsold units in its per-unit profit
summary: >-
  The "Earns a unit" figure on a sector's run card now spreads the whole bill
  over the units that sold, so it matches the profit shown in the sector's
  financials when part of the output goes unsold.
tags: [corporations, sectors]
badges: [patch]
areas: [frontend]
---

## What changed

- The run card's per-unit bar used to divide revenue by units sold but costs by
  units made, so a sector with unsold output looked more profitable per unit
  than it was. Costs now divide by units sold, and the card says when part of
  what you made did not sell.
