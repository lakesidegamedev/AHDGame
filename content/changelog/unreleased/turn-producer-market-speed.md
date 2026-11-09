---
date: 2026-11-09
title: "Faster producer market step in the hourly turn"
summary: >-
  The producer market part of the corporation turn does less repeated work when
  it clears orders and saves its receipt. Results are unchanged.
tags: [engine, performance]
badges: [patch]
areas: [engine, backend]
---

## What changed

- The saved record of each producer market round is built without copying rows that need no change, and is compressed faster.
- Repeated lookups while orders clear are computed once.
- No gameplay or price changes.
