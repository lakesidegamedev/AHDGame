---
date: 2026-11-23
title: "Sector page figures agree with each other"
summary: >-
  Output sent to your own sites reads in the same units everywhere, the share
  price range includes the live price, and several raw numbers are rounded.
tags: [corporations, interface]
badges: [patch]
areas: [frontend]
---

## What changed

- On a sector page, the line about output sent to your own sites now says units and value per day, the same basis as the tiles and tables beside it.
- The plant count in the sector header counts only finished plants, so it matches "built" in the build list.
- When output is above the production push limit because capacity changed since the last run, the note now says so.
- The build dialog now says "Does not pay back in 192 turns" when the forecast never recovers the cost.
- The share price low and high include the live price.
- The Budget and income panel is labelled as a forecast, so it is not confused with the recorded turn on the Finance tab.
- Wage fields and margin tooltips show rounded numbers instead of long decimals.
