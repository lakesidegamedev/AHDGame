---
date: 2026-10-18
title: Remove unused stock-market and UI code
summary: >-
  Remove obsolete stock-market widgets and unused UI components and hooks.
  Active market pages and election displays retain their existing behavior.
tags: [cleanup, stock-market]
badges: [patch]
areas: [frontend]
---

## What changed

- Removed ten orphan component, helper, and hook files with no live consumers.
- Retained the legacy stock-market redirect and active election tickers and charts.
