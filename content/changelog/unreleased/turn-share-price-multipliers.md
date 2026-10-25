---
date: 2026-10-25
title: Share prices include sentiment from the turn
summary: >-
  Share prices at the turn now include investor sentiment and order flow instead
  of only being added fifteen minutes later, so the market chart no longer drops
  at each turn and recovers.
tags: [corporations, market, prices]
badges: [patch]
areas: [engine, backend]
---

## What changed

- The turn's share-price update now applies investor sentiment, headquarters
  confidence and order flow before the exchange snapshot is built. Before, the
  turn wrote the plain company value and the quarter-hour update added those
  multipliers, so every price and the market index dipped at the turn and came
  back fifteen minutes later.
- The saved turn history still records the plain company value, which is what
  the next turn compares against, so prices do not drift downwards over time.
- The quarter-hour update is otherwise unchanged.
