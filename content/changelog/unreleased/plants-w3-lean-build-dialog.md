---
date: 2026-11-17
title: Shorter build screen
summary: >-
  The build screen now opens with just the plant count, the total cost, when
  income starts, profit per turn, payback time and how much room the market has
  left. Everything else sits behind one Details section.
tags: [corporations, interface]
badges: [minor]
areas: [frontend]
---

## What changed

- The build dialog shows the headline numbers and a single warning line only when something is wrong (over market room, short on workers, cash below the reserve).
- Price breakdown, loan options, the cash forecast and the buyer demand table moved into one collapsed Details section.
- Long explanatory paragraphs that repeated numbers shown elsewhere were removed, including in the bulk build dialog.
