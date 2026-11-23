---
date: 2026-11-22
title: "Market chart loads when candle timestamps overlap"
summary: >-
  The market chart now orders candles by time and draws one candle per
  timestamp, avoiding a crash when recorded closes and quarter-hour prices overlap.
tags: [markets]
badges: [patch]
areas: [frontend]
---

## What changed

- Market candles, volume and comparisons use chronological timestamps even when a
  quarter-hour candle overlaps a recorded turn close.
