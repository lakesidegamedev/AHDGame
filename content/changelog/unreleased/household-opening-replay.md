---
date: 2026-11-15
title: "A retried first market turn no longer stops on the household opening payment"
summary: >-
  If a world's first market turn is retried, the one-time household opening
  payment that already landed now counts as done instead of stopping the turn.
tags: [engineering, turns, economy]
badges: [patch]
areas: [engine, backend]
---

## What changed

- The one-time household opening payment is rebuilt from each attempt's wage bill, so a retry could compute a slightly different amount and the bank journal refused it, stopping the turn on every retry.
- A payment that already landed for the world is now treated as done.
