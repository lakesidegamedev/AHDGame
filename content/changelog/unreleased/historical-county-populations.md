---
date: 2026-10-31
title: Historical county population data for every start year
summary: >-
  New worlds initialize US county populations from era-specific Census data where
  compatible county coverage is available, with proportional fallback for geography gaps.
tags: [population, counties]
badges: [patch]
areas: [engine, backend]
---

## What changed

- County populations on game reset now use Census data appropriate to the selected starting year.
- Historical counts are scaled to the preset's state totals, keeping county, state and national populations consistent.
- States with incompatible historical county boundaries use proportional fallback allocation.
- Existing live county populations are preserved. Empty states retain their saved baseline when receiving population again.
