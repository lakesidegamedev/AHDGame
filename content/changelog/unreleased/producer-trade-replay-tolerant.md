---
date: 2026-11-17
title: "Import tariffs no longer stop the turn on a rounding gap"
summary: >-
  The trade record used to charge import tariffs now shares out what each fill
  holds instead of stopping the turn when a fill is a fraction larger than its sellers.
tags: [economy, turns, bugfix]
badges: [patch]
areas: [engine]
---

## What changed

- When the tariff step rebuilt a fill from its sellers and found slightly less stock than the fill, the turn stopped. It now charges tariffs on what the sellers held, and the turn carries on.
