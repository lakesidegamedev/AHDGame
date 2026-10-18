---
date: 2026-10-16
title: Consolidate admin diagnosis and repair panels
summary: >-
  Admin diagnosis and repair panels share request handling and controls,
  reducing duplication while preserving their existing behavior.
tags: [admin, cleanup]
badges: [patch]
areas: [frontend]
---

## What changed

- Share the standard diagnosis and confirmed repair flow across 19 admin panels.
- Reuse action controls and result messages while preserving panel-specific labels,
  confirmations, diagnostic details, and custom repair flows.
