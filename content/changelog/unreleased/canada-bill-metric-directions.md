---
date: 2026-11-20
title: Fix Canadian bill metric direction previews
summary: >-
  Canadian bill options now show expected metric directions when current observations
  are available. Countries supported by the metric forecast use the same country list.
tags: [legislation, canada, metrics]
badges: [patch]
areas: [frontend]
---

## What changed

- Fixed Canadian bill previews incorrectly showing "Direction unavailable" for policy changes with available metric observations.
- Added the same preview support for Ireland, Scotland and Wales.
- Kept the unavailable indicator when a metric observation is missing.
