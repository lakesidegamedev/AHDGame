---
date: 2026-11-22
title: "State legislature pages no longer show impossible percentages"
summary: >-
  A state legislature whose configured size was smaller than its filled seats
  showed party shares far above 100 percent. The chamber total now never drops
  below the seats filled.
tags: [legislature, display]
badges: [patch]
areas: [frontend]
---

## What changed

- The state legislature page header and composition chart use a chamber total that is never smaller than the number of filled seats, so party percentages add up to 100.
