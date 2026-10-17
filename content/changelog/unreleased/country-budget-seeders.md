---
date: 2026-10-17
title: Consolidate country budget seeders
summary: >-
  Country budget seeders share their reset and persistence workflow while
  retaining preset-specific behavior and country-specific setup steps.
tags: [cleanup, budgets, seeds]
badges: [patch]
areas: [backend]
---

## What changed

- Share the budget, enacted-law, regional-budget, and corporation workflow across
  14 country seeders.
- Preserve reset filters, missing-preset behavior, Nigeria's exchange-rate setup,
  and China and East Germany's state-enterprise repair paths.
