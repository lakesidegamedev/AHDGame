---
date: 2026-11-09
title: "Turn processing no longer stalls on dissolved-federation debt service"
summary: >-
  Turn processing no longer stalls on the continuing-state debt service for
  dissolved federations.
tags: [turns, economy]
badges: [minor]
areas: [backend]
---

## What changed

- Unpaid shares of a dissolved federation's debt were being counted again every turn in the running arrears total, which eventually overflowed and halted turn processing. Only newly accrued arrears are now added.
