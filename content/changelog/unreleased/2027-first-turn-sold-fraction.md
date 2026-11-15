---
date: 2026-11-15
title: "No false 0% sold on the first turn of a new world"
summary: >-
  The first producing turn after a reset no longer records every plant as
  selling nothing, so sector pages, computer-run company pricing and brand
  loyalty do not react to a sale that was never measured.
tags: [market, reset, sectors]
badges: [patch]
areas: [engine]
---

## What changed

- Market clearing sells against the previous turn's demand. On the first producing turn of a fresh world there is no previous turn, so every plant cleared nothing and showed 0% sold.
- That turn now leaves the sold figures unrecorded instead of zero. Sector pages show no sold figure until the next turn measures one.
- Computer-run companies no longer cut prices or count a low-fill turn from that phantom zero, and brand loyalty skips the unmeasured turn. Revenue and inventory are unchanged.
