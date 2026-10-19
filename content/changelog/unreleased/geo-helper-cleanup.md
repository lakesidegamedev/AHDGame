---
date: 2026-10-19
title: Share country-map builder helpers
summary: >-
  Consolidate repeated geometry processing and source fallback helpers in country-map builders.
  Preserve existing country boundaries, source selection, and output formatting.
tags: [cleanup, maps]
badges: [patch]
areas: [frontend]
---

## What changed

- Shared arc simplification, polygon winding, coordinate rounding, and source fallback helpers.
- Retained country-specific thresholds, source mappings, island filtering, and output metadata.
