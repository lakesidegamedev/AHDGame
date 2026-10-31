---
date: 2026-10-25
title: The funded market transition package can be switched off
summary: >-
  A new configuration switch turns off the transition package of the funded
  producer market: no over-built classification at the opening, no struggling
  marks, no support payments and no free conversion window. The economy-only
  reset switches it off, because an economy rebuilt from the seed has nothing
  to land softly. Existing worlds are unchanged. Admin tooling only.
tags: [economy, admin, reset, producer-market]
badges: [patch]
areas: [engine]
---

## What changed

- `gameConfig.producerTransitionPackageEnabled`: absent or true keeps the
  48-turn transition window as it is today. False moves the window anchor a
  full window back, so support, struggling marks and free conversion never
  apply and idle retirement runs from the first funded turn.
- The opening census skips the over-built classification when the switch is
  off.
- The economy-only reset writes the switch off with the other outside
  interventions.
