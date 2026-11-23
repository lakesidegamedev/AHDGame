---
date: 2026-11-23
title: Clearer company finances and quality
summary: >-
  Sector running costs, the last-turn cash walk, construction spending and the
  quality breakdown now name every line instead of hiding a leftover, and
  commodity pages say when governments do not buy a good.
tags: [corporations, economy]
badges: [patch]
areas: [fullstack]
---

## What changed

- A sector's "Other running costs" is now split into site running costs, the premium for missing minor inputs, unused inputs written off and management overhead. Idle upkeep reads from the turn's own record, so two sectors no longer show an equal and opposite leftover.
- The last-turn cash walk now names the tax on dividends received and the currency conversion fee on foreign income, and the remaining line says what it can hold, such as rounding, instead of "not itemised".
- The Finance statement always shows construction ordered on the latest turn and construction still in progress, with 0 when there is none.
- Average quality always lists the four pillar scores with their weights when they were recorded, names the biggest mover when two turns have them, and links to the quality guide.
- Commodity pages note under Top consumers when governments do not buy that good.
