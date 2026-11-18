---
date: 2026-11-17
title: Recent economic paths in the map comparison
summary: >-
  The two nations picked for comparison now carry their recent GDP growth,
  inflation and policy rate series, drawn on one scale each so the paths can be
  read against each other.
tags: [world, economy]
badges: [minor]
areas: [frontend]
---

- The comparison panel reads each pick's economy payload and draws three
  two-line charts: GDP growth, inflation and the policy rate, each positioned by
  turn across the pair's combined range.
- Both nations share one y-scale per chart, so equal-looking sparklines cannot
  hide a nation running four points hotter than the other.
- A side with fewer than two recorded turns draws nothing rather than a
  misleading single point, and the charts wait until both sides have loaded.
- The legend carries each nation's latest value next to its line.
