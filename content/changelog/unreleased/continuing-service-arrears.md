---
date: 2026-11-09
title: "Turns no longer stop at the bond step over successor arrears"
summary: >-
  A successor state's unpaid share of inherited debt is now counted once, so the
  running arrears total no longer balloons and halts turn processing.
tags: [bonds, succession]
badges: [patch]
areas: [engine]
---

## What changed

- Turns no longer stop at the bond step when a successor state's unpaid share of inherited debt builds up.
- No money moves differently: contributions and treasuries are unchanged.
