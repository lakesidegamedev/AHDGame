---
date: 2026-11-21
title: "Plant pages show what your plant was actually paid for"
summary: >-
  Every sales figure on a plant page now comes from the plant's paid sale
  record. The old market estimate no longer drives warnings, prices or idle
  notes, and where a plant has no paid record yet its figures are labelled as
  an estimate.
tags: [corporations, sectors]
badges: [patch]
areas: [frontend]
---

## What changed

- The "not selling" warning on a plant page now appears only when the plant sold less than half of what it offered on its latest settled turn, and says exactly that. It no longer claims a plant has been stranded for many turns in a row while it is selling everything.
- The Pricing panel no longer shows the old "effective posture" line. Its last-turn figure now explains what the plant was paid against what its whole offer would have earned at the asking price.
- On a plant that makes several products, each product's sale price is what that product was actually paid per unit sold.
- The "idle for N turns" capacity note and the "delivery limited" figures no longer appear on plants with a paid sale record. They were measured on the old estimate.
- The company page no longer flags plants as delivery limited from the old estimate.
- Plants with no paid sale record yet (older worlds, single player, a world's first turn) keep their figures, now labelled as a market estimate.
