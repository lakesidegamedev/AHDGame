---
date: 2026-11-21
title: "Strategy hint no longer contradicts itself"
summary: >-
  The retool suggestion on a sector page no longer recommends a strategy that
  makes the same main product, and its wording sticks to what the numbers show.
tags: [corporations, sectors]
badges: [patch]
areas: [frontend]
---

## What changed

- The strategy suggestion is hidden when the suggested strategy would make the same main product the plant already makes.
- The banner now says how much of the main product went unsold last turn, and reports the market shortage separately as coming from the latest market book.
