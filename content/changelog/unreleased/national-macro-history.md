---
date: 2026-11-08
title: Every country now charts population, GDP and GDP per capita over time
summary: >-
  The economy page for any country, playable or economy-only, now has a national
  history chart for population, GDP and GDP per capita. It reads the per-turn
  levels the world already records, so the hourly turn gains no extra work.
tags: [economy, charts, telemetry]
badges: [minor]
areas: [frontend, backend]
---

## What changed

- The country economy page gains a "National history" panel with three series:
  total population, national GDP and GDP per capita. Every country has it,
  including economy-only nations that have no playable government.
- The country overview page shows the same series as a compact sparkline under
  the country description, so the trend is visible without opening the economy
  page. Both forms share one component and one request.
- History comes from the levels the world already records once per completed
  turn, so the hourly turn gains no extra work, and there are no schema or
  balance changes.
- The panel shows the last 120 turns and builds itself after the masthead, so
  first paint is unchanged.
- Turns without a recorded value stay absent rather than being drawn as zero,
  and a thin window shows a coverage message instead of a flat line.
