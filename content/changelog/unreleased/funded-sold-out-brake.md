---
date: 2026-10-25
title: Funded market plants that sell out grow instead of shrinking on their crew bill
summary: >-
  The funded market's output rules no longer cut a plant that sold out at a
  price above its materials cost. Its loss came from the minimum crew and site
  bill spread over a small run, and cutting made the per-unit bill worse every
  turn. Plants that never turn a profit are still mothballed by the
  chronic-loss rule.
tags: [economy, producer-market, cold-start]
badges: [patch]
areas: [engine]
---

## What changed

- `marginalLoss` decides the loss brake in both output rules. A plant that
  did not sell out and lost money still runs a step less. A plant that sold
  out runs a step less only when its price did not cover the materials each
  unit consumed.

Found on the fresh-economy proof: 332 of 343 plants that sold out at a loss
covered their materials, at a median run of 0.4% of capacity.
