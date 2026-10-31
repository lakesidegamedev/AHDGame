---
date: 2026-10-31
title: Automatic pricing now follows what buyers actually paid
summary: >-
  Plants on automatic pricing now ask around last turn's market price for
  their good instead of a reference that could sit well above it, so they stop
  pricing themselves out of the market.
tags: [corporations, market, economy]
badges: [patch]
areas: [engine]
---

Automatic pricing capped a plant's ask at the good's reference price plus its
target markup. The reference can sit well above what the market actually
trades at, so a plant on automatic pricing could ask more than every buyer was
paying, sell nothing, and then have its run cut back. Unstorable goods such as
energy were simply lost.

- An automatic ask is now capped at last turn's market price for that good in
  that market, plus the plant's target markup. The reference is only used when
  nothing traded last turn.
- A plant that sold nothing last turn drops its markup and asks no more than
  last turn's market price, so a stuck ask steps down instead of repeating.
- Manual and cost-plus prices are unchanged.
