---
date: 2026-10-19
title: Share country state-baseline adapters
summary: >-
  Consolidate repeated state-metric baseline conversion across country and era seeds.
  Preserve existing decay targets, category coverage, and seed exports.
tags: [cleanup, seeds]
badges: [patch]
areas: [backend]
---

## What changed

- Shared the identical metric-to-baseline adapter used by nineteen country and era seeds.
- Kept each seed's values, identifiers, category order, and compatibility exports unchanged.
