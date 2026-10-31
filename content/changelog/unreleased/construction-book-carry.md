---
date: 2026-10-31
title: The hourly turn keeps running after construction moved to the country market
summary: >-
  Fixes two problems that would have stopped the first turn after construction
  services started trading across the whole country.
tags: [economy, corporations, production]
badges: [patch]
areas: [engine]
---

- A government building in several states of one country now places one
  construction order for that country instead of one per state. Duplicate
  orders stopped the turn.
- Construction work a plant carried over from before the change still names
  its old state market. The turn now accepts that stock as the country stock
  it is, instead of refusing to settle.
