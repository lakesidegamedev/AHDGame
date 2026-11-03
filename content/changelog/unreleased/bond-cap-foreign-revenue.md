---
date: 2026-11-03
title: Bond limits no longer overstate revenue earned abroad
summary: >-
  The single-sale bond cap now converts each sector's revenue from the country
  it operates in, so corporations with overseas sectors see the right figure
  instead of one inflated by treating foreign money as their own.
tags: [corporations, bonds, forex]
badges: [patch]
areas: [backend]
---

## What changed

- The revenue test behind a single bond sale now converts every sector from its
  host country's currency. It used to convert all of them at the owning
  corporation's rate, so a company with sectors abroad had its revenue, and
  therefore its per-sale bond ceiling, overstated on screen and in the check
  applied when issuing.
- The debt limits themselves are unchanged; only the conversion is corrected.
